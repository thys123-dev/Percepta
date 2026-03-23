/**
 * initialSync Job Processor — Orchestrator
 *
 * Runs when a seller first connects their Takealot API key.
 * Chains: syncOffers → syncSales (180 days) → mark complete
 *
 * Flow:
 * 1. Mark seller sync status = 'syncing'
 * 2. Run syncOffers (fetch all products)
 * 3. Run syncSales (last 180 days)
 * 4. Mark seller sync status = 'complete'
 * 5. Emit sync:complete progress event (frontend shows dashboard)
 *
 * If any step fails:
 * - Mark seller sync status = 'failed'
 * - Emit sync:error event
 * - BullMQ will retry the whole job (up to 3 attempts)
 */

import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../db/index.js';
import { publishProgress } from '../redis.js';
import { processSyncOffers } from './sync-offers.js';
import { processSyncSales } from './sync-sales.js';
import type { InitialSyncJobData } from '../queues.js';
import { MAX_SALES_DATE_RANGE_DAYS } from '@percepta/shared';

export async function processInitialSync(
  job: Job<InitialSyncJobData>
): Promise<{ offersCount: number; ordersCount: number }> {
  const { sellerId } = job.data;

  // Step 1: Mark as syncing
  await db
    .update(schema.sellers)
    .set({ initialSyncStatus: 'syncing', updatedAt: new Date() })
    .where(eq(schema.sellers.id, sellerId));

  await publishProgress({
    type: 'sync:progress',
    sellerId,
    stage: 'offers',
    message: 'Starting initial sync — this takes 2-5 minutes...',
  });

  try {
    // Step 2: Sync all offers
    await job.updateProgress(5);
    const { syncedCount: offersCount } = await processSyncOffers({
      ...job,
      data: { sellerId, triggeredBy: 'initial-sync' },
    } as Job<{ sellerId: string; triggeredBy: 'initial-sync' }>);

    await job.updateProgress(50);

    // Step 3: Sync sales (last 180 days — API maximum)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - MAX_SALES_DATE_RANGE_DAYS);

    const { syncedCount: ordersCount } = await processSyncSales({
      ...job,
      data: {
        sellerId,
        startDate: startDate.toISOString().split('T')[0]!,
        endDate: endDate.toISOString().split('T')[0]!,
        triggeredBy: 'initial-sync',
      },
    } as Job<{ sellerId: string; startDate: string; endDate: string; triggeredBy: 'initial-sync' }>);

    await job.updateProgress(90);

    // Step 4: Mark complete
    await db
      .update(schema.sellers)
      .set({
        initialSyncStatus: 'complete',
        onboardingComplete: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.sellers.id, sellerId));

    await job.updateProgress(100);

    // Step 5: Emit completion event (triggers frontend to navigate to dashboard)
    await publishProgress({
      type: 'sync:complete',
      sellerId,
      stage: 'complete',
      message: `Sync complete! Found ${offersCount} products and ${ordersCount} orders.`,
      completed: offersCount + ordersCount,
      total: offersCount + ordersCount,
    });

    return { offersCount, ordersCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Mark sync as failed
    await db
      .update(schema.sellers)
      .set({ initialSyncStatus: 'failed', updatedAt: new Date() })
      .where(eq(schema.sellers.id, sellerId));

    await publishProgress({
      type: 'sync:error',
      sellerId,
      stage: 'failed',
      message: `Sync failed: ${message}. Retrying automatically...`,
      error: message,
    });

    throw error; // Let BullMQ handle retry
  }
}
