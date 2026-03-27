# Percepta User Guide

> This is a living document. It is updated as new features are built.

---

## What is Percepta?

Percepta is a profitability dashboard for Takealot sellers. It connects to your Takealot Seller account, imports your orders and products, and shows you exactly how much profit you're making — after all fees, costs, and overheads.

Most Takealot sellers only see revenue. Percepta shows you what's left after Takealot takes their cut.

---

## Getting Started

### 1. Create Your Account

Sign up at the Percepta login page with your business name, email, and a password.

### 2. Connect Your Takealot API Key

During onboarding you'll be asked for your Takealot Seller API key. This is how Percepta pulls your orders and products automatically.

**Where to find your API key:**
1. Log in to the Takealot Seller Portal
2. Go to **Settings** (gear icon, top right)
3. Copy the **API Key** value

Paste it into Percepta. Your key is encrypted using AES-256-GCM and never stored in plain text.

### 3. Initial Sync

Once your API key is saved, Percepta runs an initial sync to pull your products and recent orders. This typically takes 1–2 minutes depending on your catalogue size.

A progress indicator shows on-screen. Once complete, your profitability data is ready.

---

## Daily Workflow

The following happens automatically:

### Automatic Syncing

- **New orders** are pulled in and fees are calculated instantly
- **Offer updates** (price changes, stock levels) are reflected
- **Order status changes** (Shipped, Delivered, Returned, Cancelled) are tracked via webhooks

### Check Your Dashboard

Log in and review:
- **Profit scorecard** — total revenue, fees, COGS, and net profit for the selected period
- **Product table** — per-product breakdown showing which items are profitable and which are loss-makers
- **Fee waterfall** — click any product to see exactly how fees reduce your selling price
- **Alerts** — loss-maker warnings, margin drop notifications, overstock and return alerts

### Act on Alerts

Percepta flags products that need attention:
- **Loss-maker alerts** — products where fees + COGS exceed the selling price
- **Margin drop alerts** — products where profit margin has fallen below your target
- **Storage warnings** — overstocked items incurring storage fees (> 35 days stock cover)
- **Return spike alerts** — products with an unusually high return rate
- **Out-of-stock alerts** — products with zero stock across all DCs

---

## Monthly Workflow

Once a month (after each Takealot disbursement), upload two CSV files to get the complete financial picture.

### Step 1: Upload Your Sales Report

**What it provides:** Actual fee amounts Takealot charged per order (not just Percepta's estimates). Enables fee auditing — comparing what Takealot charged vs. what the fee schedule says they should have charged.

**How to get it:**
1. Log in to Takealot Seller Portal
2. Go to **Reports** → **Sales Report**
3. Select the date range (match your disbursement cycle)
4. Click **Export CSV**
5. In Percepta, go to **Fee Audit** → **Import Sales Report** tab
6. Drag and drop the CSV file

**What happens:**
- Preview shows matched orders, fee totals, any parse errors
- Click **Import** to commit
- Percepta compares actual fees against calculated fees and flags discrepancies
- Check the **Fee Discrepancies** tab to see if Takealot overcharged you

### Step 2: Upload Your Account Transactions

**What it provides:** The complete financial ledger — everything the API and Sales Report don't cover:
- Return reversals (how much revenue was lost to returns)
- Stock losses (when Takealot loses your inventory)
- Storage fees (actual amounts, not estimates)
- Subscription fees (the monthly Takealot platform fee)
- Ad spend (Takealot advertising costs)
- Removal fees (charges for removing stock from DCs)
- Disbursements (when and how much Takealot paid you)

**How to get it:**
1. Log in to Takealot Seller Portal
2. Go to **Payments** → **Account Transactions**
3. Set the date range
4. Click **Export** to download the CSV
5. In Percepta, go to **Fee Audit** → **Account Transactions** tab
6. Drag and drop the CSV file

**What happens:**
- Percepta parses all 17 transaction types and shows a breakdown
- Duplicate transactions are automatically detected and skipped (safe to re-import)
- Orders with returns are flagged and `reversal_amount_cents` is recorded
- Non-order costs (subscription, ads, storage, removals, stock losses) are aggregated as monthly overhead
- Dashboard profit figures adjust to show the true picture

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

The top section shows key metrics for the selected period (7d / 30d / 90d / Custom):

| Card | What it shows |
|------|--------------|
| **Net Profit** | Revenue minus all fees, COGS, and inbound costs |
| **Total Revenue** | Gross selling price of all non-returned/cancelled orders |
| **Profit Margin** | Net Profit as a % of Revenue — green ≥ 25%, amber 0–24%, red < 0% |
| **Loss-Making Products** | Count of products with negative aggregate margin |

Each card shows a trend arrow and comparison against the previous equivalent period.

### Product Table

Sortable, searchable list of all your products:
- **Columns:** Product, Units, Revenue, Fees, COGS, Net Profit, Margin %, Last Sale
- **Default sort:** Lowest margin first — loss-makers surface at the top
- **Margin badges:** Green (profitable), Amber (marginal), Red (loss-maker)
- **COGS indicators:** ✓ Manual (your actual cost) or ⚠ Estimated (50% of price)
- Click any column header to sort ascending / descending
- Use the search bar to filter by product name or SKU

### Fee Waterfall

Click any product row to expand the per-unit fee waterfall:

> **Selling Price** → − Success Fee → − Fulfilment Fee → − IBT Penalty → − VAT on Fees → − Storage Fee → − COGS → − Inbound Cost → **= Net Profit**

For multi-unit orders, all values are shown **per unit** with a label indicating the order quantity (e.g. *Per unit · order qty: 3*).

### Period Selector

The **7d / 30d / 90d / Custom** pills filter all dashboard data:
- **7d** — last 7 days, useful for catching recent margin changes
- **30d** — default view, most useful for month-on-month tracking
- **90d** — quarter view, shows seasonal patterns
- **Custom** — pick any start and end date

### Fee Summary Chart

Below the product table, the "Where Your Money Goes" section shows:
- A horizontal bar chart breaking down total fees by type
- Fee types: Success Fee, Fulfilment Fee, IBT Penalty, Storage Fee
- Each bar shows the Rand amount and % of total revenue
- A detail table with totals for each fee type

---

## Inventory

Navigate to **Inventory** in the sidebar to see stock health across all your products.

### Stock Levels Tab

| Column | Description |
|--------|-------------|
| **Product** | Product title and SKU |
| **JHB / CPT / DBN** | Units held at each Takealot distribution centre |
| **Total** | Sum across all DCs |
| **Cover** | Estimated days of stock remaining, colour-coded: green ≥ 14d, amber 7–13d, red < 7d |
| **Velocity** | Average units sold per day (based on last 30 days) |
| ⚠️ | Low stock warning triangle — shown when cover is critical and the product is selling |

**Sort options:** Cover days / Total stock / Velocity / A–Z

**Search:** Filter by product title or SKU.

**Export CSV:** Download the full stock table as a CSV file.

**Typical actions based on stock status:**

| Status | What it means | Suggested action |
|--------|--------------|-----------------|
| 🟢 Green cover (≥ 14d) | Healthy stock level | No action needed |
| 🟡 Amber cover (7–13d) | Getting low | Plan a replenishment shipment |
| 🔴 Red cover (< 7d) | Low stock — may run out soon | Send stock urgently |
| Zero stock | Out of stock / listing paused | Replenish to re-activate the listing |
| Cover > 35 days | Overstocked — storage fees accruing | Run a promotion or request removal |

### Returns Tab

Shows all orders that have a reversal (money returned to the customer). Each row includes:
- **Order ID** — Takealot order number
- **Product** — title and SKU
- **Order Date** — when the order was placed
- **Qty** — number of units in the order
- **Reversal** — amount refunded (shown in red)
- **Shipped** — date the item was originally shipped

Returns are populated automatically when:
1. Webhooks from Takealot fire a "Returned" or "Return Requested" status change, **or**
2. You import your Account Transactions CSV (which includes all reversal entries)

> **Note on profit impact:** Returned and cancelled orders are fully excluded from profit and fee calculations. Only Shipped, Delivered, and Accepted orders contribute to your net profit figures.

---

## Alerts & Notifications

### Alert Types

| Alert | Severity | Trigger | Suggested Action |
|-------|----------|---------|-----------------|
| **Loss Maker** | Critical | Product net margin is negative | Review pricing, reduce COGS, or consider discontinuing |
| **Near-Loss** | Warning | Margin < 5% | Enter accurate COGS — estimated COGS may be masking a real loss |
| **Margin Drop** | Warning | Margin fell > 5 points vs prior period | Check if fee rates changed or if IBT increased |
| **Storage Warning** | Warning / Critical | Stock cover > 35 days | Run a promotion or request removal from DC |
| **Return Spike** | Warning | Return rate significantly above average | Review product listing and description for accuracy |
| **Out of Stock** | Critical | Zero stock across all DCs | Replenish to re-activate the Buyable listing |
| **Fee Discrepancy** | Warning | Actual fee differs from calculated by > 5% | Review the discrepancy and consider raising with Takealot |

### Unread Badge

The bell icon in the top navigation bar shows a red badge with your unread alert count. Clicking it navigates to the Alerts page.

### Alert Actions

Each alert card has:
- A coloured left border (red = critical, amber = warning)
- **Mark as read** — removes the bold emphasis and decrements the badge
- **Mark all read** — clears all unread in one click

Filter tabs on the Alerts page: **All / Loss-Makers / Margin Drops / Storage**

### Email Notifications

Configure in **Notifications** (sidebar):

| Setting | Default | What it does |
|---------|---------|-------------|
| **Weekly Profit Report** | ON | Summary email every Monday with profit highlights |
| **Real-Time Loss Alerts** | ON | Immediate email when a product becomes unprofitable |
| **Margin Threshold** | 15% | Alert fires when product margin drops below this value |

Changes take effect immediately after clicking **Save Preferences**.

**Unsubscribe link:** Emails include a one-click unsubscribe link that automatically disables the relevant toggle.

---

## COGS Management

COGS (Cost of Goods Sold) is your purchase price per unit. Without it, Percepta estimates at 50% of selling price — this estimate is often wrong and will make your profit figures inaccurate.

### Viewing COGS Status

The COGS page (sidebar) lists all your products with one of two badges:
- **✓ Manual** — you've entered your actual cost
- **⚠ Estimated** — Percepta is using a 50% estimate

Products with estimated COGS are less reliable. Enter your real cost for accurate margin calculations.

### Manual Entry (Inline Edit)

On the COGS Products tab:
1. Click the COGS (R) field on any product row
2. Type your actual cost per unit
3. Optionally enter your inbound cost (shipping to Takealot DC)
4. Save — the badge changes from ⚠ Estimated to ✓ Manual

Profit calculations for that product are updated immediately.

### Bulk Import via Excel Template (Recommended)

1. Click the **CSV Import** tab
2. Click **Excel (.xlsx)** to download the pre-filled template
3. Open in Excel or Google Sheets:
   - **Grey columns** (Offer ID, SKU, Title, Current Price) are read-only — do not edit
   - **Yellow columns** (★ Your Cost / COGS and ★ Inbound Cost) are for your input
4. Fill in your COGS values for each product
5. Save the file and drag it onto the upload area in Percepta
6. Review the preview — matched products show in green, unmatched rows are skipped
7. Click **Import N products** to commit

### Bulk Import via CSV

1. Click **CSV** (secondary button) to download the plain CSV template
2. Open in Excel or a text editor
3. Fill in `cogs_rands` and `inbound_cost_rands` for each row
4. Save as CSV and upload via the drop zone
5. Preview and commit

### Supported Upload Formats

| Format | Extension | Notes |
|--------|-----------|-------|
| Excel | `.xlsx` | Recommended — template has formatting guidance |
| CSV | `.csv` | For advanced users or automated pipelines |

Both formats use the same column structure: `offer_id`, `cogs_rands`, `inbound_cost_rands`.

---

## Fee Audit

The Fee Audit section helps you verify Takealot charged you correctly and understand exactly where your money goes.

### Import Sales Report Tab

Upload your Takealot Sales Report CSV (from the Seller Portal). Percepta:
1. Parses the file and shows a preview (matched orders, fee totals, parse errors)
2. After you click **Import**, stores actual fee amounts against each order
3. Runs a comparison between actual and calculated fees

### Fee Discrepancies Tab

Shows every order where Takealot's actual fee differs from the calculated fee by more than 5%:

| Column | Description |
|--------|-------------|
| Product | Which product the order is for |
| Order # | Takealot order ID |
| Fee Type | Which fee is mismatched (Success, Fulfilment, Stock Transfer) |
| Actual | What Takealot actually charged |
| Calculated | What Percepta calculated from the fee schedule |
| Difference | Actual minus Calculated (red = overcharged, green = undercharged) |
| Status | Open / Acknowledged / Disputed |

**Actions per discrepancy:**
- **Acknowledge** — you've reviewed it and accept the amount
- **Dispute** — you believe it's an error worth raising with Takealot Support

Use the **bulk action** checkbox to acknowledge or dispute multiple rows at once.

Use the **Export CSV** button to download a report for your records.

> **Note:** Returned and cancelled orders are excluded from fee discrepancy tracking — only fulfilled orders are compared.

### By Product Tab

Aggregated view showing total discrepancies per product — useful for spotting systematic overcharging on a particular product or category.

### Insights Tab

Charts showing fee discrepancies over time and by fee type. Helps identify if a fee rate change from Takealot caused a spike.

### Import History Tab

A log of every Sales Report file you've imported, with filename, date, row count, and matched count.

### Account Transactions Tab

Upload your Takealot Account Transactions CSV to record:
- Return reversals (links to specific orders)
- Storage fees (actual monthly amounts)
- Subscription fees
- Ad spend
- Stock losses
- Disbursements

---

## Understanding Returns

### How Returns Flow Through Percepta

When a customer returns an item, the following happens:

1. **Takealot fires a webhook** → order status changes to "Return Requested" or "Returned"
2. **Percepta updates the order status** — the order is immediately excluded from profit calculations
3. **After disbursement**, the reversal appears in your Account Transactions CSV
4. **Importing Account Transactions** → Percepta records the reversal amount against the order

### Return Statuses

| Status | Meaning | Effect on Profit |
|--------|---------|-----------------|
| **Shipped / Delivered** | Normal fulfilled order | Included in profit calculations |
| **Return Requested** | Customer requested a return; waiting for Takealot to process | Excluded from profit |
| **Returned** | Item received back at DC; payment reversed | Excluded from profit |
| **Cancelled** | Order cancelled before dispatch | Excluded from profit |

### Viewing Returns

Go to **Inventory** → **Returns** tab to see all orders with reversal amounts — sorted by date, amount, or product name.

### Impact on Profitability

A high return rate on a product can turn it from profitable to loss-making. Percepta surfaces this via:
- The **return spike alert** when return rate is abnormally high
- The **Returns tab** showing cumulative reversal amounts per product
- The **product table** margins, which reflect only fulfilled orders

---

## Glossary

| Term | Definition |
|------|-----------|
| **Success Fee** | Commission Takealot charges per sale, as a % of the VAT-inclusive selling price. Varies by category (approx. 7.5%–18%). |
| **Fulfilment Fee** | Per-unit fee for picking, packing, and shipping. Varies by product size (Standard / Large / Oversize / Bulky), weight tier, and category. |
| **IBT (Inter-Branch Transfer)** | Additional penalty fee when a product ships from a DC that is not the customer's nearest DC (e.g. you store stock in JHB but the customer is in CPT). |
| **Storage Fee** | Monthly per-unit fee for products with stock cover exceeding 35 days. Accrues on unsold inventory sitting in Takealot's DCs. |
| **COGS** | Cost of Goods Sold — your purchase price per unit. |
| **Inbound Cost** | Your cost to ship products to Takealot's distribution centres. |
| **Reversal** | When a customer returns an order, Takealot reverses the payment (claws back the revenue) and refunds the success fee. The reversal amount is the full or partial selling price returned to the customer. |
| **Partial Reversal** | A reversal covering only some units in a multi-unit order (e.g. 1 of 2 units returned). |
| **Stock Loss** | When Takealot loses your inventory in their warehouse. They charge fees on the lost items and pay compensation. |
| **Stock Cover** | Estimated days of stock remaining, calculated as: Total Stock ÷ Average Daily Sales (30d). |
| **Sales Velocity** | Average units sold per day over the last 30 days. |
| **Disbursement** | Takealot's payout to your bank account, typically every 1–2 weeks. |
| **Fee Discrepancy** | A difference between the fee Takealot actually charged and the fee Percepta calculated from the published rate schedule. Differences > 5% are flagged for review. |
| **TSIN** | Takealot Stock Identification Number — Takealot's unique ID for a product listing. |
| **SKU** | Stock Keeping Unit — your own product identifier. |
| **DC** | Distribution Centre — Takealot's warehouses (JHB = Johannesburg, CPT = Cape Town, DBN = Durban). |
| **Margin** | Net Profit divided by Revenue, expressed as a percentage. |
| **Loss-Maker** | A product where total fees + COGS + inbound cost exceed the selling price, resulting in negative net profit per unit. |
| **Near-Loss** | A product with a margin below 5% — technically profitable but highly vulnerable to any fee or cost increase. |

---

*Last updated: 2026-03-27*
