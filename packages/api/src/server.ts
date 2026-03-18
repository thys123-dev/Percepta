import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { env } from './config/env.js';
import { authRoutes } from './modules/auth/routes.js';
import { sellerRoutes } from './modules/sellers/routes.js';
import { webhookRoutes } from './modules/webhooks/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';
import { alertRoutes } from './modules/alerts/routes.js';

export async function buildServer() {
  const server = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // Plugins
  await server.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
  });

  await server.register(jwt, {
    secret: env.JWT_SECRET,
  });

  // Health check
  server.get('/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  }));

  // Routes
  await server.register(authRoutes, { prefix: '/api/auth' });
  await server.register(sellerRoutes, { prefix: '/api/sellers' });
  await server.register(webhookRoutes, { prefix: '/api/webhooks' });
  await server.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await server.register(alertRoutes, { prefix: '/api/alerts' });

  return server;
}

// Start server
async function main() {
  const server = await buildServer();

  try {
    await server.listen({ port: env.PORT, host: env.HOST });
    server.log.info(`🚀 Percepta API running at http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
