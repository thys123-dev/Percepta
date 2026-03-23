# Weeks 10-11: Polish, Mobile, Security & Beta Prep — Implementation Plan

## Context

With Weeks 1-9 complete (API sync, fee calculator, profit engine, dashboard, alerts, email notifications), Percepta needs hardening before beta launch. The codebase has known gaps: no rate limiting, no security headers, N+1 queries in profit-processor, zero Redis caching on dashboard endpoints, no code splitting, no mobile optimization, no observability, and no backup/POPIA compliance. This plan addresses all of these across 7 focused PRs.

---

## PR 1: Security Hardening

**Files to modify:**
- `packages/api/src/server.ts` — register plugins, body limits
- `packages/api/src/modules/takealot-client/index.ts` — circuit breaker, timeout
- `packages/api/src/modules/sync/workers.ts` — graceful shutdown improvements
- `packages/api/package.json` — add `@fastify/rate-limit`, `@fastify/helmet`, `cockatiel`

**Changes:**
1. Install + register `@fastify/rate-limit` (100 req/min global, 5/min on `/api/auth/login`)
2. Install + register `@fastify/helmet` (CSP, HSTS, X-Frame-Options)
3. Set Fastify `bodyLimit: 1_048_576` (1MB) globally, `10_485_760` (10MB) on CSV upload route
4. Add circuit breaker to `TakealotClient` using `cockatiel` library:
   - Break after 5 consecutive failures
   - Half-open after 30s cooldown
   - Wrap all `fetch()` calls in the breaker
5. Add 30s timeout to all Takealot API requests (AbortController)
6. Improve graceful shutdown in `workers.ts`: drain BullMQ queues, close Redis, close DB pool

**Verification:** `npx tsc --noEmit`, start server locally, confirm helmet headers in response, hit rate limit on rapid requests

---

## PR 2: Database Indexes + N+1 Fix + Combined Dashboard Query

**Files to modify:**
- `packages/api/src/db/migrations/0006_performance_indexes.sql` — new migration
- `packages/api/src/modules/fees/profit-processor.ts` — batch offer lookup
- `packages/api/src/modules/dashboard/routes.ts` — combine sequential queries

**Changes:**
1. New migration `0006_performance_indexes.sql`:
   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profit_calc_seller_offer ON profit_calculations (seller_id, offer_id);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_seller_ship_date ON orders (seller_id, date_shipped_to_customer);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_seller_order_date ON orders (seller_id, order_date);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fee_discrepancies_seller ON fee_discrepancies (seller_id, status);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_seller_type ON alerts (seller_id, alert_type, is_read);
   ```
2. Fix N+1 in `profit-processor.ts` (lines 77-95): pre-fetch all offers for the batch in one query using `inArray(schema.offers.offerId, offerIds)`, build a Map, then look up per order
3. Combine the 2 sequential queries in `dashboard/routes.ts` `/summary` endpoint into a single CTE or parallel `Promise.all`

**Verification:** Run migration on dev DB, check `EXPLAIN ANALYZE` on key queries, confirm profit-processor processes a batch without N+1

---

## PR 3: Redis Caching Layer for Dashboard

**Files to modify:**
- `packages/api/src/modules/sync/redis.ts` — add cache get/set/invalidate helpers
- `packages/api/src/modules/dashboard/routes.ts` — wrap queries with cache
- `packages/api/src/modules/sync/workers.ts` — invalidate cache after sync/profit calculation

**Changes:**
1. Add to `redis.ts`:
   - `cacheGet<T>(key: string): Promise<T | null>` — JSON parse from Redis
   - `cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void>` — JSON stringify + SETEX
   - `cacheInvalidate(pattern: string): Promise<void>` — SCAN + DEL by pattern
2. Cache dashboard endpoints with seller-scoped keys:
   - `/summary` → `dashboard:${sellerId}:summary` TTL 5min
   - `/products` → `dashboard:${sellerId}:products` TTL 5min
   - `/fee-summary` → `dashboard:${sellerId}:fee-summary` TTL 5min
3. Invalidate `dashboard:${sellerId}:*` after:
   - Profit calculation job completes
   - COGS update
   - CSV import commit

**Verification:** Hit `/api/dashboard/summary` twice, confirm second is faster (Redis HIT), trigger a sync, confirm cache invalidated

---

## PR 4: Frontend Code Splitting + Query Tuning

**Files to modify:**
- `packages/web/src/App.tsx` — lazy imports for route components
- `packages/web/src/hooks/useDashboard.ts` (or equivalent query hooks) — add staleTime
- `packages/web/src/pages/FeeAuditPage.tsx` — debounce search/filter inputs
- `packages/web/src/App.tsx` — add ErrorBoundary wrapper

**Changes:**
1. Convert page imports to `React.lazy()` + `<Suspense>`:
   - `DashboardPage`, `FeeAuditPage`, `NotificationsPage`, `OnboardingPage`, `COGSPage`
2. Set `staleTime: 5 * 60 * 1000` (5min) on dashboard queries to match Redis TTL
3. Add 300ms debounce on search/filter inputs in FeeAuditPage (and any other pages with filters)
4. Add a top-level `<ErrorBoundary>` component with a friendly fallback UI

**Verification:** Build with `npm run build`, check chunk sizes in output, confirm lazy loading in network tab, test error boundary by temporarily throwing

---

## PR 5: Mobile Optimization

**Files to modify:**
- `packages/web/src/components/layout/DashboardLayout.tsx` — mobile nav drawer
- `packages/web/src/pages/DashboardPage.tsx` — responsive grid
- `packages/web/src/pages/FeeAuditPage.tsx` — responsive table (horizontal scroll or card view)
- `packages/web/src/pages/NotificationsPage.tsx` — minor padding adjustments
- `packages/web/src/pages/COGSPage.tsx` — responsive table
- `packages/web/tailwind.config.ts` — verify breakpoints

**Changes:**
1. `DashboardLayout.tsx`: Add hamburger menu icon (visible < md), slide-out drawer for nav on mobile, overlay backdrop
2. `DashboardPage.tsx`: Stack KPI cards 2-col on tablet, 1-col on mobile. Charts full-width on mobile.
3. `FeeAuditPage.tsx`: Wrap table in `overflow-x-auto` container, or switch to card layout on mobile
4. All pages: Audit padding/margins for 375px viewport, ensure touch targets ≥ 44px
5. Test at 375px (iPhone SE), 768px (iPad), 1024px+ (desktop)

**Verification:** Use browser dev tools responsive mode at 375px, 768px, 1024px. All pages usable, no horizontal overflow, nav accessible.

---

## PR 6: Observability — Sentry + PostHog + UptimeRobot

**Files to modify:**
- `packages/api/src/server.ts` — Sentry init for API
- `packages/web/src/main.tsx` — Sentry + PostHog init for frontend
- `packages/api/src/config/env.ts` — add SENTRY_DSN, POSTHOG_KEY env vars
- `packages/api/.env.example` — add new env var placeholders

**Changes:**
1. Install `@sentry/node` in API, `@sentry/react` + `posthog-js` in web
2. API: Init Sentry in server.ts with Fastify integration, capture unhandled errors
3. Web: Init Sentry in main.tsx, wrap App in `Sentry.ErrorBoundary`
4. Web: Init PostHog with autocapture for pageviews + key events (sync_complete, csv_import, cogs_update)
5. Add SENTRY_DSN and POSTHOG_KEY to env schema (optional, like RESEND_API_KEY pattern)
6. UptimeRobot: Add `/api/health` endpoint that checks DB + Redis connectivity (no auth), document setup in README

**Verification:** Trigger an error, confirm it appears in Sentry. Load a page, confirm PostHog event fires. Hit `/api/health`, confirm 200 response.

---

## PR 7: Backups + POPIA Compliance + Beta Prep

**Files to modify:**
- `packages/api/src/modules/auth/routes.ts` — add DELETE /api/auth/account endpoint
- `packages/api/src/db/migrations/0007_popia_compliance.sql` — add `deleted_at` or account deletion cascade
- `packages/api/src/server.ts` — register new route if needed
- `packages/api/.env.example` — document backup env vars

**Changes:**
1. **Backups**: Document Railway's automated PostgreSQL backup setup (daily snapshots, 7-day retention). No code change — this is Railway config.
2. **POPIA compliance**:
   - Add `DELETE /api/auth/account` endpoint: soft-delete or hard-delete seller + cascade all associated data (orders, offers, alerts, profit_calculations, calculated_fees, fee_discrepancies)
   - Add data export endpoint `GET /api/auth/export` that returns all seller data as JSON (right of access)
3. **Beta prep**: Final checklist items — ensure all env vars documented, migration order correct, worker startup sequence clean

**Verification:** Call DELETE endpoint with test account, confirm all associated data removed. Call export endpoint, confirm complete data returned.

---

## Implementation Order

```
PR 1 (Security) → PR 2 (DB Perf) → PR 3 (Redis Cache) → PR 4 (Frontend Perf)
                                                        → PR 5 (Mobile) [parallel with PR 4]
PR 6 (Observability) → PR 7 (POPIA + Beta Prep)
```

PRs 4 and 5 can be developed in parallel as they touch different files. PR 3 depends on PR 2 (indexes should exist before caching layer). PR 6 and 7 are independent of the performance PRs.

---

## Key Existing Code to Reuse

| Pattern | Location | Reuse in |
|---------|----------|----------|
| `authenticate` middleware | `packages/api/src/middleware/auth.ts` | New auth endpoints (PR 7) |
| Redis connection | `packages/api/src/modules/sync/redis.ts` | Cache helpers (PR 3) |
| BullMQ queue pattern | `packages/api/src/modules/sync/queues.ts` | No new queues needed |
| Zod validation pattern | `packages/api/src/modules/email/routes.ts` | New route validation |
| Fire-and-forget `.catch()` | `alert-generator.ts` | Non-critical side effects |
| `env.ts` optional var pattern | `RESEND_API_KEY` in `config/env.ts` | SENTRY_DSN, POSTHOG_KEY |
