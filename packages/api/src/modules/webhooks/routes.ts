import type { FastifyInstance } from 'fastify';

export async function webhookRoutes(server: FastifyInstance) {
  // POST /api/webhooks/takealot — Receive Takealot webhooks
  // Will be implemented in Week 4
  server.post('/takealot', async (request, reply) => {
    // TODO: Implement webhook handler with:
    // 1. HMAC-SHA256 signature verification
    // 2. Immediate 200 response (within 5s timeout)
    // 3. Async processing via BullMQ queue
    return reply.status(200).send({ received: true });
  });
}
