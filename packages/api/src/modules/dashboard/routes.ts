/**
 * Dashboard API Routes
 *
 * Powers the core Percepta dashboard UI:
 *   GET /api/dashboard/summary         — Profitability scorecard + trends
 *   GET /api/dashboard/products        — Product performance table
 *   GET /api/dashboard/products/:id/fees — Fee waterfall for one product
 *
 * All queries are scoped to the authenticated seller and a time period.
 * Period presets: 7d | 30d | 90d | custom (startDate + endDate params).
 *
 * Excluded statuses: 'Returned', 'Return Requested', 'Cancelled'
 */

import type { FastifyInstance } from 'fastify';
import { and, eq, gte, lte, sql, desc, asc, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { authenticate } from '../../middleware/auth.js';

// =============================================================================
// Constants
// =============================================================================

const EXCLUDED_STATUSES = ['Returned', 'Return Requested', 'Cancelled'];

// =============================================================================
// Validators
// =============================================================================

const periodQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d', 'custom']).default('30d'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const productsQuerySchema = periodQuerySchema.extend({
  sort: z
    .enum(['margin_pct', 'revenue', 'profit', 'units_sold', 'fees', 'last_sale'])
    .default('margin_pct'),
  order: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().min(1).max(200).default(100),
  page: z.coerce.number().min(1).default(1),
});

// =============================================================================
// Helpers
// =============================================================================

function getPeriodDates(
  period: string,
  startDateStr?: string,
  endDateStr?: string
): { start: Date; end: Date } {
  const end = endDateStr ? new Date(endDateStr) : new Date();
  end.setHours(23, 59, 59, 999);

  let start: Date;
  const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
  const days = daysMap[period];

  if (days) {
    start = new Date(end);
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
  } else if (period === 'custom' && startDateStr) {
    start = new Date(startDateStr);
    start.setHours(0, 0, 0, 0);
  } else {
    start = new Date(end);
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
  }

  return { start, end };
}

function calcDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function getMarginStatus(
  marginPct: number
): 'profitable' | 'marginal' | 'loss_maker' {
  if (marginPct >= 25) return 'profitable';
  if (marginPct >= 0) return 'marginal';
  return 'loss_maker';
}

// =============================================================================
// Routes
// =============================================================================

export async function dashboardRoutes(server: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // GET /api/dashboard/summary
  // ---------------------------------------------------------------------------
  server.get('/summary', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const { period, startDate, endDate } = periodQuerySchema.parse(request.query);
    const { start, end } = getPeriodDates(period, startDate, endDate);

    // Previous period (same duration) for trend comparison
    const durationMs = end.getTime() - start.getTime();
    const prevEnd   = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs);

    // Current period aggregation
    const [current] = await db
      .select({
        totalRevenue:   sql<string>`COALESCE(SUM(${schema.profitCalculations.revenueCents}), 0)`,
        totalFees:      sql<string>`COALESCE(SUM(${schema.profitCalculations.totalFeesCents}), 0)`,
        totalCogs:      sql<string>`COALESCE(SUM(${schema.profitCalculations.cogsCents}), 0)`,
        totalInbound:   sql<string>`COALESCE(SUM(${schema.profitCalculations.inboundCostCents}), 0)`,
        totalProfit:    sql<string>`COALESCE(SUM(${schema.profitCalculations.netProfitCents}), 0)`,
        orderCount:     sql<number>`COUNT(*)::int`,
        productCount:   sql<number>`COUNT(DISTINCT ${schema.profitCalculations.offerId})::int`,
        lossMakerCount: sql<number>`COALESCE(SUM(CASE WHEN ${schema.profitCalculations.isProfitable} = false THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(schema.profitCalculations)
      .innerJoin(schema.orders, eq(schema.profitCalculations.orderId, schema.orders.id))
      .where(
        and(
          eq(schema.profitCalculations.sellerId, sellerId),
          gte(schema.orders.orderDate, start),
          lte(schema.orders.orderDate, end),
          notInArray(schema.orders.saleStatus, EXCLUDED_STATUSES)
        )
      );

    // Previous period for trend
    const [prev] = await db
      .select({
        totalRevenue: sql<string>`COALESCE(SUM(${schema.profitCalculations.revenueCents}), 0)`,
        totalProfit:  sql<string>`COALESCE(SUM(${schema.profitCalculations.netProfitCents}), 0)`,
      })
      .from(schema.profitCalculations)
      .innerJoin(schema.orders, eq(schema.profitCalculations.orderId, schema.orders.id))
      .where(
        and(
          eq(schema.profitCalculations.sellerId, sellerId),
          gte(schema.orders.orderDate, prevStart),
          lte(schema.orders.orderDate, prevEnd),
          notInArray(schema.orders.saleStatus, EXCLUDED_STATUSES)
        )
      );

    const totalRevenue = Number(current?.totalRevenue ?? 0);
    const totalProfit  = Number(current?.totalProfit ?? 0);
    const prevRevenue  = Number(prev?.totalRevenue ?? 0);
    const prevProfit   = Number(prev?.totalProfit ?? 0);

    const profitMarginPct =
      totalRevenue > 0
        ? Math.round((totalProfit / totalRevenue) * 10000) / 100
        : 0;

    const prevMarginPct =
      prevRevenue > 0
        ? Math.round((prevProfit / prevRevenue) * 10000) / 100
        : 0;

    return {
      period: { startDate: start.toISOString(), endDate: end.toISOString(), label: period },
      totalRevenueCents:  totalRevenue,
      totalFeesCents:     Number(current?.totalFees ?? 0),
      totalCogsCents:     Number(current?.totalCogs ?? 0),
      totalInboundCents:  Number(current?.totalInbound ?? 0),
      netProfitCents:     totalProfit,
      profitMarginPct,
      orderCount:         Number(current?.orderCount ?? 0),
      productCount:       Number(current?.productCount ?? 0),
      lossMakerCount:     Number(current?.lossMakerCount ?? 0),
      trends: {
        revenueDelta: calcDelta(totalRevenue, prevRevenue),
        profitDelta:  calcDelta(totalProfit, prevProfit),
        marginDelta:  Math.round((profitMarginPct - prevMarginPct) * 10) / 10,
      },
    };
  });

  // ---------------------------------------------------------------------------
  // GET /api/dashboard/products
  // ---------------------------------------------------------------------------
  server.get('/products', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const params = productsQuerySchema.parse(request.query);
    const { start, end } = getPeriodDates(params.period, params.startDate, params.endDate);
    const offset = (params.page - 1) * params.limit;

    const baseWhere = and(
      eq(schema.profitCalculations.sellerId, sellerId),
      gte(schema.orders.orderDate, start),
      lte(schema.orders.orderDate, end),
      notInArray(schema.orders.saleStatus, EXCLUDED_STATUSES)
    );

    // Dynamic sort expressions
    const sortExprMap = {
      margin_pct: sql`CASE WHEN SUM(${schema.profitCalculations.revenueCents}) > 0 THEN (SUM(${schema.profitCalculations.netProfitCents})::float / SUM(${schema.profitCalculations.revenueCents}) * 100) ELSE 0 END`,
      revenue:    sql`SUM(${schema.profitCalculations.revenueCents})`,
      profit:     sql`SUM(${schema.profitCalculations.netProfitCents})`,
      units_sold: sql`SUM(${schema.orders.quantity})`,
      fees:       sql`SUM(${schema.profitCalculations.totalFeesCents})`,
      last_sale:  sql`MAX(${schema.orders.orderDate})`,
    } as const;

    const sortExpr = sortExprMap[params.sort] ?? sortExprMap.margin_pct;
    const orderFn  = params.order === 'desc' ? desc : asc;

    const products = await db
      .select({
        offerId:          schema.profitCalculations.offerId,
        title:            sql<string>`COALESCE(${schema.offers.title}, MAX(${schema.orders.productTitle}))`,
        sku:              schema.offers.sku,
        category:         schema.offers.category,
        cogsSource:       schema.offers.cogsSource,
        unitsSold:        sql<string>`SUM(${schema.orders.quantity})`,
        revenueCents:     sql<string>`SUM(${schema.profitCalculations.revenueCents})`,
        totalFeesCents:   sql<string>`SUM(${schema.profitCalculations.totalFeesCents})`,
        cogsCents:        sql<string>`SUM(${schema.profitCalculations.cogsCents})`,
        inboundCostCents: sql<string>`SUM(${schema.profitCalculations.inboundCostCents})`,
        netProfitCents:   sql<string>`SUM(${schema.profitCalculations.netProfitCents})`,
        marginPct:        sql<number>`CASE WHEN SUM(${schema.profitCalculations.revenueCents}) > 0 THEN ROUND((SUM(${schema.profitCalculations.netProfitCents})::numeric / SUM(${schema.profitCalculations.revenueCents}) * 100), 2)::float ELSE 0 END`,
        cogsIsEstimated:  sql<boolean>`BOOL_OR(${schema.profitCalculations.cogsIsEstimated})`,
        orderCount:       sql<number>`COUNT(*)::int`,
        lastSaleDate:     sql<string>`MAX(${schema.orders.orderDate})`,
      })
      .from(schema.profitCalculations)
      .innerJoin(schema.orders, eq(schema.profitCalculations.orderId, schema.orders.id))
      .leftJoin(
        schema.offers,
        and(
          sql`${schema.offers.offerId} = ${schema.profitCalculations.offerId}`,
          eq(schema.offers.sellerId, sellerId)
        )
      )
      .where(baseWhere)
      .groupBy(
        schema.profitCalculations.offerId,
        schema.offers.title,
        schema.offers.sku,
        schema.offers.category,
        schema.offers.cogsSource
      )
      .orderBy(orderFn(sortExpr))
      .limit(params.limit)
      .offset(offset);

    const [countResult] = await db
      .select({
        total: sql<number>`COUNT(DISTINCT ${schema.profitCalculations.offerId})::int`,
      })
      .from(schema.profitCalculations)
      .innerJoin(schema.orders, eq(schema.profitCalculations.orderId, schema.orders.id))
      .where(baseWhere);

    return {
      data: products.map((p) => ({
        offerId:          p.offerId ?? 0,
        title:            p.title ?? 'Unknown Product',
        sku:              p.sku ?? null,
        category:         p.category ?? null,
        cogsSource:       p.cogsSource ?? 'estimate',
        unitsSold:        Number(p.unitsSold),
        revenueCents:     Number(p.revenueCents),
        totalFeesCents:   Number(p.totalFeesCents),
        cogsCents:        Number(p.cogsCents),
        inboundCostCents: Number(p.inboundCostCents),
        netProfitCents:   Number(p.netProfitCents),
        marginPct:        Number(p.marginPct),
        cogsIsEstimated:  Boolean(p.cogsIsEstimated),
        orderCount:       Number(p.orderCount),
        lastSaleDate:     p.lastSaleDate,
        marginStatus:     getMarginStatus(Number(p.marginPct)),
      })),
      pagination: {
        page:       params.page,
        pageSize:   params.limit,
        totalItems: Number(countResult?.total ?? 0),
        totalPages: Math.ceil(Number(countResult?.total ?? 0) / params.limit),
      },
    };
  });

  // ---------------------------------------------------------------------------
  // GET /api/dashboard/products/:offerId/fees — Fee waterfall
  // ---------------------------------------------------------------------------
  server.get<{ Params: { offerId: string } }>(
    '/products/:offerId/fees',
    { preHandler: [authenticate] },
    async (request) => {
      const { sellerId } = request.user as { sellerId: string };
      const offerIdNum = parseInt(request.params.offerId, 10);

      if (isNaN(offerIdNum)) {
        return { data: null, error: 'Invalid offerId' };
      }

      const [row] = await db
        .select({
          unitPriceCents:           schema.orders.unitPriceCents,
          sellingPriceCents:        schema.orders.sellingPriceCents,
          quantity:                 schema.orders.quantity,
          successFeeCents:          schema.calculatedFees.successFeeCents,
          fulfilmentFeeCents:       schema.calculatedFees.fulfilmentFeeCents,
          ibtPenaltyCents:          schema.calculatedFees.ibtPenaltyCents,
          storageFeeAllocatedCents: schema.calculatedFees.storageFeeAllocatedCents,
          totalFeeCents:            schema.calculatedFees.totalFeeCents,
          cogsCents:                schema.profitCalculations.cogsCents,
          inboundCostCents:         schema.profitCalculations.inboundCostCents,
          netProfitCents:           schema.profitCalculations.netProfitCents,
          revenueCents:             schema.profitCalculations.revenueCents,
          cogsIsEstimated:          schema.profitCalculations.cogsIsEstimated,
          isIbt:                    schema.orders.isIbt,
          orderDate:                schema.orders.orderDate,
          offerTitle:               schema.offers.title,
          offerCategory:            schema.offers.category,
          cogsSource:               schema.offers.cogsSource,
        })
        .from(schema.calculatedFees)
        .innerJoin(schema.orders, eq(schema.calculatedFees.orderId, schema.orders.id))
        .innerJoin(
          schema.profitCalculations,
          eq(schema.profitCalculations.orderId, schema.calculatedFees.orderId)
        )
        .leftJoin(
          schema.offers,
          and(eq(schema.offers.offerId, offerIdNum), eq(schema.offers.sellerId, sellerId))
        )
        .where(
          and(
            eq(schema.calculatedFees.sellerId, sellerId),
            eq(schema.orders.offerId, offerIdNum)
          )
        )
        .orderBy(desc(schema.orders.orderDate))
        .limit(1);

      if (!row) return { data: null };

      const qty = row.quantity ?? 1;
      const unitPrice = row.unitPriceCents ?? Math.round((row.sellingPriceCents ?? 0) / qty);
      const marginPct =
        row.revenueCents > 0
          ? Math.round((row.netProfitCents / row.revenueCents) * 10000) / 100
          : 0;

      return {
        data: {
          offerId:                  offerIdNum,
          title:                    row.offerTitle ?? null,
          category:                 row.offerCategory ?? null,
          cogsSource:               row.cogsSource ?? 'estimate',
          cogsIsEstimated:          row.cogsIsEstimated,
          isIbt:                    row.isIbt,
          orderDate:                row.orderDate,
          unitSellingPriceCents:    unitPrice,
          successFeeCents:          Number(row.successFeeCents ?? 0),
          fulfilmentFeeCents:       Number(row.fulfilmentFeeCents ?? 0),
          ibtPenaltyCents:          Number(row.ibtPenaltyCents ?? 0),
          storageFeeAllocatedCents: Number(row.storageFeeAllocatedCents ?? 0),
          totalFeeCents:            Number(row.totalFeeCents ?? 0),
          cogsCents:                Number(row.cogsCents ?? 0),
          inboundCostCents:         Number(row.inboundCostCents ?? 0),
          netProfitCents:           row.netProfitCents,
          revenueCents:             row.revenueCents,
          marginPct,
        },
      };
    }
  );

  // ---------------------------------------------------------------------------
  // GET /api/dashboard/fee-summary — Portfolio fee breakdown by type
  // ---------------------------------------------------------------------------
  server.get('/fee-summary', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const { period, startDate, endDate } = periodQuerySchema.parse(request.query);
    const { start, end } = getPeriodDates(period, startDate, endDate);

    const [totals] = await db
      .select({
        totalRevenue:       sql<string>`COALESCE(SUM(${schema.profitCalculations.revenueCents}), 0)`,
        totalSuccessFees:   sql<string>`COALESCE(SUM(${schema.calculatedFees.successFeeCents}), 0)`,
        totalFulfilmentFees: sql<string>`COALESCE(SUM(${schema.calculatedFees.fulfilmentFeeCents}), 0)`,
        totalIbtPenalties:  sql<string>`COALESCE(SUM(${schema.calculatedFees.ibtPenaltyCents}), 0)`,
        totalStorageFees:   sql<string>`COALESCE(SUM(${schema.calculatedFees.storageFeeAllocatedCents}), 0)`,
        totalFees:          sql<string>`COALESCE(SUM(${schema.calculatedFees.totalFeeCents}), 0)`,
      })
      .from(schema.profitCalculations)
      .innerJoin(schema.orders, eq(schema.profitCalculations.orderId, schema.orders.id))
      .innerJoin(schema.calculatedFees, eq(schema.calculatedFees.orderId, schema.orders.id))
      .where(
        and(
          eq(schema.profitCalculations.sellerId, sellerId),
          gte(schema.orders.orderDate, start),
          lte(schema.orders.orderDate, end),
          notInArray(schema.orders.saleStatus, EXCLUDED_STATUSES)
        )
      );

    const totalRevenue = Number(totals?.totalRevenue ?? 0);
    const pctOf = (cents: number) =>
      totalRevenue > 0 ? Math.round((cents / totalRevenue) * 10000) / 100 : 0;

    const feeBreakdown = [
      { feeType: 'success_fee', label: 'Success Fees',    totalCents: Number(totals?.totalSuccessFees ?? 0) },
      { feeType: 'fulfilment',  label: 'Fulfilment Fees', totalCents: Number(totals?.totalFulfilmentFees ?? 0) },
      { feeType: 'ibt_penalty', label: 'IBT Penalties',   totalCents: Number(totals?.totalIbtPenalties ?? 0) },
      { feeType: 'storage',     label: 'Storage Fees',    totalCents: Number(totals?.totalStorageFees ?? 0) },
    ].map((item) => ({
      ...item,
      pctOfRevenue: pctOf(item.totalCents),
    }));

    const totalFees = Number(totals?.totalFees ?? 0);

    return {
      period: { startDate: start.toISOString(), endDate: end.toISOString() },
      totalRevenueCents: totalRevenue,
      feeBreakdown,
      totalFeesCents: totalFees,
      totalFeesPctOfRevenue: pctOf(totalFees),
    };
  });
}
