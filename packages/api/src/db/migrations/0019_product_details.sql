-- 0019_product_details.sql
--
-- Adds support for importing the Takealot Product Details report. The
-- Takealot offers API returns a NULL `category` for most listings, so our
-- success-fee calculator was falling back to a 12% default and producing
-- thousands of false-positive discrepancies. Sellers can already download
-- a Product Details CSV from the Seller Portal that contains the real
-- category, dimensions, brand, and (most usefully) Takealot's published
-- per-product fees.
--
-- This migration:
--   1) Creates an audit ledger for these uploads (mirror of other importers).
--   2) Adds `brand`, `success_fee_rate_pct`, and `fulfilment_fee_cents`
--      columns to `offers` so we can store Takealot's published fees
--      per-listing — more accurate than the category-table lookup.
--   (Existing columns we already use: category, weight_grams, length_mm,
--    width_mm, height_mm, volume_cm3.)

CREATE TABLE IF NOT EXISTS product_details_imports (
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

CREATE INDEX IF NOT EXISTS idx_product_details_imports_seller
  ON product_details_imports(seller_id);

ALTER TABLE offers ADD COLUMN IF NOT EXISTS brand VARCHAR(100);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS success_fee_rate_pct NUMERIC(7, 4);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS fulfilment_fee_cents INTEGER;
