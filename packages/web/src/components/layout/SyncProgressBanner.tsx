/**
 * SyncProgressBanner — global "we're syncing your Takealot data" banner
 *
 * Displays at the top of every dashboard page whenever the backend reports
 * that an initial-sync, sync-offers, sync-sales or calculate-profits job
 * is running for this seller. Listens to live progress messages over the
 * existing Socket.io 'sync:progress' channel so the banner can show
 * "Fetching products… 200 of 766" rather than a static spinner.
 *
 * Sources of truth:
 *   - useSyncStatus       → backend status (syncing | pending+queued | …)
 *   - Socket.io 'sync:progress' → fine-grained per-page progress updates
 *
 * The banner self-hides once the backend transitions to 'complete' or
 * 'failed', and shows a brief "✓ Sync complete" confirmation for a few
 * seconds before fading out.
 */

import { useEffect, useState, useRef } from 'react';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { useSyncStatus, type SyncProgressEvent } from '../../hooks/useSyncStatus.js';
import { useSocket } from '../../hooks/useSocket.js';

const STAGE_LABELS: Record<string, string> = {
  offers:   'Fetching your products',
  sales:    'Fetching your sales history',
  profits:  'Calculating profits',
  complete: 'Sync complete',
  failed:   'Sync failed',
};

export function SyncProgressBanner() {
  const { data: syncStatus } = useSyncStatus();
  const { socket } = useSocket();
  const [latest, setLatest] = useState<SyncProgressEvent | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const previousStatusRef = useRef<string | undefined>(syncStatus?.status);

  // Listen for live progress events from the sync workers
  useEffect(() => {
    if (!socket) return;
    const handler = (event: SyncProgressEvent) => setLatest(event);
    socket.on('sync:progress', handler);
    return () => {
      socket.off('sync:progress', handler);
    };
  }, [socket]);

  // Detect transition syncing → complete to show a 'Synced' confirmation
  useEffect(() => {
    const prev = previousStatusRef.current;
    const curr = syncStatus?.status;
    if ((prev === 'syncing' || prev === 'pending') && curr === 'complete') {
      setShowSuccess(true);
      const t = setTimeout(() => {
        setShowSuccess(false);
        setLatest(null);
      }, 4000);
      previousStatusRef.current = curr;
      return () => clearTimeout(t);
    }
    previousStatusRef.current = curr;
  }, [syncStatus?.status]);

  // What we render is decided by these flags. Banner is shown whenever
  // ANY of (a) status reports active syncing, (b) we just transitioned
  // to complete (showSuccess), or (c) status is failed.
  const backendBusy =
    syncStatus?.status === 'syncing' ||
    (syncStatus?.status === 'pending' && syncStatus?.isQueued === true);
  const hasFailed = syncStatus?.status === 'failed';

  if (!backendBusy && !showSuccess && !hasFailed) {
    return null;
  }

  // ── Variant: success ─────────────────────────────────────────────────────
  if (showSuccess && !backendBusy) {
    return (
      <div
        role="status"
        className="border-b border-green-200 bg-green-50 px-4 py-2.5 sm:px-6"
      >
        <div className="mx-auto flex max-w-7xl items-center gap-2 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span className="font-medium">Sync complete — your dashboard is up to date.</span>
        </div>
      </div>
    );
  }

  // ── Variant: failed ──────────────────────────────────────────────────────
  if (hasFailed) {
    return (
      <div
        role="alert"
        className="border-b border-red-200 bg-red-50 px-4 py-2.5 sm:px-6"
      >
        <div className="mx-auto flex max-w-7xl items-start gap-2 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <div className="font-medium">Sync failed.</div>
            <div className="text-xs text-red-700">
              {latest?.message ?? 'Click "Sync now" on the dashboard to try again.'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Variant: in progress ─────────────────────────────────────────────────
  const stage = latest?.stage;
  const stageLabel = stage ? (STAGE_LABELS[stage] ?? 'Syncing your data') : 'Syncing your data';
  const message = latest?.message ?? 'Connecting to Takealot…';
  const completed = latest?.completed;
  const total = latest?.total;
  const showProgressBar =
    typeof completed === 'number' && typeof total === 'number' && total > 0;
  const pct = showProgressBar ? Math.min(100, Math.round((completed! / total!) * 100)) : 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-blue-200 bg-blue-50 px-4 py-2.5 sm:px-6"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-1.5">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-blue-600" />
          <span className="font-medium text-blue-900">{stageLabel}</span>
          <span className="hidden truncate text-blue-700 sm:inline">— {message}</span>
          {showProgressBar && (
            <span className="ml-auto text-xs text-blue-600 tabular-nums">
              {completed!.toLocaleString()} / {total!.toLocaleString()}
            </span>
          )}
        </div>
        {/* Mobile: message on its own row */}
        <div className="truncate text-xs text-blue-700 sm:hidden">{message}</div>

        {/* Progress bar */}
        <div className="h-1 w-full overflow-hidden rounded-full bg-blue-100">
          <div
            className={clsx(
              'h-full bg-blue-600 transition-all duration-500',
              !showProgressBar && 'animate-pulse'
            )}
            style={{ width: showProgressBar ? `${pct}%` : '40%' }}
          />
        </div>

        <p className="text-xs text-blue-600/80">
          Hang tight — your dashboard, inventory and COGS pages will populate
          as data arrives.
        </p>
      </div>
    </div>
  );
}
