/**
 * syncOffers Job Processor
 *
 * Fetches all offers (products) from Takealot API for a seller and upserts
 * them into the `offers` table. Also:
 * - Derives size/weight tiers from dimensions
 * - Sets estimated COGS (50% of selling price) for products without COGS
 * - Emits progress events via Redis pub/sub
 */

import type { Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { db, schema } from '../../../db/index.js';
import { getSellerClient } from '../utils/get-seller-client.js';
import { publishProgress } from '../redis.js';
import type { SyncOffersJobData } from '../queues.js';
import type { TakealotOffer } from '../../takealot-client/index.js';
import { DEFAULT_COGS_ESTIMATE_PCT } from '@percepta/shared';

// ---- Size/Weight Tier Classification ----
// Based on Takealot Pricing Schedule (July 2025)

function classifySizeTier(
  lengthMm: number,
  widthMm: number,
  heightMm: number,
  volumeCm3: number
): string {
  // Takealot size tiers (approximate — exact rules from pricing schedule)
  if (volumeCm3 > 300_000) return 'Extra Bulky';
  if (volumeCm3 > 150_000) return 'Bulky';
  if (volumeCm3 > 50_000) return 'Oversize';
  if (Math.max(lengthMm, widthMm, heightMm) > 600) return 'Large';
  return 'Standard';
}

function classifyWeightTier(weightGrams: number): string {
  if (weightGrams <= 7_000) return 'Light';
  if (weightGrams <= 25_000) return 'Heavy';
  if (weightGrams <= 40_000) return 'Heavy Plus';
  return 'Very Heavy';
}

// ---- Main Processor ----

export async function processSyncOffers(job: Job<SyncOffersJobData>): Promise<{ syncedCount: number }> {
  const { sellerId } = job.data;
  let syncedCount = 0;

  await publishProgress({
    type: 'sync:progress',
    sellerId,
    stage: 'offers',
    message: 'Fetching your products from Takealot...',
    completed: 0,
    total: 0,
  });

  try {
    const client = await getSellerClient(sellerId);

    // Stream offers page by page
    for await (const offersBatch of client.fetchAllOffers(
      async (completed, total) => {
        await job.updateProgress?.(Math.floor((completed / total) * 50)); // 0–50%
        await publishProgress({
          type: 'sync:progress',
          sellerId,
          stage: 'offers',
          message: `Fetching products... ${completed} of ${total}`,
          completed,
          total,
        });
      }
    )) {
      await upsertOffersBatch(sellerId, offersBatch);
      syncedCount += offersBatch.length;
    }

    await publishProgress({
      type: 'sync:progress',
      sellerId,
      stage: 'offers',
      message: `✓ ${syncedCount} products synced`,
      completed: syncedCount,
      total: syncedCount,
    });

    return { syncedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await publishProgress({
      type: 'sync:error',
      sellerId,
      stage: 'offers',
      message: `Failed to sync products: ${message}`,
      error: message,
    });
    throw error;
  }
}

// ---- Upsert Batch ----

async function upsertOffersBatch(sellerId: string, offers: TakealotOffer[]): Promise<void> {
  if (offers.length === 0) return;

  const rows = offers.map((offer) => {
    // Derive dimensions
    const weightGrams = offer.weight ? offer.weight * 1000 : null; // API returns kg
    const lengthMm = offer.length ? offer.length * 10 : null;      // API returns cm
    const widthMm = offer.width ? offer.width * 10 : null;
    const heightMm = offer.height ? offer.height * 10 : null;

    // Calculate volume
    const volumeCm3 =
      offer.length && offer.width && offer.height
        ? Math.round(offer.length * offer.width * offer.height)
        : null;

    // Classify tiers if we have dimensions
    const sizeTier =
      lengthMm && widthMm && heightMm && volumeCm3
        ? classifySizeTier(lengthMm, widthMm, heightMm, volumeCm3)
        : null;
    const weightTier = weightGrams ? classifyWeightTier(weightGrams) : null;

    // Stock by DC (CPT, JHB, DBN — matches bulk replenishment template)
    const stockJhb = offer.stock_at_takealot?.find((s) => s.dc === 'JHB')?.quantity ?? 0;
    const stockCpt = offer.stock_at_takealot?.find((s) => s.dc === 'CPT')?.quantity ?? 0;
    const stockDbn = offer.stock_at_takealot?.find((s) => s.dc === 'DBN')?.quantity ?? 0;

    // 30-day sales units (sum across DCs)
    const salesUnits30d = offer.sales_units?.reduce((sum, s) => sum + s.units, 0) ?? 0;

    // Estimated COGS = 50% of selling price (if not already set — handled via conflict clause)
    const estimatedCogs = Math.round(offer.selling_price * DEFAULT_COGS_ESTIMATE_PCT);

    return {
      sellerId,
      offerId: offer.offer_id,
      tsin: offer.tsin ?? null,
      sku: offer.sku ?? null,
      barcode: offer.barcode ?? null,
      title: offer.title ?? 'Unknown Product',
      category: offer.category ?? null,
      sellingPriceCents: offer.selling_price,
      rrpCents: offer.rrp > 0 ? offer.rrp : null,
      status: offer.status,
      weightGrams,
      lengthMm,
      widthMm,
      heightMm,
      volumeCm3,
      sizeTier,
      weightTier,
      // COGS will be set in conflict clause — don't overwrite seller-provided COGS
      cogsCents: estimatedCogs,
      cogsSource: 'estimate' as const,
      stockJhb,
      stockCpt,
      stockDbn,
      stockCoverDays: offer.stock_cover ?? null,
      salesUnits30d,
      leadtimeDays: offer.leadtime_days ?? 0,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    };
  });

  // Upsert: update most fields on conflict, but preserve cogsCents/cogsSource if seller-provided
  await db
    .insert(schema.offers)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.offers.sellerId, schema.offers.offerId],
      set: {
        tsin: sql`excluded.tsin`,
        sku: sql`excluded.sku`,
        barcode: sql`excluded.barcode`,
        title: sql`excluded.title`,
        category: sql`excluded.category`,
        sellingPriceCents: sql`excluded.selling_price_cents`,
        rrpCents: sql`excluded.rrp_cents`,
        status: sql`excluded.status`,
        weightGrams: sql`excluded.weight_grams`,
        lengthMm: sql`excluded.length_mm`,
        widthMm: sql`excluded.width_mm`,
        heightMm: sql`excluded.height_mm`,
        volumeCm3: sql`excluded.volume_cm3`,
        sizeTier: sql`excluded.size_tier`,
        weightTier: sql`excluded.weight_tier`,
        // Only update COGS if it's still an estimate (don't overwrite manual input)
        cogsCents: sql`CASE WHEN offers.cogs_source = 'estimate' THEN excluded.cogs_cents ELSE offers.cogs_cents END`,
        cogsSource: sql`CASE WHEN offers.cogs_source = 'estimate' THEN excluded.cogs_source ELSE offers.cogs_source END`,
        stockJhb: sql`excluded.stock_jhb`,
        stockCpt: sql`excluded.stock_cpt`,
        stockDbn: sql`excluded.stock_dbn`,
        stockCoverDays: sql`excluded.stock_cover_days`,
        salesUnits30d: sql`excluded.sales_units_30d`,
        leadtimeDays: sql`excluded.leadtime_days`,
        lastSyncedAt: sql`excluded.last_synced_at`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}
