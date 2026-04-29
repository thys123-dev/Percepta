/**
 * Unit tests for the Takealot Returns Export XLSX parser.
 * Uses the real Seller Portal export at Research/Seller portal reports/.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import {
  parseTakealotReturnsXlsx,
  aggregateByReason,
  aggregateByStockOutcome,
} from '../xlsx-parser.js';

const FIXTURE_PATH = join(
  process.cwd(),
  '..',
  '..',
  'Research',
  'Seller portal reports',
  'Takealot_Returns_04_29_2026.xlsx'
);

function loadFixture(): Buffer {
  return readFileSync(FIXTURE_PATH);
}

// =============================================================================
// Fixture-driven tests
// =============================================================================

describe('parseTakealotReturnsXlsx — real Seller Portal fixture', () => {
  it('parses 151 return rows from the real export', async () => {
    const buf = loadFixture();
    const result = await parseTakealotReturnsXlsx(buf);
    expect(result.rows.length).toBe(151);
    expect(result.errors).toEqual([]);
  });

  it('every row has a non-empty RRN and a valid return date', async () => {
    const buf = loadFixture();
    const result = await parseTakealotReturnsXlsx(buf);
    for (const row of result.rows) {
      expect(row.rrn).toMatch(/^RRN-/);
      expect(row.returnDate).toBeInstanceOf(Date);
      expect(isNaN(row.returnDate.getTime())).toBe(false);
    }
  });

  it('parses return reasons including known Takealot values', async () => {
    const buf = loadFixture();
    const result = await parseTakealotReturnsXlsx(buf);
    const reasons = new Set(result.rows.map((r) => r.returnReason));
    // The real Seller Portal export uses these strings — verified against
    // Takealot_Returns_04_29_2026.xlsx (151 rows)
    const known = ['Defective or damaged', 'Changed my mind', 'Not what I ordered'];
    for (const r of known) {
      expect(reasons.has(r)).toBe(true);
    }
  });

  it('normalises stock outcome to enum values', async () => {
    const buf = loadFixture();
    const result = await parseTakealotReturnsXlsx(buf);
    for (const row of result.rows) {
      if (row.stockOutcome !== null) {
        expect(['sellable', 'removal_order']).toContain(row.stockOutcome);
      }
    }
  });

  it('captures removal-order numbers when stock outcome is removal_order', async () => {
    const buf = loadFixture();
    const result = await parseTakealotReturnsXlsx(buf);
    const removals = result.rows.filter((r) => r.stockOutcome === 'removal_order');
    expect(removals.length).toBeGreaterThan(0);
    const withRoNumber = removals.filter((r) =>
      r.removalOrderNumber?.startsWith('RO-')
    );
    // Most removal-order rows should carry the RO number
    expect(withRoNumber.length).toBeGreaterThan(0);
  });

  it('parses customer order reversal as integer cents', async () => {
    const buf = loadFixture();
    const result = await parseTakealotReturnsXlsx(buf);
    const withReversal = result.rows.filter(
      (r) => r.customerOrderReversalCents !== null && r.customerOrderReversalCents !== 0
    );
    expect(withReversal.length).toBeGreaterThan(0);
    for (const row of withReversal) {
      expect(Number.isInteger(row.customerOrderReversalCents)).toBe(true);
    }
  });

  it('preserves the full original row in rawRow for future-proofing', async () => {
    const buf = loadFixture();
    const result = await parseTakealotReturnsXlsx(buf);
    const sample = result.rows[0]!;
    expect(typeof sample.rawRow).toBe('object');
    expect(sample.rawRow).not.toBeNull();
    expect(Object.keys(sample.rawRow!).length).toBeGreaterThan(10);
  });
});

// =============================================================================
// Edge cases — synthetic XLSX
// =============================================================================

async function buildXlsx(
  rows: (string | number | null)[][],
  sheetName = 'Returns'
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

const HEADER_ROW = [
  'Return Date',
  'RRN',
  'Order ID',
  'Product Title',
  'SKU',
  'TSIN',
  'Return Reason',
  'Customer Comment',
  'Qty',
  'Region',
  'Stock Outcome',
  'My Note',
  'Customer Order Reversal',
  'Success Fee Reversal',
  'Fulfillment Fee Reversal',
  'Courier Collection Fee Reversal',
  'Removal Order',
  'Date Ready to Collect',
  'Date Added to Stock',
];

describe('parseTakealotReturnsXlsx — edge cases', () => {
  it('returns an error when the file is not a valid XLSX', async () => {
    const result = await parseTakealotReturnsXlsx(Buffer.from('not an xlsx'));
    expect(result.rows).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toMatch(/Could not read/i);
  });

  it('returns an error when required columns are missing', async () => {
    const xlsx = await buildXlsx([
      ['Some Random Header'],
      ['data'],
    ]);
    const result = await parseTakealotReturnsXlsx(xlsx);
    expect(result.rows).toEqual([]);
    expect(result.errors[0]?.message).toMatch(/Missing required column/);
  });

  it('returns empty rows array when the sheet is header-only', async () => {
    const xlsx = await buildXlsx([HEADER_ROW]);
    const result = await parseTakealotReturnsXlsx(xlsx);
    expect(result.rows).toEqual([]);
  });

  it('skips rows missing an RRN with a per-row error', async () => {
    const xlsx = await buildXlsx([
      HEADER_ROW,
      [
        '01-04-2026',
        '', // missing RRN
        201234567,
        'A product',
        'SKU-1',
        12345,
        'Defective',
        'broken',
        1,
        'JHB',
        'Sellable stock',
        null,
        -100,
        10,
        null,
        null,
        null,
        null,
        null,
      ],
    ]);
    const result = await parseTakealotReturnsXlsx(xlsx);
    expect(result.rows.length).toBe(0);
    expect(result.errors.some((e) => /Missing RRN/i.test(e.message))).toBe(true);
  });

  it('tolerates trailing junk columns', async () => {
    const xlsx = await buildXlsx([
      [...HEADER_ROW, 'JunkExtraCol'],
      [
        '01-04-2026',
        'RRN-TEST-1',
        201234567,
        'A product',
        'SKU-1',
        12345,
        'Defective',
        'broken',
        1,
        'JHB',
        'Sellable stock',
        null,
        -100,
        10,
        null,
        null,
        null,
        null,
        null,
        'ignored',
      ],
    ]);
    const result = await parseTakealotReturnsXlsx(xlsx);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]?.rrn).toBe('RRN-TEST-1');
  });

  it('normalises mixed-case "REMOVAL ORDER" to enum', async () => {
    const xlsx = await buildXlsx([
      HEADER_ROW,
      [
        '01-04-2026',
        'RRN-TEST-2',
        null,
        null,
        null,
        null,
        'Defective',
        null,
        1,
        'JHB',
        '  Removal Order  ',
        null,
        null,
        null,
        null,
        null,
        'RO-9999-2026-04-01-JHB',
        null,
        null,
      ],
    ]);
    const result = await parseTakealotReturnsXlsx(xlsx);
    expect(result.rows[0]?.stockOutcome).toBe('removal_order');
  });
});

// =============================================================================
// Aggregation helpers
// =============================================================================

describe('aggregation helpers', () => {
  it('aggregateByReason groups counts and sums reversal amounts (absolute)', async () => {
    const buf = loadFixture();
    const { rows } = await parseTakealotReturnsXlsx(buf);
    const byReason = aggregateByReason(rows);
    const totalCount = Object.values(byReason).reduce((s, v) => s + v.count, 0);
    expect(totalCount).toBe(rows.length);
    // Reversal amounts should always be positive (we abs() them)
    for (const v of Object.values(byReason)) {
      expect(v.reversalCents).toBeGreaterThanOrEqual(0);
    }
  });

  it('aggregateByStockOutcome partitions every row into sellable/removal/pending', async () => {
    const buf = loadFixture();
    const { rows } = await parseTakealotReturnsXlsx(buf);
    const out = aggregateByStockOutcome(rows);
    expect(out.sellable + out.removalOrder + out.pending).toBe(rows.length);
  });
});
