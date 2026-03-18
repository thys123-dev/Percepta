/**
 * dailySync Job Processor
 *
 * Nightly reconciliation job — catches any sales missed by webhooks.
 * Runs for every seller with a completed initial sync.
 *
 * Fetches the last 7 days of sales (overlap window) and upserts.
 * This is intentionally conservative: webhooks handle real-time,
 * daily sync is a safety net for missed deliveries.
 *
 * Scheduled: every day at 02:00 AM (set up in workers.ts)
 */

import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../db/index.js';
import { processSyncOffers } from './sync-offers.js';
import { processSyncSales } from './sync-sales.js';
import type { DailySyncJobData } from '../queues.js';

// Overlap window: re-fetch last N days to catch missed webhooks
const RECONCILIATION_WINDOW_DAYS = 7;

export async function processDailySync(
  job: Job<DailySyncJobData>
): Promise<{ offersCount: number; ordersCount: number }> {
  const { sellerId } = job.data;

  // Verify seller is in a complete state before running daily sync
  const [seller] = await db
    .select({ initialSyncStatus: schema.sellers.initialSyncStatus })
    .from(schema.sellers)
    .where(eq(schema.sellers.id, sellerId))
    .limit(1);

  if (!seller || seller.initialSyncStatus !== 'complete') {
    console.info(`[DailySync] Skipping seller ${sellerId} — sync status: ${seller?.initialSyncStatus}`);
    return { offersCount: 0, ordersCount: 0 };
  }

  // Refresh offers (prices, stock levels may have changed)
  const { syncedCount: offersCount } = await processSyncOffers({
    ...job,
    data: { sellerId, triggeredBy: 'daily-sync' },
  } as Job<{ sellerId: string; triggeredBy: 'daily-sync' }>);

  // Re-fetch last 7 days to catch any webhook delivery failures
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - RECONCILIATION_WINDOW_DAYS);

  const { syncedCount: ordersCount } = await processSyncSales({
    ...job,
    data: {
      sellerId,
      startDate: startDate.toISOString().split('T')[0]!,
      endDate: endDate.toISOString().split('T')[0]!,
      triggeredBy: 'daily-sync',
    },
  } as Job<{ sellerId: string; startDate: string; endDate: string; triggeredBy: 'daily-sync' }>);

  return { offersCount, ordersCount };
}
