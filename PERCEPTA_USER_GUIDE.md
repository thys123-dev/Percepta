# Percepta — User Guide

> **See your real Takealot profit.** Percepta connects to your Takealot Seller account and shows you — in real time — exactly which products are making money, which are losing it, and what Takealot is charging you in fees.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Onboarding Wizard](#2-onboarding-wizard)
3. [The Dashboard](#3-the-dashboard)
4. [Alerts](#4-alerts)
5. [COGS Management](#5-cogs-management)
6. [Fee Audit](#6-fee-audit)
7. [Notification Settings](#7-notification-settings)
8. [Real-Time Updates](#8-real-time-updates)
9. [Feature Reference](#9-feature-reference)

---

## 1. Getting Started

### Creating Your Account

1. Navigate to the Percepta sign-up page and click **Create your account**.
2. Enter your **Business Name**, **Email**, and a **Password** (minimum 8 characters).
3. Click **Create account** — no credit card is required.

Once registered you are taken directly to the Onboarding Wizard to connect your Takealot store.

### Signing In

Enter your email and password on the login page and click **Sign in**. Your session persists via a 30-day refresh token — you will not be prompted to log in again unless you explicitly sign out.

---

## 2. Onboarding Wizard

The onboarding wizard walks you through four steps the first time you log in. It takes roughly 5–10 minutes to complete.

### Step 1 — Connect Your Takealot Account

Percepta communicates with your store through the official Takealot Seller API.

1. Open your **Takealot Seller Portal**.
2. Navigate to **API Settings** and copy your API key.
3. Paste the key into the Percepta field and click **Connect & Start Sync**.

> **Security:** Your API key is encrypted at rest using AES-256 and is never stored in plain text or shared with third parties.

### Step 2 — Initial Data Sync

Once connected, Percepta fetches:

- All of your current **product listings** (offers)
- Your **last 180 days of sales** orders

A live progress counter shows products and orders as they are discovered. The sync typically completes in 2–5 minutes. The wizard advances automatically when it finishes.

> If the sync fails it will **retry automatically** — you do not need to restart the wizard.

### Step 3 — Enter Your Cost of Goods (COGS)

This step unlocks accurate profit numbers.

| Column | What to enter |
|--------|--------------|
| **COGS (R)** | What you paid for one unit of the product (supplier cost) |
| **Inbound (R)** | Shipping cost to get the stock into a Takealot DC |

You can click **Skip for now** and add COGS later from the dedicated COGS page. Until COGS is set, Percepta estimates it at 30% of your selling price.

### Step 4 — Your Profit Snapshot

A 30-day summary is displayed the moment sync completes:

- **Revenue (30d)** — total sales revenue
- **Net Profit (30d)** — revenue minus all fees, COGS, and inbound costs
- **Profit Margin** — net profit as a percentage of revenue
- **Orders (30d)** — number of completed sales

If you have loss-making products, a banner appears telling you how many. Click **View My Full Dashboard →** to begin.

---

## 3. The Dashboard

The dashboard is your command centre. Every number updates automatically as new orders come in.

### Period Selector

Choose the reporting window using the period pills at the top right of the page:

| Option | What it shows |
|--------|--------------|
| **7d** | Last 7 days |
| **30d** | Last 30 days (default) |
| **90d** | Last 90 days |
| **Custom** | Any start and end date you choose |

The previous period of the same duration is calculated automatically for trend comparison.

---

### Profit Scorecard

Four KPI cards sit at the top of the dashboard.

#### Net Profit
Your total revenue minus Takealot fees, COGS, and inbound costs for the selected period. Shows an arrow and delta versus the previous period — **green arrow up** means improvement, **red arrow down** means things got worse.

**Why it matters:** This is the single most important number. Revenue is vanity; profit is sanity.

#### Total Revenue
The gross rand value of all completed sales in the period. Trend comparison shows whether your store is growing.

**Why it matters:** Track revenue alongside margin — a revenue increase that doesn't move profit means your costs are growing just as fast.

#### Profit Margin
Net profit expressed as a percentage of revenue. Colour-coded for instant reading:

| Colour | Meaning |
|--------|---------|
| 🟢 Green (≥ 25%) | Healthy margin |
| 🟡 Yellow (0–24%) | Marginal — worth watching |
| 🔴 Red (< 0%) | Selling at a loss |

**Why it matters:** Margin tells you whether your pricing strategy is sustainable regardless of volume.

#### Loss-Making Products
The number of distinct products that sold at a negative margin in the period. An **Alert** badge appears if this number is greater than zero.

**Why it matters:** A single high-volume loss-maker can silently drain thousands of rands per month.

---

### Product Performance Table

Below the scorecard is a sortable table of every product that sold in the period.

**Default sort: lowest margin first** — loss-makers surface at the top so you can act immediately.

#### Columns

| Column | Description |
|--------|-------------|
| **Product** | Title and SKU |
| **Units** | Total units sold |
| **Revenue** | Total sales revenue |
| **Fees** | Total Takealot fees paid (highlighted in red) |
| **COGS** | Total cost of goods — shows ✓ if manually set, ⚠ if estimated |
| **Net Profit** | Green for profitable, red for loss |
| **Margin** | Colour-coded badge (Profitable / Marginal / Loss-Maker) |
| **Last Sale** | Date of most recent completed order |

#### Sorting
Click any column header to sort ascending or descending. This is useful for identifying your highest revenue products, your biggest fee burden, or your most recent sellers.

#### Fee Waterfall Breakdown
Click any product row to expand a **fee waterfall** showing exactly how your revenue was consumed:

```
Selling Price
  − Success Fee
  − Fulfilment Fee
  − IBT Penalty (inter-DC transfer, if applicable)
  − Storage Fee Allocation
  − COGS
  − Inbound Cost
= Net Profit
```

**Why it matters:** You can see at a glance whether the problem is Takealot's fees, your own cost price, or both.

#### Search and Pagination
Use the search bar to filter by product title or SKU. Pagination lets you navigate large catalogues.

---

### Fee Summary

Below the product table, a horizontal bar chart breaks down where your money goes:

| Fee Type | Colour |
|----------|--------|
| Success Fee | Orange |
| Fulfilment Fee | Red |
| IBT Penalty | Purple |
| Storage | Yellow |

Each bar shows the fee amount and its percentage of total revenue. The detail table beneath lists every fee type with exact rand amounts.

**Why it matters:** If Fulfilment Fees are eating 18% of your revenue, that's the lever to pull — either through pricing or by evaluating which products justify the fulfilment cost.

---

## 4. Alerts

Percepta monitors your business in real time and fires alerts when something needs your attention.

Access alerts from the **Alerts** item in the sidebar or via the **bell icon** in the top bar. A red badge on the bell shows how many unread alerts you have.

### Alert Types

#### Loss-Maker Alert
**Triggered when:** A product sells at a negative net profit.

- **Warning** severity: margin is between 0% and −10%
- **Critical** severity: margin is below −10%

**What to do:** Review the fee waterfall for that product. Common causes are COGS set too low, a promotion that wasn't accounted for, or a price that no longer covers Takealot's fees after a fee increase.

#### Margin Drop Alert
**Triggered when:** A product's margin in the current sale falls more than 10 percentage points below its own 7-day average.

**What to do:** This often indicates an unexpected fee charge, a price change, or a shift in fulfilment DC. Check the fee waterfall and compare to the product's historical margin.

#### Storage Warning Alert
**Triggered when:** A product has 32 or more days of stock cover at a Takealot DC.

- **Warning** at 32–34 days: approaching the 35-day threshold
- **Critical** at 35+ days: Takealot storage fees are now accruing (R2–R225 per unit per month)

**What to do:** Create a promotion to sell through stock, or raise a removal order to retrieve inventory before charges compound.

#### Fee Overcharge Alert
**Triggered when:** A CSV sales report import finds discrepancies totalling more than R50 in overcharges, or more than 5 individual discrepancies.

**What to do:** Go to the **Fee Audit** page to review and dispute the overcharges.

---

### Reading the Alerts List

Each alert card shows:
- **Title** — what happened and which product
- **Message** — the specific numbers (loss amount, margin drop, days of cover)
- **Date** — when the alert was created
- A coloured left border (red = critical, yellow = warning)

Use the filter tabs to focus on a specific alert type:
- **All**
- **Loss-Makers**
- **Margin Drops**
- **Storage**

Click **Mark as read** on individual alerts, or **Mark all read** at the top to clear the badge.

---

## 5. COGS Management

COGS (Cost of Goods Sold) is the single input that transforms estimated profit into accurate profit. Set it correctly and every margin number on your dashboard becomes trustworthy.

Access COGS from the **COGS** item in the sidebar.

### Why COGS Matters

Without COGS, Percepta estimates your product cost at **30% of the selling price**. This is a rough industry average — your actual margin could be far better or far worse. The moment you enter real COGS:

1. Percepta queues a **profit recalculation** for all affected orders
2. Your dashboard updates within seconds
3. All alerts recalibrate to your real numbers

### Inline Editing (Products Tab)

The Products tab shows your full product catalogue with inline editable fields:

| Field | What to enter |
|-------|--------------|
| **COGS (R)** | Supplier cost per unit in rands |
| **Inbound (R)** | Freight/logistics cost to deliver stock to Takealot DC |

Edit directly in the table. A row turns yellow while unsaved. Save individual rows or all changes at once.

The **COGS source** column tells you at a glance which products still need attention:
- **⚠ Estimated** — using the 30% default, profit may be inaccurate
- **✓ Manual** — you have set the real cost, profit is accurate

### CSV Import (CSV Import Tab)

For large catalogues, bulk-update COGS via CSV:

1. Click **Download Template** to get a pre-filled CSV with your current products
2. Fill in the `cogs_rands` and `inbound_cost_rands` columns
3. Upload the file on the CSV Import tab
4. Review the **preview** (shows matched products, new values, changes)
5. Click **Commit** to apply

---

## 6. Fee Audit

Takealot's fees are calculated by their systems and charged on every sale. Errors happen. Fee Audit lets you import your official Takealot Sales Report CSV and compare it line-by-line against Percepta's calculated estimates to surface any discrepancies.

Access Fee Audit from the **Fee Audit** item in the sidebar.

### Why Fee Audit Exists

The Takealot API provides fee totals but not always the precise breakdown per order. The Sales Report CSV from the Seller Portal is the authoritative source — it contains the exact rand amount Takealot charged for each order. Importing it:

- Gives Percepta the **actual fee figures** for comparison
- Provides **precise ship dates** so the correct fee matrix version is used
- Captures **Courier Collection Fees** which are not available via the API
- Identifies **overcharges** that you can dispute with Takealot

---

### Step 1 — Download Your Sales Report

1. Log into the **Takealot Seller Portal**
2. Navigate to **Reports → Sales Report**
3. Select your date range and download the CSV

### Step 2 — Import the Sales Report

On the **Import Sales Report** tab:

1. Drag and drop the CSV file onto the upload zone, or click to browse
2. Percepta parses the file immediately and shows a **preview**

#### Preview Summary

| Indicator | Meaning |
|-----------|---------|
| **Matched orders** | Orders in the CSV that exist in Percepta |
| **Unmatched** | CSV rows that couldn't be linked (may need a sync first) |
| **New imports** | Orders being imported for the first time |
| **Already imported** | Orders already processed in a previous import |

Review the fee summary grid to confirm the totals look right, then click **Import [N] Orders**.

> A profit recalculation job is queued automatically after every successful import.

### Step 3 — Review Discrepancies

Switch to the **Fee Discrepancies** tab after importing. Any order where the actual fee differed from the calculated estimate by more than 5% is listed here.

#### Understanding the Table

| Column | Description |
|--------|-------------|
| **Product** | Title and SKU of the affected product |
| **Order #** | Takealot order number |
| **Date** | Order date |
| **Fee Type** | Success Fee, Fulfilment Fee, or Stock Transfer Fee |
| **Actual** | What Takealot charged |
| **Calculated** | What Percepta estimated |
| **Difference** | The gap in rands (red = overcharge, green = undercharge) |
| **% Off** | Percentage variance |
| **Status** | Open / Acknowledged / Disputed |

#### Summary Cards

At the top of the tab, four cards show the big picture:

- **Total Discrepancies** — number of affected orders
- **Net Impact** — total rand difference (positive = you overpaid)
- **Overcharged** — total rands where Takealot charged more than calculated
- **Undercharged** — total rands where Takealot charged less

#### Filtering

Narrow results using the dropdown filters:

- **Status:** All, Open, Acknowledged, Disputed
- **Fee Type:** All Fee Types, Success Fee, Fulfilment Fee, Stock Transfer Fee
- **Sort By:** Largest Impact, Most Recent, Fee Type

#### Taking Action

**Individual:** Click **Resolve** on any open row to mark it as Acknowledged or Disputed. Add a note (up to 500 characters) explaining your reasoning.

**Bulk:** Tick multiple rows (or the header checkbox to select all on the page), then use the **Acknowledge All** or **Dispute All** bulk action buttons.

> **Disputed** status means you intend to raise a ticket with Takealot support. Percepta does not submit disputes automatically — use this status as your internal tracker.

### By Product Tab

Aggregates all discrepancies by product so you can see which SKUs are consistently being overcharged. Useful for identifying systemic fee errors on specific product types.

### Insights Tab

Charts showing discrepancy trends over time:
- Discrepancies **by fee type** (which fee category causes the most errors)
- Discrepancies **by week** (whether the problem is getting better or worse)

### Import History Tab

A log of every previous CSV import showing filename, import date, matched row counts, and fee totals. Useful for auditing your import history.

### Exporting Discrepancies

Click **Export CSV** on any of the discrepancy tabs to download a spreadsheet of all visible rows. Use this when preparing a dispute submission to Takealot.

---

## 7. Notification Settings

Configure when and how Percepta emails you. Access from the **Notifications** item in the sidebar, or by clicking the settings gear icon in the top bar.

### Weekly Profit Report

A summary email sent every **Sunday morning** containing:
- Revenue, profit, and margin for the past week
- Your top-performing products
- Your bottom-performing products
- One specific recommendation to act on

**Toggle on/off** using the switch. The "Last sent" timestamp is shown so you know when the most recent digest was delivered.

**Why it's useful:** A weekly email keeps you informed even if you don't log in every day. The single recommendation removes decision fatigue — there is always one clear next step.

### Real-Time Loss Alerts

An instant email fires whenever a product sells at a loss, or whenever a product's margin drops below your configured threshold.

**Margin Threshold:** Set the percentage below which you want to be notified. Default is 15%. For example, if you set 20%, you will receive an email any time a product's margin falls below 20% — even if it's still technically profitable.

**Toggle on/off** using the switch. The threshold input is disabled when loss alerts are turned off.

### Saving Preferences

Changes to toggles and the threshold field are not saved automatically. Click **Save Preferences** to commit your changes. A green **Preferences saved** confirmation appears for 3 seconds.

### Unsubscribing from Emails

Every email sent by Percepta includes an unsubscribe link at the bottom. Clicking it opens the Notification Settings page with that email type automatically toggled off and saved — no need to log in separately.

---

## 8. Real-Time Updates

Percepta maintains a live WebSocket connection to the server while you are logged in.

A **Live** badge (green) in the top bar confirms the connection is active. If the connection is lost it shows **Offline** (grey) and automatically attempts to reconnect.

### What Triggers Live Updates

| Event | What updates |
|-------|-------------|
| New Takealot webhook (sale, cancellation, return) | Dashboard numbers refresh immediately |
| Profit recalculation completes | All KPI cards and product margins update |
| COGS update saved | Margin numbers recalculate and update |
| CSV import committed | Fee discrepancy counts update |
| New alert created | Bell badge increments, alert appears in list |

You never need to manually refresh the page to see new data.

---

## 9. Feature Reference

### Quick Reference — What Each Page Does

| Page | Primary Purpose |
|------|----------------|
| **Dashboard** | See your overall profitability and which products need attention |
| **Alerts** | Review and dismiss automated warnings |
| **COGS** | Set or update your product costs for accurate profit calculation |
| **Fee Audit** | Import Takealot CSV reports and identify fee overcharges |
| **Notifications** | Control which emails Percepta sends and when |

---

### Understanding Margin Status Badges

| Badge | Colour | Margin Range | Meaning |
|-------|--------|-------------|---------|
| **Profitable** | 🟢 Green | ≥ 25% | Healthy — this product is working well |
| **Marginal** | 🟡 Yellow | 0–24% | Worth monitoring — small cost increases could push it negative |
| **Loss-Maker** | 🔴 Red | < 0% | Urgent — you lose money on every sale |

---

### Understanding Fee Types

| Fee | Description |
|-----|-------------|
| **Success Fee** | Takealot's commission on each sale (percentage of selling price, category-dependent) |
| **Fulfilment Fee** | Picking, packing, and shipping cost charged per order |
| **IBT Penalty** | Inter-Branch Transfer fee when stock must move between Takealot DCs to fulfil an order |
| **Storage Fee** | Charged when stock has been in a DC for more than 35 days (R2–R225/unit/month depending on size) |
| **Courier Collection Fee** | Charged on seller-fulfilled orders; only visible via CSV import |

---

### Accuracy & Estimation

Percepta calculates fees using the same fee matrices Takealot publishes. Results are highly accurate but note:

- Fees are estimates until you import a **Sales Report CSV** — the CSV provides Takealot's actual charged amounts
- Profit is estimated (using 30% COGS) until you enter your real **COGS values**
- The **⚠ Estimated** badge on any product signals that its margin numbers should be treated as approximate

The combination of real COGS + CSV import gives you the most accurate picture possible.

---

### Data Retention & Privacy

Percepta is POPIA-compliant:

- **Right of Access:** You can export all data held about your account as a JSON file from your account settings
- **Right to Erasure:** You can permanently delete your account and all associated data at any time — deletion cascades to all orders, offers, alerts, and fee records

---

### Frequently Asked Questions

**How often does Percepta sync with Takealot?**
A background sync runs every night at 2:00 AM to pull in new offers and orders. New sales via webhook arrive in real time within seconds of a customer placing an order on Takealot.

**Why does a product show an estimated margin?**
The product's COGS has not been set manually. Go to the COGS page to enter the real supplier cost. Until then, Percepta uses 30% of the selling price as a fallback.

**Why do I have a margin drop alert on a profitable product?**
A margin drop alert fires when a product's latest sale margin is more than 10 percentage points below its own 7-day average — even if it is still in the green. This early warning lets you investigate before it becomes a loss.

**Can I dispute a fee discrepancy through Percepta?**
Percepta does not submit disputes to Takealot on your behalf. Mark the discrepancy as **Disputed** in Percepta to track it internally, then raise a support ticket with Takealot directly using the exported CSV as evidence.

**What happens when I update COGS?**
A profit recalculation job queues immediately. Within seconds, all affected order profit records are recalculated and your dashboard reflects the updated numbers. Alerts also recalibrate to the new margin figures.

**Is the weekly digest sent if I have no sales that week?**
The digest is sent regardless, but it will note that no orders were placed in the period. It still shows your overall portfolio state and any open alerts.
