/**
 * Takealot Fee Lookup Tables
 *
 * Source: Takealot Marketplace Pricing Schedule (July 2025)
 * All amounts in cents, excluding VAT unless noted.
 *
 * IMPORTANT: These tables encode the EXACT rules from the pricing schedule.
 * Do NOT modify without verifying against the latest Takealot documentation.
 *
 * The fulfilment fees have 4 category-based "Standard" sub-tiers, each with
 * different rates. Storage and IBT use their own separate size tier definitions.
 */

// =============================================================================
// SUCCESS FEES — Category-based percentage of VAT-inclusive selling price
// =============================================================================
// The PDF shows ranges (min-max) per top-level category.
// We use the MAX rate per category as a conservative default.
// Sellers can override per-product if they know the exact subcategory rate.

export interface SuccessFeeRate {
  category: string;
  minPct: number;
  maxPct: number;
  defaultPct: number; // Used when subcategory is unknown
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

// Default success fee for unknown categories
export const DEFAULT_SUCCESS_FEE_PCT = 12.0;

// =============================================================================
// FULFILMENT FEES — Per item shipped, by size tier x weight tier x category
// =============================================================================
// All amounts in CENTS, excluding VAT.
//
// Standard-sized items (volume <= 35,000 cm3) have 4 category-based sub-tiers.
// Larger items use universal size tiers regardless of category.

export type FulfilmentWeightTier = 'Light' | 'Heavy' | 'HeavyPlus' | 'VeryHeavy';
export type FulfilmentSizeTier =
  | 'Standard_NonPerishable' // Tier 1: Non-Perishable, Household Cleaning, Liquor
  | 'Standard_FMCG'         // Tier 2: Stationery, Pets, Baby, Beauty, Health, Bathroom
  | 'Standard_General'      // Tier 3: All other categories
  | 'Standard_Electronics'  // Tier 4: Mobile, Laptops, Appliances, TV, Audio, Smart Home
  | 'Large'                 // volume > 35,000 and <= 130,000
  | 'Oversize'              // volume > 130,000 and <= 200,000
  | 'Bulky'                 // volume > 200,000 and <= 545,000
  | 'ExtraBulky';           // volume > 545,000

// Fee matrix: [SizeTier][WeightTier] → cents excl. VAT
export const FULFILMENT_FEE_MATRIX: Record<FulfilmentSizeTier, Record<FulfilmentWeightTier, number>> = {
  Standard_NonPerishable: { Light: 2000, Heavy: 4700, HeavyPlus: 10000, VeryHeavy: 10000 },
  Standard_FMCG:          { Light: 3000, Heavy: 4700, HeavyPlus: 10000, VeryHeavy: 10000 },
  Standard_General:       { Light: 4200, Heavy: 4700, HeavyPlus: 10000, VeryHeavy: 10000 },
  Standard_Electronics:   { Light: 5500, Heavy: 5500, HeavyPlus: 10000, VeryHeavy: 10000 },
  Large:                  { Light: 5500, Heavy: 6000, HeavyPlus: 10000, VeryHeavy: 11000 },
  Oversize:               { Light: 10000, Heavy: 12000, HeavyPlus: 15000, VeryHeavy: 11000 },
  Bulky:                  { Light: 10000, Heavy: 13500, HeavyPlus: 15000, VeryHeavy: 16000 },
  ExtraBulky:             { Light: 25000, Heavy: 25000, HeavyPlus: 30000, VeryHeavy: 36000 },
};

// Categories → Fulfilment Standard sub-tier mapping
export const FULFILMENT_CATEGORY_MAP: Record<string, FulfilmentSizeTier> = {
  // Tier 1: Non-Perishable / Household / Liquor
  'Non-Perishable': 'Standard_NonPerishable',
  'Household Cleaning': 'Standard_NonPerishable',
  'Liquor': 'Standard_NonPerishable',
  // Tier 2: FMCG / Personal Care
  'Stationery': 'Standard_FMCG',
  'Pets': 'Standard_FMCG',
  'Baby': 'Standard_FMCG',
  'Beauty': 'Standard_FMCG',
  'Health': 'Standard_FMCG',
  'Bathroom': 'Standard_FMCG',
  // Tier 4: Electronics / Appliances
  'Mobile': 'Standard_Electronics',
  'Computers & Laptops': 'Standard_Electronics',
  'Small Appliances': 'Standard_Electronics',
  'Large Appliances': 'Standard_Electronics',
  'TV & Audio': 'Standard_Electronics',
  'Smart Home & Connected Living': 'Standard_Electronics',
  // Everything else → Tier 3 (Standard_General) — handled as default
};

// =============================================================================
// STORAGE FEES — Per item/month, by size tier x stock days cover
// =============================================================================
// All amounts in CENTS, excluding VAT.
// 0-35 days cover = FREE. 35+ days cover = overstocked rate.
//
// IMPORTANT: Storage size tiers use DIFFERENT volume thresholds than fulfilment.

export interface StorageTier {
  name: string;
  maxVolumeCm3: number; // Upper bound (inclusive)
  overstockedFeeCents: number; // Per item, per month, for 35+ days cover
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
// IBT PENALTY FEES — Per unit, by size tier x weight tier
// =============================================================================
// All amounts in CENTS, excluding VAT.
//
// IMPORTANT: IBT size tiers use DIFFERENT volume thresholds than fulfilment AND storage.

export type IbtSizeTier = 'Standard' | 'Large' | 'Oversize' | 'Bulky' | 'ExtraBulky';

export const IBT_PENALTY_MATRIX: Record<IbtSizeTier, Record<FulfilmentWeightTier, number>> = {
  Standard:   { Light: 1800, Heavy: 7500, HeavyPlus: 14500, VeryHeavy: 18000 },
  Large:      { Light: 7500, Heavy: 11000, HeavyPlus: 14500, VeryHeavy: 18000 },
  Oversize:   { Light: 14500, Heavy: 14500, HeavyPlus: 16500, VeryHeavy: 18000 },
  Bulky:      { Light: 18000, Heavy: 18000, HeavyPlus: 18000, VeryHeavy: 18000 },
  ExtraBulky: { Light: 22000, Heavy: 22000, HeavyPlus: 22000, VeryHeavy: 22000 },
};

// IBT size tier volume boundaries
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

export const CANCELLATION_FEE_CENTS = 5000; // R50 per cancelled leadtime order
export const REMOVAL_ORDER_FEE_CENTS = 1000; // R10 per unit
export const RELABEL_FEE_CENTS = 2000; // R20 per label per unit
export const REPORT_ADMIN_FEE_CENTS = 20000; // R200 per late invoice

// =============================================================================
// VAT
// =============================================================================

export const VAT_RATE = 0.15;
