/**
 * BullMQ Queue Definitions
 *
 * All queues are defined here with their job data types.
 * Workers are defined in workers.ts.
 *
 * Queue architecture:
 *  - initial-sync      → Full 180-day historical sync for a new seller
 *  - sync-offers       → Fetch + upsert all offers for a seller
 *  - sync-sales        → Fetch + upsert sales for a date range
 *  - calculate-profits → Calculate profit per order (implemented Week 3)
 *  - daily-sync        → Nightly scheduled reconciliation for all sellers
 *  - process-webhook   → Handle incoming Takealot webhook events (Week 4)
 */

import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { redisConnection } from './redis.js';

// BullMQ 5.x bundles its own ioredis version which differs from the root
// ioredis install, causing a structural type mismatch. The runtime connection
// object is identical — the cast is safe and keeps both packages independent.
const conn = redisConnection as unknown as ConnectionOptions;

// ---- Job Data Types ----

export interface InitialSyncJobData {
  sellerId: string;
}

export interface SyncOffersJobData {
  sellerId: string;
  triggeredBy: 'initial-sync' | 'daily-sync' | 'manual';
}

export interface SyncSalesJobData {
  sellerId: string;
  startDate: string; // ISO date string
  endDate: string;   // ISO date string
  triggeredBy: 'initial-sync' | 'daily-sync' | 'manual';
}

export interface CalculateProfitsJobData {
  sellerId: string;
  orderIds: string[]; // internal UUIDs
}

export interface DailySyncJobData {
  sellerId: string;
}

export interface ProcessWebhookJobData {
  sellerId: string;
  eventType: string;
  payload: Record<string, unknown>;
  deliveryId?: string;
}

// ---- Queue Instances ----

export const initialSyncQueue = new Queue<InitialSyncJobData, any, string>('initial-sync', {
  connection: conn,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});

export const syncOffersQueue = new Queue<SyncOffersJobData, any, string>('sync-offers', {
  connection: conn,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

export const syncSalesQueue = new Queue<SyncSalesJobData, any, string>('sync-sales', {
  connection: conn,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

export const calculateProfitsQueue = new Queue<CalculateProfitsJobData, any, string>('calculate-profits', {
  connection: conn,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
});

export const dailySyncQueue = new Queue<DailySyncJobData, any, string>('daily-sync', {
  connection: conn,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 50 },
  },
});

// Webhook event processing queue — high priority, low latency
export const processWebhookQueue = new Queue<ProcessWebhookJobData, any, string>('process-webhook', {
  connection: conn,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 500 }, // Keep more for audit trail
    removeOnFail: { count: 200 },
  },
});

// ---- Week 9: Email Digest ----

export interface WeeklyDigestJobData {
  sellerId: string;
}

export const emailDigestQueue = new Queue<WeeklyDigestJobData, any, string>('email-digest', {
  connection: conn,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});
