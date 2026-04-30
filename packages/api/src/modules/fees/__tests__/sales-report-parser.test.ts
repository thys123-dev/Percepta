import { describe, it, expect } from 'vitest';
import { parseSalesReportCsv } from '../sales-report-parser.js';

// =============================================================================
// Sample CSV matching exact Takealot sales report format (20 columns)
// =============================================================================

const HEADER = [
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
].join(',');

function makeCsvRow(overrides: Partial<Record<string, string>> = {}): string {
  const defaults: Record<string, string> = {
    orderDate: '2026-03-15',
    saleStatus: 'Shipped to Customer',
    orderId: '12345678',
    customer: 'John Doe',
    productTitle: 'Test Product ABC',
    sku: 'SKU-001',
    tsin: '98765',
    qty: '2',
    fulfilmentDc: 'JHB',
    customerDc: 'CPT',
    grossSales: '500.00',
    dailyDealPromo: '',
    successFee: '75.00',
    fulfilmentFee: '44.00',
    courierCollectionFee: '12.50',
    stockTransferFee: '25.00',
    netSalesAmount: '343.50',
    shipmentName: 'SHP-2026031500001',
    poNumber: 'PO12345',
    dateShippedToCustomer: '2026-03-16',
  };

  const vals = { ...defaults, ...overrides };
  return [
    vals.orderDate,
    vals.saleStatus,
    vals.orderId,
    vals.customer,
    vals.productTitle,
    vals.sku,
    vals.tsin,
    vals.qty,
    vals.fulfilmentDc,
    vals.customerDc,
    vals.grossSales,
    vals.dailyDealPromo,
    vals.successFee,
    vals.fulfilmentFee,
    vals.courierCollectionFee,
    vals.stockTransferFee,
    vals.netSalesAmount,
    vals.shipmentName,
    vals.poNumber,
    vals.dateShippedToCustomer,
  ].join(',');
}

// =============================================================================
// Tests
// =============================================================================

describe('parseSalesReportCsv', () => {
  it('parses a valid CSV with one data row', () => {
    const csv = `${HEADER}\n${makeCsvRow()}`;
    const result = parseSalesReportCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);

    const row = result.rows[0]!;
    expect(row.orderId).toBe(12345678);
    expect(row.quantity).toBe(2);
    expect(row.grossSalesCents).toBe(50000);
    expect(row.successFeeCents).toBe(7500);
    expect(row.fulfilmentFeeCents).toBe(4400);
    expect(row.courierCollectionFeeCents).toBe(1250);
    expect(row.stockTransferFeeCents).toBe(2500);
    expect(row.netSalesAmountCents).toBe(34350);
    expect(row.sku).toBe('SKU-001');
    expect(row.tsin).toBe(98765);
    expect(row.fulfilmentDc).toBe('JHB');
    expect(row.customerDc).toBe('CPT');
    expect(row.saleStatus).toBe('Shipped to Customer');
    expect(row.shipmentName).toBe('SHP-2026031500001');
    expect(row.poNumber).toBe('PO12345');
  });

  it('parses actual ship date correctly', () => {
    const csv = `${HEADER}\n${makeCsvRow({ dateShippedToCustomer: '2026-04-02' })}`;
    const result = parseSalesReportCsv(csv);

    expect(result.rows[0]!.dateShippedToCustomer).toEqual(new Date('2026-04-02'));
  });

  it('handles empty ship date (pending orders)', () => {
    const csv = `${HEADER}\n${makeCsvRow({ dateShippedToCustomer: '' })}`;
    const result = parseSalesReportCsv(csv);

    expect(result.rows[0]!.dateShippedToCustomer).toBeNull();
  });

  it('converts Rands to cents correctly', () => {
    const csv = `${HEADER}\n${makeCsvRow({ grossSales: '1 250.99', successFee: '187.65' })}`;
    const result = parseSalesReportCsv(csv);

    // "1 250.99" (South African space-separated thousands) → 125099 cents
    expect(result.rows[0]!.grossSalesCents).toBe(125099);
    expect(result.rows[0]!.successFeeCents).toBe(18765);
  });

  it('handles negative fee amounts', () => {
    const csv = `${HEADER}\n${makeCsvRow({ stockTransferFee: '-15.00' })}`;
    const result = parseSalesReportCsv(csv);

    expect(result.rows[0]!.stockTransferFeeCents).toBe(-1500);
  });

  it('handles quoted fields with commas in product title', () => {
    const csv = `${HEADER}\n2026-03-15,Shipped to Customer,12345678,John Doe,"Product, With Comma",SKU-001,98765,1,JHB,JHB,100.00,,15.00,22.00,0,0,63.00,SHP-001,PO1,2026-03-16`;
    const result = parseSalesReportCsv(csv);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.productTitle).toBe('Product, With Comma');
  });

  it('handles multiple rows', () => {
    const row1 = makeCsvRow({ orderId: '1001', grossSales: '100.00' });
    const row2 = makeCsvRow({ orderId: '1002', grossSales: '200.00' });
    const row3 = makeCsvRow({ orderId: '1003', grossSales: '300.00' });
    const csv = `${HEADER}\n${row1}\n${row2}\n${row3}`;
    const result = parseSalesReportCsv(csv);

    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]!.orderId).toBe(1001);
    expect(result.rows[1]!.orderId).toBe(1002);
    expect(result.rows[2]!.orderId).toBe(1003);
    expect(result.rows[0]!.grossSalesCents).toBe(10000);
    expect(result.rows[1]!.grossSalesCents).toBe(20000);
    expect(result.rows[2]!.grossSalesCents).toBe(30000);
  });

  it('skips rows with invalid Order ID', () => {
    const csv = `${HEADER}\n${makeCsvRow({ orderId: 'INVALID' })}\n${makeCsvRow({ orderId: '99999' })}`;
    const result = parseSalesReportCsv(csv);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.orderId).toBe(99999);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.line).toBe(2);
    expect(result.errors[0]!.message).toContain('Invalid Order ID');
  });

  it('skips rows with invalid Qty', () => {
    const csv = `${HEADER}\n${makeCsvRow({ qty: '0' })}`;
    const result = parseSalesReportCsv(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain('Invalid Qty');
  });

  it('treats empty/missing fee cells as null (not 0) so unshipped orders skip discrepancy detection', () => {
    const csv = `${HEADER}\n${makeCsvRow({ courierCollectionFee: '', stockTransferFee: '' })}`;
    const result = parseSalesReportCsv(csv);

    expect(result.rows[0]!.courierCollectionFeeCents).toBeNull();
    expect(result.rows[0]!.stockTransferFeeCents).toBeNull();
  });

  it('still parses "0.00" as 0 (legitimate zero, not a missing value)', () => {
    const csv = `${HEADER}\n${makeCsvRow({ courierCollectionFee: '0.00', stockTransferFee: '0.00' })}`;
    const result = parseSalesReportCsv(csv);

    expect(result.rows[0]!.courierCollectionFeeCents).toBe(0);
    expect(result.rows[0]!.stockTransferFeeCents).toBe(0);
  });

  it('returns error for empty CSV', () => {
    const result = parseSalesReportCsv('');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain('empty');
  });

  it('returns error for CSV with wrong columns', () => {
    const csv = 'Column A,Column B,Column C\n1,2,3';
    const result = parseSalesReportCsv(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('handles Daily Deal/Promo field', () => {
    const csv = `${HEADER}\n${makeCsvRow({ dailyDealPromo: 'Daily Deal' })}`;
    const result = parseSalesReportCsv(csv);

    expect(result.rows[0]!.dailyDealPromo).toBe('Daily Deal');
  });

  it('handles TSIN as null when empty', () => {
    const csv = `${HEADER}\n${makeCsvRow({ tsin: '' })}`;
    const result = parseSalesReportCsv(csv);

    expect(result.rows[0]!.tsin).toBeNull();
  });

  it('handles R prefix in monetary values', () => {
    const csv = `${HEADER}\n${makeCsvRow({ grossSales: 'R500.00', successFee: 'R75.00' })}`;
    const result = parseSalesReportCsv(csv);

    expect(result.rows[0]!.grossSalesCents).toBe(50000);
    expect(result.rows[0]!.successFeeCents).toBe(7500);
  });

  it('handles Windows-style line endings (CRLF)', () => {
    const csv = `${HEADER}\r\n${makeCsvRow()}\r\n${makeCsvRow({ orderId: '99' })}`;
    const result = parseSalesReportCsv(csv);

    expect(result.rows).toHaveLength(2);
  });
});
