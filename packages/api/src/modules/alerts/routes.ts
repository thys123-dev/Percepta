/**
 * Alert API Routes
 *
 *   GET    /api/alerts              — Paginated alert list (filter by type, severity, read)
 *   GET    /api/alerts/unread-count — Badge count for notification bell
 *   PATCH  /api/alerts/:id/read     — Mark single alert as read
 *   PATCH  /api/alerts/read-all     — Mark all unread alerts as read
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, desc, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { authenticate } from '../../middleware/auth.js';

// =============================================================================
// Validators
// =============================================================================

const alertsQuerySchema = z.object({
  type: z
    .enum(['loss_maker', 'margin_drop', 'storage_warning', 'fee_overcharge', 'low_stock'])
    .optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  unreadOnly: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().min(1).max(100).default(50),
  page: z.coerce.number().min(1).default(1),
});

// =============================================================================
// Routes
// =============================================================================

export async function alertRoutes(server: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // GET /api/alerts — Paginated list with optional filters
  // ---------------------------------------------------------------------------
  server.get('/', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const params = alertsQuerySchema.parse(request.query);
    const offset = (params.page - 1) * params.limit;

    // Build WHERE conditions
    const conditions = [eq(schema.alerts.sellerId, sellerId)];
    if (params.type) conditions.push(eq(schema.alerts.alertType, params.type));
    if (params.severity) conditions.push(eq(schema.alerts.severity, params.severity));
    if (params.unreadOnly) conditions.push(eq(schema.alerts.isRead, false));

    const where = and(...conditions);

    const [alertRows, countResult] = await Promise.all([
      db
        .select({
          id: schema.alerts.id,
          alertType: schema.alerts.alertType,
          severity: schema.alerts.severity,
          title: schema.alerts.title,
          message: schema.alerts.message,
          offerId: schema.alerts.offerId,
          actionUrl: schema.alerts.actionUrl,
          isRead: schema.alerts.isRead,
          isActedUpon: schema.alerts.isActedUpon,
          createdAt: schema.alerts.createdAt,
        })
        .from(schema.alerts)
        .where(where)
        .orderBy(desc(schema.alerts.createdAt))
        .limit(params.limit)
        .offset(offset),

      db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(schema.alerts)
        .where(where),
    ]);

    return {
      data: alertRows,
      pagination: {
        page: params.page,
        pageSize: params.limit,
        totalItems: countResult[0]?.total ?? 0,
        totalPages: Math.ceil((countResult[0]?.total ?? 0) / params.limit),
      },
    };
  });

  // ---------------------------------------------------------------------------
  // GET /api/alerts/unread-count — Badge number for notification bell
  // ---------------------------------------------------------------------------
  server.get('/unread-count', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    const [result] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schema.alerts)
      .where(
        and(
          eq(schema.alerts.sellerId, sellerId),
          eq(schema.alerts.isRead, false)
        )
      );

    return { count: result?.count ?? 0 };
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/alerts/read-all — Mark ALL unread alerts as read
  //   ⚠ This must be registered BEFORE /:id/read so Fastify doesn't
  //     match "read-all" as an :id parameter.
  // ---------------------------------------------------------------------------
  server.patch('/read-all', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    const result = await db
      .update(schema.alerts)
      .set({ isRead: true })
      .where(
        and(
          eq(schema.alerts.sellerId, sellerId),
          eq(schema.alerts.isRead, false)
        )
      )
      .returning({ id: schema.alerts.id });

    return { success: true, marked: result.length };
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/alerts/:id/read — Mark single alert as read
  // ---------------------------------------------------------------------------
  server.patch<{ Params: { id: string } }>(
    '/:id/read',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { sellerId } = request.user as { sellerId: string };
      const { id } = request.params;

      const [updated] = await db
        .update(schema.alerts)
        .set({ isRead: true })
        .where(
          and(
            eq(schema.alerts.id, id),
            eq(schema.alerts.sellerId, sellerId)
          )
        )
        .returning({ id: schema.alerts.id });

      if (!updated) {
        return reply.status(404).send({ error: 'Alert not found' });
      }

      return { success: true };
    }
  );
}
