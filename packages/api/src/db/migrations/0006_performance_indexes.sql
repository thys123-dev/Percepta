-- Performance indexes for dashboard queries and profit calculation pipeline
-- All use CONCURRENTLY to avoid locking tables during creation

-- profit_calculations: seller-scoped offer lookups (dashboard products, margin-drop alerts)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profit_calc_seller_offer
  ON profit_calculations (seller_id, offer_id);

-- orders: seller-scoped date range queries (dashboard summary, daily sync)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_seller_ship_date
  ON orders (seller_id, date_shipped_to_customer);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_seller_order_date
  ON orders (seller_id, order_date);

-- fee_discrepancies: seller-scoped status filtering (fee audit page)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fee_discrepancies_seller
  ON fee_discrepancies (seller_id, status);

-- alerts: seller-scoped unread alert lookups (dedup guard + badge count)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_seller_type
  ON alerts (seller_id, alert_type, is_read);
