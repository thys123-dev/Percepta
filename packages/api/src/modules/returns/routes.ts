/**
 * Takealot Returns Export Import Routes
 *
 * Endpoints for importing the Takealot Returns Export (XLSX). This is the
 * only source for return reasons, customer comments, stock outcomes, and
 * removal-order tracking — none of which are available via the Takealot API.
 *
 * Follows the same preview/commit pattern as Account Transactions, but accepts
 * a base64-encoded XLSX in the JSON body (no multipart middleware required).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { eq, and, inArray, sql, desc } from 'drizzle-orm';
import { authenticate } from '../../middleware/auth.js';
import {
  parseTakealotReturnsXlsx,
  aggregateByReason,
  aggregateByStockOutcome,
  type TakealotReturnRow,
} from './xlsx-parser.js';
import { calculateProfitsQueue } from '../sync/queues.js';

// =============================================================================
// Validators
// =============================================================================

const importSchema = z.object({
  mode: z.enum(['preview', 'commit']),
  // Base64 inflates ~33%; cap at 15MB to comfortably accept ~10MB raw XLSX.
  fileBase64: z.string().min(1).max(15_000_000),
  fileName: z.string().optional().default('takealot_returns.xlsx'),
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

// =============================================================================
// Routes
// =============================================================================

export async function returnsRoutes(server: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // POST /import — Parse, preview, or commit Takealot Returns XLSX
  // ---------------------------------------------------------------------------
  server.post(
    '/import',
    { preHandler: [authenticate], bodyLimit: 10_485_760 },
    async (request, reply) => {
      const { sellerId } = request.user as { sellerId: string };
      const { mode, fileBase64, fileName } = importSchema.parse(request.body);

      let buffer: Buffer;
      try {
        buffer = Buffer.from(fileBase64, 'base64');
      } catch {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'fileBase64 is not valid base64',
        });
      }

      const parseResult = await parseTakealotReturnsXlsx(buffer);

      if (parseResult.rows.length === 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'No valid return rows found in XLSX',
          parseErrors: parseResult.errors.slice(0, 10),
        });
      }

      // ── Aggregate previews ──
      const byReason = aggregateByReason(parseResult.rows);
      const byStockOutcome = aggregateByStockOutcome(parseResult.rows);

      // ── Duplicate detection by RRN ──
      const rrns = parseResult.rows.map((r) => r.rrn);
      const existing = await db
        .select({ rrn: schema.takealotReturns.rrn })
        .from(schema.takealotReturns)
        .where(
          and(
            eq(schema.takealotReturns.sellerId, sellerId),
            inArray(schema.takealotReturns.rrn, rrns)
          )
        );
      const existingRrns = new Set(existing.map((e) => e.rrn));
      const duplicateCount = parseResult.rows.filter((r) => existingRrns.has(r.rrn)).length;

      // ── Order match counts ──
      const orderIds = [
        ...new Set(
          parseResult.rows.filter((r) => r.orderId != null).map((r) => r.orderId!)
        ),
      ];
      let matchedOrderCount = 0;
      if (orderIds.length > 0) {
        const matched = await db
          .select({ orderId: schema.orders.orderId })
          .from(schema.orders)
          .where(
            and(
              eq(schema.orders.sellerId, sellerId),
              inArray(schema.orders.orderId, orderIds)
            )
          );
        matchedOrderCount = new Set(matched.map((m) => m.orderId)).size;
      }

      // ── Date range ──
      const dates = parseResult.rows.map((r) => r.returnDate.getTime());
      const dateRange =
        dates.length > 0
          ? {
              earliest: new Date(Math.min(...dates)).toISOString(),
              latest: new Date(Math.max(...dates)).toISOString(),
            }
          : null;

      // ── Total reversal $ across the file ──
      const totalReversalCents = parseResult.rows.reduce(
        (s, r) => s + Math.abs(r.customerOrderReversalCents ?? 0),
        0
      );

      // ── Preview mode ──
      if (mode === 'preview') {
        return {
          mode: 'preview' as const,
          parsed: {
            totalRows: parseResult.rows.length,
            parseErrors: parseResult.errors.length,
          },
          byReason,
          byStockOutcome,
          orderLinked: {
            count: parseResult.rows.filter((r) => r.orderId != null).length,
            matchedToOrders: matchedOrderCount,
            unmatchedOrders: orderIds.length - matchedOrderCount,
          },
          duplicateCount,
          totalReversalCents,
          parseErrors: parseResult.errors.slice(0, 10),
          dateRange,
        };
      }

      // ── Commit mode ──
      const minDate = dateRange ? new Date(dateRange.earliest) : null;
      const maxDate = dateRange ? new Date(dateRange.latest) : null;

      const [importRecord] = await db
        .insert(schema.takealotReturnImports)
        .values({
          sellerId,
          fileName,
          rowCount: parseResult.rows.length,
          status: 'processing',
          dateRangeStart: minDate,
          dateRangeEnd: maxDate,
        })
        .returning({ id: schema.takealotReturnImports.id });

      const importId = importRecord!.id;

      try {
        // 1. Batch-insert returns. Skip duplicates via ON CONFLICT (seller_id, rrn).
        let insertedCount = 0;
        for (const chunk of chunkArray(parseResult.rows, 500)) {
          const values = chunk.map((row) => ({
            sellerId,
            importId,
            rrn: row.rrn,
            orderId: row.orderId,
            returnDate: row.returnDate,
            productTitle: row.productTitle,
            sku: row.sku,
            tsin: row.tsin,
            returnReason: row.returnReason,
            customerComment: row.customerComment,
            quantity: row.quantity,
            region: row.region,
            stockOutcome: row.stockOutcome,
            sellerNote: row.sellerNote,
            customerOrderReversalCents: row.customerOrderReversalCents,
            successFeeReversalCents: row.successFeeReversalCents,
            fulfillmentFeeReversalCents: row.fulfillmentFeeReversalCents,
            courierFeeReversalCents: row.courierFeeReversalCents,
            removalOrderNumber: row.removalOrderNumber,
            dateReadyToCollect: row.dateReadyToCollect,
            dateAddedToStock: row.dateAddedToStock,
            rawRow: row.rawRow,
          }));

          const result = await db
            .insert(schema.takealotReturns)
            .values(values)
            .onConflictDoNothing({
              target: [schema.takealotReturns.sellerId, schema.takealotReturns.rrn],
            });
          insertedCount += (result as { rowCount?: number }).rowCount ?? 0;
        }

        // 2. Defensively flip orders.hasReversal=true and fill reversalAmountCents
        //    only when currently NULL — Account Transactions stays the source of
        //    truth. We track which orders actually had reversalAmountCents written
        //    so we only enqueue profit recalc for those.
        //
        //    Sum customer-order-reversal $ per order across this file (the seller
        //    portal occasionally splits a single order across multiple RRNs).
        const reversalSumByOrder = new Map<number, number>();
        for (const row of parseResult.rows) {
          if (row.orderId == null) continue;
          const cents = Math.abs(row.customerOrderReversalCents ?? 0);
          if (cents === 0) continue;
          reversalSumByOrder.set(
            row.orderId,
            (reversalSumByOrder.get(row.orderId) ?? 0) + cents
          );
        }

        const ordersWithReversalChanged: number[] = [];
        let ordersUpdated = 0;
        for (const [ordId, cents] of reversalSumByOrder) {
          // hasReversal flips false → true; reversalAmountCents fills only if NULL.
          const result = await db.execute(sql`
            UPDATE orders
            SET
              has_reversal = TRUE,
              reversal_amount_cents = COALESCE(reversal_amount_cents, ${cents}),
              updated_at = NOW()
            WHERE seller_id = ${sellerId}
              AND order_id = ${ordId}
              AND (
                has_reversal IS DISTINCT FROM TRUE
                OR reversal_amount_cents IS NULL
              )
            RETURNING id, reversal_amount_cents
          `);

          const updatedRows = ((result as unknown) as {
            rows?: Array<{ id: string; reversal_amount_cents: number | null }>;
          }).rows ?? [];
          if (updatedRows.length > 0) {
            ordersUpdated++;
            // If reversalAmountCents went from null → cents, profit must be recalculated.
            for (const r of updatedRows) {
              if (r.reversal_amount_cents === cents) {
                ordersWithReversalChanged.push(ordId);
              }
            }
          }
        }

        // 3. Queue profit recalc only for orders whose reversal $ actually changed.
        if (ordersWithReversalChanged.length > 0) {
          const affectedOrders = await db
            .select({ id: schema.orders.id })
            .from(schema.orders)
            .where(
              and(
                eq(schema.orders.sellerId, sellerId),
                inArray(schema.orders.orderId, ordersWithReversalChanged)
              )
            );

          for (const chunk of chunkArray(affectedOrders.map((o) => o.id), 500)) {
            await calculateProfitsQueue.add('recalculate-after-returns-import', {
              sellerId,
              orderIds: chunk,
            });
          }
        }

        // 4. Update import record
        const actualDuplicates = parseResult.rows.length - insertedCount;
        await db
          .update(schema.takealotReturnImports)
          .set({
            status: 'complete',
            insertedCount,
            duplicateCount: actualDuplicates,
            ordersUpdated,
          })
          .where(eq(schema.takealotReturnImports.id, importId));

        return {
          mode: 'commit' as const,
          importId,
          inserted: insertedCount,
          duplicatesSkipped: actualDuplicates,
          ordersUpdated,
          message: `Imported ${insertedCount} returns. ${ordersUpdated} orders flagged with reversal data.`,
        };
      } catch (err) {
        await db
          .update(schema.takealotReturnImports)
          .set({
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : 'Unknown error',
          })
          .where(eq(schema.takealotReturnImports.id, importId));
        throw err;
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET /imports — List past Takealot Returns imports
  // ---------------------------------------------------------------------------
  server.get('/imports', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    const imports = await db
      .select()
      .from(schema.takealotReturnImports)
      .where(eq(schema.takealotReturnImports.sellerId, sellerId))
      .orderBy(desc(schema.takealotReturnImports.createdAt))
      .limit(20);

    return { imports };
  });
}

// Re-export for tests
export type { TakealotReturnRow };
