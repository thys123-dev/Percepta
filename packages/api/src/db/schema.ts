import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  bigint,
  timestamp,
  date,
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
  monthlyRevenuTargetCents: integer('monthly_revenue_target_cents'),
  onboardingComplete: boolean('onboarding_complete').default(false),
  initialSyncStatus: varchar('initial_sync_status', { length: 20 }).default('pending'),

  // Email notification preferences (Week 9)
  emailWeeklyDigest: boolean('email_weekly_digest').default(true),
  emailLossAlerts: boolean('email_loss_alerts').default(true),
  emailMarginThreshold: decimal('email_margin_threshold', { precision: 5, scale: 2 }).default('15.00'),
  lastWeeklyDigestAt: timestamp('last_weekly_digest_at', { withTimezone: true }),

  // Password reset (forgot-password flow). Token is stored as a SHA-256 hash;
  // the raw token is only ever sent in the reset email and never persisted.
  passwordResetTokenHash: varchar('password_reset_token_hash', { length: 64 }),
  passwordResetExpiresAt: timestamp('password_reset_expires_at', { withTimezone: true }),

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
    /** Direct Takealot product URL captured from /v2/offers (e.g. https://www.takealot.com/x/PLID...) */
    offerUrl: text('offer_url'),

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

    // ── Reversal tracking (populated from Account Transactions CSV) ──
    reversalAmountCents: integer('reversal_amount_cents'),
    hasReversal: boolean('has_reversal').default(false),

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
    // UNIQUE: required by ON CONFLICT (order_id) upserts in profit-processor.ts
    uniqueIndex('calc_fees_order_idx').on(table.orderId),
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
    // UNIQUE: required by ON CONFLICT (order_id) upserts in profit-processor.ts
    uniqueIndex('profit_calculations_order_id_unique_idx').on(table.orderId),
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
    // Dedup at the DB layer: same seller + delivery_id can only be logged once.
    // BullMQ also deduplicates via jobId, but this prevents duplicate DB rows
    // if the queue is bypassed or the same delivery arrives before processing completes.
    uniqueIndex('webhook_events_seller_delivery_idx')
      .on(table.sellerId, table.deliveryId)
      .where(sql`delivery_id IS NOT NULL`),
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
    resolvedNote: text('resolved_note'), // seller's note when acknowledging/disputing
    resolvedAt: timestamp('resolved_at', { withTimezone: true }), // when status was changed
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('discrepancies_seller_idx').on(table.sellerId),
    index('discrepancies_seller_status_idx').on(table.sellerId, table.status),
  ]
);

// =============================================================================
// account_transaction_imports — Tracks Account Transactions CSV uploads
// =============================================================================

export const accountTransactionImports = pgTable(
  'account_transaction_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    rowCount: integer('row_count').notNull(),
    insertedCount: integer('inserted_count').default(0),
    duplicateCount: integer('duplicate_count').default(0),
    ordersUpdated: integer('orders_updated').default(0),
    status: varchar('status', { length: 20 }).default('pending'),
    errorMessage: text('error_message'),
    dateRangeStart: timestamp('date_range_start', { withTimezone: true }),
    dateRangeEnd: timestamp('date_range_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('acct_imports_seller_idx').on(table.sellerId),
  ]
);

// =============================================================================
// account_transactions — Individual rows from Account Transactions CSV
// =============================================================================

export const accountTransactions = pgTable(
  'account_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    importId: uuid('import_id')
      .references(() => accountTransactionImports.id, { onDelete: 'set null' }),
    transactionDate: timestamp('transaction_date', { withTimezone: true }).notNull(),
    transactionType: varchar('transaction_type', { length: 50 }).notNull(),
    transactionId: bigint('transaction_id', { mode: 'number' }).notNull(),
    description: text('description'),
    referenceType: varchar('reference_type', { length: 50 }),
    reference: text('reference'),
    orderId: integer('order_id'),
    exclVatCents: integer('excl_vat_cents').notNull(),
    vatCents: integer('vat_cents').notNull(),
    inclVatCents: integer('incl_vat_cents').notNull(),
    balanceCents: bigint('balance_cents', { mode: 'number' }),
    sku: varchar('sku', { length: 255 }),
    productTitle: varchar('product_title', { length: 500 }),
    disbursementCycle: timestamp('disbursement_cycle', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex('acct_txn_seller_txnid_idx').on(table.sellerId, table.transactionId),
    index('acct_txn_seller_type_idx').on(table.sellerId, table.transactionType),
    index('acct_txn_seller_date_idx').on(table.sellerId, table.transactionDate),
    index('acct_txn_seller_order_idx').on(table.sellerId, table.orderId),
  ]
);

// =============================================================================
// seller_costs — Monthly aggregated non-order costs
// =============================================================================

export const sellerCosts = pgTable(
  'seller_costs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    month: date('month').notNull(),
    costType: varchar('cost_type', { length: 50 }).notNull(),
    totalExclVatCents: integer('total_excl_vat_cents').notNull().default(0),
    totalVatCents: integer('total_vat_cents').notNull().default(0),
    totalInclVatCents: integer('total_incl_vat_cents').notNull().default(0),
    transactionCount: integer('transaction_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex('seller_costs_unique_idx').on(table.sellerId, table.month, table.costType),
  ]
);

// =============================================================================
// cogs_imports — Tracks COGS CSV/XLSX uploads (audit ledger only — actual
// cogs values are written directly to offers.cogsCents)
// =============================================================================

export const cogsImports = pgTable(
  'cogs_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    rowCount: integer('row_count').notNull(),
    matchedCount: integer('matched_count').default(0),
    unmatchedCount: integer('unmatched_count').default(0),
    status: varchar('status', { length: 20 }).default('pending'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('cogs_imports_seller_idx').on(table.sellerId),
  ]
);

// =============================================================================
// takealot_return_imports — Tracks Takealot Returns Export XLSX uploads
// =============================================================================

export const takealotReturnImports = pgTable(
  'takealot_return_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    rowCount: integer('row_count').notNull(),
    insertedCount: integer('inserted_count').default(0),
    duplicateCount: integer('duplicate_count').default(0),
    ordersUpdated: integer('orders_updated').default(0),
    status: varchar('status', { length: 20 }).default('pending'),
    errorMessage: text('error_message'),
    dateRangeStart: timestamp('date_range_start', { withTimezone: true }),
    dateRangeEnd: timestamp('date_range_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('takealot_return_imports_seller_idx').on(table.sellerId),
  ]
);

// =============================================================================
// takealot_returns — One row per RRN from Takealot Returns Export XLSX
// =============================================================================

export const takealotReturns = pgTable(
  'takealot_returns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    importId: uuid('import_id')
      .references(() => takealotReturnImports.id, { onDelete: 'set null' }),
    rrn: varchar('rrn', { length: 64 }).notNull(),
    orderId: integer('order_id'),
    returnDate: timestamp('return_date', { withTimezone: true }).notNull(),
    productTitle: varchar('product_title', { length: 500 }),
    sku: varchar('sku', { length: 255 }),
    tsin: integer('tsin'),
    /** Defective | Not what I ordered | Changed my mind | Exchange | Failed delivery | Exception */
    returnReason: varchar('return_reason', { length: 64 }),
    customerComment: text('customer_comment'),
    quantity: integer('quantity').notNull().default(1),
    region: varchar('region', { length: 10 }),
    /** Normalised: 'sellable' | 'removal_order' (or null for in-flight returns) */
    stockOutcome: varchar('stock_outcome', { length: 20 }),
    sellerNote: text('seller_note'),
    customerOrderReversalCents: integer('customer_order_reversal_cents'),
    successFeeReversalCents: integer('success_fee_reversal_cents'),
    fulfillmentFeeReversalCents: integer('fulfillment_fee_reversal_cents'),
    courierFeeReversalCents: integer('courier_fee_reversal_cents'),
    removalOrderNumber: varchar('removal_order_number', { length: 64 }),
    dateReadyToCollect: timestamp('date_ready_to_collect', { withTimezone: true }),
    dateAddedToStock: timestamp('date_added_to_stock', { withTimezone: true }),
    /** Future-proof: every column from the source export, preserved verbatim. */
    rawRow: jsonb('raw_row'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex('takealot_returns_seller_rrn_idx').on(table.sellerId, table.rrn),
    index('takealot_returns_seller_order_idx').on(table.sellerId, table.orderId),
    index('takealot_returns_seller_sku_idx').on(table.sellerId, table.sku),
    index('takealot_returns_seller_reason_idx').on(table.sellerId, table.returnReason),
    index('takealot_returns_seller_date_idx').on(table.sellerId, table.returnDate),
  ]
);
