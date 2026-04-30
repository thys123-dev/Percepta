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
        // Build the per-offer payload up front. Skip rows that have no useful
        // data — `updatedAt` alone doesn't justify a write.
        const updatePayloads = matchedRows
          .map(({ row, offerId }) => ({
            offer_id: offerId,
            category: row.category,
            brand: row.brand,
            weight_grams: row.weightGrams,
            length_mm: row.lengthMm,
            width_mm: row.widthMm,
            height_mm: row.heightMm,
            volume_cm3: row.volumeCm3,
            // jsonb numeric stays numeric — we cast it back to text in the
            // jsonb_to_recordset definition because Drizzle's decimal column
            // type round-trips as a string.
            success_fee_rate_pct:
              row.successFeeRatePct != null ? row.successFeeRatePct : null,
            fulfilment_fee_cents: row.fulfilmentFeeCents,
          }))
          .filter(
            (p) =>
              p.category != null ||
              p.brand != null ||
              p.weight_grams != null ||
              p.length_mm != null ||
              p.width_mm != null ||
              p.height_mm != null ||
              p.volume_cm3 != null ||
              p.success_fee_rate_pct != null ||
              p.fulfilment_fee_cents != null
          );

        // Bulk UPDATE in a single round-trip via jsonb_to_recordset. 766
        // sequential UPDATEs against the remote Railway DB took ~25s and
        // exceeded the request timeout — this finishes in one statement.
        // We chunk at 1,000 rows just to stay well under PG's parameter limits.
        if (updatePayloads.length > 0) {
          for (const chunk of chunkArray(updatePayloads, 1000)) {
            await db.execute(sql`
              UPDATE offers AS o SET
                category             = COALESCE(d.category, o.category),
                brand                = COALESCE(d.brand, o.brand),
                weight_grams         = COALESCE(d.weight_grams, o.weight_grams),
                length_mm            = COALESCE(d.length_mm, o.length_mm),
                width_mm             = COALESCE(d.width_mm, o.width_mm),
                height_mm            = COALESCE(d.height_mm, o.height_mm),
                volume_cm3           = COALESCE(d.volume_cm3, o.volume_cm3),
                success_fee_rate_pct = COALESCE(d.success_fee_rate_pct, o.success_fee_rate_pct),
                fulfilment_fee_cents = COALESCE(d.fulfilment_fee_cents, o.fulfilment_fee_cents),
                updated_at           = NOW()
              FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS d(
                offer_id              int,
                category              varchar,
                brand                 varchar,
                weight_grams          int,
                length_mm             int,
                width_mm              int,
                height_mm             int,
                volume_cm3            int,
                success_fee_rate_pct  numeric,
                fulfilment_fee_cents  int
              )
              WHERE o.seller_id = ${sellerId}
                AND o.offer_id  = d.offer_id
            `);
            for (const p of chunk) updatedOfferIds.push(p.offer_id);
          }
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

          // Also delete any existing OPEN fee discrepancies for these orders
          // — they were generated under unreliable inputs (no category / no
          // dims). The recalc will regenerate clean ones using the new rates.
          // Acknowledged / disputed rows are left alone.
          if (orderIds.length > 0) {
            for (const chunk of chunkArray(orderIds, 500)) {
              await db
                .delete(schema.feeDiscrepancies)
                .where(
                  and(
                    eq(schema.feeDiscrepancies.sellerId, sellerId),
                    eq(schema.feeDiscrepancies.status, 'open'),
                    inArray(schema.feeDiscrepancies.orderId, chunk)
                  )
                );
            }
          }
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
