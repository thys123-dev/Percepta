/**
 * SyncNowButton — manual re-sync trigger for the dashboard
 *
 * Surfaces the existing POST /api/sync/trigger endpoint as a button so the
 * user never needs to drop into DevTools to refresh their data. The button
 * disables itself while a sync is in flight (locally pending or backend
 * 'syncing'/queued state) and flips back to ready once the backend
 * reports 'complete' or 'failed'.
 *
 * Live profit updates are pushed via Socket.io (handled in
 * useRealtimeUpdates), so the dashboard re-renders automatically once
 * the worker emits its profit:update event.
 */

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import { apiClient } from '../../services/api.js';
import { useSyncStatus } from '../../hooks/useSyncStatus.js';

export function SyncNowButton() {
  const queryClient = useQueryClient();
  const { data: syncStatus } = useSyncStatus();
  const [justFinished, setJustFinished] = useState(false);
  const previousStatusRef = useRef<string | undefined>(syncStatus?.status);

  // Detect transition: syncing → complete, then briefly show "Synced" state
  useEffect(() => {
    const prev = previousStatusRef.current;
    const curr = syncStatus?.status;
    if (prev === 'syncing' && curr === 'complete') {
      setJustFinished(true);
      // Refresh dashboard data so the new numbers appear
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['fee-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['revenue-target'] });
      // Reset the "Synced" indicator after a short window
      const t = setTimeout(() => setJustFinished(false), 3000);
      return () => clearTimeout(t);
    }
    previousStatusRef.current = curr;
  }, [syncStatus?.status, queryClient]);

  const triggerMutation = useMutation({
    mutationFn: () => apiClient.post('/sync/trigger').then((r) => r.data),
    onSuccess: () => {
      // Force a re-poll so the button immediately reflects the new
      // 'pending'/'syncing' state coming back from the API.
      void queryClient.invalidateQueries({ queryKey: ['sync-status'] });
    },
  });

  const backendBusy =
    syncStatus?.status === 'syncing' ||
    syncStatus?.status === 'pending' && syncStatus?.isQueued === true;
  const isBusy = triggerMutation.isPending || backendBusy;

  // Render variants
  if (justFinished && !isBusy) {
    return (
      <span className="inline-flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
        <CheckCircle2 className="h-4 w-4" />
        Synced
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => triggerMutation.mutate()}
        disabled={isBusy}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isBusy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Syncing…
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" />
            Sync now
          </>
        )}
      </button>
      {triggerMutation.isError && (
        <span className="text-xs text-red-600">Failed to start sync. Try again.</span>
      )}
    </div>
  );
}
