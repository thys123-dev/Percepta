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
import { initialSyncQueue } from './queues.js';

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

    // Queue the initial sync (use jobId to prevent duplicates)
    await initialSyncQueue.add(
      'initial-sync',
      { sellerId },
      { jobId: `initial-sync-${sellerId}`, removeOnFail: false }
    );

    return {
      success: true,
      message: 'Sync started. You will see updates in real-time on your dashboard.',
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
}
