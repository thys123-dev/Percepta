// =============================================================================
// Percepta Shared Types
// =============================================================================

// ---- Seller ----

export interface Seller {
  id: string;
  email: string;
  businessName: string;
  isVatVendor: boolean;
  vatNumber: string | null;
  onboardingComplete: boolean;
  initialSyncStatus: SyncStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type SyncStatus = 'pending' | 'syncing' | 'complete' | 'failed';

// ---- Offer / Product ----

export interface Offer {
  id: string;
  sellerId: string;
  offerId: number;
  tsin: number | null;
  sku: string | null;
  barcode: string | null;
  title: string;
  category: string | null;
  sellingPriceCents: number;
  rrpCents: number | null;
  status: OfferStatus;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  volumeCm3: number | null;
  sizeTier: SizeTier | null;
  weightTier: WeightTier | null;
  cogsCents: number | null;
  cogsSource: CogsSource;
  inboundCostCents: number;
  stockJhb: number;
  stockCpt: number;
  stockCoverDays: number | null;
  salesUnits30d: number;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type OfferStatus =
  | 'Buyable'
  | 'Not Buyable'
  | 'Disabled by Seller'
  | 'Disabled by Takealot';

export type CogsSource = 'estimate' | 'manual' | 'csv_import';

// ---- Size & Weight Tiers (for fee calculation) ----

export type SizeTier =
  | 'Standard'
  | 'Large'
  | 'Oversize'
  | 'Bulky'
  | 'Extra Bulky';

export type WeightTier = 'Light' | 'Heavy' | 'Heavy Plus' | 'Very Heavy';

// Storage fee uses different size brackets
export type StorageSizeTier =
  | 'Small'
  | 'Standard'
  | 'Large'
  | 'Extra Large'
  | 'Oversize'
  | 'Bulky'
  | 'Extra Bulky';

// ---- Order ----

export interface Order {
  id: string;
  sellerId: string;
  orderId: number;
  orderItemId: number;
  offerId: number | null;
  tsin: number | null;
  sku: string | null;
  productTitle: string;
  quantity: number;
  sellingPriceCents: number;
  unitPriceCents: number;
  orderDate: Date;
  saleStatus: string;
  fulfillmentDc: string | null;
  customerDc: string | null;
  isIbt: boolean;
  promotion: string | null;
  source: 'api' | 'webhook';
  createdAt: Date;
  updatedAt: Date;
}

// ---- Calculated Fees ----

export interface CalculatedFees {
  id: string;
  sellerId: string;
  orderId: string;
  successFeeCents: number;
  fulfilmentFeeCents: number;
  ibtPenaltyCents: number;
  cancellationPenaltyCents: number;
  storageFeeAllocatedCents: number;
  totalFeeCents: number;
  calculationVersion: number;
  createdAt: Date;
}

// ---- Profit Calculation ----

export interface ProfitCalculation {
  id: string;
  sellerId: string;
  orderId: string;
  offerId: number | null;
  revenueCents: number;
  cogsCents: number;
  totalFeesCents: number;
  inboundCostCents: number;
  netProfitCents: number;
  profitMarginPct: number;
  isProfitable: boolean;
  cogsIsEstimated: boolean;
  createdAt: Date;
}

// ---- Fee Schedule ----

export interface FeeScheduleEntry {
  id: string;
  feeType: FeeType;
  category: string | null;
  sizeTier: string | null;
  weightTier: string | null;
  subcategory: string | null;
  minRate: number | null;
  maxRate: number | null;
  flatRateCents: number | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  notes: string | null;
}

export type FeeType =
  | 'success_fee'
  | 'fulfilment'
  | 'storage'
  | 'ibt'
  | 'cancellation'
  | 'removal'
  | 'relabel';

// ---- Alerts ----

export interface Alert {
  id: string;
  sellerId: string;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  offerId: number | null;
  actionUrl: string | null;
  isRead: boolean;
  isActedUpon: boolean;
  createdAt: Date;
}

export type AlertType =
  | 'loss_maker'
  | 'margin_drop'
  | 'storage_warning'
  | 'ibt_risk';

export type AlertSeverity = 'info' | 'warning' | 'critical';

// ---- Webhook Events ----

export interface WebhookEvent {
  id: string;
  sellerId: string;
  eventType: TakealotWebhookEvent;
  deliveryId: string | null;
  payload: Record<string, unknown>;
  processed: boolean;
  processedAt: Date | null;
  createdAt: Date;
}

export type TakealotWebhookEvent =
  | 'New Leadtime Order'
  | 'New Drop Ship Order'
  | 'Sale Status Changed'
  | 'Batch Completed'
  | 'Offer Updated'
  | 'Offer Created';

// ---- API Response Types ----

export interface DashboardSummary {
  period: {
    startDate: string;
    endDate: string;
  };
  totalRevenueCents: number;
  totalFeesCents: number;
  totalCogsCents: number;
  netProfitCents: number;
  profitMarginPct: number;
  orderCount: number;
  avgProfitPerOrderCents: number;
  lossMakingProductCount: number;
  trends: {
    revenueDelta: number;
    profitDelta: number;
    marginDelta: number;
  };
}

export interface ProductPerformanceRow {
  offerId: number;
  title: string;
  sku: string | null;
  unitsSold: number;
  revenueCents: number;
  totalFeesCents: number;
  cogsCents: number;
  netProfitCents: number;
  marginPct: number;
  cogsIsEstimated: boolean;
  status: 'profitable' | 'marginal' | 'loss_maker';
}

export interface FeeBreakdown {
  sellingPriceCents: number;
  successFeeCents: number;
  fulfilmentFeeCents: number;
  ibtPenaltyCents: number;
  storageFeeAllocatedCents: number;
  cogsCents: number;
  inboundCostCents: number;
  netProfitCents: number;
  marginPct: number;
}

// ---- WebSocket Events ----

export interface WsProfitUpdate {
  type: 'profit:updated';
  orderId: string;
  offerId: number;
  productTitle: string;
  profitCents: number;
  marginPct: number;
}

export interface WsSyncProgress {
  type: 'sync:progress';
  stage: 'offers' | 'sales' | 'fees' | 'complete';
  total: number;
  completed: number;
}

// ---- Utility Types ----

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}

// ---- Constants ----

export const VAT_RATE = 0.15;
export const STOCK_COVER_WARNING_DAYS = 35;
export const DEFAULT_COGS_ESTIMATE_PCT = 0.50;
export const MAX_SALES_DATE_RANGE_DAYS = 180;
export const OFFERS_PER_PAGE = 100;
