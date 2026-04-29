/**
 * SyncProgressBanner — global "we're syncing your Takealot data" banner
 *
 * Displays at the top of every dashboard page whenever a sync job is
 * actively publishing progress. Listens to the Socket.io 'sync:progress'
 * channel directly so it works for ALL sync flows:
 *   - Initial sync (on first connect)
 *   - Manual "Sync now" button
 *   - "Sync disabled offers" button on the inventory page
 *   - Daily reconciliation
 *
 * Lifecycle:
 *   in-progress   → live progress messages from the worker
 *   refreshing    → worker is done, banner is awaiting fresh data
 *                   from React Query before declaring success. This
 *                   prevents the green ✓ banner from appearing
 *                   BEFORE the table actually populates.
 *   success       → green ✓ for ~4 seconds, then auto-hides
 *   failed        → red error variant
 *
 * The 'refreshing' phase awaits refetchQueries() on every cache that
 * could be affected, so by the time the green banner appears the
 * inventory / COGS / dashboard tables have new data ready to render.
 */

import { useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { type SyncProgressEvent } from '../../hooks/useSyncStatus.js';
import { useSocket } from '../../hooks/useSocket.js';

const STAGE_LABELS: Record<string, string> = {
  offers:   'Fetching your products',
  sales:    'Fetching your sales history',
  profits:  'Calculating profits',
  complete: 'Sync complete',
  failed:   'Sync failed',
};

/** Caches that can be affected by any sync job. */
const SYNC_AFFECTED_QUERY_KEYS: string[][] = [
  ['inventory-stock'],
  ['offer-list'],
  ['dashboard-summary'],
  ['products'],
  ['fee-summary'],
  ['revenue-target'],
  ['sync-status'],
  ['alerts'],
];

/** Time after the last progress event when we assume the worker is done. */
const QUIET_TIMEOUT_MS = 30_000;
/** How long the green 'Synced' confirmation stays before fading. */
const SUCCESS_DISPLAY_MS = 4_000;

type Phase = 'idle' | 'in-progress' | 'refreshing' | 'success' | 'failed';

export function SyncProgressBanner() {
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  // Latest progress event for live display.
  const [latest, setLatest] = useState<SyncProgressEvent | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const lastProgressAtRef = useRef<number>(0);
  /** Guard against double-firing finishSync from both the watchdog and an explicit complete event. */
  const finishingRef = useRef<boolean>(false);

  /**
   * Worker is done. Refetch all sync-affected queries and only switch
   * to the 'success' state once they've returned fresh data, so the
   * green ✓ banner can't appear before the table is actually populated.
   */
  const finishSync = async (kind: 'success' | 'failed') => {
    if (finishingRef.current) return;
    finishingRef.current = true;

    if (kind === 'success') {
      // Show 'refreshing' UI while we wait for data to arrive
      setPhase('refreshing');
      try {
        await Promise.all(
          SYNC_AFFECTED_QUERY_KEYS.map((key) =>
            queryClient.refetchQueries({ queryKey: key }).catch(() => undefined)
          )
        );
      } catch {
        // Even if refetch fails, we still want to clear the banner.
      }
    }

    setPhase(kind);
    setTimeout(() => {
      setPhase('idle');
      setLatest(null);
      finishingRef.current = false;
    }, SUCCESS_DISPLAY_MS);
  };

  // Listen for live progress events
  useEffect(() => {
    if (!socket) return;
    const handler = (event: SyncProgressEvent) => {
      lastProgressAtRef.current = Date.now();
      setLatest(event);

      // Explicit terminal events from the initial-sync orchestrator
      if (event.stage === 'complete') {
        void finishSync('success');
        return;
      }
      if (event.stage === 'failed' || event.type === 'sync:error') {
        void finishSync('failed');
        return;
      }
      // Otherwise we're mid-flight — only flip to in-progress if not already
      // in a finishing state (refreshing/success/failed).
      setPhase((prev) => (prev === 'idle' ? 'in-progress' : prev));
    };
    socket.on('sync:progress', handler);
    return () => {
      socket.off('sync:progress', handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // Watchdog: if we've been in-progress with no progress event for 30s,
  // assume the worker quietly finished (this also covers standalone
  // sync-offers jobs which don't emit a 'complete' stage event).
  useEffect(() => {
    if (phase !== 'in-progress') return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastProgressAtRef.current;
      if (elapsed > QUIET_TIMEOUT_MS) {
        void finishSync('success');
      }
    }, 5_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === 'idle') return null;

  // ── Variant: success ─────────────────────────────────────────────────────
  if (phase === 'success') {
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
  if (phase === 'failed') {
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

  // ── Variant: in progress OR refreshing ───────────────────────────────────
  // Both look the same (blue spinner banner) but the labels and helper
  // text differ so the user knows we're now waiting for the page to
  // populate, not for Takealot.
  const isRefreshing = phase === 'refreshing';

  const stage = latest?.stage;
  const stageLabel = isRefreshing
    ? 'Refreshing your dashboard'
    : stage
      ? (STAGE_LABELS[stage] ?? 'Syncing your data')
      : 'Syncing your data';
  const message = isRefreshing
    ? 'Loading the new data into the dashboard, inventory and COGS pages…'
    : (latest?.message ?? 'Connecting to Takealot…');
  const completed = latest?.completed;
  const total = latest?.total;
  const showProgressBar =
    !isRefreshing &&
    typeof completed === 'number' &&
    typeof total === 'number' &&
    total > 0;
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
          {isRefreshing
            ? 'Almost done — pages will update as soon as the new data is loaded.'
            : "Hang tight — your dashboard, inventory and COGS pages will populate as data arrives. They'll refresh automatically when the sync finishes."}
        </p>
      </div>
    </div>
  );
}
