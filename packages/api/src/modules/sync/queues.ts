/**
 * BullMQ Queue Definitions
 *
 * All queues are defined here with their job data types.
 * Workers are defined in workers.ts.
 *
 * Queue architecture:
 *  - initial-sync     → Full 180-day historical sync for a new seller
 *  - sync-offers      → Fetch + upsert all offers for a seller
 *  - sync-sales       → Fetch + upsert sales for a date range
 *  - calculate-profits → Calculate profit per order (implemented Week 3)
 *  - daily-sync       → Nightly scheduled reconciliation for all sellers
 */

import { Queue } from 'bullmq';
import { redisConnection } from './redis.js';

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

// ---- Queue Instances ----

export const initialSyncQueue = new Queue<InitialSyncJobData>('initial-sync', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});

export const syncOffersQueue = new Queue<SyncOffersJobData>('sync-offers', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

export const syncSalesQueue = new Queue<SyncSalesJobData>('sync-sales', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

export const calculateProfitsQueue = new Queue<CalculateProfitsJobData>('calculate-profits', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
});

export const dailySyncQueue = new Queue<DailySyncJobData>('daily-sync', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 50 },
  },
});
