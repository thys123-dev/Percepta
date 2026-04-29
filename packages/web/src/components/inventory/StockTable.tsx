/**
 * StockTable
 *
 * Paginated, searchable table of all offers with per-DC stock levels,
 * stock cover days (color-coded), and 30-day sales velocity.
 */

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, AlertTriangle, ChevronLeft, ChevronRight, Loader2, ArrowUpDown, RefreshCw, ExternalLink } from 'lucide-react';
import {
  useInventoryStock,
  type StockSortKey,
  type StockStatusFilter,
} from '../../hooks/useInventory.js';
import { formatCurrency } from '../../utils/format.js';
import { apiClient } from '../../services/api.js';
import { clsx } from 'clsx';

// =============================================================================
// Cover-days badge
// =============================================================================

function CoverBadge({ days }: { days: number | null }) {
  if (days === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
        —
      </span>
    );
  }

  const style =
    days >= 14
      ? 'bg-green-100 text-green-700'
      : days >= 7
        ? 'bg-amber-100 text-amber-700'
        : 'bg-red-100 text-red-700';

  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', style)}>
      {days}d
    </span>
  );
}

// =============================================================================
// Sort button labels
// =============================================================================

const SORT_OPTIONS: { key: StockSortKey; label: string }[] = [
  { key: 'stock_cover', label: 'Cover days' },
  { key: 'total_stock', label: 'Total stock' },
  { key: 'sales_velocity', label: 'Velocity' },
  { key: 'title', label: 'A–Z' },
];

const STATUS_OPTIONS: { key: StockStatusFilter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'disabled', label: 'Disabled' },
  { key: 'all', label: 'All' },
];

// =============================================================================
// StockTable
// =============================================================================

export function StockTable() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<StockSortKey>('stock_cover');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [statusFilter, setStatusFilter] = useState<StockStatusFilter>('active');

  const handleStatusChange = (next: StockStatusFilter) => {
    setStatusFilter(next);
    setPage(1);
  };

  // Manual "fetch disabled offers" — separate from regular sync because
  // disabled offers are heavy and most sellers don't need them.
  const syncDisabledMutation = useMutation({
    mutationFn: () => apiClient.post('/sync/offers/disabled').then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
    },
  });

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const commitSearch = () => {
    setDebouncedSearch(search);
    setPage(1);
  };

  const handleSortClick = (key: StockSortKey) => {
    if (sort === key) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setOrder(key === 'title' ? 'asc' : 'asc');
    }
    setPage(1);
  };

  const { data, isLoading, isFetching } = useInventoryStock({
    search: debouncedSearch || undefined,
    sort,
    order,
    limit: 50,
    page,
    statusFilter,
  });

  const rows = data?.data ?? [];
  const pagination = data?.pagination;

  // Show the "Sync disabled offers" CTA when the user is looking at
  // disabled (or all) offers AND we appear to have none — likely because
  // they've never run the disabled sync. Check pagination.totalItems too,
  // not just rows.length, so a stale page render with old data doesn't
  // re-trigger the banner after a successful sync.
  const showSyncDisabledCta =
    !isLoading &&
    rows.length === 0 &&
    (data?.pagination?.totalItems ?? 0) === 0 &&
    !debouncedSearch &&
    (statusFilter === 'disabled' || statusFilter === 'all');

  return (
    <div className="space-y-4">
      {/* Status filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">Listing status:</span>
        {STATUS_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleStatusChange(key)}
            className={clsx(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              statusFilter === key
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {label}
          </button>
        ))}
        {data?.pagination && (
          <span className="ml-2 text-xs text-gray-400">
            ({data.pagination.totalItems.toLocaleString()} {statusFilter === 'all' ? 'total' : statusFilter})
          </span>
        )}

        {/* Manual disabled-sync trigger — pushed to the right */}
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => syncDisabledMutation.mutate()}
            disabled={syncDisabledMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
            title="Pull disabled / paused offers from Takealot. Regular sync skips these to keep things fast."
          >
            {syncDisabledMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {syncDisabledMutation.isSuccess ? 'Sync started — refresh in ~1 min' : 'Sync disabled offers'}
          </button>
        </div>
      </div>

      {/* Banner when user is looking at disabled tab and we have nothing */}
      {showSyncDisabledCta && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No disabled offers in the database yet. The default sync skips them.
          Click <strong>Sync disabled offers</strong> above to pull them from Takealot.
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            onBlur={commitSearch}
            onKeyDown={(e) => e.key === 'Enter' && commitSearch()}
            placeholder="Search by title or SKU…"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Sort:</span>
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleSortClick(key)}
              className={clsx(
                'flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                sort === key
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {label}
              {sort === key && (
                <ArrowUpDown className="h-3 w-3" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Product</th>
                <th className="hidden px-4 py-3 text-right md:table-cell">JHB</th>
                <th className="hidden px-4 py-3 text-right md:table-cell">CPT</th>
                <th className="hidden px-4 py-3 text-right md:table-cell">DBN</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-center">Cover</th>
                <th className="px-4 py-3 text-right">Velocity</th>
                <th className="px-4 py-3 text-center w-10"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded bg-gray-100" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                        {debouncedSearch
                          ? `No products matching "${debouncedSearch}"`
                          : statusFilter === 'active'
                            ? 'No active listings on Takealot. Try the "Disabled" or "All" filter to see paused products.'
                            : statusFilter === 'disabled'
                              ? 'No disabled listings.'
                              : 'No products found. Stock data will appear after the next sync.'}
                      </td>
                    </tr>
                  )
                  : rows.map((row) => {
                      const isLowStock =
                        row.stockCoverStatus === 'critical' && row.salesUnits30d > 0;

                      return (
                        <tr
                          key={row.offerId}
                          className="transition-colors hover:bg-gray-50"
                        >
                          {/* Title + SKU */}
                          <td className="px-4 py-3">
                            <div className="max-w-[260px]">
                              <div className="truncate font-medium text-gray-800">
                                {row.title}
                              </div>
                              <div className="text-xs text-gray-400">
                                {row.sku ?? `ID: ${row.offerId}`}
                                {row.tsin && (
                                  <>
                                    <span className="mx-1.5 text-gray-300">·</span>
                                    <a
                                      href={`https://www.takealot.com/all?qsearch=${row.tsin}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-0.5 text-brand-600 underline decoration-dotted decoration-brand-300 underline-offset-2 hover:text-brand-700 hover:decoration-brand-600 hover:decoration-solid"
                                      title="Open this product on Takealot"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      TSIN {row.tsin}
                                      <ExternalLink className="h-2.5 w-2.5" />
                                    </a>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* JHB */}
                          <td className="hidden px-4 py-3 text-right tabular-nums text-gray-600 md:table-cell">
                            {row.stockJhb.toLocaleString()}
                          </td>

                          {/* CPT */}
                          <td className="hidden px-4 py-3 text-right tabular-nums text-gray-600 md:table-cell">
                            {row.stockCpt.toLocaleString()}
                          </td>

                          {/* DBN */}
                          <td className="hidden px-4 py-3 text-right tabular-nums text-gray-600 md:table-cell">
                            {row.stockDbn.toLocaleString()}
                          </td>

                          {/* Total */}
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-800">
                            {row.totalStock.toLocaleString()}
                          </td>

                          {/* Cover days */}
                          <td className="px-4 py-3 text-center">
                            <CoverBadge days={row.stockCoverDays} />
                          </td>

                          {/* Sales velocity */}
                          <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                            {row.salesVelocity} /day
                          </td>

                          {/* Low stock indicator */}
                          <td className="px-4 py-3 text-center">
                            {isLowStock && (
                              <span title="Low stock — consider replenishing">
                                <AlertTriangle className="mx-auto h-4 w-4 text-red-500" />
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
            <span>
              {(pagination.page - 1) * pagination.pageSize + 1}–
              {Math.min(pagination.page * pagination.pageSize, pagination.totalItems)}{' '}
              of {pagination.totalItems.toLocaleString()} products
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1 || isFetching}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-medium">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={pagination.page >= pagination.totalPages || isFetching}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {isFetching && !isLoading && (
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Refreshing…
        </div>
      )}
    </div>
  );
}
