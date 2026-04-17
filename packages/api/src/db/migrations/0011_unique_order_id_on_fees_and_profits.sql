-- Migration: Add UNIQUE constraints on order_id for profit_calculations and calculated_fees
--
-- The application code uses INSERT ... ON CONFLICT (order_id) DO UPDATE in
-- profit-processor.ts to upsert one row per order. Postgres requires a
-- unique index/constraint on the conflict target — without it the upsert
-- raises "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" and every order fails.
--
-- Defensive cleanup first: drop any duplicate rows (keep the most recent by
-- created_at) so that adding the UNIQUE constraint doesn't fail on existing
-- data. This is a no-op on fresh databases.

-- ── calculated_fees ────────────────────────────────────────────────────────
DELETE FROM calculated_fees c1
USING calculated_fees c2
WHERE c1.order_id = c2.order_id
  AND c1.created_at < c2.created_at;

ALTER TABLE calculated_fees
  ADD CONSTRAINT calculated_fees_order_id_unique UNIQUE (order_id);

-- ── profit_calculations ────────────────────────────────────────────────────
DELETE FROM profit_calculations p1
USING profit_calculations p2
WHERE p1.order_id = p2.order_id
  AND p1.created_at < p2.created_at;

ALTER TABLE profit_calculations
  ADD CONSTRAINT profit_calculations_order_id_unique UNIQUE (order_id);
