import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { db, schema } from '../../db/index.js';
import { and, eq, gt } from 'drizzle-orm';
import { authenticate } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
import { sendEmail } from '../email/email-service.js';
import {
  passwordResetEmailHtml,
  passwordResetEmailText,
} from '../email/templates/password-reset.js';

// Reset tokens are valid for 1 hour. Long enough for users to find the email,
// short enough to limit damage if a token leaks.
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MINUTES = 60;

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  businessName: z.string().min(1).max(255),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(8),
});

/**
 * SHA-256 hash of the raw token. We never store the raw token in the DB —
 * if the database leaks, leaked hashes can't be used as reset tokens.
 */
function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

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

  // POST /api/auth/forgot-password
  // Always returns success regardless of whether the email exists, so this
  // endpoint cannot be used to enumerate registered accounts.
  server.post(
    '/forgot-password',
    { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = forgotPasswordSchema.parse(request.body);
      const normalisedEmail = body.email.toLowerCase().trim();

      const [seller] = await db
        .select({
          id: schema.sellers.id,
          email: schema.sellers.email,
          businessName: schema.sellers.businessName,
        })
        .from(schema.sellers)
        .where(eq(schema.sellers.email, normalisedEmail))
        .limit(1);

      if (seller) {
        // Generate a cryptographically random token (256 bits, hex-encoded → 64 chars)
        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = hashResetToken(rawToken);
        const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

        await db
          .update(schema.sellers)
          .set({
            passwordResetTokenHash: tokenHash,
            passwordResetExpiresAt: expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(schema.sellers.id, seller.id));

        const resetUrl = `${env.FRONTEND_URL.replace(/\/$/, '')}/reset-password?token=${rawToken}`;

        try {
          await sendEmail({
            to: seller.email,
            subject: 'Reset your Percepta password',
            html: passwordResetEmailHtml({
              resetUrl,
              businessName: seller.businessName,
              expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
            }),
            text: passwordResetEmailText({
              resetUrl,
              businessName: seller.businessName,
              expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
            }),
          });
          server.log.info({ sellerId: seller.id }, 'Password reset email sent');
        } catch (err) {
          // Log but don't surface to the client — the response shape is the
          // same whether the email succeeded or not, to prevent enumeration.
          server.log.error({ err, sellerId: seller.id }, 'Failed to send password reset email');
        }
      } else {
        server.log.info({ email: normalisedEmail }, 'Password reset requested for unknown email');
      }

      return reply.status(200).send({
        success: true,
        message:
          'If an account exists for that email, a password reset link has been sent.',
      });
    }
  );

  // POST /api/auth/reset-password
  // Validates the single-use token, updates the password, and invalidates the token.
  server.post(
    '/reset-password',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = resetPasswordSchema.parse(request.body);
      const tokenHash = hashResetToken(body.token);

      const [seller] = await db
        .select({
          id: schema.sellers.id,
          email: schema.sellers.email,
        })
        .from(schema.sellers)
        .where(
          and(
            eq(schema.sellers.passwordResetTokenHash, tokenHash),
            gt(schema.sellers.passwordResetExpiresAt, new Date())
          )
        )
        .limit(1);

      if (!seller) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'This reset link is invalid or has expired. Please request a new one.',
        });
      }

      const passwordHash = await bcrypt.hash(body.password, 12);

      await db
        .update(schema.sellers)
        .set({
          passwordHash,
          // Single-use: clear the token so it can't be reused
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.sellers.id, seller.id));

      server.log.info({ sellerId: seller.id }, 'Password reset completed');

      return reply.status(200).send({
        success: true,
        message: 'Password updated successfully. You can now sign in with your new password.',
      });
    }
  );

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
