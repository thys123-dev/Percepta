/**
 * useSyncStatus hook
 *
 * Hybrid approach: polls /api/sync/status for initial state,
 * then uses Socket.io real-time events to receive live progress updates.
 * Falls back to polling if Socket.io isn't connected.
 */

import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api.js';
import { useSocket } from './useSocket.js';

export type SyncStatus = 'pending' | 'syncing' | 'complete' | 'failed';

export interface SyncProgressEvent {
  stage: 'offers' | 'sales' | 'profits' | 'complete' | 'failed';
  message: string;
  completed?: number;
  total?: number;
  type: string;
  timestamp: string;
}

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
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  // Base query: fetch current status from REST API
  const query = useQuery<SyncStatusResponse>({
    queryKey: ['sync-status'],
    queryFn: () => apiClient.get('/sync/status').then((r) => r.data as SyncStatusResponse),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      // Keep polling while pending/syncing (safety net when WS not connected)
      if (status === 'complete' || status === 'failed') return false;
      return 5000; // 5 second polling fallback
    },
    staleTime: 0,
  });

  // Socket.io: receive live sync progress events
  const handleSyncProgress = useCallback(
    (event: SyncProgressEvent) => {
      // Update the cached status based on the event stage
      queryClient.setQueryData<SyncStatusResponse>(['sync-status'], (old) => {
        if (!old) return old;
        const isFinal = event.stage === 'complete' || event.stage === 'failed';
        return {
          ...old,
          status: isFinal
            ? event.stage === 'complete'
              ? 'complete'
              : 'failed'
            : 'syncing',
        };
      });

      // On completion, invalidate to get fresh counts from server
      if (event.stage === 'complete' || event.stage === 'failed') {
        void queryClient.invalidateQueries({ queryKey: ['sync-status'] });
      }
    },
    [queryClient]
  );

  useEffect(() => {
    if (!socket) return;

    socket.on('sync:progress', handleSyncProgress);
    return () => {
      socket.off('sync:progress', handleSyncProgress);
    };
  }, [socket, handleSyncProgress]);

  return {
    ...query,
    // Expose the sync progress for UI display
    isComplete: query.data?.status === 'complete',
    isFailed: query.data?.status === 'failed',
    isSyncing:
      query.data?.status === 'syncing' || query.data?.status === 'pending',
  };
}
