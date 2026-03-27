/**
 * Takealot Account Transactions CSV Parser
 *
 * Parses the 14-column CSV that sellers download from their Takealot Seller
 * Portal under "Account Transactions". This is the most complete financial
 * data source, containing ALL transaction types including:
 *
 *   - Order payments and fee charges (success, fulfilment, stock transfer, storage)
 *   - Fee reversals on returns
 *   - Stock loss fees and compensation
 *   - Removal order fees
 *   - Subscription fees
 *   - Ad credit purchases
 *   - Disbursements (payouts)
 *
 * CSV column order (verified against real export):
 *   0  Transaction Date
 *   1  Transaction Type
 *   2  Transaction ID
 *   3  Transaction Description
 *   4  Reference Type
 *   5  Reference
 *   6  Order ID
 *   7  Excl VAT
 *   8  VAT
 *   9  Incl VAT
 *  10  Balance
 *  11  SKU
 *  12  Product Title
 *  13  Disbursement Cycle
 */

import {
  splitCsvLine,
  parseRandsToCents,
  parseDateOrNull,
} from './csv-utils.js';

// =============================================================================
// Types
// =============================================================================

export interface AccountTransactionRow {
  transactionDate: Date;
  transactionType: string;
  transactionId: number;
  description: string;
  referenceType: string;
  reference: string;
  orderId: number | null;
  exclVatCents: number;
  vatCents: number;
  inclVatCents: number;
  balanceCents: number;
  sku: string | null;
  productTitle: string | null;
  disbursementCycle: Date | null;
}

export interface AccountTransactionParseResult {
  rows: AccountTransactionRow[];
  errors: Array<{ line: number; message: string }>;
  totalLines: number;
}

// =============================================================================
// Classification Constants
// =============================================================================

export const VALID_TRANSACTION_TYPES = new Set([
  'Customer Order Payment',
  'Success Fee Charge',
  'Fulfilment Fee Charge',
  'Stock Transfer Fee Charge',
  'Storage Fee Charge',
  'Customer Order Reversal',
  'Success Fee Reversal',
  'Fulfilment Fee Reversal',
  'Order Cancellation Penalty',
  'Stock Loss Fulfilment Fee',
  'Stock Loss Success Fee',
  'Stock Loss Payment',
  'Returns Removal Order Fee',
  'Takealot Removal Order Fee',
  'Subscription Fee Charge',
  'Ad Credit Purchase',
  'Disbursement',
]);

/** Transaction types that are linked to a specific order. */
export const ORDER_LINKED_TYPES = new Set([
  'Customer Order Payment',
  'Success Fee Charge',
  'Fulfilment Fee Charge',
  'Stock Transfer Fee Charge',
  'Customer Order Reversal',
  'Success Fee Reversal',
  'Fulfilment Fee Reversal',
]);

/** Transaction types that are reversals (returns/refunds). */
export const REVERSAL_TYPES = new Set([
  'Customer Order Reversal',
  'Success Fee Reversal',
  'Fulfilment Fee Reversal',
]);

/** Maps non-order transaction types to seller_costs.cost_type values. */
export const NON_ORDER_COST_MAP: Record<string, string> = {
  'Storage Fee Charge': 'storage',
  'Subscription Fee Charge': 'subscription',
  'Ad Credit Purchase': 'ad_spend',
  'Returns Removal Order Fee': 'removal',
  'Takealot Removal Order Fee': 'removal',
  'Stock Loss Payment': 'stock_loss',
  'Stock Loss Success Fee': 'stock_loss',
  'Stock Loss Fulfilment Fee': 'stock_loss',
  'Order Cancellation Penalty': 'cancellation_penalty',
};

// =============================================================================
// CSV Parser
// =============================================================================

const EXPECTED_COLUMNS = [
  'Transaction Date',
  'Transaction Type',
  'Transaction ID',
  'Transaction Description',
  'Reference Type',
  'Reference',
  'Order ID',
  'Excl VAT',
  'VAT',
  'Incl VAT',
  'Balance',
  'SKU',
  'Product Title',
  'Disbursement Cycle',
];

/**
 * Parse a Takealot account transactions CSV string into typed rows.
 * All monetary amounts in the CSV are in Rands and are converted to cents.
 */
export function parseAccountTransactionsCsv(csvText: string): AccountTransactionParseResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const errors: AccountTransactionParseResult['errors'] = [];
  const rows: AccountTransactionRow[] = [];

  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 0, message: 'CSV file is empty' }], totalLines: 0 };
  }

  // Validate header row
  const headerFields = splitCsvLine(lines[0]!);
  const headerNormalized = headerFields.map((h) => h.trim());

  // Build column index map for flexibility
  const colIdx: Record<string, number> = {};
  for (let i = 0; i < headerNormalized.length; i++) {
    colIdx[headerNormalized[i]!] = i;
  }

  // Verify required columns
  const requiredCols = ['Transaction Date', 'Transaction Type', 'Transaction ID', 'Excl VAT', 'Incl VAT'];
  for (const col of requiredCols) {
    if (colIdx[col] === undefined) {
      return {
        rows: [],
        errors: [{ line: 1, message: `Missing required column: "${col}". Is this a Takealot Account Transactions CSV?` }],
        totalLines: lines.length,
      };
    }
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]!);
    const lineNum = i + 1;

    try {
      const get = (col: string): string => {
        const idx = colIdx[col];
        return idx !== undefined && idx < fields.length ? fields[idx]!.trim() : '';
      };

      // Transaction ID is required
      const transactionIdStr = get('Transaction ID');
      const transactionId = parseInt(transactionIdStr, 10);
      if (isNaN(transactionId)) {
        errors.push({ line: lineNum, message: `Invalid Transaction ID: "${transactionIdStr}"` });
        continue;
      }

      // Transaction Date is required
      const dateStr = get('Transaction Date');
      const transactionDate = parseDateOrNull(dateStr);
      if (!transactionDate) {
        errors.push({ line: lineNum, message: `Invalid Transaction Date: "${dateStr}"` });
        continue;
      }

      // Transaction Type validation (warn but still parse)
      const transactionType = get('Transaction Type');
      if (!VALID_TRANSACTION_TYPES.has(transactionType)) {
        errors.push({ line: lineNum, message: `Unknown transaction type: "${transactionType}"` });
      }

      // Order ID: "n/a" or empty → null
      const orderIdStr = get('Order ID');
      const orderId = orderIdStr && orderIdStr !== 'n/a'
        ? parseInt(orderIdStr, 10)
        : null;

      // SKU and Product Title: "n/a" → null
      const skuStr = get('SKU');
      const sku = skuStr && skuStr !== 'n/a' ? skuStr : null;
      const titleStr = get('Product Title');
      const productTitle = titleStr && titleStr !== 'n/a' ? titleStr : null;

      // Balance can be very large with many decimal places
      const balanceStr = get('Balance');
      const balanceCents = parseRandsToCents(balanceStr);

      const row: AccountTransactionRow = {
        transactionDate,
        transactionType,
        transactionId,
        description: get('Transaction Description'),
        referenceType: get('Reference Type'),
        reference: get('Reference'),
        orderId: orderId !== null && !isNaN(orderId) ? orderId : null,
        exclVatCents: parseRandsToCents(get('Excl VAT')),
        vatCents: parseRandsToCents(get('VAT')),
        inclVatCents: parseRandsToCents(get('Incl VAT')),
        balanceCents,
        sku,
        productTitle,
        disbursementCycle: parseDateOrNull(get('Disbursement Cycle')),
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
