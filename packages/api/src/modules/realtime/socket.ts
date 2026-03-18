/**
 * Real-Time WebSocket Layer (Socket.io)
 *
 * Provides live dashboard updates to sellers:
 *   - Sync progress during initial data load
 *   - Profit updates after each new webhook order is processed
 *   - Alert notifications (loss-makers, margin drops, storage warnings)
 *
 * Architecture:
 *   Takealot Webhook
 *     → BullMQ process-webhook job
 *       → BullMQ calculate-profits job
 *         → Redis PUBLISH profit:update:{sellerId}
 *           → Redis SUBSCRIBE (this module)
 *             → Socket.io EMIT to room "seller:{sellerId}"
 *               → Frontend dashboard updates instantly
 *
 * Authentication:
 *   Clients pass their JWT in the Socket.io auth handshake.
 *   Successful auth joins the client to room "seller:{sellerId}".
 *
 * Redis channels subscribed:
 *   - sync:progress:{sellerId}   → emit "sync:progress"
 *   - profit:update:{sellerId}   → emit "profit:update"
 *   - alert:new:{sellerId}       → emit "alert:new"
 */

import { createHmac } from 'crypto';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { Redis } from 'ioredis';
import type { Server as HttpServer } from 'http';
import type { Env } from '../../config/env.js';
import type { SyncProgressEvent, ProfitUpdateEvent, AlertEvent } from '../sync/redis.js';

// ---- Module state ----

let io: SocketIOServer | null = null;

// ---- Types ----

interface AuthenticatedSocket extends Socket {
  sellerId: string;
}

interface JwtPayload {
  sellerId: string;
  iat?: number;
  exp?: number;
}

// ---- Setup ----

/**
 * Initialize Socket.io server attached to the existing Node.js HTTP server.
 * Called once at server startup, after Fastify begins listening.
 *
 * @returns The Socket.io server instance
 */
export function setupSocketIO(httpServer: HttpServer, env: Env): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25_000,
    pingTimeout: 60_000,
  });

  // ---- JWT Auth Middleware ----
  io.use((socket, next) => {
    try {
      const token: string =
        (socket.handshake.auth as Record<string, string>)?.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '') ||
        '';

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = verifyJwt(token, env.JWT_SECRET);
      if (!payload?.sellerId) {
        return next(new Error('Invalid or expired token'));
      }

      (socket as AuthenticatedSocket).sellerId = payload.sellerId;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  // ---- Connection Handler ----
  io.on('connection', (socket) => {
    const authedSocket = socket as AuthenticatedSocket;
    const { sellerId } = authedSocket;

    // Join seller-specific room so broadcasts are targeted
    void socket.join(`seller:${sellerId}`);

    console.info(`[Socket.io] Seller ${sellerId} connected (socket ${socket.id})`);

    socket.on('disconnect', (reason) => {
      console.info(`[Socket.io] Seller ${sellerId} disconnected: ${reason}`);
    });

    // Client can explicitly join a sync session room
    socket.on('subscribe:sync', (data: { sellerId: string }) => {
      if (data.sellerId === sellerId) {
        void socket.join(`sync:${sellerId}`);
      }
    });
  });

  // ---- Redis Pub/Sub Subscriber ----
  startRedisSubscriber(env.REDIS_URL);

  console.info('[Socket.io] WebSocket server ready');
  return io;
}

/**
 * Get the Socket.io server instance.
 * Throws if setupSocketIO() hasn't been called yet.
 */
export function getSocketIO(): SocketIOServer {
  if (!io) throw new Error('[Socket.io] Server not initialized — call setupSocketIO() first');
  return io;
}

/**
 * Emit a profit update directly to a seller room.
 * Convenience function for workers that already have the event data.
 */
export function emitProfitUpdate(event: ProfitUpdateEvent): void {
  if (!io) return;
  io.to(`seller:${event.sellerId}`).emit('profit:update', {
    calculated: event.calculated,
    lossMakers: event.lossMakers,
    triggeredBy: event.triggeredBy,
    timestamp: new Date().toISOString(),
  });
}

// ---- Redis Pub/Sub Subscriber ----

/**
 * Subscribe to all relevant Redis channels and forward messages to Socket.io rooms.
 *
 * Channel pattern → Socket.io event:
 *   sync:progress:{sellerId}  →  "sync:progress"
 *   profit:update:{sellerId}  →  "profit:update"
 *   alert:new:{sellerId}      →  "alert:new"
 */
function startRedisSubscriber(redisUrl: string): void {
  const subscriber = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });

  subscriber.on('error', (err) => {
    console.error('[Socket.io Subscriber] Redis error:', err.message);
  });

  subscriber.on('connect', () => {
    console.info('[Socket.io Subscriber] Redis connected');
  });

  // Pattern subscribe to all our pub/sub channels
  void subscriber.psubscribe(
    'sync:progress:*',
    'profit:update:*',
    'alert:new:*',
  );

  subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
    if (!io) return;

    try {
      const data = JSON.parse(message) as Record<string, unknown>;
      const sellerId = data.sellerId as string | undefined;
      if (!sellerId) return;

      const room = `seller:${sellerId}`;

      if (channel.startsWith('sync:progress:')) {
        const event = data as unknown as SyncProgressEvent;
        io.to(room).emit('sync:progress', {
          stage: event.stage,
          message: event.message,
          completed: event.completed,
          total: event.total,
          type: event.type,
          timestamp: new Date().toISOString(),
        });
      } else if (channel.startsWith('profit:update:')) {
        const event = data as unknown as ProfitUpdateEvent;
        io.to(room).emit('profit:update', {
          calculated: event.calculated,
          lossMakers: event.lossMakers,
          triggeredBy: event.triggeredBy,
          timestamp: new Date().toISOString(),
        });
      } else if (channel.startsWith('alert:new:')) {
        const event = data as unknown as AlertEvent;
        io.to(room).emit('alert:new', {
          alertId: event.alertId,
          alertType: event.alertType,
          title: event.title,
          severity: event.severity,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('[Socket.io Subscriber] Parse error:', (err as Error).message);
    }
  });
}

// ---- JWT Verification ----

/**
 * Verify a JWT signed with HMAC-SHA256 (HS256).
 * Matches the signing used by @fastify/jwt with `secret` option.
 * Returns the decoded payload if valid, null otherwise.
 */
function verifyJwt(token: string, secret: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

    // Recompute signature
    const expectedSig = createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    if (expectedSig !== signatureB64) return null;

    // Decode payload
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as JwtPayload;

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
