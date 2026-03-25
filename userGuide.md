# Percepta User Guide

> This is a living document. It will be updated as new features are built.

---

## What is Percepta?

Percepta is a profitability dashboard for Takealot sellers. It connects to your Takealot Seller account, imports your orders and products, and shows you exactly how much profit you're making — after all fees, costs, and overheads.

Most Takealot sellers only see revenue. Percepta shows you what's left after Takealot takes their cut.

---

## Getting Started

### 1. Create Your Account

Sign up at the Percepta login page with your email and a password.

### 2. Connect Your Takealot API Key

During onboarding, you'll be asked for your Takealot Seller API key. This is how Percepta pulls your orders and products automatically.

**Where to find your API key:**
- Log in to the Takealot Seller Portal
- Go to **Settings** (gear icon, top right)
- Copy the **API Key** value

Paste it into Percepta. Your key is encrypted using AES-256-GCM and never stored in plain text.

### 3. Initial Sync

Once your API key is saved, Percepta will run an initial sync to pull your products and recent orders. This typically takes 1-2 minutes depending on your catalog size.

You'll see a progress indicator on the dashboard. Once complete, your profitability data is ready.

---

## Daily Workflow

This is what happens automatically, without you doing anything:

### Automatic Syncing

Percepta syncs your data from the Takealot API every few hours:
- **New orders** are pulled in and fees are calculated instantly
- **Offer updates** (price changes, stock levels) are reflected
- **Order status changes** (shipped, delivered, returned) are tracked via webhooks

### Check Your Dashboard

Log in and review:
- **Profit scorecard** — your total revenue, fees, COGS, and net profit for the selected period
- **Product table** — per-product breakdown showing which items are profitable and which are loss-makers
- **Fee waterfall** — click any product to see exactly how fees eat into your selling price
- **Alerts** — loss-maker warnings, margin drop notifications

### Act on Alerts

Percepta flags products that need attention:
- **Loss-maker alerts** — products where fees + COGS exceed the selling price
- **Margin drop alerts** — products where profit margin has fallen below your target
- **Storage warnings** — overstocked items incurring storage fees (>35 days cover)

---

## Monthly Workflow

Once a month (after each Takealot disbursement), upload two CSV files to get the complete financial picture.

### Step 1: Upload Your Sales Report

**What it provides:** Actual fee amounts Takealot charged per order (not just Percepta's estimates). This enables fee auditing — comparing what Takealot charged vs. what the fee schedule says they should have charged.

**How to get it:**
1. Log in to Takealot Seller Portal
2. Go to **Reports** > **Sales Report**
3. Select the date range (match your disbursement cycle)
4. Click **Export CSV**
5. In Percepta, go to **Fee Audit** > **Sales Report** tab
6. Drag and drop the CSV file

**What happens:**
- Percepta shows you a preview: how many orders matched, fee totals, any parse errors
- Click **Import** to commit
- Percepta compares actual fees against calculated fees and flags discrepancies
- Check the **Fee Discrepancies** tab to see if Takealot overcharged you

### Step 2: Upload Your Account Transactions

**What it provides:** The complete financial ledger — everything the API and Sales Report don't include:
- Return reversals (how much revenue was lost to returns)
- Stock losses (when Takealot loses your inventory)
- Storage fees (actual amounts, not estimates)
- Subscription fees (the monthly R460 Takealot platform fee)
- Ad spend (money spent on Takealot advertising)
- Removal fees (charges for removing stock from DCs)
- Disbursements (when and how much Takealot paid you)

**How to get it:**
1. Log in to Takealot Seller Portal
2. Go to **Payments** > **Account Transactions**
3. Set the date range
4. Click **Export** to download the CSV
5. In Percepta, go to **Fee Audit** > **Account Transactions** tab
6. Drag and drop the CSV file

**What happens:**
- Percepta parses all 17 transaction types and shows a breakdown
- Duplicate transactions are automatically detected and skipped (safe to re-import)
- Orders with returns are flagged and profit is recalculated
- Non-order costs (subscription, ads, storage, removals, stock losses) are aggregated as monthly overhead
- Your dashboard profit figures adjust to show the true picture

### The Before & After

| Metric | Before Upload (Estimated) | After Upload (Reconciled) |
|--------|--------------------------|--------------------------|
| Revenue | Gross order revenue | Revenue minus returns |
| Fees | Calculated from rate tables | Actual amounts from Takealot |
| Overhead | Not visible | Subscription + storage + ads + removals + stock losses |
| Profit | Estimated | Actual |

---

## Dashboard

### Profit Scorecard

The top section shows your key metrics for the selected period:
- **Revenue** — total selling price of all orders (excl. returned/cancelled)
- **Total Fees** — sum of all Takealot fees (success, fulfilment, IBT, storage)
- **COGS** — Cost of Goods Sold (your purchase cost)
- **Net Profit** — what's left: Revenue - Fees - COGS - Inbound Costs
- **Profit Margin** — Net Profit as a percentage of Revenue
- **Loss Makers** — number of products where margin is negative

### Product Table

A sortable, paginated list of all your products with:
- Units sold, revenue, fees, COGS, net profit, and margin percentage
- Colour-coded margin badges: green (>20%), amber (5-20%), red (<5%)
- Click any product to see its fee waterfall breakdown

### Fee Waterfall

Per-product visual breakdown showing how fees reduce your selling price:
- Selling Price → minus Success Fee → minus Fulfilment Fee → minus IBT (if applicable) → minus Storage (if overstocked) → minus COGS → minus Inbound → **Net Profit**

---

## Fee Audit

### Sales Report Import

Upload your Takealot Sales Report CSV to get actual fee amounts per order. Percepta compares these against its calculated estimates and flags discrepancies.

### Account Transactions Import

Upload your Takealot Account Transactions CSV to import the complete financial ledger: reversals, stock losses, overhead costs, and disbursements.

### Fee Discrepancies

After importing a Sales Report, check this tab for orders where Takealot's actual fee differs from the calculated fee by more than 5%. Each discrepancy can be:
- **Acknowledged** — you've reviewed it and it's acceptable
- **Disputed** — you believe it's an error worth raising with Takealot

---

## COGS Management

COGS (Cost of Goods Sold) is your purchase price per unit. Without COGS, Percepta estimates it at 50% of selling price.

### Manual Entry

Click any product in the COGS page and enter your actual cost per unit.

### CSV Upload

Bulk-upload COGS via CSV with columns: SKU, COGS (Rands).

### Excel Template

Download the pre-formatted Excel template, fill in your costs, and upload.

---

## Alerts & Notifications

### Alert Types

| Alert | Trigger | What To Do |
|-------|---------|------------|
| **Loss Maker** | Product margin is negative | Review pricing, COGS, or consider discontinuing |
| **Margin Drop** | Margin fell below your target | Check if fees increased or COGS changed |
| **Storage Warning** | Stock cover >35 days | Run a promotion or request removal to avoid storage fees |

### Email Notifications

Configure in **Settings** > **Notifications**:
- **Weekly digest** — summary email every Monday with your profit highlights
- **Loss-maker alerts** — immediate email when a product becomes unprofitable
- **Margin threshold** — set your minimum acceptable margin (default: 15%)

---

## Glossary

| Term | Definition |
|------|-----------|
| **Success Fee** | Commission Takealot charges per sale, calculated as a percentage of the VAT-inclusive selling price. Varies by category (7.5% to 18%). |
| **Fulfilment Fee** | Per-unit fee for picking, packing, and shipping an order. Varies by product size, weight, and category. |
| **IBT (Inter-Branch Transfer)** | Additional fee when a product ships from a different DC than the customer's nearest DC. |
| **Storage Fee** | Monthly per-unit fee for products with stock cover exceeding 35 days. |
| **COGS** | Cost of Goods Sold — your purchase price per unit. |
| **Inbound Cost** | Your cost to ship products to Takealot's distribution centres. |
| **Reversal** | When a customer returns an order, Takealot reverses the payment (takes back the revenue) and refunds the success fee. |
| **Stock Loss** | When Takealot loses your inventory in their warehouse. They charge fees on the lost items and pay compensation. |
| **Disbursement** | Takealot's payout to your bank account, typically every 1-2 weeks. |
| **TSIN** | Takealot Stock Identification Number — Takealot's unique ID for a product listing. |
| **SKU** | Stock Keeping Unit — your own product identifier. |
| **DC** | Distribution Centre — Takealot's warehouses (JHB, CPT, DBN). |
| **Margin** | Net Profit divided by Revenue, expressed as a percentage. |

---

*Last updated: 2026-03-25*
