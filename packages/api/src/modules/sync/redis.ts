/**
 * Shared Redis connection for BullMQ and pub/sub progress events.
 *
 * BullMQ requires a dedicated IORedis connection (not shared with pub/sub).
 * We create separate connections for:
 *   - BullMQ queues/workers (redisConnection)
 *   - Progress event publishing (progressPublisher)
 */

import { Redis } from 'ioredis';
import { env } from '../../config/env.js';

// BullMQ connection — used by all queues and workers
export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,    // Required by BullMQ
  lazyConnect: false,
});

redisConnection.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

redisConnection.on('connect', () => {
  console.info('[Redis] Connected to Redis');
});

// Progress publisher — separate connection for pub/sub
export const progressPublisher = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

progressPublisher.on('error', (err) => {
  console.error('[Redis Publisher] Connection error:', err.message);
});

// ---- Progress Event Helpers ----

export interface SyncProgressEvent {
  type: 'sync:progress' | 'sync:complete' | 'sync:error';
  sellerId: string;
  stage: 'offers' | 'sales' | 'profits' | 'complete' | 'failed';
  message: string;
  completed?: number;
  total?: number;
  error?: string;
}

/**
 * Publish a sync progress event to Redis channel `sync:progress:{sellerId}`.
 * The WebSocket layer subscribes to these and forwards to the browser.
 */
export async function publishProgress(event: SyncProgressEvent): Promise<void> {
  const channel = `sync:progress:${event.sellerId}`;
  await progressPublisher.publish(channel, JSON.stringify(event));
}

// ---- Profit Update Events ----

export interface ProfitUpdateEvent {
  sellerId: string;
  calculated: number;
  lossMakers: number;
  triggeredBy: 'webhook' | 'daily-sync' | 'cogs-update';
}

/**
 * Publish a profit-update event to Redis channel `profit:update:{sellerId}`.
 * Socket.io subscribes and pushes the update to the seller's dashboard.
 */
export async function publishProfitUpdate(event: ProfitUpdateEvent): Promise<void> {
  const channel = `profit:update:${event.sellerId}`;
  await progressPublisher.publish(channel, JSON.stringify(event));
}

// ---- Alert Events ----

export interface AlertEvent {
  sellerId: string;
  alertId: string;
  alertType: string;
  title: string;
  severity: string;
}

/**
 * Publish an alert event to Redis channel `alert:new:{sellerId}`.
 * Socket.io subscribes and pushes the alert badge count to the dashboard.
 */
export async function publishAlert(event: AlertEvent): Promise<void> {
  const channel = `alert:new:${event.sellerId}`;
  await progressPublisher.publish(channel, JSON.stringify(event));
}
