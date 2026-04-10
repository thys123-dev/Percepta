import * as Sentry from '@sentry/node';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { env } from './config/env.js';

// Initialise Sentry early so it captures all subsequent errors.
// No-ops when SENTRY_DSN is not set.
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}
import { authRoutes } from './modules/auth/routes.js';
import { sellerRoutes } from './modules/sellers/routes.js';
import { webhookRoutes } from './modules/webhooks/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';
import { alertRoutes } from './modules/alerts/routes.js';
import { syncRoutes } from './modules/sync/routes.js';
import { salesReportRoutes } from './modules/fees/sales-report-routes.js';
import { accountTransactionRoutes } from './modules/fees/account-transaction-routes.js';
import { inventoryRoutes } from './modules/inventory/routes.js';
import { emailRoutes } from './modules/email/routes.js';
import { startWorkers } from './modules/sync/workers.js';
import { setupSocketIO } from './modules/realtime/socket.js';
import { db } from './db/index.js';
import { sql } from 'drizzle-orm';
import { redisConnection } from './modules/sync/redis.js';

export async function buildServer() {
  const server = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    bodyLimit: 1_048_576, // 1 MB default
  });

  // Plugins
  await server.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
  });

  await server.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production'
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'", 'wss:', 'https:'],
            fontSrc: ["'self'"],
          },
        }
      : false,
  });

  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await server.register(jwt, {
    secret: env.JWT_SECRET,
  });

  // Health check — verifies DB + Redis connectivity (no auth)
  server.get('/api/health', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (_request, reply) => {
    const checks: Record<string, string> = {};

    try {
      await db.execute(sql`SELECT 1`);
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    try {
      const pong = await redisConnection.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'error';
    } catch {
      checks.redis = 'error';
    }

    const healthy = Object.values(checks).every((v) => v === 'ok');

    return reply.status(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      checks,
    });
  });

  // Routes
  await server.register(authRoutes, { prefix: '/api/auth' });
  await server.register(sellerRoutes, { prefix: '/api/sellers' });
  await server.register(syncRoutes, { prefix: '/api/sync' });
  await server.register(webhookRoutes, { prefix: '/api/webhooks' });
  await server.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await server.register(alertRoutes, { prefix: '/api/alerts' });
  await server.register(salesReportRoutes, { prefix: '/api/sales-report' });
  await server.register(accountTransactionRoutes, { prefix: '/api/account-transactions' });
  await server.register(inventoryRoutes, { prefix: '/api/inventory' });
  await server.register(emailRoutes, { prefix: '/api/email' });

  // ── Serve frontend SPA in production ─────────────────────────────────
  if (env.NODE_ENV === 'production') {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // From dist/server.js → packages/api/dist/ → up to packages/ → web/dist/
    const webDistPath = join(__dirname, '..', '..', 'web', 'dist');

    if (existsSync(webDistPath)) {
      await server.register(fastifyStatic, {
        root: webDistPath,
        prefix: '/',
      });

      // SPA fallback: non-API GET requests return index.html for client-side routing
      server.setNotFoundHandler(async (request, reply) => {
        if (request.method === 'GET' && !request.url.startsWith('/api')) {
          return reply.sendFile('index.html');
        }
        return reply.status(404).send({ error: 'Not Found' });
      });
    } else {
      server.log.warn(`Web dist not found at ${webDistPath} — serving API only`);
    }
  }

  return server;
}

// Start server
async function main() {
  const server = await buildServer();

  try {
    await server.listen({ port: env.PORT, host: env.HOST });
    server.log.info(`🚀 Percepta API running at http://${env.HOST}:${env.PORT}`);

    // Attach Socket.io to the underlying Node.js HTTP server
    // Must be called AFTER listen() so server.server is available
    setupSocketIO(server.server, env);
    server.log.info('🔌 Socket.io WebSocket server attached');

    // Start BullMQ workers after server is listening
    startWorkers();
  } catch (err) {
    Sentry.captureException(err);
    server.log.error(err);
    process.exit(1);
  }
}

main();
