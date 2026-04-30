/**
 * Product Details CSV Import Routes
 *
 * Backfills the offer columns we can't get from the Takealot API:
 * category, brand, dimensions, and Takealot's published per-product
 * success-fee rate / fulfilment fee. Without these, the success-fee
 * calculator falls back to a 12% default that's wrong for most products,
 * which generates thousands of bogus fee discrepancies.
 *
 * Two-phase preview/commit pattern, mirroring the other importers.
 */

import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { authenticate } from '../../middleware/auth.js';
import { calculateProfitsQueue } from '../sync/queues.js';
import { parseProductDetailsCsv } from './details-parser.js';

const importSchema = z.object({
  mode: z.enum(['preview', 'commit']),
  csvText: z.string().min(1).max(10_000_000),
  fileName: z.string().optional().default('product_details.csv'),
});

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export async function productDetailsRoutes(server: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // POST /import — Preview or commit Product Details CSV
  // ---------------------------------------------------------------------------
  server.post(
    '/details/import',
    { preHandler: [authenticate], bodyLimit: 10_485_760 },
    async (request, reply) => {
      const { sellerId } = request.user as { sellerId: string };
      const { mode, csvText, fileName } = importSchema.parse(request.body);

      const parseResult = parseProductDetailsCsv(csvText);

      if (parseResult.rows.length === 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'No valid rows found in CSV',
          parseErrors: parseResult.errors.slice(0, 10),
        });
      }

      // Build the lookup keys: TSIN preferred, SKU fallback.
      const tsins = [...new Set(parseResult.rows.map((r) => r.tsin).filter((v): v is number => v != null))];
      const skus = [...new Set(parseResult.rows.map((r) => r.sku).filter((v): v is string => v != null))];

      // Fetch matching offers in two queries (one per key type).
      const [byTsin, bySku] = await Promise.all([
        tsins.length > 0
          ? db
              .select({
                offerId: schema.offers.offerId,
                tsin: schema.offers.tsin,
                sku: schema.offers.sku,
              })
              .from(schema.offers)
              .where(
                and(
                  eq(schema.offers.sellerId, sellerId),
                  inArray(schema.offers.tsin, tsins)
                )
              )
          : Promise.resolve([] as { offerId: number; tsin: number | null; sku: string | null }[]),
        skus.length > 0
          ? db
              .select({
                offerId: schema.offers.offerId,
                tsin: schema.offers.tsin,
                sku: schema.offers.sku,
              })
              .from(schema.offers)
              .where(
                and(
                  eq(schema.offers.sellerId, sellerId),
                  inArray(schema.offers.sku, skus)
                )
              )
          : Promise.resolve([] as { offerId: number; tsin: number | null; sku: string | null }[]),
      ]);

      const tsinMap = new Map<number, number>();
      for (const o of byTsin) if (o.tsin != null) tsinMap.set(o.tsin, o.offerId);
      const skuMap = new Map<string, number>();
      for (const o of bySku) if (o.sku) skuMap.set(o.sku, o.offerId);

      const resolveOfferId = (row: { tsin: number | null; sku: string | null }): number | null => {
        if (row.tsin != null) {
          const id = tsinMap.get(row.tsin);
          if (id !== undefined) return id;
        }
        if (row.sku) {
          const id = skuMap.get(row.sku);
          if (id !== undefined) return id;
        }
        return null;
      };

      const matchedRows = parseResult.rows
        .map((row) => ({ row, offerId: resolveOfferId(row) }))
        .filter((m): m is { row: typeof m.row; offerId: number } => m.offerId != null);
      const unmatchedRows = parseResult.rows.filter((r) => resolveOfferId(r) == null);

      // ── Preview ──
      if (mode === 'preview') {
        const withCategory = matchedRows.filter((m) => m.row.category != null).length;
        const withRate = matchedRows.filter((m) => m.row.successFeeRatePct != null).length;
        const withDims = matchedRows.filter(
          (m) => m.row.weightGrams != null && m.row.volumeCm3 != null
        ).length;
        const withFulfilmentFee = matchedRows.filter((m) => m.row.fulfilmentFeeCents != null).length;
        const withBrand = matchedRows.filter((m) => m.row.brand != null).length;

        return {
          mode: 'preview' as const,
          parsed: {
            totalRows: parseResult.rows.length,
            parseErrors: parseResult.errors.length,
          },
          matching: {
            matched: matchedRows.length,
            unmatched: unmatchedRows.length,
          },
          willPopulate: {
            category: withCategory,
            brand: withBrand,
            dimensions: withDims,
            successFeeRate: withRate,
            fulfilmentFee: withFulfilmentFee,
          },
          parseErrors: parseResult.errors.slice(0, 10),
          unmatchedSample: unmatchedRows.slice(0, 5).map((r) => ({
            tsin: r.tsin,
            sku: r.sku,
            productTitle: r.productTitle,
          })),
        };
      }

      // ── Commit ──
      const [importRecord] = await db
        .insert(schema.productDetailsImports)
        .values({
          sellerId,
          fileName,
          rowCount: parseResult.rows.length,
          status: 'processing',
        })
        .returning({ id: schema.productDetailsImports.id });

      const importId = importRecord!.id;
      const updatedOfferIds: number[] = [];

      try {
        for (const { row, offerId } of matchedRows) {
          // Build a partial update — only set fields the CSV had a value for,
          // so we never overwrite better data with NULL.
          const updates: Record<string, unknown> = { updatedAt: new Date() };
          if (row.category != null) updates.category = row.category;
          if (row.brand != null) updates.brand = row.brand;
          if (row.weightGrams != null) updates.weightGrams = row.weightGrams;
          if (row.lengthMm != null) updates.lengthMm = row.lengthMm;
          if (row.widthMm != null) updates.widthMm = row.widthMm;
          if (row.heightMm != null) updates.heightMm = row.heightMm;
          if (row.volumeCm3 != null) updates.volumeCm3 = row.volumeCm3;
          if (row.successFeeRatePct != null)
            updates.successFeeRatePct = row.successFeeRatePct.toString();
          if (row.fulfilmentFeeCents != null) updates.fulfilmentFeeCents = row.fulfilmentFeeCents;

          if (Object.keys(updates).length === 1) continue; // only updatedAt

          await db
            .update(schema.offers)
            .set(updates)
            .where(
              and(eq(schema.offers.sellerId, sellerId), eq(schema.offers.offerId, offerId))
            );

          updatedOfferIds.push(offerId);
        }

        await db
          .update(schema.productDetailsImports)
          .set({
            status: 'complete',
            matchedCount: updatedOfferIds.length,
            unmatchedCount: unmatchedRows.length,
          })
          .where(eq(schema.productDetailsImports.id, importId));

        // Re-run profit calc + discrepancy detection for every order tied to
        // an updated offer so the new categories/rates take effect immediately.
        let queuedOrderCount = 0;
        if (updatedOfferIds.length > 0) {
          const affected = await db
            .select({ id: schema.orders.id })
            .from(schema.orders)
            .where(
              and(
                eq(schema.orders.sellerId, sellerId),
                inArray(schema.orders.offerId, updatedOfferIds)
              )
            );

          queuedOrderCount = affected.length;
          const orderIds = affected.map((o) => o.id);
          for (const chunk of chunkArray(orderIds, 500)) {
            await calculateProfitsQueue.add('recalculate-after-product-details-import', {
              sellerId,
              orderIds: chunk,
            });
          }

          // Also delete any previously-stored fee discrepancies for these
          // orders that were generated under unreliable inputs (no category /
          // no dims). The recalc will regenerate the correct ones.
          await db.execute(sql`
            DELETE FROM fee_discrepancies
            WHERE seller_id = ${sellerId}
              AND status = 'open'
              AND order_id IN (
                SELECT id FROM orders
                WHERE seller_id = ${sellerId}
                  AND offer_id = ANY(${updatedOfferIds})
              )
          `);
        }

        return {
          mode: 'commit' as const,
          importId,
          updated: updatedOfferIds.length,
          unmatched: unmatchedRows.length,
          queuedOrderCount,
          message: `Updated ${updatedOfferIds.length} offers. Re-running profit math for ${queuedOrderCount} orders.`,
        };
      } catch (err) {
        await db
          .update(schema.productDetailsImports)
          .set({
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : 'Unknown error',
          })
          .where(eq(schema.productDetailsImports.id, importId));
        throw err;
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET /details/imports — List past Product Details imports
  // ---------------------------------------------------------------------------
  server.get('/details/imports', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const imports = await db
      .select()
      .from(schema.productDetailsImports)
      .where(eq(schema.productDetailsImports.sellerId, sellerId))
      .orderBy(desc(schema.productDetailsImports.createdAt))
      .limit(20);
    return { imports };
  });
}
