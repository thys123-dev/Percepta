import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  timestamp,
  text,
  decimal,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// =============================================================================
// sellers
// =============================================================================

export const sellers = pgTable('sellers', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  businessName: varchar('business_name', { length: 255 }),
  apiKeyEnc: varchar('api_key_enc', { length: 512 }),
  apiKeyValid: boolean('api_key_valid').default(true),
  webhookSecret: varchar('webhook_secret', { length: 64 }), // HMAC-SHA256 signing secret for Takealot webhooks
  isVatVendor: boolean('is_vat_vendor').default(false),
  vatNumber: varchar('vat_number', { length: 20 }),
  targetMarginPct: decimal('target_margin_pct', { precision: 5, scale: 2 }).default('25.00'),
  onboardingComplete: boolean('onboarding_complete').default(false),
  initialSyncStatus: varchar('initial_sync_status', { length: 20 }).default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// offers (products)
// =============================================================================

export const offers = pgTable(
  'offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    offerId: integer('offer_id').notNull(),
    tsin: integer('tsin'),
    sku: varchar('sku', { length: 255 }),
    barcode: varchar('barcode', { length: 50 }),
    title: varchar('title', { length: 500 }),
    category: varchar('category', { length: 255 }),
    sellingPriceCents: integer('selling_price_cents'),
    rrpCents: integer('rrp_cents'),
    status: varchar('status', { length: 50 }),

    // Dimensions for fee calculation
    weightGrams: integer('weight_grams'),
    lengthMm: integer('length_mm'),
    widthMm: integer('width_mm'),
    heightMm: integer('height_mm'),
    volumeCm3: integer('volume_cm3'),
    sizeTier: varchar('size_tier', { length: 20 }),
    weightTier: varchar('weight_tier', { length: 20 }),

    // COGS (seller-provided or estimated)
    cogsCents: integer('cogs_cents'),
    cogsSource: varchar('cogs_source', { length: 20 }).default('estimate'),
    inboundCostCents: integer('inbound_cost_cents').default(0),

    // Stock (per-DC, matching bulk replenishment template layout: CPT, JHB, DBN)
    stockJhb: integer('stock_jhb').default(0),
    stockCpt: integer('stock_cpt').default(0),
    stockDbn: integer('stock_dbn').default(0),
    stockCoverDays: integer('stock_cover_days'),
    salesUnits30d: integer('sales_units_30d').default(0),

    // Leadtime (business days seller takes to deliver to Takealot DC; 0 = in-stock only)
    leadtimeDays: integer('leadtime_days').default(0),

    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex('offers_seller_offer_idx').on(table.sellerId, table.offerId),
    index('offers_seller_idx').on(table.sellerId),
  ]
);

// =============================================================================
// orders (sales)
// =============================================================================

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    orderId: integer('order_id').notNull(),
    orderItemId: integer('order_item_id').notNull(),
    offerId: integer('offer_id'),
    tsin: integer('tsin'),
    sku: varchar('sku', { length: 255 }),
    productTitle: varchar('product_title', { length: 500 }),
    quantity: integer('quantity').notNull(),
    sellingPriceCents: integer('selling_price_cents').notNull(),
    unitPriceCents: integer('unit_price_cents'),
    orderDate: timestamp('order_date', { withTimezone: true }).notNull(),
    saleStatus: varchar('sale_status', { length: 50 }),
    fulfillmentDc: varchar('fulfillment_dc', { length: 10 }),
    customerDc: varchar('customer_dc', { length: 10 }),
    isIbt: boolean('is_ibt').default(false),
    promotion: varchar('promotion', { length: 255 }),
    source: varchar('source', { length: 20 }).default('api'),

    // ── Actual ship date from Takealot sales report CSV ──
    // The fee matrix version (v1/v2) is selected by ship date, not order date.
    // When available, this is the ground-truth date; otherwise we fall back to orderDate.
    dateShippedToCustomer: timestamp('date_shipped_to_customer', { withTimezone: true }),

    // ── Actual fee amounts from Takealot sales report CSV ──
    // These are the REAL fees Takealot charged, used for fee reconciliation/auditing.
    // null = not yet imported from CSV (we only have our calculated estimates).
    grossSalesCents: integer('gross_sales_cents'),
    actualSuccessFeeCents: integer('actual_success_fee_cents'),
    actualFulfilmentFeeCents: integer('actual_fulfilment_fee_cents'),
    courierCollectionFeeCents: integer('courier_collection_fee_cents'),
    actualStockTransferFeeCents: integer('actual_stock_transfer_fee_cents'),
    netSalesAmountCents: integer('net_sales_amount_cents'),

    // ── Extra CSV fields ──
    dailyDealPromo: varchar('daily_deal_promo', { length: 100 }),
    shipmentName: varchar('shipment_name', { length: 255 }),
    poNumber: varchar('po_number', { length: 100 }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex('orders_seller_item_idx').on(table.sellerId, table.orderItemId),
    index('orders_seller_idx').on(table.sellerId),
    index('orders_seller_date_idx').on(table.sellerId, table.orderDate),
    index('orders_seller_offer_idx').on(table.sellerId, table.offerId),
  ]
);

// =============================================================================
// calculated_fees
// =============================================================================

export const calculatedFees = pgTable(
  'calculated_fees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    successFeeCents: integer('success_fee_cents').default(0),
    fulfilmentFeeCents: integer('fulfilment_fee_cents').default(0),
    ibtPenaltyCents: integer('ibt_penalty_cents').default(0),
    cancellationPenaltyCents: integer('cancellation_penalty_cents').default(0),
    storageFeeAllocatedCents: integer('storage_fee_allocated_cents').default(0),
    totalFeeCents: integer('total_fee_cents').default(0),
    calculationVersion: integer('calculation_version').default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('calc_fees_seller_idx').on(table.sellerId),
    index('calc_fees_order_idx').on(table.orderId),
  ]
);

// =============================================================================
// profit_calculations
// =============================================================================

export const profitCalculations = pgTable(
  'profit_calculations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    offerId: integer('offer_id'),
    revenueCents: integer('revenue_cents').notNull(),
    cogsCents: integer('cogs_cents').default(0),
    totalFeesCents: integer('total_fees_cents').default(0),
    inboundCostCents: integer('inbound_cost_cents').default(0),
    netProfitCents: integer('net_profit_cents').notNull(),
    profitMarginPct: decimal('profit_margin_pct', { precision: 7, scale: 2 }),
    isProfitable: boolean('is_profitable').default(true),
    cogsIsEstimated: boolean('cogs_is_estimated').default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('profit_seller_idx').on(table.sellerId),
    index('profit_seller_profitable_idx').on(table.sellerId, table.isProfitable),
  ]
);

// =============================================================================
// fee_schedule (Takealot's fee rules — data-driven, not hardcoded)
// =============================================================================

export const feeSchedule = pgTable('fee_schedule', {
  id: uuid('id').primaryKey().defaultRandom(),
  feeType: varchar('fee_type', { length: 30 }).notNull(),
  category: varchar('category', { length: 255 }),
  /**
   * April 2026: Standard tier split into 4 category groups.
   * Values: standard_a | standard_b | standard_c | standard_d
   *       | large | oversize | bulky | extra_bulky
   * null = not applicable (used for non-Standard size tiers)
   */
  categoryGroup: varchar('category_group', { length: 30 }),
  sizeTier: varchar('size_tier', { length: 30 }),
  weightTier: varchar('weight_tier', { length: 30 }),
  subcategory: varchar('subcategory', { length: 255 }),
  minRate: decimal('min_rate', { precision: 7, scale: 2 }),
  maxRate: decimal('max_rate', { precision: 7, scale: 2 }),
  flatRateCents: integer('flat_rate_cents'),
  calculationVersion: varchar('calculation_version', { length: 20 }).default('v2025-07'),
  effectiveFrom: timestamp('effective_from', { mode: 'date' }).notNull(),
  effectiveTo: timestamp('effective_to', { mode: 'date' }),
  notes: text('notes'),
});

// =============================================================================
// webhook_events
// =============================================================================

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id').references(() => sellers.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 50 }).notNull(),
    deliveryId: varchar('delivery_id', { length: 100 }),
    payload: jsonb('payload').notNull(),
    processed: boolean('processed').default(false),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('webhook_unprocessed_idx').on(table.processed),
  ]
);

// =============================================================================
// alerts
// =============================================================================

export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    alertType: varchar('alert_type', { length: 30 }).notNull(),
    severity: varchar('severity', { length: 15 }).default('warning'),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    offerId: integer('offer_id'),
    actionUrl: varchar('action_url', { length: 500 }),
    isRead: boolean('is_read').default(false),
    isActedUpon: boolean('is_acted_upon').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('alerts_seller_unread_idx').on(table.sellerId, table.isRead),
  ]
);

// =============================================================================
// sales_report_imports — Tracks seller CSV uploads for auditing/reconciliation
// =============================================================================

export const salesReportImports = pgTable(
  'sales_report_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    rowCount: integer('row_count').notNull(),
    matchedCount: integer('matched_count').default(0),
    unmatchedCount: integer('unmatched_count').default(0),
    updatedCount: integer('updated_count').default(0),
    status: varchar('status', { length: 20 }).default('pending'), // pending | processing | complete | failed
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('sales_imports_seller_idx').on(table.sellerId),
  ]
);

// =============================================================================
// fee_discrepancies — Actual vs calculated fee differences flagged for auditing
// =============================================================================

export const feeDiscrepancies = pgTable(
  'fee_discrepancies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    importId: uuid('import_id')
      .references(() => salesReportImports.id, { onDelete: 'set null' }),
    feeType: varchar('fee_type', { length: 30 }).notNull(), // success_fee | fulfilment_fee | stock_transfer_fee
    actualCents: integer('actual_cents').notNull(),
    calculatedCents: integer('calculated_cents').notNull(),
    discrepancyCents: integer('discrepancy_cents').notNull(), // actual - calculated
    discrepancyPct: decimal('discrepancy_pct', { precision: 7, scale: 2 }), // (actual-calc)/actual × 100
    status: varchar('status', { length: 20 }).default('open'), // open | acknowledged | disputed
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('discrepancies_seller_idx').on(table.sellerId),
    index('discrepancies_seller_status_idx').on(table.sellerId, table.status),
  ]
);
