-- 0009_webhook_events_dedup_index.sql
-- Adds a partial unique index on webhook_events(seller_id, delivery_id) where
-- delivery_id IS NOT NULL. This makes the onConflictDoNothing() in the webhook
-- route effective at the DB layer, preventing duplicate event rows when Takealot
-- retries a delivery. BullMQ continues to deduplicate job *execution* separately
-- via jobId — these two guards are complementary, not redundant.

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_seller_delivery
  ON webhook_events (seller_id, delivery_id)
  WHERE delivery_id IS NOT NULL;
