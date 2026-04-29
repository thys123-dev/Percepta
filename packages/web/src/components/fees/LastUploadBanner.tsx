/**
 * LastUploadBanner
 *
 * Compact "Last upload: X ago" indicator shown above the drop zone on each
 * importer tab so the seller can tell at a glance whether they're up to date
 * without bouncing to the Import History tab.
 */

import { CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { formatTimeAgo, formatDate } from '../../utils/format.js';
import { clsx } from 'clsx';

export interface LastUploadRecord {
  fileName: string;
  status: string;
  createdAt: string;
  /** Number of rows actually committed (matched/inserted/etc). Label is provided by caller. */
  primaryCount?: number | null;
  /** Optional secondary count (e.g. duplicates skipped, unmatched rows). */
  secondaryCount?: number | null;
  /** Optional date range covered by the upload. */
  dateRangeStart?: string | null;
  dateRangeEnd?: string | null;
}

interface Props {
  /** What the importer is called, e.g. "Sales Report". Used in the heading. */
  label: string;
  latest: LastUploadRecord | null | undefined;
  isLoading?: boolean;
  /** Label for `primaryCount`, e.g. "orders updated", "transactions imported". */
  primaryCountLabel?: string;
  secondaryCountLabel?: string;
}

export function LastUploadBanner({
  label,
  latest,
  isLoading,
  primaryCountLabel = 'rows imported',
  secondaryCountLabel,
}: Props) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
        <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500">
        <Clock className="h-4 w-4 text-gray-400" />
        <span>
          No <strong>{label}</strong> imported yet.
        </span>
      </div>
    );
  }

  const failed = latest.status === 'failed';
  const Icon = failed ? AlertCircle : CheckCircle2;
  const iconColour = failed ? 'text-red-500' : 'text-green-500';
  const containerColour = failed
    ? 'border-red-200 bg-red-50'
    : 'border-green-200 bg-green-50/50';

  return (
    <div
      className={clsx(
        'flex flex-col items-start gap-2 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between',
        containerColour
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', iconColour)} />
        <div className="min-w-0">
          <div className="font-medium text-gray-900">
            Last {label} upload <span className="text-gray-500">·</span>{' '}
            <span className="text-gray-600">{formatTimeAgo(latest.createdAt)}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-gray-500">
            {latest.fileName}
            {latest.primaryCount != null && (
              <>
                {' · '}
                <strong className="text-gray-700">{latest.primaryCount.toLocaleString()}</strong>{' '}
                {primaryCountLabel}
              </>
            )}
            {latest.secondaryCount != null && latest.secondaryCount > 0 && secondaryCountLabel && (
              <>
                {' · '}
                {latest.secondaryCount.toLocaleString()} {secondaryCountLabel}
              </>
            )}
          </div>
          {(latest.dateRangeStart || latest.dateRangeEnd) && (
            <div className="text-xs text-gray-400">
              Covers {formatDate(latest.dateRangeStart)} – {formatDate(latest.dateRangeEnd)}
            </div>
          )}
        </div>
      </div>
      {failed && (
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
          Failed
        </span>
      )}
    </div>
  );
}
