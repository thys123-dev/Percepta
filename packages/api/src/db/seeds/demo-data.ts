/**
 * Demo Data Definitions for Percepta
 *
 * Contains all product, order, and alert definitions used by the seed script
 * and MockTakealotClient. Data is designed to exercise every fee path and
 * produce a realistic, varied dashboard.
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
// Product Definitions (12 products)
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
// Order Generation
// =============================================================================

const SALE_STATUSES = [
  { status: 'Shipped', weight: 70 },
  { status: 'Delivered', weight: 10 },
  { status: 'Accepted', weight: 8 },
  { status: 'Returned', weight: 5 },
  { status: 'Cancelled', weight: 4 },
  { status: 'Return Requested', weight: 3 },
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
};

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
}

export function generateDemoOrders(seed: number = 42): DemoOrder[] {
  const rand = createPrng(seed);
  const orders: DemoOrder[] = [];
  const now = new Date();

  let orderIdCounter = 500000;
  let orderItemIdCounter = 900000;

  // For each product, generate orders proportional to its weight
  for (const product of DEMO_PRODUCTS) {
    const orderWeight = PRODUCT_ORDER_WEIGHTS[product.offerId] ?? 5;
    // Scale: 1 weight point ≈ 1-2 orders
    const orderCount = Math.max(1, Math.round(orderWeight * (1 + rand() * 0.5)));

    for (let i = 0; i < orderCount; i++) {
      // Date: distributed across last 90 days with recent bias
      // Use exponential distribution biased toward recent dates
      const daysAgo = Math.floor(Math.pow(rand(), 1.5) * 90);
      const orderDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      // Randomize hour
      orderDate.setHours(Math.floor(rand() * 14) + 7); // 7am - 9pm
      orderDate.setMinutes(Math.floor(rand() * 60));

      const status = weightedPick(SALE_STATUSES, rand());
      const dc = weightedPick(DC_CONFIGS, rand());

      // Quantity: 80% qty=1, 15% qty=2, 5% qty=3-5
      let quantity = 1;
      const qtyRoll = rand();
      if (qtyRoll > 0.95) quantity = 3 + Math.floor(rand() * 3); // 3-5
      else if (qtyRoll > 0.80) quantity = 2;

      const promotionIdx = Math.floor(rand() * PROMOTIONS.length);

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
    status: 'Buyable',
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
    weight: product.weightGrams / 1000,  // kg
    length: product.lengthMm / 10,       // cm
    width: product.widthMm / 10,         // cm
    height: product.heightMm / 10,       // cm
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
