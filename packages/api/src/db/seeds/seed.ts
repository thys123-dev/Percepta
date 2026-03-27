/**
 * Percepta Demo Seed Script
 *
 * Populates the database with a demo seller, 14 products, ~220+ orders,
 * calculated fees, profit records, and alerts. Uses the real fee engine
 * to guarantee seeded data matches the production pipeline.
 *
 * Edge cases covered:
 *  - Full returns with reversals (reversal_amount_cents populated)
 *  - Partial returns (partial reversal)
 *  - Return Requested (pending returns)
 *  - Cancelled orders
 *  - Multi-unit orders (qty 2, 3, 5)
 *  - Daily Deal promotions
 *  - IBT cross-region transfers
 *  - Actual CSV fee data (for fee audit / reconciliation)
 *  - Out-of-stock / discontinued product
 *  - Near-zero margin product
 *  - Loss-maker with high return rate
 *
 * Usage:  npm run seed        (from root)
 *         npm run seed        (from packages/api)
 *
 * Safe to re-run — deletes and recreates demo seller data each time.
 */

import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { db, schema } from '../index.js';
import { encrypt } from '../../config/encryption.js';
import { calculateFees, calculateProfit } from '../../modules/fees/fee-calculator.js';
import {
  DEMO_SELLER_ID,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_BUSINESS_NAME,
  DEMO_API_KEY,
  DEMO_WEBHOOK_SECRET,
  DEMO_PRODUCTS,
  DEMO_ALERTS,
  generateDemoOrders,
  buildEdgeCaseOrders,
  classifySizeTier,
  classifyWeightTier,
} from './demo-data.js';

// Statuses where we skip profit/fee calculation (no revenue recognised)
const EXCLUDED_STATUSES = ['Returned', 'Return Requested', 'Cancelled'];

async function seed() {
  console.log('🌱 Percepta Demo Seed');
  console.log('─'.repeat(50));

  // ── 1. Clean up existing demo data ──
  console.log('  Cleaning existing demo data...');
  await db.delete(schema.sellers).where(eq(schema.sellers.id, DEMO_SELLER_ID));

  // ── 2. Insert demo seller ──
  console.log('  Creating demo seller...');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const apiKeyEnc = encrypt(DEMO_API_KEY);

  await db.insert(schema.sellers).values({
    id: DEMO_SELLER_ID,
    email: DEMO_EMAIL,
    passwordHash,
    businessName: DEMO_BUSINESS_NAME,
    apiKeyEnc,
    apiKeyValid: true,
    webhookSecret: DEMO_WEBHOOK_SECRET,
    isVatVendor: false,
    targetMarginPct: '25.00',
    onboardingComplete: true,
    initialSyncStatus: 'complete',
    emailWeeklyDigest: true,
    emailLossAlerts: true,
    emailMarginThreshold: '15.00',
  });

  // ── 3. Insert offers ──
  console.log(`  Inserting ${DEMO_PRODUCTS.length} products...`);
  const offerUuids: Record<number, string> = {};

  for (const product of DEMO_PRODUCTS) {
    const [inserted] = await db
      .insert(schema.offers)
      .values({
        sellerId: DEMO_SELLER_ID,
        offerId: product.offerId,
        tsin: product.tsin,
        sku: product.sku,
        barcode: product.barcode,
        title: product.title,
        category: product.category,
        sellingPriceCents: product.sellingPriceCents,
        rrpCents: product.rrpCents,
        status: product.stockJhb + product.stockCpt + product.stockDbn > 0 ? 'Buyable' : 'Not Buyable',
        weightGrams: product.weightGrams,
        lengthMm: product.lengthMm,
        widthMm: product.widthMm,
        heightMm: product.heightMm,
        volumeCm3: product.volumeCm3,
        sizeTier: classifySizeTier(product.volumeCm3),
        weightTier: classifyWeightTier(product.weightGrams),
        cogsCents: product.cogsCents,
        cogsSource: product.cogsSource,
        inboundCostCents: product.inboundCostCents,
        stockJhb: product.stockJhb,
        stockCpt: product.stockCpt,
        stockDbn: product.stockDbn,
        stockCoverDays: product.stockCoverDays,
        salesUnits30d: product.salesUnits30d,
        lastSyncedAt: new Date(),
      })
      .returning({ id: schema.offers.id });

    offerUuids[product.offerId] = inserted!.id;
  }

  // ── 4. Combine random + edge-case orders ──
  const randomOrders = generateDemoOrders(42);
  const edgeCaseOrders = buildEdgeCaseOrders();

  // Merge and sort newest-first
  const allOrders = [...randomOrders, ...edgeCaseOrders].sort(
    (a, b) => b.orderDate.getTime() - a.orderDate.getTime()
  );

  console.log(`  Inserting ${allOrders.length} orders (${randomOrders.length} random + ${edgeCaseOrders.length} edge cases)...`);

  const productMap = new Map(DEMO_PRODUCTS.map((p) => [p.offerId, p]));

  let profitableCount = 0;
  let lossCount = 0;
  let feesCalculated = 0;
  let returnCount = 0;
  let cancelCount = 0;
  let returnRequestedCount = 0;

  for (const order of allOrders) {
    const product = productMap.get(order.offerId)!;

    // Track status counts
    if (order.saleStatus === 'Returned') returnCount++;
    else if (order.saleStatus === 'Cancelled') cancelCount++;
    else if (order.saleStatus === 'Return Requested') returnRequestedCount++;

    // Insert the order — including all optional fields
    const [insertedOrder] = await db
      .insert(schema.orders)
      .values({
        sellerId: DEMO_SELLER_ID,
        orderId: order.orderId,
        orderItemId: order.orderItemId,
        offerId: order.offerId,
        tsin: order.tsin,
        sku: order.sku,
        productTitle: order.productTitle,
        quantity: order.quantity,
        sellingPriceCents: order.sellingPriceCents,
        unitPriceCents: order.unitPriceCents,
        orderDate: order.orderDate,
        saleStatus: order.saleStatus,
        fulfillmentDc: order.fulfillmentDc,
        customerDc: order.customerDc,
        isIbt: order.isIbt,
        promotion: order.promotion || null,
        source: 'api',
        // Reversal / return data
        ...(order.reversalAmountCents != null && {
          reversalAmountCents: order.reversalAmountCents,
          hasReversal: true,
        }),
        // Actual CSV fee data (fee audit)
        ...(order.dateShippedToCustomer && {
          dateShippedToCustomer: order.dateShippedToCustomer,
        }),
        ...(order.grossSalesCents != null && {
          grossSalesCents: order.grossSalesCents,
          actualSuccessFeeCents: order.actualSuccessFeeCents ?? null,
          actualFulfilmentFeeCents: order.actualFulfilmentFeeCents ?? null,
          actualStockTransferFeeCents: order.actualStockTransferFeeCents ?? null,
          netSalesAmountCents: order.netSalesAmountCents ?? null,
        }),
      })
      .returning({ id: schema.orders.id });

    const orderUuid = insertedOrder!.id;

    // Skip fee/profit calculation for returned/cancelled orders
    if (EXCLUDED_STATUSES.includes(order.saleStatus)) continue;

    // Calculate fees using the real engine
    const fees = calculateFees(
      {
        sellingPriceCents: product.sellingPriceCents,
        category: product.category,
        volumeCm3: product.volumeCm3,
        weightGrams: product.weightGrams,
        stockCoverDays: product.stockCoverDays,
      },
      {
        quantity: order.quantity,
        fulfillmentDc: order.fulfillmentDc,
        customerDc: order.customerDc,
        saleStatus: order.saleStatus,
        shipDate: order.dateShippedToCustomer ?? order.orderDate,
      }
    );

    // Insert calculated fees
    await db.insert(schema.calculatedFees).values({
      sellerId: DEMO_SELLER_ID,
      orderId: orderUuid,
      successFeeCents: fees.successFeeTotalCents,
      fulfilmentFeeCents: fees.fulfilmentFeeTotalCents,
      ibtPenaltyCents: fees.ibtPenaltyTotalCents,
      storageFeeAllocatedCents: fees.storageFeeAllocationTotalCents,
      totalFeeCents: fees.totalFeesInclVatCents,
      calculationVersion: fees.meta.calculationVersion,
    });

    // Calculate profit
    const cogsIsEstimated = product.cogsSource === 'estimate';
    const profit = calculateProfit({
      unitSellingPriceCents: product.sellingPriceCents,
      quantity: order.quantity,
      cogsPerUnitCents: product.cogsCents,
      inboundCostPerUnitCents: product.inboundCostCents,
      fees,
      cogsIsEstimated,
    });

    // Insert profit calculation
    await db.insert(schema.profitCalculations).values({
      sellerId: DEMO_SELLER_ID,
      orderId: orderUuid,
      offerId: order.offerId,
      revenueCents: profit.revenueCents,
      cogsCents: profit.totalCogsCents,
      totalFeesCents: profit.totalFeesCents,
      inboundCostCents: profit.totalInboundCostCents,
      netProfitCents: profit.netProfitCents,
      profitMarginPct: String(profit.profitMarginPct),
      isProfitable: profit.isProfitable,
      cogsIsEstimated: profit.cogsIsEstimated,
    });

    if (profit.isProfitable) profitableCount++;
    else lossCount++;
    feesCalculated++;
  }

  // ── 5. Insert alerts ──
  console.log(`  Inserting ${DEMO_ALERTS.length} alerts...`);
  const now = new Date();

  for (const alert of DEMO_ALERTS) {
    const createdAt = new Date(now.getTime() - alert.createdDaysAgo * 24 * 60 * 60 * 1000);
    await db.insert(schema.alerts).values({
      sellerId: DEMO_SELLER_ID,
      alertType: alert.alertType,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      offerId: alert.offerId,
      isRead: alert.isRead,
      isActedUpon: false,
      createdAt,
    });
  }

  // ── Summary ──
  const excluded = allOrders.length - feesCalculated;
  console.log('─'.repeat(50));
  console.log(`✅ Seeded: 1 seller, ${DEMO_PRODUCTS.length} products, ${allOrders.length} orders, ${DEMO_ALERTS.length} alerts`);
  console.log(`   Fees calculated:  ${feesCalculated} (${profitableCount} profitable, ${lossCount} loss-making)`);
  console.log(`   Excluded:         ${excluded} (${returnCount} returned, ${returnRequestedCount} return requested, ${cancelCount} cancelled)`);
  console.log(`   Edge cases:       ${edgeCaseOrders.length} explicit scenario orders`);
  console.log('');
  console.log('   Edge cases covered:');
  console.log('     ✓ Full returns with reversals');
  console.log('     ✓ Partial return / partial reversal');
  console.log('     ✓ Return Requested (pending)');
  console.log('     ✓ Cancelled orders');
  console.log('     ✓ Multi-unit orders (qty 2–5)');
  console.log('     ✓ Daily Deal promotions');
  console.log('     ✓ IBT cross-region transfers');
  console.log('     ✓ IBT + Return combined');
  console.log('     ✓ Daily Deal + Return combined');
  console.log('     ✓ Actual CSV fee data (fee reconciliation)');
  console.log('     ✓ Fee discrepancy (overcharge scenario)');
  console.log('     ✓ Out-of-stock / discontinued product');
  console.log('     ✓ Near-zero margin with estimated COGS');
  console.log('     ✓ Overstock + return on storage-fee product');
  console.log('');
  console.log('   Login: demo@percepta.co.za / DemoPass123!');
  console.log('');

  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
