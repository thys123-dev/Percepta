/**
 * BullMQ Workers
 *
 * Registers all job processors and sets up the nightly daily-sync schedule.
 * Call startWorkers() once at server startup.
 *
 * For MVP, all workers run in the same process as the API server.
 * In production (Phase 2+), split into a separate worker process.
 */

import { Worker } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { redisConnection, progressPublisher, cacheInvalidate } from './redis.js';
import { publishProfitUpdate } from './redis.js';
import { pool } from '../../db/index.js';
import {
  initialSyncQueue,
  syncOffersQueue,
  syncSalesQueue,
  calculateProfitsQueue,
  dailySyncQueue,
  processWebhookQueue,
  emailDigestQueue,
} from './queues.js';
import { processInitialSync } from './jobs/initial-sync.js';
import { processSyncOffers } from './jobs/sync-offers.js';
import { processSyncSales } from './jobs/sync-sales.js';
import { processDailySync } from './jobs/daily-sync.js';
import { processCalculateProfits } from '../fees/profit-processor.js';
import { processWebhook } from '../webhooks/processor.js';
import { checkStorageWarnings } from '../alerts/alert-generator.js';
import { processSendWeeklyDigest } from '../email/jobs/send-weekly-digest.js';

const CONCURRENCY = 2; // Be gentle on Takealot API

export function startWorkers() {
  // ---- initial-sync worker ----
  const initialSyncWorker = new Worker(
    'initial-sync',
    processInitialSync,
    {
      connection: redisConnection.duplicate() as unknown as ConnectionOptions,
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
      connection: redisConnection.duplicate() as unknown as ConnectionOptions,
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
      connection: redisConnection.duplicate() as unknown as ConnectionOptions,
      concurrency: CONCURRENCY,
    }
  );

  syncSalesWorker.on('completed', (job, result) => {
    console.info(`[sync-sales] ✓ Seller ${job.data.sellerId}: ${result.syncedCount} orders`);
  });

  syncSalesWorker.on('failed', (job, err) => {
    console.error(`[sync-sales] ✗ Seller ${job?.data.sellerId}: ${err.message}`);
  });

  // ---- calculate-profits worker (fee engine + profit calculation) ----
  const calculateProfitsWorker = new Worker(
    'calculate-profits',
    processCalculateProfits,
    {
      connection: redisConnection.duplicate() as unknown as ConnectionOptions,
      concurrency: 5,
    }
  );

  calculateProfitsWorker.on('completed', (job, result) => {
    console.info(
      `[calculate-profits] ✓ Seller ${job.data.sellerId}: ${result.calculated} orders, ${result.lossMakers} loss-makers`
    );

    // Push real-time profit update to seller's dashboard via Redis pub/sub → Socket.io
    // Determine the trigger source based on job name
    const triggeredBy =
      job.name === 'calculate-from-webhook'
        ? 'webhook'
        : job.name === 'recalculate-after-cogs'
        ? 'cogs-update'
        : 'daily-sync';

    publishProfitUpdate({
      sellerId: job.data.sellerId,
      calculated: result.calculated,
      lossMakers: result.lossMakers,
      triggeredBy,
    }).catch((err: Error) => {
      console.error(`[calculate-profits] Failed to publish profit update: ${err.message}`);
    });

    // Invalidate cached dashboard data so next request reflects updated profits
    cacheInvalidate(`dashboard:${job.data.sellerId}:*`).catch((err: Error) => {
      console.error(`[calculate-profits] Failed to invalidate dashboard cache: ${err.message}`);
    });
  });

  calculateProfitsWorker.on('failed', (job, err) => {
    console.error(`[calculate-profits] ✗ Seller ${job?.data.sellerId}: ${err.message}`);
  });

  // ---- daily-sync worker ----
  const dailySyncWorker = new Worker(
    'daily-sync',
    processDailySync,
    {
      connection: redisConnection.duplicate() as unknown as ConnectionOptions,
      concurrency: 3,
    }
  );

  dailySyncWorker.on('completed', (job, result) => {
    console.info(
      `[daily-sync] ✓ Seller ${job.data.sellerId}: refreshed ${result.offersCount} offers, ${result.ordersCount} orders`
    );

    // Check for storage warning alerts after offers are refreshed
    if (job.data.sellerId !== '__all__') {
      checkStorageWarnings(job.data.sellerId)
        .then((count) => {
          if (count > 0) {
            console.info(`[daily-sync] Created ${count} storage warnings for seller ${job.data.sellerId}`);
          }
        })
        .catch((err: Error) => {
          console.error(`[daily-sync] Storage warning check failed: ${err.message}`);
        });
    }
  });

  dailySyncWorker.on('failed', (job, err) => {
    console.error(`[daily-sync] ✗ Seller ${job?.data.sellerId}: ${err.message}`);
  });

  // ---- process-webhook worker (Week 4) ----
  // Higher concurrency than sync workers — webhook processing is fast
  const processWebhookWorker = new Worker(
    'process-webhook',
    processWebhook,
    {
      connection: redisConnection.duplicate() as unknown as ConnectionOptions,
      concurrency: 10,
    }
  );

  processWebhookWorker.on('completed', (job, result) => {
    console.info(
      `[process-webhook] ✓ Seller ${job.data.sellerId}: "${job.data.eventType}" → ${result.action}`
    );
  });

  processWebhookWorker.on('failed', (job, err) => {
    console.error(
      `[process-webhook] ✗ Seller ${job?.data.sellerId} "${job?.data.eventType}": ${err.message}`
    );
  });

  // ---- email-digest worker (Week 9) ----
  const emailDigestWorker = new Worker(
    'email-digest',
    processSendWeeklyDigest,
    {
      connection: redisConnection.duplicate() as unknown as ConnectionOptions,
      concurrency: 5,
    }
  );

  emailDigestWorker.on('completed', (job, result) => {
    if (result.sent) {
      console.info(`[email-digest] ✓ Seller ${job.data.sellerId}: weekly digest sent`);
    } else {
      console.info(`[email-digest] — Seller ${job.data.sellerId}: skipped (${result.reason})`);
    }
  });

  emailDigestWorker.on('failed', (job, err) => {
    console.error(`[email-digest] ✗ Seller ${job?.data.sellerId}: ${err.message}`);
  });

  // ---- Schedule nightly daily-sync (02:00 AM) + Sunday digest (08:00 AM) ----
  scheduleDailySync();
  scheduleWeeklyDigest();

  console.info('✅ BullMQ workers started (initial-sync, sync-offers, sync-sales, calculate-profits, daily-sync, process-webhook, email-digest)');

  // Graceful shutdown
  async function shutdown() {
    console.info('[Workers] Shutting down gracefully...');

    // 1. Close all BullMQ workers (drains active jobs)
    await Promise.all([
      initialSyncWorker.close(),
      syncOffersWorker.close(),
      syncSalesWorker.close(),
      calculateProfitsWorker.close(),
      dailySyncWorker.close(),
      processWebhookWorker.close(),
      emailDigestWorker.close(),
    ]);
    console.info('[Workers] All workers shut down');

    // 2. Close Redis connections
    await Promise.all([
      redisConnection.quit(),
      progressPublisher.quit(),
    ]);
    console.info('[Workers] Redis connections closed');

    // 3. Close database pool
    await pool.end();
    console.info('[Workers] Database pool closed');
  }

  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });

  return {
    initialSyncWorker,
    syncOffersWorker,
    syncSalesWorker,
    calculateProfitsWorker,
    dailySyncWorker,
    processWebhookWorker,
    emailDigestWorker,
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
  await dailySyncQueue.add(
    'nightly-dispatcher',
    { sellerId: '__all__' },
    {
      repeat: { pattern: '0 2 * * *' }, // 2:00 AM every day
      jobId: 'nightly-dispatcher',
    }
  );

  console.info('[Workers] Nightly daily-sync scheduled at 02:00 AM');
}

/**
 * Schedule the Sunday 8:00 AM weekly digest fan-out.
 */
async function scheduleWeeklyDigest() {
  const existing = await emailDigestQueue.getRepeatableJobs();
  for (const job of existing) {
    await emailDigestQueue.removeRepeatableByKey(job.key);
  }

  await emailDigestQueue.add(
    'weekly-digest-dispatcher',
    { sellerId: '__all__' },
    {
      repeat: { pattern: '0 8 * * 0' }, // 8:00 AM every Sunday
      jobId: 'weekly-digest-dispatcher',
    }
  );

  console.info('[Workers] Weekly digest scheduled at 08:00 AM every Sunday');
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
