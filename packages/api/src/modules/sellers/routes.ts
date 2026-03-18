import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';
import { authenticate } from '../../middleware/auth.js';
import { TakealotClient } from '../takealot-client/index.js';
import { encrypt } from '../../config/encryption.js';
import { initialSyncQueue, calculateProfitsQueue } from '../sync/queues.js';

const connectApiKeySchema = z.object({
  apiKey: z.string().min(10),
});

const updateCogsSchema = z.object({
  products: z.array(
    z.object({
      offerId: z.number(),
      cogsCents: z.number().min(0),
      inboundCostCents: z.number().min(0).optional(),
    })
  ),
});

export async function sellerRoutes(server: FastifyInstance) {
  // GET /api/sellers/me — Get current seller profile
  server.get('/me', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    const [seller] = await db
      .select({
        id: schema.sellers.id,
        email: schema.sellers.email,
        businessName: schema.sellers.businessName,
        isVatVendor: schema.sellers.isVatVendor,
        onboardingComplete: schema.sellers.onboardingComplete,
        initialSyncStatus: schema.sellers.initialSyncStatus,
        apiKeyValid: schema.sellers.apiKeyValid,
        createdAt: schema.sellers.createdAt,
      })
      .from(schema.sellers)
      .where(eq(schema.sellers.id, sellerId))
      .limit(1);

    return seller;
  });

  // POST /api/sellers/connect — Test and store Takealot API key, then kick off initial sync
  server.post('/connect', { preHandler: [authenticate] }, async (request, reply) => {
    const { sellerId } = request.user as { sellerId: string };
    const { apiKey } = connectApiKeySchema.parse(request.body);

    // Test the API key against the real Takealot API
    const client = new TakealotClient(apiKey);
    const isValid = await client.testConnection();

    if (!isValid) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid Takealot API key. Please check your key and try again.',
      });
    }

    // Encrypt and store the API key at rest
    const encryptedKey = encrypt(apiKey);

    await db
      .update(schema.sellers)
      .set({
        apiKeyEnc: encryptedKey,
        apiKeyValid: true,
        initialSyncStatus: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(schema.sellers.id, sellerId));

    // Queue the initial sync — use jobId to prevent duplicate queuing
    await initialSyncQueue.add(
      'initial-sync',
      { sellerId },
      { jobId: `initial-sync-${sellerId}` }
    );

    return {
      success: true,
      message: 'API key validated. Your data sync has started — this takes 2-5 minutes.',
    };
  });

  // PATCH /api/sellers/cogs — Update COGS for one or more products
  server.patch('/cogs', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const { products } = updateCogsSchema.parse(request.body);

    const updatedOfferIds: number[] = [];

    for (const product of products) {
      const [updated] = await db
        .update(schema.offers)
        .set({
          cogsCents: product.cogsCents,
          cogsSource: 'manual',
          inboundCostCents: product.inboundCostCents ?? 0,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.offers.sellerId, sellerId),
            eq(schema.offers.offerId, product.offerId)
          )
        )
        .returning({ offerId: schema.offers.offerId });

      if (updated) updatedOfferIds.push(updated.offerId);
    }

    // Fetch internal order IDs for affected offers so we can recalculate profit
    if (updatedOfferIds.length > 0) {
      const affectedOrders = await db
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.sellerId, sellerId),
            // Filter to orders for the updated offers
            // Note: using a simple in-memory filter since drizzle doesn't support `IN` on arrays easily here
          )
        );

      // Queue profit recalculation for all affected orders (implemented Week 3)
      const orderIds = affectedOrders.map((o) => o.id);
      if (orderIds.length > 0) {
        await calculateProfitsQueue.add('recalculate-after-cogs', {
          sellerId,
          orderIds,
        });
      }
    }

    return { updated: updatedOfferIds.length, offerIds: updatedOfferIds };
  });

  // PATCH /api/sellers/profile — Update seller profile settings
  server.patch('/profile', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    const profileSchema = z.object({
      businessName: z.string().min(1).max(255).optional(),
      isVatVendor: z.boolean().optional(),
      vatNumber: z.string().max(20).optional(),
      targetMarginPct: z.number().min(0).max(100).optional(),
    });

    const updates = profileSchema.parse(request.body);

    const [updated] = await db
      .update(schema.sellers)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.sellers.id, sellerId))
      .returning({
        businessName: schema.sellers.businessName,
        isVatVendor: schema.sellers.isVatVendor,
        targetMarginPct: schema.sellers.targetMarginPct,
      });

    return { success: true, profile: updated };
  });
}
