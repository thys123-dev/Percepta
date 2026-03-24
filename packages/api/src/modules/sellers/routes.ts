import { randomBytes } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { eq, and, inArray, desc, asc, sql } from 'drizzle-orm';
import { authenticate } from '../../middleware/auth.js';
import { TakealotClient } from '../takealot-client/index.js';
import { encrypt } from '../../config/encryption.js';
import { initialSyncQueue, calculateProfitsQueue } from '../sync/queues.js';
import { env } from '../../config/env.js';

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

const offerListQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  page: z.coerce.number().min(1).default(1),
  search: z.string().optional(),
  sort: z.enum(['title', 'sales', 'cogs']).optional().default('title'),
});

const cogsImportSchema = z.object({
  mode: z.enum(['preview', 'commit']),
  rows: z.array(
    z.object({
      offerId: z.number().int(),
      cogsCents: z.number().int().min(0),
      inboundCostCents: z.number().int().min(0).default(0),
    })
  ).min(1).max(500),
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

  // GET /api/sellers/webhook-info — Webhook URL + secret for Takealot portal setup
  server.get('/webhook-info', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    const [seller] = await db
      .select({ id: schema.sellers.id, webhookSecret: schema.sellers.webhookSecret })
      .from(schema.sellers)
      .where(eq(schema.sellers.id, sellerId))
      .limit(1);

    if (!seller) return { webhookUrl: null, webhookSecret: null };

    // Construct the seller-specific webhook URL
    const apiBase = env.API_BASE_URL;
    const webhookUrl = `${apiBase}/api/webhooks/takealot/${seller.id}`;

    return {
      webhookUrl,
      webhookSecret: seller.webhookSecret ?? null,
    };
  });

  // POST /api/sellers/connect — Validate and store Takealot API key, kick off initial sync
  server.post('/connect', { preHandler: [authenticate] }, async (request, reply) => {
    const { sellerId } = request.user as { sellerId: string };
    const { apiKey } = connectApiKeySchema.parse(request.body);

    // Test the API key against Takealot API
    const client = new TakealotClient(apiKey);
    const isValid = await client.testConnection();

    if (!isValid) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid Takealot API key. Please check your key and try again.',
      });
    }

    // Encrypt the API key at rest (AES-256-GCM)
    const encryptedKey = encrypt(apiKey);

    // Generate a 64-char hex webhook secret for HMAC signing
    const webhookSecret = randomBytes(32).toString('hex');

    await db
      .update(schema.sellers)
      .set({
        apiKeyEnc: encryptedKey,
        apiKeyValid: true,
        webhookSecret,
        initialSyncStatus: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(schema.sellers.id, sellerId));

    // Queue initial sync (deduped by jobId)
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

    // Recalculate profit for all orders belonging to the updated offers
    if (updatedOfferIds.length > 0) {
      const affectedOrders = await db
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.sellerId, sellerId),
            inArray(schema.orders.offerId, updatedOfferIds)
          )
        );

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

  // ---------------------------------------------------------------------------
  // GET /api/sellers/offers — Paginated offer list for COGS management
  // ---------------------------------------------------------------------------
  server.get('/offers', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const params = offerListQuerySchema.parse(request.query);
    const offset = (params.page - 1) * params.limit;

    // Build WHERE: seller filter + optional text search
    const conditions: ReturnType<typeof eq>[] = [eq(schema.offers.sellerId, sellerId)];
    if (params.search) {
      conditions.push(
        sql`(${schema.offers.title} ILIKE ${`%${params.search}%`} OR ${schema.offers.sku} ILIKE ${`%${params.search}%`})` as unknown as ReturnType<typeof eq>
      );
    }
    const where = and(...conditions);

    // Sort order
    const orderBy =
      params.sort === 'sales'
        ? desc(schema.offers.salesUnits30d)
        : params.sort === 'cogs'
          ? asc(schema.offers.cogsSource) // 'estimate' sorts before 'manual' — unset COGS first
          : asc(schema.offers.title);

    const [offerRows, countResult] = await Promise.all([
      db
        .select({
          offerId: schema.offers.offerId,
          title: schema.offers.title,
          sku: schema.offers.sku,
          category: schema.offers.category,
          sellingPriceCents: schema.offers.sellingPriceCents,
          cogsCents: schema.offers.cogsCents,
          cogsSource: schema.offers.cogsSource,
          inboundCostCents: schema.offers.inboundCostCents,
          salesUnits30d: schema.offers.salesUnits30d,
          stockCoverDays: schema.offers.stockCoverDays,
        })
        .from(schema.offers)
        .where(where)
        .orderBy(orderBy)
        .limit(params.limit)
        .offset(offset),

      db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(schema.offers)
        .where(where),
    ]);

    return {
      data: offerRows,
      pagination: {
        page: params.page,
        pageSize: params.limit,
        totalItems: countResult[0]?.total ?? 0,
        totalPages: Math.ceil((countResult[0]?.total ?? 0) / params.limit),
      },
    };
  });

  // ---------------------------------------------------------------------------
  // GET /api/sellers/cogs/template — Download pre-filled CSV template
  // Note: registered BEFORE /cogs/import so Fastify doesn't treat 'template'
  // as an :id param if a dynamic route were added later.
  // ---------------------------------------------------------------------------
  server.get('/cogs/template', { preHandler: [authenticate] }, async (request, reply) => {
    const { sellerId } = request.user as { sellerId: string };

    const offers = await db
      .select({
        offerId: schema.offers.offerId,
        sku: schema.offers.sku,
        title: schema.offers.title,
        sellingPriceCents: schema.offers.sellingPriceCents,
        cogsCents: schema.offers.cogsCents,
        inboundCostCents: schema.offers.inboundCostCents,
      })
      .from(schema.offers)
      .where(eq(schema.offers.sellerId, sellerId))
      .orderBy(desc(schema.offers.salesUnits30d));

    const header = 'offer_id,sku,title,current_price_rands,cogs_rands,inbound_cost_rands\n';
    const rows = offers
      .map((o) => {
        const price = ((o.sellingPriceCents ?? 0) / 100).toFixed(2);
        const cogs = o.cogsCents != null ? (o.cogsCents / 100).toFixed(2) : '';
        const inbound = ((o.inboundCostCents ?? 0) / 100).toFixed(2);
        const safeTitle = `"${(o.title ?? '').replace(/"/g, '""')}"`;
        const safeSku = `"${(o.sku ?? '').replace(/"/g, '""')}"`;
        return `${o.offerId},${safeSku},${safeTitle},${price},${cogs},${inbound}`;
      })
      .join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="percepta-cogs-template.csv"');
    return reply.send(header + rows);
  });

  // ---------------------------------------------------------------------------
  // POST /api/sellers/cogs/import — Preview or commit CSV-sourced COGS
  // ---------------------------------------------------------------------------
  server.post('/cogs/import', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const { mode, rows } = cogsImportSchema.parse(request.body);

    const offerIds = rows.map((r) => r.offerId);

    // Resolve which offer IDs belong to this seller
    const existingOffers = await db
      .select({
        offerId: schema.offers.offerId,
        title: schema.offers.title,
        sku: schema.offers.sku,
      })
      .from(schema.offers)
      .where(
        and(
          eq(schema.offers.sellerId, sellerId),
          inArray(schema.offers.offerId, offerIds)
        )
      );

    const existingMap = new Map(existingOffers.map((o) => [o.offerId, o]));

    // ── Preview mode: return matched/unmatched list, write nothing ──
    if (mode === 'preview') {
      const preview = rows.map((row) => {
        const match = existingMap.get(row.offerId);
        return {
          offerId: row.offerId,
          title: match?.title ?? null,
          sku: match?.sku ?? null,
          cogsCents: row.cogsCents,
          inboundCostCents: row.inboundCostCents ?? 0,
          matched: !!match,
        };
      });

      return {
        mode: 'preview',
        preview,
        matched: preview.filter((r) => r.matched).length,
        unmatched: preview.filter((r) => !r.matched).length,
      };
    }

    // ── Commit mode: write updates + queue profit recalculation ──
    const matchedRows = rows.filter((r) => existingMap.has(r.offerId));
    const updatedOfferIds: number[] = [];

    for (const row of matchedRows) {
      const [updated] = await db
        .update(schema.offers)
        .set({
          cogsCents: row.cogsCents,
          cogsSource: 'manual',
          inboundCostCents: row.inboundCostCents ?? 0,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.offers.sellerId, sellerId),
            eq(schema.offers.offerId, row.offerId)
          )
        )
        .returning({ offerId: schema.offers.offerId });

      if (updated) updatedOfferIds.push(updated.offerId);
    }

    if (updatedOfferIds.length > 0) {
      const affectedOrders = await db
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.sellerId, sellerId),
            inArray(schema.orders.offerId, updatedOfferIds)
          )
        );

      const orderIds = affectedOrders.map((o) => o.id);
      if (orderIds.length > 0) {
        await calculateProfitsQueue.add('recalculate-after-cogs-import', {
          sellerId,
          orderIds,
        });
      }
    }

    return {
      mode: 'commit',
      updated: updatedOfferIds.length,
      unmatched: rows.length - matchedRows.length,
    };
  });

  // PATCH /api/sellers/profile — Update seller profile settings
  server.patch('/profile', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    const profileSchema = z.object({
      businessName: z.string().min(1).max(255).optional(),
      isVatVendor: z.boolean().optional(),
      vatNumber: z.string().max(20).optional(),
      targetMarginPct: z.number().min(0).max(100).optional(),
      onboardingComplete: z.boolean().optional(),
    });

    const updates = profileSchema.parse(request.body);

    // Drizzle maps `decimal` columns to `string`, so convert the number from Zod
    const { targetMarginPct, ...rest } = updates;
    const [updated] = await db
      .update(schema.sellers)
      .set({
        ...rest,
        ...(targetMarginPct !== undefined && { targetMarginPct: targetMarginPct.toString() }),
        updatedAt: new Date(),
      })
      .where(eq(schema.sellers.id, sellerId))
      .returning({
        businessName: schema.sellers.businessName,
        isVatVendor: schema.sellers.isVatVendor,
        targetMarginPct: schema.sellers.targetMarginPct,
      });

    return { success: true, profile: updated };
  });
}
