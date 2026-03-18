/**
 * Fee Calculator Unit Tests
 *
 * Validates all fee types against known values from the
 * Takealot Pricing Schedule (July 2025).
 */

import { describe, it, expect } from 'vitest';
import {
  calculateFees,
  calculateProfit,
  getSuccessFeeRate,
  classifyFulfilmentWeight,
  classifyFulfilmentSize,
  classifyIbtSize,
  classifyStorageSize,
  detectIbt,
  type FeeOfferInput,
  type FeeOrderInput,
} from '../fee-calculator.js';

// =============================================================================
// Success Fee Tests
// =============================================================================

describe('getSuccessFeeRate', () => {
  it('returns correct rate for known categories', () => {
    expect(getSuccessFeeRate('Books')).toBe(14.0);
    expect(getSuccessFeeRate('Mobile')).toBe(7.5);
    expect(getSuccessFeeRate('Homeware')).toBe(15.0);
    expect(getSuccessFeeRate('Toys')).toBe(12.0);
    expect(getSuccessFeeRate('Non-Perishable')).toBe(8.0);
    expect(getSuccessFeeRate('Pets')).toBe(10.0);
  });

  it('returns default rate for unknown categories', () => {
    expect(getSuccessFeeRate('Unknown Category')).toBe(12.0);
    expect(getSuccessFeeRate('')).toBe(12.0);
  });

  it('returns default rate for null category', () => {
    expect(getSuccessFeeRate(null)).toBe(12.0);
  });

  it('matches case-insensitively', () => {
    expect(getSuccessFeeRate('books')).toBe(14.0);
    expect(getSuccessFeeRate('MOBILE')).toBe(7.5);
    expect(getSuccessFeeRate('tv & audio')).toBe(8.0);
  });
});

// =============================================================================
// Weight Tier Classification
// =============================================================================

describe('classifyFulfilmentWeight', () => {
  it('classifies Light (<= 7kg)', () => {
    expect(classifyFulfilmentWeight(0)).toBe('Light');
    expect(classifyFulfilmentWeight(3500)).toBe('Light');
    expect(classifyFulfilmentWeight(7000)).toBe('Light');
  });

  it('classifies Heavy (> 7kg, <= 25kg)', () => {
    expect(classifyFulfilmentWeight(7001)).toBe('Heavy');
    expect(classifyFulfilmentWeight(15000)).toBe('Heavy');
    expect(classifyFulfilmentWeight(25000)).toBe('Heavy');
  });

  it('classifies Heavy Plus (> 25kg, < 40kg)', () => {
    expect(classifyFulfilmentWeight(25001)).toBe('HeavyPlus');
    expect(classifyFulfilmentWeight(39999)).toBe('HeavyPlus');
  });

  it('classifies Very Heavy (>= 40kg)', () => {
    expect(classifyFulfilmentWeight(40000)).toBe('VeryHeavy');
    expect(classifyFulfilmentWeight(70000)).toBe('VeryHeavy');
  });

  it('defaults to Light when null', () => {
    expect(classifyFulfilmentWeight(null)).toBe('Light');
  });
});

// =============================================================================
// Fulfilment Size Tier Classification
// =============================================================================

describe('classifyFulfilmentSize', () => {
  it('classifies Standard items by category', () => {
    expect(classifyFulfilmentSize(10000, 'Non-Perishable')).toBe('Standard_NonPerishable');
    expect(classifyFulfilmentSize(10000, 'Liquor')).toBe('Standard_NonPerishable');
    expect(classifyFulfilmentSize(10000, 'Pets')).toBe('Standard_FMCG');
    expect(classifyFulfilmentSize(10000, 'Baby')).toBe('Standard_FMCG');
    expect(classifyFulfilmentSize(10000, 'Mobile')).toBe('Standard_Electronics');
    expect(classifyFulfilmentSize(10000, 'TV & Audio')).toBe('Standard_Electronics');
    expect(classifyFulfilmentSize(10000, 'Toys')).toBe('Standard_General');
    expect(classifyFulfilmentSize(10000, 'Books')).toBe('Standard_General');
  });

  it('classifies Large (35,001 - 130,000 cm3)', () => {
    expect(classifyFulfilmentSize(35001, 'Any')).toBe('Large');
    expect(classifyFulfilmentSize(130000, 'Any')).toBe('Large');
  });

  it('classifies Oversize (130,001 - 200,000 cm3)', () => {
    expect(classifyFulfilmentSize(130001, 'Any')).toBe('Oversize');
    expect(classifyFulfilmentSize(200000, 'Any')).toBe('Oversize');
  });

  it('classifies Bulky (200,001 - 545,000 cm3)', () => {
    expect(classifyFulfilmentSize(200001, 'Any')).toBe('Bulky');
    expect(classifyFulfilmentSize(545000, 'Any')).toBe('Bulky');
  });

  it('classifies Extra Bulky (> 545,000 cm3)', () => {
    expect(classifyFulfilmentSize(545001, 'Any')).toBe('ExtraBulky');
    expect(classifyFulfilmentSize(1000000, 'Any')).toBe('ExtraBulky');
  });

  it('defaults to Standard_General when dimensions unknown', () => {
    expect(classifyFulfilmentSize(null, null)).toBe('Standard_General');
    expect(classifyFulfilmentSize(null, 'Unknown')).toBe('Standard_General');
  });

  // Category takes precedence for Standard, volume for larger items
  it('ignores category for non-Standard items', () => {
    expect(classifyFulfilmentSize(50000, 'Mobile')).toBe('Large');
    expect(classifyFulfilmentSize(300000, 'Non-Perishable')).toBe('Bulky');
  });
});

// =============================================================================
// IBT Detection
// =============================================================================

describe('detectIbt', () => {
  it('detects IBT when DCs differ', () => {
    expect(detectIbt('JHB', 'CPT')).toBe(true);
    expect(detectIbt('CPT', 'JHB')).toBe(true);
    expect(detectIbt('JHB', 'DBN')).toBe(true);
  });

  it('no IBT when DCs match (including sub-DCs)', () => {
    expect(detectIbt('JHB', 'JHB')).toBe(false);
    expect(detectIbt('JHB2', 'JHB3')).toBe(false); // Same region
    expect(detectIbt('CPT', 'CPT2')).toBe(false);
  });

  it('returns false when DCs are null', () => {
    expect(detectIbt(null, 'CPT')).toBe(false);
    expect(detectIbt('JHB', null)).toBe(false);
    expect(detectIbt(null, null)).toBe(false);
  });
});

// =============================================================================
// Storage Tier Classification
// =============================================================================

describe('classifyStorageSize', () => {
  it('classifies Small (0 - 60,000 cm3)', () => {
    expect(classifyStorageSize(30000).name).toBe('Small');
    expect(classifyStorageSize(60000).name).toBe('Small');
  });

  it('classifies Standard (60,001 - 130,000 cm3)', () => {
    expect(classifyStorageSize(60001).name).toBe('Standard');
    expect(classifyStorageSize(130000).name).toBe('Standard');
  });

  it('classifies Extra Bulky (> 775,000 cm3)', () => {
    expect(classifyStorageSize(800000).name).toBe('Extra Bulky');
    expect(classifyStorageSize(800000).overstockedFeeCents).toBe(22500);
  });

  it('returns correct overstocked fee', () => {
    expect(classifyStorageSize(50000).overstockedFeeCents).toBe(200);   // R2
    expect(classifyStorageSize(100000).overstockedFeeCents).toBe(600);  // R6
    expect(classifyStorageSize(150000).overstockedFeeCents).toBe(1250); // R12.50
  });

  it('defaults to Small when null', () => {
    expect(classifyStorageSize(null).name).toBe('Small');
  });
});

// =============================================================================
// Full Fee Calculation (calculateFees)
// =============================================================================

describe('calculateFees', () => {
  const standardOffer: FeeOfferInput = {
    sellingPriceCents: 19900, // R199 incl. VAT
    category: 'Books',
    volumeCm3: 2000,  // Small standard
    weightGrams: 500, // Light
    stockCoverDays: 20, // Under 35 days — no storage fee
  };

  const standardOrder: FeeOrderInput = {
    quantity: 1,
    fulfillmentDc: 'JHB',
    customerDc: 'JHB', // Same region — no IBT
    saleStatus: 'Shipped to Customer',
  };

  it('calculates success fee correctly (Books @ 14%)', () => {
    const result = calculateFees(standardOffer, standardOrder);
    // 14% of R199.00 (19900 cents) = 2786 cents = R27.86
    expect(result.successFeePerUnitCents).toBe(2786);
    expect(result.meta.successFeeRatePct).toBe(14.0);
  });

  it('calculates fulfilment fee for Standard General Light', () => {
    const result = calculateFees(standardOffer, standardOrder);
    // Books → Standard_General, Light → R42 = 4200 cents
    expect(result.fulfilmentFeePerUnitCents).toBe(4200);
    expect(result.meta.fulfilmentSizeTier).toBe('Standard_General');
    expect(result.meta.fulfilmentWeightTier).toBe('Light');
  });

  it('zero IBT penalty when same DC region', () => {
    const result = calculateFees(standardOffer, standardOrder);
    expect(result.ibtPenaltyPerUnitCents).toBe(0);
    expect(result.meta.isIbt).toBe(false);
  });

  it('calculates IBT penalty when DCs differ', () => {
    const ibtOrder: FeeOrderInput = {
      ...standardOrder,
      fulfillmentDc: 'JHB',
      customerDc: 'CPT', // Different region → IBT
    };
    const result = calculateFees(standardOffer, ibtOrder);
    // Standard size, Light weight → R18 = 1800 cents
    expect(result.ibtPenaltyPerUnitCents).toBe(1800);
    expect(result.meta.isIbt).toBe(true);
    expect(result.meta.ibtSizeTier).toBe('Standard');
  });

  it('zero storage fee when stock cover is under 35 days', () => {
    const result = calculateFees(standardOffer, standardOrder);
    expect(result.storageFeeAllocationPerUnitCents).toBe(0);
    expect(result.meta.isOverstocked).toBe(false);
  });

  it('calculates storage fee when overstocked (> 35 days)', () => {
    const overstockedOffer: FeeOfferInput = {
      ...standardOffer,
      stockCoverDays: 40, // Overstocked
    };
    const result = calculateFees(overstockedOffer, standardOrder);
    // volume 2000 cm3 → Small → R2 = 200 cents
    expect(result.storageFeeAllocationPerUnitCents).toBe(200);
    expect(result.meta.isOverstocked).toBe(true);
    expect(result.meta.storageTierName).toBe('Small');
  });

  it('scales fees by quantity', () => {
    const multiOrder: FeeOrderInput = { ...standardOrder, quantity: 5 };
    const result = calculateFees(standardOffer, multiOrder);
    expect(result.successFeeTotalCents).toBe(2786 * 5);
    expect(result.fulfilmentFeeTotalCents).toBe(4200 * 5);
    expect(result.totalFeesExclVatCents).toBe((2786 + 4200) * 5);
  });

  it('adds VAT at 15% on all fees', () => {
    const result = calculateFees(standardOffer, standardOrder);
    const expectedExclVat = 2786 + 4200; // Success + fulfilment
    expect(result.totalFeesExclVatCents).toBe(expectedExclVat);
    expect(result.vatOnFeesCents).toBe(Math.round(expectedExclVat * 0.15));
    expect(result.totalFeesInclVatCents).toBe(expectedExclVat + result.vatOnFeesCents);
  });

  it('handles category-specific fulfilment for Non-Perishable', () => {
    const npOffer: FeeOfferInput = {
      ...standardOffer,
      category: 'Non-Perishable',
    };
    const result = calculateFees(npOffer, standardOrder);
    // Non-Perishable, Light → R20 = 2000 cents
    expect(result.fulfilmentFeePerUnitCents).toBe(2000);
    expect(result.meta.fulfilmentSizeTier).toBe('Standard_NonPerishable');
  });

  it('handles Electronics fulfilment tier', () => {
    const elecOffer: FeeOfferInput = {
      ...standardOffer,
      category: 'Mobile',
    };
    const result = calculateFees(elecOffer, standardOrder);
    // Mobile, Light → R55 = 5500 cents
    expect(result.fulfilmentFeePerUnitCents).toBe(5500);
    expect(result.meta.fulfilmentSizeTier).toBe('Standard_Electronics');
    // Mobile success fee = 7.5%
    expect(result.meta.successFeeRatePct).toBe(7.5);
  });

  it('handles Extra Bulky, Very Heavy item', () => {
    const bigOffer: FeeOfferInput = {
      sellingPriceCents: 999900, // R9,999 incl. VAT
      category: 'Large Appliances',
      volumeCm3: 600_000, // Extra Bulky
      weightGrams: 50_000, // Very Heavy
      stockCoverDays: null,
    };
    const result = calculateFees(bigOffer, standardOrder);
    // Extra Bulky, Very Heavy → R360 = 36000 cents
    expect(result.fulfilmentFeePerUnitCents).toBe(36000);
    expect(result.meta.fulfilmentSizeTier).toBe('ExtraBulky');
    expect(result.meta.fulfilmentWeightTier).toBe('VeryHeavy');
    // Large Appliances success fee = 10%
    expect(result.meta.successFeeRatePct).toBe(10.0);
  });

  it('handles missing dimensions gracefully', () => {
    const noDimsOffer: FeeOfferInput = {
      sellingPriceCents: 10000,
      category: null,
      volumeCm3: null,
      weightGrams: null,
      stockCoverDays: null,
    };
    const result = calculateFees(noDimsOffer, standardOrder);
    // Defaults: Standard_General, Light → R42 = 4200 cents
    expect(result.fulfilmentFeePerUnitCents).toBe(4200);
    expect(result.meta.fulfilmentSizeTier).toBe('Standard_General');
    expect(result.meta.fulfilmentWeightTier).toBe('Light');
    expect(result.meta.hasDimensions).toBe(false);
    // Default success fee 12%
    expect(result.meta.successFeeRatePct).toBe(12.0);
  });
});

// =============================================================================
// Profit Calculation (calculateProfit)
// =============================================================================

describe('calculateProfit', () => {
  it('calculates profit correctly for a profitable item', () => {
    const offer: FeeOfferInput = {
      sellingPriceCents: 19900, // R199
      category: 'Toys',
      volumeCm3: 5000,
      weightGrams: 1000,
      stockCoverDays: 20,
    };
    const order: FeeOrderInput = {
      quantity: 1,
      fulfillmentDc: 'JHB',
      customerDc: 'JHB',
      saleStatus: 'Shipped to Customer',
    };

    const fees = calculateFees(offer, order);

    const profit = calculateProfit({
      unitSellingPriceCents: 19900,
      quantity: 1,
      cogsPerUnitCents: 7500, // R75 COGS
      inboundCostPerUnitCents: 320, // R3.20
      fees,
      cogsIsEstimated: false,
    });

    // Revenue = R199.00
    expect(profit.revenueCents).toBe(19900);
    // COGS = R75.00
    expect(profit.totalCogsCents).toBe(7500);
    // Inbound = R3.20
    expect(profit.totalInboundCostCents).toBe(320);
    // Fees > 0
    expect(profit.totalFeesCents).toBeGreaterThan(0);
    // Profit = Revenue - COGS - Inbound - Fees
    expect(profit.netProfitCents).toBe(
      19900 - 7500 - 320 - profit.totalFeesCents
    );
    expect(profit.isProfitable).toBe(true);
    expect(profit.cogsIsEstimated).toBe(false);
  });

  it('identifies a loss-making item', () => {
    const offer: FeeOfferInput = {
      sellingPriceCents: 5000, // R50 — low price
      category: 'Clothing & Footwear', // High success fee (15%)
      volumeCm3: 3000,
      weightGrams: 800,
      stockCoverDays: 20,
    };
    const order: FeeOrderInput = {
      quantity: 1,
      fulfillmentDc: 'JHB',
      customerDc: 'CPT', // IBT!
      saleStatus: 'Shipped to Customer',
    };

    const fees = calculateFees(offer, order);

    const profit = calculateProfit({
      unitSellingPriceCents: 5000,
      quantity: 1,
      cogsPerUnitCents: 3000, // R30 COGS — high relative to selling price
      inboundCostPerUnitCents: 500,
      fees,
      cogsIsEstimated: false,
    });

    // With R50 selling price, 15% success fee, R42 fulfilment, R18 IBT, R30 COGS, R5 inbound
    // This should be a loss maker
    expect(profit.isProfitable).toBe(false);
    expect(profit.netProfitCents).toBeLessThan(0);
  });

  it('handles multi-unit orders', () => {
    const offer: FeeOfferInput = {
      sellingPriceCents: 10000, // R100 per unit
      category: 'Books',
      volumeCm3: 2000,
      weightGrams: 500,
      stockCoverDays: 10,
    };
    const order: FeeOrderInput = {
      quantity: 3,
      fulfillmentDc: 'CPT',
      customerDc: 'CPT',
      saleStatus: 'Shipped to Customer',
    };

    const fees = calculateFees(offer, order);

    const profit = calculateProfit({
      unitSellingPriceCents: 10000,
      quantity: 3,
      cogsPerUnitCents: 4000,
      inboundCostPerUnitCents: 200,
      fees,
      cogsIsEstimated: false,
    });

    expect(profit.revenueCents).toBe(30000); // R100 × 3
    expect(profit.totalCogsCents).toBe(12000); // R40 × 3
    expect(profit.totalInboundCostCents).toBe(600); // R2 × 3
  });
});

// =============================================================================
// IBT Penalty Size Tier
// =============================================================================

describe('classifyIbtSize', () => {
  it('classifies Standard (<= 35,000 cm3)', () => {
    expect(classifyIbtSize(35000)).toBe('Standard');
  });

  it('classifies Large (35,001 - 130,000 cm3)', () => {
    expect(classifyIbtSize(35001)).toBe('Large');
    expect(classifyIbtSize(130000)).toBe('Large');
  });

  it('classifies Extra Bulky (> 545,000 cm3)', () => {
    expect(classifyIbtSize(545001)).toBe('ExtraBulky');
  });

  it('defaults to Standard when null', () => {
    expect(classifyIbtSize(null)).toBe('Standard');
  });
});
