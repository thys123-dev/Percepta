# Takealot Seller API — Complete Reference

> **Version:** 2.0  
> **Base URL:** `https://seller-api.takealot.com/`  
> **Last Updated:** February 2025

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Authentication](#2-authentication)
3. [Versioning](#3-versioning)
4. [Rate Limits](#4-rate-limits)
5. [API Integration Best Practices](#5-api-integration-best-practices)
6. [Offers API](#6-offers-api)
7. [Sales API](#7-sales-api)
8. [Webhooks](#8-webhooks)
9. [Troubleshooting](#9-troubleshooting)
10. [Quick Reference](#10-quick-reference)

---

## 1. Introduction

### What is an API?

An API (Application Programming Interface) establishes a common interface that enables two software programs to communicate. The Takealot Seller API enables your software to send and receive data from your Seller Portal account in an automated way—reducing manual effort and keeping systems in sync without human intervention.

### What Can Be Automated?

**Offers (Create & Update):**
- Selling price
- Recommended Retail Price (RRP)
- Leadtime days
- Leadtime stock (SoH)
- Product offer status (active/inactive/archived)

**Sales (Retrieve):**
- Order Date, Sale Status, Order ID, Order Item ID
- Product Title, Takealot Product Display Page URL
- SKU, TSIN, Offer ID, Quantity, Selling Price

### Getting Started

1. Engage a software developer for the technical integration
2. Review all documentation in this reference
3. Generate an API key in the [Seller Portal → Authentication](https://seller.takealot.com/api/seller-api)
4. Use the [Endpoint Documentation](https://seller-api.takealot.com/api-docs/) and [Swagger JSON](https://seller-api.takealot.com/api-docs/swagger.json) for technical details

### Important Notes

- **No sandbox/test environment** — Integration must be done against production
- API keys are shown only once upon generation — store them securely
- The "Try it out" button in the API docs does **not** work for authorised requests; you must use your API key

---

## 2. Authentication

### Header Format

Include your API key in every request using the `Authorization` header:

```
Authorization: Key <your-api-key>
```

### Key Management

- Keys are **lifetime** keys (no automatic expiry)
- Keys are **only presented upon initial generation**
- Store keys in a secure location
- If lost, keys must be regenerated (previous key becomes invalid)

### Third-Party Integrators

If using a third-party integration partner, provide their details in the Seller Portal.

---

## 3. Versioning

The Takealot Seller API uses **Major.Minor.Patch** versioning (e.g. 1.2.0).

### Version Inclusion

When calling endpoints, you only need to specify the **Major** version, prefixed with `v` (e.g. `v1`, `v2`).

### Non-Breaking Changes (Minor/Patch)

- New resource or API endpoint
- New optional parameter
- New optional key in request/response bodies

### Breaking Changes (Major)

- New required parameter
- New required key in bodies
- Removal of existing endpoint or method
- Materially different behaviour of an API call

---

## 4. Rate Limits

Rate limits are **dynamic** and vary by endpoint based on system load and usage.

### Response Headers

| Header | Definition |
|-------|------------|
| `x-RateLimit-Limit` | Maximum requests allowed in the limit window |
| `x-RateLimit-Remaining` | Requests remaining in the current window |
| `x-RateLimit-Reset` | Time when the window and remaining count reset |

### Exceeding Limits

- Returns **HTTP 429 Too Many Requests**
- Implement **exponential backoff** or retry mechanisms
- Monitor the rate limit headers to stay within limits

---

## 5. API Integration Best Practices

### Initial Migration Strategy

- **Limit date ranges** to 180 days at a time when date filters apply
- **Page through** results instead of requesting large datasets
- Use this for **one-off** historical migration only
- **Future data** should be processed via webhooks

**Example (Sales Migration):**
1. Set start date (e.g. 2020-01-01), end date = start + 180 days
2. While start date < today: paginate through all results (page index 0, 1, 2...)
3. Increment start date by 180 days, repeat

### Getting Updates — Use Webhooks

**Prefer webhooks over polling.** Available webhooks:
- Offer Updates
- Offer Creation
- Batch Completed
- New Leadtime Order
- Sale Status Changed
- New Dropship Order

**Do not** trigger an API query when you receive a webhook—the webhook payload contains the latest information.

### Pushing Updates

- **Use batches** for bulk offer updates (limit: 10,000 offers per batch)
- Use the **Batch Completed** webhook to track completion—do **not** poll the batch status endpoint
- For single updates, prefer **Offer ID** as the identifier (more performant than SKU)

### Things to Avoid

| Avoid | Instead |
|-------|---------|
| Interval-based polling | Use webhooks |
| Date range > 180 days | Use 180-day chunks |
| Re-querying for deltas | Use webhooks (Offer Updated, Sale Status Changed) |
| Treating API as real-time DB | Aggregate and store data on your systems |

---

## 6. Offers API

### 6.1 Versioning & Terminology

**Field name changes (use current references):**

| Old | New |
|-----|-----|
| `gtin` | `barcode` |
| `price` | `selling_price` |
| `status` | `status_action` (updates only, not create) |

**status_action values:**
- `Re-enable` — Sets status to Buyable or Not Buyable based on rules (you cannot explicitly set which)
- `Disable` — Sets status to "Disabled by Seller"

**Leadtime Stock** — Changed from single number to array of objects:
```json
[
  { "merchant_warehouse_id": 28676, "quantity": 50 }
]
```

### 6.2 Warehouse Locations

Your warehouse(s) have unique IDs. Use these in `leadtime_stock` and stock-related payloads.

**Example (your account):**
- Warehouse ID: **28676**

Refer to the Seller Portal for your current warehouse IDs.

### 6.3 Terms & Definitions

| Term | Reference | Definition |
|------|-----------|------------|
| Authentication | API Key | Lifetime key in Authorization header |
| Barcode | `barcode` | GTIN (EAN-13 or ISBN-13) for product/variant |
| Discount | `discount` | Percentage difference between selling price and RRP |
| Leadtime | `leadtime_days` | Working days to deliver to Takealot DC |
| Leadtime Stock | `leadtime_stock` | Stock available at your warehouses for leadtime orders |
| Offer | `offer_id` | Your price and availability for a product on Takealot |
| Offer URL | `offer_url` | takealot.com product page URL |
| Product Label Number | `product_label_number` | Takealot internal barcode for your offer |
| Product Title | `title` | Product title on takealot.com |
| RRP | `rrp` | Recommended retail price (list price) |
| Status | `status` | Buyable, Not Buyable, Disabled by Seller, Disabled by Takealot |
| Sales Units | `sales_units` | Sales in last 30 days per DC |
| Selling Price | `selling_price` | Your price on takealot.com |
| SKU | `sku` | Your unique identifier for the offer |
| Stock at Takealot | `stock_at_takealot` | Your stock in each Takealot DC |
| Stock Days Cover | `stock_cover` | Days of stock based on 30-day sales velocity |
| TSIN | `tsin` | Takealot's variant/product identifier |

### 6.4 Takealot Product Model

**Product** → **Variant** → **Offer**

- **Product:** Title, description, images (catalogue item)
- **Variant:** Same product, different attribute (e.g. size); identified by TSIN
- **Offer:** Your price, stock, leadtime for a product/variant; identified by Offer ID

### 6.5 Rules & Requirements

- **Disabled by Takealot** — Cannot update offer details
- **Price required** before offer can be buyable
- **Leadtime days required** to set leadtime stock; `0` leadtime = `0` leadtime stock
- **Buyable** requires: selling price + (stock at DC > 0 OR leadtime stock > 0) + status = Buyable
- **SKU** must be unique across your offers
- **RRP** must be ≥ selling price; optional (use `0` to remove)
- **status_action** only on Updates, not Create
- **Special characters in SKU** (`?`, `#`, `/`, `:`) — Use `GET /v2/offers/offer?identifier=SKUXXX` (URL-encode identifier)

### 6.6 Identifier Precedence (Batches)

When multiple identifiers are provided:
1. **Offer ID** (primary)
2. **Barcode** (secondary)
3. **SKU** (tertiary / update param)

### 6.7 Batch Limits & Notes

- **Max 10,000 offers** per batch
- Use **Batch Completed** webhook to track completion
- Leadtime stock is auto-decremented by Takealot on sale—time your API updates to avoid overselling

### 6.8 Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v2/offers` | Get all offers (paginated, max 100/page) |
| GET | `/v2/offers/count` | Get offers count |
| GET | `/v2/offers/offer/{identifier}` | Get single offer |
| GET | `/v2/offers/offer?identifier=` | Get single offer (query param; use for SKU with special chars) |
| PATCH | `/v2/offers/offer/{identifier}` | Update offer |
| PATCH | `/v2/offers/offer?identifier=` | Update offer (query) |
| POST | `/v2/offers/offer/{identifier}` | Create offer (identifier = barcode) |
| POST | `/v2/offers/offer?identifier=` | Create offer (query) |
| POST | `/v2/offers/batch` | Create batch |
| GET | `/v2/offers/batch/{batch_id}` | Get batch status/results |
| GET | `/{version}/offers/stock_counts` | Stock counts |
| GET | `/{version}/offers/stock_health_stats` | Stock health stats |

### 6.9 Validation Error Codes (E1–E33)

| Code | Message |
|------|---------|
| E1 | Offer could not be created - not eligible for marketplace |
| E2 | Failed to create offer. Barcode not found in catalogue |
| E3 | Failed to create offer. No barcode provided |
| E4 | Failed to create offer. Barcode already exists for account |
| E5 | Offer could not be created - TSIN mismatch |
| E6 | Failed to create SKU. SKU already exists |
| E7 | Failed to update offer. TSIN does not match |
| E8 | Failed to update offer. SKU does not match |
| E9 | Offer does not belong to merchant |
| E10 | Failed to update SKU. SKU already exists |
| E11 | Failed to disable. Offer has "Disabled by Takealot" status |
| E12 | Failed to enable. Offer has "Disabled by Takealot" status |
| E13 | Failed to update SKU. Offer disabled by Takealot |
| E14 | Failed to update leadtime. Offer disabled by Takealot |
| E15 | My SoH must be whole number ≥ 0 |
| E16 | My SoH update not permitted. Leadtime disabled |
| E17 | Failed to update My SoH. Offer disabled by Takealot |
| E18 | Failed to update My SoH. Leadtime days set to "None" |
| E19 | Selling price must be whole number ≥ 0 |
| E20 | Selling price must be ≤ RRP |
| E21 | Selling price cannot be updated. Offer disabled by Takealot |
| E22 | RRP must be whole number ≥ 0 |
| E23 | RRP must be ≥ selling price |
| E24 | RRP cannot be updated. Offer disabled by Takealot |
| E25 | Minimum leadtime not permitted for account |
| E26 | Maximum leadtime not permitted for account |
| E27 | SKU exceeds 255 characters |
| E28 | Leadtime update not permitted. Leadtime disabled |
| E29 | Merchant is not active on platform |
| E30 | Cannot update stock to less than zero |
| E31 | Offer ID does not match existing offer |
| E32 | TSIN does not match given offer |
| E33 | Barcode does not match given offer |

---

## 7. Sales API

### 7.1 Terms & Definitions

| Term | Reference | Definition |
|------|-----------|------------|
| Order ID | `order_id` | Unique identifier for a customer order |
| Order Item ID | `order_item_id` | Unique identifier for an item within an order |
| Order Date | `order_date` | Date order was placed and paid |
| Sale Status | `sale_status` | Status in fulfilment/supply chain |
| Product Title | `product_title` | Title as in Manage My Offers |
| takealot_url_mobi | `takealot_url_mobi` | Mobile product page URL |
| SKU | `sku` | Your unique product identifier |
| TSIN | `tsin` | Takealot variant identifier |
| Offer ID | `offer_id` | Your offer identifier |
| Quantity | `quantity` | Units purchased |
| Selling Price | `selling_price` | Total (unit price × quantity) |
| Promotion | `promotion` | Takealot promotion name |
| Customer | `customer` | Customer surname, name |
| Fulfilment DC | `dc` | DC that fulfilled (CPT; JHB; DBN) |
| Customer DC | `customer_dc` | Nearest DC to customer |
| PO Number | `po_number` | Shipment/PO identifier |
| Shipment Name | `shipment_name` | Shipment name from Seller Portal |

### 7.2 Date Filter Rules (180-Day Limit)

| Scenario | Behaviour |
|----------|-----------|
| Date range ≤ 180 days | Returns sales for period |
| Date range > 180 days | Error, no data |
| Missing start or end date | Defaults missing date to 180-day window |
| No date filter | Last 30 days (request date as end) |

### 7.3 Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/{version}/sales` | View sales |
| GET | `/{version}/sales/summary` | Sales summary |
| GET | `/{version}/sales/orders` | Sales orders |
| GET | `/{version}/sales/orders/{order_id}/customer_invoices` | Customer invoices |

---

## 8. Webhooks

### 8.1 Overview

Webhooks send real-time POST notifications to your URL when events occur—reducing API polling and keeping systems in sync.

### 8.2 Available Events

| Event | Purpose |
|-------|---------|
| New Leadtime Order | New leadtime order item |
| New Drop Ship Order | New dropship order |
| Sale Status Changed | Sale or sale status updated |
| Batch Completed | Bulk upload batch finished |
| Offer Updated | Offer fields changed |
| Offer Created | New offer created |

### 8.3 Webhook Configuration

- Create webhooks in Seller Portal
- Each webhook has a **Secret** for signature verification
- **Status:** Active (receives), Inactive (paused), Disabled (by Takealot)

### 8.4 Receiving Webhooks

**Request:**
- Method: `POST`
- Content-Type: `application/json`

**Headers:**

| Header | Purpose |
|--------|---------|
| `X-Takealot-Event` | Event type |
| `X-Takealot-Delivery` | UUID for this delivery |
| `X-Takealot-Signature` | HMAC hex digest (body + Secret) |

### 8.5 Verification

- Compute: `HMAC-SHA256(secret, request_body).hex()`
- Compare with `X-Takealot-Signature`

### 8.6 Response Requirements

- Return **HTTP 2xx** immediately to acknowledge
- **5 second** timeout—respond fast, process async
- Non-2xx = failure → retry
- **>80% failures** over 8 hours → webhook disabled

### 8.7 Retry Policy

- **3 retries** over **6 minutes** for failed deliveries

### 8.8 Reliability

- Webhook delivery is **not guaranteed**
- Implement **periodic reconciliation** by fetching from the Seller API

---

### 8.9 New Leadtime Order Webhook

**Purpose:** Decrement `leadtime_stock` in your system before sending updates via API.

**Payload:**
```json
{
  "order_id": 12345,
  "order_item_id": 67890,
  "offer": {
    "offer_id": 111,
    "sku": "SKU001",
    "barcode": "6001234567890",
    "leadtime_stock": [
      {
        "merchant_warehouse": { "warehouse_id": 28676, "name": "My Warehouse" },
        "quantity_available": 50
      }
    ]
  },
  "warehouse": "CPT",
  "total_selling_price": 29900,
  "quantity": 2,
  "event_date": "2025-02-15T10:00:00Z",
  "facility": { "code": "CPT", "address": "..." }
}
```

**Facility codes:** CPT, JHB, CPT2, JHB2, JHB3, DBN

---

### 8.10 New Drop Ship Order Webhook

**Purpose:** Decrement `leadtime_stock` for dropship orders (same pattern as leadtime).

**Payload:**
```json
{
  "order_id": 12345,
  "ready_for_collect_due_date": "2025-02-18",
  "acceptance_due_date": "2025-02-16",
  "merchant_warehouse": { "warehouse_id": 28676, "name": "My Warehouse" },
  "offers": [
    {
      "offer": {
        "offer_id": 111,
        "sku": "SKU001",
        "barcode": "6001234567890",
        "leadtime_stock": [
          {
            "merchant_warehouse": { "warehouse_id": 28676, "name": "My Warehouse" },
            "quantity_available": 48
          }
        ]
      },
      "quantity_required": 2
    }
  ],
  "event_date": "2025-02-15T10:00:00Z"
}
```

---

### 8.11 Sale Status Changed Webhook

**Purpose:** Keep sale status in sync without querying Sales API.

**Payload:**
```json
{
  "sale": {
    "order_item_id": 67890,
    "order_id": 12345,
    "order_date": "2025-02-15",
    "sale_status": "Shipped to Customer",
    "offer_id": 111,
    "tsin": 123456,
    "sku": "SKU001",
    "customer": "Smith, John",
    "product_title": "Product Name",
    "takealot_url_mobi": "https://...",
    "selling_price": 29900,
    "quantity": 2,
    "warehouse": "CPT",
    "customer_warehouse": "CPT",
    "promotion": "",
    "shipment_id": 555,
    "shipment_state_id": 3,
    "po_number": 777,
    "shipment_name": "Shipment A",
    "takealot_url": "https://..."
  },
  "event_timestamp_utc": "2025-02-15T12:00:00Z"
}
```

**Note:** `Shipped to Customer` = final status (only `Returned` can follow).

---

### 8.12 Batch Completed Webhook

**Purpose:** Know when batch processing is done; use `batch_id` to fetch results.

**Payload:**
```json
{
  "seller_id": 123,
  "batch_id": "abc123",
  "status": "SUCCESS"
}
```

**Status values:** `SUCCESS`, `FAILURE`

---

### 8.13 Offer Updated Webhook

**Purpose:** Track offer changes without re-querying offer endpoint.

**Payload:**
```json
{
  "seller_id": 123,
  "offer_id": 111,
  "values_changed": {
    "selling_price": 29900,
    "leadtime_days": 5
  },
  "batch_id": 456
}
```

`batch_id` is optional (present when update came from a batch).

---

### 8.14 Offer Created Webhook

**Purpose:** React when new offers are created.

**Payload:**
```json
{
  "seller_id": 123,
  "offer_id": 111,
  "merchant_sku": "SKU001",
  "tsin_id": 123456,
  "gtin": "6001234567890",
  "minimum_leadtime_days": 3,
  "maximum_leadtime_days": 7,
  "selling_price": 29900,
  "rrp": 34900,
  "merchant_warehouse_stock": [
    { "merchant_warehouse_id": 28676, "quantity": 100 }
  ],
  "batch_id": 456
}
```

**Note:** API uses `barcode`; webhook may use `gtin` (same value).

---

## 9. Troubleshooting

### Authorization

**Cannot access any endpoints**
- Generate an Access Key in Seller Portal
- Include it in the `Authorization` header

**"You do not have access to this resource" despite valid key**
- Use header: `Authorization: Key <your-api-key>` (exact format)
- Ensure no extra spaces; key is active

### Update/Create Endpoints

**Updates not reflecting (price, SKU, RRP, leadtime, status)**
- Use correct field names (e.g. `leadtime_days`, not `LeadTimeDays`)
- Check validation errors in the response
- If offer is **Disabled by Takealot** → some updates are blocked
- If **leadtime disabled** → some updates are blocked

### Endpoints V2

**Validation errors despite correct format**
- Explicitly use version `v2` in the path (e.g. `/v2/offers`)
- Default or wrong version may hit different endpoints

**Output differs from v2 spec**
- Ensure you are calling v2 endpoints (`/v2/...`)

### API Batches

**400 when creating batch**
- Check payload size: max **10,000** offers
- Read error message for invalid inputs

**Only some offers updated**
- Confirm batch completed (Batch Completed webhook or batch status)
- Check batch result/response for validation errors per offer
- Ensure no later batch overwrote the same offers

### Contact Seller Support

When contacting support, provide:
- Headers used
- Full URL
- Request method
- Full request payload
- Full response

---

## 10. Quick Reference

### Auth Header
```
Authorization: Key <your-api-key>
```

### Base URL
```
https://seller-api.takealot.com/
```

### Key Links
- [API Docs](https://seller-api.takealot.com/api-docs/)
- [Swagger JSON](https://seller-api.takealot.com/api-docs/swagger.json)
- [Seller Portal API](https://seller.takealot.com/api/seller-api)

### Limits
- Batch: 10,000 offers max
- Sales date filter: 180 days max
- Offers per page: 100 max

---

*This document consolidates information from Takealot Seller Portal documentation, API specifications, and integration best practices.*
