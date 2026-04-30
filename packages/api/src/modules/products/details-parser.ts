/**
 * Takealot Product Details CSV Parser
 *
 * Parses the 19-column report sellers download from Seller Portal → Reports
 * → Product Details. The columns we care about (none of which are returned
 * by the offers API):
 *
 *   - Primary Department / Level 1 / Level 2  — used for success-fee rate lookup
 *   - Brand
 *   - Length / Width / Height / Weight        — used for fulfilment-fee tier
 *   - Current Price + Success Fee (In Stock)  — derives Takealot's published
 *                                               success-fee rate per product
 *   - Fulfillment Fee                         — Takealot's published per-unit
 *                                               fulfilment fee in Rands
 */

import {
  splitCsvLine,
  parseRandsToCents,
  parseIntOrNull,
} from '../fees/csv-utils.js';

export interface ProductDetailRow {
  /** Either tsin or sku is required (we match offers by either). */
  tsin: number | null;
  sku: string | null;
  productTitle: string | null;
  brand: string | null;
  /** Best category for fee-rate lookup — uses Primary Department. */
  category: string | null;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  volumeCm3: number | null;
  /** Takealot's published success-fee rate, derived from
   *  `Success Fee (In Stock) / Current Price * 100`. Null if either input is missing. */
  successFeeRatePct: number | null;
  /** Takealot's published per-unit fulfilment fee in cents. */
  fulfilmentFeeCents: number | null;
}

export interface ProductDetailsParseResult {
  rows: ProductDetailRow[];
  errors: Array<{ line: number; message: string }>;
  totalLines: number;
}

const REQUIRED_COLS = ['TSIN', 'SKU'];

const EXPECTED_COLS = [
  'TSIN',
  'SKU',
  'Takealot Barcode',
  'Product Title',
  'Brand',
  'Status',
  'Primary Department',
  'Level 1',
  'Level 2',
  'RRP',
  'Current Price',
  'Leadtime',
  'Length',
  'Width',
  'Height',
  'Weight',
  'Success Fee (In Stock)',
  'Success Fee (Leadtime)',
  'Fulfillment Fee',
];

function parseFloatOrNull(value: string): number | null {
  if (!value || value.trim() === '' || value.trim().toLowerCase() === 'n/a') return null;
  const cleaned = value.replace(/[R\s]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Strip the doubled-up double-quotes Takealot wraps category names in
 * (`"""TV & Audio"""` → `TV & Audio`). The CSV splitter already handles
 * one layer of quote-as-field-delimiter; this strips the inner pair.
 */
function stripQuotes(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^"+|"+$/g, '').trim() || null;
}

export function parseProductDetailsCsv(csvText: string): ProductDetailsParseResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const errors: ProductDetailsParseResult['errors'] = [];
  const rows: ProductDetailRow[] = [];

  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 0, message: 'CSV file is empty' }], totalLines: 0 };
  }

  const headerFields = splitCsvLine(lines[0]!).map((h) => h.trim());
  const colIdx: Record<string, number> = {};
  for (let i = 0; i < headerFields.length; i++) {
    colIdx[headerFields[i]!] = i;
  }

  for (const required of REQUIRED_COLS) {
    if (colIdx[required] === undefined) {
      return {
        rows: [],
        errors: [
          {
            line: 1,
            message: `Missing required column: "${required}". Is this a Takealot Product Details CSV?`,
          },
        ],
        totalLines: lines.length,
      };
    }
  }

  // Suppress unused-variable warning while keeping the column list readable
  void EXPECTED_COLS;

  const get = (fields: string[], col: string): string => {
    const idx = colIdx[col];
    return idx !== undefined && idx < fields.length ? fields[idx]!.trim() : '';
  };

  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]!);
    const lineNum = i + 1;

    try {
      const tsinRaw = get(fields, 'TSIN');
      // Takealot's CSV exports include a "description" row right after the
      // header (literal column descriptions like "Takealot Product Identifier"
      // in the TSIN cell). Skip silently — anything in TSIN that contains
      // letters can't be a real TSIN.
      if (tsinRaw && /[a-zA-Z]/.test(tsinRaw)) continue;

      const tsin = parseIntOrNull(tsinRaw);
      const skuRaw = get(fields, 'SKU');
      const sku = skuRaw && skuRaw.toLowerCase() !== 'n/a' ? skuRaw : null;

      if (tsin == null && sku == null) {
        errors.push({ line: lineNum, message: 'Row has no TSIN and no SKU; cannot match an offer' });
        continue;
      }

      const lengthCm = parseFloatOrNull(get(fields, 'Length'));
      const widthCm = parseFloatOrNull(get(fields, 'Width'));
      const heightCm = parseFloatOrNull(get(fields, 'Height'));
      const weightKg = parseFloatOrNull(get(fields, 'Weight'));

      const lengthMm = lengthCm != null ? Math.round(lengthCm * 10) : null;
      const widthMm = widthCm != null ? Math.round(widthCm * 10) : null;
      const heightMm = heightCm != null ? Math.round(heightCm * 10) : null;
      const weightGrams = weightKg != null ? Math.round(weightKg * 1000) : null;
      const volumeCm3 =
        lengthCm != null && widthCm != null && heightCm != null
          ? Math.round(lengthCm * widthCm * heightCm)
          : null;

      // Takealot's published rate: success fee in Rands ÷ current price in Rands × 100.
      const currentPrice = parseFloatOrNull(get(fields, 'Current Price'));
      const successFeeRands = parseFloatOrNull(get(fields, 'Success Fee (In Stock)'));
      const successFeeRatePct =
        currentPrice != null && currentPrice > 0 && successFeeRands != null
          ? Math.round((successFeeRands / currentPrice) * 100 * 10000) / 10000 // 4dp
          : null;

      const fulfilmentFeeRandsRaw = get(fields, 'Fulfillment Fee');
      const fulfilmentFeeCents =
        fulfilmentFeeRandsRaw && fulfilmentFeeRandsRaw.toLowerCase() !== 'n/a'
          ? parseRandsToCents(fulfilmentFeeRandsRaw)
          : null;

      // Use Primary Department (top level) — matches our SUCCESS_FEE_RATES keys.
      const category = stripQuotes(get(fields, 'Primary Department'));
      const brandRaw = stripQuotes(get(fields, 'Brand'));
      // Takealot uses "Undefined" as a placeholder when the seller didn't fill it in.
      const brand = brandRaw && brandRaw.toLowerCase() !== 'undefined' ? brandRaw : null;

      rows.push({
        tsin,
        sku,
        productTitle: stripQuotes(get(fields, 'Product Title')),
        brand,
        category,
        weightGrams,
        lengthMm,
        widthMm,
        heightMm,
        volumeCm3,
        successFeeRatePct,
        fulfilmentFeeCents,
      });
    } catch (err) {
      errors.push({
        line: lineNum,
        message: err instanceof Error ? err.message : 'Unknown parse error',
      });
    }
  }

  return { rows, errors, totalLines: lines.length };
}
