/**
 * Inventory utility functions — pure, side-effect-free helpers
 * exported here so they can be unit-tested independently of routes.
 */

export type StockCoverStatus = 'healthy' | 'low' | 'critical';

/**
 * Classify a stock-cover-days value into a traffic-light status.
 *   healthy  — ≥14 days
 *   low      — 7–13 days
 *   critical — <7 days or null (no data / out of stock)
 */
export function getStockCoverStatus(days: number | null): StockCoverStatus {
  if (days === null || days < 7) return 'critical';
  if (days < 14) return 'low';
  return 'healthy';
}

/**
 * Wrap a CSV field value in double-quotes if it contains a comma,
 * double-quote, or newline character. Internal double-quotes are
 * escaped by doubling them (RFC 4180).
 */
export function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Derive the 30-day sales velocity in units/day, rounded to 1 dp.
 */
export function calcSalesVelocity(salesUnits30d: number): number {
  return Math.round((salesUnits30d / 30) * 10) / 10;
}

/**
 * Build a single CSV data row from an offer record.
 * Returns a comma-separated string (no trailing newline).
 */
export function buildStockCsvRow(offer: {
  sku: string | null;
  title: string | null;
  stockJhb: number | null;
  stockCpt: number | null;
  stockDbn: number | null;
  stockCoverDays: number | null;
  salesUnits30d: number | null;
  sellingPriceCents: number | null;
  status: string | null;
}): string {
  const jhb = offer.stockJhb ?? 0;
  const cpt = offer.stockCpt ?? 0;
  const dbn = offer.stockDbn ?? 0;
  const total = jhb + cpt + dbn;
  const velocity = calcSalesVelocity(offer.salesUnits30d ?? 0);
  const price = ((offer.sellingPriceCents ?? 0) / 100).toFixed(2);

  return [
    escapeCsvField(offer.sku ?? ''),
    escapeCsvField(offer.title ?? ''),
    jhb,
    cpt,
    dbn,
    total,
    offer.stockCoverDays ?? '',
    velocity,
    price,
    escapeCsvField(offer.status ?? ''),
  ].join(',');
}

export const STOCK_CSV_HEADER =
  'SKU,Title,Stock JHB,Stock CPT,Stock DBN,Total Stock,Stock Cover Days,Sales Velocity (units/day),Selling Price (R),Status';
