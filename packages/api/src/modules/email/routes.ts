/**
 * Email Notification Preference Routes
 *
 * GET  /api/email/preferences   — Fetch current seller notification preferences
 * PATCH /api/email/preferences  — Update notification preferences
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { authenticate } from '../../middleware/auth.js';

const updatePrefsSchema = z.object({
  emailWeeklyDigest:    z.boolean().optional(),
  emailLossAlerts:      z.boolean().optional(),
  emailMarginThreshold: z.number().min(0).max(100).optional(),
});

export async function emailRoutes(server: FastifyInstance) {
  // GET /api/email/preferences
  server.get('/preferences', { preHandler: [authenticate] }, async (request, reply) => {
    const { sellerId } = request.user as { sellerId: string };

    const [seller] = await db
      .select({
        emailWeeklyDigest:    schema.sellers.emailWeeklyDigest,
        emailLossAlerts:      schema.sellers.emailLossAlerts,
        emailMarginThreshold: schema.sellers.emailMarginThreshold,
        lastWeeklyDigestAt:   schema.sellers.lastWeeklyDigestAt,
      })
      .from(schema.sellers)
      .where(eq(schema.sellers.id, sellerId));

    if (!seller) return reply.status(404).send({ error: 'Seller not found' });

    return {
      emailWeeklyDigest:    seller.emailWeeklyDigest ?? true,
      emailLossAlerts:      seller.emailLossAlerts ?? true,
      emailMarginThreshold: parseFloat(seller.emailMarginThreshold ?? '15.00'),
      lastWeeklyDigestAt:   seller.lastWeeklyDigestAt ?? null,
    };
  });

  // PATCH /api/email/preferences
  server.patch('/preferences', { preHandler: [authenticate] }, async (request, reply) => {
    const { sellerId } = request.user as { sellerId: string };

    const parsed = updatePrefsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const { emailWeeklyDigest, emailLossAlerts, emailMarginThreshold } = parsed.data;

    if (emailWeeklyDigest === undefined && emailLossAlerts === undefined && emailMarginThreshold === undefined) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    // Build update object with only provided fields
    // emailMarginThreshold stored as string (Drizzle decimal type)
    const setValues: {
      emailWeeklyDigest?: boolean;
      emailLossAlerts?: boolean;
      emailMarginThreshold?: string;
    } = {};
    if (emailWeeklyDigest !== undefined) setValues.emailWeeklyDigest = emailWeeklyDigest;
    if (emailLossAlerts !== undefined) setValues.emailLossAlerts = emailLossAlerts;
    if (emailMarginThreshold !== undefined) setValues.emailMarginThreshold = String(emailMarginThreshold);

    await db.update(schema.sellers).set(setValues).where(eq(schema.sellers.id, sellerId));

    return { success: true };
  });
}
