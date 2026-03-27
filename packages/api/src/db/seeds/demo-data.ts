/**
 * Demo Data Definitions for Percepta
 *
 * Contains all product, order, and alert definitions used by the seed script
 * and MockTakealotClient. Data is designed to exercise every fee path and
 * produce a realistic, varied dashboard.
 *
 * Edge cases covered:
 *  - Returns (Returned, Return Requested) with reversal amounts
 *  - Cancelled orders with cancellation penalty
 *  - Multi-unit orders (qty 2, 3, 5)
 *  - Daily Deal promotions
 *  - IBT cross-region transfers (JHB→CPT, CPT→JHB, JHB→DBN)
 *  - Loss-making products with high volume
 *  - Near-zero margin products
 *  - Overstock / storage fee products
 *  - COGS = estimated (no manual input)
 *  - Zero-stock product (discontinued / out of stock)
 *  - Products with actual CSV fee data (for reconciliation)
 *  - Products with reversal (return) that wiped all profit
 *
 * All prices in CENTS unless noted otherwise.
 */

import type { TakealotOffer, TakealotSale } from '../../modules/takealot-client/index.js';

// =============================================================================
// Constants
// =============================================================================

export const DEMO_SELLER_ID = '00000000-0000-4000-a000-000000000001';
export const DEMO_EMAIL = 'demo@percepta.co.za';
export const DEMO_PASSWORD = 'DemoPass123!';
export const DEMO_BUSINESS_NAME = 'Kalahari Goods Co.';
export const DEMO_API_KEY = 'demo-api-key-12345';
export const DEMO_WEBHOOK_SECRET = 'demo-webhook-secret-abc123def456';

// =============================================================================
// Deterministic PRNG (mulberry32) — same seed = same output every time
// =============================================================================

export function createPrng(seed: number) {
  let state = seed | 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =============================================================================
// Product Definitions (14 products — includes 2 new edge-case products)
// =============================================================================

export interface DemoProduct {
  offerId: number;
  tsin: number;
  sku: string;
  barcode: string;
  title: string;
  category: string;
  sellingPriceCents: number;
  rrpCents: number;
  weightGrams: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  volumeCm3: number;
  cogsCents: number;
  cogsSource: 'manual' | 'estimate';
  inboundCostCents: number;
  stockCoverDays: number;
  stockJhb: number;
  stockCpt: number;
  stockDbn: number;
  salesUnits30d: number;
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    offerId: 100001,
    tsin: 200001,
    sku: 'KG-BRAAI-TONG-01',
    barcode: '6001234500001',
    title: 'Braai Master Tongs Set',
    category: 'Homeware',
    sellingPriceCents: 34900,
    rrpCents: 39900,
    weightGrams: 800,
    lengthMm: 400,
    widthMm: 100,
    heightMm: 75,
    volumeCm3: 3000,
    cogsCents: 13960,   // 40% of price
    cogsSource: 'manual',
    inboundCostCents: 1500,
    stockCoverDays: 20,
    stockJhb: 50,
    stockCpt: 0,
    stockDbn: 0,
    salesUnits30d: 28,
  },
  {
    offerId: 100002,
    tsin: 200002,
    sku: 'KG-ROOIBOS-CRM-50',
    barcode: '6001234500002',
    title: 'Rooibos Face Cream 50ml',
    category: 'Beauty',
    sellingPriceCents: 19900,
    rrpCents: 24900,
    weightGrams: 200,
    lengthMm: 80,
    widthMm: 80,
    heightMm: 80,
    volumeCm3: 500,
    cogsCents: 6965,    // 35% of price
    cogsSource: 'manual',
    inboundCostCents: 800,
    stockCoverDays: 15,
    stockJhb: 0,
    stockCpt: 80,
    stockDbn: 0,
    salesUnits30d: 45,
  },
  {
    offerId: 100003,
    tsin: 200003,
    sku: 'KG-BILTONG-1KG',
    barcode: '6001234500003',
    title: 'Biltong Box 1kg Premium',
    category: 'Non-Perishable',
    sellingPriceCents: 29900,
    rrpCents: 34900,
    weightGrams: 1100,
    lengthMm: 300,
    widthMm: 200,
    heightMm: 80,
    volumeCm3: 5000,
    cogsCents: 16445,   // 55% of price
    cogsSource: 'manual',
    inboundCostCents: 2000,
    stockCoverDays: 10,
    stockJhb: 40,
    stockCpt: 20,
    stockDbn: 0,
    salesUnits30d: 35,
  },
  {
    offerId: 100004,
    tsin: 200004,
    sku: 'KG-EARBUDS-PRO',
    barcode: '6001234500004',
    title: 'Wireless Earbuds Pro ZA',
    category: 'Electronic Accessories',
    sellingPriceCents: 89900,
    rrpCents: 119900,
    weightGrams: 150,
    lengthMm: 100,
    widthMm: 80,
    heightMm: 50,
    volumeCm3: 400,
    cogsCents: 40455,   // 45% of price
    cogsSource: 'manual',
    inboundCostCents: 1000,
    stockCoverDays: 25,
    stockJhb: 30,
    stockCpt: 0,
    stockDbn: 0,
    salesUnits30d: 12,
  },
  {
    offerId: 100005,
    tsin: 200005,
    sku: 'KG-SAFARI-PUZZLE',
    barcode: '6001234500005',
    title: 'Kids Safari Puzzle 500pc',
    category: 'Toys',
    sellingPriceCents: 14900,
    rrpCents: 17900,
    weightGrams: 600,
    lengthMm: 300,
    widthMm: 250,
    heightMm: 50,
    volumeCm3: 8000,
    cogsCents: 4470,    // 30% of price
    cogsSource: 'manual',
    inboundCostCents: 1200,
    stockCoverDays: 8,
    stockJhb: 100,
    stockCpt: 0,
    stockDbn: 0,
    salesUnits30d: 62,
  },
  {
    offerId: 100006,
    tsin: 200006,
    sku: 'KG-CAMP-CHAIR-DX',
    barcode: '6001234500006',
    title: 'Camping Chair Deluxe',
    category: 'Camping & Outdoor',
    sellingPriceCents: 149900,
    rrpCents: 179900,
    weightGrams: 8500,
    lengthMm: 1000,
    widthMm: 200,
    heightMm: 300,
    volumeCm3: 60000,
    cogsCents: 74950,   // 50% of price
    cogsSource: 'manual',
    inboundCostCents: 5000,
    stockCoverDays: 12,
    stockJhb: 15,
    stockCpt: 0,
    stockDbn: 0,
    salesUnits30d: 8,
  },
  {
    offerId: 100007,
    tsin: 200007,
    sku: 'KG-YOGA-MAT-6MM',
    barcode: '6001234500007',
    title: 'Yoga Mat Premium 6mm',
    category: 'Sport',
    sellingPriceCents: 44900,
    rrpCents: 54900,
    weightGrams: 2000,
    lengthMm: 1800,
    widthMm: 600,
    heightMm: 40,
    volumeCm3: 45000,
    cogsCents: 17960,   // 40% of price
    cogsSource: 'estimate',
    inboundCostCents: 3000,
    stockCoverDays: 5,
    stockJhb: 0,
    stockCpt: 25,
    stockDbn: 0,
    salesUnits30d: 18,
  },
  {
    offerId: 100008,
    tsin: 200008,
    sku: 'KG-BABY-MON-WIFI',
    barcode: '6001234500008',
    title: 'Baby Monitor WiFi',
    category: 'Baby',
    sellingPriceCents: 199900,
    rrpCents: 249900,
    weightGrams: 400,
    lengthMm: 150,
    widthMm: 120,
    heightMm: 110,
    volumeCm3: 2000,
    cogsCents: 109945,  // 55% of price
    cogsSource: 'manual',
    inboundCostCents: 2500,
    stockCoverDays: 40, // ⚠️ Overstocked — triggers storage fees
    stockJhb: 60,
    stockCpt: 0,
    stockDbn: 0,
    salesUnits30d: 5,
  },
  {
    offerId: 100009,
    tsin: 200009,
    sku: 'KG-UMBRELLA-3M',
    barcode: '6001234500009',
    title: 'Garden Umbrella 3m',
    category: 'Garden, Pool & Patio',
    sellingPriceCents: 249900,
    rrpCents: 299900,
    weightGrams: 12000,
    lengthMm: 2000,
    widthMm: 200,
    heightMm: 400,
    volumeCm3: 160000,
    cogsCents: 112455,  // 45% of price
    cogsSource: 'manual',
    inboundCostCents: 8000,
    stockCoverDays: 18,
    stockJhb: 8,
    stockCpt: 0,
    stockDbn: 0,
    salesUnits30d: 3,
  },
  {
    offerId: 100010,
    tsin: 200010,
    sku: 'KG-DESK-STAND-ADJ',
    barcode: '6001234500010',
    title: 'Office Desk Stand Adjustable',
    category: 'Office Furniture',
    sellingPriceCents: 349900,
    rrpCents: 399900,
    weightGrams: 15000,
    lengthMm: 800,
    widthMm: 500,
    heightMm: 550,
    volumeCm3: 220000,
    cogsCents: 174950,  // 50% of price
    cogsSource: 'estimate',
    inboundCostCents: 10000,
    stockCoverDays: 30,
    stockJhb: 0,
    stockCpt: 0,
    stockDbn: 5,
    salesUnits30d: 2,
  },
  {
    offerId: 100011,
    tsin: 200011,
    sku: 'KG-PHONE-CASE-UT',
    barcode: '6001234500011',
    title: 'Phone Case Ultra Thin',
    category: 'Mobile',
    sellingPriceCents: 9900,
    rrpCents: 14900,
    weightGrams: 50,
    lengthMm: 160,
    widthMm: 80,
    heightMm: 15,
    volumeCm3: 200,
    cogsCents: 1980,    // 20% of price — Loss-maker!
    cogsSource: 'manual',
    inboundCostCents: 500,
    stockCoverDays: 6,
    stockJhb: 200,
    stockCpt: 150,
    stockDbn: 0,
    salesUnits30d: 85,
  },
  {
    offerId: 100012,
    tsin: 200012,
    sku: 'KG-LED-BULB-4PK',
    barcode: '6001234500012',
    title: 'LED Smart Bulb 4-Pack',
    category: 'Smart Home & Connected Living',
    sellingPriceCents: 59900,
    rrpCents: 79900,
    weightGrams: 600,
    lengthMm: 200,
    widthMm: 200,
    heightMm: 100,
    volumeCm3: 4000,
    cogsCents: 35940,   // 60% of price — Loss-maker with overstock!
    cogsSource: 'estimate',
    inboundCostCents: 2000,
    stockCoverDays: 45, // ⚠️ Overstocked
    stockJhb: 90,
    stockCpt: 0,
    stockDbn: 0,
    salesUnits30d: 6,
  },
  // ── Edge-case product 13: ZERO STOCK / discontinued ─────────────────────────
  {
    offerId: 100013,
    tsin: 200013,
    sku: 'KG-WATER-BOTTLE-SS',
    barcode: '6001234500013',
    title: 'Stainless Steel Water Bottle 750ml',
    category: 'Sport',
    sellingPriceCents: 24900,
    rrpCents: 29900,
    weightGrams: 350,
    lengthMm: 280,
    widthMm: 90,
    heightMm: 90,
    volumeCm3: 2300,
    cogsCents: 8715,    // 35%
    cogsSource: 'manual',
    inboundCostCents: 900,
    stockCoverDays: 0,  // ⚠️ Sold out / discontinued
    stockJhb: 0,
    stockCpt: 0,
    stockDbn: 0,
    salesUnits30d: 0,
  },
  // ── Edge-case product 14: NEAR-ZERO margin, estimate COGS ───────────────────
  {
    offerId: 100014,
    tsin: 200014,
    sku: 'KG-NOTEBOOK-A5',
    barcode: '6001234500014',
    title: 'Premium Notebook A5 Hardcover',
    category: 'Stationery',
    sellingPriceCents: 7900,
    rrpCents: 9900,
    weightGrams: 300,
    lengthMm: 210,
    widthMm: 150,
    heightMm: 20,
    volumeCm3: 630,
    cogsCents: 3950,    // 50% of price — barely breaks even after fees
    cogsSource: 'estimate',
    inboundCostCents: 600,
    stockCoverDays: 22,
    stockJhb: 120,
    stockCpt: 0,
    stockDbn: 0,
    salesUnits30d: 14,
  },
];

// =============================================================================
// Size / Weight Tier Helpers (for seed insert — mirrors fee-calculator logic)
// =============================================================================

export function classifySizeTier(volumeCm3: number): string {
  if (volumeCm3 <= 35_000) return 'Standard';
  if (volumeCm3 <= 130_000) return 'Large';
  if (volumeCm3 <= 200_000) return 'Oversize';
  if (volumeCm3 <= 545_000) return 'Bulky';
  return 'ExtraBulky';
}

export function classifyWeightTier(weightGrams: number): string {
  if (weightGrams <= 7_000) return 'Light';
  if (weightGrams <= 25_000) return 'Heavy';
  if (weightGrams < 40_000) return 'HeavyPlus';
  return 'VeryHeavy';
}

// =============================================================================
// Order Types
// =============================================================================

export type EdgeCaseTag =
  | 'return_full'           // Fully returned — saleStatus = Returned + reversalAmountCents set
  | 'return_requested'      // Return requested but not yet processed
  | 'cancelled'             // Cancelled before dispatch
  | 'multi_unit'            // qty >= 2
  | 'daily_deal'            // Sold under a Daily Deal promotion
  | 'ibt_cross_region'      // IBT penalty applies
  | 'reversal_wiped_profit' // Reversal amount = full selling price (refund)
  | 'actual_fees_csv'       // Has actual fee data (as if imported from CSV)
  | 'partial_return'        // Has a partial reversal (partial refund scenario)
  | 'normal';

export interface DemoOrder {
  orderId: number;
  orderItemId: number;
  offerId: number;
  tsin: number;
  sku: string;
  productTitle: string;
  quantity: number;
  sellingPriceCents: number; // total (unit × qty)
  unitPriceCents: number;
  orderDate: Date;
  saleStatus: string;
  fulfillmentDc: string;
  customerDc: string;
  isIbt: boolean;
  promotion: string;
  // Return / reversal fields
  reversalAmountCents?: number;
  hasReversal?: boolean;
  // Actual CSV fee fields (fee audit reconciliation)
  dateShippedToCustomer?: Date;
  grossSalesCents?: number;
  actualSuccessFeeCents?: number;
  actualFulfilmentFeeCents?: number;
  actualStockTransferFeeCents?: number;
  netSalesAmountCents?: number;
  // Tag for seeding logic
  tags: EdgeCaseTag[];
}

// =============================================================================
// Weighted Order Generation — Random Baseline Orders
// =============================================================================

const SALE_STATUSES = [
  { status: 'Shipped',          weight: 55 },
  { status: 'Delivered',        weight: 20 },
  { status: 'Accepted',         weight: 8 },
  { status: 'Returned',         weight: 7 },
  { status: 'Cancelled',        weight: 5 },
  { status: 'Return Requested', weight: 5 },
];

const DC_CONFIGS = [
  // Same-region (60%)
  { fulfillment: 'JHB', customer: 'JHB', weight: 30 },
  { fulfillment: 'CPT', customer: 'CPT', weight: 15 },
  { fulfillment: 'DBN', customer: 'DBN', weight: 15 },
  // IBT (25%)
  { fulfillment: 'JHB', customer: 'CPT', weight: 10 },
  { fulfillment: 'CPT', customer: 'JHB', weight: 8 },
  { fulfillment: 'JHB', customer: 'DBN', weight: 7 },
  // DBN involvement (15%)
  { fulfillment: 'DBN', customer: 'JHB', weight: 8 },
  { fulfillment: 'DBN', customer: 'CPT', weight: 7 },
];

const PROMOTIONS = [
  '', '', '', '', '', '', '', '', '',  // 90% no promotion
  'Daily Deal',
];

function weightedPick<T extends { weight: number }>(items: T[], rand: number): T {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let threshold = rand * totalWeight;
  for (const item of items) {
    threshold -= item.weight;
    if (threshold <= 0) return item;
  }
  return items[items.length - 1]!;
}

// Product order frequency weights (higher = more orders generated)
const PRODUCT_ORDER_WEIGHTS: Record<number, number> = {
  100001: 15,  // Braai Tongs — good seller
  100002: 20,  // Rooibos Cream — popular
  100003: 15,  // Biltong — steady
  100004: 8,   // Earbuds — moderate
  100005: 25,  // Safari Puzzle — best seller
  100006: 5,   // Camping Chair — niche
  100007: 10,  // Yoga Mat — moderate
  100008: 3,   // Baby Monitor — slow
  100009: 2,   // Garden Umbrella — slow
  100010: 2,   // Desk Stand — slow
  100011: 30,  // Phone Case — very high volume (loss-maker)
  100012: 5,   // LED Bulb — moderate (loss-maker)
  100013: 0,   // Water Bottle — no random orders (out of stock, edge cases only)
  100014: 8,   // Notebook — near-zero margin
};

function daysAgoDate(days: number, hourOffset = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hourOffset, Math.floor(Math.random() * 60), 0, 0);
  return d;
}

// =============================================================================
// Hard-coded Edge Case Orders
// These supplement the random orders to guarantee every scenario is covered.
// =============================================================================

export function buildEdgeCaseOrders(): DemoOrder[] {
  let id = 600000;
  let itemId = 990000;
  const next = () => ({ orderId: id++, orderItemId: itemId++ });

  const orders: DemoOrder[] = [];

  // ── 1. FULL RETURN — Wireless Earbuds (premium product) ──────────────────
  // Order placed, shipped, customer returned. Reversal = full selling price.
  {
    const { orderId, orderItemId } = next();
    orders.push({
      orderId, orderItemId,
      offerId: 100004, tsin: 200004, sku: 'KG-EARBUDS-PRO',
      productTitle: 'Wireless Earbuds Pro ZA',
      quantity: 1, sellingPriceCents: 89900, unitPriceCents: 89900,
      orderDate: daysAgoDate(5, 9),
      saleStatus: 'Returned',
      fulfillmentDc: 'JHB', customerDc: 'JHB', isIbt: false,
      promotion: '',
      reversalAmountCents: 89900,   // full refund
      hasReversal: true,
      tags: ['return_full', 'reversal_wiped_profit'],
    });
  }

  // ── 2. RETURN REQUESTED — Baby Monitor (still pending) ────────────────────
  {
    const { orderId, orderItemId } = next();
    orders.push({
      orderId, orderItemId,
      offerId: 100008, tsin: 200008, sku: 'KG-BABY-MON-WIFI',
      productTitle: 'Baby Monitor WiFi',
      quantity: 1, sellingPriceCents: 199900, unitPriceCents: 199900,
      orderDate: daysAgoDate(3, 14),
      saleStatus: 'Return Requested',
      fulfillmentDc: 'JHB', customerDc: 'JHB', isIbt: false,
      promotion: '',
      tags: ['return_requested'],
    });
  }

  // ── 3. CANCELLED ORDER — Camping Chair ────────────────────────────────────
  {
    const { orderId, orderItemId } = next();
    orders.push({
      orderId, orderItemId,
      offerId: 100006, tsin: 200006, sku: 'KG-CAMP-CHAIR-DX',
      productTitle: 'Camping Chair Deluxe',
      quantity: 1, sellingPriceCents: 149900, unitPriceCents: 149900,
      orderDate: daysAgoDate(2, 11),
      saleStatus: 'Cancelled',
      fulfillmentDc: 'JHB', customerDc: 'JHB', isIbt: false,
      promotion: '',
      tags: ['cancelled'],
    });
  }

  // ── 4. MULTI-UNIT RETURN — Phone Cases (qty 3, all returned) ─────────────
  {
    const { orderId, orderItemId } = next();
    orders.push({
      orderId, orderItemId,
      offerId: 100011, tsin: 200011, sku: 'KG-PHONE-CASE-UT',
      productTitle: 'Phone Case Ultra Thin',
      quantity: 3, sellingPriceCents: 29700, unitPriceCents: 9900,
      orderDate: daysAgoDate(8, 10),
      saleStatus: 'Returned',
      fulfillmentDc: 'JHB', customerDc: 'JHB', isIbt: false,
      promotion: '',
      reversalAmountCents: 29700, // full reversal for 3 units
      hasReversal: true,
      tags: ['return_full', 'multi_unit'],
    });
  }

  // ── 5. PARTIAL REVERSAL — Biltong Box (2 units, 1 refunded) ──────────────
  {
    const { orderId, orderItemId } = next();
    orders.push({
      orderId, orderItemId,
      offerId: 100003, tsin: 200003, sku: 'KG-BILTONG-1KG',
      productTitle: 'Biltong Box 1kg Premium',
      quantity: 2, sellingPriceCents: 59800, unitPriceCents: 29900,
      orderDate: daysAgoDate(10, 13),
      saleStatus: 'Delivered',  // delivered but partial refund issued
      fulfillmentDc: 'CPT', customerDc: 'CPT', isIbt: false,
      promotion: '',
      reversalAmountCents: 29900, // only 1 of 2 units refunded
      hasReversal: true,
      tags: ['partial_return', 'multi_unit'],
    });
  }

  // ── 6. DAILY DEAL — Rooibos Face Cream (high volume, promo price) ─────────
  {
    const { orderId, orderItemId } = next();
    orders.push({
      orderId, orderItemId,
      offerId: 100002, tsin: 200002, sku: 'KG-ROOIBOS-CRM-50',
      productTitle: 'Rooibos Face Cream 50ml',
      quantity: 5, sellingPriceCents: 99500, unitPriceCents: 19900,
      orderDate: daysAgoDate(7, 8),
      saleStatus: 'Delivered',
      fulfillmentDc: 'CPT', customerDc: 'CPT', isIbt: false,
      promotion: 'Daily Deal',
      tags: ['daily_deal', 'multi_unit'],
    });
  }

  // ── 7. DAILY DEAL RETURNED — Safari Puzzle sold on deal, then returned ────
  {
    const { orderId, orderItemId } = next();
    orders.push({
      orderId, orderItemId,
      offerId: 100005, tsin: 200005, sku: 'KG-SAFARI-PUZZLE',
      productTitle: 'Kids Safari Puzzle 500pc',
      quantity: 2, sellingPriceCents: 29800, unitPriceCents: 14900,
      orderDate: daysAgoDate(15, 9),
      saleStatus: 'Returned',
      fulfillmentDc: 'JHB', customerDc: 'JHB', isIbt: false,
      promotion: 'Daily Deal',
      reversalAmountCents: 29800,
      hasReversal: true,
      tags: ['return_full', 'daily_deal', 'multi_unit'],
    });
  }

  // ── 8. IBT CROSS-REGION — Camping Chair JHB→CPT (penalty + high fee) ─────
  {
    const { orderId, orderItemId } = next();
    orders.push({
      orderId, orderItemId,
      offerId: 100006, tsin: 200006, sku: 'KG-CAMP-CHAIR-DX',
      productTitle: 'Camping Chair Deluxe',
      quantity: 1, sellingPriceCents: 149900, unitPriceCents: 149900,
      orderDate: daysAgoDate(4, 15),
      saleStatus: 'Shipped',
      fulfillmentDc: 'JHB', customerDc: 'CPT', isIbt: true,
      promotion: '',
      tags: ['ibt_cross_region'],
    });
  }

  // ── 9. IBT + RETURN — Yoga Mat shipped JHB→CPT, then returned ────────────
  {
    const { orderId, orderItemId } = next();
    orders.push({
      orderId, orderItemId,
      offerId: 100007, tsin: 200007, sku: 'KG-YOGA-MAT-6MM',
      productTitle: 'Yoga Mat Premium 6mm',
      quantity: 1, sellingPriceCents: 44900, unitPriceCents: 44900,
      orderDate: daysAgoDate(20, 16),
      saleStatus: 'Returned',
      fulfillmentDc: 'CPT', customerDc: 'JHB', isIbt: true,
      promotion: '',
      reversalAmountCents: 44900,
      hasReversal: true,
      tags: ['return_full', 'ibt_cross_region'],
    });
  }

  // ── 10. ACTUAL CSV FEES — Garden Umbrella (fee audit scenario) ────────────
  // This order has real Takealot-reported fees, slightly different from calculated
  {
    const { orderId, orderItemId } = next();
    const shipDate = daysAgoDate(14, 12);
    orders.push({
      orderId, orderItemId,
      offerId: 100009, tsin: 200009, sku: 'KG-UMBRELLA-3M',
      productTitle: 'Garden Umbrella 3m',
      quantity: 1, sellingPriceCents: 249900, unitPriceCents: 249900,
      orderDate: daysAgoDate(16, 10),
      saleStatus: 'Delivered',
      fulfillmentDc: 'JHB', customerDc: 'JHB', isIbt: false,
      promotion: '',
      dateShippedToCustomer: shipDate,
      grossSalesCents: 249900,
      actualSuccessFeeCents: 3748,   // slightly differs from calculated
      actualFulfilmentFeeCents: 8900,
      actualStockTransferFeeCents: 0,
      netSalesAmountCents: 237252,
      tags: ['actual_fees_csv'],
    });
  }

  // ── 11. ACTUAL CSV FEES DISCREPANCY — Desk Stand (overcharged scenario) ───
  // Takealot charged more than the calculated fee — triggers fee audit alert
  {
    const { orderId, orderItemId } = next();
    const shipDate = daysAgoDate(9, 11);
    orders.push({
      orderId, orderItemId,
      offerId: 100010, tsin: 200010, sku: 'KG-DESK-STAND-ADJ',
      productTitle: 'Office Desk Stand Adjustable',
      quantity: 1, sellingPriceCents: 349900, unitPriceCents: 349900,
      orderDate: daysAgoDate(11, 9),
      saleStatus: 'Delivered',
      fulfillmentDc: 'DBN', customerDc: 'DBN', isIbt: false,
      promotion: '',
      dateShippedToCustomer: shipDate,
      grossSalesCents: 349900,
      actualSuccessFeeCents: 7874,   // calculated would be ~6998 — overcharged!
      actualFulfilmentFeeCents: 12500,
      actualStockTransferFeeCents: 0,
      netSalesAmountCents: 329526,
      tags: ['actual_fees_csv'],
    });
  }

  // ── 12. OUT-OF-STOCK (historical) — Water Bottle last order before stockout ─
  {
    const { orderId, orderItemId } = next();
    orders.push({
      orderId, orderItemId,
      offerId: 100013, tsin: 200013, sku: 'KG-WATER-BOTTLE-SS',
      productTitle: 'Stainless Steel Water Bottle 750ml',
      quantity: 2, sellingPriceCents: 49800, unitPriceCents: 24900,
      orderDate: daysAgoDate(25, 14),
      saleStatus: 'Delivered',
      fulfillmentDc: 'JHB', customerDc: 'JHB', isIbt: false,
      promotion: '',
      tags: ['multi_unit'],
    });
  }

  // ── 13. OUT-OF-STOCK (historical) — Water Bottle — cancelled (no stock) ───
  {
    const { orderId, orderItemId } = next();
    orders.push({
      orderId, orderItemId,
      offerId: 100013, tsin: 200013, sku: 'KG-WATER-BOTTLE-SS',
      productTitle: 'Stainless Steel Water Bottle 750ml',
      quantity: 1, sellingPriceCents: 24900, unitPriceCents: 24900,
      orderDate: daysAgoDate(18, 10),
      saleStatus: 'Cancelled',
      fulfillmentDc: 'JHB', customerDc: 'JHB', isIbt: false,
      promotion: '',
      tags: ['cancelled'],
    });
  }

  // ── 14. NEAR-ZERO MARGIN — Notebook, qty 5, shipped ───────────────────────
  {
    const { orderId, orderItemId } = next();
    orders.push({
      orderId, orderItemId,
      offerId: 100014, tsin: 200014, sku: 'KG-NOTEBOOK-A5',
      productTitle: 'Premium Notebook A5 Hardcover',
      quantity: 5, sellingPriceCents: 39500, unitPriceCents: 7900,
      orderDate: daysAgoDate(3, 9),
      saleStatus: 'Shipped',
      fulfillmentDc: 'JHB', customerDc: 'DBN', isIbt: true,
      promotion: '',
      tags: ['multi_unit', 'ibt_cross_region'],
    });
  }

  // ── 15. NEAR-ZERO MARGIN — Notebook returned after multi-unit order ────────
  {
    const { orderId, orderItemId } = next();
    orders.push({
      orderId, orderItemId,
      offerId: 100014, tsin: 200014, sku: 'KG-NOTEBOOK-A5',
      productTitle: 'Premium Notebook A5 Hardcover',
      quantity: 3, sellingPriceCents: 23700, unitPriceCents: 7900,
      orderDate: daysAgoDate(12, 13),
      saleStatus: 'Returned',
      fulfillmentDc: 'JHB', customerDc: 'JHB', isIbt: false,
      promotion: '',
      reversalAmountCents: 23700,
      hasReversal: true,
      tags: ['return_full', 'multi_unit'],
    });
  }

  // ── 16. MULTI-UNIT DAILY DEAL — LED Bulbs (4 units, already a loss-maker) ──
  {
    const { orderId, orderItemId } = next();
    orders.push({
      orderId, orderItemId,
      offerId: 100012, tsin: 200012, sku: 'KG-LED-BULB-4PK',
      productTitle: 'LED Smart Bulb 4-Pack',
      quantity: 4, sellingPriceCents: 239600, unitPriceCents: 59900,
      orderDate: daysAgoDate(6, 10),
      saleStatus: 'Delivered',
      fulfillmentDc: 'JHB', customerDc: 'JHB', isIbt: false,
      promotion: 'Daily Deal',
      tags: ['multi_unit', 'daily_deal'],
    });
  }

  // ── 17. RETURN REQUESTED on a loss-maker — Phone Case ─────────────────────
  {
    const { orderId, orderItemId } = next();
    orders.push({
      orderId, orderItemId,
      offerId: 100011, tsin: 200011, sku: 'KG-PHONE-CASE-UT',
      productTitle: 'Phone Case Ultra Thin',
      quantity: 1, sellingPriceCents: 9900, unitPriceCents: 9900,
      orderDate: daysAgoDate(1, 16),
      saleStatus: 'Return Requested',
      fulfillmentDc: 'CPT', customerDc: 'CPT', isIbt: false,
      promotion: '',
      tags: ['return_requested'],
    });
  }

  // ── 18. OVERSTOCK + RETURN — Baby Monitor returned after 40+ day hold ──────
  {
    const { orderId, orderItemId } = next();
    orders.push({
      orderId, orderItemId,
      offerId: 100008, tsin: 200008, sku: 'KG-BABY-MON-WIFI',
      productTitle: 'Baby Monitor WiFi',
      quantity: 1, sellingPriceCents: 199900, unitPriceCents: 199900,
      orderDate: daysAgoDate(45, 11),
      saleStatus: 'Returned',
      fulfillmentDc: 'JHB', customerDc: 'JHB', isIbt: false,
      promotion: '',
      reversalAmountCents: 199900,
      hasReversal: true,
      tags: ['return_full'],
    });
  }

  return orders;
}

// =============================================================================
// Random Order Generation (baseline volume)
// =============================================================================

export function generateDemoOrders(seed: number = 42): DemoOrder[] {
  const rand = createPrng(seed);
  const orders: DemoOrder[] = [];
  const now = new Date();

  let orderIdCounter = 500000;
  let orderItemIdCounter = 900000;

  // For each product, generate orders proportional to its weight
  for (const product of DEMO_PRODUCTS) {
    const orderWeight = PRODUCT_ORDER_WEIGHTS[product.offerId] ?? 5;
    if (orderWeight === 0) continue; // skip out-of-stock products

    const orderCount = Math.max(1, Math.round(orderWeight * (1 + rand() * 0.5)));

    for (let i = 0; i < orderCount; i++) {
      const daysAgo = Math.floor(Math.pow(rand(), 1.5) * 90);
      const orderDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      orderDate.setHours(Math.floor(rand() * 14) + 7);
      orderDate.setMinutes(Math.floor(rand() * 60));

      const status = weightedPick(SALE_STATUSES, rand());
      const dc = weightedPick(DC_CONFIGS, rand());

      let quantity = 1;
      const qtyRoll = rand();
      if (qtyRoll > 0.95) quantity = 3 + Math.floor(rand() * 3);
      else if (qtyRoll > 0.80) quantity = 2;

      const promotionIdx = Math.floor(rand() * PROMOTIONS.length);

      // Attach reversal to randomly generated returns
      const isReturn = status.status === 'Returned';
      const reversalAmountCents = isReturn ? product.sellingPriceCents * quantity : undefined;
      const hasReversal = isReturn ? true : undefined;

      orders.push({
        orderId: orderIdCounter++,
        orderItemId: orderItemIdCounter++,
        offerId: product.offerId,
        tsin: product.tsin,
        sku: product.sku,
        productTitle: product.title,
        quantity,
        sellingPriceCents: product.sellingPriceCents * quantity,
        unitPriceCents: product.sellingPriceCents,
        orderDate,
        saleStatus: status.status,
        fulfillmentDc: dc.fulfillment,
        customerDc: dc.customer,
        isIbt: dc.fulfillment !== dc.customer,
        promotion: PROMOTIONS[promotionIdx]!,
        reversalAmountCents,
        hasReversal,
        tags: [
          isReturn ? 'return_full' : 'normal',
          ...(quantity > 1 ? ['multi_unit' as EdgeCaseTag] : []),
          ...(dc.fulfillment !== dc.customer ? ['ibt_cross_region' as EdgeCaseTag] : []),
          ...(PROMOTIONS[promotionIdx] ? ['daily_deal' as EdgeCaseTag] : []),
        ],
      });
    }
  }

  // Sort by date descending (newest first)
  orders.sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime());

  return orders;
}

// =============================================================================
// Alert Definitions
// =============================================================================

export interface DemoAlert {
  alertType: string;
  severity: string;
  title: string;
  message: string;
  offerId: number;
  isRead: boolean;
  createdDaysAgo: number;
}

export const DEMO_ALERTS: DemoAlert[] = [
  {
    alertType: 'loss_maker',
    severity: 'critical',
    title: 'Loss-maker: Phone Case Ultra Thin',
    message: 'This product is selling at a loss of -R12.34 per unit. Net margin is -12.5%. Consider adjusting your price or discontinuing.',
    offerId: 100011,
    isRead: false,
    createdDaysAgo: 1,
  },
  {
    alertType: 'loss_maker',
    severity: 'critical',
    title: 'Loss-maker: LED Smart Bulb 4-Pack',
    message: 'This product is selling at a loss of -R45.67 per unit. Net margin is -7.6%. High storage fees (45 days cover) are compounding the loss.',
    offerId: 100012,
    isRead: true,
    createdDaysAgo: 3,
  },
  {
    alertType: 'margin_drop',
    severity: 'warning',
    title: 'Margin drop: Camping Chair Deluxe',
    message: 'Profit margin dropped from 18.2% to 6.3% over the past 7 days. The change appears related to increased IBT transfers.',
    offerId: 100006,
    isRead: false,
    createdDaysAgo: 2,
  },
  {
    alertType: 'storage_warning',
    severity: 'warning',
    title: 'Overstocked: Baby Monitor WiFi',
    message: 'Stock cover is 40 days — above the 35-day threshold. Takealot storage fees of R2.00/unit/month are now accruing. 60 units at JHB DC.',
    offerId: 100008,
    isRead: false,
    createdDaysAgo: 4,
  },
  {
    alertType: 'storage_warning',
    severity: 'critical',
    title: 'Overstocked: LED Smart Bulb 4-Pack',
    message: 'Stock cover is 45 days — well above threshold. Storage fees accruing on 90 units at JHB DC. Consider a promotion to clear stock.',
    offerId: 100012,
    isRead: false,
    createdDaysAgo: 2,
  },
  {
    alertType: 'margin_drop',
    severity: 'warning',
    title: 'Margin drop: Biltong Box 1kg Premium',
    message: 'Profit margin dropped from 15.8% to 9.2%. Several recent orders involved IBT from JHB to CPT, adding transfer penalties.',
    offerId: 100003,
    isRead: true,
    createdDaysAgo: 5,
  },
  {
    alertType: 'loss_maker',
    severity: 'warning',
    title: 'Near-loss: Yoga Mat Premium 6mm',
    message: 'Profit margin is only 2.1% — dangerously close to loss territory. COGS is currently estimated; entering your real cost may change this.',
    offerId: 100007,
    isRead: false,
    createdDaysAgo: 1,
  },
  {
    alertType: 'storage_warning',
    severity: 'warning',
    title: 'Approaching overstock: Office Desk Stand',
    message: 'Stock cover is 30 days — approaching the 35-day threshold. Only 2 units sold in the past 30 days at DBN DC.',
    offerId: 100010,
    isRead: true,
    createdDaysAgo: 6,
  },
  // ── New edge-case alerts ──
  {
    alertType: 'return_spike',
    severity: 'warning',
    title: 'High return rate: Wireless Earbuds Pro ZA',
    message: '3 returns in the past 7 days — return rate is 25%. This may indicate a product quality issue or misleading listing. Review your product description.',
    offerId: 100004,
    isRead: false,
    createdDaysAgo: 2,
  },
  {
    alertType: 'loss_maker',
    severity: 'warning',
    title: 'Near-loss: Premium Notebook A5',
    message: 'Profit margin is only 1.8% based on estimated COGS. Enter your actual cost of goods to get an accurate reading. IBT transfers are eroding margin.',
    offerId: 100014,
    isRead: false,
    createdDaysAgo: 1,
  },
  {
    alertType: 'out_of_stock',
    severity: 'critical',
    title: 'Out of stock: Stainless Steel Water Bottle',
    message: 'Zero stock across all DCs. The listing is no longer Buyable. Last sale was 25 days ago. Replenish to resume sales.',
    offerId: 100013,
    isRead: false,
    createdDaysAgo: 3,
  },
  {
    alertType: 'fee_discrepancy',
    severity: 'warning',
    title: 'Fee discrepancy: Office Desk Stand Adjustable',
    message: 'Takealot charged R78.74 success fee — R8.76 more than the calculated R69.98. Import your latest sales report to verify.',
    offerId: 100010,
    isRead: false,
    createdDaysAgo: 1,
  },
];

// =============================================================================
// Takealot API Response Formatters (for MockTakealotClient)
// =============================================================================

export function toTakealotOffer(product: DemoProduct): TakealotOffer {
  return {
    offer_id: product.offerId,
    tsin: product.tsin,
    sku: product.sku,
    barcode: product.barcode,
    title: product.title,
    selling_price: product.sellingPriceCents,
    rrp: product.rrpCents,
    status: product.stockJhb + product.stockCpt + product.stockDbn > 0 ? 'Buyable' : 'Not Buyable',
    offer_url: `https://www.takealot.com/product/${product.tsin}`,
    product_label_number: `PLN-${product.offerId}`,
    leadtime_days: 0,
    leadtime_stock: [],
    stock_at_takealot: [
      ...(product.stockJhb > 0 ? [{ dc: 'JHB', quantity: product.stockJhb }] : []),
      ...(product.stockCpt > 0 ? [{ dc: 'CPT', quantity: product.stockCpt }] : []),
      ...(product.stockDbn > 0 ? [{ dc: 'DBN', quantity: product.stockDbn }] : []),
    ],
    stock_cover: product.stockCoverDays,
    sales_units: [
      { dc: 'JHB', units: Math.round(product.salesUnits30d * 0.6) },
      { dc: 'CPT', units: Math.round(product.salesUnits30d * 0.3) },
      { dc: 'DBN', units: Math.round(product.salesUnits30d * 0.1) },
    ],
    discount: product.rrpCents > product.sellingPriceCents
      ? Math.round(((product.rrpCents - product.sellingPriceCents) / product.rrpCents) * 100)
      : 0,
    weight: product.weightGrams / 1000,
    length: product.lengthMm / 10,
    width: product.widthMm / 10,
    height: product.heightMm / 10,
    category: product.category,
  };
}

export function toTakealotSale(order: DemoOrder): TakealotSale {
  return {
    order_id: order.orderId,
    order_item_id: order.orderItemId,
    order_date: order.orderDate.toISOString(),
    sale_status: order.saleStatus,
    product_title: order.productTitle,
    takealot_url_mobi: `https://www.takealot.com/product/${order.tsin}`,
    sku: order.sku,
    tsin: order.tsin,
    offer_id: order.offerId,
    quantity: order.quantity,
    selling_price: order.sellingPriceCents,
    dc: order.fulfillmentDc,
    customer_dc: order.customerDc,
    promotion: order.promotion,
    customer: 'Demo Customer',
    po_number: order.orderId + 10000,
    shipment_name: `SHP-${order.orderId}`,
  };
}
