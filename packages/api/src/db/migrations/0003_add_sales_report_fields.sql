-- Migration: Add sales report CSV import fields + fee auditing tables
-- Date: 2026-03-18
-- Context: Optimizations based on analysis of 4 Takealot seller documents:
--   1. Sales report CSV (actual fees, ship dates)
--   2. Tax invoice PDF (fee reconciliation)
--   3. Bulk replenishment template (per-DC stock: DBN)
--   4. Offers template (leadtime days)

-- =============================================================================
-- 1. Offers: Add DBN stock + leadtime tracking
-- =============================================================================

ALTER TABLE offers ADD COLUMN IF NOT EXISTS stock_dbn INTEGER DEFAULT 0;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS leadtime_days INTEGER DEFAULT 0;

-- =============================================================================
-- 2. Orders: Add actual ship date + actual fee amounts from sales report CSV
-- =============================================================================

-- Actual ship date (ground truth for fee matrix version selection)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS date_shipped_to_customer TIMESTAMPTZ;

-- Actual fees Takealot charged (from CSV, for reconciliation)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gross_sales_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_success_fee_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_fulfilment_fee_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_collection_fee_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_stock_transfer_fee_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS net_sales_amount_cents INTEGER;

-- Extra CSV metadata fields
ALTER TABLE orders ADD COLUMN IF NOT EXISTS daily_deal_promo VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_name VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS po_number VARCHAR(100);

-- =============================================================================
-- 3. Sales report import tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS sales_report_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  row_count INTEGER NOT NULL,
  matched_count INTEGER DEFAULT 0,
  unmatched_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sales_imports_seller_idx ON sales_report_imports(seller_id);

-- =============================================================================
-- 4. Fee discrepancies (actual vs calculated)
-- =============================================================================

CREATE TABLE IF NOT EXISTS fee_discrepancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  import_id UUID REFERENCES sales_report_imports(id) ON DELETE SET NULL,
  fee_type VARCHAR(30) NOT NULL,
  actual_cents INTEGER NOT NULL,
  calculated_cents INTEGER NOT NULL,
  discrepancy_cents INTEGER NOT NULL,
  discrepancy_pct DECIMAL(7, 2),
  status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS discrepancies_seller_idx ON fee_discrepancies(seller_id);
CREATE INDEX IF NOT EXISTS discrepancies_seller_status_idx ON fee_discrepancies(seller_id, status);
