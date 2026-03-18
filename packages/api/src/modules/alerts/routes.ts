import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.js';

export async function alertRoutes(server: FastifyInstance) {
  // GET /api/alerts — Get alerts for current seller
  // Will be implemented in Week 6
  server.get('/', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    // TODO: Implement alert listing with pagination, filtering by type/severity
    return { message: 'Alerts — coming in Week 6', sellerId };
  });

  // PATCH /api/alerts/:id/read — Mark alert as read
  server.patch('/:id/read', { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    // TODO: Implement alert read marking
    return { message: 'Alert read — coming in Week 6', id };
  });
}
