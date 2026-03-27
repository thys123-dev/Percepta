-- 0007_account_transactions.sql
-- Adds support for importing Takealot Account Transactions CSV.
-- Three new tables: account_transaction_imports, account_transactions, seller_costs
-- Two new columns on orders: reversal_amount_cents, has_reversal

-- ============================================================================
-- Account transaction imports tracking (mirrors sales_report_imports pattern)
-- ============================================================================

CREATE TABLE IF NOT EXISTS account_transaction_imports (
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

CREATE INDEX IF NOT EXISTS idx_acct_imports_seller
  ON account_transaction_imports(seller_id);

-- ============================================================================
-- Individual account transaction rows from CSV
-- ============================================================================

CREATE TABLE IF NOT EXISTS account_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id           UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  import_id           UUID REFERENCES account_transaction_imports(id) ON DELETE SET NULL,
  transaction_date    TIMESTAMPTZ NOT NULL,
  transaction_type    VARCHAR(50) NOT NULL,
  transaction_id      BIGINT NOT NULL,
  description         TEXT,
  reference_type      VARCHAR(50),
  reference           TEXT,
  order_id            INTEGER,
  excl_vat_cents      INTEGER NOT NULL,
  vat_cents           INTEGER NOT NULL,
  incl_vat_cents      INTEGER NOT NULL,
  balance_cents       BIGINT,
  sku                 VARCHAR(255),
  product_title       VARCHAR(500),
  disbursement_cycle  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Dedup: same seller + Takealot transaction ID = skip on re-import
CREATE UNIQUE INDEX IF NOT EXISTS idx_acct_txn_seller_txnid
  ON account_transactions(seller_id, transaction_id);

CREATE INDEX IF NOT EXISTS idx_acct_txn_seller_type
  ON account_transactions(seller_id, transaction_type);

CREATE INDEX IF NOT EXISTS idx_acct_txn_seller_date
  ON account_transactions(seller_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_acct_txn_seller_order
  ON account_transactions(seller_id, order_id)
  WHERE order_id IS NOT NULL;

-- ============================================================================
-- Monthly aggregated non-order costs (subscription, ads, removals, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS seller_costs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id             UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  month                 DATE NOT NULL,
  cost_type             VARCHAR(50) NOT NULL,
  total_excl_vat_cents  INTEGER NOT NULL DEFAULT 0,
  total_vat_cents       INTEGER NOT NULL DEFAULT 0,
  total_incl_vat_cents  INTEGER NOT NULL DEFAULT 0,
  transaction_count     INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_costs_unique
  ON seller_costs(seller_id, month, cost_type);

-- ============================================================================
-- Reversal tracking on orders table
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS reversal_amount_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS has_reversal BOOLEAN DEFAULT false;
