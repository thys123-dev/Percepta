-- Migration: Add email notification preference fields to sellers table
-- Week 9: Weekly Profit Report + Email Notifications

ALTER TABLE sellers
  ADD COLUMN IF NOT EXISTS email_weekly_digest   BOOLEAN        NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_loss_alerts      BOOLEAN        NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_margin_threshold DECIMAL(5,2)   NOT NULL DEFAULT 15.00,
  ADD COLUMN IF NOT EXISTS last_weekly_digest_at  TIMESTAMPTZ;
