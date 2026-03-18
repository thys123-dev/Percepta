/**
 * BullMQ Workers
 *
 * Registers all job processors and sets up the nightly daily-sync schedule.
 * Call startWorkers() once at server startup.
 *
 * For MVP, all workers run in the same process as the API server.
 * In production (Phase 2+), split into a separate worker process.
 */

import { Worker, Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { redisConnection } from './redis.js';
import {
  initialSyncQueue,
  syncOffersQueue,
  syncSalesQueue,
  calculateProfitsQueue,
  dailySyncQueue,
} from './queues.js';
import { processInitialSync } from './jobs/initial-sync.js';
import { processSyncOffers } from './jobs/sync-offers.js';
import { processSyncSales } from './jobs/sync-sales.js';
import { processDailySync } from './jobs/daily-sync.js';

const CONCURRENCY = 2; // Process up to 2 sync jobs at once (be gentle on Takealot API)

export function startWorkers() {
  // ---- initial-sync worker ----
  const initialSyncWorker = new Worker(
    'initial-sync',
    processInitialSync,
    {
      connection: redisConnection.duplicate(),
      concurrency: CONCURRENCY,
    }
  );

  initialSyncWorker.on('completed', (job, result) => {
    console.info(
      `[initial-sync] ✓ Seller ${job.data.sellerId}: ${result.offersCount} offers, ${result.ordersCount} orders`
    );
  });

  initialSyncWorker.on('failed', (job, err) => {
    console.error(`[initial-sync] ✗ Seller ${job?.data.sellerId}: ${err.message}`);
  });

  // ---- sync-offers worker ----
  const syncOffersWorker = new Worker(
    'sync-offers',
    processSyncOffers,
    {
      connection: redisConnection.duplicate(),
      concurrency: CONCURRENCY,
    }
  );

  syncOffersWorker.on('completed', (job, result) => {
    console.info(`[sync-offers] ✓ Seller ${job.data.sellerId}: ${result.syncedCount} offers`);
  });

  syncOffersWorker.on('failed', (job, err) => {
    console.error(`[sync-offers] ✗ Seller ${job?.data.sellerId}: ${err.message}`);
  });

  // ---- sync-sales worker ----
  const syncSalesWorker = new Worker(
    'sync-sales',
    processSyncSales,
    {
      connection: redisConnection.duplicate(),
      concurrency: CONCURRENCY,
    }
  );

  syncSalesWorker.on('completed', (job, result) => {
    console.info(`[sync-sales] ✓ Seller ${job.data.sellerId}: ${result.syncedCount} orders`);
  });

  syncSalesWorker.on('failed', (job, err) => {
    console.error(`[sync-sales] ✗ Seller ${job?.data.sellerId}: ${err.message}`);
  });

  // ---- calculate-profits worker (placeholder — implemented Week 3) ----
  const calculateProfitsWorker = new Worker(
    'calculate-profits',
    async (job) => {
      // Stub: will be implemented in Week 3 (fee calculation engine)
      console.info(
        `[calculate-profits] Queued for seller ${job.data.sellerId}: ${job.data.orderIds.length} orders (Week 3)`
      );
      return { calculated: 0 };
    },
    {
      connection: redisConnection.duplicate(),
      concurrency: 5, // Higher concurrency since this will be CPU-bound math, not I/O
    }
  );

  calculateProfitsWorker.on('failed', (job, err) => {
    console.error(`[calculate-profits] ✗ Seller ${job?.data.sellerId}: ${err.message}`);
  });

  // ---- daily-sync worker ----
  const dailySyncWorker = new Worker(
    'daily-sync',
    processDailySync,
    {
      connection: redisConnection.duplicate(),
      concurrency: 3,
    }
  );

  dailySyncWorker.on('completed', (job, result) => {
    console.info(
      `[daily-sync] ✓ Seller ${job.data.sellerId}: refreshed ${result.offersCount} offers, ${result.ordersCount} orders`
    );
  });

  dailySyncWorker.on('failed', (job, err) => {
    console.error(`[daily-sync] ✗ Seller ${job?.data.sellerId}: ${err.message}`);
  });

  // ---- Schedule nightly daily-sync for all sellers (02:00 AM) ----
  scheduleDailySync();

  console.info('✅ BullMQ workers started');

  // Graceful shutdown
  async function shutdown() {
    console.info('[Workers] Shutting down...');
    await Promise.all([
      initialSyncWorker.close(),
      syncOffersWorker.close(),
      syncSalesWorker.close(),
      calculateProfitsWorker.close(),
      dailySyncWorker.close(),
    ]);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return {
    initialSyncWorker,
    syncOffersWorker,
    syncSalesWorker,
    calculateProfitsWorker,
    dailySyncWorker,
  };
}

/**
 * Schedule nightly reconciliation jobs for all sellers with complete syncs.
 * Uses BullMQ's repeatable jobs (cron-based).
 */
async function scheduleDailySync() {
  // Remove any existing schedule first (avoids duplicate schedules on restart)
  const existingRepeatable = await dailySyncQueue.getRepeatableJobs();
  for (const job of existingRepeatable) {
    await dailySyncQueue.removeRepeatableByKey(job.key);
  }

  // Schedule a dispatcher job that fans out to all sellers at 02:00 AM daily
  // The dispatcher job uses a special sellerId='__all__' to indicate fan-out
  await dailySyncQueue.add(
    'nightly-dispatcher',
    { sellerId: '__all__' },
    {
      repeat: { cron: '0 2 * * *' }, // 2:00 AM every day
      jobId: 'nightly-dispatcher',
    }
  );

  console.info('[Workers] Nightly daily-sync scheduled at 02:00 AM');
}

/**
 * Fan-out dispatcher: when sellerId === '__all__', queue a job for every seller
 * with a completed initial sync.
 */
export async function dispatchDailySyncForAllSellers() {
  const sellers = await db
    .select({ id: schema.sellers.id })
    .from(schema.sellers)
    .where(eq(schema.sellers.initialSyncStatus, 'complete'));

  for (const seller of sellers) {
    await dailySyncQueue.add(
      'daily-sync',
      { sellerId: seller.id },
      { jobId: `daily-sync-${seller.id}-${new Date().toISOString().split('T')[0]}` }
    );
  }

  console.info(`[Workers] Queued daily sync for ${sellers.length} sellers`);
}
