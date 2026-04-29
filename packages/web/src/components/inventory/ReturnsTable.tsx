/**
 * ReturnsTable
 *
 * Two views:
 *   Reconciled — orders matched against Account Transactions CSV (financial reversal known).
 *   Pending    — orders Takealot has flagged as returned/return-requested via webhook,
 *                but the seller hasn't yet imported the CSV that reconciles the refund amount.
 *
 * When the seller has also imported the Takealot Returns Export, each row is enriched with
 * a return reason badge, a stock-outcome dot, and a tooltip showing the customer's comment.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, ArrowUpDown, FileUp, MessageCircle } from 'lucide-react';
import {
  useInventoryReturns,
  type ReturnsSortKey,
  type ReturnsView,
} from '../../hooks/useInventory.js';
import { formatCurrency, formatDate } from '../../utils/format.js';
import { clsx } from 'clsx';

const SORT_OPTIONS: { key: ReturnsSortKey; label: string }[] = [
  { key: 'order_date', label: 'Date' },
  { key: 'reversal_amount', label: 'Amount' },
  { key: 'product_title', label: 'A–Z' },
];

const VIEW_TABS: { key: ReturnsView; label: string; hint: string }[] = [
  { key: 'reconciled', label: 'Reconciled', hint: 'Matched to Account Transactions CSV' },
  { key: 'pending', label: 'Pending', hint: 'Flagged by Takealot, awaiting CSV reconciliation' },
];

const IMPORT_CSV_HREF = '/dashboard/fee-audit?tab=acct-transactions';
const IMPORT_RETURNS_HREF = '/dashboard/fee-audit?tab=returns-import';

// Reason strings are kept verbatim from the Takealot export.
const REASON_BADGE_COLOURS: Record<string, string> = {
  'Defective or damaged': 'bg-red-100 text-red-800',
  'Not what I ordered': 'bg-amber-100 text-amber-800',
  'Changed my mind': 'bg-blue-100 text-blue-800',
  'Customer Cancellation': 'bg-purple-100 text-purple-800',
  Exchange: 'bg-purple-100 text-purple-800',
  'Failed delivery': 'bg-gray-100 text-gray-700',
  Exception: 'bg-gray-100 text-gray-700',
};

function StockOutcomeDot({ outcome }: { outcome: 'sellable' | 'removal_order' | null }) {
  if (!outcome) return null;
  const colour = outcome === 'sellable' ? 'bg-green-500' : 'bg-amber-500';
  const label =
    outcome === 'sellable'
      ? 'Returned to sellable stock'
      : 'Removal order — awaiting collection at DC';
  return (
    <span className="inline-flex items-center" title={label}>
      <span className={clsx('h-2 w-2 rounded-full', colour)} />
    </span>
  );
}

function StockOutcomeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
      <span className="font-medium text-gray-700">Stock outcome:</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-green-500" />
        Sellable — back in your inventory
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Removal — awaiting collection at DC
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full border border-gray-300" />
        No outcome yet (in transit or no Returns Export imported)
      </span>
    </div>
  );
}

export function ReturnsTable() {
  const [view, setView] = useState<ReturnsView>('reconciled');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ReturnsSortKey>('order_date');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const handleViewClick = (next: ReturnsView) => {
    setView(next);
    setPage(1);
    if (next === 'pending' && sort === 'reversal_amount') {
      setSort('order_date');
      setOrder('desc');
    }
  };

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
    view,
    sort,
    order,
    limit: 50,
    page,
  });

  const rows = data?.data ?? [];
  const pagination = data?.pagination;
  const isPendingView = view === 'pending';

  // Show the Reason column only when at least one row has reason data —
  // otherwise the column is just empty space.
  const anyEnrichment = rows.some((r) => r.returnReason || r.stockOutcome);
  const totalCols = 6 + (anyEnrichment && !isPendingView ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* View tabs + sort toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          {VIEW_TABS.map(({ key, label, hint }) => (
            <button
              key={key}
              onClick={() => handleViewClick(key)}
              title={hint}
              className={clsx(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                view === key
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              {label}
              {pagination && view === key && (
                <span className="ml-1.5 opacity-75">({pagination.totalItems.toLocaleString()})</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Sort:</span>
          {SORT_OPTIONS.filter(
            (opt) => !(isPendingView && opt.key === 'reversal_amount')
          ).map(({ key, label }) => (
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
      </div>

      {/* Stock outcome legend — only on Reconciled view when we have Returns Export data */}
      {!isPendingView && anyEnrichment && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
          <StockOutcomeLegend />
        </div>
      )}

      {/* Pending view explainer */}
      {isPendingView && (
        <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center">
          <div>
            <span className="font-medium">Awaiting financial reconciliation.</span>{' '}
            Takealot has flagged these orders as returned, but no reversal amount has been booked yet.
            Import your latest Account Transactions CSV to reconcile.
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to={IMPORT_CSV_HREF}
              className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              <FileUp className="h-3.5 w-3.5" />
              Import CSV
            </Link>
          </div>
        </div>
      )}

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
                {isPendingView ? (
                  <th className="px-4 py-3">Status</th>
                ) : (
                  <th className="px-4 py-3 text-right">Reversal</th>
                )}
                {anyEnrichment && !isPendingView && (
                  <th className="px-4 py-3">Reason</th>
                )}
                <th
                  className="hidden px-4 py-3 sm:table-cell"
                  title="Date the unit was added back to your sellable stock at Takealot. For removal orders this is blank — the unit isn't going back into stock."
                >
                  {isPendingView ? 'Shipped' : 'Stock In'}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: totalCols }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded bg-gray-100" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.length === 0
                  ? (
                    <tr>
                      <td colSpan={totalCols} className="px-4 py-12 text-center">
                        <ReturnsEmptyState view={view} />
                      </td>
                    </tr>
                  )
                  : rows.map((row, idx) => (
                      <tr
                        key={`${row.orderId}-${idx}`}
                        className="transition-colors hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 tabular-nums text-gray-600">
                          <div className="flex items-center gap-2">
                            <StockOutcomeDot outcome={row.stockOutcome} />
                            <span>{row.orderId}</span>
                          </div>
                          {row.removalOrderNumber && (
                            <div className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-400">
                              {row.removalOrderNumber}
                            </div>
                          )}
                        </td>

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

                        <td className="px-4 py-3 text-gray-600">
                          {formatDate(row.orderDate)}
                        </td>

                        <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                          {row.quantity}
                        </td>

                        {isPendingView ? (
                          <td className="px-4 py-3">
                            <span
                              className={clsx(
                                'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                                row.saleStatus === 'Returned'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-100 text-blue-800'
                              )}
                            >
                              {row.saleStatus ?? '—'}
                            </span>
                          </td>
                        ) : (
                          <td className="px-4 py-3 text-right tabular-nums font-medium text-red-600">
                            {formatCurrency(row.reversalAmountCents)}
                          </td>
                        )}

                        {anyEnrichment && !isPendingView && (
                          <td className="px-4 py-3">
                            {row.returnReason ? (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={clsx(
                                    'rounded-full px-2 py-0.5 text-xs font-medium',
                                    REASON_BADGE_COLOURS[row.returnReason] ??
                                      'bg-gray-100 text-gray-700'
                                  )}
                                >
                                  {row.returnReason}
                                </span>
                                {row.customerComment && (
                                  <span title={row.customerComment} className="text-gray-400">
                                    <MessageCircle className="h-3.5 w-3.5" />
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        )}

                        <td className="hidden px-4 py-3 text-gray-600 sm:table-cell">
                          {isPendingView ? (
                            // Pending view has no return record yet — show original ship date.
                            formatDate(row.dateShippedToCustomer)
                          ) : row.stockOutcome === 'sellable' && row.dateAddedToStock ? (
                            formatDate(row.dateAddedToStock)
                          ) : row.stockOutcome === 'removal_order' ? (
                            <div className="flex flex-col">
                              <span className="text-gray-400">—</span>
                              {row.dateReadyToCollect && (
                                <span className="text-[10px] text-amber-600">
                                  Ready: {formatDate(row.dateReadyToCollect)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
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

function ReturnsEmptyState({ view }: { view: ReturnsView }) {
  if (view === 'pending') {
    return (
      <div className="flex flex-col items-center gap-1 text-sm text-gray-400">
        <span>No pending returns.</span>
        <span className="text-xs">
          Orders Takealot flags as <em>Returned</em> or <em>Return Requested</em> appear here in real time.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-sm text-gray-500">
      <span>No reversed orders found yet.</span>
      <span className="max-w-md text-xs text-gray-400">
        Reversed orders appear here once you import your Takealot Account Transactions CSV.
        Import the Returns Export too to see <em>why</em> customers returned and where each unit ended up.
      </span>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <Link
          to={IMPORT_CSV_HREF}
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-brand-700"
        >
          <FileUp className="h-3.5 w-3.5" />
          Import Account Transactions
        </Link>
        <Link
          to={IMPORT_RETURNS_HREF}
          className="inline-flex items-center gap-2 rounded-md border border-brand-200 bg-white px-4 py-2 text-xs font-medium text-brand-700 shadow-sm hover:bg-brand-50"
        >
          <FileUp className="h-3.5 w-3.5" />
          Or import Returns Export
        </Link>
      </div>
    </div>
  );
}
