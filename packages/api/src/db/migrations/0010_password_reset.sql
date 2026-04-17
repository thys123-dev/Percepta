-- Migration: Password reset support
-- Adds two columns to the sellers table to back the forgot-password flow.
-- Token is stored as a SHA-256 hash so a DB leak doesn't expose live reset
-- tokens. Tokens expire after a short window (default 1 hour).

ALTER TABLE sellers
  ADD COLUMN IF NOT EXISTS password_reset_token_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ;

-- Lookup index for the reset endpoint (matches incoming token hash quickly)
CREATE INDEX IF NOT EXISTS sellers_password_reset_token_idx
  ON sellers (password_reset_token_hash)
  WHERE password_reset_token_hash IS NOT NULL;
