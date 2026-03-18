import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { authenticate } from '../../middleware/auth.js';
import { TakealotClient } from '../takealot-client/index.js';
import { encrypt } from '../../config/encryption.js';

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

  // POST /api/sellers/connect — Test and store Takealot API key
  server.post('/connect', { preHandler: [authenticate] }, async (request, reply) => {
    const { sellerId } = request.user as { sellerId: string };
    const { apiKey } = connectApiKeySchema.parse(request.body);

    // Test the API key by fetching offer count
    const client = new TakealotClient(apiKey);
    const isValid = await client.testConnection();

    if (!isValid) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid Takealot API key. Please check your key and try again.',
      });
    }

    // Encrypt and store the API key
    const encryptedKey = encrypt(apiKey);

    await db
      .update(schema.sellers)
      .set({
        apiKeyEnc: encryptedKey,
        apiKeyValid: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.sellers.id, sellerId));

    // TODO: Queue initial sync job via BullMQ
    // await initialSyncQueue.add('initial-sync', { sellerId });

    return { success: true, message: 'API key validated and stored. Starting data sync...' };
  });

  // PATCH /api/sellers/cogs — Update COGS for products
  server.patch('/cogs', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const { products } = updateCogsSchema.parse(request.body);

    const results = [];
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
          eq(schema.offers.offerId, product.offerId)
        )
        .returning({ offerId: schema.offers.offerId });

      if (updated) results.push(updated);
    }

    // TODO: Queue profit recalculation job for affected products
    // await profitRecalcQueue.add('recalculate', { sellerId, offerIds: products.map(p => p.offerId) });

    return { updated: results.length, products: results };
  });
}
