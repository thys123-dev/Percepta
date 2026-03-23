import { useState } from 'react';
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  MessageSquare,
} from 'lucide-react';
import {
  useFeeDiscrepancies,
  useUpdateDiscrepancyStatus,
  useBulkUpdateDiscrepancyStatus,
  type DiscrepancyQueryParams,
} from '../../hooks/useSalesReport';
import { DiscrepancyStatusBadge } from './DiscrepancyStatusBadge';
import { DiscrepancyActionDialog } from './DiscrepancyActionDialog';

const FEE_TYPE_LABELS: Record<string, string> = {
  success_fee: 'Success Fee',
  fulfilment_fee: 'Fulfilment Fee',
  stock_transfer_fee: 'Stock Transfer Fee',
};

const FEE_TYPE_OPTIONS = [
  { value: 'all', label: 'All Fee Types' },
  { value: 'success_fee', label: 'Success Fee' },
  { value: 'fulfilment_fee', label: 'Fulfilment Fee' },
  { value: 'stock_transfer_fee', label: 'Stock Transfer Fee' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'disputed', label: 'Disputed' },
];

export function FeeDiscrepancyTable() {
  const [params, setParams] = useState<DiscrepancyQueryParams>({
    status: 'all',
    feeType: 'all',
    sortBy: 'discrepancy',
    page: 1,
    limit: 20,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionDialogId, setActionDialogId] = useState<string | null>(null);

  const { data, isLoading, isError } = useFeeDiscrepancies(params);
  const updateStatus = useUpdateDiscrepancyStatus();
  const bulkUpdate = useBulkUpdateDiscrepancyStatus();

  const formatRands = (cents: number) =>
    `R${(Math.abs(cents) / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!data) return;
    if (selectedIds.size === data.discrepancies.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.discrepancies.map((d) => d.id)));
    }
  }

  function handleBulkAction(status: 'acknowledged' | 'disputed') {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    bulkUpdate.mutate({ ids, status }, {
      onSuccess: () => setSelectedIds(new Set()),
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white p-12">
        <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
        <span className="text-sm text-gray-500">Loading discrepancies...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
        <p className="mt-2 text-sm text-red-700">Failed to load fee discrepancies.</p>
      </div>
    );
  }

  if (!data || data.discrepancies.length === 0) {
    return (
      <div className="space-y-4">
        {/* Filters even when empty — so user can switch back to 'all' */}
        <FilterBar params={params} onChange={setParams} />
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-green-600" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No Discrepancies Found</h3>
          <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
            {params.status !== 'all' || params.feeType !== 'all'
              ? 'Try changing your filters to see more results.'
              : 'Your calculated fees match Takealot\'s actual charges. Import a sales report CSV to check for discrepancies.'}
          </p>
        </div>
      </div>
    );
  }

  const { summary, discrepancies, pagination } = data;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="Total Discrepancies" value={summary.count.toString()} sub={`${summary.openCount} open`} color="text-amber-600" />
        <SummaryCard
          label="Net Impact"
          value={formatRands(summary.totalDiscrepancyCents)}
          sub={summary.totalDiscrepancyCents > 0 ? 'you overpaid' : summary.totalDiscrepancyCents < 0 ? 'you underpaid' : 'balanced'}
          color={summary.totalDiscrepancyCents > 0 ? 'text-red-600' : 'text-green-600'}
        />
        <SummaryCard label="Overcharged" value={formatRands(summary.overchargedCents)} sub="Takealot charged more" color="text-red-600" />
        <SummaryCard label="Undercharged" value={formatRands(summary.underchargedCents)} sub="Takealot charged less" color="text-green-600" />
      </div>

      {/* Filters */}
      <FilterBar params={params} onChange={setParams} />

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-brand-50 border border-brand-200 px-4 py-3">
          <span className="text-sm font-medium text-brand-700">{selectedIds.size} selected</span>
          <button
            onClick={() => handleBulkAction('acknowledged')}
            disabled={bulkUpdate.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Acknowledge All
          </button>
          <button
            onClick={() => handleBulkAction('disputed')}
            disabled={bulkUpdate.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Dispute All
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === discrepancies.length && discrepancies.length > 0}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                </th>
                <TH>Product</TH>
                <TH>Order #</TH>
                <TH>Date</TH>
                <TH>Fee Type</TH>
                <TH align="right">Actual</TH>
                <TH align="right">Calculated</TH>
                <TH align="right">Difference</TH>
                <TH align="right">% Off</TH>
                <TH>Status</TH>
                <TH>Actions</TH>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {discrepancies.map((d) => {
                const isOvercharge = d.discrepancyCents > 0;
                const isSelected = selectedIds.has(d.id);
                const showDialog = actionDialogId === d.id;

                return (
                  <tr key={d.id} className={`${isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'}`}>
                    <td className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(d.id)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      <div className="truncate text-sm font-medium text-gray-900">{d.productTitle ?? 'Unknown'}</div>
                      <div className="truncate text-xs text-gray-500">{d.sku ?? ''}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      #{d.orderIdNum}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {formatDate(d.orderDate)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {isOvercharge ? (
                          <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-green-500" />
                        )}
                        <span className="text-sm text-gray-900">{FEE_TYPE_LABELS[d.feeType] ?? d.feeType}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-700">
                      {formatRands(d.actualCents)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-700">
                      {formatRands(d.calculatedCents)}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold ${isOvercharge ? 'text-red-600' : 'text-green-600'}`}>
                      {isOvercharge ? '+' : '-'}{formatRands(d.discrepancyCents)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-500">
                      {parseFloat(d.discrepancyPct).toFixed(1)}%
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <DiscrepancyStatusBadge status={d.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {d.status === 'open' ? (
                        showDialog ? (
                          <DiscrepancyActionDialog
                            discrepancyId={d.id}
                            currentStatus={d.status}
                            isPending={updateStatus.isPending}
                            onSubmit={(status, note) => {
                              updateStatus.mutate({ id: d.id, status, note }, {
                                onSuccess: () => setActionDialogId(null),
                              });
                            }}
                            onClose={() => setActionDialogId(null)}
                          />
                        ) : (
                          <button
                            onClick={() => setActionDialogId(d.id)}
                            className="text-sm font-medium text-brand-600 hover:text-brand-700"
                          >
                            Resolve
                          </button>
                        )
                      ) : (
                        d.resolvedNote && (
                          <span className="text-xs text-gray-400 italic truncate max-w-[120px] block" title={d.resolvedNote}>
                            {d.resolvedNote}
                          </span>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {(pagination.page - 1) * pagination.pageSize + 1}–
            {Math.min(pagination.page * pagination.pageSize, pagination.totalItems)} of {pagination.totalItems}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setParams((p) => ({ ...p, page: Math.max(1, (p.page ?? 1) - 1) }))}
              disabled={pagination.page <= 1}
              className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setParams((p) => ({ ...p, page: Math.min(pagination.totalPages, (p.page ?? 1) + 1) }))}
              disabled={pagination.page >= pagination.totalPages}
              className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function FilterBar({
  params,
  onChange,
}: {
  params: DiscrepancyQueryParams;
  onChange: (p: DiscrepancyQueryParams) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={params.status ?? 'all'}
        onChange={(e) => onChange({ ...params, status: e.target.value, page: 1 })}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={params.feeType ?? 'all'}
        onChange={(e) => onChange({ ...params, feeType: e.target.value, page: 1 })}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {FEE_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={params.sortBy ?? 'discrepancy'}
        onChange={(e) => onChange({ ...params, sortBy: e.target.value, page: 1 })}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        <option value="discrepancy">Sort: Largest Impact</option>
        <option value="date">Sort: Most Recent</option>
        <option value="fee_type">Sort: Fee Type</option>
      </select>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{sub}</p>
    </div>
  );
}

function TH({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}
