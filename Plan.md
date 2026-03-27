# Testing with Mock Data — Implementation Plan

## Context

Percepta cannot be tested end-to-end without a real Takealot Seller API key. The developer needs a way to populate the entire application — dashboard, alerts, fee audit, COGS page — with realistic dummy data and run the full sync pipeline against a mock Takealot API. This plan adds a **seed script**, a **MockTakealotClient**, and **static test fixtures** with minimal changes to production code (3 files modified).

---

## Approach: Seed Script + Mock Client + Fixtures

| Layer | Purpose | How it works |
|-------|---------|-------------|
| **Database seed** (`npm run seed`) | Populate dashboard immediately | Inserts demo seller, 12 offers, ~180 orders, calculated fees, profit records, alerts directly via Drizzle ORM |
| **MockTakealotClient** | Test sync pipeline end-to-end | Drop-in replacement for `TakealotClient` when `DEMO_MODE=true`; returns the same 12 products and ~180 orders in Takealot API response format |
| **Static fixtures** | Test CSV import + webhooks | A sample `sales-report.csv` and webhook JSON payloads for manual/automated testing |

---

## PR 1: Demo Data Definitions + Seed Script

### New files

**`packages/api/src/db/seeds/demo-data.ts`** — All product/order/alert data as typed constants

**Demo Seller:**
- Email: `demo@percepta.co.za` / Password: `DemoPass123!`
- Business name: "Kalahari Goods Co."
- API key: `demo-api-key-12345` (encrypted with AES-256 using existing `encrypt()`)
- Fixed UUID: `00000000-0000-4000-a000-000000000001`
- `onboardingComplete: true`, `initialSyncStatus: 'complete'`

**12 Products across 6 categories** (designed to exercise every fee path):

| # | Title | Category | Price | Weight | Volume | Scenario |
|---|-------|----------|-------|--------|--------|----------|
| 1 | Braai Master Tongs Set | Homeware | R349 | 800g | 3,000 cm³ | ✅ Profitable, Standard_General |
| 2 | Rooibos Face Cream 50ml | Beauty | R199 | 200g | 500 cm³ | ✅ Profitable, Standard_FMCG |
| 3 | Biltong Box 1kg Premium | Non-Perishable | R299 | 1,100g | 5,000 cm³ | ✅ Standard_NonPerishable, some IBT |
| 4 | Wireless Earbuds Pro ZA | Electronic Accessories | R899 | 150g | 400 cm³ | ✅ Standard_Electronics |
| 5 | Kids Safari Puzzle 500pc | Toys | R149 | 600g | 8,000 cm³ | ✅ High volume, profitable |
| 6 | Camping Chair Deluxe | Camping & Outdoor | R1,499 | 8.5kg | 60,000 cm³ | ⚠️ Large+Heavy, marginal |
| 7 | Yoga Mat Premium 6mm | Sport | R449 | 2kg | 45,000 cm³ | ⚠️ Large tier |
| 8 | Baby Monitor WiFi | Baby | R1,999 | 400g | 2,000 cm³ | ⚠️ Overstocked (40 days), storage fees |
| 9 | Garden Umbrella 3m | Garden, Pool & Patio | R2,499 | 12kg | 160,000 cm³ | Oversize+Heavy |
| 10 | Office Desk Stand | Office Furniture | R3,499 | 15kg | 220,000 cm³ | Bulky, marginal |
| 11 | Phone Case Ultra Thin | Mobile | R99 | 50g | 200 cm³ | 🔴 Loss-maker (low margin eaten by fees) |
| 12 | LED Smart Bulb 4-Pack | Smart Home | R599 | 600g | 4,000 cm³ | 🔴 Overstocked + loss-maker |

**~180 orders over 90 days:**
- Status mix: ~70% Shipped, ~10% Delivered, ~8% Accepted, ~5% Returned, ~4% Cancelled, ~3% Return Requested
- DC mix: ~60% same-region, ~25% IBT (JHB↔CPT), ~15% DBN
- Qty mix: ~80% qty=1, ~15% qty=2, ~5% qty=3-5
- ~10% of orders have a promotion string
- Dates distributed with recent-day bias (more orders in last 30 days for meaningful trends)
- Deterministic PRNG (seeded mulberry32) so re-runs produce identical data

**8-10 alerts:**
- 2 × loss_maker (products #11, #12) — 1 read, 1 unread
- 1 × margin_drop (product #6)
- 2 × storage_warning (products #8, #12)
- 1 × fee_overcharge
- Mix of warning/critical severity

**`packages/api/src/db/seeds/seed.ts`** — Main entry point

```
1. Connect to DB (uses existing DATABASE_URL)
2. Check if demo seller exists → DELETE cascade all data for that seller ID
3. Insert demo seller (bcrypt hash password, encrypt API key)
4. Insert 12 offers with proper sizeTier/weightTier classification
5. Insert ~180 orders using deterministic PRNG
6. For each order: call real calculateFees() + calculateProfit() from fee-calculator.ts
   → inserts into calculated_fees and profit_calculations
   (This guarantees seeded profit numbers match the real pipeline exactly)
7. Insert alerts
8. Log summary: "✅ Seeded: 1 seller, 12 products, N orders, N alerts"
```

**Key design decisions:**
- Uses real `calculateFees()` and `calculateProfit()` — no hardcoded fee amounts
- Fixed seller UUID for reliable idempotent delete-and-recreate
- `db.delete().where(eq(sellerId, DEMO_SELLER_ID))` with FK cascade handles cleanup
- Imports `encrypt` from existing `config/encryption.ts` for API key storage

### Modified files

- `packages/api/package.json` — add `"seed": "tsx src/db/seeds/seed.ts"`
- Root `package.json` — add `"seed": "npm run seed -w packages/api"`

---

## PR 2: MockTakealotClient + DEMO_MODE

### New files

**`packages/api/src/modules/takealot-client/mock-client.ts`**

A class that implements the same public methods as `TakealotClient`:

| Method | Behaviour |
|--------|-----------|
| `testConnection()` | Returns `true` after 200ms delay |
| `getOfferCount()` | Returns `{ total: 12 }` |
| `getOffers(page)` | Returns paginated `TakealotOffer[]` from demo-data |
| `fetchAllOffers(onProgress?)` | Async generator yielding all 12 offers in one batch |
| `getSales(start, end, page)` | Returns paginated `TakealotSale[]` filtered by date range |
| `fetchAllSales(start, end, onProgress?)` | Async generator yielding deterministic orders |
| `getOffer(offerId)` | Single offer lookup |
| `getRateLimitStatus()` | Returns healthy rate limit state |

- Uses the same product definitions from `demo-data.ts`
- Generates orders using the same deterministic PRNG as the seed script
- Adds 100-500ms `setTimeout` delays to simulate network latency
- Returns data in exact `TakealotPaginatedResponse` format

### Modified files (production code — 2 files)

**`packages/api/src/config/env.ts`** — Add 1 line:
```typescript
DEMO_MODE: z.coerce.boolean().default(false),
```

**`packages/api/src/modules/sync/utils/get-seller-client.ts`** — Add ~5 lines after API key decryption:
```typescript
const apiKey = decrypt(seller.apiKeyEnc);
if (env.DEMO_MODE && apiKey === 'demo-api-key-12345') {
  const { MockTakealotClient } = await import('../../takealot-client/mock-client.js');
  return new MockTakealotClient() as unknown as TakealotClient;
}
```
Dynamic `import()` ensures mock module is never loaded in production.

---

## PR 3: Static Fixtures (CSV + Webhook Payloads)

### New files

**`packages/api/fixtures/sample-sales-report.csv`**
- 30 rows matching the exact 20-column format from `sales-report-parser.ts`
- Uses a subset of seeded order IDs for matching
- Intentionally includes:
  - 2 rows where success fee differs from calculated by >5% (triggers fee discrepancy)
  - 1 row with a mismatched stock transfer fee
  - Mix of "Shipped", "Delivered", "Returned" statuses
  - Ship dates spanning both v1 and v2 fee matrix periods
  - Realistic Rand formatting (e.g. "1250.50")

**`packages/api/fixtures/webhook-new-order.json`**
- Valid `NewOrderPayload` for product #1, amounts in Rands
- Includes `event_type: "New Leadtime Order"` and a unique `delivery_id`

**`packages/api/fixtures/webhook-status-changed.json`**
- Status change from "Shipped" to "Delivered" for an existing seeded order

**`packages/api/fixtures/webhook-offer-updated.json`**
- Price change for product #4 (Wireless Earbuds)

---

## Developer Workflow After Implementation

```bash
# 1. Seed the database (safe to re-run)
npm run seed
# Output: ✅ Seeded: 1 seller, 12 products, 183 orders, 8 alerts

# 2. Start API in demo mode
DEMO_MODE=true npm run dev:api

# 3. Start frontend
npm run dev:web

# 4. Login with demo credentials
#    Email: demo@percepta.co.za
#    Password: DemoPass123!

# 5. Dashboard is fully populated:
#    - 12 products with realistic margins
#    - KPI scorecard with trends
#    - Fee breakdown chart
#    - 2 loss-makers surfaced at top of product table
#    - 6+ unread alerts in bell badge

# 6. Test sync pipeline (uses MockTakealotClient)
#    Click "Sync Now" in the UI or:
curl -X POST http://localhost:3001/api/sync/trigger \
  -H "Authorization: Bearer <token>"

# 7. Test webhook processing
curl -X POST http://localhost:3001/api/webhooks/takealot/00000000-0000-4000-a000-000000000001 \
  -H "Content-Type: application/json" \
  -d @packages/api/fixtures/webhook-new-order.json

# 8. Test CSV fee audit
#    Upload packages/api/fixtures/sample-sales-report.csv via the Fee Audit page
#    → 3 discrepancies should appear
```

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `packages/api/src/db/seeds/demo-data.ts` | CREATE | Product/order/alert definitions |
| `packages/api/src/db/seeds/seed.ts` | CREATE | Seed script entry point |
| `packages/api/src/modules/takealot-client/mock-client.ts` | CREATE | MockTakealotClient class |
| `packages/api/fixtures/sample-sales-report.csv` | CREATE | Sample CSV for fee audit |
| `packages/api/fixtures/webhook-new-order.json` | CREATE | Webhook test payload |
| `packages/api/fixtures/webhook-status-changed.json` | CREATE | Webhook test payload |
| `packages/api/fixtures/webhook-offer-updated.json` | CREATE | Webhook test payload |
| `packages/api/src/config/env.ts` | MODIFY | Add `DEMO_MODE` env var (1 line) |
| `packages/api/src/modules/sync/utils/get-seller-client.ts` | MODIFY | Mock client swap (5 lines) |
| `packages/api/package.json` | MODIFY | Add `seed` script |
| Root `package.json` | MODIFY | Add `seed` script |

**Total production code changes: 3 files, ~6 lines**

---

## Verification

1. **Seed script**: Run `npm run seed` → confirm no errors, check DB has 12 offers, ~180 orders, profit records
2. **Dashboard**: Login as demo user → all 4 KPI cards populated, product table shows 12 products with mix of green/yellow/red margins
3. **Alerts**: Bell badge shows unread count, alerts page has loss-maker and storage warnings
4. **COGS page**: All 12 products visible, mix of ✓ manual and ⚠ estimated badges
5. **Sync flow**: Trigger sync with `DEMO_MODE=true` → MockTakealotClient serves data → profit recalculation runs
6. **Fee audit**: Upload sample CSV → preview shows matched orders → import → 3 discrepancies appear on discrepancy tab
7. **Webhooks**: POST fixture JSON to webhook endpoint → new order appears, status updates correctly
8. **Idempotency**: Run `npm run seed` twice → no duplicate data, same counts

---
---

# Manual Testing Guide — Step by Step

> This guide walks you through testing every feature of Percepta from cold start to sign-out, using the demo seed data (no real Takealot API key required).

---

## Prerequisites

Before you begin, ensure the following are installed:
- **Node.js** ≥ 20.0.0
- **Docker Desktop** (for PostgreSQL and Redis)
- **A modern browser** (Chrome/Edge recommended for DevTools)

---

## Phase 1: Environment Setup

### Step 1 — Start Docker Services

```bash
cd I:\Projects\Percepta
docker-compose up -d
```

**Pass criteria:** `docker ps` shows two healthy containers — `postgres` (port 5432) and `redis` (port 6379).

### Step 2 — Install Dependencies

```bash
npm install
```

**Pass criteria:** Command completes without errors. `node_modules/` exists in root and all workspace packages.

### Step 3 — Configure Environment Variables

```bash
cp packages/api/.env.example packages/api/.env
```

Edit `packages/api/.env` and ensure these values are set:
```
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://percepta:percepta_dev@localhost:5432/percepta
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret-key-minimum-32-characters-long
ENCRYPTION_KEY=dev-encryption-key-32-chars-long!
FRONTEND_URL=http://localhost:5173
DEMO_MODE=true
```

**Pass criteria:** File saved. `DEMO_MODE=true` is present.

### Step 4 — Run Database Migrations

```bash
npm run db:migrate
```

**Pass criteria:** Console output shows all migrations applied successfully (0001 through 0005+). No errors.

### Step 5 — Seed Demo Data

```bash
npm run seed
```

**Pass criteria:** Console output shows:
```
✅ Seeded: 1 seller, 12 products, ~180 orders, 8 alerts
```
No database errors.

### Step 6 — Start the API Server

```bash
npm run dev:api
```

**Pass criteria:** Console shows `Server listening on http://0.0.0.0:3001`. No crash on startup. BullMQ workers started.

### Step 7 — Start the Frontend

Open a **second terminal**:
```bash
npm run dev:web
```

**Pass criteria:** Console shows `Local: http://localhost:5173/`. Vite dev server running.

### Step 8 — Verify Health Check

Open browser: `http://localhost:3001/api/health`

**Pass criteria:** JSON response shows `{ "status": "ok", "checks": { "database": "ok", "redis": "ok" } }`.

---

## Phase 2: Authentication Testing

### Test 2.1 — Register Page UI

1. Open `http://localhost:5173/register`
2. Observe the page layout

**Pass criteria:**
- [ ] Percepta logo/title visible
- [ ] "Start seeing your real profit today" tagline displayed
- [ ] Form has fields: Business Name, Email, Password, Confirm Password
- [ ] "Create account" button is present
- [ ] "No credit card required" footer text visible
- [ ] "Sign in" link visible at the bottom

### Test 2.2 — Registration Validation

1. Click **Create account** with all fields empty
2. Enter password "abc" (too short)
3. Enter password "12345678" and confirm password "87654321" (mismatch)

**Pass criteria:**
- [ ] Empty form shows required field errors
- [ ] Short password shows "Password must be at least 8 characters"
- [ ] Mismatched passwords shows "Passwords do not match"

### Test 2.3 — New Account Registration

1. Fill in: Business Name = "Test Co", Email = `test@test.com`, Password = `TestPass123!`, Confirm = `TestPass123!`
2. Click **Create account**

**Pass criteria:**
- [ ] Button changes to "Creating account..." with loading state
- [ ] Redirects to `/onboarding` on success
- [ ] No error messages

### Test 2.4 — Login Page UI

1. Navigate to `http://localhost:5173/login`

**Pass criteria:**
- [ ] "See your real Takealot profit" tagline displayed
- [ ] Email and Password fields present
- [ ] "Sign in" button visible
- [ ] "Create one" link to register page visible

### Test 2.5 — Login with Demo Account

1. Enter Email: `demo@percepta.co.za`
2. Enter Password: `DemoPass123!`
3. Click **Sign in**

**Pass criteria:**
- [ ] Button changes to "Signing in..."
- [ ] Redirects to `/dashboard` (because demo account has `onboardingComplete: true`)
- [ ] No error messages

### Test 2.6 — Login with Wrong Credentials

1. Enter Email: `demo@percepta.co.za`
2. Enter Password: `wrongpassword`
3. Click **Sign in**

**Pass criteria:**
- [ ] Red error message displayed (e.g. "Invalid email or password")
- [ ] Stays on login page
- [ ] Form is not cleared

---

## Phase 3: Dashboard Testing

> Login as `demo@percepta.co.za` / `DemoPass123!` before proceeding.

### Test 3.1 — Dashboard Layout

1. Observe the main dashboard page after login

**Pass criteria:**
- [ ] Page title "Profitability Dashboard" visible
- [ ] Subtitle "Real-time profit visibility for your Takealot business" visible
- [ ] Period selector pills visible (7d, 30d, 90d, custom)
- [ ] 4 KPI scorecard cards visible (Net Profit, Revenue, Margin, Loss-Makers)
- [ ] Product Performance table visible below
- [ ] Fee Summary section visible at the bottom
- [ ] Sidebar navigation present (Dashboard, Alerts, COGS, Fee Audit, Notifications)
- [ ] Bell icon in top bar visible

### Test 3.2 — KPI Scorecard Cards

1. Observe the 4 KPI cards (default period = 30d)

**Pass criteria:**
- [ ] **Net Profit** shows a rand amount (positive or negative) with trend arrow and "vs prev 30d"
- [ ] **Total Revenue** shows a positive rand amount with trend
- [ ] **Profit Margin** shows a percentage — colour coded (green ≥ 25%, yellow 0–24%, red < 0%)
- [ ] **Loss-Making Products** shows a count ≥ 2 (products #11 and #12) with an "Alert" badge

### Test 3.3 — Period Selector

1. Click **7d** pill
2. Observe KPI numbers change
3. Click **90d** pill
4. Observe KPI numbers change (should show more orders/revenue)
5. Click **Custom**, set start = 60 days ago, end = 30 days ago

**Pass criteria:**
- [ ] 7d shows fewer orders/less revenue than 30d
- [ ] 90d shows more orders/revenue than 30d
- [ ] Custom date range shows data only for the selected window
- [ ] Trend comparisons update for each period
- [ ] Active pill is visually highlighted

### Test 3.4 — Product Performance Table

1. Observe the product table (default sort = lowest margin first)

**Pass criteria:**
- [ ] Loss-making products (#11 Phone Case, #12 LED Smart Bulb) appear at the TOP
- [ ] Table shows columns: Product, Units, Revenue, Fees, COGS, Net Profit, Margin, Last Sale
- [ ] Fees column values are in red text
- [ ] Net Profit column uses green for positive, red for negative
- [ ] Margin column shows colour-coded badges (Profitable/Marginal/Loss-Maker)
- [ ] COGS column shows ✓ (manual) or ⚠ (estimated) indicators
- [ ] Product count label shows "12 products"
- [ ] Search bar placeholder reads "Search products or SKU…"

### Test 3.5 — Product Table Sorting

1. Click the **Revenue** column header (sort descending)
2. Click **Margin** column header (sort ascending = loss-makers first)
3. Click **Units** column header
4. Click **Last Sale** column header

**Pass criteria:**
- [ ] Each click re-sorts the table by that column
- [ ] Clicking the same column header toggles asc/desc
- [ ] Sort indicator (arrow) visible on active column

### Test 3.6 — Product Table Search

1. Type "Braai" in the search bar
2. Observe table filters
3. Clear the search
4. Type a SKU value

**Pass criteria:**
- [ ] Table filters to show only matching products
- [ ] Product count updates (e.g. "1 product")
- [ ] Clearing search restores all 12 products
- [ ] SKU search works correctly

### Test 3.7 — Fee Waterfall (Row Expansion)

1. Click on any product row (e.g. "Braai Master Tongs Set")
2. Observe the expanded fee waterfall breakdown

**Pass criteria:**
- [ ] Row expands to show fee waterfall
- [ ] Shows: Selling Price → Success Fee → Fulfilment Fee → IBT Penalty → Storage Fee → COGS → Inbound Cost → Net Profit
- [ ] All amounts in rands
- [ ] Net profit at the bottom matches the table's Net Profit column
- [ ] Clicking the row again collapses it

### Test 3.8 — Fee Summary Chart

1. Scroll down to the "Where Your Money Goes" section

**Pass criteria:**
- [ ] Horizontal bar chart visible with colour-coded fee types
- [ ] Fee types shown: Success Fee (orange), Fulfilment Fee (red), IBT Penalty (purple), Storage (yellow)
- [ ] Each bar shows the amount and percentage of revenue
- [ ] Detail table below shows Fee Type, Amount (R), and % of Revenue columns
- [ ] Total Fees row at the bottom

---

## Phase 4: Alerts Testing

### Test 4.1 — Alert Bell Badge

1. Observe the bell icon in the top bar

**Pass criteria:**
- [ ] Red badge with unread count visible (should be ≥ 1)
- [ ] Clicking the bell navigates to `/dashboard/alerts`

### Test 4.2 — Alerts Page Layout

1. Navigate to `/dashboard/alerts`

**Pass criteria:**
- [ ] Page title "Alerts" visible
- [ ] Subtitle about proactive notifications visible
- [ ] Filter tabs visible: All, Loss-Makers, Margin Drops, Storage
- [ ] "Mark all read" button visible (if unread alerts exist)
- [ ] Alert cards displayed in a list

### Test 4.3 — Alert Card Content

1. Observe the alert cards

**Pass criteria:**
- [ ] Each card has: coloured left border (red or yellow), icon, title, message, date
- [ ] Unread alerts have bold title text
- [ ] Unread alerts have "Mark as read" button
- [ ] Loss-maker alerts mention specific product names and loss amounts
- [ ] Storage warnings mention stock cover days

### Test 4.4 — Alert Filtering

1. Click **Loss-Makers** tab
2. Click **Storage** tab
3. Click **All** tab

**Pass criteria:**
- [ ] Loss-Makers tab shows only loss_maker alerts (products #11, #12)
- [ ] Storage tab shows storage_warning alerts (products #8, #12)
- [ ] All tab shows every alert type
- [ ] Counts per tab are accurate

### Test 4.5 — Mark Alert as Read

1. Click "Mark as read" on an unread alert
2. Observe the change

**Pass criteria:**
- [ ] Alert title changes from bold to normal weight
- [ ] "Mark as read" button disappears for that alert
- [ ] Bell badge count decrements by 1

### Test 4.6 — Mark All Read

1. Click "Mark all read" button at the top

**Pass criteria:**
- [ ] All alerts become read (no bold titles, no individual "Mark as read" buttons)
- [ ] "Mark all read" button disappears
- [ ] Bell badge disappears or shows 0

---

## Phase 5: COGS Management Testing

### Test 5.1 — COGS Page Layout

1. Navigate to `/dashboard/cogs` via sidebar

**Pass criteria:**
- [ ] Page title "Cost of Goods (COGS)" visible
- [ ] "Why COGS matters" info banner visible
- [ ] Two tabs: Products and CSV Import
- [ ] Products tab is active by default
- [ ] Table shows all 12 products

### Test 5.2 — Inline COGS Editing

1. Find a product with ⚠ Estimated COGS
2. Click the COGS (R) field and enter a new value (e.g. 50.00)
3. Enter an Inbound (R) value (e.g. 15.00)
4. Save

**Pass criteria:**
- [ ] Fields are editable inline
- [ ] Row highlights/changes colour while unsaved
- [ ] Save succeeds without error
- [ ] COGS source badge changes from ⚠ Estimated to ✓ Manual
- [ ] After save, navigating to Dashboard shows updated margins for that product

### Test 5.3 — COGS CSV Import Tab

1. Click the **CSV Import** tab

**Pass criteria:**
- [ ] Upload area visible with instructions
- [ ] "Download Template" button available (downloads pre-filled CSV)

---

## Phase 6: Fee Audit Testing

### Test 6.1 — Fee Audit Page Layout

1. Navigate to `/dashboard/fee-audit` via sidebar

**Pass criteria:**
- [ ] Page title "Fee Audit" visible
- [ ] Tab navigation: Import Sales Report, Fee Discrepancies, By Product, Insights, Import History
- [ ] Import Sales Report tab active by default
- [ ] "Why import your sales report?" info banner visible
- [ ] Upload drop zone visible

### Test 6.2 — CSV Upload Preview

1. Drag and drop `packages/api/fixtures/sample-sales-report.csv` onto the upload zone (or click to browse and select it)
2. Wait for parsing

**Pass criteria:**
- [ ] "Parsing [filename]..." loading message appears
- [ ] Preview screen shows:
  - File name and row count
  - Matched orders (green) — should be > 0
  - Unmatched orders (grey) — may be 0 or small
  - Fee summary grid (Success Fees, Fulfilment Fees, etc.) with rand amounts
- [ ] "Import [N] Orders" button is enabled
- [ ] "Cancel" button available

### Test 6.3 — CSV Import Commit

1. Click **Import [N] Orders**

**Pass criteria:**
- [ ] Success screen appears: "Import Complete"
- [ ] Shows "Updated N orders with actual fees and ship dates"
- [ ] "Import Another Report" button visible
- [ ] Note about profit recalculation queued

### Test 6.4 — Fee Discrepancies Tab

1. Click the **Fee Discrepancies** tab

**Pass criteria:**
- [ ] Summary cards at the top: Total Discrepancies, Net Impact, Overcharged, Undercharged
- [ ] At least 2-3 discrepancies listed (from the intentionally mismatched CSV fees)
- [ ] Table shows: Product, Order #, Date, Fee Type, Actual, Calculated, Difference, % Off, Status
- [ ] Difference column: red for overcharge, green for undercharge
- [ ] All discrepancies have "Open" status by default

### Test 6.5 — Resolve a Discrepancy

1. Click **Resolve** on any open discrepancy
2. Select "Acknowledged"
3. Optionally add a note

**Pass criteria:**
- [ ] Status changes from "Open" (amber) to "Acknowledged" (green)
- [ ] Summary cards update (open count decreases)

### Test 6.6 — Bulk Discrepancy Action

1. Tick the header checkbox to select all visible rows
2. Click **Dispute All**

**Pass criteria:**
- [ ] Bulk action bar appears showing "[N] selected"
- [ ] All selected discrepancies change to "Disputed" (red badge)

### Test 6.7 — Discrepancy Filters

1. Use the Status dropdown to filter by "Disputed"
2. Use the Fee Type dropdown to filter by "Success Fee"

**Pass criteria:**
- [ ] Table filters correctly to match selected criteria
- [ ] Changing filter to "All" restores full list

### Test 6.8 — Export CSV

1. Click **Export CSV** button

**Pass criteria:**
- [ ] CSV file downloads to browser
- [ ] File contains the correct columns and data matching the visible discrepancies

### Test 6.9 — By Product Tab

1. Click the **By Product** tab

**Pass criteria:**
- [ ] Products with discrepancies listed with aggregated totals
- [ ] Shows: Product, Total Discrepancies, Open Count, Overcharged, Undercharged, Net Impact

### Test 6.10 — Insights Tab

1. Click the **Insights** tab

**Pass criteria:**
- [ ] Charts visible: discrepancies by fee type, discrepancies by week
- [ ] Charts render with data (not empty)

### Test 6.11 — Import History Tab

1. Click the **Import History** tab

**Pass criteria:**
- [ ] At least 1 import record visible from the import done in Test 6.3
- [ ] Shows: filename, date, row count, matched count

---

## Phase 7: Notification Settings Testing

### Test 7.1 — Notifications Page Layout

1. Navigate to `/dashboard/notifications` via sidebar

**Pass criteria:**
- [ ] Page title or heading for notification preferences visible
- [ ] Toggle for "Weekly Profit Report" visible (default: ON)
- [ ] Toggle for "Real-Time Loss Alerts" visible (default: ON)
- [ ] Margin threshold input visible (default: 15%)
- [ ] "Save Preferences" button visible

### Test 7.2 — Toggle Preferences

1. Toggle "Weekly Profit Report" OFF
2. Toggle "Real-Time Loss Alerts" OFF
3. Observe margin threshold input

**Pass criteria:**
- [ ] Toggles switch visually
- [ ] Margin threshold input becomes disabled when Loss Alerts is OFF
- [ ] Changes are NOT auto-saved (button still needed)

### Test 7.3 — Save Preferences

1. Toggle Weekly Profit Report back ON
2. Change margin threshold to 20
3. Click **Save Preferences**

**Pass criteria:**
- [ ] Green "Preferences saved" confirmation appears for ~3 seconds
- [ ] Refreshing the page shows the saved values (Weekly ON, threshold = 20)

### Test 7.4 — Unsubscribe URL Handling

1. Navigate directly to: `http://localhost:5173/dashboard/notifications?disable=emailWeeklyDigest`

**Pass criteria:**
- [ ] Weekly Profit Report toggle automatically switches to OFF
- [ ] Preferences are saved automatically
- [ ] "Preferences saved" confirmation appears
- [ ] URL query param is removed from the address bar

---

## Phase 8: Sync Pipeline Testing (DEMO_MODE)

> Requires `DEMO_MODE=true` in `.env`

### Test 8.1 — Trigger Manual Sync

1. From the dashboard or sync UI, trigger a sync (or use the API directly)

**Pass criteria:**
- [ ] Sync starts without errors (no real Takealot API call made)
- [ ] MockTakealotClient serves 12 offers and ~180 orders
- [ ] Sync status shows progress and completes successfully
- [ ] Dashboard data remains consistent after re-sync

### Test 8.2 — Webhook Processing

1. Open a terminal and run:
```bash
curl -X POST http://localhost:3001/api/webhooks/takealot/00000000-0000-4000-a000-000000000001 \
  -H "Content-Type: application/json" \
  -d @packages/api/fixtures/webhook-new-order.json
```

**Pass criteria:**
- [ ] Returns `{ "received": true }` with HTTP 200
- [ ] New order appears in the database
- [ ] Profit calculation job is queued and completes
- [ ] Dashboard numbers update on next refresh

---

## Phase 9: Real-Time Updates Testing

### Test 9.1 — Live Connection Indicator

1. Observe the top bar while logged in

**Pass criteria:**
- [ ] "Live" badge (green) visible, confirming WebSocket connection
- [ ] If you stop the API server, badge changes to "Offline" (grey)
- [ ] Restarting the API server causes automatic reconnection → badge returns to "Live"

---

## Phase 10: Navigation & UI Polish

### Test 10.1 — Sidebar Navigation

1. Click each item in the sidebar: Dashboard, Alerts, COGS, Fee Audit, Notifications

**Pass criteria:**
- [ ] Each click navigates to the correct page
- [ ] Active page is highlighted in the sidebar
- [ ] No broken links or 404 errors

### Test 10.2 — Settings / Notifications Navigation

1. Click the settings gear icon in the top bar

**Pass criteria:**
- [ ] Navigates to `/dashboard/notifications`

### Test 10.3 — Page Loading States

1. Hard refresh (Ctrl+Shift+R) on the Dashboard page
2. Observe loading states

**Pass criteria:**
- [ ] Skeleton placeholders or loading spinners appear briefly
- [ ] Data loads and replaces placeholders
- [ ] No layout shift after data loads

---

## Phase 11: Sign Out & Session

### Test 11.1 — Session Persistence

1. Close the browser tab
2. Reopen `http://localhost:5173/dashboard`

**Pass criteria:**
- [ ] User is still logged in (refresh token active)
- [ ] Dashboard loads without needing to re-login

### Test 11.2 — Sign Out

1. Click the sign-out / logout button

**Pass criteria:**
- [ ] Redirects to `/login`
- [ ] Navigating to `/dashboard` redirects back to `/login`
- [ ] Token is cleared from local storage

---

## Phase 12: Re-Seed Idempotency

### Test 12.1 — Re-run Seed Script

1. Stop the API server
2. Run `npm run seed` again
3. Restart the API server
4. Login and check dashboard

**Pass criteria:**
- [ ] Seed completes without errors
- [ ] Same counts as first run (12 products, ~180 orders, 8 alerts)
- [ ] No duplicate data in the dashboard
- [ ] All features work identically to the first run

---
---

# Testing Checklist Summary

| # | Feature Area | Test | Pass Criteria |
|---|-------------|------|---------------|
| **SETUP** | | | |
| 1 | Docker | Start PostgreSQL + Redis | `docker ps` shows 2 healthy containers |
| 2 | Migrations | Run DB migrations | All migrations applied, no errors |
| 3 | Seed | Run seed script | "✅ Seeded: 1 seller, 12 products, ~180 orders, 8 alerts" |
| 4 | Health | GET /api/health | `{ status: "ok", checks: { database: "ok", redis: "ok" } }` |
| **AUTH** | | | |
| 5 | Register UI | Load register page | All form fields, button, footer text visible |
| 6 | Validation | Submit empty/invalid form | Appropriate error messages shown |
| 7 | Register | Create new account | Redirects to /onboarding, no errors |
| 8 | Login | Login as demo user | Redirects to /dashboard |
| 9 | Bad login | Login with wrong password | "Invalid email or password" error shown |
| **DASHBOARD** | | | |
| 10 | Layout | View dashboard | 4 KPI cards, product table, fee chart all visible |
| 11 | KPI cards | Check scorecard values | All 4 cards show data with trends; margin is colour-coded |
| 12 | Loss-makers | Check loss-maker count | ≥ 2 loss-makers shown with Alert badge |
| 13 | Period 7d | Switch to 7d | Numbers decrease; trend recalculates |
| 14 | Period 90d | Switch to 90d | Numbers increase; more orders visible |
| 15 | Custom period | Set custom date range | Data filtered to exact window |
| 16 | Product sort | Sort by Revenue | Table re-orders correctly; sort arrow visible |
| 17 | Product search | Search "Braai" | Table filters to matching product(s) |
| 18 | Fee waterfall | Click product row | Expanded breakdown: price → fees → COGS → profit |
| 19 | Fee summary | Scroll to fee chart | Bar chart + detail table with fee types and percentages |
| 20 | Default sort | Check initial sort order | Loss-makers (red badge) at top of table |
| **ALERTS** | | | |
| 21 | Bell badge | Check bell icon | Unread count badge visible |
| 22 | Alerts page | Navigate to alerts | Cards with coloured borders, titles, messages, dates |
| 23 | Filter tabs | Click Loss-Makers, Storage | Shows only matching alert type |
| 24 | Mark read | Click "Mark as read" | Alert de-emphasized; badge decrements |
| 25 | Mark all | Click "Mark all read" | All alerts read; badge clears |
| **COGS** | | | |
| 26 | COGS page | Navigate to COGS | 12 products listed with ⚠/✓ badges |
| 27 | Inline edit | Change COGS value | Saves successfully; badge changes to ✓ Manual |
| 28 | Profit update | Check dashboard after COGS edit | Margin recalculated for affected product |
| **FEE AUDIT** | | | |
| 29 | Upload CSV | Drop sample CSV file | Preview shows matched orders, fee summary |
| 30 | Import | Click "Import N Orders" | Success screen: "Import Complete" |
| 31 | Discrepancies | View discrepancies tab | ≥ 2 discrepancies with Actual vs Calculated columns |
| 32 | Resolve | Acknowledge a discrepancy | Status changes to "Acknowledged" (green) |
| 33 | Bulk action | Select all → Dispute All | All selected change to "Disputed" (red) |
| 34 | Filters | Filter by status/fee type | Table filters correctly |
| 35 | Export | Click Export CSV | CSV file downloads with correct data |
| 36 | By Product | View By Product tab | Aggregated discrepancy totals per product |
| 37 | Insights | View Insights tab | Charts render with data |
| 38 | Import History | View Import History tab | At least 1 import record visible |
| **NOTIFICATIONS** | | | |
| 39 | Preferences UI | Navigate to notifications | Toggles and threshold input visible |
| 40 | Toggle OFF | Disable weekly digest | Toggle switches; threshold input disabled when alerts OFF |
| 41 | Save | Save changed preferences | Green "Preferences saved" confirmation |
| 42 | Persist | Refresh page | Saved values persisted |
| 43 | Unsubscribe URL | Visit ?disable=emailWeeklyDigest | Auto-toggles OFF and saves |
| **SYNC (DEMO_MODE)** | | | |
| 44 | Trigger sync | Trigger manual sync | Completes without real API call; data consistent |
| 45 | Webhook | POST fixture JSON | Returns 200; new order processed |
| **REAL-TIME** | | | |
| 46 | Live badge | Check top bar | Green "Live" badge visible |
| 47 | Reconnect | Stop/restart API | Badge goes Offline → reconnects → Live |
| **NAVIGATION** | | | |
| 48 | Sidebar | Click all nav items | Each navigates to correct page; active highlighted |
| 49 | Loading states | Hard refresh dashboard | Skeletons/spinners shown then replaced by data |
| **SESSION** | | | |
| 50 | Persistence | Close and reopen tab | Still logged in via refresh token |
| 51 | Sign out | Click logout | Redirects to /login; /dashboard redirects to /login |
| **IDEMPOTENCY** | | | |
| 52 | Re-seed | Run `npm run seed` twice | Same counts, no duplicates, all features work |
