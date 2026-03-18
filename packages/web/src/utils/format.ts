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
