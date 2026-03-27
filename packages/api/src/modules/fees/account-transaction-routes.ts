/**
 * Account Transactions CSV Import Routes
 *
 * Endpoints for importing Takealot Account Transactions CSV, which provides
 * the complete financial ledger including reversals, stock losses, storage
 * fees, subscription fees, ad spend, removals, and disbursements.
 *
 * Follows the same preview/commit pattern as sales-report-routes.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { eq, and, inArray, sql, desc } from 'drizzle-orm';
import { authenticate } from '../../middleware/auth.js';
import {
  parseAccountTransactionsCsv,
  ORDER_LINKED_TYPES,
  REVERSAL_TYPES,
  NON_ORDER_COST_MAP,
} from './account-transaction-parser.js';
import { calculateProfitsQueue } from '../sync/queues.js';

// =============================================================================
// Validators
// =============================================================================

const importSchema = z.object({
  mode: z.enum(['preview', 'commit']),
  csvText: z.string().min(1).max(10_000_000),
  fileName: z.string().optional().default('account_transactions.csv'),
});

const summaryQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
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

/** Get first day of month for a given date. */
function monthStart(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

// =============================================================================
// Routes
// =============================================================================

export async function accountTransactionRoutes(server: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // POST /import — Parse, preview, or commit account transactions CSV
  // ---------------------------------------------------------------------------
  server.post('/import', { preHandler: [authenticate], bodyLimit: 10_485_760 }, async (request, reply) => {
    const { sellerId } = request.user as { sellerId: string };
    const { mode, csvText, fileName } = importSchema.parse(request.body);

    const parseResult = parseAccountTransactionsCsv(csvText);

    if (parseResult.rows.length === 0) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'No valid rows found in CSV',
        parseErrors: parseResult.errors.slice(0, 10),
      });
    }

    // Aggregate by transaction type
    const byType: Record<string, { count: number; totalInclVatCents: number }> = {};
    for (const row of parseResult.rows) {
      const entry = byType[row.transactionType] ?? { count: 0, totalInclVatCents: 0 };
      entry.count++;
      entry.totalInclVatCents += row.inclVatCents;
      byType[row.transactionType] = entry;
    }

    // Classify rows
    const orderLinkedRows = parseResult.rows.filter((r) => ORDER_LINKED_TYPES.has(r.transactionType));
    const nonOrderRows = parseResult.rows.filter((r) => NON_ORDER_COST_MAP[r.transactionType] !== undefined);
    const disbursementRows = parseResult.rows.filter((r) => r.transactionType === 'Disbursement');

    // Check for duplicates against existing transactions
    const transactionIds = parseResult.rows.map((r) => r.transactionId);
    const existingTxns = transactionIds.length > 0
      ? await db
          .select({ transactionId: schema.accountTransactions.transactionId })
          .from(schema.accountTransactions)
          .where(
            and(
              eq(schema.accountTransactions.sellerId, sellerId),
              inArray(schema.accountTransactions.transactionId, transactionIds)
            )
          )
      : [];
    const existingTxnIds = new Set(existingTxns.map((t) => t.transactionId));
    const duplicateCount = parseResult.rows.filter((r) => existingTxnIds.has(r.transactionId)).length;

    // Check order matches for order-linked rows
    const orderIds = [...new Set(
      orderLinkedRows.filter((r) => r.orderId != null).map((r) => r.orderId!)
    )];

    let matchedOrderCount = 0;
    if (orderIds.length > 0) {
      const matchedOrders = await db
        .select({ orderId: schema.orders.orderId })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.sellerId, sellerId),
            inArray(schema.orders.orderId, orderIds)
          )
        );
      matchedOrderCount = new Set(matchedOrders.map((o) => o.orderId)).size;
    }

    // Date range
    const dates = parseResult.rows.map((r) => r.transactionDate.getTime());
    const dateRange = dates.length > 0
      ? {
          earliest: new Date(Math.min(...dates)).toISOString(),
          latest: new Date(Math.max(...dates)).toISOString(),
        }
      : null;

    // ── Preview mode ──
    if (mode === 'preview') {
      return {
        mode: 'preview' as const,
        parsed: {
          totalRows: parseResult.rows.length,
          parseErrors: parseResult.errors.length,
        },
        byType,
        orderLinked: {
          count: orderLinkedRows.length,
          matchedToOrders: matchedOrderCount,
          unmatchedOrders: orderIds.length - matchedOrderCount,
        },
        nonOrder: {
          count: nonOrderRows.length,
          totalInclVatCents: nonOrderRows.reduce((s, r) => s + r.inclVatCents, 0),
        },
        disbursements: {
          count: disbursementRows.length,
          totalInclVatCents: disbursementRows.reduce((s, r) => s + r.inclVatCents, 0),
        },
        duplicateCount,
        parseErrors: parseResult.errors.slice(0, 10),
        dateRange,
      };
    }

    // ── Commit mode ──
    const minDate = dateRange ? new Date(dateRange.earliest) : null;
    const maxDate = dateRange ? new Date(dateRange.latest) : null;

    const [importRecord] = await db
      .insert(schema.accountTransactionImports)
      .values({
        sellerId,
        fileName,
        rowCount: parseResult.rows.length,
        status: 'processing',
        dateRangeStart: minDate,
        dateRangeEnd: maxDate,
      })
      .returning({ id: schema.accountTransactionImports.id });

    const importId = importRecord!.id;

    try {
      // 1. Batch-insert transactions (skip duplicates via ON CONFLICT DO NOTHING)
      let insertedCount = 0;
      const rowChunks = chunkArray(parseResult.rows, 500);

      for (const chunk of rowChunks) {
        const values = chunk.map((row) => ({
          sellerId,
          importId,
          transactionDate: row.transactionDate,
          transactionType: row.transactionType,
          transactionId: row.transactionId,
          description: row.description,
          referenceType: row.referenceType || null,
          reference: row.reference || null,
          orderId: row.orderId,
          exclVatCents: row.exclVatCents,
          vatCents: row.vatCents,
          inclVatCents: row.inclVatCents,
          balanceCents: row.balanceCents,
          sku: row.sku,
          productTitle: row.productTitle,
          disbursementCycle: row.disbursementCycle,
        }));

        const result = await db
          .insert(schema.accountTransactions)
          .values(values)
          .onConflictDoNothing({ target: [schema.accountTransactions.sellerId, schema.accountTransactions.transactionId] });

        insertedCount += (result as { rowCount?: number }).rowCount ?? 0;
      }

      // 2. Process reversals — update matching orders
      const reversalRows = parseResult.rows.filter(
        (r) => REVERSAL_TYPES.has(r.transactionType) && r.orderId != null
      );
      const reversalOrderIds = [...new Set(reversalRows.map((r) => r.orderId!))];
      let ordersUpdated = 0;

      if (reversalOrderIds.length > 0) {
        // Sum reversal amounts per order
        const reversalsByOrder = new Map<number, number>();
        for (const row of reversalRows) {
          if (row.transactionType === 'Customer Order Reversal') {
            // Customer Order Reversal is negative (money taken back)
            const current = reversalsByOrder.get(row.orderId!) ?? 0;
            reversalsByOrder.set(row.orderId!, current + Math.abs(row.inclVatCents));
          }
        }

        for (const [ordId, reversalCents] of reversalsByOrder) {
          const result = await db
            .update(schema.orders)
            .set({
              hasReversal: true,
              reversalAmountCents: reversalCents,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(schema.orders.sellerId, sellerId),
                eq(schema.orders.orderId, ordId)
              )
            );
          ordersUpdated += (result as { rowCount?: number }).rowCount ?? 0;
        }
      }

      // 3. Aggregate non-order costs into seller_costs
      const costAgg = new Map<string, { exclVat: number; vat: number; inclVat: number; count: number }>();
      for (const row of nonOrderRows) {
        if (existingTxnIds.has(row.transactionId)) continue; // skip duplicates
        const costType = NON_ORDER_COST_MAP[row.transactionType];
        if (!costType) continue;
        const month = monthStart(row.transactionDate);
        const key = `${month}|${costType}`;
        const entry = costAgg.get(key) ?? { exclVat: 0, vat: 0, inclVat: 0, count: 0 };
        entry.exclVat += row.exclVatCents;
        entry.vat += row.vatCents;
        entry.inclVat += row.inclVatCents;
        entry.count++;
        costAgg.set(key, entry);
      }

      for (const [key, agg] of costAgg) {
        const [month, costType] = key.split('|') as [string, string];
        await db
          .insert(schema.sellerCosts)
          .values({
            sellerId,
            month,
            costType,
            totalExclVatCents: agg.exclVat,
            totalVatCents: agg.vat,
            totalInclVatCents: agg.inclVat,
            transactionCount: agg.count,
          })
          .onConflictDoUpdate({
            target: [schema.sellerCosts.sellerId, schema.sellerCosts.month, schema.sellerCosts.costType],
            set: {
              totalExclVatCents: sql`${schema.sellerCosts.totalExclVatCents} + ${agg.exclVat}`,
              totalVatCents: sql`${schema.sellerCosts.totalVatCents} + ${agg.vat}`,
              totalInclVatCents: sql`${schema.sellerCosts.totalInclVatCents} + ${agg.inclVat}`,
              transactionCount: sql`${schema.sellerCosts.transactionCount} + ${agg.count}`,
              updatedAt: new Date(),
            },
          });
      }

      // 4. Queue profit recalculation for orders with reversals
      if (reversalOrderIds.length > 0) {
        const affectedOrders = await db
          .select({ id: schema.orders.id })
          .from(schema.orders)
          .where(
            and(
              eq(schema.orders.sellerId, sellerId),
              inArray(schema.orders.orderId, reversalOrderIds)
            )
          );

        const orderUuids = affectedOrders.map((o) => o.id);
        const chunks = chunkArray(orderUuids, 500);
        for (const chunk of chunks) {
          await calculateProfitsQueue.add('recalculate-after-acct-txn-import', {
            sellerId,
            orderIds: chunk,
          });
        }
      }

      // 5. Update import record
      const actualDuplicates = parseResult.rows.length - insertedCount;
      await db
        .update(schema.accountTransactionImports)
        .set({
          status: 'complete',
          insertedCount,
          duplicateCount: actualDuplicates,
          ordersUpdated,
        })
        .where(eq(schema.accountTransactionImports.id, importId));

      return {
        mode: 'commit' as const,
        importId,
        inserted: insertedCount,
        duplicatesSkipped: actualDuplicates,
        ordersUpdated,
        message: `Imported ${insertedCount} transactions. ${ordersUpdated} orders updated with reversal data.`,
      };
    } catch (err) {
      // Mark import as failed
      await db
        .update(schema.accountTransactionImports)
        .set({
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        })
        .where(eq(schema.accountTransactionImports.id, importId));

      throw err;
    }
  });

  // ---------------------------------------------------------------------------
  // GET /imports — List past account transaction imports
  // ---------------------------------------------------------------------------
  server.get('/imports', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    const imports = await db
      .select()
      .from(schema.accountTransactionImports)
      .where(eq(schema.accountTransactionImports.sellerId, sellerId))
      .orderBy(desc(schema.accountTransactionImports.createdAt))
      .limit(20);

    return { imports };
  });

  // ---------------------------------------------------------------------------
  // GET /summary — Aggregate transactions by type for a date range
  // ---------------------------------------------------------------------------
  server.get('/summary', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const { startDate, endDate } = summaryQuerySchema.parse(request.query);

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const results = await db
      .select({
        transactionType: schema.accountTransactions.transactionType,
        count: sql<number>`COUNT(*)`.as('count'),
        totalExclVatCents: sql<number>`SUM(${schema.accountTransactions.exclVatCents})`.as('total_excl'),
        totalVatCents: sql<number>`SUM(${schema.accountTransactions.vatCents})`.as('total_vat'),
        totalInclVatCents: sql<number>`SUM(${schema.accountTransactions.inclVatCents})`.as('total_incl'),
      })
      .from(schema.accountTransactions)
      .where(
        and(
          eq(schema.accountTransactions.sellerId, sellerId),
          sql`${schema.accountTransactions.transactionDate} >= ${start}`,
          sql`${schema.accountTransactions.transactionDate} <= ${end}`
        )
      )
      .groupBy(schema.accountTransactions.transactionType)
      .orderBy(schema.accountTransactions.transactionType);

    // Also fetch seller_costs for the period
    const costs = await db
      .select()
      .from(schema.sellerCosts)
      .where(
        and(
          eq(schema.sellerCosts.sellerId, sellerId),
          sql`${schema.sellerCosts.month} >= ${start.toISOString().slice(0, 10)}`,
          sql`${schema.sellerCosts.month} <= ${end.toISOString().slice(0, 10)}`
        )
      );

    return { byType: results, costs, dateRange: { start: start.toISOString(), end: end.toISOString() } };
  });
}
