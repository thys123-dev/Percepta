# Percepta — Testing with Mock Data

## Context

Percepta cannot be tested end-to-end without a real Takealot Seller API key. This document describes the **seed script**, **MockTakealotClient**, **static test fixtures**, and the **manual testing guide** that allow a developer to populate the entire application — dashboard, alerts, fee audit, COGS page, inventory, returns — with realistic dummy data and run the full sync pipeline without any live credentials.

---

## Architecture Overview

| Layer | Purpose | How it works |
|-------|---------|-------------|
| **Database seed** (`npm run seed`) | Populate dashboard immediately | Inserts demo seller, 14 offers, 201 orders (183 random + 18 edge cases), calculated fees, profit records, and 12 alerts directly via Drizzle ORM |
| **MockTakealotClient** | Test sync pipeline end-to-end | Drop-in replacement for `TakealotClient` when `DEMO_MODE=true`; returns the same 14 products and orders in Takealot API response format |
| **Static fixtures** | Test CSV import + webhooks | A sample `sales-report.csv` and webhook JSON payloads for manual/automated testing |

---

## PR 1: Demo Data Definitions + Seed Script ✅

### Files

**`packages/api/src/db/seeds/demo-data.ts`** — All product/order/alert data as typed constants

**Demo Seller:**
- Email: `demo@percepta.co.za` / Password: `DemoPass123!`
- Business name: "Kalahari Goods Co."
- API key: `demo-api-key-12345` (AES-256 encrypted)
- Fixed UUID: `00000000-0000-4000-a000-000000000001`
- `onboardingComplete: true`, `initialSyncStatus: 'complete'`
- Email preferences: weekly digest ON, loss alerts ON, margin threshold 15%

**14 Products across 8 categories:**

| # | Title | Category | Price | Scenario |
|---|-------|----------|-------|----------|
| 1 | Braai Master Tongs Set | Homeware | R349 | ✅ Profitable, Standard |
| 2 | Rooibos Face Cream 50ml | Beauty | R199 | ✅ Profitable, high volume |
| 3 | Biltong Box 1kg Premium | Non-Perishable | R299 | ✅ Steady, some IBT |
| 4 | Wireless Earbuds Pro ZA | Electronic Accessories | R899 | ✅ High-value, high return rate |
| 5 | Kids Safari Puzzle 500pc | Toys | R149 | ✅ Best seller, high volume |
| 6 | Camping Chair Deluxe | Camping & Outdoor | R1,499 | ⚠️ Large+Heavy, IBT marginal |
| 7 | Yoga Mat Premium 6mm | Sport | R449 | ⚠️ Estimated COGS, near-loss |
| 8 | Baby Monitor WiFi | Baby | R1,999 | ⚠️ Overstocked (40 days), storage fees |
| 9 | Garden Umbrella 3m | Garden | R2,499 | ⚠️ Oversize+Heavy, actual CSV fees present |
| 10 | Office Desk Stand Adjustable | Office Furniture | R3,499 | ⚠️ Bulky, fee discrepancy (overcharge) |
| 11 | Phone Case Ultra Thin | Mobile | R99 | 🔴 Loss-maker, high return rate |
| 12 | LED Smart Bulb 4-Pack | Smart Home | R599 | 🔴 Overstocked (45 days) + loss-maker |
| 13 | Stainless Steel Water Bottle | Sport | R249 | 🔴 Zero stock / discontinued |
| 14 | Premium Notebook A5 Hardcover | Stationery | R79 | ⚠️ Near-zero margin, estimated COGS |

**201 Orders (183 random + 18 explicit edge cases):**

| Status | Count |
|--------|-------|
| Shipped / Delivered / Accepted | ~160 (fees calculated) |
| Returned (with `reversal_amount_cents`) | ~22 |
| Return Requested (pending) | ~10 |
| Cancelled | ~9 |

**18 Explicit Edge-Case Orders:**

| # | Scenario | Product | What it tests |
|---|----------|---------|---------------|
| 1 | Full return + reversal | Earbuds | `reversal_amount_cents` = full price, excluded from profit |
| 2 | Return Requested (pending) | Baby Monitor | Pending return, not yet processed |
| 3 | Cancelled before dispatch | Camping Chair | No fees, no profit, excluded |
| 4 | Multi-unit return (qty 3) | Phone Case | Reversal for 3 units |
| 5 | Partial return (1 of 2 units) | Biltong Box | `has_reversal=true`, partial refund |
| 6 | Daily Deal, qty 5 | Rooibos Cream | Promo string, bulk quantity |
| 7 | Daily Deal + Return | Safari Puzzle | Both promo and return flags |
| 8 | IBT cross-region (JHB→CPT) | Camping Chair | IBT penalty applied |
| 9 | IBT + Return combined | Yoga Mat | Both IBT penalty and reversal |
| 10 | Actual CSV fee data (match) | Garden Umbrella | Fees match — no discrepancy |
| 11 | Actual CSV fee data (overcharge) | Desk Stand | Success fee overcharged by R8.76 |
| 12 | Out-of-stock, historical (delivered) | Water Bottle | Last sale before stockout |
| 13 | Out-of-stock, cancelled | Water Bottle | Cancelled due to no stock |
| 14 | Near-zero margin + IBT + qty 5 | Notebook | Multi-unit, IBT, marginal profit |
| 15 | Near-zero margin + return | Notebook | Return on marginal product |
| 16 | Multi-unit Daily Deal (loss-maker) | LED Bulb | qty 4, promo, still loss-making |
| 17 | Return Requested (loss-maker) | Phone Case | Return pending on loss-making product |
| 18 | Overstock + historical return | Baby Monitor | Return from overstocked product |

**12 Alerts:**

| Type | Severity | Product | Read? |
|------|----------|---------|-------|
| loss_maker | critical | Phone Case | No |
| loss_maker | critical | LED Bulb | Yes |
| margin_drop | warning | Camping Chair | No |
| storage_warning | warning | Baby Monitor | No |
| storage_warning | critical | LED Bulb | No |
| margin_drop | warning | Biltong Box | Yes |
| loss_maker | warning | Yoga Mat (near-loss) | No |
| storage_warning | warning | Desk Stand (approaching) | Yes |
| return_spike | warning | Earbuds (25% return rate) | No |
| loss_maker | warning | Notebook (near-loss, est. COGS) | No |
| out_of_stock | critical | Water Bottle (0 stock) | No |
| fee_discrepancy | warning | Desk Stand (overcharged R8.76) | No |

**`packages/api/src/db/seeds/seed.ts`** — Entry point

```
1. Delete demo seller (CASCADE removes all child data)
2. Insert seller (bcrypt password, AES-256 encrypted API key)
3. Insert 14 offers with sizeTier/weightTier classification
4. Merge random orders + 18 explicit edge-case orders (201 total)
5. For each non-excluded order: call real calculateFees() + calculateProfit()
   → inserts into calculated_fees and profit_calculations
6. Insert 12 alerts
7. Print full summary including edge-case coverage list
```

**Key design decisions:**
- Uses real `calculateFees()` and `calculateProfit()` — no hardcoded fee amounts
- Fixed seller UUID for reliable idempotent delete-and-recreate
- Returns, cancellations, and Return Requested orders are inserted but **excluded from fee/profit calculation** — matching production pipeline behaviour
- `reversalAmountCents` and `hasReversal` are populated on all return orders
- Actual CSV fee fields (`actualSuccessFeeCents`, `netSalesAmountCents`, etc.) are populated on fee-audit orders
- Out-of-stock product (`offerId: 100013`) has `status: 'Not Buyable'` and `salesUnits30d: 0`

---

## PR 2: MockTakealotClient + DEMO_MODE ✅

**`packages/api/src/modules/takealot-client/mock-client.ts`**

| Method | Behaviour |
|--------|-----------|
| `testConnection()` | Returns `true` after 200ms delay |
| `getOfferCount()` | Returns `{ total: 14 }` |
| `getOffers(page)` | Returns paginated `TakealotOffer[]` from demo-data |
| `fetchAllOffers(onProgress?)` | Async generator yielding all 14 offers in one batch |
| `getSales(start, end, page)` | Returns paginated `TakealotSale[]` filtered by date range |
| `fetchAllSales(start, end, onProgress?)` | Async generator yielding deterministic orders |
| `getOffer(offerId)` | Single offer lookup |
| `getRateLimitStatus()` | Returns healthy rate limit state |

**`packages/api/src/config/env.ts`** — `DEMO_MODE: z.coerce.boolean().default(false)`

**`packages/api/src/modules/sync/utils/get-seller-client.ts`** — ~5 lines: if `DEMO_MODE=true` and API key is `demo-api-key-12345`, return `MockTakealotClient` instead of real client.

---

## PR 3: Static Fixtures ✅

**`packages/api/fixtures/sample-sales-report.csv`**
- 30 rows in the exact 20-column format from `sales-report-parser.ts`
- Intentional discrepancies: 2 rows overcharged, 1 row mismatched stock transfer fee
- Mix of Shipped, Delivered, Returned statuses
- Ship dates spanning both v1 and v2 fee matrix periods

**`packages/api/fixtures/webhook-new-order.json`** — New order payload for product #1

**`packages/api/fixtures/webhook-status-changed.json`** — Status change Shipped → Delivered

**`packages/api/fixtures/webhook-offer-updated.json`** — Price change for Wireless Earbuds

---

## Developer Quick Start

```bash
# 1. Seed the database (safe to re-run — deletes and recreates demo data)
npm run seed
# Output:
# ✅ Seeded: 1 seller, 14 products, 201 orders, 12 alerts
#    Fees calculated: 160 (139 profitable, 21 loss-making)
#    Excluded: 41 (22 returned, 10 return requested, 9 cancelled)
#    Edge cases: 18 explicit scenario orders

# 2. Start API (demo mode uses MockTakealotClient for sync)
DEMO_MODE=true npm run dev:api

# 3. Start frontend
npm run dev:web

# 4. Login
#    URL:      http://localhost:5173
#    Email:    demo@percepta.co.za
#    Password: DemoPass123!

# 5. Test webhook
curl -X POST http://localhost:3001/api/webhooks/takealot/00000000-0000-4000-a000-000000000001 \
  -H "Content-Type: application/json" \
  -d @packages/api/fixtures/webhook-new-order.json

# 6. Test CSV fee audit
#    Upload packages/api/fixtures/sample-sales-report.csv via the Fee Audit page
#    → 3 discrepancies should appear

# 7. Test COGS Excel template download
#    COGS page → CSV Import tab → click "Excel (.xlsx)" to download
#    → Open in Excel: yellow columns are editable, grey are read-only
#    → Fill in COGS, upload the file back
```

---

---

# Manual Testing Guide — Step by Step

> This guide walks through testing every feature of Percepta from cold start to sign-out, using the demo seed data (no real Takealot API key required).

---

## Prerequisites

- **Node.js** ≥ 18.0.0
- **PostgreSQL** and **Redis** accessible (Railway or local Docker)
- A modern browser (Chrome/Edge recommended)

---

## Phase 1: Environment Setup

### Step 1 — Install Dependencies
```bash
cd I:\Projects\Percepta
npm install
```
**Pass:** No errors. `node_modules/` present.

### Step 2 — Configure Environment Variables
Edit `packages/api/.env`:
```
PORT=3001
NODE_ENV=development
DATABASE_URL=<your postgres URL>
REDIS_URL=<your redis URL>
JWT_SECRET=<32+ char secret>
ENCRYPTION_KEY=<32 char key>
FRONTEND_URL=http://localhost:5173
DEMO_MODE=true
```
**Pass:** File saved with `DEMO_MODE=true`.

### Step 3 — Run Database Migrations
```bash
npm run db:migrate
```
**Pass:** All migrations applied (0001–0005+). No errors.

### Step 4 — Seed Demo Data
```bash
npm run seed
```
**Pass:** Output shows:
```
✅ Seeded: 1 seller, 14 products, 201 orders, 12 alerts
   Fees calculated: 160 (139 profitable, 21 loss-making)
   Excluded: 41 (22 returned, 10 return requested, 9 cancelled)
   Edge cases: 18 explicit scenario orders
```

### Step 5 — Start API
```bash
npm run dev:api
```
**Pass:** Console shows `🚀 Percepta API running at http://0.0.0.0:3001`. BullMQ workers started.

### Step 6 — Start Frontend
```bash
npm run dev:web   # second terminal
```
**Pass:** Console shows `Local: http://localhost:5173/`.

---

## Phase 2: Authentication

### Test 2.1 — Login Page UI
Navigate to `http://localhost:5173/login`
- [ ] "See your real Takealot profit" tagline displayed
- [ ] Email and Password fields present
- [ ] "Sign in" button visible
- [ ] "Create one" link to register page visible

### Test 2.2 — Login with Demo Account
Email: `demo@percepta.co.za` / Password: `DemoPass123!`
- [ ] Button changes to "Signing in..."
- [ ] Redirects to `/dashboard` (onboarding already complete)
- [ ] No error messages

### Test 2.3 — Login with Wrong Password
Enter wrong password → click Sign in
- [ ] "Invalid email or password" error displayed
- [ ] Stays on login page; form not cleared

### Test 2.4 — New Account Registration
Navigate to `/register` → fill in Business Name, Email, Password
- [ ] Button shows "Creating account..." during submit
- [ ] Redirects to `/onboarding` on success
- [ ] Validation errors show for empty/short/mismatched password

---

## Phase 3: Dashboard

### Test 3.1 — Dashboard Layout
After login, observe the main dashboard
- [ ] "Profitability Dashboard" heading visible
- [ ] 4 KPI scorecard cards (Net Profit, Revenue, Margin, Loss-Makers)
- [ ] Period selector pills: 7d, 30d, 90d, Custom
- [ ] Product Performance table below KPIs
- [ ] "Where Your Money Goes" fee chart below table
- [ ] Sidebar navigation (Dashboard, Inventory, Alerts, COGS, Fee Audit, Notifications)
- [ ] Bell icon in top bar with unread count badge

### Test 3.2 — KPI Scorecard Cards (30d default)
- [ ] **Net Profit**: Rand amount with trend arrow and "vs prev 30d"
- [ ] **Total Revenue**: Positive rand amount with trend
- [ ] **Profit Margin**: % colour-coded (green ≥ 25%, yellow 0–24%, red < 0%)
- [ ] **Loss-Making Products**: Count ≥ 2 with "Alert" badge

### Test 3.3 — Period Selector
Switch 7d → 30d → 90d → Custom (60 days ago to 30 days ago)
- [ ] 7d shows fewer orders/less revenue than 30d
- [ ] 90d shows more orders/revenue than 30d
- [ ] Custom range shows data only for selected window
- [ ] Active pill is visually highlighted

### Test 3.4 — Product Performance Table (Default Sort)
- [ ] **Phone Case Ultra Thin** and **LED Smart Bulb** appear at the TOP (loss-makers sort first)
- [ ] Table columns: Product, Units, Revenue, Fees, COGS, Net Profit, Margin, Last Sale
- [ ] Fees column in red text
- [ ] Net Profit: green (positive), red (negative)
- [ ] Margin: colour-coded badge (Profitable / Marginal / Loss-Maker)
- [ ] COGS column: ✓ Manual or ⚠ Estimated indicator
- [ ] **14 products** total count shown (includes out-of-stock Water Bottle with 0 sales)
- [ ] **Stainless Steel Water Bottle** shows 0 units sold, 0 revenue for 30d period

### Test 3.5 — Product Table Sorting
Click Revenue → Margin → Units → Last Sale column headers
- [ ] Each click re-sorts correctly
- [ ] Toggle asc/desc on same column
- [ ] Sort indicator arrow visible on active column

### Test 3.6 — Product Table Search
Type "Braai" → then clear → then type a SKU
- [ ] Filters to matching product(s); count updates
- [ ] Clearing restores all 14 products
- [ ] SKU search works

### Test 3.7 — Fee Waterfall (Row Expansion)
Click any product row (e.g. "Braai Master Tongs Set")
- [ ] Row expands to show waterfall
- [ ] Steps: Selling Price → Success Fee → Fulfilment Fee → IBT Penalty → VAT on Fees → Storage Fee → COGS → Inbound Cost → Net Profit
- [ ] All amounts in Rands
- [ ] Net Profit at bottom matches the table's Net Profit column
- [ ] Clicking row again collapses

### Test 3.8 — Fee Waterfall on Multi-Unit Order
Click "Rooibos Face Cream 50ml" (has a qty-5 Daily Deal order)
- [ ] "Per unit · order qty: N" label visible when qty > 1
- [ ] Selling price shown is the per-unit price, not order total

### Test 3.9 — Fee Summary Chart
Scroll to "Where Your Money Goes"
- [ ] Bar chart with colour-coded fee types
- [ ] Fee types: Success Fee, Fulfilment Fee, IBT Penalty, Storage
- [ ] Each bar shows amount and % of revenue
- [ ] Detail table below: Fee Type, Amount (R), % of Revenue columns
- [ ] Total Fees row at the bottom

---

## Phase 4: Returns & Reversals

> These tests verify the application correctly handles the 18 edge-case orders.

### Test 4.1 — Returned Orders Excluded from Profit
On the Dashboard product table, select **90d** period
- [ ] "Wireless Earbuds Pro ZA" margin is not inflated by the returned order
- [ ] The returned Earbuds order (R899) does NOT appear in profit calculations
- [ ] Net profit for Earbuds reflects only non-returned orders

### Test 4.2 — Return Spike Alert
Navigate to Alerts page
- [ ] Alert "High return rate: Wireless Earbuds Pro ZA" visible (warning severity)
- [ ] Message mentions 25% return rate and 3 returns in 7 days

### Test 4.3 — Return Requested Status
On the product table, click **Baby Monitor WiFi** to expand fee waterfall
- [ ] Product has a "Return Requested" order in the 90d window
- [ ] That order does NOT appear in profit/fee totals (excluded status)

### Test 4.4 — Cancelled Orders Excluded
Click **Camping Chair Deluxe** fee waterfall
- [ ] Cancelled order (R1,499) is not included in any revenue or fee totals
- [ ] Table shows only delivered/shipped orders for fee calculation

### Test 4.5 — Partial Return (has_reversal = true)
Scroll to **Biltong Box 1kg Premium** in product table
- [ ] Product shows `has_reversal` on one delivered order (visible in DB / future UI)
- [ ] Net profit for that order reflects the partial refund scenario

### Test 4.6 — Out-of-Stock Product
Locate **Stainless Steel Water Bottle** in the product table
- [ ] Shows 0 units sold, R0 revenue for 30d period
- [ ] Historical orders (25 days ago) appear when switching to 90d
- [ ] Alert "Out of stock: Stainless Steel Water Bottle" visible on Alerts page (critical)

---

## Phase 5: Inventory Management

### Test 5.1 — Inventory Page Layout
Navigate to **Inventory** via sidebar
- [ ] Page title "Inventory" visible
- [ ] Product table shows all 14 products
- [ ] Columns: Product, SKU, JHB Stock, CPT Stock, DBN Stock, Total Stock, Stock Cover (days), Status

### Test 5.2 — Stock Level Display
Observe stock levels per DC
- [ ] **Phone Case Ultra Thin**: JHB 200, CPT 150, Total 350
- [ ] **Stainless Steel Water Bottle**: 0 across all DCs — "Out of Stock" status badge
- [ ] **Baby Monitor WiFi**: JHB 60 — "Overstocked" badge (40-day cover)
- [ ] **LED Smart Bulb**: JHB 90 — "Overstocked" badge (45-day cover)
- [ ] **Kids Safari Puzzle**: JHB 100 — Normal badge (8-day cover)

### Test 5.3 — Overstocked Warning Badges
- [ ] Products with stock cover > 35 days show ⚠️ Overstocked (yellow or red)
- [ ] Products with stock cover ≤ 35 days show normal status
- [ ] Out-of-stock product shows 🔴 Out of Stock (red)

### Test 5.4 — Stock Cover Sorting
Click the "Stock Cover" column header to sort
- [ ] Sorting descending puts Baby Monitor (40d) and LED Bulbs (45d) at the top
- [ ] Out-of-stock product shows 0 or "–" in stock cover column

### Test 5.5 — Low Stock Alert
Check inventory for products with low stock cover (< 10 days)
- [ ] **Kids Safari Puzzle** (8-day cover) shows low stock indicator
- [ ] **Yoga Mat Premium** (5-day cover) shows low stock indicator

### Test 5.6 — Multi-DC Distribution
- [ ] **Biltong Box**: JHB 40, CPT 20 — split across two DCs
- [ ] **Rooibos Face Cream**: CPT 80 only (no JHB/DBN)
- [ ] **Office Desk Stand**: DBN 5 only (single DC)

---

## Phase 6: Alerts

### Test 6.1 — Alert Bell Badge
Observe bell icon in top bar
- [ ] Red badge shows unread count (≥ 5 unread alerts seeded)
- [ ] Clicking navigates to `/dashboard/alerts`

### Test 6.2 — Alerts Page Layout
- [ ] Filter tabs: All, Loss-Makers, Margin Drops, Storage
- [ ] "Mark all read" button visible
- [ ] Alert cards with coloured left borders (critical = red, warning = yellow)

### Test 6.3 — All Alert Types Present
Scroll through all alerts
- [ ] 🔴 **Loss-maker**: Phone Case Ultra Thin — critical, unread
- [ ] 🔴 **Loss-maker**: LED Smart Bulb — critical, read (already acknowledged)
- [ ] ⚠️ **Margin drop**: Camping Chair Deluxe — warning, unread
- [ ] ⚠️ **Storage warning**: Baby Monitor WiFi — warning, unread
- [ ] 🔴 **Storage warning**: LED Smart Bulb — critical, unread
- [ ] ⚠️ **Margin drop**: Biltong Box — warning, read
- [ ] ⚠️ **Near-loss**: Yoga Mat — warning, unread
- [ ] ⚠️ **Approaching overstock**: Desk Stand — warning, read
- [ ] ⚠️ **Return spike**: Wireless Earbuds — warning, unread
- [ ] ⚠️ **Near-loss**: Notebook A5 — warning, unread
- [ ] 🔴 **Out of stock**: Water Bottle — critical, unread
- [ ] ⚠️ **Fee discrepancy**: Desk Stand — warning, unread

### Test 6.4 — Alert Filtering
Click each filter tab
- [ ] Loss-Makers tab: shows loss_maker alerts only (Phone Case, LED Bulb, Yoga Mat, Notebook)
- [ ] Storage tab: shows storage_warning alerts (Baby Monitor, LED Bulb, Desk Stand)
- [ ] All tab: shows all 12 alerts

### Test 6.5 — Mark Alert as Read
Click "Mark as read" on an unread alert
- [ ] Title changes from bold to normal weight
- [ ] "Mark as read" button disappears
- [ ] Bell badge count decrements by 1

### Test 6.6 — Mark All Read
Click "Mark all read"
- [ ] All alerts become read
- [ ] Bell badge disappears or shows 0

---

## Phase 7: COGS Management

### Test 7.1 — COGS Page Layout
Navigate to COGS via sidebar
- [ ] "Cost of Goods (COGS)" heading visible
- [ ] "Why COGS matters" info banner visible
- [ ] Two tabs: **Products** and **CSV Import**
- [ ] Products tab shows all 14 products

### Test 7.2 — COGS Status Indicators
Observe the COGS source badges
- [ ] Products with ✓ **Manual**: Braai Tongs, Rooibos Cream, Biltong, Earbuds, Safari Puzzle, Camping Chair, Baby Monitor, Garden Umbrella, Phone Case, Water Bottle
- [ ] Products with ⚠ **Estimated**: Yoga Mat, Desk Stand, LED Bulb, Notebook A5

### Test 7.3 — Inline COGS Editing
Find Yoga Mat (estimated COGS) → edit COGS field to 180.00 and inbound to 30.00 → save
- [ ] Fields are editable inline
- [ ] Row highlights while unsaved
- [ ] Save succeeds without error
- [ ] Badge changes from ⚠ Estimated → ✓ Manual
- [ ] Navigating to Dashboard shows updated margin for Yoga Mat

### Test 7.4 — COGS Import: Download Excel Template
Click the **CSV Import** tab → click **Excel (.xlsx)** button
- [ ] Excel file `percepta-cogs-template.xlsx` downloads
- [ ] Open in Excel: Row 1 is a blue info banner
- [ ] Row 2 has column headers — grey (read-only), yellow (editable)
- [ ] Yellow columns: "★ Your Cost / COGS (R)" and "★ Inbound Cost (R)"
- [ ] Grey columns: Offer ID, SKU, Title, Current Price pre-filled with product data
- [ ] Header row is frozen (stays visible when scrolling)
- [ ] All 14 products listed (Water Bottle COGS filled, Notebook COGS filled)

### Test 7.5 — COGS Import: Download CSV Template
Click **CSV** button (secondary)
- [ ] CSV file `percepta-cogs-template.csv` downloads
- [ ] Open in a text editor: header row has offer_id, sku, title, current_price_rands, cogs_rands, inbound_cost_rands
- [ ] All 14 products listed

### Test 7.6 — COGS Import: Upload Excel File
Fill in COGS values in the downloaded Excel template → save → drag onto upload zone
- [ ] Drop zone accepts `.xlsx` files
- [ ] File name shows in the drop zone
- [ ] "Accepts .xlsx or .csv" hint text visible
- [ ] Preview table shows matched products with updated COGS values
- [ ] Unmatched rows (if any) show "Skip" badge
- [ ] "Import N products" button enabled

### Test 7.7 — COGS Import: Upload CSV File
Take the downloaded CSV → edit 3 COGS values → save → upload
- [ ] Drop zone accepts `.csv` files
- [ ] Parsing succeeds; preview shows 3 matched products
- [ ] Commit import → "Import complete!" success message
- [ ] Count shows correct number of updated products
- [ ] Navigate to Dashboard: margins updated for edited products

### Test 7.8 — COGS Import: Invalid File Handling
Upload a file with `offer_id` column missing
- [ ] Parse error shown: "Missing required columns: offer_id, cogs_rands"
- [ ] No import button shown
- [ ] User can try again without page refresh

---

## Phase 8: Fee Audit

### Test 8.1 — Fee Audit Page Layout
Navigate to **Fee Audit** via sidebar
- [ ] Tabs: Import Sales Report, Fee Discrepancies, By Product, Insights, Import History
- [ ] "Why import your sales report?" info banner visible
- [ ] Upload drop zone visible

### Test 8.2 — CSV Upload Preview
Drag `packages/api/fixtures/sample-sales-report.csv` onto upload zone
- [ ] "Parsing [filename]..." message appears
- [ ] Preview shows matched orders (> 0), unmatched (may be 0–small)
- [ ] Fee summary grid (Success Fees, Fulfilment Fees, etc.) with Rand amounts
- [ ] "Import [N] Orders" button enabled

### Test 8.3 — CSV Import Commit
Click **Import [N] Orders**
- [ ] "Import Complete" success screen
- [ ] "Updated N orders with actual fees and ship dates"
- [ ] "Import Another Report" button visible

### Test 8.4 — Fee Discrepancies Tab
Click **Fee Discrepancies** tab
- [ ] Summary cards: Total Discrepancies, Net Impact, Overcharged, Undercharged
- [ ] At least 2–3 discrepancies (from intentionally mismatched CSV fees)
- [ ] Table shows: Product, Order #, Date, Fee Type, Actual, Calculated, Difference, % Off, Status
- [ ] Overcharged difference shown in red
- [ ] **Desk Stand** order appears with ~R8.76 overcharge on success fee

### Test 8.5 — Resolve a Discrepancy
Click **Resolve** on any open discrepancy → select "Acknowledged"
- [ ] Status changes to "Acknowledged" (green)
- [ ] Summary card "Open" count decrements

### Test 8.6 — Bulk Action
Tick header checkbox → click **Dispute All**
- [ ] Bulk action bar shows "[N] selected"
- [ ] All selected discrepancies change to "Disputed" (red badge)

### Test 8.7 — Export CSV
Click **Export CSV**
- [ ] CSV file downloads with correct columns and data

### Test 8.8 — Fee Audit: Returned Orders Not Counted
- [ ] Returned orders (Earbuds full return, Safari Puzzle return) do NOT appear in fee discrepancy list
- [ ] Fee discrepancies only show for delivered/shipped orders with actual fee data

---

## Phase 9: Notification Settings

### Test 9.1 — Preferences Layout
Navigate to **Notifications** via sidebar
- [ ] Toggle "Weekly Profit Report" (default: ON)
- [ ] Toggle "Real-Time Loss Alerts" (default: ON)
- [ ] Margin threshold input (default: 15%)
- [ ] "Save Preferences" button

### Test 9.2 — Toggle & Save
Toggle Weekly Profit Report OFF → change threshold to 20 → click Save
- [ ] Green "Preferences saved" confirmation appears
- [ ] Refresh page → Weekly OFF, threshold = 20 persisted

### Test 9.3 — Unsubscribe URL
Navigate to `http://localhost:5173/dashboard/notifications?disable=emailWeeklyDigest`
- [ ] Weekly Profit Report auto-toggles to OFF
- [ ] Saved automatically; "Preferences saved" appears
- [ ] Query param removed from URL

---

## Phase 10: Sync Pipeline (DEMO_MODE)

### Test 10.1 — Trigger Manual Sync
Trigger sync via UI or API:
```bash
curl -X POST http://localhost:3001/api/sync/trigger \
  -H "Authorization: Bearer <token>"
```
- [ ] Sync completes without real Takealot API call
- [ ] MockTakealotClient serves 14 offers and orders
- [ ] Dashboard data consistent after re-sync

### Test 10.2 — Webhook: New Order
```bash
curl -X POST http://localhost:3001/api/webhooks/takealot/00000000-0000-4000-a000-000000000001 \
  -H "Content-Type: application/json" \
  -d @packages/api/fixtures/webhook-new-order.json
```
- [ ] Returns `{ "received": true }` HTTP 200
- [ ] New order appears in DB
- [ ] Profit calculation job queued and completes
- [ ] Dashboard numbers update on next refresh

### Test 10.3 — Webhook: Status Change (Shipped → Delivered)
```bash
curl -X POST http://localhost:3001/api/webhooks/takealot/00000000-0000-4000-a000-000000000001 \
  -H "Content-Type: application/json" \
  -d @packages/api/fixtures/webhook-status-changed.json
```
- [ ] Returns `{ "received": true }` HTTP 200
- [ ] Order status updated from "Shipped" to "Delivered" in DB

---

## Phase 11: Real-Time Updates

### Test 11.1 — Live Connection Badge
Observe top bar while logged in
- [ ] Green "Live" badge visible (WebSocket connected)
- [ ] Stopping API → badge changes to "Offline"
- [ ] Restarting API → badge returns to "Live" automatically

---

## Phase 12: Navigation & UI Polish

### Test 12.1 — Sidebar Navigation
Click each sidebar item: Dashboard, Inventory, Alerts, COGS, Fee Audit, Notifications
- [ ] Each navigates to correct page
- [ ] Active page highlighted in sidebar
- [ ] No broken links or 404 errors

### Test 12.2 — Page Loading States
Hard refresh on Dashboard (Ctrl+Shift+R)
- [ ] Skeleton placeholders or spinners appear briefly
- [ ] Data loads and replaces placeholders
- [ ] No layout shift after data loads

---

## Phase 13: Session Management

### Test 13.1 — Session Persistence
Close browser tab → reopen `http://localhost:5173/dashboard`
- [ ] Still logged in (refresh token active)
- [ ] Dashboard loads without re-login

### Test 13.2 — Sign Out
Click logout
- [ ] Redirects to `/login`
- [ ] `/dashboard` redirects back to `/login`
- [ ] Token cleared from local storage

---

## Phase 14: Re-Seed Idempotency

### Test 14.1 — Re-run Seed
```bash
npm run seed   # run twice
```
- [ ] Completes without errors both times
- [ ] Same counts: 14 products, 201 orders, 12 alerts
- [ ] No duplicate data in dashboard
- [ ] All features work identically

---

---

# Testing Checklist Summary

| # | Feature Area | Test | Pass Criteria |
|---|-------------|------|---------------|
| **SETUP** | | | |
| 1 | Migrations | Run DB migrations | All applied, no errors |
| 2 | Seed | Run seed script | 14 products, 201 orders, 12 alerts, 18 edge cases |
| 3 | API startup | Start API | `🚀 Percepta API running`, workers started |
| **AUTH** | | | |
| 4 | Login UI | Load login page | Fields, button, tagline visible |
| 5 | Demo login | Login as demo user | Redirects to /dashboard |
| 6 | Bad login | Wrong password | Error message; stays on login |
| 7 | Register | Create new account | Redirects to /onboarding |
| **DASHBOARD** | | | |
| 8 | Layout | View dashboard | 4 KPI cards, table, fee chart, sidebar |
| 9 | KPI cards | Check scorecard values | All 4 populated with colour-coding |
| 10 | Loss-makers count | Check loss-maker KPI | ≥ 2 loss-makers (Phone Case, LED Bulb) |
| 11 | Default sort | Product table on load | Loss-makers at top |
| 12 | Period selector | Switch 7d/30d/90d/Custom | Numbers change correctly per period |
| 13 | Product sort | Click column headers | Re-sorts; asc/desc toggle; arrow indicator |
| 14 | Product search | Type "Braai" | Filters to match; count updates |
| 15 | Out-of-stock row | Find Water Bottle | 0 units, R0 revenue in 30d |
| 16 | Fee waterfall | Click product row | Waterfall with all 8 steps; net profit matches table |
| 17 | Per-unit label | Multi-unit order | "Per unit · order qty: N" label shown |
| 18 | Fee chart | Scroll to fee summary | Bar chart with 4 fee types; table with totals |
| **RETURNS & REVERSALS** | | | |
| 19 | Returned orders excluded | Earbuds 90d profit | Returned order (R899) not in profit totals |
| 20 | Return spike alert | Alerts page | "High return rate: Earbuds" warning alert |
| 21 | Return Requested excluded | Baby Monitor | Pending return order not in fee calculations |
| 22 | Cancelled excluded | Camping Chair | Cancelled order not in revenue totals |
| 23 | Out-of-stock product | Water Bottle in table | 0 sales, historical orders in 90d |
| 24 | Out-of-stock alert | Alerts page | Critical "Out of stock: Water Bottle" alert |
| **INVENTORY** | | | |
| 25 | Inventory page | Navigate via sidebar | Table with 14 products, DC columns, status badges |
| 26 | Overstocked badges | Baby Monitor, LED Bulb | ⚠️ Overstocked badge shown |
| 27 | Out-of-stock badge | Water Bottle | 🔴 Out of Stock badge; 0 across all DCs |
| 28 | Low stock | Yoga Mat (5d), Puzzle (8d) | Low stock indicator visible |
| 29 | Stock cover sort | Sort by Stock Cover | Overstocked products at top descending |
| 30 | Multi-DC display | Biltong Box | JHB 40, CPT 20 both shown |
| **ALERTS** | | | |
| 31 | Bell badge | Top bar | Unread count badge ≥ 5 |
| 32 | All 12 alert types | Alerts page | All 12 seeded alerts visible |
| 33 | Filter tabs | Loss-Makers, Storage | Correct alerts shown per tab |
| 34 | Mark read | Click "Mark as read" | Alert de-emphasized; badge decrements |
| 35 | Mark all | "Mark all read" | Badge clears; all alerts read |
| **COGS** | | | |
| 36 | COGS page | Navigate | 14 products with ⚠/✓ badges |
| 37 | Estimated badges | Yoga Mat, Desk Stand, etc. | ⚠ Estimated shown for 4 products |
| 38 | Inline edit | Change COGS value | Saves; badge → ✓ Manual |
| 39 | Excel template | Download .xlsx | Formatted file: yellow editable cols, grey read-only, frozen row |
| 40 | CSV template | Download .csv | Header + 14 product rows |
| 41 | Excel upload | Upload filled .xlsx | Auto-detected as xlsx; parses; preview shown |
| 42 | CSV upload | Upload filled .csv | Parses correctly; preview shown |
| 43 | Commit import | Click "Import N products" | Success screen; margins update in dashboard |
| 44 | Invalid upload | Upload file without offer_id | Parse error shown clearly |
| **FEE AUDIT** | | | |
| 45 | Upload CSV | Drop sample-sales-report.csv | Preview: matched orders, fee summary |
| 46 | Import commit | Click "Import N Orders" | Success screen |
| 47 | Discrepancies | View discrepancies tab | ≥ 2–3 discrepancies; Desk Stand overcharge visible |
| 48 | Returned orders excluded | Check discrepancy list | No returned orders in discrepancy table |
| 49 | Resolve | Acknowledge discrepancy | Status → Acknowledged (green) |
| 50 | Bulk action | Select all → Dispute | All → Disputed (red) |
| 51 | Export CSV | Click Export | CSV downloads with correct data |
| **NOTIFICATIONS** | | | |
| 52 | Preferences UI | Navigate | Toggles + threshold + save button |
| 53 | Save | Change and save | Persisted on refresh |
| 54 | Unsubscribe URL | ?disable=emailWeeklyDigest | Auto-toggles OFF and saves |
| **SYNC** | | | |
| 55 | Manual sync | Trigger sync | Completes via MockTakealotClient |
| 56 | New order webhook | POST webhook-new-order.json | 200 OK; order processed |
| 57 | Status change webhook | POST webhook-status-changed.json | 200 OK; status updated |
| **REAL-TIME** | | | |
| 58 | Live badge | Check top bar | Green "Live" badge visible |
| 59 | Reconnect | Stop/restart API | Offline → reconnects → Live |
| **SESSION** | | | |
| 60 | Persistence | Close and reopen tab | Still logged in |
| 61 | Sign out | Click logout | Redirects to /login |
| **IDEMPOTENCY** | | | |
| 62 | Re-seed | Run `npm run seed` twice | Same counts; no duplicates |
