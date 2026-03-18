/**
 * useSyncStatus hook
 *
 * Polls /api/sync/status every 3 seconds while sync is in progress.
 * Returns the current sync status and data counts.
 * Stops polling once status is 'complete' or 'failed'.
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api.js';

export type SyncStatus = 'pending' | 'syncing' | 'complete' | 'failed';

interface SyncStatusResponse {
  status: SyncStatus;
  onboardingComplete: boolean;
  isQueued: boolean;
  counts: {
    offers: number;
    orders: number;
  };
}

export function useSyncStatus() {
  return useQuery<SyncStatusResponse>({
    queryKey: ['sync-status'],
    queryFn: () => apiClient.get('/sync/status').then((r) => r.data),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Keep polling while pending or syncing, stop when done
      if (status === 'complete' || status === 'failed') return false;
      return 3000; // Poll every 3 seconds
    },
    staleTime: 0,
  });
}
