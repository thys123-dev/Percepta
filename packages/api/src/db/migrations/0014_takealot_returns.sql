-- 0014_takealot_returns.sql
-- Adds support for importing the Takealot Returns Export (XLSX).
-- Two new tables:
--   takealot_return_imports — per-upload audit ledger
--   takealot_returns        — one row per RRN (Return Reference Number)

-- ============================================================================
-- Takealot return imports tracking (mirrors account_transaction_imports)
-- ============================================================================

CREATE TABLE IF NOT EXISTS takealot_return_imports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id         UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  file_name         VARCHAR(255) NOT NULL,
  row_count         INTEGER NOT NULL,
  inserted_count    INTEGER DEFAULT 0,
  duplicate_count   INTEGER DEFAULT 0,
  orders_updated    INTEGER DEFAULT 0,
  status            VARCHAR(20) DEFAULT 'pending',
  error_message     TEXT,
  date_range_start  TIMESTAMPTZ,
  date_range_end    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_takealot_return_imports_seller
  ON takealot_return_imports(seller_id);

-- ============================================================================
-- Individual return rows from the Takealot Returns Export XLSX
-- ============================================================================

CREATE TABLE IF NOT EXISTS takealot_returns (
  id                                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id                         UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  import_id                         UUID REFERENCES takealot_return_imports(id) ON DELETE SET NULL,
  rrn                               VARCHAR(64) NOT NULL,
  order_id                          INTEGER,
  return_date                       TIMESTAMPTZ NOT NULL,
  product_title                     VARCHAR(500),
  sku                               VARCHAR(255),
  tsin                              INTEGER,
  return_reason                     VARCHAR(64),
  customer_comment                  TEXT,
  quantity                          INTEGER NOT NULL DEFAULT 1,
  region                            VARCHAR(10),
  -- Normalised: 'sellable' | 'removal_order' | null (for in-flight returns)
  stock_outcome                     VARCHAR(20),
  seller_note                       TEXT,
  -- Reversal amounts in cents (negative for refunds)
  customer_order_reversal_cents     INTEGER,
  success_fee_reversal_cents        INTEGER,
  fulfillment_fee_reversal_cents    INTEGER,
  courier_fee_reversal_cents        INTEGER,
  removal_order_number              VARCHAR(64),
  date_ready_to_collect             TIMESTAMPTZ,
  date_added_to_stock               TIMESTAMPTZ,
  -- Future-proof: full original row preserved as JSON
  raw_row                           JSONB,
  created_at                        TIMESTAMPTZ DEFAULT NOW(),
  updated_at                        TIMESTAMPTZ DEFAULT NOW()
);

-- Dedup: same seller + RRN = skip on re-import (RRN is unique per return event)
CREATE UNIQUE INDEX IF NOT EXISTS idx_takealot_returns_seller_rrn
  ON takealot_returns(seller_id, rrn);

CREATE INDEX IF NOT EXISTS idx_takealot_returns_seller_order
  ON takealot_returns(seller_id, order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_takealot_returns_seller_sku
  ON takealot_returns(seller_id, sku);

CREATE INDEX IF NOT EXISTS idx_takealot_returns_seller_reason
  ON takealot_returns(seller_id, return_reason);

CREATE INDEX IF NOT EXISTS idx_takealot_returns_seller_date
  ON takealot_returns(seller_id, return_date);

-- Partial index for the future "Removal Orders awaiting collection" view.
CREATE INDEX IF NOT EXISTS idx_takealot_returns_seller_removal
  ON takealot_returns(seller_id, removal_order_number)
  WHERE removal_order_number IS NOT NULL;
