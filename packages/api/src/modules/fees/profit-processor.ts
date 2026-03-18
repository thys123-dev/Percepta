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
import { eq, and, inArray } from 'drizzle-orm';
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
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.sellerId, sellerId),
          inArray(schema.orders.id, batchIds)
        )
      );

    for (const order of orderRows) {
      try {
        // Fetch the corresponding offer (product)
        let offer: FeeOfferInput;
        let cogsPerUnitCents = 0;
        let inboundCostPerUnitCents = 0;
        let cogsIsEstimated = true;

        if (order.offerIdNum) {
          const [offerRow] = await db
            .select({
              sellingPriceCents: schema.offers.sellingPriceCents,
              category: schema.offers.category,
              volumeCm3: schema.offers.volumeCm3,
              weightGrams: schema.offers.weightGrams,
              cogsCents: schema.offers.cogsCents,
              cogsSource: schema.offers.cogsSource,
              inboundCostCents: schema.offers.inboundCostCents,
              stockCoverDays: schema.offers.stockCoverDays,
            })
            .from(schema.offers)
            .where(
              and(
                eq(schema.offers.sellerId, sellerId),
                eq(schema.offers.offerId, order.offerIdNum)
              )
            )
            .limit(1);

          if (offerRow) {
            offer = {
              sellingPriceCents: order.unitPriceCents ?? Math.round(order.sellingPriceCents / order.quantity),
              category: offerRow.category,
              volumeCm3: offerRow.volumeCm3,
              weightGrams: offerRow.weightGrams,
              stockCoverDays: offerRow.stockCoverDays,
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

        // ── Alert checks (fire-and-forget, don't block batch) ──
        const productTitle = order.saleStatus ?? 'Unknown Product';
        // Resolve product title from offer if available
        const alertTitle =
          (order.offerIdNum
            ? (await db
                .select({ title: schema.offers.title })
                .from(schema.offers)
                .where(
                  and(
                    eq(schema.offers.sellerId, sellerId),
                    eq(schema.offers.offerId, order.offerIdNum)
                  )
                )
                .limit(1)
                .then((r) => r[0]?.title)
              )
            : null) ?? 'Unknown Product';

        // Loss-maker alert
        checkLossMakerAlert({
          sellerId,
          offerId: order.offerIdNum,
          productTitle: alertTitle,
          netProfitCents: profitResult.netProfitCents,
          marginPct: profitResult.profitMarginPct,
        }).catch((err: Error) =>
          console.error(`[alert] loss_maker check failed: ${err.message}`)
        );

        // Margin drop alert
        checkMarginDropAlert({
          sellerId,
          offerId: order.offerIdNum,
          productTitle: alertTitle,
          currentMarginPct: profitResult.profitMarginPct,
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
    await job.updateProgress(Math.round((Math.min(i + 100, orderIds.length) / orderIds.length) * 100));
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
