/**
 * Profit Processor
 *
 * BullMQ job processor for the `calculate-profits` queue.
 * Takes a list of order IDs, fetches the order + offer data,
 * runs fee calculation, computes profit, and stores results.
 *
 * This replaces the Week 2 stub in workers.ts.
 */

import type { Job } from 'bullmq';
import { eq, and, inArray, isNotNull, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import {
  calculateFees,
  calculateProfit,
  type FeeOfferInput,
  type FeeOrderInput,
} from './fee-calculator.js';
import { DEFAULT_COGS_ESTIMATE_PCT } from '@percepta/shared';
import type { CalculateProfitsJobData } from '../sync/queues.js';
import {
  checkLossMakerAlert,
  checkMarginDropAlert,
} from '../alerts/alert-generator.js';

export async function processCalculateProfits(
  job: Job<CalculateProfitsJobData>
): Promise<{ calculated: number; lossMakers: number }> {
  const { sellerId, orderIds } = job.data;

  let calculated = 0;
  let lossMakers = 0;

  // Only fire alert emails for real-time webhook-triggered profit calcs.
  // Bulk operations (initial-sync, daily-sync, COGS recalc) would otherwise
  // queue hundreds of emails and trigger Resend rate limits — and the user
  // didn't ask for an email blast just because they connected their account.
  // In-app dashboard alerts are still created in all cases.
  const sendEmailAlerts = job.name === 'calculate-from-webhook';

  // Process in batches of 100 for memory efficiency
  for (let i = 0; i < orderIds.length; i += 100) {
    const batchIds = orderIds.slice(i, i + 100);

    // Fetch orders with their associated offers
    const orderRows = await db
      .select({
        orderId: schema.orders.id,
        orderItemId: schema.orders.orderItemId,
        offerIdNum: schema.orders.offerId,
        quantity: schema.orders.quantity,
        sellingPriceCents: schema.orders.sellingPriceCents,
        unitPriceCents: schema.orders.unitPriceCents,
        fulfillmentDc: schema.orders.fulfillmentDc,
        customerDc: schema.orders.customerDc,
        saleStatus: schema.orders.saleStatus,
        // Prefer actual ship date from Takealot sales report CSV when available.
        // Falls back to orderDate as a proxy (API doesn't expose ship date).
        dateShippedToCustomer: schema.orders.dateShippedToCustomer,
        orderDate: schema.orders.orderDate,
        // Actual fees from Takealot CSV (null = not yet imported)
        actualSuccessFeeCents: schema.orders.actualSuccessFeeCents,
        actualFulfilmentFeeCents: schema.orders.actualFulfilmentFeeCents,
        actualStockTransferFeeCents: schema.orders.actualStockTransferFeeCents,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.sellerId, sellerId),
          inArray(schema.orders.id, batchIds)
        )
      );

    // Pre-fetch all offers for this batch in a single query (eliminates N+1)
    const offerIds = [...new Set(orderRows.map((o) => o.offerIdNum).filter((id): id is number => id !== null))];
    const offerRowsMap = new Map<number, {
      title: string | null;
      sellingPriceCents: number | null;
      category: string | null;
      volumeCm3: number | null;
      weightGrams: number | null;
      cogsCents: number | null;
      cogsSource: string | null;
      inboundCostCents: number | null;
      stockCoverDays: number | null;
      /** Takealot's published rate from Product Details CSV (numeric → string here). */
      successFeeRatePct: string | null;
      fulfilmentFeeCents: number | null;
    }>();

    if (offerIds.length > 0) {
      const offerRows = await db
        .select({
          offerId: schema.offers.offerId,
          title: schema.offers.title,
          sellingPriceCents: schema.offers.sellingPriceCents,
          category: schema.offers.category,
          volumeCm3: schema.offers.volumeCm3,
          weightGrams: schema.offers.weightGrams,
          cogsCents: schema.offers.cogsCents,
          cogsSource: schema.offers.cogsSource,
          inboundCostCents: schema.offers.inboundCostCents,
          stockCoverDays: schema.offers.stockCoverDays,
          successFeeRatePct: schema.offers.successFeeRatePct,
          fulfilmentFeeCents: schema.offers.fulfilmentFeeCents,
        })
        .from(schema.offers)
        .where(
          and(
            eq(schema.offers.sellerId, sellerId),
            inArray(schema.offers.offerId, offerIds)
          )
        );

      for (const row of offerRows) {
        offerRowsMap.set(row.offerId, row);
      }
    }

    for (const order of orderRows) {
      try {
        // Guard against invalid quantity to prevent division-by-zero / Infinity propagation.
        // Takealot API enforces quantity >= 1, but defensively skip bad rows rather than
        // crash the whole batch.
        if (!order.quantity || order.quantity <= 0) {
          console.warn(
            `[calculate-profits] Skipping order ${order.orderId}: invalid quantity ${order.quantity}`
          );
          continue;
        }

        // Look up the corresponding offer from the pre-fetched map
        let offer: FeeOfferInput;
        let cogsPerUnitCents = 0;
        let inboundCostPerUnitCents = 0;
        let cogsIsEstimated = true;

        if (order.offerIdNum) {
          const offerRow = offerRowsMap.get(order.offerIdNum);

          if (offerRow) {
            offer = {
              sellingPriceCents: order.unitPriceCents ?? Math.round(order.sellingPriceCents / order.quantity),
              category: offerRow.category,
              volumeCm3: offerRow.volumeCm3,
              weightGrams: offerRow.weightGrams,
              stockCoverDays: offerRow.stockCoverDays,
              successFeeRatePct: offerRow.successFeeRatePct != null
                ? parseFloat(offerRow.successFeeRatePct)
                : null,
              fulfilmentFeeCents: offerRow.fulfilmentFeeCents,
            };
            cogsPerUnitCents = offerRow.cogsCents ?? Math.round(offer.sellingPriceCents * DEFAULT_COGS_ESTIMATE_PCT);
            inboundCostPerUnitCents = offerRow.inboundCostCents ?? 0;
            cogsIsEstimated = offerRow.cogsSource === 'estimate';
          } else {
            // Offer not found — use order data with defaults
            offer = buildDefaultOfferInput(order);
            cogsPerUnitCents = Math.round(offer.sellingPriceCents * DEFAULT_COGS_ESTIMATE_PCT);
          }
        } else {
          // No offer ID on order — use defaults
          offer = buildDefaultOfferInput(order);
          cogsPerUnitCents = Math.round(offer.sellingPriceCents * DEFAULT_COGS_ESTIMATE_PCT);
        }

        const orderInput: FeeOrderInput = {
          quantity: order.quantity,
          fulfillmentDc: order.fulfillmentDc,
          customerDc: order.customerDc,
          saleStatus: order.saleStatus,
          // Prefer actual ship date from CSV import for accurate fee matrix selection.
          // Falls back to orderDate when CSV data hasn't been imported yet.
          shipDate: order.dateShippedToCustomer ?? order.orderDate,
        };

        // Calculate fees
        const feeBreakdown = calculateFees(offer, orderInput);

        // Calculate profit
        const profitResult = calculateProfit({
          unitSellingPriceCents: offer.sellingPriceCents,
          quantity: order.quantity,
          cogsPerUnitCents,
          inboundCostPerUnitCents,
          fees: feeBreakdown,
          cogsIsEstimated,
        });

        // Upsert calculated_fees
        await db
          .insert(schema.calculatedFees)
          .values({
            sellerId,
            orderId: order.orderId,
            successFeeCents: feeBreakdown.successFeeTotalCents,
            fulfilmentFeeCents: feeBreakdown.fulfilmentFeeTotalCents,
            ibtPenaltyCents: feeBreakdown.ibtPenaltyTotalCents,
            storageFeeAllocatedCents: feeBreakdown.storageFeeAllocationTotalCents,
            totalFeeCents: feeBreakdown.totalFeesInclVatCents,
            calculationVersion: feeBreakdown.meta.calculationVersion,
          })
          .onConflictDoUpdate({
            target: [schema.calculatedFees.orderId],
            set: {
              successFeeCents: feeBreakdown.successFeeTotalCents,
              fulfilmentFeeCents: feeBreakdown.fulfilmentFeeTotalCents,
              ibtPenaltyCents: feeBreakdown.ibtPenaltyTotalCents,
              storageFeeAllocatedCents: feeBreakdown.storageFeeAllocationTotalCents,
              totalFeeCents: feeBreakdown.totalFeesInclVatCents,
              calculationVersion: feeBreakdown.meta.calculationVersion,
            },
          });

        // Upsert profit_calculations
        await db
          .insert(schema.profitCalculations)
          .values({
            sellerId,
            orderId: order.orderId,
            offerId: order.offerIdNum,
            revenueCents: profitResult.revenueCents,
            cogsCents: profitResult.totalCogsCents,
            totalFeesCents: profitResult.totalFeesCents,
            inboundCostCents: profitResult.totalInboundCostCents,
            netProfitCents: profitResult.netProfitCents,
            profitMarginPct: profitResult.profitMarginPct.toString(),
            isProfitable: profitResult.isProfitable,
            cogsIsEstimated: profitResult.cogsIsEstimated,
          })
          .onConflictDoUpdate({
            target: [schema.profitCalculations.orderId],
            set: {
              revenueCents: profitResult.revenueCents,
              cogsCents: profitResult.totalCogsCents,
              totalFeesCents: profitResult.totalFeesCents,
              inboundCostCents: profitResult.totalInboundCostCents,
              netProfitCents: profitResult.netProfitCents,
              profitMarginPct: profitResult.profitMarginPct.toString(),
              isProfitable: profitResult.isProfitable,
              cogsIsEstimated: profitResult.cogsIsEstimated,
            },
          });

        calculated++;
        if (!profitResult.isProfitable) lossMakers++;

        // ── Fee discrepancy detection (when CSV actual fees are available) ──
        //
        // We only generate discrepancy rows when our calculator had reliable
        // inputs. Without a category, the success-fee calc falls back to a 12%
        // default that's wildly off for most products (real Takealot rates
        // sit around 8–10%); without dimensions, the fulfilment-fee calc
        // falls back to a placeholder size tier. Comparing those defaults
        // against Takealot's actual charges produced thousands of bogus
        // "undercharged" rows. Skip those rather than mislead the seller.
        if (order.actualSuccessFeeCents != null || order.actualFulfilmentFeeCents != null || order.actualStockTransferFeeCents != null) {
          const offerData = order.offerIdNum ? offerRowsMap.get(order.offerIdNum) : null;
          // The success-fee calc is reliable when EITHER we have an explicit
          // per-product rate (from Product Details CSV) OR a category for the
          // table lookup. Same idea for fulfilment fee — explicit cents OR
          // dimensions. Without any of these the calc falls back to defaults
          // and the discrepancy is just noise.
          const successFeeReliable =
            offerData?.successFeeRatePct != null || offerData?.category != null;
          const fulfilmentFeeReliable =
            offerData?.fulfilmentFeeCents != null ||
            (offerData?.weightGrams != null && offerData?.volumeCm3 != null);
          // Stock transfer fee is binary — either it's an IBT order or it isn't,
          // and we have that info from the order itself, so the calc is reliable.
          const stockTransferReliable = true;

          detectFeeDiscrepancies(sellerId, order.orderId, {
            successFee: {
              actual: order.actualSuccessFeeCents,
              calculated: feeBreakdown.successFeeTotalCents,
              isReliable: successFeeReliable,
            },
            fulfilmentFee: {
              actual: order.actualFulfilmentFeeCents,
              calculated: feeBreakdown.fulfilmentFeeTotalCents,
              isReliable: fulfilmentFeeReliable,
            },
            stockTransferFee: {
              actual: order.actualStockTransferFeeCents,
              calculated: feeBreakdown.ibtPenaltyTotalCents,
              isReliable: stockTransferReliable,
            },
          }).catch((err: Error) =>
            console.error(`[discrepancy] check failed: ${err.message}`)
          );
        }

        // ── Alert checks (fire-and-forget, don't block batch) ──
        // Resolve product title from pre-fetched offer map
        const alertTitle =
          (order.offerIdNum ? offerRowsMap.get(order.offerIdNum)?.title : null) ?? 'Unknown Product';

        // Loss-maker alert (email only on webhook-triggered runs)
        checkLossMakerAlert({
          sellerId,
          offerId: order.offerIdNum,
          productTitle: alertTitle,
          netProfitCents: profitResult.netProfitCents,
          marginPct: profitResult.profitMarginPct,
          sendEmail: sendEmailAlerts,
        }).catch((err: Error) =>
          console.error(`[alert] loss_maker check failed: ${err.message}`)
        );

        // Margin drop alert (email only on webhook-triggered runs)
        checkMarginDropAlert({
          sellerId,
          offerId: order.offerIdNum,
          productTitle: alertTitle,
          currentMarginPct: profitResult.profitMarginPct,
          netProfitCents: profitResult.netProfitCents,
          sendEmail: sendEmailAlerts,
        }).catch((err: Error) =>
          console.error(`[alert] margin_drop check failed: ${err.message}`)
        );
      } catch (err) {
        console.error(
          `[calculate-profits] Error processing order ${order.orderId}:`,
          (err as Error).message
        );
        // Continue processing other orders — don't fail the whole batch
      }
    }

    // Update job progress
    await job.updateProgress?.(Math.round((Math.min(i + 100, orderIds.length) / orderIds.length) * 100));
  }

  console.info(
    `[calculate-profits] Seller ${sellerId}: calculated ${calculated} orders, ${lossMakers} loss-makers`
  );

  return { calculated, lossMakers };
}

// ---- Helpers ----

function buildDefaultOfferInput(order: {
  sellingPriceCents: number;
  quantity: number;
  unitPriceCents: number | null;
}): FeeOfferInput {
  return {
    sellingPriceCents: order.unitPriceCents ?? Math.round(order.sellingPriceCents / order.quantity),
    category: null,
    volumeCm3: null,
    weightGrams: null,
    stockCoverDays: null,
  };
}

/**
 * Detect and store fee discrepancies between Takealot's actual fees (from CSV)
 * and our calculated estimates. Only creates rows for significant discrepancies
 * (>5%) and only when our calc had reliable inputs.
 *
 * Re-runs are idempotent: the unique index on (seller_id, order_id, fee_type)
 * lets us upsert calc fields in place. We deliberately do NOT touch the
 * status / resolvedNote / resolvedAt fields so a seller's "acknowledged" or
 * "disputed" decision survives subsequent profit recalcs.
 */
async function detectFeeDiscrepancies(
  sellerId: string,
  orderId: string,
  fees: Record<
    string,
    { actual: number | null; calculated: number; isReliable?: boolean }
  >
): Promise<void> {
  const THRESHOLD_PCT = 5; // Only flag discrepancies > 5%

  const rows: Array<{
    sellerId: string;
    orderId: string;
    feeType: string;
    actualCents: number;
    calculatedCents: number;
    discrepancyCents: number;
    discrepancyPct: string;
  }> = [];

  for (const [feeType, { actual, calculated, isReliable }] of Object.entries(fees)) {
    if (actual == null) continue; // No actual data for this fee type yet
    // Skip rows where our calculator had unreliable inputs (e.g. no category
    // → success fee falls back to a 12% default; no dimensions → fulfilment
    // fee uses a placeholder tier). The mismatch isn't a real discrepancy,
    // it's a known data gap — surfacing it just adds noise.
    if (isReliable === false) continue;
    // Skip rows where Takealot booked R0 — these are either promotional fee
    // waivers (good news, not a discrepancy worth flagging) or stock-transfer
    // fees on non-IBT orders (always legitimately zero).
    if (actual === 0) continue;

    const discrepancy = actual - calculated;
    const pct = Math.round(Math.abs(discrepancy) / Math.abs(actual) * 10000) / 100;

    if (pct > THRESHOLD_PCT || calculated === 0) {
      rows.push({
        sellerId,
        orderId,
        feeType: feeType.replace(/([A-Z])/g, '_$1').toLowerCase(), // camelCase → snake_case
        actualCents: actual,
        calculatedCents: calculated,
        discrepancyCents: discrepancy,
        discrepancyPct: pct.toString(),
      });
    }
  }

  if (rows.length > 0) {
    await db
      .insert(schema.feeDiscrepancies)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          schema.feeDiscrepancies.sellerId,
          schema.feeDiscrepancies.orderId,
          schema.feeDiscrepancies.feeType,
        ],
        // Update calc fields only — status / resolvedNote / resolvedAt are
        // user-managed and must not be reset by an automated re-run.
        set: {
          actualCents: sql`excluded.actual_cents`,
          calculatedCents: sql`excluded.calculated_cents`,
          discrepancyCents: sql`excluded.discrepancy_cents`,
          discrepancyPct: sql`excluded.discrepancy_pct`,
        },
      });
  }
}
