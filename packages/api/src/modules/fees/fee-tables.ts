/**
 * Takealot Fee Lookup Tables
 *
 * All amounts in cents, excluding VAT unless noted.
 *
 * IMPORTANT: These tables encode the EXACT rules from Takealot pricing schedules.
 * Do NOT modify without verifying against the latest Takealot documentation.
 *
 * VERSION HISTORY
 * ──────────────────────────────────────────────────────────────────────────────
 * v1 — July 2025 Pricing Schedule (effectiveTo: 2026-03-31)
 * v2 — April 2026 Pricing Schedule (effectiveFrom: 2026-04-01)
 *        • Fulfilment fees increased across all size/weight bands
 *        • Standard Light rate now has 4 category groups (unchanged structure)
 *        • Fee applies on SHIP DATE, not sale date
 * ──────────────────────────────────────────────────────────────────────────────
 */

// =============================================================================
// SUCCESS FEES — Category-based percentage of VAT-inclusive selling price
// (unchanged in April 2026 update)
// =============================================================================
// We use the MAX rate per category as a conservative default.

export interface SuccessFeeRate {
  category: string;
  minPct: number;
  maxPct: number;
  defaultPct: number;
}

export const SUCCESS_FEE_RATES: SuccessFeeRate[] = [
  { category: 'Baby', minPct: 12.0, maxPct: 15.0, defaultPct: 15.0 },
  { category: 'Beauty', minPct: 10.0, maxPct: 15.0, defaultPct: 12.0 },
  { category: 'Books', minPct: 14.0, maxPct: 14.0, defaultPct: 14.0 },
  { category: 'Cameras', minPct: 4.0, maxPct: 12.0, defaultPct: 8.0 },
  { category: 'Camping & Outdoor', minPct: 8.0, maxPct: 15.0, defaultPct: 12.0 },
  { category: 'Clothing & Footwear', minPct: 10.0, maxPct: 18.0, defaultPct: 15.0 },
  { category: 'Computer Components', minPct: 6.0, maxPct: 9.0, defaultPct: 8.0 },
  { category: 'Computers & Laptops', minPct: 5.0, maxPct: 9.0, defaultPct: 7.0 },
  { category: 'DIY & Automotive', minPct: 10.0, maxPct: 12.0, defaultPct: 12.0 },
  { category: 'Electronic Accessories', minPct: 10.0, maxPct: 14.0, defaultPct: 12.0 },
  { category: 'Games', minPct: 5.5, maxPct: 15.0, defaultPct: 10.0 },
  { category: 'Garden, Pool & Patio', minPct: 12.0, maxPct: 14.0, defaultPct: 14.0 },
  { category: 'Health', minPct: 10.0, maxPct: 12.0, defaultPct: 12.0 },
  { category: 'Homeware', minPct: 15.0, maxPct: 15.0, defaultPct: 15.0 },
  { category: 'Large Appliances', minPct: 8.0, maxPct: 10.0, defaultPct: 10.0 },
  { category: 'Liquor', minPct: 7.0, maxPct: 10.0, defaultPct: 8.0 },
  { category: 'Luggage & Travel', minPct: 15.0, maxPct: 15.0, defaultPct: 15.0 },
  { category: 'Mobile', minPct: 7.5, maxPct: 7.5, defaultPct: 7.5 },
  { category: 'Music & DVD', minPct: 10.0, maxPct: 15.0, defaultPct: 12.0 },
  { category: 'Musical Instruments', minPct: 8.0, maxPct: 12.0, defaultPct: 10.0 },
  { category: 'Non-Perishable', minPct: 8.0, maxPct: 8.0, defaultPct: 8.0 },
  { category: 'Office', minPct: 7.0, maxPct: 12.0, defaultPct: 10.0 },
  { category: 'Office Furniture', minPct: 10.0, maxPct: 10.0, defaultPct: 10.0 },
  { category: 'Pets', minPct: 10.0, maxPct: 10.0, defaultPct: 10.0 },
  { category: 'Small Appliances', minPct: 10.0, maxPct: 12.0, defaultPct: 12.0 },
  { category: 'Smart Home & Connected Living', minPct: 5.0, maxPct: 14.0, defaultPct: 10.0 },
  { category: 'Sport', minPct: 12.0, maxPct: 15.0, defaultPct: 12.0 },
  { category: 'Stationery', minPct: 10.0, maxPct: 14.0, defaultPct: 12.0 },
  { category: 'Toys', minPct: 12.0, maxPct: 12.0, defaultPct: 12.0 },
  { category: 'TV & Audio', minPct: 5.5, maxPct: 12.0, defaultPct: 8.0 },
];

export const DEFAULT_SUCCESS_FEE_PCT = 12.0;

// =============================================================================
// FULFILMENT FEES — Per item shipped, by size tier × weight tier × category
// =============================================================================

export type FulfilmentWeightTier = 'Light' | 'Heavy' | 'HeavyPlus' | 'VeryHeavy';
export type FulfilmentSizeTier =
  | 'Standard_NonPerishable' // standard_a: Non-Perishable, Household Cleaning, Liquor
  | 'Standard_FMCG'         // standard_b: Stationery, Pets, Baby, Consumer Beauty, Health FMCG, Bathroom
  | 'Standard_General'      // standard_c: All other Standard categories
  | 'Standard_Electronics'  // standard_d: Mobile, Laptops, Appliances, TV, Audio, Smart Home, etc.
  | 'Large'                 // volume > 35,000 and ≤ 130,000 cm³
  | 'Oversize'              // volume > 130,000 and ≤ 200,000 cm³
  | 'Bulky'                 // volume > 200,000 and ≤ 545,000 cm³
  | 'ExtraBulky';           // volume > 545,000 cm³

// ── V1: July 2025 Pricing Schedule ───────────────────────────────────────────
// Applies to orders shipped BEFORE 2026-04-01.
export const FULFILMENT_FEE_MATRIX_V1: Record<FulfilmentSizeTier, Record<FulfilmentWeightTier, number>> = {
  Standard_NonPerishable: { Light: 2000, Heavy: 4700, HeavyPlus: 10000, VeryHeavy: 10000 },
  Standard_FMCG:          { Light: 3000, Heavy: 4700, HeavyPlus: 10000, VeryHeavy: 10000 },
  Standard_General:       { Light: 4200, Heavy: 4700, HeavyPlus: 10000, VeryHeavy: 10000 },
  Standard_Electronics:   { Light: 5500, Heavy: 5500, HeavyPlus: 10000, VeryHeavy: 10000 },
  Large:                  { Light: 5500, Heavy: 6000, HeavyPlus: 10000, VeryHeavy: 11000 },
  Oversize:               { Light: 10000, Heavy: 12000, HeavyPlus: 15000, VeryHeavy: 11000 },
  Bulky:                  { Light: 10000, Heavy: 13500, HeavyPlus: 15000, VeryHeavy: 16000 },
  ExtraBulky:             { Light: 25000, Heavy: 25000, HeavyPlus: 30000, VeryHeavy: 36000 },
};

// ── V2: April 2026 Pricing Schedule ──────────────────────────────────────────
// Applies to orders shipped ON OR AFTER 2026-04-01.
// Source: Takealot Seller Communication + Fulfilment Fee Schedule, March 2026
// All amounts in CENTS, excl. VAT.
//
// category_group (Takealot label) → FulfilmentSizeTier mapping:
//   standard_a → Standard_NonPerishable
//   standard_b → Standard_FMCG
//   standard_c → Standard_General
//   standard_d → Standard_Electronics
export const FULFILMENT_FEE_MATRIX_V2: Record<FulfilmentSizeTier, Record<FulfilmentWeightTier, number>> = {
  Standard_NonPerishable: { Light: 2200, Heavy: 5200, HeavyPlus: 10700, VeryHeavy: 10700 },
  Standard_FMCG:          { Light: 3300, Heavy: 5200, HeavyPlus: 10700, VeryHeavy: 10700 },
  Standard_General:       { Light: 4500, Heavy: 5200, HeavyPlus: 10700, VeryHeavy: 10700 },
  Standard_Electronics:   { Light: 6000, Heavy: 6000, HeavyPlus: 10700, VeryHeavy: 10700 },
  Large:                  { Light: 6000, Heavy: 6500, HeavyPlus: 10700, VeryHeavy: 11800 },
  Oversize:               { Light: 10700, Heavy: 13000, HeavyPlus: 16000, VeryHeavy: 16000 },
  Bulky:                  { Light: 10700, Heavy: 14500, HeavyPlus: 16000, VeryHeavy: 17200 },
  ExtraBulky:             { Light: 27000, Heavy: 27000, HeavyPlus: 32000, VeryHeavy: 39000 },
};

/**
 * Effective date for v2 rates.
 * Fee applies on SHIP DATE, not sale date.
 * Lead-time orders sold before 1 April but shipped on/after 1 April use v2.
 */
export const FULFILMENT_V2_EFFECTIVE_DATE = new Date('2026-04-01T00:00:00.000Z');

/**
 * Returns the correct fulfilment fee matrix for the given ship date.
 *
 * Rules:
 *   shipDate ≥ 2026-04-01  →  V2 (April 2026 rates)
 *   shipDate < 2026-04-01  →  V1 (July 2025 rates)
 *   shipDate null/undefined →  V2 (default to latest; safe for new ingestion)
 */
export function getFulfilmentMatrix(
  shipDate: Date | string | null | undefined
): Record<FulfilmentSizeTier, Record<FulfilmentWeightTier, number>> {
  if (!shipDate) return FULFILMENT_FEE_MATRIX_V2;
  const d = shipDate instanceof Date ? shipDate : new Date(shipDate);
  return d >= FULFILMENT_V2_EFFECTIVE_DATE ? FULFILMENT_FEE_MATRIX_V2 : FULFILMENT_FEE_MATRIX_V1;
}

/**
 * Returns the calculation version number (1 or 2) for a given ship date.
 * Stored on calculated_fees rows so historical calculations can be identified.
 */
export function getFulfilmentVersion(shipDate: Date | string | null | undefined): number {
  if (!shipDate) return 2;
  const d = shipDate instanceof Date ? shipDate : new Date(shipDate);
  return d >= FULFILMENT_V2_EFFECTIVE_DATE ? 2 : 1;
}

// =============================================================================
// CATEGORY → FULFILMENT STANDARD SUB-TIER MAPPING
// =============================================================================
// Updated for April 2026: added new standard_d category aliases.

export const FULFILMENT_CATEGORY_MAP: Record<string, FulfilmentSizeTier> = {
  // ── standard_a: Non-Perishable / Household / Liquor ──────────────────────
  'Non-Perishable': 'Standard_NonPerishable',
  'Household Cleaning': 'Standard_NonPerishable',
  'Liquor': 'Standard_NonPerishable',

  // ── standard_b: FMCG / Personal Care / Baby ──────────────────────────────
  'Stationery': 'Standard_FMCG',
  'Pets': 'Standard_FMCG',
  'Baby': 'Standard_FMCG',
  'Beauty': 'Standard_FMCG',
  'Consumer Beauty': 'Standard_FMCG',   // April 2026 alias
  'Health': 'Standard_FMCG',
  'Health FMCG': 'Standard_FMCG',       // April 2026 alias
  'Bathroom': 'Standard_FMCG',

  // ── standard_d: Electronics / Appliances / Smart Home ────────────────────
  'Mobile': 'Standard_Electronics',
  'Laptops': 'Standard_Electronics',                    // April 2026 alias
  'Computers & Laptops': 'Standard_Electronics',
  'Small Appliances': 'Standard_Electronics',
  'Small Household Appliances': 'Standard_Electronics', // April 2026 alias
  'Small Kitchen Appliances': 'Standard_Electronics',   // April 2026 new
  'Large Appliances': 'Standard_Electronics',
  'TV & Audio': 'Standard_Electronics',
  'TV': 'Standard_Electronics',                         // April 2026 alias
  'Audio': 'Standard_Electronics',                      // April 2026 alias
  'Video': 'Standard_Electronics',                      // April 2026 new
  'Smart Home & Connected Living': 'Standard_Electronics',
  'Smart Home & Appliances': 'Standard_Electronics',    // April 2026 alias
  'Smart Audio Technology': 'Standard_Electronics',     // April 2026 new
  'Smart Energy Solutions': 'Standard_Electronics',     // April 2026 new
  'Certified Pre-Owned Electronics': 'Standard_Electronics', // April 2026 new

  // Everything else → standard_c (Standard_General) — handled as default in getCategoryFulfilmentTier()
};

// =============================================================================
// STORAGE FEES — Per item/month, by size tier × stock days cover
// (unchanged in April 2026 update)
// =============================================================================
// IMPORTANT: Storage size tiers use DIFFERENT volume thresholds than fulfilment.

export interface StorageTier {
  name: string;
  maxVolumeCm3: number;
  overstockedFeeCents: number;
}

export const STORAGE_TIERS: StorageTier[] = [
  { name: 'Small', maxVolumeCm3: 60_000, overstockedFeeCents: 200 },
  { name: 'Standard', maxVolumeCm3: 130_000, overstockedFeeCents: 600 },
  { name: 'Large', maxVolumeCm3: 200_000, overstockedFeeCents: 1250 },
  { name: 'Extra Large', maxVolumeCm3: 275_000, overstockedFeeCents: 2250 },
  { name: 'Oversize', maxVolumeCm3: 545_000, overstockedFeeCents: 7500 },
  { name: 'Bulky', maxVolumeCm3: 775_000, overstockedFeeCents: 12500 },
  { name: 'Extra Bulky', maxVolumeCm3: Infinity, overstockedFeeCents: 22500 },
];

export const STORAGE_GRACE_PERIOD_DAYS = 35;

// =============================================================================
// IBT PENALTY FEES — Per unit, by size tier × weight tier
// (unchanged in April 2026 update)
// =============================================================================
// IMPORTANT: IBT size tiers use DIFFERENT volume thresholds than fulfilment AND storage.

export type IbtSizeTier = 'Standard' | 'Large' | 'Oversize' | 'Bulky' | 'ExtraBulky';

export const IBT_PENALTY_MATRIX: Record<IbtSizeTier, Record<FulfilmentWeightTier, number>> = {
  Standard:   { Light: 1800, Heavy: 7500, HeavyPlus: 14500, VeryHeavy: 18000 },
  Large:      { Light: 7500, Heavy: 11000, HeavyPlus: 14500, VeryHeavy: 18000 },
  Oversize:   { Light: 14500, Heavy: 14500, HeavyPlus: 16500, VeryHeavy: 18000 },
  Bulky:      { Light: 18000, Heavy: 18000, HeavyPlus: 18000, VeryHeavy: 18000 },
  ExtraBulky: { Light: 22000, Heavy: 22000, HeavyPlus: 22000, VeryHeavy: 22000 },
};

export const IBT_SIZE_THRESHOLDS: Array<{ tier: IbtSizeTier; maxVolumeCm3: number }> = [
  { tier: 'Standard', maxVolumeCm3: 35_000 },
  { tier: 'Large', maxVolumeCm3: 130_000 },
  { tier: 'Oversize', maxVolumeCm3: 200_000 },
  { tier: 'Bulky', maxVolumeCm3: 545_000 },
  { tier: 'ExtraBulky', maxVolumeCm3: Infinity },
];

// =============================================================================
// OTHER FEES
// =============================================================================

export const CANCELLATION_FEE_CENTS = 5000;
export const REMOVAL_ORDER_FEE_CENTS = 1000;
export const RELABEL_FEE_CENTS = 2000;
export const REPORT_ADMIN_FEE_CENTS = 20000;

// =============================================================================
// VAT
// =============================================================================

export const VAT_RATE = 0.15;
