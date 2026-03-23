import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { clsx } from 'clsx';
import { formatDelta } from '../../utils/format.js';

interface MetricCardProps {
  label: string;
  /** Pre-formatted display value (e.g. "R45.6k") */
  value: string;
  loading?: boolean;
  /** Period-over-period delta. Drives the trend arrow + colour. */
  trend?: number;
  /** Unit for the trend value: '%' (default) or 'pp' for percentage points */
  trendSuffix?: 'pp' | '%';
  /** Small text below the trend arrow (e.g. "vs prev 30d") */
  trendLabel?: string;
  /** Extra CSS classes for the value text (e.g. profit colour) */
  valueClassName?: string;
  /** Optional badge rendered top-right (e.g. an alert chip) */
  badge?: React.ReactNode;
}

export function MetricCard({
  label,
  value,
  loading = false,
  trend,
  trendSuffix = '%',
  trendLabel,
  valueClassName,
  badge,
}: MetricCardProps) {
  const hasTrend = trend !== undefined;
  const isUp = hasTrend && trend > 0;
  const isDown = hasTrend && trend < 0;

  return (
    <div className="metric-card">
      {/* Label row */}
      <div className="flex items-start justify-between">
        <span className="metric-label">{label}</span>
        {badge}
      </div>

      {/* Value */}
      {loading ? (
        <div className="mt-1 h-8 w-28 animate-pulse rounded-md bg-gray-100" />
      ) : (
        <span className={clsx('metric-value', valueClassName)}>{value}</span>
      )}

      {/* Trend */}
      {hasTrend && (
        <div
          className={clsx('flex items-center gap-1 text-sm font-medium', {
            'text-green-600': isUp,
            'text-red-600': isDown,
            'text-gray-400': !isUp && !isDown,
          })}
        >
          {isUp && <TrendingUp className="h-3.5 w-3.5" />}
          {isDown && <TrendingDown className="h-3.5 w-3.5" />}
          {!isUp && !isDown && <Minus className="h-3.5 w-3.5" />}
          <span>{formatDelta(trend!, trendSuffix)}</span>
          {trendLabel && (
            <span className="font-normal text-gray-400">{trendLabel}</span>
          )}
        </div>
      )}

      {loading && hasTrend && (
        <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
      )}
    </div>
  );
}
