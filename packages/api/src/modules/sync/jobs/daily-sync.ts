/**
 * dailySync Job Processor — Webhook-First Reconciliation
 *
 * Per Takealot's official API guidance:
 *   - Use webhooks for real-time updates (orders, offer changes)
 *   - Avoid full re-polling of slow-changing data
 *   - "Aggregate and store data on your systems" — don't treat the API as a
 *     real-time source
 *
 * This job is intentionally LIGHTWEIGHT. It does NOT re-fetch all offers
 * (Offer Updated webhook handles those changes). It performs a small
 * 24-hour sales reconciliation as a safety net for missed webhook
 * deliveries, then runs local alert checks against the database.
 *
 * If a seller suspects data drift (e.g. their dashboard counts don't match
 * Takealot's own portal), they can trigger a full re-sync manually via
 * POST /api/sync/trigger.
 *
 * Scheduled: every day at 02:00 AM (set up in workers.ts)
 */

import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../db/index.js';
import { processSyncSales } from './sync-sales.js';
import type { DailySyncJobData } from '../queues.js';

/**
 * Sales reconciliation window. Webhooks (New Leadtime Order / New Drop Ship
 * Order / Sale Status Changed) should deliver updates in real-time, so this
 * is a small overlap to catch any genuinely missed deliveries — NOT a full
 * re-poll. Anything older than this is the user's responsibility to
 * reconcile manually if they spot a discrepancy.
 */
const RECONCILIATION_WINDOW_DAYS = 1;

export async function processDailySync(
  job: Job<DailySyncJobData>
): Promise<{ offersCount: number; ordersCount: number }> {
  const { sellerId } = job.data;

  if (sellerId === '__all__') {
    const { dispatchDailySyncForAllSellers } = await import('../workers.js');
    await dispatchDailySyncForAllSellers();
    return { offersCount: 0, ordersCount: 0 };
  }

  // Verify seller is in a complete state before running daily sync
  const [seller] = await db
    .select({ initialSyncStatus: schema.sellers.initialSyncStatus })
    .from(schema.sellers)
    .where(eq(schema.sellers.id, sellerId))
    .limit(1);

  if (!seller || seller.initialSyncStatus !== 'complete') {
    console.info(
      `[DailySync] Skipping seller ${sellerId} — sync status: ${seller?.initialSyncStatus}`
    );
    return { offersCount: 0, ordersCount: 0 };
  }

  // ── Offers: NO re-poll ──────────────────────────────────────────────────
  // Takealot docs: "Offer information rarely changes, only the stock values
  // associated with it gets updated frequently. Use the Offer Updated
  // webhook for updates on offer related value changes."
  //
  // We rely on the Offer Updated and Offer Created webhooks to keep the
  // local offers table fresh. A nightly full re-poll would be both wasteful
  // (rate limits) and a violation of Takealot's stated best practices.
  const offersCount = 0;

  // ── Sales: 24-hour safety-net reconciliation ───────────────────────────
  // Webhooks should already have delivered every order in this window.
  // The reconciliation upserts on (sellerId, orderItemId) so any orders
  // already inserted via webhook are no-ops; only genuinely missed
  // deliveries result in inserts.
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
