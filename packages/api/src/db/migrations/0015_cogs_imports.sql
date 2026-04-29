-- 0015_cogs_imports.sql
-- Adds the cogs_imports audit ledger so the COGS upload UI can show
-- "last upload" feedback consistent with Sales Report / Account Transactions
-- / Returns Export.

CREATE TABLE IF NOT EXISTS cogs_imports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id         UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  file_name         VARCHAR(255) NOT NULL,
  row_count         INTEGER NOT NULL,
  matched_count     INTEGER DEFAULT 0,
  unmatched_count   INTEGER DEFAULT 0,
  status            VARCHAR(20) DEFAULT 'pending',
  error_message     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cogs_imports_seller
  ON cogs_imports(seller_id);
