/**
 * Shared CSV parsing utilities used by both the Sales Report and
 * Account Transactions parsers.
 */

/**
 * Split a CSV line respecting quoted fields (handles commas inside quotes).
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ("" → ")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Parse a Rand amount (e.g. "150.00", "1 250.50", "-42.30") to integer cents.
 * Returns 0 for empty/unparseable values.
 */
export function parseRandsToCents(value: string): number {
  if (!value || value.trim() === '' || value.trim() === '-') return 0;

  // Remove currency symbol, spaces (thousands separator), and trim
  const cleaned = value.replace(/[R\s]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

/**
 * Parse a Rand amount to integer cents, distinguishing **empty / "-"** (no
 * value yet) from a legitimate **"0.00"** (zero). The Takealot Sales Report
 * leaves fee columns blank for orders that haven't shipped yet, and earlier
 * we treated those as `0` — which made downstream fee-discrepancy detection
 * fire false positives ("Takealot charged R0 but we calculated R3,000")
 * for every unshipped order.
 *
 * - Empty cell or "-" → null
 * - "0.00" or "0"     → 0
 * - "150.00"          → 15000
 * - unparseable       → null
 */
export function parseRandsToCentsOrNull(value: string): number | null {
  if (!value || value.trim() === '' || value.trim() === '-') return null;
  const cleaned = value.replace(/[R\s]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.round(num * 100);
}

/**
 * Parse a date string in common Takealot formats:
 *   "2026-03-18" or "2026/03/18" or "18 Mar 2026" or "03/18/2026"
 */
export function parseDate(value: string): Date {
  if (!value || value.trim() === '') {
    return new Date(); // fallback to now
  }
  const d = new Date(value.trim());
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: "${value}"`);
  }
  return d;
}

export function parseDateOrNull(value: string): Date | null {
  if (!value || value.trim() === '') return null;
  const d = new Date(value.trim());
  return isNaN(d.getTime()) ? null : d;
}

export function parseIntOrNull(value: string): number | null {
  if (!value || value.trim() === '') return null;
  const n = parseInt(value.trim(), 10);
  return isNaN(n) ? null : n;
}
