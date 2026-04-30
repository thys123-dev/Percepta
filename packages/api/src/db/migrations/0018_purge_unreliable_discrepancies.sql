-- 0018_purge_unreliable_discrepancies.sql
--
-- After 0017 we know each (seller, order, fee_type) has exactly one row, but
-- the existing rows include thousands of discrepancies that were generated
-- when our calculator had no reliable inputs:
--   - success_fee with offer.category IS NULL → the calc fell back to a 12%
--     default that's wildly wrong for most products (real Takealot tablet/
--     phone rates sit around 8–10%).
--   - fulfilment_fee with no offer dimensions → the calc used a placeholder
--     size tier.
--
-- detectFeeDiscrepancies now skips these cases at generation time, but
-- existing rows have to be cleaned up separately. We deliberately leave any
-- row a seller has already acknowledged or disputed alone — that user
-- decision must survive cleanup.

-- Purge unreliable success_fee discrepancies (no category on the offer)
DELETE FROM fee_discrepancies fd
USING orders o
LEFT JOIN offers off
  ON off.offer_id = o.offer_id
  AND off.seller_id = o.seller_id
WHERE fd.order_id = o.id
  AND fd.fee_type = 'success_fee'
  AND fd.status = 'open'
  AND off.category IS NULL;

-- Purge unreliable fulfilment_fee discrepancies (no dimensions on the offer)
DELETE FROM fee_discrepancies fd
USING orders o
LEFT JOIN offers off
  ON off.offer_id = o.offer_id
  AND off.seller_id = o.seller_id
WHERE fd.order_id = o.id
  AND fd.fee_type = 'fulfilment_fee'
  AND fd.status = 'open'
  AND (off.weight_grams IS NULL OR off.volume_cm3 IS NULL);
