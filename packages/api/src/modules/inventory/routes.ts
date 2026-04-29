/**
 * Inventory API Routes
 *
 *   GET /api/inventory/stock         — Paginated stock levels per DC
 *   GET /api/inventory/returns       — Paginated reversed orders
 *   GET /api/inventory/stock/export  — CSV download of all stock data
 *
 * All queries are scoped to the authenticated seller.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq, or, sql, desc, asc, ilike } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { authenticate } from '../../middleware/auth.js';
import { cacheGet, cacheSet } from '../sync/redis.js';
import {
  getStockCoverStatus,
  calcSalesVelocity,
  buildStockCsvRow,
  STOCK_CSV_HEADER,
} from './utils.js';

const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

// =============================================================================
// Validators
// =============================================================================

const stockQuerySchema = z.object({
  search: z.string().optional(),
  sort: z
    .enum(['title', 'stock_cover', 'sales_velocity', 'total_stock'])
    .default('stock_cover'),
  order: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().min(1).max(200).default(50),
  page: z.coerce.number().min(1).default(1),
  /**
   * Filter by listing status group.
   *   active      → Buyable + Not Buyable (anything not disabled). Default.
   *   buyable     → exactly status = 'Buyable'.
   *   not_buyable → exactly status = 'Not Buyable'.
   *   disabled    → Anything in a Disabled-by-* state.
   *   all         → No filter.
   */
  statusFilter: z
    .enum(['active', 'buyable', 'not_buyable', 'disabled', 'all'])
    .default('active'),
});

const returnsQuerySchema = z.object({
  sort: z
    .enum(['order_date', 'reversal_amount', 'product_title'])
    .default('order_date'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().min(1).max(200).default(50),
  page: z.coerce.number().min(1).default(1),
});

// =============================================================================
// Routes
// =============================================================================

export async function inventoryRoutes(server: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // GET /api/inventory/stock — Stock levels per DC
  // ---------------------------------------------------------------------------
  server.get('/stock', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const params = stockQuerySchema.parse(request.query);
    const offset = (params.page - 1) * params.limit;

    const cacheKey = `inventory:${sellerId}:stock:${params.sort}:${params.order}:${params.page}:${params.limit}:${params.search ?? ''}:${params.statusFilter}`;
    const cached = await cacheGet(cacheKey);
    if (cached !== null) return cached;

    // Build WHERE conditions
    const conditions = [eq(schema.offers.sellerId, sellerId)];
    if (params.search) {
      const pattern = `%${params.search}%`;
      conditions.push(
        or(
          ilike(schema.offers.title, pattern),
          ilike(schema.offers.sku, pattern)
        )!
      );
    }

    // Status filter — Takealot statuses we've observed:
    //   "Buyable", "Not Buyable", "Disabled by Seller", "Disabled by Takealot"
    if (params.statusFilter === 'active') {
      conditions.push(
        sql`(${schema.offers.status} IS NULL OR ${schema.offers.status} NOT ILIKE '%disabled%')`
      );
    } else if (params.statusFilter === 'buyable') {
      conditions.push(sql`${schema.offers.status} ILIKE 'Buyable'`);
    } else if (params.statusFilter === 'not_buyable') {
      conditions.push(sql`${schema.offers.status} ILIKE 'Not Buyable'`);
    } else if (params.statusFilter === 'disabled') {
      conditions.push(sql`${schema.offers.status} ILIKE '%disabled%'`);
    }
    // 'all' adds no condition.

    const where = and(...conditions);

    // Dynamic sort expressions
    const totalStockExpr = sql`COALESCE(${schema.offers.stockJhb}, 0) + COALESCE(${schema.offers.stockCpt}, 0) + COALESCE(${schema.offers.stockDbn}, 0)`;

    const sortExprMap = {
      title: schema.offers.title,
      stock_cover: sql`COALESCE(${schema.offers.stockCoverDays}, -1)`,
      sales_velocity: sql`COALESCE(${schema.offers.salesUnits30d}, 0)`,
      total_stock: totalStockExpr,
    } as const;

    const sortExpr = sortExprMap[params.sort] ?? sortExprMap.stock_cover;
    const orderFn = params.order === 'desc' ? desc : asc;

    const [rows, countResult] = await Promise.all([
      db
        .select({
          offerId: schema.offers.offerId,
          tsin: schema.offers.tsin,
          title: schema.offers.title,
          sku: schema.offers.sku,
          stockJhb: schema.offers.stockJhb,
          stockCpt: schema.offers.stockCpt,
          stockDbn: schema.offers.stockDbn,
          stockCoverDays: schema.offers.stockCoverDays,
          salesUnits30d: schema.offers.salesUnits30d,
          sellingPriceCents: schema.offers.sellingPriceCents,
          status: schema.offers.status,
          leadtimeDays: schema.offers.leadtimeDays,
          offerUrl: schema.offers.offerUrl,
        })
        .from(schema.offers)
        .where(where)
        .orderBy(orderFn(sortExpr))
        .limit(params.limit)
        .offset(offset),
      db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(schema.offers)
        .where(where),
    ]);

    const data = rows.map((r) => {
      const jhb = r.stockJhb ?? 0;
      const cpt = r.stockCpt ?? 0;
      const dbn = r.stockDbn ?? 0;
      const totalStock = jhb + cpt + dbn;
      const salesUnits30d = r.salesUnits30d ?? 0;
      const salesVelocity = calcSalesVelocity(salesUnits30d);

      return {
        offerId: r.offerId,
        tsin: r.tsin ?? null,
        offerUrl: r.offerUrl ?? null,
        title: r.title ?? 'Unknown Product',
        sku: r.sku ?? null,
        stockJhb: jhb,
        stockCpt: cpt,
        stockDbn: dbn,
        totalStock,
        stockCoverDays: r.stockCoverDays,
        stockCoverStatus: getStockCoverStatus(r.stockCoverDays),
        salesUnits30d,
        salesVelocity,
        sellingPriceCents: r.sellingPriceCents ?? 0,
        status: r.status ?? null,
        leadtimeDays: r.leadtimeDays ?? 0,
      };
    });

    const result = {
      data,
      pagination: {
        page: params.page,
        pageSize: params.limit,
        totalItems: countResult[0]?.total ?? 0,
        totalPages: Math.ceil((countResult[0]?.total ?? 0) / params.limit),
      },
    };

    cacheSet(cacheKey, result, CACHE_TTL_SECONDS).catch(() => {});
    return result;
  });

  // ---------------------------------------------------------------------------
  // GET /api/inventory/stock/export — CSV download
  //   ⚠ Must be registered BEFORE /returns so Fastify doesn't match "stock"
  //     as a path prefix ambiguity.
  // ---------------------------------------------------------------------------
  server.get('/stock/export', { preHandler: [authenticate] }, async (request, reply) => {
    const { sellerId } = request.user as { sellerId: string };

    const rows = await db
      .select({
        sku: schema.offers.sku,
        title: schema.offers.title,
        stockJhb: schema.offers.stockJhb,
        stockCpt: schema.offers.stockCpt,
        stockDbn: schema.offers.stockDbn,
        stockCoverDays: schema.offers.stockCoverDays,
        salesUnits30d: schema.offers.salesUnits30d,
        sellingPriceCents: schema.offers.sellingPriceCents,
        status: schema.offers.status,
      })
      .from(schema.offers)
      .where(eq(schema.offers.sellerId, sellerId))
      .orderBy(asc(schema.offers.title));

    const lines = rows.map((r) => buildStockCsvRow(r));

    const csv = [STOCK_CSV_HEADER, ...lines].join('\n');
    const today = new Date().toISOString().split('T')[0];

    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="percepta_inventory_${today}.csv"`)
      .send(csv);
  });

  // ---------------------------------------------------------------------------
  // GET /api/inventory/returns — Reversed orders
  // ---------------------------------------------------------------------------
  server.get('/returns', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const params = returnsQuerySchema.parse(request.query);
    const offset = (params.page - 1) * params.limit;

    const cacheKey = `inventory:${sellerId}:returns:${params.sort}:${params.order}:${params.page}:${params.limit}`;
    const cached = await cacheGet(cacheKey);
    if (cached !== null) return cached;

    const where = and(
      eq(schema.orders.sellerId, sellerId),
      eq(schema.orders.hasReversal, true)
    );

    const sortExprMap = {
      order_date: schema.orders.orderDate,
      reversal_amount: sql`COALESCE(${schema.orders.reversalAmountCents}, 0)`,
      product_title: schema.orders.productTitle,
    } as const;

    const sortExpr = sortExprMap[params.sort] ?? sortExprMap.order_date;
    const orderFn = params.order === 'desc' ? desc : asc;

    const [rows, countResult] = await Promise.all([
      db
        .select({
          orderId: schema.orders.orderId,
          productTitle: schema.orders.productTitle,
          sku: schema.orders.sku,
          orderDate: schema.orders.orderDate,
          reversalAmountCents: schema.orders.reversalAmountCents,
          quantity: schema.orders.quantity,
          sellingPriceCents: schema.orders.sellingPriceCents,
          dateShippedToCustomer: schema.orders.dateShippedToCustomer,
          saleStatus: schema.orders.saleStatus,
        })
        .from(schema.orders)
        .where(where)
        .orderBy(orderFn(sortExpr))
        .limit(params.limit)
        .offset(offset),
      db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(schema.orders)
        .where(where),
    ]);

    const data = rows.map((r) => ({
      orderId: r.orderId,
      productTitle: r.productTitle ?? 'Unknown Product',
      sku: r.sku ?? null,
      orderDate: r.orderDate?.toISOString() ?? null,
      reversalAmountCents: r.reversalAmountCents ?? 0,
      quantity: r.quantity,
      sellingPriceCents: r.sellingPriceCents,
      dateShippedToCustomer: r.dateShippedToCustomer?.toISOString() ?? null,
      saleStatus: r.saleStatus ?? null,
    }));

    const result = {
      data,
      pagination: {
        page: params.page,
        pageSize: params.limit,
        totalItems: countResult[0]?.total ?? 0,
        totalPages: Math.ceil((countResult[0]?.total ?? 0) / params.limit),
      },
    };

    cacheSet(cacheKey, result, CACHE_TTL_SECONDS).catch(() => {});
    return result;
  });
}
