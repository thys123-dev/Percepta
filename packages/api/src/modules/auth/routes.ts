import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { authenticate } from '../../middleware/auth.js';
import { env } from '../../config/env.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  businessName: z.string().min(1).max(255),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(server: FastifyInstance) {
  // POST /api/auth/register
  server.post('/register', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = registerSchema.parse(request.body);

    // Check if email already exists
    const existing = await db
      .select({ id: schema.sellers.id })
      .from(schema.sellers)
      .where(eq(schema.sellers.email, body.email))
      .limit(1);

    if (existing.length > 0) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'An account with this email already exists',
      });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    const [seller] = await db
      .insert(schema.sellers)
      .values({
        email: body.email,
        passwordHash,
        businessName: body.businessName,
      })
      .returning({
        id: schema.sellers.id,
        email: schema.sellers.email,
        businessName: schema.sellers.businessName,
      });

    const token = server.jwt.sign(
      { sellerId: seller.id, email: seller.email },
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    const refreshToken = server.jwt.sign(
      { sellerId: seller.id, type: 'refresh' },
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN }
    );

    return reply.status(201).send({
      seller,
      token,
      refreshToken,
    });
  });

  // POST /api/auth/login
  server.post('/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const [seller] = await db
      .select()
      .from(schema.sellers)
      .where(eq(schema.sellers.email, body.email))
      .limit(1);

    if (!seller) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    const validPassword = await bcrypt.compare(body.password, seller.passwordHash);
    if (!validPassword) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    const token = server.jwt.sign(
      { sellerId: seller.id, email: seller.email },
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    const refreshToken = server.jwt.sign(
      { sellerId: seller.id, type: 'refresh' },
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN }
    );

    return {
      seller: {
        id: seller.id,
        email: seller.email,
        businessName: seller.businessName,
        onboardingComplete: seller.onboardingComplete,
        initialSyncStatus: seller.initialSyncStatus,
      },
      token,
      refreshToken,
    };
  });

  // POST /api/auth/refresh
  server.post('/refresh', async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };

    try {
      const payload = server.jwt.verify<{ sellerId: string; type: string }>(refreshToken);
      if (payload.type !== 'refresh') {
        return reply.status(401).send({ message: 'Invalid refresh token' });
      }

      const token = server.jwt.sign(
        { sellerId: payload.sellerId },
        { expiresIn: env.JWT_EXPIRES_IN }
      );

      return { token };
    } catch {
      return reply.status(401).send({ message: 'Invalid or expired refresh token' });
    }
  });

  // DELETE /api/auth/account — POPIA right to erasure
  // Deletes the seller and all associated data (cascades via FK constraints).
  server.delete('/account', { preHandler: [authenticate] }, async (request, reply) => {
    const { sellerId } = request.user as { sellerId: string };

    await db.delete(schema.sellers).where(eq(schema.sellers.id, sellerId));

    return reply.status(200).send({ success: true, message: 'Account and all associated data deleted.' });
  });

  // GET /api/auth/export — POPIA right of access
  // Returns all data held for the authenticated seller.
  server.get('/export', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };

    const [seller, offers, orders, profitCalcs, alerts] = await Promise.all([
      db.select().from(schema.sellers).where(eq(schema.sellers.id, sellerId)),
      db.select().from(schema.offers).where(eq(schema.offers.sellerId, sellerId)),
      db.select().from(schema.orders).where(eq(schema.orders.sellerId, sellerId)),
      db.select().from(schema.profitCalculations).where(eq(schema.profitCalculations.sellerId, sellerId)),
      db.select().from(schema.alerts).where(eq(schema.alerts.sellerId, sellerId)),
    ]);

    // Redact sensitive fields
    const sellerData = seller[0]
      ? { ...seller[0], passwordHash: '[redacted]', apiKeyEnc: '[redacted]', webhookSecret: '[redacted]' }
      : null;

    return {
      exportedAt: new Date().toISOString(),
      seller: sellerData,
      offers,
      orders,
      profitCalculations: profitCalcs,
      alerts,
    };
  });
}
