-- Migration: Add resolved workflow fields to fee_discrepancies
-- Date: 2026-03-18
-- Context: Week 8 — Fee audit acknowledge/dispute workflow

ALTER TABLE fee_discrepancies ADD COLUMN IF NOT EXISTS resolved_note TEXT;
ALTER TABLE fee_discrepancies ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
