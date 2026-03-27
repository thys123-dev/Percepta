/**
 * ReturnsTable
 *
 * Paginated table of all orders with reversals (hasReversal=true).
 * Shows order details, reversal amounts, and shipping dates.
 */

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, ArrowUpDown } from 'lucide-react';
import { useInventoryReturns, type ReturnsSortKey } from '../../hooks/useInventory.js';
import { formatCurrency, formatDate } from '../../utils/format.js';
import { clsx } from 'clsx';

// =============================================================================
// Sort options
// =============================================================================

const SORT_OPTIONS: { key: ReturnsSortKey; label: string }[] = [
  { key: 'order_date', label: 'Date' },
  { key: 'reversal_amount', label: 'Amount' },
  { key: 'product_title', label: 'A–Z' },
];

// =============================================================================
// ReturnsTable
// =============================================================================

export function ReturnsTable() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ReturnsSortKey>('order_date');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const handleSortClick = (key: ReturnsSortKey) => {
    if (sort === key) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setOrder(key === 'product_title' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const { data, isLoading, isFetching } = useInventoryReturns({
    sort,
    order,
    limit: 50,
    page,
  });

  const rows = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      {/* Sort toolbar */}
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
            {sort === key && <ArrowUpDown className="h-3 w-3" />}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Order Date</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Reversal</th>
                <th className="hidden px-4 py-3 sm:table-cell">Shipped</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded bg-gray-100" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                        No returns found. Reversed orders will appear here after importing your Account Transactions CSV.
                      </td>
                    </tr>
                  )
                  : rows.map((row, idx) => (
                      <tr
                        key={`${row.orderId}-${idx}`}
                        className="transition-colors hover:bg-gray-50"
                      >
                        {/* Order ID */}
                        <td className="px-4 py-3 tabular-nums text-gray-600">
                          {row.orderId}
                        </td>

                        {/* Product */}
                        <td className="px-4 py-3">
                          <div className="max-w-[240px]">
                            <div className="truncate font-medium text-gray-800">
                              {row.productTitle}
                            </div>
                            {row.sku && (
                              <div className="text-xs text-gray-400">{row.sku}</div>
                            )}
                          </div>
                        </td>

                        {/* Order date */}
                        <td className="px-4 py-3 text-gray-600">
                          {formatDate(row.orderDate)}
                        </td>

                        {/* Qty */}
                        <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                          {row.quantity}
                        </td>

                        {/* Reversal amount */}
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-red-600">
                          {formatCurrency(row.reversalAmountCents)}
                        </td>

                        {/* Shipped date */}
                        <td className="hidden px-4 py-3 text-gray-600 sm:table-cell">
                          {formatDate(row.dateShippedToCustomer)}
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
            <span>
              {(pagination.page - 1) * pagination.pageSize + 1}–
              {Math.min(pagination.page * pagination.pageSize, pagination.totalItems)}{' '}
              of {pagination.totalItems.toLocaleString()} returns
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
