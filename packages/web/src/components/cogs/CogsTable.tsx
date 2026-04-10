/**
 * CogsTable
 *
 * Paginated, searchable table of all offers with inline COGS editing.
 * Each row has editable cogsCents + inboundCostCents fields.
 * Saving a row calls PATCH /sellers/cogs and immediately invalidates caches.
 */

import { useState, useCallback } from 'react';
import { Search, Save, Check, AlertCircle, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useOfferList, useUpdateCogs, type OfferForCogs } from '../../hooks/useCogsImport.js';
import { formatCurrency } from '../../utils/format.js';

// =============================================================================
// Types
// =============================================================================

interface RowEdit {
  cogsCents: string;
  inboundCostCents: string;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
}

// =============================================================================
// CogsTable
// =============================================================================

export function CogsTable() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'title' | 'sales' | 'cogs'>('cogs');

  // Local edit state: offerId → RowEdit
  const [edits, setEdits] = useState<Record<number, RowEdit>>({});

  const updateCogs = useUpdateCogs();

  // Debounce search input (simple approach with useState + useCallback)
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      setPage(1);
      // Small debounce via a timeout ref would be ideal; for simplicity we call on blur
    },
    []
  );

  const { data, isLoading, isFetching } = useOfferList({
    limit: 50,
    page,
    search: debouncedSearch || undefined,
    sort,
  });

  const offers = data?.data ?? [];
  const pagination = data?.pagination;

  // ── Row helpers ─────────────────────────────────────────────────────────

  const getEditForOffer = (offer: OfferForCogs): RowEdit => {
    if (edits[offer.offerId]) return edits[offer.offerId];
    return {
      cogsCents:
        offer.cogsCents != null ? (offer.cogsCents / 100).toFixed(2) : '',
      inboundCostCents:
        offer.inboundCostCents ? (offer.inboundCostCents / 100).toFixed(2) : '',
      dirty: false,
      saving: false,
      saved: false,
      error: null,
    };
  };

  const setField = (offerId: number, field: 'cogsCents' | 'inboundCostCents', value: string) => {
    setEdits((prev) => ({
      ...prev,
      [offerId]: {
        ...getEditForOffer(offers.find((o) => o.offerId === offerId)!),
        ...prev[offerId],
        [field]: value,
        dirty: true,
        saved: false,
        error: null,
      },
    }));
  };

  const handleSaveRow = async (offer: OfferForCogs) => {
    const edit = edits[offer.offerId] ?? getEditForOffer(offer);
    const cogsRands = parseFloat(edit.cogsCents);
    const inboundRands = parseFloat(edit.inboundCostCents || '0');

    if (isNaN(cogsRands) || cogsRands < 0) {
      setEdits((prev) => ({
        ...prev,
        [offer.offerId]: { ...edit, error: 'Enter a valid COGS amount.' },
      }));
      return;
    }

    setEdits((prev) => ({
      ...prev,
      [offer.offerId]: { ...edit, saving: true, error: null },
    }));

    try {
      await updateCogs.mutateAsync([
        {
          offerId: offer.offerId,
          cogsCents: Math.round(cogsRands * 100),
          inboundCostCents: Math.round((isNaN(inboundRands) ? 0 : inboundRands) * 100),
        },
      ]);
      setEdits((prev) => ({
        ...prev,
        [offer.offerId]: {
          ...edit,
          saving: false,
          saved: true,
          dirty: false,
          error: null,
        },
      }));
    } catch {
      setEdits((prev) => ({
        ...prev,
        [offer.offerId]: {
          ...edit,
          saving: false,
          saved: false,
          error: 'Save failed. Retry.',
        },
      }));
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            onBlur={() => setDebouncedSearch(search)}
            onKeyDown={(e) => e.key === 'Enter' && setDebouncedSearch(search)}
            placeholder="Search by title or SKU…"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Sort:</span>
          {(['cogs', 'sales', 'title'] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setSort(s); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors
                ${sort === s
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              {s === 'cogs' ? 'COGS unset first' : s === 'sales' ? 'Top sellers' : 'A–Z'}
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
                <th className="px-4 py-3 text-right">Sell Price</th>
                <th className="px-4 py-3 text-center">30d Units</th>
                <th className="w-32 px-4 py-3 text-right">COGS (R)</th>
                <th className="w-32 px-4 py-3 text-right">Inbound (R)</th>
                <th className="px-4 py-3 text-center">Source</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded bg-gray-100" />
                        </td>
                      ))}
                    </tr>
                  ))
                : offers.length === 0
                  ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                        {debouncedSearch
                          ? `No products matching "${debouncedSearch}"`
                          : 'No products found.'}
                      </td>
                    </tr>
                  )
                  : offers.map((offer) => {
                      const edit = getEditForOffer(offer);
                      const mergedEdit = { ...edit, ...edits[offer.offerId] };

                      return (
                        <tr
                          key={offer.offerId}
                          className={`transition-colors hover:bg-gray-50 ${
                            mergedEdit.saved ? 'bg-green-50/40' : ''
                          }`}
                        >
                          {/* Title + SKU */}
                          <td className="px-4 py-3">
                            <div className="max-w-[240px]">
                              <div className="truncate font-medium text-gray-800">
                                {offer.title ?? `Offer #${offer.offerId}`}
                              </div>
                              <div className="text-xs text-gray-400">
                                {offer.sku ?? `ID: ${offer.offerId}`}
                                {offer.category && ` · ${offer.category}`}
                              </div>
                            </div>
                          </td>

                          {/* Sell price */}
                          <td className="px-4 py-3 text-right text-gray-600">
                            {offer.sellingPriceCents != null
                              ? formatCurrency(offer.sellingPriceCents)
                              : '—'}
                          </td>

                          {/* 30d units */}
                          <td className="px-4 py-3 text-center text-gray-600">
                            {offer.salesUnits30d.toLocaleString()}
                          </td>

                          {/* COGS input */}
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={mergedEdit.cogsCents}
                              onChange={(e) => setField(offer.offerId, 'cogsCents', e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleSaveRow(offer)}
                              placeholder="0.00"
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-right text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                            />
                          </td>

                          {/* Inbound input */}
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={mergedEdit.inboundCostCents}
                              onChange={(e) => setField(offer.offerId, 'inboundCostCents', e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleSaveRow(offer)}
                              placeholder="0.00"
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-right text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                            />
                          </td>

                          {/* Source badge */}
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                                ${offer.cogsSource === 'manual'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-amber-100 text-amber-700'
                                }`}
                            >
                              {offer.cogsSource === 'manual' ? 'manual' : 'estimated'}
                            </span>
                          </td>

                          {/* Save button */}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              {mergedEdit.error && (
                                <AlertCircle className="h-4 w-4 text-red-500" aria-label={mergedEdit.error} />
                              )}
                              {mergedEdit.saved && !mergedEdit.dirty && (
                                <Check className="h-4 w-4 text-green-500" />
                              )}
                              <button
                                onClick={() => handleSaveRow(offer)}
                                disabled={mergedEdit.saving || (!mergedEdit.dirty && !mergedEdit.error)}
                                title="Save COGS"
                                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors
                                  ${mergedEdit.dirty || mergedEdit.error
                                    ? 'bg-brand-600 text-white hover:bg-brand-700'
                                    : 'bg-gray-100 text-gray-400 cursor-default'
                                  } disabled:cursor-not-allowed`}
                              >
                                {mergedEdit.saving ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Save className="h-3.5 w-3.5" />
                                )}
                                Save
                              </button>
                            </div>
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
              {((pagination.page - 1) * pagination.pageSize) + 1}–
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
