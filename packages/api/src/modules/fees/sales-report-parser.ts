/**
 * Takealot Sales Report CSV Parser
 *
 * Parses the exact 20-column CSV that sellers download from their Takealot
 * Seller Portal under "Sales Reports". This is the definitive data source for:
 *
 *   1. Actual ship date ("Date Shipped to Customer") — used for fee versioning
 *   2. Actual fees Takealot charged (Success Fee, Fulfilment Fee, etc.) — used
 *      for fee auditing/reconciliation against our calculated estimates
 *   3. Courier Collection Fee — a fee type not available via API
 *
 * CSV column order (verified against real export from 2026-03-18):
 *   0  Order Date
 *   1  Sale Status
 *   2  Order ID
 *   3  Customer
 *   4  Product Title
 *   5  SKU
 *   6  TSIN
 *   7  Qty
 *   8  Fulfilment DC
 *   9  Customer DC
 *  10  Gross Sales
 *  11  Sold On Daily Deal/Promo
 *  12  Success Fee
 *  13  Fulfilment Fee
 *  14  Courier Collection Fee
 *  15  Stock Transfer Fee
 *  16  Net Sales Amount
 *  17  Shipment Name
 *  18  PO Number
 *  19  Date Shipped to Customer
 */

// =============================================================================
// Types
// =============================================================================

export interface SalesReportRow {
  orderDate: Date;
  saleStatus: string;
  orderId: number;
  customer: string;
  productTitle: string;
  sku: string;
  tsin: number | null;
  quantity: number;
  fulfilmentDc: string;
  customerDc: string;
  grossSalesCents: number;
  dailyDealPromo: string;
  successFeeCents: number;
  fulfilmentFeeCents: number;
  courierCollectionFeeCents: number;
  stockTransferFeeCents: number;
  netSalesAmountCents: number;
  shipmentName: string;
  poNumber: string;
  dateShippedToCustomer: Date | null;
}

export interface SalesReportParseResult {
  rows: SalesReportRow[];
  errors: Array<{ line: number; message: string }>;
  totalLines: number;
}

// =============================================================================
// CSV Parser
// =============================================================================

const EXPECTED_COLUMNS = [
  'Order Date',
  'Sale Status',
  'Order ID',
  'Customer',
  'Product Title',
  'SKU',
  'TSIN',
  'Qty',
  'Fulfilment DC',
  'Customer DC',
  'Gross Sales',
  'Sold On Daily Deal/Promo',
  'Success Fee',
  'Fulfilment Fee',
  'Courier Collection Fee',
  'Stock Transfer Fee',
  'Net Sales Amount',
  'Shipment Name',
  'PO Number',
  'Date Shipped to Customer',
];

/**
 * Parse a Takealot sales report CSV string into typed rows.
 * All monetary amounts in the CSV are in Rands (e.g. "150.00") and are
 * converted to cents (integer) for storage.
 */
export function parseSalesReportCsv(csvText: string): SalesReportParseResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const errors: SalesReportParseResult['errors'] = [];
  const rows: SalesReportRow[] = [];

  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 0, message: 'CSV file is empty' }], totalLines: 0 };
  }

  // Validate header row
  const headerFields = splitCsvLine(lines[0]!);
  const headerNormalized = headerFields.map((h) => h.trim());

  // Flexible matching: accept if at least the key columns are present
  const orderIdIdx = headerNormalized.findIndex((h) => h === 'Order ID');
  if (orderIdIdx === -1) {
    // Try exact 20-column match
    if (headerNormalized.length < 20) {
      return {
        rows: [],
        errors: [{ line: 1, message: `Expected at least 20 columns, found ${headerNormalized.length}. Is this a Takealot sales report CSV?` }],
        totalLines: lines.length,
      };
    }
  }

  // Build column index map for flexibility (handles column reordering)
  const colIdx: Record<string, number> = {};
  for (let i = 0; i < headerNormalized.length; i++) {
    colIdx[headerNormalized[i]!] = i;
  }

  // Verify required columns
  const requiredCols = ['Order ID', 'Qty', 'Gross Sales', 'Success Fee', 'Fulfilment Fee'];
  for (const col of requiredCols) {
    if (colIdx[col] === undefined) {
      return {
        rows: [],
        errors: [{ line: 1, message: `Missing required column: "${col}"` }],
        totalLines: lines.length,
      };
    }
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]!);
    const lineNum = i + 1; // 1-indexed for user display

    try {
      const get = (col: string): string => {
        const idx = colIdx[col];
        return idx !== undefined && idx < fields.length ? fields[idx]!.trim() : '';
      };

      const orderId = parseInt(get('Order ID'), 10);
      if (isNaN(orderId)) {
        errors.push({ line: lineNum, message: `Invalid Order ID: "${get('Order ID')}"` });
        continue;
      }

      const quantity = parseInt(get('Qty'), 10);
      if (isNaN(quantity) || quantity <= 0) {
        errors.push({ line: lineNum, message: `Invalid Qty: "${get('Qty')}"` });
        continue;
      }

      const row: SalesReportRow = {
        orderDate: parseDate(get('Order Date')),
        saleStatus: get('Sale Status'),
        orderId,
        customer: get('Customer'),
        productTitle: get('Product Title'),
        sku: get('SKU'),
        tsin: parseIntOrNull(get('TSIN')),
        quantity,
        fulfilmentDc: get('Fulfilment DC'),
        customerDc: get('Customer DC'),
        grossSalesCents: parseRandsToCents(get('Gross Sales')),
        dailyDealPromo: get('Sold On Daily Deal/Promo'),
        successFeeCents: parseRandsToCents(get('Success Fee')),
        fulfilmentFeeCents: parseRandsToCents(get('Fulfilment Fee')),
        courierCollectionFeeCents: parseRandsToCents(get('Courier Collection Fee')),
        stockTransferFeeCents: parseRandsToCents(get('Stock Transfer Fee')),
        netSalesAmountCents: parseRandsToCents(get('Net Sales Amount')),
        shipmentName: get('Shipment Name'),
        poNumber: get('PO Number'),
        dateShippedToCustomer: parseDateOrNull(get('Date Shipped to Customer')),
      };

      rows.push(row);
    } catch (err) {
      errors.push({
        line: lineNum,
        message: err instanceof Error ? err.message : 'Unknown parse error',
      });
    }
  }

  return { rows, errors, totalLines: lines.length };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Split a CSV line respecting quoted fields (handles commas inside quotes).
 */
function splitCsvLine(line: string): string[] {
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
function parseRandsToCents(value: string): number {
  if (!value || value.trim() === '' || value.trim() === '-') return 0;

  // Remove currency symbol, spaces (thousands separator), and trim
  const cleaned = value.replace(/[R\s]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

/**
 * Parse a date string in common Takealot formats:
 *   "2026-03-18" or "2026/03/18" or "18 Mar 2026" or "03/18/2026"
 */
function parseDate(value: string): Date {
  if (!value || value.trim() === '') {
    return new Date(); // fallback to now
  }
  const d = new Date(value.trim());
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: "${value}"`);
  }
  return d;
}

function parseDateOrNull(value: string): Date | null {
  if (!value || value.trim() === '') return null;
  const d = new Date(value.trim());
  return isNaN(d.getTime()) ? null : d;
}

function parseIntOrNull(value: string): number | null {
  if (!value || value.trim() === '') return null;
  const n = parseInt(value.trim(), 10);
  return isNaN(n) ? null : n;
}
