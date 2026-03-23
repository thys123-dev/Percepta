/**
 * Digest Generator
 *
 * Queries the DB to produce all data needed for the weekly digest email.
 * Uses the same underlying data as the dashboard summary and product endpoints.
 */

import { and, eq, gte, lt, sql, desc, asc, ne } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import type { WeeklyDigestData } from './templates/weekly-digest.js';

const EXCLUDED_STATUSES = ['Returned', 'Return Requested', 'Cancelled'];

function formatPeriodLabel(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  return `${start.toLocaleDateString('en-ZA', opts)} – ${end.toLocaleDateString('en-ZA', opts)}`;
}

interface ProductMetrics {
  offerId: number | null;
  title: string;
  marginPct: number;
  netProfitCents: number;
  units: number;
}

async function getWeeklySummary(sellerId: string, start: Date, end: Date) {
  const [row] = await db
    .select({
      totalRevenue: sql<number>`COALESCE(SUM(${schema.profitCalculations.revenueCents}),0)::int`,
      netProfit:    sql<number>`COALESCE(SUM(${schema.profitCalculations.netProfitCents}),0)::int`,
      orderCount:   sql<number>`COUNT(*)::int`,
    })
    .from(schema.profitCalculations)
    .innerJoin(schema.orders, eq(schema.profitCalculations.orderId, schema.orders.id))
    .where(
      and(
        eq(schema.profitCalculations.sellerId, sellerId),
        gte(schema.orders.orderDate, start),
        lt(schema.orders.orderDate, end),
        ...EXCLUDED_STATUSES.map((s) => ne(schema.orders.saleStatus, s))
      )
    );

  return row ?? { totalRevenue: 0, netProfit: 0, orderCount: 0 };
}

async function getProductMetrics(
  sellerId: string,
  start: Date,
  end: Date
): Promise<ProductMetrics[]> {
  const rows = await db
    .select({
      offerId:      schema.profitCalculations.offerId,
      title:        sql<string>`MAX(${schema.orders.productTitle})`,
      netProfit:    sql<number>`COALESCE(SUM(${schema.profitCalculations.netProfitCents}),0)::int`,
      revenue:      sql<number>`COALESCE(SUM(${schema.profitCalculations.revenueCents}),0)::int`,
      units:        sql<number>`COUNT(*)::int`,
      avgMargin:    sql<number>`AVG(${schema.profitCalculations.profitMarginPct}::float)`,
    })
    .from(schema.profitCalculations)
    .innerJoin(schema.orders, eq(schema.profitCalculations.orderId, schema.orders.id))
    .where(
      and(
        eq(schema.profitCalculations.sellerId, sellerId),
        gte(schema.orders.orderDate, start),
        lt(schema.orders.orderDate, end),
        ...EXCLUDED_STATUSES.map((s) => ne(schema.orders.saleStatus, s))
      )
    )
    .groupBy(schema.profitCalculations.offerId);

  return rows.map((r) => ({
    offerId: r.offerId,
    title: r.title ?? 'Unknown Product',
    marginPct: r.avgMargin ?? 0,
    netProfitCents: r.netProfit,
    units: r.units,
  }));
}

async function getAlertsThisWeek(sellerId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(schema.alerts)
    .where(
      and(
        eq(schema.alerts.sellerId, sellerId),
        gte(schema.alerts.createdAt, since)
      )
    );
  return row?.count ?? 0;
}

function buildRecommendation(
  products: ProductMetrics[],
  alertsCount: number,
  dashboardUrl: string
): WeeklyDigestData['recommendation'] {
  // Priority 1: loss-makers
  const lossMaker = products.find((p) => p.marginPct < 0);
  if (lossMaker) {
    return {
      title: `Fix loss-maker: ${lossMaker.title}`,
      description: `This product lost money this week (margin: ${lossMaker.marginPct.toFixed(1)}%). Raise the price or review your COGS to stop the bleeding.`,
      actionUrl: `${dashboardUrl}`,
    };
  }

  // Priority 2: low-margin products with volume
  const lowMargin = products
    .filter((p) => p.marginPct < 15 && p.units >= 3)
    .sort((a, b) => a.marginPct - b.marginPct)[0];
  if (lowMargin) {
    return {
      title: `Improve margin on: ${lowMargin.title}`,
      description: `This product sold ${lowMargin.units} units this week at only ${lowMargin.marginPct.toFixed(1)}% margin. A small price increase could significantly boost your profit.`,
      actionUrl: `${dashboardUrl}`,
    };
  }

  // Priority 3: active alerts
  if (alertsCount > 0) {
    return {
      title: `Review your ${alertsCount} active alert${alertsCount !== 1 ? 's' : ''}`,
      description: `You have alerts that may indicate products needing attention. Check your Alerts page for details.`,
      actionUrl: `${dashboardUrl}/alerts`,
    };
  }

  // Default
  return {
    title: 'Keep up the momentum',
    description: `Your portfolio is performing well this week. Consider reviewing your top products for restocking opportunities before they run low.`,
    actionUrl: `${dashboardUrl}`,
  };
}

export async function generateWeeklyDigest(
  sellerId: string,
  dashboardUrl: string,
  unsubscribeUrl: string
): Promise<WeeklyDigestData & { sellerEmail: string }> {
  const now = new Date();
  // Current week: last 7 days
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  // Previous week: 7–14 days ago (for delta calc)
  const prevWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [seller] = await db
    .select({
      email: schema.sellers.email,
      businessName: schema.sellers.businessName,
    })
    .from(schema.sellers)
    .where(eq(schema.sellers.id, sellerId));

  if (!seller) throw new Error(`Seller ${sellerId} not found`);

  const [current, previous, products, alertsThisWeek] = await Promise.all([
    getWeeklySummary(sellerId, weekStart, now),
    getWeeklySummary(sellerId, prevWeekStart, weekStart),
    getProductMetrics(sellerId, weekStart, now),
    getAlertsThisWeek(sellerId, weekStart),
  ]);

  const profitMarginPct =
    current.totalRevenue > 0
      ? (current.netProfit / current.totalRevenue) * 100
      : 0;

  const revenueDeltaPct =
    previous.totalRevenue > 0
      ? ((current.totalRevenue - previous.totalRevenue) / previous.totalRevenue) * 100
      : null;

  const profitDeltaPct =
    previous.netProfit !== 0
      ? ((current.netProfit - previous.netProfit) / Math.abs(previous.netProfit)) * 100
      : null;

  // Sort products for top/bottom
  const sorted = [...products].sort((a, b) => b.marginPct - a.marginPct);
  const topProducts = sorted.slice(0, 3);
  const bottomProducts = sorted
    .filter((p) => p.marginPct < profitMarginPct)
    .slice(-3)
    .reverse();

  const recommendation = buildRecommendation(products, alertsThisWeek, dashboardUrl);

  return {
    sellerEmail: seller.email,
    sellerName: seller.businessName ?? seller.email,
    periodLabel: formatPeriodLabel(weekStart, now),
    summary: {
      totalRevenueCents: current.totalRevenue,
      netProfitCents: current.netProfit,
      profitMarginPct,
      orderCount: current.orderCount,
      revenueDeltaPct,
      profitDeltaPct,
    },
    topProducts,
    bottomProducts,
    alertsThisWeek,
    recommendation,
    dashboardUrl,
    unsubscribeUrl,
  };
}
