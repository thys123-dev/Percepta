/**
 * Sync API Routes
 *
 * GET  /api/sync/status      — Get current sync status for the authenticated seller
 * POST /api/sync/trigger     — Manually trigger a full re-sync (admin/debug)
 * GET  /api/sync/jobs        — List recent sync jobs and their states
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { authenticate } from '../../middleware/auth.js';
import { initialSyncQueue, syncOffersQueue } from './queues.js';
import { getSellerClient } from './utils/get-seller-client.js';

export async function syncRoutes(server: FastifyInstance) {
  // GET /api/sync/status — Current sync status + stats
  server.get('/status', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    const [seller] = await db
      .select({
        initialSyncStatus: schema.sellers.initialSyncStatus,
        onboardingComplete: schema.sellers.onboardingComplete,
      })
      .from(schema.sellers)
      .where(eq(schema.sellers.id, sellerId))
      .limit(1);

    if (!seller) {
      return { status: 'not_found' };
    }

    // Count synced data
    const offerCountResult = await db
      .select({ count: schema.offers.id })
      .from(schema.offers)
      .where(eq(schema.offers.sellerId, sellerId));

    const orderCountResult = await db
      .select({ count: schema.orders.id })
      .from(schema.orders)
      .where(eq(schema.orders.sellerId, sellerId));

    // Check if there's an active job in the queue
    const activeJobs = await initialSyncQueue.getActive();
    const waitingJobs = await initialSyncQueue.getWaiting();
    const isQueued =
      [...activeJobs, ...waitingJobs].some((j) => j.data.sellerId === sellerId);

    return {
      status: seller.initialSyncStatus,
      onboardingComplete: seller.onboardingComplete,
      isQueued,
      counts: {
        offers: offerCountResult.length,
        orders: orderCountResult.length,
      },
    };
  });

  // POST /api/sync/trigger — Manual re-sync (replaces existing if queued)
  server.post('/trigger', { preHandler: [authenticate] }, async (request, reply) => {
    const { sellerId } = request.user as { sellerId: string };

    // Verify seller has an API key stored
    const [seller] = await db
      .select({ apiKeyEnc: schema.sellers.apiKeyEnc })
      .from(schema.sellers)
      .where(eq(schema.sellers.id, sellerId))
      .limit(1);

    if (!seller?.apiKeyEnc) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'No Takealot API key connected. Please connect your API key first.',
      });
    }

    // Reset sync status
    await db
      .update(schema.sellers)
      .set({ initialSyncStatus: 'pending', updatedAt: new Date() })
      .where(eq(schema.sellers.id, sellerId));

    // Remove any stuck/stalled/completed prior job with the same ID. BullMQ
    // deduplicates by jobId across ALL states, so without this clean-up a
    // crashed-mid-job worker would block all future retries.
    const jobId = `initial-sync-${sellerId}`;
    const existingJob = await initialSyncQueue.getJob(jobId);
    if (existingJob) {
      await existingJob.remove().catch((err: Error) => {
        request.log.warn({ err, jobId }, 'Failed to remove existing initial-sync job');
      });
    }

    // Queue fresh initial sync with auto-cleanup retention
    await initialSyncQueue.add(
      'initial-sync',
      { sellerId },
      {
        jobId,
        removeOnComplete: { count: 10, age: 24 * 60 * 60 },
        removeOnFail: { count: 50, age: 7 * 24 * 60 * 60 },
      }
    );

    return {
      success: true,
      message: 'Sync started. You will see updates in real-time on your dashboard.',
    };
  });

  // POST /api/sync/offers/disabled
  // One-shot sync that ALSO upserts disabled offers. Default sync skips
  // them to keep the inventory page focused on active listings; this
  // endpoint exists for sellers who want their full catalogue (including
  // paused/disabled SKUs) in the database for COGS or historical analysis.
  server.post('/offers/disabled', { preHandler: [authenticate] }, async (request, reply) => {
    const { sellerId } = request.user as { sellerId: string };

    // Confirm the seller has a connected API key before queuing
    const [seller] = await db
      .select({ apiKeyEnc: schema.sellers.apiKeyEnc })
      .from(schema.sellers)
      .where(eq(schema.sellers.id, sellerId))
      .limit(1);

    if (!seller?.apiKeyEnc) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'No Takealot API key connected. Please connect your API key first.',
      });
    }

    // Clear any in-flight job for the same seller to avoid jobId dedup
    // blocking us if the previous attempt stalled.
    const jobId = `sync-offers-disabled-${sellerId}`;
    const existing = await syncOffersQueue.getJob(jobId);
    if (existing) {
      await existing.remove().catch((err: Error) => {
        request.log.warn({ err, jobId }, 'Failed to remove existing disabled-sync job');
      });
    }

    await syncOffersQueue.add(
      'sync-offers-disabled',
      { sellerId, triggeredBy: 'manual-disabled', includeDisabled: true },
      {
        jobId,
        removeOnComplete: { count: 10, age: 24 * 60 * 60 },
        removeOnFail: { count: 50, age: 7 * 24 * 60 * 60 },
      }
    );

    return {
      success: true,
      message: 'Disabled offer sync started. This may take a few minutes for large catalogues.',
    };
  });

  // GET /api/sync/jobs — Recent job history for this seller
  server.get('/jobs', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    const [completed, failed, active, waiting] = await Promise.all([
      initialSyncQueue.getCompleted(0, 5),
      initialSyncQueue.getFailed(0, 5),
      initialSyncQueue.getActive(),
      initialSyncQueue.getWaiting(),
    ]);

    const sellerJobs = [...completed, ...failed, ...active, ...waiting]
      .filter((j) => j.data.sellerId === sellerId)
      .map((j) => ({
        id: j.id,
        state: j.returnvalue ? 'completed' : j.failedReason ? 'failed' : 'active',
        progress: j.progress,
        failedReason: j.failedReason,
        processedOn: j.processedOn,
        finishedOn: j.finishedOn,
      }));

    return { jobs: sellerJobs };
  });

  // GET /api/sync/debug/offers — Diagnostic endpoint
  // Returns the raw Takealot /v2/offers/count + first page of /v2/offers
  // so we can see exactly what their API is returning for this seller's
  // API key. Useful when our offers table comes up empty and we need to
  // confirm whether that's an API truth or a code bug.
  server.get('/debug/offers', { preHandler: [authenticate] }, async (request, reply) => {
    const { sellerId } = request.user as { sellerId: string };

    let client;
    try {
      client = await getSellerClient(sellerId);
    } catch (err) {
      return reply.status(400).send({
        error: 'Could not load Takealot client for this seller',
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    const result: Record<string, unknown> = {};

    // 1) Offer count
    try {
      const start = Date.now();
      const countResponse = await client.getOfferCount();
      result.offerCount = {
        ok: true,
        durationMs: Date.now() - start,
        total: countResponse,
      };
    } catch (err) {
      result.offerCount = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // 2) First page of offers (raw, with all fields)
    try {
      const start = Date.now();
      const firstPage = await client.getOffers(0);
      result.firstPage = {
        ok: true,
        durationMs: Date.now() - start,
        // Trim to first 5 offers to keep the response small but representative.
        sampleOffers: (firstPage.offers ?? []).slice(0, 5),
        totalReturnedThisPage: (firstPage.offers ?? []).length,
        // Surface the full pagination envelope so we can see if Takealot
        // is reporting a different total here than from /count.
        rawEnvelope: {
          ...firstPage,
          offers: undefined, // Don't duplicate offers in the envelope
        },
      };
    } catch (err) {
      result.firstPage = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    return result;
  });
}
