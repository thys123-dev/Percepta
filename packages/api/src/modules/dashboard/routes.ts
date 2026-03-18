import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.js';

export async function dashboardRoutes(server: FastifyInstance) {
  // GET /api/dashboard/summary — Dashboard summary scorecard
  // Will be implemented in Week 5
  server.get('/summary', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    // TODO: Implement dashboard summary aggregation
    return { message: 'Dashboard summary — coming in Week 5', sellerId };
  });

  // GET /api/dashboard/products — Product performance table
  // Will be implemented in Week 5
  server.get('/products', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    // TODO: Implement product performance query with sorting, filtering, pagination
    return { message: 'Product performance — coming in Week 5', sellerId };
  });

  // GET /api/dashboard/products/:offerId/fees — Fee breakdown for a product
  // Will be implemented in Week 6
  server.get('/products/:offerId/fees', { preHandler: [authenticate] }, async (request) => {
    const { sellerId } = request.user as { sellerId: string };
    const { offerId } = request.params as { offerId: string };
    // TODO: Implement fee waterfall breakdown
    return { message: 'Fee breakdown — coming in Week 6', sellerId, offerId };
  });
}
