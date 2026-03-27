ALTER TABLE sellers
  ADD COLUMN IF NOT EXISTS monthly_revenue_target_cents integer;
