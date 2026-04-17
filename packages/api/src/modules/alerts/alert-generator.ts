/**
 * Alert Generator
 *
 * Creates alerts when:
 *   loss_maker      — product has negative profit on last sale
 *   margin_drop     — margin dropped >10pp vs 7-day average for same product
 *   storage_warning — stock cover approaching/exceeding 35 days
 *
 * All alerts are deduped: won't create a duplicate if an unread alert of the
 * same type + offerId already exists within a 7-day window.
 *
 * After inserting an alert, publishes a Redis event so the Socket.io layer
 * can push a live notification to the seller's dashboard.
 */

import { and, eq, gte, gt, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { publishAlert } from '../sync/redis.js';
import { sendEmail } from '../email/email-service.js';
import { renderLossAlertHtml, renderLossAlertText } from '../email/templates/loss-alert.js';
import { env } from '../../config/env.js';

// Don't spam the same alert within 7 days
const DEDUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// =============================================================================
// Core alert insertion (with dedup + real-time push)
// =============================================================================

async function hasRecentUnreadAlert(
  sellerId: string,
  alertType: string,
  offerId: number | null
): Promise<boolean> {
  const since = new Date(Date.now() - DEDUP_WINDOW_MS);
  const conditions = [
    eq(schema.alerts.sellerId, sellerId),
    eq(schema.alerts.alertType, alertType),
    eq(schema.alerts.isRead, false),
    gte(schema.alerts.createdAt, since),
  ];
  if (offerId !== null) {
    conditions.push(eq(schema.alerts.offerId, offerId));
  }

  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(schema.alerts)
    .where(and(...conditions));

  return (row?.count ?? 0) > 0;
}

async function insertAlert(params: {
  sellerId: string;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  offerId: number | null;
  actionUrl?: string;
}): Promise<string | null> {
  // Dedup guard
  const exists = await hasRecentUnreadAlert(
    params.sellerId,
    params.alertType,
    params.offerId
  );
  if (exists) return null;

  const [alert] = await db
    .insert(schema.alerts)
    .values({
      sellerId: params.sellerId,
      alertType: params.alertType,
      severity: params.severity,
      title: params.title,
      message: params.message,
      offerId: params.offerId,
      actionUrl: params.actionUrl ?? null,
    })
    .returning({ id: schema.alerts.id });

  if (alert) {
    // Push real-time notification via Redis → Socket.io
    await publishAlert({
      sellerId: params.sellerId,
      alertId: alert.id,
      alertType: params.alertType,
      title: params.title,
      severity: params.severity,
    }).catch((err: Error) => {
      console.error(`[alert-generator] Failed to publish alert event: ${err.message}`);
    });
  }

  return alert?.id ?? null;
}

// =============================================================================
// Loss-Maker Alert
// =============================================================================

/**
 * Called after each profit calculation. Creates an alert if the product
 * is unprofitable (netProfitCents < 0).
 */
export async function checkLossMakerAlert(params: {
  sellerId: string;
  offerId: number | null;
  productTitle: string;
  netProfitCents: number;
  marginPct: number;
  /**
   * When false (default), the in-app DB alert is still created but no email
   * is sent. Set to true ONLY for real-time webhook-triggered processing —
   * bulk operations (initial-sync, daily-sync, COGS recalculation) would
   * otherwise spam hundreds of emails on a single trigger.
   */
  sendEmail?: boolean;
}): Promise<void> {
  if (params.netProfitCents >= 0) return;

  const severity = params.marginPct < -10 ? 'critical' : 'warning';
  const lossAmount = (Math.abs(params.netProfitCents) / 100).toFixed(2);

  const alertId = await insertAlert({
    sellerId: params.sellerId,
    alertType: 'loss_maker',
    severity,
    title: `Loss-Maker: ${params.productTitle}`,
    message: `${params.productTitle} lost R${lossAmount} on the last sale (margin: ${params.marginPct.toFixed(1)}%). Consider raising the price or verifying your COGS.`,
    offerId: params.offerId,
    actionUrl: '/dashboard',
  });

  // Send email only when explicitly requested (webhook flow) and a new alert was created
  if (alertId && params.sendEmail) {
    const [seller] = await db
      .select({ email: schema.sellers.email, businessName: schema.sellers.businessName, emailLossAlerts: schema.sellers.emailLossAlerts })
      .from(schema.sellers)
      .where(eq(schema.sellers.id, params.sellerId));

    if (seller?.emailLossAlerts) {
      const dashboardUrl = env.FRONTEND_URL;
      sendEmail({
        to: seller.email,
        subject: `Loss-Maker Alert: ${params.productTitle}`,
        html: renderLossAlertHtml({
          sellerName: seller.businessName ?? seller.email,
          alertType: 'loss_maker',
          productTitle: params.productTitle,
          currentMarginPct: params.marginPct,
          netProfitCents: params.netProfitCents,
          dashboardUrl,
          unsubscribeUrl: `${dashboardUrl}/dashboard/notifications?disable=emailLossAlerts`,
        }),
        text: renderLossAlertText({
          sellerName: seller.businessName ?? seller.email,
          alertType: 'loss_maker',
          productTitle: params.productTitle,
          currentMarginPct: params.marginPct,
          netProfitCents: params.netProfitCents,
          dashboardUrl,
          unsubscribeUrl: `${dashboardUrl}/dashboard/notifications?disable=emailLossAlerts`,
        }),
      }).catch((err: Error) => {
        console.error(`[alert-generator] Failed to send loss-maker email: ${err.message}`);
      });
    }
  }
}

// =============================================================================
// Margin Drop Alert
// =============================================================================

/**
 * Called after each profit calculation. Compares the current order's margin
 * against the product's 7-day average margin. Fires if drop exceeds 10pp.
 */
export async function checkMarginDropAlert(params: {
  sellerId: string;
  offerId: number | null;
  productTitle: string;
  currentMarginPct: number;
  netProfitCents: number;
  /**
   * When false (default), the in-app DB alert is still created but no email
   * is sent. Set to true ONLY for real-time webhook-triggered processing.
   */
  sendEmail?: boolean;
}): Promise<void> {
  if (params.offerId === null) return;

  // Get 7-day average margin for this product
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [avgRow] = await db
    .select({
      avgMargin: sql<number>`AVG(${schema.profitCalculations.profitMarginPct}::float)`,
      orderCount: sql<number>`COUNT(*)::int`,
    })
    .from(schema.profitCalculations)
    .innerJoin(
      schema.orders,
      eq(schema.profitCalculations.orderId, schema.orders.id)
    )
    .where(
      and(
        eq(schema.profitCalculations.sellerId, params.sellerId),
        eq(schema.profitCalculations.offerId, params.offerId),
        gte(schema.orders.orderDate, sevenDaysAgo)
      )
    );

  const avgMargin = avgRow?.avgMargin;
  const orderCount = avgRow?.orderCount ?? 0;
  if (avgMargin === null || avgMargin === undefined || orderCount < 2) return;

  const delta = params.currentMarginPct - avgMargin;
  if (delta >= -10) return; // drop is less than 10pp — no alert

  const alertId = await insertAlert({
    sellerId: params.sellerId,
    alertType: 'margin_drop',
    severity: 'warning',
    title: `Margin Drop: ${params.productTitle}`,
    message: `Margin for ${params.productTitle} dropped from ${avgMargin.toFixed(1)}% to ${params.currentMarginPct.toFixed(1)}% (${delta.toFixed(1)}pp) over the last 7 days.`,
    offerId: params.offerId,
    actionUrl: '/dashboard',
  });

  // Send email if seller has loss alerts enabled and margin is below their threshold
  if (alertId) {
    const [seller] = await db
      .select({
        email: schema.sellers.email,
        businessName: schema.sellers.businessName,
        emailLossAlerts: schema.sellers.emailLossAlerts,
        emailMarginThreshold: schema.sellers.emailMarginThreshold,
      })
      .from(schema.sellers)
      .where(eq(schema.sellers.id, params.sellerId));

    const threshold = parseFloat(seller?.emailMarginThreshold ?? '15.00');

    if (params.sendEmail && seller?.emailLossAlerts && params.currentMarginPct < threshold) {
      const dashboardUrl = env.FRONTEND_URL;
      sendEmail({
        to: seller.email,
        subject: `Margin Drop Alert: ${params.productTitle}`,
        html: renderLossAlertHtml({
          sellerName: seller.businessName ?? seller.email,
          alertType: 'margin_drop',
          productTitle: params.productTitle,
          currentMarginPct: params.currentMarginPct,
          netProfitCents: params.netProfitCents,
          previousMarginPct: avgMargin,
          thresholdPct: threshold,
          dashboardUrl,
          unsubscribeUrl: `${dashboardUrl}/dashboard/notifications?disable=emailLossAlerts`,
        }),
        text: renderLossAlertText({
          sellerName: seller.businessName ?? seller.email,
          alertType: 'margin_drop',
          productTitle: params.productTitle,
          currentMarginPct: params.currentMarginPct,
          netProfitCents: params.netProfitCents,
          previousMarginPct: avgMargin,
          thresholdPct: threshold,
          dashboardUrl,
          unsubscribeUrl: `${dashboardUrl}/dashboard/notifications?disable=emailLossAlerts`,
        }),
      }).catch((err: Error) => {
        console.error(`[alert-generator] Failed to send margin-drop email: ${err.message}`);
      });
    }
  }
}

// =============================================================================
// Storage Warning Alert (batch — called by daily sync)
// =============================================================================

/**
 * Scans all offers for a seller where stock cover is >= 32 days
 * (3-day advance warning before Takealot's 35-day storage fee threshold).
 * Returns the number of alerts created.
 */
// =============================================================================
// Fee Overcharge Alert (fired after CSV import)
// =============================================================================

/**
 * Called after a CSV import commit. Fires an alert if:
 *   - Total overcharged amount exceeds R50 (5000 cents), OR
 *   - More than 5 fee discrepancies were detected
 */
export async function checkFeeDiscrepancyAlert(params: {
  sellerId: string;
  overchargedCents: number;
  discrepancyCount: number;
  importId: string;
}): Promise<void> {
  const { sellerId, overchargedCents, discrepancyCount, importId } = params;

  // Only fire if meaningful overcharges
  if (overchargedCents < 5000 && discrepancyCount <= 5) return;

  const amount = (overchargedCents / 100).toFixed(2);
  const severity = overchargedCents >= 20000 ? 'critical' : 'warning';

  await insertAlert({
    sellerId,
    alertType: 'fee_overcharge',
    severity,
    title: `Fee Overcharges Detected`,
    message: `Your latest sales report import found ${discrepancyCount} fee discrepancies totaling R${amount} in potential overcharges. Review and dispute these on the Fee Audit page.`,
    offerId: null,
    actionUrl: '/dashboard/fee-audit',
  });
}

// =============================================================================
// Storage Warning Alert (batch — called by daily sync)
// =============================================================================

// =============================================================================
// Low-Stock Alert (batch — called by daily sync)
// =============================================================================

/**
 * Scans all offers for a seller where stock cover is dangerously low
 * (< 7 days) and the product is actively selling (salesUnits30d > 0).
 * Returns the number of alerts created.
 */
export async function checkLowStockAlerts(sellerId: string): Promise<number> {
  const LOW_STOCK_THRESHOLD_DAYS = 7;

  const offers = await db
    .select({
      offerId: schema.offers.offerId,
      title: schema.offers.title,
      stockCoverDays: schema.offers.stockCoverDays,
      salesUnits30d: schema.offers.salesUnits30d,
      stockJhb: schema.offers.stockJhb,
      stockCpt: schema.offers.stockCpt,
      stockDbn: schema.offers.stockDbn,
    })
    .from(schema.offers)
    .where(
      and(
        eq(schema.offers.sellerId, sellerId),
        gt(schema.offers.salesUnits30d, 0),
        sql`(COALESCE(${schema.offers.stockJhb}, 0) + COALESCE(${schema.offers.stockCpt}, 0) + COALESCE(${schema.offers.stockDbn}, 0)) > 0`,
        sql`(${schema.offers.stockCoverDays} < ${LOW_STOCK_THRESHOLD_DAYS} OR ${schema.offers.stockCoverDays} IS NULL)`
      )
    );

  let created = 0;

  for (const offer of offers) {
    const days = offer.stockCoverDays ?? 0;
    const severity = days <= 2 ? 'critical' : 'warning';
    const title = offer.title ?? 'Unknown Product';
    const velocity = Math.round(((offer.salesUnits30d ?? 0) / 30) * 10) / 10;

    const id = await insertAlert({
      sellerId,
      alertType: 'low_stock',
      severity,
      title: `Low Stock: ${title}`,
      message: `${title} has ${days} days of stock cover at ${velocity} units/day. Consider replenishing soon.`,
      offerId: offer.offerId,
      actionUrl: '/dashboard/inventory',
    });

    if (id) created++;
  }

  return created;
}

export async function checkStorageWarnings(sellerId: string): Promise<number> {
  const ADVANCE_WARNING_DAYS = 32;

  const offers = await db
    .select({
      offerId: schema.offers.offerId,
      title: schema.offers.title,
      stockCoverDays: schema.offers.stockCoverDays,
    })
    .from(schema.offers)
    .where(
      and(
        eq(schema.offers.sellerId, sellerId),
        gte(schema.offers.stockCoverDays, ADVANCE_WARNING_DAYS)
      )
    );

  let created = 0;

  for (const offer of offers) {
    const days = offer.stockCoverDays ?? 0;
    const severity = days >= 35 ? 'critical' : 'warning';
    const title = offer.title ?? 'Unknown Product';

    const id = await insertAlert({
      sellerId,
      alertType: 'storage_warning',
      severity,
      title: `Storage Warning: ${title}`,
      message: `${title} has ${days} days of stock cover. Takealot charges storage fees above 35 days (R2–R225/unit/month). Consider creating a promotion or removal order.`,
      offerId: offer.offerId,
      actionUrl: '/dashboard',
    });

    if (id) created++;
  }

  return created;
}
