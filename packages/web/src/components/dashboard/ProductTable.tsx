/**
 * ProductTable
 *
 * Full-featured product performance table powered by TanStack Table v8.
 *
 * Features:
 *   - Server-side sorting (7 sort keys, asc/desc)
 *   - Server-side pagination (50 rows/page)
 *   - Client-side title/SKU search filter (filters the current page)
 *   - Row expansion: click expand button to see fee waterfall breakdown
 *   - Colour-coded margin badges (profitable/marginal/loss_maker)
 *   - COGS confidence indicator (✓ manual vs ⚠ estimated)
 *   - Loading skeleton
 */

import React, { useState, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ExpandedState,
} from '@tanstack/react-table';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ArrowUpDown,
  AlertTriangle,
  CheckCircle2,
  Search,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  useProducts,
  type ProductRow,
  type PeriodParams,
  type ApiSortKey,
} from '../../hooks/useDashboard.js';
import { FeeBreakdownRow } from './FeeBreakdownRow.js';
import {
  formatCurrency,
  formatPct,
  formatDate,
  formatUnits,
} from '../../utils/format.js';

// Maps TanStack Table column IDs → API sort keys
const SORT_KEY_MAP: Partial<Record<string, ApiSortKey>> = {
  unitsSold: 'units_sold',
  revenueCents: 'revenue',
  totalFeesCents: 'fees',
  netProfitCents: 'profit',
  marginPct: 'margin_pct',
  lastSaleDate: 'last_sale',
};

const columnHelper = createColumnHelper<ProductRow>();

// Build columns outside component to avoid re-creation on every render
const columns = [
  // Expand toggle
  columnHelper.display({
    id: 'expand',
    header: () => null,
    cell: ({ row }) => (
      <button
        onClick={() => row.toggleExpanded()}
        className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        aria-label={row.getIsExpanded() ? 'Collapse' : 'Expand fee breakdown'}
      >
        {row.getIsExpanded() ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
    ),
    size: 44,
    enableSorting: false,
  }),

  // Product title + SKU
  columnHelper.accessor('title', {
    header: 'Product',
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="line-clamp-1 text-sm font-medium text-gray-900" title={row.original.title}>
          {row.original.title}
        </p>
        {row.original.sku && (
          <p className="text-xs text-gray-400">SKU: {row.original.sku}</p>
        )}
      </div>
    ),
    size: 260,
    enableSorting: false,
  }),

  // Units sold
  columnHelper.accessor('unitsSold', {
    header: 'Units',
    cell: ({ getValue }) => (
      <span className="font-mono text-sm tabular-nums">{formatUnits(getValue())}</span>
    ),
    size: 72,
  }),

  // Revenue
  columnHelper.accessor('revenueCents', {
    header: 'Revenue',
    cell: ({ getValue }) => (
      <span className="font-mono text-sm tabular-nums">{formatCurrency(getValue())}</span>
    ),
    size: 110,
  }),

  // Total fees
  columnHelper.accessor('totalFeesCents', {
    header: 'Fees',
    cell: ({ getValue }) => (
      <span className="font-mono text-sm tabular-nums text-red-600">{formatCurrency(getValue())}</span>
    ),
    size: 100,
  }),

  // COGS + confidence indicator
  columnHelper.accessor('cogsCents', {
    header: 'COGS',
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-sm tabular-nums">{formatCurrency(row.original.cogsCents)}</span>
        {row.original.cogsIsEstimated ? (
          <AlertTriangle
            className="h-3.5 w-3.5 flex-shrink-0 text-yellow-500"
            aria-label="Estimated COGS — click expand to update"
          />
        ) : (
          <CheckCircle2
            className="h-3.5 w-3.5 flex-shrink-0 text-green-500"
            aria-label="Manual COGS"
          />
        )}
      </div>
    ),
    size: 120,
    enableSorting: false,
  }),

  // Net profit — colour-coded
  columnHelper.accessor('netProfitCents', {
    header: 'Net Profit',
    cell: ({ getValue }) => {
      const v = getValue();
      return (
        <span
          className={clsx('font-mono text-sm font-semibold tabular-nums', {
            'text-profit-positive': v >= 0,
            'text-profit-negative': v < 0,
          })}
        >
          {formatCurrency(v)}
        </span>
      );
    },
    size: 110,
  }),

  // Margin % badge
  columnHelper.accessor('marginPct', {
    header: 'Margin',
    cell: ({ row }) => {
      const { marginStatus, marginPct } = row.original;
      return (
        <span
          className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', {
            'badge-profitable': marginStatus === 'profitable',
            'badge-marginal': marginStatus === 'marginal',
            'badge-loss': marginStatus === 'loss_maker',
          })}
        >
          {formatPct(marginPct)}
        </span>
      );
    },
    size: 96,
  }),

  // Last sale date
  columnHelper.accessor('lastSaleDate', {
    header: 'Last Sale',
    cell: ({ getValue }) => (
      <span className="text-sm text-gray-500">{formatDate(getValue())}</span>
    ),
    size: 110,
  }),
];

// ─────────────────────────────────────────────────────────────────────────────

interface ProductTableProps {
  periodParams: PeriodParams;
}

export function ProductTable({ periodParams }: ProductTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'marginPct', desc: false }, // lowest margin first — surfaces problems
  ]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  // Derive API sort params from TanStack Table sorting state
  const sortCol = sorting[0];
  const apiSort: ApiSortKey = sortCol
    ? (SORT_KEY_MAP[sortCol.id] ?? 'margin_pct')
    : 'margin_pct';
  const apiOrder = sortCol?.desc ? 'desc' : 'asc';

  // Fetch products — re-fetches when period, sort, or page changes
  const { data, isLoading, isFetching } = useProducts({
    ...periodParams,
    sort: apiSort,
    order: apiOrder,
    page,
    limit: 50,
  });

  const products = data?.data ?? [];
  const pagination = data?.pagination;

  // Client-side filter on the fetched page (search by title or SKU)
  const filtered =
    search.trim()
      ? products.filter(
          (p) =>
            p.title.toLowerCase().includes(search.toLowerCase()) ||
            (p.sku?.toLowerCase().includes(search.toLowerCase()) ?? false)
        )
      : products;

  const handleSortChange = useCallback(
    (updater: SortingState | ((prev: SortingState) => SortingState)) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      setSorting(next);
      setPage(1); // reset to page 1 on sort change
      setExpanded({}); // collapse all rows
    },
    [sorting]
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, expanded },
    onSortingChange: handleSortChange,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    manualSorting: true,
    manualPagination: true,
    enableMultiSort: false,
    getRowId: (row) => String(row.offerId),
  });

  // Sort indicator icon for header cells
  function SortIndicator({ colId }: { colId: string }) {
    const s = sorting.find((x) => x.id === colId);
    if (!s) return <ArrowUpDown className="ml-1 inline-block h-3.5 w-3.5 text-gray-300" />;
    return s.desc ? (
      <ChevronDown className="ml-1 inline-block h-3.5 w-3.5 text-brand-500" />
    ) : (
      <ChevronUp className="ml-1 inline-block h-3.5 w-3.5 text-brand-500" />
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="card overflow-hidden p-0">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search products or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-lg border border-gray-200 py-1.5 pl-9 pr-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="flex items-center gap-3 text-sm text-gray-500">
          {isFetching && !isLoading && (
            <span className="text-xs text-gray-400 animate-pulse">Refreshing…</span>
          )}
          {pagination && <span>{pagination.totalItems.toLocaleString()} products</span>}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-gray-200 bg-gray-50">
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className={clsx(
                        'px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500',
                        canSort && 'cursor-pointer select-none hover:text-gray-700'
                      )}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort && <SortIndicator colId={header.id} />}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-gray-100">
            {/* Loading skeleton */}
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
                    </td>
                  ))}
                </tr>
              ))}

            {/* Empty state */}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-16 text-center text-sm text-gray-400"
                >
                  {search
                    ? 'No products match your search.'
                    : 'No product data for this period. Sync your account to see data.'}
                </td>
              </tr>
            )}

            {/* Data rows + expandable fee breakdown sub-rows */}
            {!isLoading &&
              table.getRowModel().rows.map((row) => (
                <React.Fragment key={row.id}>
                  <tr
                    className={clsx('transition-colors hover:bg-gray-50', {
                      'bg-brand-50/40': row.getIsExpanded(),
                    })}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>

                  {/* Inline fee waterfall — only fetches when expanded */}
                  {row.getIsExpanded() && (
                    <FeeBreakdownRow
                      offerId={row.original.offerId}
                      colSpan={columns.length}
                    />
                  )}
                </React.Fragment>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
          <span className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page >= pagination.totalPages}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
