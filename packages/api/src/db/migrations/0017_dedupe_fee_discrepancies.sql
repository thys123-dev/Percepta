-- 0017_dedupe_fee_discrepancies.sql
--
-- The detectFeeDiscrepancies INSERT used `.onConflictDoNothing()` with no
-- target, so it fell back to the primary key (random UUID) — which never
-- conflicts. Every profit recalculation produced fresh rows for the same
-- (seller, order, fee_type), accumulating duplicates.
--
-- We saw 4× copies of the same Lunapad 11 success_fee discrepancy in
-- production data after a few re-imports.
--
-- This migration:
--   1) Collapses duplicates to one row per (seller_id, order_id, fee_type),
--      keeping the most recently created (it has the freshest calculated
--      value), and preserving any status/note set on later rows.
--   2) Adds a UNIQUE constraint so future inserts can use it as a conflict
--      target for upserts.

-- ── 1) Dedupe ────────────────────────────────────────────────────────────
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY seller_id, order_id, fee_type
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM fee_discrepancies
)
DELETE FROM fee_discrepancies fd
USING ranked
WHERE fd.id = ranked.id
  AND ranked.rn > 1;

-- ── 2) Add the unique constraint ─────────────────────────────────────────
ALTER TABLE fee_discrepancies
  ADD CONSTRAINT fee_discrepancies_seller_order_fee_unique
  UNIQUE (seller_id, order_id, fee_type);
