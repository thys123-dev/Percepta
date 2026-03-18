/**
 * Sales Report Import Routes
 *
 * Endpoints for uploading Takealot sales report CSVs (from Seller Portal).
 * The CSV contains actual fees Takealot charged + actual ship dates, enabling:
 *   1. Fee auditing (calculated vs actual discrepancies)
 *   2. Accurate fee matrix version selection (ship date, not order date)
 *   3. Tracking of fees not available via API (Courier Collection Fee)
 *
 * Flow: Upload CSV text → parse → preview matches → commit (update orders + recalculate)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { authenticate } from '../../middleware/auth.js';
import { parseSalesReportCsv, type SalesReportRow } from './sales-report-parser.js';
import { calculateProfitsQueue } from '../sync/queues.js';

const salesReportImportSchema = z.object({
  mode: z.enum(['preview', 'commit']),
  csvText: z.string().min(1).max(10_000_000), // max ~10MB
  fileName: z.string().optional().default('sales_report.csv'),
});

export async function salesReportRoutes(server: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // POST /api/sales-report/import — Parse, preview, or commit a sales report CSV
  // ---------------------------------------------------------------------------
  server.post('/import', { preHandler: [authenticate] }, async (request, reply) => {
    const { sellerId } = request.user as { sellerId: string };
    const { mode, csvText, fileName } = salesReportImportSchema.parse(request.body);

    // 1. Parse the CSV
    const parseResult = parseSalesReportCsv(csvText);

    if (parseResult.rows.length === 0) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'No valid rows found in CSV',
        parseErrors: parseResult.errors.slice(0, 10),
      });
    }

    // 2. Find matching orders in our database by Order ID
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

    // Build lookup: orderId → order rows (may have multiple items per order)
    const orderMap = new Map<number, typeof existingOrders>();
    for (const order of existingOrders) {
      const existing = orderMap.get(order.orderId) ?? [];
      existing.push(order);
      orderMap.set(order.orderId, existing);
    }

    // 3. Match CSV rows to DB orders
    const matched: Array<{
      csvRow: SalesReportRow;
      dbOrderId: string;
      alreadyHasActuals: boolean;
    }> = [];
    const unmatched: SalesReportRow[] = [];

    for (const csvRow of parseResult.rows) {
      const dbOrders = orderMap.get(csvRow.orderId);
      if (dbOrders && dbOrders.length > 0) {
        // Match by SKU if multiple items exist for same order ID
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

    // ── Preview mode: show what would be updated ──
    if (mode === 'preview') {
      // Summary stats
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
        parsed: {
          totalRows: parseResult.rows.length,
          parseErrors: parseResult.errors.length,
        },
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
        // Show first 10 parse errors for debugging
        parseErrors: parseResult.errors.slice(0, 10),
        // Show first 5 unmatched for review
        unmatchedSample: unmatched.slice(0, 5).map((r) => ({
          orderId: r.orderId,
          productTitle: r.productTitle,
          orderDate: r.orderDate.toISOString(),
        })),
      };
    }

    // ── Commit mode: write actual fees + ship dates to orders ──

    // Create import record
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
      // Update orders in batches
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

      // Mark import as complete
      await db
        .update(schema.salesReportImports)
        .set({ updatedCount, status: 'complete' })
        .where(eq(schema.salesReportImports.id, importRecord!.id));

      // Queue profit recalculation with the now-available actual ship dates
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
      // Mark import as failed
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
  // GET /api/sales-report/imports — List previous imports
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
  // GET /api/sales-report/discrepancies — Fee audit discrepancies
  // ---------------------------------------------------------------------------
  server.get('/discrepancies', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    const querySchema = z.object({
      status: z.enum(['open', 'acknowledged', 'disputed', 'all']).optional().default('open'),
      limit: z.coerce.number().min(1).max(100).optional().default(50),
    });
    const params = querySchema.parse(request.query);

    const conditions: ReturnType<typeof eq>[] = [eq(schema.feeDiscrepancies.sellerId, sellerId)];
    if (params.status !== 'all') {
      conditions.push(eq(schema.feeDiscrepancies.status, params.status));
    }

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
        createdAt: schema.feeDiscrepancies.createdAt,
      })
      .from(schema.feeDiscrepancies)
      .where(and(...conditions))
      .orderBy(sql`ABS(${schema.feeDiscrepancies.discrepancyCents}) DESC`)
      .limit(params.limit);

    // Summary
    const summaryResult = await db
      .select({
        totalDiscrepancyCents: sql<number>`COALESCE(SUM(${schema.feeDiscrepancies.discrepancyCents}), 0)::int`,
        count: sql<number>`COUNT(*)::int`,
        overchargedCents: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.discrepancyCents} > 0 THEN ${schema.feeDiscrepancies.discrepancyCents} ELSE 0 END), 0)::int`,
        underchargedCents: sql<number>`COALESCE(SUM(CASE WHEN ${schema.feeDiscrepancies.discrepancyCents} < 0 THEN ABS(${schema.feeDiscrepancies.discrepancyCents}) ELSE 0 END), 0)::int`,
      })
      .from(schema.feeDiscrepancies)
      .where(and(...conditions));

    return {
      discrepancies,
      summary: summaryResult[0] ?? { totalDiscrepancyCents: 0, count: 0, overchargedCents: 0, underchargedCents: 0 },
    };
  });
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
