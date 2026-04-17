/**
 * Webhook Job Processor
 *
 * BullMQ job processor for the `process-webhook` queue.
 * Handles all incoming Takealot webhook event types:
 *
 *   - "New Leadtime Order"    → upsert order + queue profit calculation
 *   - "New Drop Ship Order"   → same as above
 *   - "Sale Status Changed"   → update order status (tracks returns, cancellations)
 *   - "Offer Updated"         → update offer price/status in DB
 *   - "Offer Created"         → insert new offer
 *
 * After processing, marks the webhook_events row as processed.
 * Profit calculation is delegated to the calculate-profits worker.
 */

import type { Job } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { calculateProfitsQueue } from '../sync/queues.js';
import { detectIbt } from '../fees/fee-calculator.js';
import type { ProcessWebhookJobData } from '../sync/queues.js';

// Default COGS estimate: 50% of selling price (matches shared constant)
const DEFAULT_COGS_ESTIMATE_PCT = 0.50;

// =============================================================================
// Takealot Webhook Payload Types
// =============================================================================

interface NewOrderPayload {
  order_item_id: number;
  order_id: number;
  offer_id?: number;
  tsin?: number;
  sku?: string;
  product_title?: string;
  quantity?: number;
  selling_price: number;       // VAT-inclusive, in Rands
  unit_price?: number;         // Per-unit price when qty > 1
  dc?: string;                 // Fulfillment DC (e.g. "JHB", "CPT")
  customer_dc?: string;        // Customer's nearest DC
  status?: string;             // "Accepted", "Shipped", etc.
  sale_type?: string;          // "Leadtime" | "Drop Ship"
  order_date?: string;         // ISO timestamp
  promotion?: string;
}

interface StatusChangedPayload {
  order_item_id: number;
  order_id: number;
  status: string;
  status_changed_at?: string;
}

interface OfferChangedPayload {
  offer_id: number;
  tsin?: number;
  sku?: string;
  product_title?: string;
  selling_price?: number;     // In Rands
  status?: string;
  category?: string;
}

// =============================================================================
// Main Processor
// =============================================================================

export async function processWebhook(
  job: Job<ProcessWebhookJobData>
): Promise<{ handled: boolean; action: string }> {
  const { sellerId, eventType, payload, deliveryId } = job.data;

  let result: { handled: boolean; action: string };

  switch (eventType) {
    case 'New Leadtime Order':
    case 'New Drop Ship Order':
      result = await handleNewOrder(sellerId, eventType, payload as unknown as NewOrderPayload);
      break;

    case 'Sale Status Changed':
      result = await handleStatusChanged(sellerId, payload as unknown as StatusChangedPayload);
      break;

    case 'Offer Updated':
      result = await handleOfferUpdated(sellerId, payload as unknown as OfferChangedPayload);
      break;

    case 'Offer Created':
      result = await handleOfferCreated(sellerId, payload as unknown as OfferChangedPayload);
      break;

    default:
      console.info(`[Webhook Processor] Unhandled event type: ${eventType} (seller ${sellerId})`);
      result = { handled: false, action: 'ignored' };
  }

  // Mark webhook event as processed
  if (deliveryId) {
    await db
      .update(schema.webhookEvents)
      .set({ processed: true, processedAt: new Date() })
      .where(
        and(
          eq(schema.webhookEvents.sellerId, sellerId),
          eq(schema.webhookEvents.deliveryId, deliveryId)
        )
      );
  }

  return result;
}

// =============================================================================
// Event Handlers
// =============================================================================

/**
 * Handle a new order event (Leadtime or Drop Ship).
 * Upserts the order and queues profit calculation.
 */
async function handleNewOrder(
  sellerId: string,
  eventType: string,
  data: NewOrderPayload
): Promise<{ handled: boolean; action: string }> {
  if (!data.order_item_id || !data.order_id) {
    console.warn(`[Webhook Processor] New order missing required fields (seller ${sellerId})`);
    return { handled: false, action: 'missing-fields' };
  }

  // Validate numeric fields to prevent NaN/Infinity from corrupting the order record.
  // Takealot webhooks should always include these, but defend against malformed payloads.
  if (typeof data.selling_price !== 'number' || !Number.isFinite(data.selling_price) || data.selling_price < 0) {
    console.warn(
      `[Webhook Processor] New order ${data.order_item_id} has invalid selling_price: ${data.selling_price} (seller ${sellerId})`
    );
    return { handled: false, action: 'invalid-selling-price' };
  }

  const rawQuantity = data.quantity ?? 1;
  if (typeof rawQuantity !== 'number' || !Number.isFinite(rawQuantity) || rawQuantity <= 0) {
    console.warn(
      `[Webhook Processor] New order ${data.order_item_id} has invalid quantity: ${rawQuantity} (seller ${sellerId})`
    );
    return { handled: false, action: 'invalid-quantity' };
  }

  const quantity = rawQuantity;
  const sellingPriceCents = Math.round(data.selling_price * 100);
  const unitPriceCents =
    typeof data.unit_price === 'number' && Number.isFinite(data.unit_price)
      ? Math.round(data.unit_price * 100)
      : Math.round(sellingPriceCents / quantity);

  const fulfillmentDc = data.dc ?? null;
  const customerDc = data.customer_dc ?? null;
  const isIbt = detectIbt(fulfillmentDc, customerDc);

  const orderDate = data.order_date ? new Date(data.order_date) : new Date();

  // Upsert the order
  const [upsertedOrder] = await db
    .insert(schema.orders)
    .values({
      sellerId,
      orderId: data.order_id,
      orderItemId: data.order_item_id,
      offerId: data.offer_id ?? null,
      tsin: data.tsin ?? null,
      sku: data.sku ?? null,
      productTitle: data.product_title ?? null,
      quantity,
      sellingPriceCents,
      unitPriceCents,
      orderDate,
      saleStatus: data.status ?? 'Accepted',
      fulfillmentDc,
      customerDc,
      isIbt,
      promotion: data.promotion ?? null,
      source: 'webhook',
    })
    .onConflictDoUpdate({
      target: [schema.orders.sellerId, schema.orders.orderItemId],
      set: {
        saleStatus: data.status ?? 'Accepted',
        sellingPriceCents,
        unitPriceCents,
        fulfillmentDc,
        customerDc,
        isIbt,
        updatedAt: new Date(),
      },
    })
    .returning({ id: schema.orders.id });

  if (!upsertedOrder) {
    return { handled: false, action: 'upsert-failed' };
  }

  // Queue profit calculation for the new/updated order
  await calculateProfitsQueue.add(
    'calculate-from-webhook',
    {
      sellerId,
      orderIds: [upsertedOrder.id],
    },
    {
      jobId: `profit-wh-${data.order_item_id}`,
      priority: 1, // Process webhook-triggered calcs with high priority
    }
  );

  console.info(
    `[Webhook Processor] ${eventType}: order ${data.order_item_id} upserted + profit queued (seller ${sellerId})`
  );

  return { handled: true, action: 'upserted-and-queued' };
}

/**
 * Handle Sale Status Changed event.
 * Updates order status — important for tracking returns and cancellations.
 */
async function handleStatusChanged(
  sellerId: string,
  data: StatusChangedPayload
): Promise<{ handled: boolean; action: string }> {
  if (!data.order_item_id || !data.status) {
    return { handled: false, action: 'missing-fields' };
  }

  await db
    .update(schema.orders)
    .set({
      saleStatus: data.status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.orders.sellerId, sellerId),
        eq(schema.orders.orderItemId, data.order_item_id)
      )
    );

  console.info(
    `[Webhook Processor] Sale Status Changed: order_item ${data.order_item_id} → "${data.status}" (seller ${sellerId})`
  );

  return { handled: true, action: 'status-updated' };
}

/**
 * Handle Offer Updated event.
 * Updates price, status, and other offer details we track.
 */
async function handleOfferUpdated(
  sellerId: string,
  data: OfferChangedPayload
): Promise<{ handled: boolean; action: string }> {
  if (!data.offer_id) {
    return { handled: false, action: 'missing-offer-id' };
  }

  // Build typed update object with only the fields present in the payload
  await db
    .update(schema.offers)
    .set({
      ...(data.selling_price !== undefined && {
        sellingPriceCents: Math.round(data.selling_price * 100),
      }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.sku !== undefined && { sku: data.sku }),
      ...(data.product_title !== undefined && { title: data.product_title }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.offers.sellerId, sellerId),
        eq(schema.offers.offerId, data.offer_id)
      )
    );

  console.info(
    `[Webhook Processor] Offer Updated: offer ${data.offer_id} (seller ${sellerId})`
  );

  return { handled: true, action: 'offer-updated' };
}

/**
 * Handle Offer Created event.
 * Inserts a new offer stub — full data will be fetched in the next daily sync.
 */
async function handleOfferCreated(
  sellerId: string,
  data: OfferChangedPayload
): Promise<{ handled: boolean; action: string }> {
  if (!data.offer_id) {
    return { handled: false, action: 'missing-offer-id' };
  }

  const sellingPriceCents = data.selling_price ? Math.round(data.selling_price * 100) : 0;

  await db
    .insert(schema.offers)
    .values({
      sellerId,
      offerId: data.offer_id,
      tsin: data.tsin ?? null,
      sku: data.sku ?? null,
      title: data.product_title ?? null,
      category: data.category ?? null,
      sellingPriceCents,
      status: data.status ?? 'Active',
      // COGS estimated at default percentage
      cogsCents: sellingPriceCents > 0
        ? Math.round(sellingPriceCents * DEFAULT_COGS_ESTIMATE_PCT)
        : null,
      cogsSource: 'estimate',
      lastSyncedAt: new Date(),
    })
    .onConflictDoNothing(); // Ignore if offer already exists

  console.info(
    `[Webhook Processor] Offer Created: offer ${data.offer_id} (seller ${sellerId})`
  );

  return { handled: true, action: 'offer-inserted' };
}
