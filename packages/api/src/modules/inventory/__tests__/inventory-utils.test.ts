import { describe, it, expect } from 'vitest';
import {
  getStockCoverStatus,
  escapeCsvField,
  calcSalesVelocity,
  buildStockCsvRow,
  STOCK_CSV_HEADER,
} from '../utils.js';

// =============================================================================
// getStockCoverStatus
// =============================================================================

describe('getStockCoverStatus', () => {
  it('returns "critical" for null (no data)', () => {
    expect(getStockCoverStatus(null)).toBe('critical');
  });

  it('returns "critical" for 0 days', () => {
    expect(getStockCoverStatus(0)).toBe('critical');
  });

  it('returns "critical" for 1 day', () => {
    expect(getStockCoverStatus(1)).toBe('critical');
  });

  it('returns "critical" for 6 days (boundary — just below threshold)', () => {
    expect(getStockCoverStatus(6)).toBe('critical');
  });

  it('returns "low" for exactly 7 days (lower boundary)', () => {
    expect(getStockCoverStatus(7)).toBe('low');
  });

  it('returns "low" for 10 days (mid-range)', () => {
    expect(getStockCoverStatus(10)).toBe('low');
  });

  it('returns "low" for 13 days (just below healthy boundary)', () => {
    expect(getStockCoverStatus(13)).toBe('low');
  });

  it('returns "healthy" for exactly 14 days (lower boundary)', () => {
    expect(getStockCoverStatus(14)).toBe('healthy');
  });

  it('returns "healthy" for 30 days', () => {
    expect(getStockCoverStatus(30)).toBe('healthy');
  });

  it('returns "healthy" for 100 days (overstocked)', () => {
    expect(getStockCoverStatus(100)).toBe('healthy');
  });

  it('returns "critical" for negative days (edge case)', () => {
    expect(getStockCoverStatus(-1)).toBe('critical');
  });
});

// =============================================================================
// escapeCsvField
// =============================================================================

describe('escapeCsvField', () => {
  it('returns plain string unchanged', () => {
    expect(escapeCsvField('Rooibos Face Cream')).toBe('Rooibos Face Cream');
  });

  it('returns empty string unchanged', () => {
    expect(escapeCsvField('')).toBe('');
  });

  it('wraps string containing comma in double-quotes', () => {
    expect(escapeCsvField('Chair, Deluxe')).toBe('"Chair, Deluxe"');
  });

  it('wraps string containing a double-quote and escapes it', () => {
    expect(escapeCsvField('He said "hello"')).toBe('"He said ""hello"""');
  });

  it('wraps string containing a newline in double-quotes', () => {
    expect(escapeCsvField('Line1\nLine2')).toBe('"Line1\nLine2"');
  });

  it('handles string with both comma and double-quote', () => {
    expect(escapeCsvField('Item "A", special')).toBe('"Item ""A"", special"');
  });

  it('does not wrap numbers-as-strings that have no special chars', () => {
    expect(escapeCsvField('12345')).toBe('12345');
  });

  it('wraps string with only a double-quote character', () => {
    expect(escapeCsvField('"')).toBe('""""');
  });
});

// =============================================================================
// calcSalesVelocity
// =============================================================================

describe('calcSalesVelocity', () => {
  it('returns 0 for zero sales', () => {
    expect(calcSalesVelocity(0)).toBe(0);
  });

  it('calculates velocity for 30 units in 30 days as 1.0', () => {
    expect(calcSalesVelocity(30)).toBe(1.0);
  });

  it('calculates velocity for 60 units as 2.0', () => {
    expect(calcSalesVelocity(60)).toBe(2.0);
  });

  it('rounds to 1 decimal place (e.g. 10 units → 0.3)', () => {
    expect(calcSalesVelocity(10)).toBe(0.3);
  });

  it('rounds to 1 decimal place (e.g. 85 units → 2.8)', () => {
    // 85 / 30 = 2.8333... → rounds to 2.8
    expect(calcSalesVelocity(85)).toBe(2.8);
  });

  it('calculates velocity for 1 unit as 0.0 (rounds down)', () => {
    // 1 / 30 = 0.0333... → rounds to 0.0
    expect(calcSalesVelocity(1)).toBe(0.0);
  });

  it('calculates velocity for 3 units as 0.1', () => {
    // 3 / 30 = 0.1 → 0.1
    expect(calcSalesVelocity(3)).toBe(0.1);
  });
});

// =============================================================================
// buildStockCsvRow
// =============================================================================

describe('buildStockCsvRow', () => {
  const baseOffer = {
    sku: 'SKU-001',
    title: 'Braai Master Tongs Set',
    stockJhb: 10,
    stockCpt: 5,
    stockDbn: 2,
    stockCoverDays: 20,
    salesUnits30d: 30,
    sellingPriceCents: 34900,
    status: 'buyable',
  };

  it('builds a correctly formatted CSV row', () => {
    const row = buildStockCsvRow(baseOffer);
    expect(row).toBe('SKU-001,Braai Master Tongs Set,10,5,2,17,20,1,349.00,buyable');
  });

  it('sums JHB + CPT + DBN as totalStock', () => {
    const row = buildStockCsvRow({ ...baseOffer, stockJhb: 3, stockCpt: 4, stockDbn: 5 });
    const cols = row.split(',');
    expect(cols[5]).toBe('12'); // total = 3+4+5
  });

  it('handles null stock values as 0', () => {
    const row = buildStockCsvRow({ ...baseOffer, stockJhb: null, stockCpt: null, stockDbn: null });
    const cols = row.split(',');
    expect(cols[2]).toBe('0'); // JHB
    expect(cols[3]).toBe('0'); // CPT
    expect(cols[4]).toBe('0'); // DBN
    expect(cols[5]).toBe('0'); // total
  });

  it('outputs empty string for null stockCoverDays', () => {
    const row = buildStockCsvRow({ ...baseOffer, stockCoverDays: null });
    const cols = row.split(',');
    expect(cols[6]).toBe(''); // cover days
  });

  it('formats sellingPriceCents as rands with 2 decimal places', () => {
    const row = buildStockCsvRow({ ...baseOffer, sellingPriceCents: 19999 });
    const cols = row.split(',');
    expect(cols[8]).toBe('199.99');
  });

  it('handles null sellingPriceCents as 0.00', () => {
    const row = buildStockCsvRow({ ...baseOffer, sellingPriceCents: null });
    const cols = row.split(',');
    expect(cols[8]).toBe('0.00');
  });

  it('wraps title with comma in double-quotes', () => {
    const row = buildStockCsvRow({ ...baseOffer, title: 'Chair, Deluxe' });
    expect(row).toContain('"Chair, Deluxe"');
  });

  it('handles null sku as empty string', () => {
    const row = buildStockCsvRow({ ...baseOffer, sku: null });
    const cols = row.split(',');
    expect(cols[0]).toBe(''); // sku first column
  });

  it('handles null title as empty string', () => {
    const row = buildStockCsvRow({ ...baseOffer, title: null });
    // Title column should be empty (no quotes around empty)
    expect(row.startsWith('SKU-001,')).toBe(true);
  });

  it('computes salesVelocity from salesUnits30d', () => {
    const row = buildStockCsvRow({ ...baseOffer, salesUnits30d: 60 });
    const cols = row.split(',');
    expect(cols[7]).toBe('2'); // velocity = 60/30 = 2.0
  });
});

// =============================================================================
// STOCK_CSV_HEADER
// =============================================================================

describe('STOCK_CSV_HEADER', () => {
  it('has exactly 10 columns', () => {
    const cols = STOCK_CSV_HEADER.split(',');
    expect(cols).toHaveLength(10);
  });

  it('starts with SKU', () => {
    expect(STOCK_CSV_HEADER.startsWith('SKU,')).toBe(true);
  });

  it('includes all expected column names', () => {
    expect(STOCK_CSV_HEADER).toContain('Stock JHB');
    expect(STOCK_CSV_HEADER).toContain('Stock CPT');
    expect(STOCK_CSV_HEADER).toContain('Stock DBN');
    expect(STOCK_CSV_HEADER).toContain('Total Stock');
    expect(STOCK_CSV_HEADER).toContain('Stock Cover Days');
    expect(STOCK_CSV_HEADER).toContain('Sales Velocity');
    expect(STOCK_CSV_HEADER).toContain('Selling Price');
    expect(STOCK_CSV_HEADER).toContain('Status');
  });
});
