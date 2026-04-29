import { randomBytes } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { eq, and, inArray, desc, asc, sql, gte, lte, notInArray } from 'drizzle-orm';
import { authenticate } from '../../middleware/auth.js';
import { TakealotClient } from '../takealot-client/index.js';
import { encrypt } from '../../config/encryption.js';
import { initialSyncQueue, calculateProfitsQueue } from '../sync/queues.js';
import { env } from '../../config/env.js';
import ExcelJS from 'exceljs';
import { cacheGet, cacheSet, cacheInvalidate } from '../sync/redis.js';

const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

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
  /**
   * Same status grouping as inventory, defaulted to 'active' so disabled
   * SKUs stay hidden from COGS by default. The COGS UI exposes pills
   * to switch to 'buyable' / 'not_buyable' / 'disabled' / 'all'.
   */
  statusFilter: z
    .enum(['active', 'buyable', 'not_buyable', 'disabled', 'all'])
    .default('active'),
});

const cogsImportSchema = z.object({
  mode: z.enum(['preview', 'commit']),
  fileName: z.string().max(255).optional(),
  rows: z.array(
    z.object({
      offerId: z.number().int().optional(),
      sku: z.string().min(1).max(255).optional(),
      cogsCents: z.number().int().min(0),
      inboundCostCents: z.number().int().min(0).default(0),
    }).refine(
      (row) => row.offerId !== undefined || row.sku !== undefined,
      { message: 'Each row must include either offerId or sku' }
    )
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

    // Remove any stuck/stalled/failed prior job with the same ID before re-adding.
    // BullMQ silently deduplicates by jobId across ALL states (active, completed,
    // failed, stalled), so without this clean-up a worker that crashed mid-job
    // would leave the seller permanently unable to re-trigger their sync.
    const jobId = `initial-sync-${sellerId}`;
    const existingJob = await initialSyncQueue.getJob(jobId);
    if (existingJob) {
      await existingJob.remove().catch((err: Error) => {
        request.log.warn({ err, jobId }, 'Failed to remove existing initial-sync job');
      });
    }

    // Queue fresh initial sync
    await initialSyncQueue.add(
      'initial-sync',
      { sellerId },
      {
        jobId,
        // Auto-cleanup so failed/completed jobs don't block future attempts
        removeOnComplete: { count: 10, age: 24 * 60 * 60 },
        removeOnFail: { count: 50, age: 7 * 24 * 60 * 60 },
      }
    );

    return {
      success: true,
      message: 'API key validated. Your data sync has started — this takes 2-5 minutes.',
    };
  });

  // POST /api/sellers/reset-data
  // Wipes all synced/derived data for the authenticated seller (offers,
  // orders, profit calcs, fees, alerts, etc.) and resets sync status to
  // 'pending'. Keeps the seller account, login credentials, and the
  // stored API key intact so the next "Sync now" works without
  // reconnecting. Intended for QA / re-sync testing — sellers can use
  // this to start over without creating a new account.
  //
  // Requires {confirm: true} in the body to prevent accidental wipes.
  server.post('/reset-data', { preHandler: [authenticate] }, async (request, reply) => {
    const { sellerId } = request.user as { sellerId: string };
    const { confirm } = z.object({ confirm: z.literal(true) }).parse(request.body);
    if (!confirm) {
      return reply.status(400).send({ error: 'confirm: true is required in the body' });
    }

    const counts: Record<string, number> = {};
    const wipe = async (
      label: string,
      del: () => Promise<{ id: string }[]>,
    ): Promise<void> => {
      try {
        const result = await del();
        counts[label] = result.length;
      } catch (err) {
        request.log.error({ err, table: label }, 'reset-data: delete failed');
        counts[label] = -1;
      }
    };

    // Order matters: child tables before parents to keep FK behaviour
    // predictable even though cascades exist.
    await wipe('profitCalculations', () =>
      db.delete(schema.profitCalculations)
        .where(eq(schema.profitCalculations.sellerId, sellerId))
        .returning({ id: schema.profitCalculations.id })
    );
    await wipe('calculatedFees', () =>
      db.delete(schema.calculatedFees)
        .where(eq(schema.calculatedFees.sellerId, sellerId))
        .returning({ id: schema.calculatedFees.id })
    );
    await wipe('feeDiscrepancies', () =>
      db.delete(schema.feeDiscrepancies)
        .where(eq(schema.feeDiscrepancies.sellerId, sellerId))
        .returning({ id: schema.feeDiscrepancies.id })
    );
    await wipe('accountTransactions', () =>
      db.delete(schema.accountTransactions)
        .where(eq(schema.accountTransactions.sellerId, sellerId))
        .returning({ id: schema.accountTransactions.id })
    );
    await wipe('accountTransactionImports', () =>
      db.delete(schema.accountTransactionImports)
        .where(eq(schema.accountTransactionImports.sellerId, sellerId))
        .returning({ id: schema.accountTransactionImports.id })
    );
    await wipe('salesReportImports', () =>
      db.delete(schema.salesReportImports)
        .where(eq(schema.salesReportImports.sellerId, sellerId))
        .returning({ id: schema.salesReportImports.id })
    );
    await wipe('webhookEvents', () =>
      db.delete(schema.webhookEvents)
        .where(eq(schema.webhookEvents.sellerId, sellerId))
        .returning({ id: schema.webhookEvents.id })
    );
    await wipe('alerts', () =>
      db.delete(schema.alerts)
        .where(eq(schema.alerts.sellerId, sellerId))
        .returning({ id: schema.alerts.id })
    );
    await wipe('sellerCosts', () =>
      db.delete(schema.sellerCosts)
        .where(eq(schema.sellerCosts.sellerId, sellerId))
        .returning({ id: schema.sellerCosts.id })
    );
    await wipe('orders', () =>
      db.delete(schema.orders)
        .where(eq(schema.orders.sellerId, sellerId))
        .returning({ id: schema.orders.id })
    );
    await wipe('offers', () =>
      db.delete(schema.offers)
        .where(eq(schema.offers.sellerId, sellerId))
        .returning({ id: schema.offers.id })
    );

    // Reset seller's sync status, but KEEP apiKey, email, businessName,
    // onboardingComplete etc. so they're still logged in and can sync.
    await db
      .update(schema.sellers)
      .set({
        initialSyncStatus: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(schema.sellers.id, sellerId));

    // Wipe any cached aggregates so the dashboard reflects the empty state.
    await Promise.allSettled([
      cacheInvalidate(`dashboard:${sellerId}:*`),
      cacheInvalidate(`inventory:${sellerId}:*`),
      cacheInvalidate(`revenue-target:${sellerId}`),
    ]);

    request.log.info({ sellerId, counts }, 'reset-data: wiped seller data');

    return {
      success: true,
      message:
        'Data reset complete. Click "Sync now" on the dashboard to pull a fresh active-only sync.',
      deleted: counts,
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
  //
  // Always excludes offers in any 'Disabled by ...' status. Showing
  // disabled SKUs on the COGS screen confuses sellers — they don't want
  // to set costs on products they've paused. The Inventory page exposes
  // them via its 'Disabled' status filter for sellers who want to see
  // the full catalogue.
  // ---------------------------------------------------------------------------
  server.get('/offers', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const params = offerListQuerySchema.parse(request.query);
    const offset = (params.page - 1) * params.limit;

    // Build WHERE: seller filter + status filter + optional text search
    const conditions: ReturnType<typeof eq>[] = [eq(schema.offers.sellerId, sellerId)];

    // Same status grouping as inventory (see inventory/routes.ts)
    if (params.statusFilter === 'active') {
      conditions.push(
        sql`(${schema.offers.status} IS NULL OR ${schema.offers.status} NOT ILIKE '%disabled%')` as unknown as ReturnType<typeof eq>
      );
    } else if (params.statusFilter === 'buyable') {
      conditions.push(
        sql`${schema.offers.status} ILIKE 'Buyable'` as unknown as ReturnType<typeof eq>
      );
    } else if (params.statusFilter === 'not_buyable') {
      conditions.push(
        sql`${schema.offers.status} ILIKE 'Not Buyable'` as unknown as ReturnType<typeof eq>
      );
    } else if (params.statusFilter === 'disabled') {
      conditions.push(
        sql`${schema.offers.status} ILIKE '%disabled%'` as unknown as ReturnType<typeof eq>
      );
    }
    // 'all' adds no condition.

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
          tsin: schema.offers.tsin,
          title: schema.offers.title,
          sku: schema.offers.sku,
          category: schema.offers.category,
          status: schema.offers.status,
          sellingPriceCents: schema.offers.sellingPriceCents,
          cogsCents: schema.offers.cogsCents,
          cogsSource: schema.offers.cogsSource,
          inboundCostCents: schema.offers.inboundCostCents,
          salesUnits30d: schema.offers.salesUnits30d,
          stockCoverDays: schema.offers.stockCoverDays,
          offerUrl: schema.offers.offerUrl,
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
      .where(
        and(
          eq(schema.offers.sellerId, sellerId),
          // Match the COGS list endpoint: only active products in the template.
          sql`(${schema.offers.status} IS NULL OR ${schema.offers.status} NOT ILIKE '%disabled%')`
        )
      )
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
  // GET /api/sellers/cogs/template/xlsx — Download pre-filled Excel template
  // ---------------------------------------------------------------------------
  server.get('/cogs/template/xlsx', { preHandler: [authenticate] }, async (request, reply) => {
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
      .where(
        and(
          eq(schema.offers.sellerId, sellerId),
          // Match the COGS list endpoint: only active products in the template.
          sql`(${schema.offers.status} IS NULL OR ${schema.offers.status} NOT ILIKE '%disabled%')`
        )
      )
      .orderBy(desc(schema.offers.salesUnits30d));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Percepta';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('COGS Template', {
      views: [{ state: 'frozen', ySplit: 3 }],
    });

    // ── Column definitions ──────────────────────────────────────────────────
    sheet.columns = [
      { key: 'offerId',   width: 12 },
      { key: 'sku',       width: 22 },
      { key: 'title',     width: 42 },
      { key: 'price',     width: 18 },
      { key: 'cogs',      width: 22 },
      { key: 'inbound',   width: 22 },
    ];

    // ── Row 1: Banner ───────────────────────────────────────────────────────
    sheet.mergeCells('A1:F1');
    const bannerCell = sheet.getCell('A1');
    bannerCell.value = 'Percepta COGS Template — Fill in the highlighted yellow columns only. Do not edit columns A–D.';
    bannerCell.font = { bold: true, color: { argb: 'FF1E3A5F' }, size: 11 };
    bannerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F7' } };
    bannerCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    sheet.getRow(1).height = 28;

    // ── Row 2: Column headers ───────────────────────────────────────────────
    const GREY_FILL: ExcelJS.Fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
    const YELLOW_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } };
    const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, size: 10 };
    const BORDER: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFB0B0B0' } };
    const ALL_BORDERS: Partial<ExcelJS.Borders> = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };

    const headers = [
      { col: 'A', label: 'Offer ID',           fill: GREY_FILL },
      { col: 'B', label: 'SKU',                fill: GREY_FILL },
      { col: 'C', label: 'Product Title',      fill: GREY_FILL },
      { col: 'D', label: 'Current Price (R)',  fill: GREY_FILL },
      { col: 'E', label: '★ Your Cost / COGS (R)', fill: YELLOW_FILL },
      { col: 'F', label: '★ Inbound Cost (R)',     fill: YELLOW_FILL },
    ];

    headers.forEach(({ col, label, fill }) => {
      const cell = sheet.getCell(`${col}2`);
      cell.value = label;
      cell.font = HEADER_FONT;
      cell.fill = fill;
      cell.border = ALL_BORDERS;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    sheet.getRow(2).height = 32;

    // ── Rows 3+: Product data ───────────────────────────────────────────────
    offers.forEach((o, i) => {
      const rowNum = i + 3;
      const rowFill: ExcelJS.Fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: i % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF' },
      };

      const setCell = (
        col: string,
        value: ExcelJS.CellValue,
        isEditable: boolean,
        numFmt?: string,
      ) => {
        const cell = sheet.getCell(`${col}${rowNum}`);
        cell.value = value;
        cell.border = ALL_BORDERS;
        cell.fill = isEditable ? YELLOW_FILL : rowFill;
        cell.font = { size: 10, color: { argb: isEditable ? 'FF000000' : 'FF555555' } };
        cell.alignment = { vertical: 'middle' };
        if (typeof value === 'number') {
          // Default to currency-style two-decimal formatting; allow caller to
          // override (e.g. plain integers for offer IDs).
          cell.numFmt = numFmt ?? '#,##0.00';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        }
      };

      // Offer ID: plain integer, no thousand separator, no decimals — looks
      // like '225357430' instead of '225 357 430,00' in EU/ZA locales.
      setCell('A', o.offerId,                                                    false, '0');
      setCell('B', o.sku ?? '',                                                   false);
      setCell('C', o.title ?? '',                                                 false);
      setCell('D', Number(((o.sellingPriceCents ?? 0) / 100).toFixed(2)),        false);
      setCell('E', o.cogsCents != null ? Number((o.cogsCents / 100).toFixed(2)) : null, true);
      setCell('F', Number(((o.inboundCostCents ?? 0) / 100).toFixed(2)),         true);
    });

    // ── Autofilter on header row ────────────────────────────────────────────
    sheet.autoFilter = { from: 'A2', to: 'F2' };

    const buffer = await workbook.xlsx.writeBuffer();

    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename="percepta-cogs-template.xlsx"');
    return reply.send(Buffer.from(buffer));
  });

  // ---------------------------------------------------------------------------
  // POST /api/sellers/cogs/import — Preview or commit CSV-sourced COGS
  // ---------------------------------------------------------------------------
  server.post('/cogs/import', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const { mode, rows, fileName } = cogsImportSchema.parse(request.body);

    // Build lookup keys for matching: try offerId first, then sku.
    const offerIds = Array.from(
      new Set(rows.map((r) => r.offerId).filter((v): v is number => typeof v === 'number'))
    );
    const skus = Array.from(
      new Set(rows.map((r) => r.sku).filter((v): v is string => typeof v === 'string' && v.length > 0))
    );

    // Pre-fetch matching offers in TWO queries: one by offer_id, one by sku.
    // Both are scoped to this seller so cross-seller SKU collisions are
    // impossible.
    const [byOfferId, bySku] = await Promise.all([
      offerIds.length > 0
        ? db
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
            )
        : Promise.resolve([] as { offerId: number; title: string | null; sku: string | null }[]),
      skus.length > 0
        ? db
            .select({
              offerId: schema.offers.offerId,
              title: schema.offers.title,
              sku: schema.offers.sku,
            })
            .from(schema.offers)
            .where(
              and(
                eq(schema.offers.sellerId, sellerId),
                inArray(schema.offers.sku, skus)
              )
            )
        : Promise.resolve([] as { offerId: number; title: string | null; sku: string | null }[]),
    ]);

    const offerIdMap = new Map(byOfferId.map((o) => [o.offerId, o]));
    const skuMap = new Map<string, { offerId: number; title: string | null; sku: string | null }>();
    for (const o of bySku) {
      if (o.sku) skuMap.set(o.sku, o);
    }

    /** Resolve a row to its matching offer (offerId wins, sku fallback). */
    const resolveMatch = (row: { offerId?: number; sku?: string }) => {
      if (row.offerId !== undefined) {
        const m = offerIdMap.get(row.offerId);
        if (m) return m;
      }
      if (row.sku) {
        const m = skuMap.get(row.sku);
        if (m) return m;
      }
      return null;
    };

    // ── Preview mode: return matched/unmatched list, write nothing ──
    if (mode === 'preview') {
      const preview = rows.map((row) => {
        const match = resolveMatch(row);
        return {
          offerId: match?.offerId ?? row.offerId ?? null,
          title: match?.title ?? null,
          sku: match?.sku ?? row.sku ?? null,
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
    // De-duplicate by resolved offerId so the same offer doesn't get
    // multiple conflicting writes if a user lists it under both offer_id
    // and sku.
    const updatedOfferIds: number[] = [];
    const seen = new Set<number>();
    const unmatchedRows: Array<{
      offerId: number | null;
      sku: string | null;
      cogsCents: number;
      inboundCostCents: number;
      reason: string;
    }> = [];

    for (const row of rows) {
      const match = resolveMatch(row);
      if (!match) {
        // Build a useful 'reason' so the UI can tell the user WHY each row
        // failed to match without them having to guess.
        let reason: string;
        if (row.offerId !== undefined && row.sku) {
          reason = `Neither offer_id ${row.offerId} nor SKU "${row.sku}" matches any offer for this seller.`;
        } else if (row.offerId !== undefined) {
          reason = `Offer ID ${row.offerId} not found. The product may have been deleted from your Takealot catalogue.`;
        } else if (row.sku) {
          reason = `SKU "${row.sku}" not found. Check spelling, or run "Sync disabled offers" if it's a paused product.`;
        } else {
          reason = 'Row had no offer_id or SKU.';
        }
        unmatchedRows.push({
          offerId: row.offerId ?? null,
          sku: row.sku ?? null,
          cogsCents: row.cogsCents,
          inboundCostCents: row.inboundCostCents ?? 0,
          reason,
        });
        continue;
      }
      if (seen.has(match.offerId)) continue;
      seen.add(match.offerId);

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
            eq(schema.offers.offerId, match.offerId)
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

    // Record this import in the audit ledger so the UI can show
    // "last uploaded" feedback. We record *after* the writes so a failed
    // commit doesn't leave a misleading "complete" entry.
    try {
      await db.insert(schema.cogsImports).values({
        sellerId,
        fileName: fileName ?? 'cogs_import.csv',
        rowCount: rows.length,
        matchedCount: updatedOfferIds.length,
        unmatchedCount: unmatchedRows.length,
        status: 'complete',
      });
    } catch (err) {
      // Audit ledger is best-effort — don't fail the import if it can't be recorded.
      request.log.warn({ err }, 'Failed to record cogs_imports row');
    }

    return {
      mode: 'commit',
      updated: updatedOfferIds.length,
      unmatched: unmatchedRows.length,
      unmatchedRows,
    };
  });

  // ---------------------------------------------------------------------------
  // GET /api/sellers/cogs/imports — List past COGS imports (audit ledger)
  // ---------------------------------------------------------------------------
  server.get('/cogs/imports', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    const imports = await db
      .select()
      .from(schema.cogsImports)
      .where(eq(schema.cogsImports.sellerId, sellerId))
      .orderBy(desc(schema.cogsImports.createdAt))
      .limit(20);

    return { imports };
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
      monthlyRevenuTargetCents: z.number().int().min(0).optional(),
    });

    const updates = profileSchema.parse(request.body);

    // Drizzle maps `decimal` columns to `string`, so convert the number from Zod
    const { targetMarginPct, monthlyRevenuTargetCents, ...rest } = updates;
    const [updated] = await db
      .update(schema.sellers)
      .set({
        ...rest,
        ...(targetMarginPct !== undefined && { targetMarginPct: targetMarginPct.toString() }),
        ...(monthlyRevenuTargetCents !== undefined && { monthlyRevenuTargetCents }),
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

  // GET /api/sellers/revenue-target — Current month revenue progress vs target
  server.get('/revenue-target', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    const cacheKey = `revenue-target:${sellerId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    // Fetch seller target
    const [seller] = await db
      .select({ monthlyRevenuTargetCents: schema.sellers.monthlyRevenuTargetCents })
      .from(schema.sellers)
      .where(eq(schema.sellers.id, sellerId))
      .limit(1);

    if (!seller || seller.monthlyRevenuTargetCents == null) {
      return { targetSet: false };
    }

    // Current calendar month bounds
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(now);
    monthEnd.setHours(23, 59, 59, 999);

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    const daysRemaining = daysInMonth - currentDay;

    // SUM revenue for this calendar month (exclude cancelled/returned)
    const EXCLUDED = ['Returned', 'Return Requested', 'Cancelled'];
    const [revenueRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${schema.profitCalculations.revenueCents}), 0)::bigint` })
      .from(schema.profitCalculations)
      .innerJoin(schema.orders, eq(schema.profitCalculations.orderId, schema.orders.id))
      .where(
        and(
          eq(schema.profitCalculations.sellerId, sellerId),
          gte(schema.orders.orderDate, monthStart),
          lte(schema.orders.orderDate, monthEnd),
          notInArray(schema.orders.saleStatus, EXCLUDED)
        )
      );

    const currentRevenueCents = Number(revenueRow?.total ?? 0);
    const targetCents = seller.monthlyRevenuTargetCents;
    const percentComplete = targetCents > 0 ? Math.min((currentRevenueCents / targetCents) * 100, 100) : 0;
    const currentDailyAvgCents = currentDay > 0 ? Math.round(currentRevenueCents / currentDay) : 0;
    const dailyPaceNeededCents = daysRemaining > 0
      ? Math.round(Math.max(0, targetCents - currentRevenueCents) / daysRemaining)
      : 0;
    const projectedCents = Math.round(currentDailyAvgCents * daysInMonth);

    const result = {
      targetSet: true,
      targetCents,
      currentRevenueCents,
      percentComplete: Math.round(percentComplete * 10) / 10,
      daysInMonth,
      currentDay,
      daysRemaining,
      dailyPaceNeededCents,
      currentDailyAvgCents,
      projectedCents,
    };

    await cacheSet(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  });
}
