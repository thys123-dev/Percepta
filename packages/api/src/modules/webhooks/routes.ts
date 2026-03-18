/**
 * Webhook Routes
 *
 * POST /api/webhooks/takealot/:sellerId
 *
 * Receives real-time event notifications from the Takealot Marketplace.
 * Each seller registers their unique URL:
 *   https://api.percepta.co.za/api/webhooks/takealot/{sellerId}
 *
 * Security:
 *   - HMAC-SHA256 signature verification (X-Takealot-Signature header)
 *   - Per-seller webhook secrets (generated at API-key connect time)
 *   - Timing-safe comparison to prevent timing attacks
 *
 * Performance:
 *   - Returns 200 IMMEDIATELY (within Takealot's 5-second timeout)
 *   - All processing happens asynchronously via BullMQ
 *
 * Idempotency:
 *   - Webhook events are deduplicated by delivery_id
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { processWebhookQueue } from '../sync/queues.js';

const SIGNATURE_HEADER = 'x-takealot-signature';

export async function webhookRoutes(server: FastifyInstance) {
  /**
   * Override the default JSON content-type parser within this plugin scope
   * so we receive the raw Buffer for HMAC verification.
   * This only applies to routes within this plugin — it doesn't break other routes.
   */
  server.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    }
  );

  // -----------------------------------------------------------------
  // POST /api/webhooks/takealot/:sellerId
  // -----------------------------------------------------------------
  server.post<{ Params: { sellerId: string } }>(
    '/takealot/:sellerId',
    async (request: FastifyRequest<{ Params: { sellerId: string } }>, reply: FastifyReply) => {
      const { sellerId } = request.params;

      // --- Step 1: Parse raw body ---
      const rawBody = request.body as Buffer;
      if (!rawBody || rawBody.length === 0) {
        return reply.status(400).send({ error: 'Empty body' });
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
      } catch {
        return reply.status(400).send({ error: 'Invalid JSON' });
      }

      // --- Step 2: Look up seller ---
      const [seller] = await db
        .select({
          id: schema.sellers.id,
          webhookSecret: schema.sellers.webhookSecret,
        })
        .from(schema.sellers)
        .where(eq(schema.sellers.id, sellerId))
        .limit(1);

      if (!seller) {
        // Return 200 to prevent Takealot from retrying with invalid sellerId
        server.log.warn(`[Webhook] Unknown seller in URL: ${sellerId}`);
        return reply.status(200).send({ received: true });
      }

      // --- Step 3: Verify HMAC signature (if secret configured) ---
      const signature = request.headers[SIGNATURE_HEADER] as string | undefined;

      if (seller.webhookSecret && signature) {
        const isValid = verifyHmacSignature(rawBody, signature, seller.webhookSecret);
        if (!isValid) {
          server.log.warn(`[Webhook] Invalid HMAC signature for seller ${sellerId}`);
          return reply.status(401).send({ error: 'Invalid signature' });
        }
      } else if (seller.webhookSecret && !signature) {
        // Secret configured but no signature sent — reject
        server.log.warn(`[Webhook] Missing signature header for seller ${sellerId}`);
        return reply.status(401).send({ error: 'Missing signature' });
      }
      // If no secret configured, skip verification (initial setup phase)

      // --- Step 4: Extract event metadata ---
      const eventType = payload.event_type as string | undefined;
      const deliveryId = (payload.delivery_id ?? payload.id) as string | undefined;

      if (!eventType) {
        server.log.warn(`[Webhook] Missing event_type for seller ${sellerId}`);
        return reply.status(400).send({ error: 'Missing event_type' });
      }

      // --- Step 5: Respond 200 immediately (before any async processing) ---
      await reply.status(200).send({ received: true });

      // --- Step 6: Log webhook event to DB (async, non-blocking reply) ---
      try {
        await db
          .insert(schema.webhookEvents)
          .values({
            sellerId: seller.id,
            eventType,
            deliveryId: deliveryId ?? null,
            payload,
            processed: false,
          })
          .onConflictDoNothing(); // Guard against duplicate deliveries
      } catch (err) {
        server.log.error(`[Webhook] Failed to log event: ${(err as Error).message}`);
        // Don't stop processing — continue to queue the job
      }

      // --- Step 7: Queue for async processing ---
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (processWebhookQueue as any).add(
          eventType,
          { sellerId: seller.id, eventType, payload, deliveryId },
          {
            // Use deliveryId for deduplication if available
            jobId: deliveryId ? `wh-${deliveryId}` : undefined,
            priority: 1, // High priority
          }
        );

        server.log.info(`[Webhook] Queued "${eventType}" for seller ${sellerId}`);
      } catch (err) {
        server.log.error(`[Webhook] Failed to queue job: ${(err as Error).message}`);
      }
    }
  );

  // -----------------------------------------------------------------
  // GET /api/webhooks/info — Returns webhook URL + secret for seller dashboard
  // -----------------------------------------------------------------
  // This route is auth-protected (handled in sellers routes)
  // Exposed here just to document the pattern
}

/**
 * Verify HMAC-SHA256 webhook signature.
 *
 * Supports two formats:
 *   - "sha256=<hex>"  (GitHub-style, most common)
 *   - "<hex>"         (raw hex)
 *
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyHmacSignature(
  rawBody: Buffer,
  receivedSignature: string,
  secret: string
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

    // Strip "sha256=" prefix if present
    const received = receivedSignature.startsWith('sha256=')
      ? receivedSignature.slice(7)
      : receivedSignature;

    // Must be same length for timingSafeEqual
    if (expected.length !== received.length) return false;

    const expectedBuf = Buffer.from(expected, 'utf8');
    const receivedBuf = Buffer.from(received, 'utf8');

    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}
