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
import { cacheGet, cacheSet } from '../sync/redis.js';

const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

// =============================================================================
// Constants
// =============================================================================

const EXCLUDED_STATUSES = ['Returned', 'Return Requested', 'Cancelled'];

// =============================================================================
// Validators
// =============================================================================

const periodBaseSchema = z.object({
  period: z.enum(['7d', '30d', '90d', 'custom']).default('30d'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const periodQuerySchema = periodBaseSchema.superRefine((val, ctx) => {
  if (val.period === 'custom' && !val.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'startDate is required when period is "custom"',
      path: ['startDate'],
    });
  }
});

const productsQuerySchema = periodBaseSchema.extend({
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
    // Should never reach here — Zod schema requires startDate for custom period.
    throw new Error(`Invalid period "${period}": startDate is required for custom ranges`);
  }

  return { start, end };
}

/**
 * Period-over-period delta. Returns null when the previous-period base is
 * too small to make the comparison meaningful — first-time sellers see
 * "+12,413%" otherwise, which the UI now renders as "Building baseline"
 * instead.
 *
 * The "unreliable" rule combines two conditions so a genuine 5× growth on
 * a stable base still shows correctly:
 *   - previous-period base is < 10% of current-period base, AND
 *   - the % change exceeds 200%
 * Either condition alone is fine; only their combination signals a low-base
 * artifact.
 */
function calcDelta(current: number, previous: number): number | null {
  if (previous === 0) {
    // Can't divide; treat as unreliable when current is non-trivially populated.
    return current === 0 ? 0 : null;
  }
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
  const baseShare = Math.abs(previous) / Math.max(Math.abs(current), 1);
  if (baseShare < 0.1 && Math.abs(pct) > 200) return null;
  return pct;
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

    const cacheKey = `dashboard:${sellerId}:summary:${period}:${start.toISOString()}:${end.toISOString()}`;
    const cached = await cacheGet(cacheKey);
    if (cached !== null) return cached;

    // Previous period (same duration) for trend comparison
    const durationMs = end.getTime() - start.getTime();
    const prevEnd   = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs);

    // Run current + previous period queries in parallel
    const [currentRows, prevRows] = await Promise.all([
      db
        .select({
          totalRevenue:   sql<string>`COALESCE(SUM(${schema.profitCalculations.revenueCents}), 0)`,
          totalFees:      sql<string>`COALESCE(SUM(${schema.profitCalculations.totalFeesCents}), 0)`,
          totalCogs:      sql<string>`COALESCE(SUM(${schema.profitCalculations.cogsCents}), 0)`,
          totalInbound:   sql<string>`COALESCE(SUM(${schema.profitCalculations.inboundCostCents}), 0)`,
          totalProfit:    sql<string>`COALESCE(SUM(${schema.profitCalculations.netProfitCents}), 0)`,
          orderCount:     sql<number>`COUNT(*)::int`,
          productCount:   sql<number>`COUNT(DISTINCT ${schema.profitCalculations.offerId})::int`,
          lossMakerCount: sql<number>`(
            SELECT COUNT(*)::int
            FROM (
              SELECT pc2.offer_id
              FROM profit_calculations pc2
              INNER JOIN orders o2 ON pc2.order_id = o2.id
              WHERE pc2.seller_id = ${sellerId}
                AND o2.order_date >= ${start}
                AND o2.order_date <= ${end}
                AND o2.sale_status NOT IN (${sql.join(EXCLUDED_STATUSES.map(s => sql`${s}`), sql`, `)})
                AND pc2.offer_id IS NOT NULL
              GROUP BY pc2.offer_id
              HAVING SUM(pc2.net_profit_cents) < 0
            ) loss_makers
          )`,
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
        ),
      db
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
        ),
    ]);

    const [current] = currentRows;
    const [prev] = prevRows;

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

    // Check if seller has imported account transactions (reconciled data)
    const [acctImportCheck] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schema.accountTransactionImports)
      .where(
        and(
          eq(schema.accountTransactionImports.sellerId, sellerId),
          eq(schema.accountTransactionImports.status, 'complete')
        )
      );
    const reconciled = (acctImportCheck?.count ?? 0) > 0;

    // Fetch overhead costs from seller_costs for the period
    let overheadCosts: Array<{ costType: string; totalInclVatCents: number; transactionCount: number }> = [];
    if (reconciled) {
      const costs = await db
        .select({
          costType:           schema.sellerCosts.costType,
          totalInclVatCents:  sql<string>`SUM(${schema.sellerCosts.totalInclVatCents})`,
          transactionCount:   sql<string>`SUM(${schema.sellerCosts.transactionCount})`,
        })
        .from(schema.sellerCosts)
        .where(
          and(
            eq(schema.sellerCosts.sellerId, sellerId),
            gte(schema.sellerCosts.month, start.toISOString().slice(0, 10)),
            lte(schema.sellerCosts.month, end.toISOString().slice(0, 10))
          )
        )
        .groupBy(schema.sellerCosts.costType);

      overheadCosts = costs.map((c) => ({
        costType:          c.costType,
        totalInclVatCents: Number(c.totalInclVatCents ?? 0),
        transactionCount:  Number(c.transactionCount ?? 0),
      }));
    }

    const totalOverheadCents = overheadCosts.reduce((sum, c) => sum + c.totalInclVatCents, 0);

    const result = {
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
      reconciled,
      overheadCosts,
      totalOverheadCents,
      trends: {
        revenueDelta: calcDelta(totalRevenue, prevRevenue),
        profitDelta:  calcDelta(totalProfit, prevProfit),
        marginDelta:  Math.round((profitMarginPct - prevMarginPct) * 10) / 10,
      },
    };

    cacheSet(cacheKey, result, CACHE_TTL_SECONDS).catch(() => {});
    return result;
  });

  // ---------------------------------------------------------------------------
  // GET /api/dashboard/products
  // ---------------------------------------------------------------------------
  server.get('/products', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const params = productsQuerySchema.parse(request.query);
    const { start, end } = getPeriodDates(params.period, params.startDate, params.endDate);
    const offset = (params.page - 1) * params.limit;

    const cacheKey = `dashboard:${sellerId}:products:${params.period}:${start.toISOString()}:${end.toISOString()}:${params.sort}:${params.order}:${params.page}:${params.limit}`;
    const cached = await cacheGet(cacheKey);
    if (cached !== null) return cached;

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

    const sortKey = params.sort as keyof typeof sortExprMap;
    const sortExpr = sortExprMap[sortKey] ?? sortExprMap.margin_pct;
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

    const result = {
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

    cacheSet(cacheKey, result, CACHE_TTL_SECONDS).catch(() => {});
    return result;
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

      // All fee/cost/profit values stored in DB are order totals (per-unit × qty).
      // Divide back to per-unit so the waterfall display is consistent with the
      // unit selling price shown at the start of the breakdown.
      const perUnit = (total: number) => Math.round(total / qty);

      const unitSuccessFeeCents          = perUnit(Number(row.successFeeCents ?? 0));
      const unitFulfilmentFeeCents       = perUnit(Number(row.fulfilmentFeeCents ?? 0));
      const unitIbtPenaltyCents          = perUnit(Number(row.ibtPenaltyCents ?? 0));
      const unitStorageFeeAllocatedCents = perUnit(Number(row.storageFeeAllocatedCents ?? 0));
      const unitTotalFeeCents            = perUnit(Number(row.totalFeeCents ?? 0));   // incl. VAT
      const unitCogsCents                = perUnit(Number(row.cogsCents ?? 0));
      const unitInboundCostCents         = perUnit(Number(row.inboundCostCents ?? 0));
      const unitNetProfitCents           = perUnit(row.netProfitCents);
      const unitRevenueCents             = unitPrice; // revenue per unit = unit price

      // Individual fee columns are stored excl. VAT; totalFeeCents is incl. VAT.
      // The difference is the VAT component — show it explicitly so the waterfall balances.
      const unitFeesExclVatCents = unitSuccessFeeCents + unitFulfilmentFeeCents + unitIbtPenaltyCents + unitStorageFeeAllocatedCents;
      const unitVatOnFeesCents   = unitTotalFeeCents - unitFeesExclVatCents;

      const marginPct =
        unitRevenueCents > 0
          ? Math.round((unitNetProfitCents / unitRevenueCents) * 10000) / 100
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
          quantity:                 qty,
          unitSellingPriceCents:    unitPrice,
          successFeeCents:          unitSuccessFeeCents,
          fulfilmentFeeCents:       unitFulfilmentFeeCents,
          ibtPenaltyCents:          unitIbtPenaltyCents,
          storageFeeAllocatedCents: unitStorageFeeAllocatedCents,
          vatOnFeesCents:           unitVatOnFeesCents,
          totalFeeCents:            unitTotalFeeCents,
          cogsCents:                unitCogsCents,
          inboundCostCents:         unitInboundCostCents,
          netProfitCents:           unitNetProfitCents,
          revenueCents:             unitRevenueCents,
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

    const cacheKey = `dashboard:${sellerId}:fee-summary:${period}:${start.toISOString()}:${end.toISOString()}`;
    const cached = await cacheGet(cacheKey);
    if (cached !== null) return cached;

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

    const result = {
      period: { startDate: start.toISOString(), endDate: end.toISOString() },
      totalRevenueCents: totalRevenue,
      feeBreakdown,
      totalFeesCents: totalFees,
      totalFeesPctOfRevenue: pctOf(totalFees),
    };

    cacheSet(cacheKey, result, CACHE_TTL_SECONDS).catch(() => {});
    return result;
  });
}
