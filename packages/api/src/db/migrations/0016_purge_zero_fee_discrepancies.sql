-- 0016_purge_zero_fee_discrepancies.sql
--
-- Cleanup for the fee-discrepancy false-positive bug:
--
-- The Sales Report parser used to read blank fee cells as 0 cents, and the
-- discrepancy detector flagged any row where actual=0 && calculated>0. The
-- combined effect was that every unshipped order in a CSV import generated
-- 1–3 spurious "Takealot undercharged you" rows.
--
-- After this migration:
--   - The parser stores blank cells as NULL (the detector now skips nulls).
--   - The detector also skips actual=0 rows (legitimate zeros / waivers).
--   - This migration removes the existing bad rows.
--
-- After running, sellers can re-import their Sales Report CSV to regenerate
-- discrepancies cleanly for shipped orders only.

DELETE FROM fee_discrepancies
WHERE actual_cents = 0;
