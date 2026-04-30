/**
 * Takealot Fee Calculation Engine
 *
 * The most business-critical code in Percepta. Calculates all fees for a
 * given order line item based on the active Takealot Pricing Schedule.
 * Fee matrix version is selected from the order's ship date (see fee-tables.ts).
 *
 * Fee pipeline: (offer, order) → FeeBreakdownResult
 *
 * All amounts in CENTS, excluding VAT (unless explicitly noted).
 * Success fee is calculated on VAT-inclusive selling price per Takealot rules.
 *
 * IMPORTANT: This engine must be > 95% accurate. Any changes require
 * validation against known real orders before deployment.
 */

import {
  SUCCESS_FEE_RATES,
  DEFAULT_SUCCESS_FEE_PCT,
  getFulfilmentMatrix,
  getFulfilmentVersion,
  FULFILMENT_CATEGORY_MAP,
  STORAGE_TIERS,
  STORAGE_GRACE_PERIOD_DAYS,
  IBT_PENALTY_MATRIX,
  IBT_SIZE_THRESHOLDS,
  CANCELLATION_FEE_CENTS,
  VAT_RATE,
  type FulfilmentWeightTier,
  type FulfilmentSizeTier,
  type IbtSizeTier,
} from './fee-tables.js';

// =============================================================================
// Input / Output Types
// =============================================================================

/** Product data needed for fee calculation */
export interface FeeOfferInput {
  sellingPriceCents: number; // Per-unit VAT-inclusive selling price
  category: string | null;
  volumeCm3: number | null;   // length × width × height in cm³
  weightGrams: number | null;
  stockCoverDays: number | null;
  /** Takealot's published per-product success-fee rate (in %), if known.
   *  When set, overrides the category-based table lookup — far more accurate
   *  because the table groups very different sub-categories (phones vs tablets)
   *  under one rate. Source: Product Details CSV. */
  successFeeRatePct?: number | null;
  /** Takealot's published per-unit fulfilment fee (in cents), if known.
   *  When set, overrides the size×weight×category matrix lookup. Source:
   *  Product Details CSV. */
  fulfilmentFeeCents?: number | null;
}

/** Order data needed for fee calculation */
export interface FeeOrderInput {
  quantity: number;
  fulfillmentDc: string | null;
  customerDc: string | null;
  saleStatus: string | null;
  /**
   * Ship date (or order date as proxy) used to select the correct fee matrix version.
   * - On/after 2026-04-01 → v2 (April 2026 rates)
   * - Before 2026-04-01  → v1 (July 2025 rates)
   * - null/undefined     → v2 (latest, safe default for new ingestion)
   */
  shipDate?: Date | string | null;
}

/** Complete fee breakdown for a single order line item */
export interface FeeBreakdownResult {
  // Per-unit fees (cents, excl. VAT)
  successFeePerUnitCents: number;
  fulfilmentFeePerUnitCents: number;
  ibtPenaltyPerUnitCents: number;
  storageFeeAllocationPerUnitCents: number;

  // Total fees across all units (cents, excl. VAT)
  successFeeTotalCents: number;
  fulfilmentFeeTotalCents: number;
  ibtPenaltyTotalCents: number;
  storageFeeAllocationTotalCents: number;
  totalFeesExclVatCents: number;

  // VAT on fees
  vatOnFeesCents: number;
  totalFeesInclVatCents: number;

  // Classification metadata (for debugging/display)
  meta: {
    successFeeRatePct: number;
    fulfilmentSizeTier: FulfilmentSizeTier;
    fulfilmentWeightTier: FulfilmentWeightTier;
    ibtSizeTier: IbtSizeTier | null;
    storageTierName: string | null;
    isIbt: boolean;
    isOverstocked: boolean;
    hasDimensions: boolean;
    calculationVersion: number;
  };
}

// CALCULATION_VERSION is now derived dynamically from the order's ship date.
// See getFulfilmentVersion() in fee-tables.ts.

// =============================================================================
// Main Calculator
// =============================================================================

/**
 * Calculate all fees for a single order line item.
 *
 * @param offer - Product details (price, dimensions, category)
 * @param order - Order details (quantity, DCs)
 * @returns Complete fee breakdown with per-unit and total amounts
 */
export function calculateFees(
  offer: FeeOfferInput,
  order: FeeOrderInput
): FeeBreakdownResult {
  const quantity = order.quantity;
  const hasDimensions = offer.volumeCm3 !== null && offer.weightGrams !== null;

  // 1. Success fee — prefer Takealot's published per-product rate (from
  //    Product Details CSV) when available; fall back to the category table.
  const successFeeRatePct =
    offer.successFeeRatePct != null && offer.successFeeRatePct > 0
      ? offer.successFeeRatePct
      : getSuccessFeeRate(offer.category);
  const successFeePerUnitCents = Math.round(
    offer.sellingPriceCents * (successFeeRatePct / 100)
  );

  // 2. Fulfilment fee — prefer Takealot's published per-product fee when
  //    available; fall back to the size × weight × category matrix.
  const fulfilmentWeightTier = classifyFulfilmentWeight(offer.weightGrams);
  const fulfilmentSizeTier = classifyFulfilmentSize(offer.volumeCm3, offer.category);
  const feeMatrix = getFulfilmentMatrix(order.shipDate);
  const fulfilmentFeePerUnitCents =
    offer.fulfilmentFeeCents != null && offer.fulfilmentFeeCents >= 0
      ? offer.fulfilmentFeeCents
      : feeMatrix[fulfilmentSizeTier][fulfilmentWeightTier];

  // 3. IBT penalty (only if fulfillment DC ≠ customer DC)
  const isIbt = detectIbt(order.fulfillmentDc, order.customerDc);
  let ibtPenaltyPerUnitCents = 0;
  let ibtSizeTier: IbtSizeTier | null = null;

  if (isIbt) {
    ibtSizeTier = classifyIbtSize(offer.volumeCm3);
    ibtPenaltyPerUnitCents =
      IBT_PENALTY_MATRIX[ibtSizeTier][fulfilmentWeightTier];
  }

  // 4. Storage fee allocation (per unit, pro-rated for one month)
  const isOverstocked =
    offer.stockCoverDays !== null &&
    offer.stockCoverDays > STORAGE_GRACE_PERIOD_DAYS;
  let storageFeeAllocationPerUnitCents = 0;
  let storageTierName: string | null = null;

  if (isOverstocked) {
    const tier = classifyStorageSize(offer.volumeCm3);
    storageTierName = tier.name;
    // Storage is per item per month. We allocate a per-order share:
    // Full monthly fee ÷ 30 × number of overstocked days in this sale period.
    // For simplicity in MVP, we allocate the full monthly fee per unit.
    storageFeeAllocationPerUnitCents = tier.overstockedFeeCents;
  }

  // 5. Total per-unit fees
  const totalPerUnitExclVat =
    successFeePerUnitCents +
    fulfilmentFeePerUnitCents +
    ibtPenaltyPerUnitCents +
    storageFeeAllocationPerUnitCents;

  // 6. Scale by quantity
  const successFeeTotalCents = successFeePerUnitCents * quantity;
  const fulfilmentFeeTotalCents = fulfilmentFeePerUnitCents * quantity;
  const ibtPenaltyTotalCents = ibtPenaltyPerUnitCents * quantity;
  const storageFeeAllocationTotalCents = storageFeeAllocationPerUnitCents * quantity;
  const totalFeesExclVatCents = totalPerUnitExclVat * quantity;

  // 7. VAT on fees (all fees are excl. VAT)
  const vatOnFeesCents = Math.round(totalFeesExclVatCents * VAT_RATE);
  const totalFeesInclVatCents = totalFeesExclVatCents + vatOnFeesCents;

  return {
    successFeePerUnitCents,
    fulfilmentFeePerUnitCents,
    ibtPenaltyPerUnitCents,
    storageFeeAllocationPerUnitCents,

    successFeeTotalCents,
    fulfilmentFeeTotalCents,
    ibtPenaltyTotalCents,
    storageFeeAllocationTotalCents,
    totalFeesExclVatCents,

    vatOnFeesCents,
    totalFeesInclVatCents,

    meta: {
      successFeeRatePct,
      fulfilmentSizeTier,
      fulfilmentWeightTier,
      ibtSizeTier,
      storageTierName,
      isIbt,
      isOverstocked,
      hasDimensions,
      calculationVersion: getFulfilmentVersion(order.shipDate),
    },
  };
}

// =============================================================================
// Profit Calculator
// =============================================================================

export interface ProfitInput {
  /** VAT-inclusive selling price per unit (cents) */
  unitSellingPriceCents: number;
  /** Total quantity sold */
  quantity: number;
  /** COGS per unit (cents), 0 if unknown */
  cogsPerUnitCents: number;
  /** Inbound shipping cost per unit (cents) */
  inboundCostPerUnitCents: number;
  /** Fee breakdown from calculateFees() */
  fees: FeeBreakdownResult;
  /** Whether COGS is an estimate vs seller-provided */
  cogsIsEstimated: boolean;
}

export interface ProfitResult {
  revenueCents: number;           // unitPrice × quantity
  totalCogsCents: number;         // COGS × quantity
  totalInboundCostCents: number;  // inbound × quantity
  totalFeesCents: number;         // fees incl. VAT
  netProfitCents: number;         // revenue - COGS - inbound - fees
  profitMarginPct: number;        // (profit / revenue) × 100
  isProfitable: boolean;
  profitPerUnitCents: number;
  cogsIsEstimated: boolean;
}

/**
 * Calculate net profit for an order line item.
 */
export function calculateProfit(input: ProfitInput): ProfitResult {
  const revenueCents = input.unitSellingPriceCents * input.quantity;
  const totalCogsCents = input.cogsPerUnitCents * input.quantity;
  const totalInboundCostCents = input.inboundCostPerUnitCents * input.quantity;
  const totalFeesCents = input.fees.totalFeesInclVatCents;

  const netProfitCents = revenueCents - totalCogsCents - totalInboundCostCents - totalFeesCents;
  const profitMarginPct = revenueCents > 0
    ? Math.round((netProfitCents / revenueCents) * 10000) / 100 // 2 decimal places
    : 0;

  return {
    revenueCents,
    totalCogsCents,
    totalInboundCostCents,
    totalFeesCents,
    netProfitCents,
    profitMarginPct,
    isProfitable: netProfitCents > 0,
    profitPerUnitCents: input.quantity > 0 ? Math.round(netProfitCents / input.quantity) : 0,
    cogsIsEstimated: input.cogsIsEstimated,
  };
}

// =============================================================================
// Classification Functions
// =============================================================================

/**
 * Get success fee rate for a category.
 * Matches by case-insensitive prefix/contains.
 */
export function getSuccessFeeRate(category: string | null): number {
  if (!category) return DEFAULT_SUCCESS_FEE_PCT;

  const normalized = category.trim().toLowerCase();

  for (const entry of SUCCESS_FEE_RATES) {
    if (normalized.includes(entry.category.toLowerCase()) ||
        entry.category.toLowerCase().includes(normalized)) {
      return entry.defaultPct;
    }
  }

  return DEFAULT_SUCCESS_FEE_PCT;
}

/**
 * Classify product into fulfilment weight tier.
 * Defaults to Light if weight unknown (most conservative).
 */
export function classifyFulfilmentWeight(weightGrams: number | null): FulfilmentWeightTier {
  if (weightGrams === null) return 'Light'; // Safe default (lowest fee)

  if (weightGrams <= 7_000) return 'Light';
  if (weightGrams <= 25_000) return 'Heavy';
  if (weightGrams < 40_000) return 'HeavyPlus';
  return 'VeryHeavy';
}

/**
 * Classify product into fulfilment size tier.
 * Standard items (volume <= 35,000 cm3) are further split by category.
 * Defaults to Standard_General if dimensions unknown.
 */
export function classifyFulfilmentSize(
  volumeCm3: number | null,
  category: string | null
): FulfilmentSizeTier {
  // No dimensions → assume standard general (most common)
  if (volumeCm3 === null) {
    return getCategoryFulfilmentTier(category);
  }

  // Standard items (any of the 4 sub-tiers)
  if (volumeCm3 <= 35_000) {
    return getCategoryFulfilmentTier(category);
  }

  // Larger items — universal tiers regardless of category
  if (volumeCm3 <= 130_000) return 'Large';
  if (volumeCm3 <= 200_000) return 'Oversize';
  if (volumeCm3 <= 545_000) return 'Bulky';
  return 'ExtraBulky';
}

/**
 * Map a product category to the correct fulfilment Standard sub-tier.
 */
function getCategoryFulfilmentTier(category: string | null): FulfilmentSizeTier {
  if (!category) return 'Standard_General';

  // Try exact match first
  const exactMatch = FULFILMENT_CATEGORY_MAP[category];
  if (exactMatch) return exactMatch;

  // Try case-insensitive substring match
  const normalized = category.trim().toLowerCase();
  for (const [key, tier] of Object.entries(FULFILMENT_CATEGORY_MAP)) {
    if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) {
      return tier;
    }
  }

  return 'Standard_General';
}

/**
 * Classify product into IBT size tier.
 * IBT uses DIFFERENT volume thresholds than fulfilment.
 */
export function classifyIbtSize(volumeCm3: number | null): IbtSizeTier {
  if (volumeCm3 === null) return 'Standard'; // Safe default

  for (const { tier, maxVolumeCm3 } of IBT_SIZE_THRESHOLDS) {
    if (volumeCm3 <= maxVolumeCm3) return tier;
  }

  return 'ExtraBulky';
}

/**
 * Classify product into storage size tier.
 * Storage uses DIFFERENT volume thresholds than fulfilment AND IBT.
 */
export function classifyStorageSize(volumeCm3: number | null) {
  if (volumeCm3 === null) return STORAGE_TIERS[0]!; // Small (conservative)

  for (const tier of STORAGE_TIERS) {
    if (volumeCm3 <= tier.maxVolumeCm3) return tier;
  }

  return STORAGE_TIERS[STORAGE_TIERS.length - 1]!; // Extra Bulky
}

/**
 * Detect whether an order involves an Inter-Branch Transfer.
 * IBT occurs when the fulfillment DC is in a different region than the customer's nearest DC.
 */
export function detectIbt(
  fulfillmentDc: string | null,
  customerDc: string | null
): boolean {
  if (!fulfillmentDc || !customerDc) return false;
  return normalizeDcRegion(fulfillmentDc) !== normalizeDcRegion(customerDc);
}

/**
 * Normalize DC code to region.
 * JHB, JHB2, JHB3 → 'JHB'
 * CPT, CPT2 → 'CPT'
 * DBN → 'DBN'
 */
function normalizeDcRegion(dc: string): string {
  const upper = dc.toUpperCase().trim();
  if (upper.startsWith('JHB')) return 'JHB';
  if (upper.startsWith('CPT')) return 'CPT';
  if (upper.startsWith('DBN')) return 'DBN';
  return upper;
}
