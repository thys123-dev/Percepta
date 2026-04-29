/**
 * Formatting utilities for Percepta dashboard.
 * All monetary values are stored and passed as integer cents.
 */

/**
 * Format cents as ZAR — e.g. R1,234.56
 * Uses en-US number format (comma thousands, period decimal) for readability.
 */
export function formatCurrency(cents: number): string {
  const rands = cents / 100;
  const abs = Math.abs(rands);
  const sign = rands < 0 ? '-' : '';
  return `${sign}R${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs)}`;
}

/**
 * Compact ZAR for large numbers — e.g. R1.2k, R45.6k, R1.2m
 * Falls back to full format for small amounts.
 */
export function formatCurrencyCompact(cents: number): string {
  const rands = cents / 100;
  const abs = Math.abs(rands);
  const sign = rands < 0 ? '-' : '';

  if (abs >= 1_000_000) return `${sign}R${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${sign}R${(abs / 1_000).toFixed(1)}k`;
  return formatCurrency(cents);
}

/** Format a percentage value — e.g. 24.5% */
export function formatPct(pct: number, decimals = 1): string {
  return `${pct.toFixed(decimals)}%`;
}

/**
 * Format a delta (period-over-period change) with sign.
 * @param delta - change value
 * @param suffix - unit suffix: '%' (default) for relative changes, 'pp' for margin point changes
 */
export function formatDelta(delta: number, suffix: 'pp' | '%' = '%'): string {
  if (delta > 0) return `+${delta.toFixed(1)}${suffix}`;
  if (delta < 0) return `${delta.toFixed(1)}${suffix}`;
  return `0${suffix}`;
}

/** Format a short date — e.g. 12 Mar 2025 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

/** Format a unit count — e.g. 1,234 */
export function formatUnits(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

/**
 * Relative time string — e.g. "just now", "5 min ago", "2 hours ago",
 * "yesterday", "3 days ago", "2 weeks ago", "1 month ago".
 * Falls back to a formatted date for anything older than ~3 months.
 */
export function formatTimeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'just now'; // future-dated guard

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;

  const months = Math.floor(days / 30);
  if (months < 3) return `${months} ${months === 1 ? 'month' : 'months'} ago`;

  return formatDate(dateStr);
}
