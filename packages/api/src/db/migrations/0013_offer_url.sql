-- Migration: store the live Takealot offer URL on each offer
--
-- Takealot's /v2/offers response includes an `offer_url` field per offer
-- (e.g. "https://www.takealot.com/x/PLID43811774") that redirects to the
-- live product page. We've been ignoring it during sync, which forced
-- the UI to do a TSIN-search fallback that turned out to be unreliable
-- (Takealot's search doesn't always index TSIN numbers).
--
-- Storing the URL lets the inventory and COGS rows link straight to
-- the exact product page in one click.

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS offer_url TEXT;
