/**
 * Sales Report Import & Fee Audit Routes
 *
 * Endpoints for:
 *   1. CSV import (preview + commit)
 *   2. Enhanced discrepancy listing with product context
 *   3. Acknowledge/dispute workflow (single + bulk)
 *   4. Per-product aggregation
 *   5. Chart-ready data
 *   6. CSV export
 *   7. Dashboard audit summary
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { authenticate } from '../../middleware/auth.js';
import { parseSalesReportCsv, type SalesReportRow } from './sales-report-parser.js';
import { calculateProfitsQueue } from '../sync/queues.js';

// =============================================================================
// Validators
// =============================================================================

const salesReportImportSchema = z.object({
  mode: z.enum(['preview', 'commit']),
  csvText: z.string().min(1).max(10_000_000),
  fileName: z.string().optional().default('sales_report.csv'),
});

const discrepancyQuerySchema = z.object({
  status: z.enum(['open', 'acknowledged', 'disputed', 'all']).optional().default('all'),
  feeType: z.enum(['success_fee', 'fulfilment_fee', 'stock_transfer_fee', 'all']).optional().default('all'),
  sortBy: z.enum(['discrepancy', 'date', 'fee_type']).optional().default('discrepancy'),
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
});

const updateStatusSchema = z.object({
  status: z.enum(['acknowledged', 'disputed']),
  note: z.string().max(500).optional(),
});

const bulkUpdateStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  status: z.enum(['acknowledged', 'disputed']),
  note: z.string().max(500).optional(),
});

// =============================================================================
// Helpers
// =============================================================================

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

const FEE_TYPE_LABELS: Record<string, string> = {
  success_fee: 'Success Fee',
  fulfilment_fee: 'Fulfilment Fee',
  stock_transfer_fee: 'Stock Transfer Fee',
};

// =============================================================================
// Routes
// =============================================================================

export async function salesReportRoutes(server: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // POST /import — Parse, preview, or commit a sales report CSV
  // ---------------------------------------------------------------------------
  server.post('/import', { preHandler: [authenticate], bodyLimit: 10_485_760 }, async (request, reply) => {
    const { sellerId } = request.user as { sellerId: string };
    const { mode, csvText, fileName } = salesReportImportSchema.parse(request.body);

    const parseResult = parseSalesReportCsv(csvText);

    if (parseResult.rows.length === 0) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'No valid rows found in CSV',
        parseErrors: parseResult.errors.slice(0, 10),
      });
    }

    // Find matching orders by Order ID
    const csvOrderIds = [...new Set(parseResult.rows.map((r) => r.orderId))];

    const existingOrders = await db
      .select({
        id: schema.orders.id,
        orderId: schema.orders.orderId,
        orderItemId: schema.orders.orderItemId,
        productTitle: schema.orders.productTitle,
        sellingPriceCents: schema.orders.sellingPriceCents,
        dateShippedToCustomer: schema.orders.dateShippedToCustomer,
        actualSuccessFeeCents: schema.orders.actualSuccessFeeCents,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.sellerId, sellerId),
          inArray(schema.orders.orderId, csvOrderIds)
        )
      );

    const orderMap = new Map<number, typeof existingOrders>();
    for (const order of existingOrders) {
      const existing = orderMap.get(order.orderId) ?? [];
      existing.push(order);
      orderMap.set(order.orderId, existing);
    }

    const matched: Array<{
      csvRow: SalesReportRow;
      dbOrderId: string;
      alreadyHasActuals: boolean;
    }> = [];
    const unmatched: SalesReportRow[] = [];

    for (const csvRow of parseResult.rows) {
      const dbOrders = orderMap.get(csvRow.orderId);
      if (dbOrders && dbOrders.length > 0) {
        const bestMatch = dbOrders.length === 1
          ? dbOrders[0]!
          : dbOrders.find((o) => o.productTitle?.includes(csvRow.productTitle)) ?? dbOrders[0]!;

        matched.push({
          csvRow,
          dbOrderId: bestMatch.id,
          alreadyHasActuals: bestMatch.actualSuccessFeeCents != null,
        });
      } else {
        unmatched.push(csvRow);
      }
    }

    // ── Preview mode ──
    if (mode === 'preview') {
      const totalActualFees = matched.reduce(
        (acc, m) => ({
          successFee: acc.successFee + m.csvRow.successFeeCents,
          fulfilmentFee: acc.fulfilmentFee + m.csvRow.fulfilmentFeeCents,
          courierCollectionFee: acc.courierCollectionFee + m.csvRow.courierCollectionFeeCents,
          stockTransferFee: acc.stockTransferFee + m.csvRow.stockTransferFeeCents,
          grossSales: acc.grossSales + m.csvRow.grossSalesCents,
          netSales: acc.netSales + m.csvRow.netSalesAmountCents,
        }),
        { successFee: 0, fulfilmentFee: 0, courierCollectionFee: 0, stockTransferFee: 0, grossSales: 0, netSales: 0 }
      );

      return {
        mode: 'preview',
        parsed: { totalRows: parseResult.rows.length, parseErrors: parseResult.errors.length },
        matching: {
          matched: matched.length,
          unmatched: unmatched.length,
          alreadyImported: matched.filter((m) => m.alreadyHasActuals).length,
          newImports: matched.filter((m) => !m.alreadyHasActuals).length,
        },
        feeSummary: {
          totalSuccessFeeCents: totalActualFees.successFee,
          totalFulfilmentFeeCents: totalActualFees.fulfilmentFee,
          totalCourierCollectionFeeCents: totalActualFees.courierCollectionFee,
          totalStockTransferFeeCents: totalActualFees.stockTransferFee,
          totalGrossSalesCents: totalActualFees.grossSales,
          totalNetSalesCents: totalActualFees.netSales,
        },
        parseErrors: parseResult.errors.slice(0, 10),
        unmatchedSample: unmatched.slice(0, 5).map((r) => ({
          orderId: r.orderId,
          productTitle: r.productTitle,
          orderDate: r.orderDate.toISOString(),
        })),
      };
    }

    // ── Commit mode ──
    const [importRecord] = await db
      .insert(schema.salesReportImports)
      .values({
        sellerId,
        fileName,
        rowCount: parseResult.rows.length,
        matchedCount: matched.length,
        unmatchedCount: unmatched.length,
        status: 'processing',
      })
      .returning({ id: schema.salesReportImports.id });

    let updatedCount = 0;
    const updatedOrderIds: string[] = [];

    try {
      for (const { csvRow, dbOrderId } of matched) {
        await db
          .update(schema.orders)
          .set({
            dateShippedToCustomer: csvRow.dateShippedToCustomer,
            grossSalesCents: csvRow.grossSalesCents,
            actualSuccessFeeCents: csvRow.successFeeCents,
            actualFulfilmentFeeCents: csvRow.fulfilmentFeeCents,
            courierCollectionFeeCents: csvRow.courierCollectionFeeCents,
            actualStockTransferFeeCents: csvRow.stockTransferFeeCents,
            netSalesAmountCents: csvRow.netSalesAmountCents,
            dailyDealPromo: csvRow.dailyDealPromo || null,
            shipmentName: csvRow.shipmentName || null,
            poNumber: csvRow.poNumber || null,
            updatedAt: new Date(),
          })
          .where(eq(schema.orders.id, dbOrderId));

        updatedOrderIds.push(dbOrderId);
        updatedCount++;
      }

      await db
        .update(schema.salesReportImports)
        .set({ updatedCount, status: 'complete' })
        .where(eq(schema.salesReportImports.id, importRecord!.id));

      if (updatedOrderIds.length > 0) {
        const chunks = chunkArray(updatedOrderIds, 500);
        for (const chunk of chunks) {
          await calculateProfitsQueue.add('recalculate-after-csv-import', {
            sellerId,
            orderIds: chunk,
          });
        }
      }

      return {
        mode: 'commit',
        importId: importRecord!.id,
        updated: updatedCount,
        unmatched: unmatched.length,
        parseErrors: parseResult.errors.length,
        message: `Updated ${updatedCount} orders with actual fees. Profit recalculation queued.`,
      };
    } catch (err) {
      await db
        .update(schema.salesReportImports)
        .set({
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        })
        .where(eq(schema.salesReportImports.id, importRecord!.id));

      throw err;
    }
  });

  // ---------------------------------------------------------------------------
  // GET /imports — List previous imports
  // ---------------------------------------------------------------------------
  server.get('/imports', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    const imports = await db
      .select()
      .from(schema.salesReportImports)
      .where(eq(schema.salesReportImports.sellerId, sellerId))
      .orderBy(sql`${schema.salesReportImports.createdAt} DESC`)
      .limit(20);

    return { imports };
  });

  // ---------------------------------------------------------------------------
  // GET /discrepancies — Enhanced: product context, pagination, filters
  // ---------------------------------------------------------------------------
  server.get('/discrepancies', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const params = discrepancyQuerySchema.parse(request.query);
    const offset = (params.page - 1) * params.limit;

    const conditions: ReturnType<typeof eq>[] = [eq(schema.feeDiscrepancies.sellerId, sellerId)];
    if (params.status !== 'all') {
      conditions.push(eq(schema.feeDiscrepancies.status, params.status));
    }
    if (params.feeType !== 'all') {
      conditions.push(eq(schema.feeDiscrepancies.feeType, params.feeType));
    }

    const sortMap = {
      discrepancy: sql`ABS(${schema.feeDiscrepancies.discrepancyCents}) DESC`,
      date: sql`${schema.feeDiscrepancies.createdAt} DESC`,
      fee_type: sql`${schema.feeDiscrepancies.feeType} ASC`,
    };
    const orderExpr = sortMap[params.sortBy] ?? sortMap.discrepancy;

    // Joined query with product context
    const discrepancies = await db
      .select({
        id: schema.feeDiscrepancies.id,
        orderId: schema.feeDiscrepancies.orderId,
        feeType: schema.feeDiscrepancies.feeType,
        actualCents: schema.feeDiscrepancies.actualCents,
        calculatedCents: schema.feeDiscrepancies.calculatedCents,
        discrepancyCents: schema.feeDiscrepancies.discrepancyCents,
        discrepancyPct: schema.feeDiscrepancies.discrepancyPct,
        status: schema.feeDiscrepancies.status,
        resolvedNote: schema.feeDiscrepancies.resolvedNote,
        resolvedAt: schema.feeDiscrepancies.resolvedAt,
        createdAt: schema.feeDiscrepancies.createdAt,
        // Product context from orders
        productTitle: schema.orders.productTitle,
        sku: schema.orders.sku,
        orderIdNum: schema.orders.orderId,
        orderDate: schema.orders.orderDate,
        offerId: schema.orders.offerId,
      })
      .from(schema.feeDiscrepancies)
      .innerJoin(schema.orders, eq(schema.feeDiscrepancies.orderId, schema.orders.id))
      .where(and(...conditions))
      .orderBy(orderExpr)
      .limit(params.limit)
      .offset(offset);

    // Summary (across all matching, not just this page)
    const [summaryResult] = await db
      .select({
        totalDiscrepancyCents: sql<number>`COALESCE(SUM(${schema.feeDiscrepancies.discrepancyCents}), 0)::int`,
        count: sql<number>`COUNT(*)::int`,
        overchargedCents: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.discrepancyCents} > 0 THEN ${schema.feeDiscrepancies.discrepancyCents} ELSE 0 END), 0)::int`,
        underchargedCents: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.discrepancyCents} < 0 THEN ABS(${schema.feeDiscrepancies.discrepancyCents}) ELSE 0 END), 0)::int`,
        openCount: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.status} = 'open' THEN 1 ELSE 0 END), 0)::int`,
        acknowledgedCount: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.status} = 'acknowledged' THEN 1 ELSE 0 END), 0)::int`,
        disputedCount: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.status} = 'disputed' THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(schema.feeDiscrepancies)
      .where(and(...conditions));

    const totalCount = summaryResult?.count ?? 0;

    return {
      discrepancies,
      summary: summaryResult ?? {
        totalDiscrepancyCents: 0, count: 0, overchargedCents: 0, underchargedCents: 0,
        openCount: 0, acknowledgedCount: 0, disputedCount: 0,
      },
      pagination: {
        page: params.page,
        pageSize: params.limit,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / params.limit),
      },
    };
  });

  // ---------------------------------------------------------------------------
  // PATCH /discrepancies/:id/status — Acknowledge or dispute a single discrepancy
  // ---------------------------------------------------------------------------
  server.patch<{ Params: { id: string } }>(
    '/discrepancies/:id/status',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { sellerId } = request.user as { sellerId: string };
      const { id } = request.params;
      const { status, note } = updateStatusSchema.parse(request.body);

      const result = await db
        .update(schema.feeDiscrepancies)
        .set({
          status,
          resolvedNote: note ?? null,
          resolvedAt: new Date(),
        })
        .where(
          and(
            eq(schema.feeDiscrepancies.id, id),
            eq(schema.feeDiscrepancies.sellerId, sellerId)
          )
        )
        .returning({ id: schema.feeDiscrepancies.id });

      if (result.length === 0) {
        return reply.status(404).send({ error: 'Discrepancy not found' });
      }

      return { updated: result[0]!.id, status };
    }
  );

  // ---------------------------------------------------------------------------
  // PATCH /discrepancies/bulk-status — Bulk acknowledge or dispute (up to 100)
  // ---------------------------------------------------------------------------
  server.patch('/discrepancies/bulk-status', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const { ids, status, note } = bulkUpdateStatusSchema.parse(request.body);

    const result = await db
      .update(schema.feeDiscrepancies)
      .set({
        status,
        resolvedNote: note ?? null,
        resolvedAt: new Date(),
      })
      .where(
        and(
          inArray(schema.feeDiscrepancies.id, ids),
          eq(schema.feeDiscrepancies.sellerId, sellerId)
        )
      )
      .returning({ id: schema.feeDiscrepancies.id });

    return { updatedCount: result.length, status };
  });

  // ---------------------------------------------------------------------------
  // GET /discrepancies/by-product — Aggregate discrepancies grouped by product
  // ---------------------------------------------------------------------------
  server.get('/discrepancies/by-product', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    const products = await db
      .select({
        offerId: schema.orders.offerId,
        productTitle: sql<string>`MAX(${schema.orders.productTitle})`,
        sku: sql<string>`MAX(${schema.orders.sku})`,
        totalDiscrepancies: sql<number>`COUNT(*)::int`,
        openCount: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.status} = 'open' THEN 1 ELSE 0 END), 0)::int`,
        totalOverchargedCents: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.discrepancyCents} > 0 THEN ${schema.feeDiscrepancies.discrepancyCents} ELSE 0 END), 0)::int`,
        totalUnderchargedCents: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.discrepancyCents} < 0 THEN ABS(${schema.feeDiscrepancies.discrepancyCents}) ELSE 0 END), 0)::int`,
        netImpactCents: sql<number>`COALESCE(SUM(${schema.feeDiscrepancies.discrepancyCents}), 0)::int`,
        // discrepancyPct is decimal(7,2). ROUND(numeric, integer) is the only
        // overload Postgres ships, so we round the numeric *first* (an earlier
        // ::float cast on the input crashed the query with "round(double
        // precision, integer) does not exist"). Then cast to float so JSON
        // serializes it as a number — node-postgres returns numerics as
        // strings to preserve precision, which would break the frontend's
        // .toFixed() call.
        avgDiscrepancyPct: sql<number>`ROUND(AVG(ABS(${schema.feeDiscrepancies.discrepancyPct})), 1)::float`,
      })
      .from(schema.feeDiscrepancies)
      .innerJoin(schema.orders, eq(schema.feeDiscrepancies.orderId, schema.orders.id))
      .where(eq(schema.feeDiscrepancies.sellerId, sellerId))
      .groupBy(schema.orders.offerId)
      .orderBy(sql`ABS(SUM(${schema.feeDiscrepancies.discrepancyCents})) DESC`)
      .limit(50);

    return { products };
  });

  // ---------------------------------------------------------------------------
  // GET /discrepancies/chart-data — Chart-ready aggregations
  // ---------------------------------------------------------------------------
  server.get('/discrepancies/chart-data', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    // By fee type
    const byFeeType = await db
      .select({
        feeType: schema.feeDiscrepancies.feeType,
        count: sql<number>`COUNT(*)::int`,
        totalOverchargedCents: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.discrepancyCents} > 0 THEN ${schema.feeDiscrepancies.discrepancyCents} ELSE 0 END), 0)::int`,
        totalUnderchargedCents: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.discrepancyCents} < 0 THEN ABS(${schema.feeDiscrepancies.discrepancyCents}) ELSE 0 END), 0)::int`,
        netImpactCents: sql<number>`COALESCE(SUM(${schema.feeDiscrepancies.discrepancyCents}), 0)::int`,
      })
      .from(schema.feeDiscrepancies)
      .where(eq(schema.feeDiscrepancies.sellerId, sellerId))
      .groupBy(schema.feeDiscrepancies.feeType);

    // By week (last 12 weeks)
    const byWeek = await db
      .select({
        week: sql<string>`TO_CHAR(DATE_TRUNC('week', ${schema.feeDiscrepancies.createdAt}), 'YYYY-MM-DD')`,
        count: sql<number>`COUNT(*)::int`,
        overchargedCents: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.discrepancyCents} > 0 THEN ${schema.feeDiscrepancies.discrepancyCents} ELSE 0 END), 0)::int`,
        underchargedCents: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.discrepancyCents} < 0 THEN ABS(${schema.feeDiscrepancies.discrepancyCents}) ELSE 0 END), 0)::int`,
        netImpactCents: sql<number>`COALESCE(SUM(${schema.feeDiscrepancies.discrepancyCents}), 0)::int`,
      })
      .from(schema.feeDiscrepancies)
      .where(eq(schema.feeDiscrepancies.sellerId, sellerId))
      .groupBy(sql`DATE_TRUNC('week', ${schema.feeDiscrepancies.createdAt})`)
      .orderBy(sql`DATE_TRUNC('week', ${schema.feeDiscrepancies.createdAt}) ASC`)
      .limit(12);

    const byFeeTypeLabeled = byFeeType.map((row) => ({
      ...row,
      label: FEE_TYPE_LABELS[row.feeType] ?? row.feeType,
    }));

    return { byFeeType: byFeeTypeLabeled, byWeek };
  });

  // ---------------------------------------------------------------------------
  // GET /discrepancies/export — CSV download of discrepancies
  // ---------------------------------------------------------------------------
  server.get('/discrepancies/export', { preHandler: [authenticate] }, async (request, reply) => {
    const { sellerId } = request.user as { sellerId: string };

    const rows = await db
      .select({
        orderIdNum: schema.orders.orderId,
        productTitle: schema.orders.productTitle,
        sku: schema.orders.sku,
        orderDate: schema.orders.orderDate,
        feeType: schema.feeDiscrepancies.feeType,
        actualCents: schema.feeDiscrepancies.actualCents,
        calculatedCents: schema.feeDiscrepancies.calculatedCents,
        discrepancyCents: schema.feeDiscrepancies.discrepancyCents,
        discrepancyPct: schema.feeDiscrepancies.discrepancyPct,
        status: schema.feeDiscrepancies.status,
        resolvedNote: schema.feeDiscrepancies.resolvedNote,
        createdAt: schema.feeDiscrepancies.createdAt,
      })
      .from(schema.feeDiscrepancies)
      .innerJoin(schema.orders, eq(schema.feeDiscrepancies.orderId, schema.orders.id))
      .where(eq(schema.feeDiscrepancies.sellerId, sellerId))
      .orderBy(sql`ABS(${schema.feeDiscrepancies.discrepancyCents}) DESC`);

    const headers = [
      'Order ID', 'Product', 'SKU', 'Order Date', 'Fee Type',
      'Actual (R)', 'Calculated (R)', 'Difference (R)', '% Off', 'Status', 'Note', 'Detected On',
    ];

    const csvLines = [headers.join(',')];

    for (const row of rows) {
      const fmtCents = (c: number) => (c / 100).toFixed(2);
      const fmtDate = (d: Date | string | null) =>
        d ? new Date(d).toISOString().split('T')[0] : '';

      csvLines.push([
        row.orderIdNum,
        `"${(row.productTitle ?? '').replace(/"/g, '""')}"`,
        row.sku ?? '',
        fmtDate(row.orderDate),
        FEE_TYPE_LABELS[row.feeType] ?? row.feeType,
        fmtCents(row.actualCents),
        fmtCents(row.calculatedCents),
        fmtCents(row.discrepancyCents),
        `${parseFloat(String(row.discrepancyPct ?? '0')).toFixed(1)}%`,
        row.status,
        `"${(row.resolvedNote ?? '').replace(/"/g, '""')}"`,
        fmtDate(row.createdAt),
      ].join(','));
    }

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="fee_discrepancies.csv"');
    return csvLines.join('\n');
  });

  // ---------------------------------------------------------------------------
  // GET /audit-summary — Lightweight dashboard widget data
  // ---------------------------------------------------------------------------
  server.get('/audit-summary', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    const [summary] = await db
      .select({
        openCount: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.status} = 'open' THEN 1 ELSE 0 END), 0)::int`,
        totalOverchargedCents: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.discrepancyCents} > 0 AND ${schema.feeDiscrepancies.status} = 'open' THEN ${schema.feeDiscrepancies.discrepancyCents} ELSE 0 END), 0)::int`,
        totalUnderchargedCents: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.discrepancyCents} < 0 AND ${schema.feeDiscrepancies.status} = 'open' THEN ABS(${schema.feeDiscrepancies.discrepancyCents}) ELSE 0 END), 0)::int`,
        netImpactCents: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.status} = 'open' THEN ${schema.feeDiscrepancies.discrepancyCents} ELSE 0 END), 0)::int`,
        totalCount: sql<number>`COUNT(*)::int`,
      })
      .from(schema.feeDiscrepancies)
      .where(eq(schema.feeDiscrepancies.sellerId, sellerId));

    // Top overcharged product (open only)
    const topProducts = await db
      .select({
        productTitle: sql<string>`MAX(${schema.orders.productTitle})`,
        totalOverchargedCents: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.discrepancyCents} > 0 THEN ${schema.feeDiscrepancies.discrepancyCents} ELSE 0 END), 0)::int`,
      })
      .from(schema.feeDiscrepancies)
      .innerJoin(schema.orders, eq(schema.feeDiscrepancies.orderId, schema.orders.id))
      .where(
        and(
          eq(schema.feeDiscrepancies.sellerId, sellerId),
          eq(schema.feeDiscrepancies.status, 'open')
        )
      )
      .groupBy(schema.orders.offerId)
      .orderBy(sql`SUM(CASE WHEN ${schema.feeDiscrepancies.discrepancyCents} > 0 THEN ${schema.feeDiscrepancies.discrepancyCents} ELSE 0 END) DESC`)
      .limit(1);

    const topProduct = topProducts[0] ?? null;
    const hasDiscrepancies = (summary?.totalCount ?? 0) > 0;

    return {
      openCount: summary?.openCount ?? 0,
      totalOverchargedCents: summary?.totalOverchargedCents ?? 0,
      totalUnderchargedCents: summary?.totalUnderchargedCents ?? 0,
      netImpactCents: summary?.netImpactCents ?? 0,
      topOverchargedProduct: topProduct && topProduct.totalOverchargedCents > 0
        ? { name: topProduct.productTitle, overchargedCents: topProduct.totalOverchargedCents }
        : null,
      hasDiscrepancies,
    };
  });
}
