/**
 * syncSales Job Processor
 *
 * Fetches sales (orders) from Takealot API for a seller and upserts them
 * into the `orders` table. Key logic:
 * - Date range is chunked into 180-day windows (API hard limit)
 * - IBT detection: fulfillment DC !== customer DC
 * - Unit price derived from selling_price / quantity
 * - Emits progress events via Redis pub/sub
 * - After inserting orders, queues profit calculation (Week 3)
 */

import type { Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { db, schema } from '../../../db/index.js';
import { getSellerClient } from '../utils/get-seller-client.js';
import { publishProgress } from '../redis.js';
import { calculateProfitsQueue } from '../queues.js';
import type { SyncSalesJobData } from '../queues.js';
import type { TakealotSale } from '../../takealot-client/index.js';

// ---- Main Processor ----

export async function processSyncSales(
  job: Job<SyncSalesJobData>
): Promise<{ syncedCount: number }> {
  const { sellerId, startDate, endDate } = job.data;
  let syncedCount = 0;
  const insertedOrderIds: string[] = [];

  await publishProgress({
    type: 'sync:progress',
    sellerId,
    stage: 'sales',
    message: 'Fetching your sales history from Takealot...',
  });

  try {
    const client = await getSellerClient(sellerId);

    // Stream sales in 180-day chunks with auto-pagination
    for await (const salesBatch of client.fetchAllSales(
      new Date(startDate),
      new Date(endDate),
      async (completed, chunk) => {
        await job.updateProgress(50 + Math.min(40, Math.floor(completed / 10)));
        await publishProgress({
          type: 'sync:progress',
          sellerId,
          stage: 'sales',
          message: `Fetching sales... ${completed} orders found (${chunk})`,
          completed,
        });
      }
    )) {
      const ids = await upsertSalesBatch(sellerId, salesBatch);
      insertedOrderIds.push(...ids);
      syncedCount += salesBatch.length;
    }

    await publishProgress({
      type: 'sync:progress',
      sellerId,
      stage: 'sales',
      message: `✓ ${syncedCount} orders synced`,
      completed: syncedCount,
      total: syncedCount,
    });

    // Queue profit calculation for all inserted/updated orders (implemented Week 3)
    if (insertedOrderIds.length > 0) {
      // Batch into chunks of 500 to avoid huge job payloads
      const chunks = chunkArray(insertedOrderIds, 500);
      for (const chunk of chunks) {
        await calculateProfitsQueue.add('calculate-profits', {
          sellerId,
          orderIds: chunk,
        });
      }
    }

    return { syncedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await publishProgress({
      type: 'sync:error',
      sellerId,
      stage: 'sales',
      message: `Failed to sync sales: ${message}`,
      error: message,
    });
    throw error;
  }
}

// ---- Upsert Batch ----

async function upsertSalesBatch(
  sellerId: string,
  sales: TakealotSale[]
): Promise<string[]> {
  if (sales.length === 0) return [];

  const rows = sales.map((sale) => {
    // IBT: fulfillment DC differs from customer DC
    const isIbt =
      sale.dc && sale.customer_dc
        ? normalizesDc(sale.dc) !== normalizesDc(sale.customer_dc)
        : false;

    // Unit price = total selling price / quantity (Takealot API returns total)
    const unitPriceCents =
      sale.quantity > 0
        ? Math.round(sale.selling_price / sale.quantity)
        : sale.selling_price;

    return {
      sellerId,
      orderId: sale.order_id,
      orderItemId: sale.order_item_id,
      offerId: sale.offer_id ?? null,
      tsin: sale.tsin ?? null,
      sku: sale.sku ?? null,
      productTitle: sale.product_title ?? 'Unknown Product',
      quantity: sale.quantity,
      sellingPriceCents: sale.selling_price, // total (unit × qty)
      unitPriceCents,
      orderDate: new Date(sale.order_date),
      saleStatus: sale.sale_status ?? null,
      fulfillmentDc: sale.dc ?? null,
      customerDc: sale.customer_dc ?? null,
      isIbt,
      promotion: sale.promotion || null,
      source: 'api' as const,
      updatedAt: new Date(),
    };
  });

  // Upsert on (sellerId, orderItemId) — unique per order line
  const inserted = await db
    .insert(schema.orders)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.orders.sellerId, schema.orders.orderItemId],
      set: {
        // Update status and IBT flag (may change after initial insert)
        saleStatus: sql`excluded.sale_status`,
        fulfillmentDc: sql`excluded.fulfillment_dc`,
        customerDc: sql`excluded.customer_dc`,
        isIbt: sql`excluded.is_ibt`,
        updatedAt: sql`excluded.updated_at`,
      },
    })
    .returning({ id: schema.orders.id });

  return inserted.map((r) => r.id);
}

// ---- Helpers ----

/**
 * Normalize DC codes to region for IBT detection.
 * JHB, JHB2, JHB3 → 'JHB'
 * CPT, CPT2 → 'CPT'
 * DBN → 'DBN'
 */
function normalizesDc(dc: string): string {
  const upper = dc.toUpperCase();
  if (upper.startsWith('JHB')) return 'JHB';
  if (upper.startsWith('CPT')) return 'CPT';
  if (upper.startsWith('DBN')) return 'DBN';
  return upper;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
