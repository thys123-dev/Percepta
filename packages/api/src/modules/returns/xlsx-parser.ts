/**
 * Takealot Returns Export XLSX Parser
 *
 * Parses the 19-column XLSX that sellers download from their Takealot Seller
 * Portal under "Returns". This is the only source of return reasons,
 * customer comments, stock outcomes, and removal-order tracking — none of
 * which are available via the Takealot API.
 *
 * Expected columns (verified against real export 2026-04-29):
 *    Return Date, RRN, Order ID, Product Title, SKU, TSIN,
 *    Return Reason, Customer Comment, Qty, Region, Stock Outcome, My Note,
 *    Customer Order Reversal, Success Fee Reversal, Fulfillment Fee Reversal,
 *    Courier Collection Fee Reversal, Removal Order, Date Ready to Collect,
 *    Date Added to Stock
 *
 * The first sheet's first row is headers; column matching is by NORMALISED
 * name (lowercase, whitespace collapsed) so trivial header tweaks by Takealot
 * don't break imports.
 */

import ExcelJS from 'exceljs';
import { parseRandsToCents } from '../fees/csv-utils.js';

// =============================================================================
// Types
// =============================================================================

export type ReturnReason =
  | 'Defective'
  | 'Not what I ordered'
  | 'Changed my mind'
  | 'Exchange'
  | 'Failed delivery'
  | 'Exception'
  | string; // tolerate unknown reasons rather than rejecting

export type StockOutcome = 'sellable' | 'removal_order';

export interface TakealotReturnRow {
  rrn: string;
  orderId: number | null;
  returnDate: Date;
  productTitle: string | null;
  sku: string | null;
  tsin: number | null;
  returnReason: string | null;
  customerComment: string | null;
  quantity: number;
  region: string | null;
  stockOutcome: StockOutcome | null;
  sellerNote: string | null;
  customerOrderReversalCents: number | null;
  successFeeReversalCents: number | null;
  fulfillmentFeeReversalCents: number | null;
  courierFeeReversalCents: number | null;
  removalOrderNumber: string | null;
  dateReadyToCollect: Date | null;
  dateAddedToStock: Date | null;
  rawRow: Record<string, unknown>;
}

export interface TakealotReturnsParseResult {
  rows: TakealotReturnRow[];
  errors: Array<{ line: number; message: string }>;
  totalRows: number;
}

// =============================================================================
// Header normalisation
// =============================================================================

function normaliseHeader(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Column names as they appear in the export, normalised. */
const COL = {
  returnDate: 'return date',
  rrn: 'rrn',
  orderId: 'order id',
  productTitle: 'product title',
  sku: 'sku',
  tsin: 'tsin',
  returnReason: 'return reason',
  customerComment: 'customer comment',
  qty: 'qty',
  region: 'region',
  stockOutcome: 'stock outcome',
  myNote: 'my note',
  customerOrderReversal: 'customer order reversal',
  successFeeReversal: 'success fee reversal',
  fulfillmentFeeReversal: 'fulfillment fee reversal',
  courierCollectionFeeReversal: 'courier collection fee reversal',
  removalOrder: 'removal order',
  dateReadyToCollect: 'date ready to collect',
  dateAddedToStock: 'date added to stock',
} as const;

const REQUIRED_COLS = [COL.returnDate, COL.rrn, COL.qty];

// =============================================================================
// Cell coercion — XLSX cells are typed but we get strings for some columns
// =============================================================================

function cellToString(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return value.toISOString();
  // Rich text cell { richText: [{ text: '...' }] }
  if (typeof value === 'object' && 'richText' in value) {
    return (value.richText.map((rt) => rt.text).join('') || '').trim() || null;
  }
  // Hyperlink cell { text: '...', hyperlink: '...' }
  if (typeof value === 'object' && 'text' in value) {
    const text = (value as { text: unknown }).text;
    return typeof text === 'string' ? text.trim() || null : null;
  }
  // Result of a formula
  if (typeof value === 'object' && 'result' in value) {
    return cellToString((value as { result: ExcelJS.CellValue }).result);
  }
  return null;
}

function cellToNumber(value: ExcelJS.CellValue): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const s = cellToString(value);
  if (!s) return null;
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

function cellToCents(value: ExcelJS.CellValue): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Math.round(value * 100);
  const s = cellToString(value);
  if (!s) return null;
  const cents = parseRandsToCents(s);
  return cents === 0 && s.replace(/[\s\-R]/g, '') === '' ? null : cents;
}

function cellToDate(value: ExcelJS.CellValue): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    // Excel serial date — ExcelJS normally hands back a Date, but be defensive.
    // Excel epoch is 1899-12-30 (accounting for the 1900 leap-year bug).
    const ms = (value - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = cellToString(value);
  if (!s) return null;
  // Common Takealot return-date format: "DD-MM-YYYY"
  const ddmmyyyy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function normaliseStockOutcome(raw: string | null): StockOutcome | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s.startsWith('sellable')) return 'sellable';
  if (s.startsWith('removal')) return 'removal_order';
  return null;
}

// =============================================================================
// Parser
// =============================================================================

export async function parseTakealotReturnsXlsx(
  buffer: Buffer
): Promise<TakealotReturnsParseResult> {
  const errors: TakealotReturnsParseResult['errors'] = [];
  const rows: TakealotReturnRow[] = [];

  let workbook: ExcelJS.Workbook;
  try {
    workbook = new ExcelJS.Workbook();
    // ExcelJS's `load()` typings expect a Buffer<ArrayBuffer>, but a Node Buffer
    // backed by ArrayBufferLike is structurally fine. Pass the underlying
    // ArrayBuffer slice instead to satisfy the typing.
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
    await workbook.xlsx.load(arrayBuffer as ArrayBuffer);
  } catch (err) {
    return {
      rows: [],
      errors: [{ line: 0, message: `Could not read XLSX: ${(err as Error).message}` }],
      totalRows: 0,
    };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return {
      rows: [],
      errors: [{ line: 0, message: 'Workbook has no sheets' }],
      totalRows: 0,
    };
  }

  if (sheet.rowCount < 2) {
    return {
      rows: [],
      errors: [{ line: 0, message: 'Sheet has no data rows' }],
      totalRows: sheet.rowCount,
    };
  }

  // Build column index map from header row
  const headerRow = sheet.getRow(1);
  const colByName: Record<string, number> = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const raw = cellToString(cell.value);
    if (raw) {
      colByName[normaliseHeader(raw)] = colNumber;
    }
  });

  // Verify required columns
  for (const required of REQUIRED_COLS) {
    if (colByName[required] === undefined) {
      return {
        rows: [],
        errors: [
          {
            line: 1,
            message: `Missing required column: "${required}". Is this a Takealot Returns Export?`,
          },
        ],
        totalRows: sheet.rowCount,
      };
    }
  }

  const get = (row: ExcelJS.Row, key: string): ExcelJS.CellValue => {
    const idx = colByName[key];
    if (idx === undefined) return null;
    return row.getCell(idx).value;
  };

  // Iterate data rows
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (!row.hasValues) continue;

    try {
      const rrn = cellToString(get(row, COL.rrn));
      if (!rrn) {
        errors.push({ line: r, message: 'Missing RRN' });
        continue;
      }

      const returnDate = cellToDate(get(row, COL.returnDate));
      if (!returnDate) {
        errors.push({ line: r, message: `Invalid Return Date for RRN ${rrn}` });
        continue;
      }

      const orderIdNum = cellToNumber(get(row, COL.orderId));
      const tsinNum = cellToNumber(get(row, COL.tsin));
      const qtyNum = cellToNumber(get(row, COL.qty)) ?? 1;
      const stockOutcome = normaliseStockOutcome(cellToString(get(row, COL.stockOutcome)));

      // Build raw row dict for jsonb storage
      const rawRow: Record<string, unknown> = {};
      for (const [key, idx] of Object.entries(colByName)) {
        rawRow[key] = cellToString(row.getCell(idx).value);
      }

      rows.push({
        rrn,
        orderId: orderIdNum !== null ? Math.trunc(orderIdNum) : null,
        returnDate,
        productTitle: cellToString(get(row, COL.productTitle)),
        sku: cellToString(get(row, COL.sku)),
        tsin: tsinNum !== null ? Math.trunc(tsinNum) : null,
        returnReason: cellToString(get(row, COL.returnReason)),
        customerComment: cellToString(get(row, COL.customerComment)),
        quantity: Math.trunc(qtyNum),
        region: cellToString(get(row, COL.region)),
        stockOutcome,
        sellerNote: cellToString(get(row, COL.myNote)),
        customerOrderReversalCents: cellToCents(get(row, COL.customerOrderReversal)),
        successFeeReversalCents: cellToCents(get(row, COL.successFeeReversal)),
        fulfillmentFeeReversalCents: cellToCents(get(row, COL.fulfillmentFeeReversal)),
        courierFeeReversalCents: cellToCents(get(row, COL.courierCollectionFeeReversal)),
        removalOrderNumber: cellToString(get(row, COL.removalOrder)),
        dateReadyToCollect: cellToDate(get(row, COL.dateReadyToCollect)),
        dateAddedToStock: cellToDate(get(row, COL.dateAddedToStock)),
        rawRow,
      });
    } catch (err) {
      errors.push({
        line: r,
        message: err instanceof Error ? err.message : 'Unknown parse error',
      });
    }
  }

  return { rows, errors, totalRows: sheet.rowCount - 1 };
}

// =============================================================================
// Aggregation helper used by the import preview
// =============================================================================

export function aggregateByReason(
  rows: TakealotReturnRow[]
): Record<string, { count: number; quantity: number; reversalCents: number }> {
  const out: Record<string, { count: number; quantity: number; reversalCents: number }> = {};
  for (const row of rows) {
    const key = row.returnReason ?? 'Unknown';
    const entry = out[key] ?? { count: 0, quantity: 0, reversalCents: 0 };
    entry.count += 1;
    entry.quantity += row.quantity;
    entry.reversalCents += Math.abs(row.customerOrderReversalCents ?? 0);
    out[key] = entry;
  }
  return out;
}

export function aggregateByStockOutcome(
  rows: TakealotReturnRow[]
): { sellable: number; removalOrder: number; pending: number } {
  let sellable = 0;
  let removalOrder = 0;
  let pending = 0;
  for (const row of rows) {
    if (row.stockOutcome === 'sellable') sellable++;
    else if (row.stockOutcome === 'removal_order') removalOrder++;
    else pending++;
  }
  return { sellable, removalOrder, pending };
}
