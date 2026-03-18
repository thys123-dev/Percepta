import { AlertTriangle, TrendingDown, TrendingUp, Loader2 } from 'lucide-react';
import { useFeeDiscrepancies } from '../../hooks/useSalesReport';

const FEE_TYPE_LABELS: Record<string, string> = {
  success_fee: 'Success Fee',
  fulfilment_fee: 'Fulfilment Fee',
  stock_transfer_fee: 'Stock Transfer Fee',
  successFee: 'Success Fee',
  fulfilmentFee: 'Fulfilment Fee',
  stockTransferFee: 'Stock Transfer Fee',
};

export function FeeDiscrepancyTable() {
  const { data, isLoading, isError } = useFeeDiscrepancies({ status: 'open', limit: 50 });

  const formatRands = (cents: number) =>
    `R${(Math.abs(cents) / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

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
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
          <TrendingUp className="h-6 w-6 text-green-600" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-gray-900">No Discrepancies Found</h3>
        <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
          Your calculated fees match Takealot's actual charges. Import a sales report CSV to check for discrepancies.
        </p>
      </div>
    );
  }

  const { summary, discrepancies } = data;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard
          label="Total Discrepancies"
          value={summary.count.toString()}
          sub="open issues"
          color="text-amber-600"
        />
        <SummaryCard
          label="Net Impact"
          value={formatRands(summary.totalDiscrepancyCents)}
          sub={summary.totalDiscrepancyCents > 0 ? 'you overpaid' : 'you underpaid'}
          color={summary.totalDiscrepancyCents > 0 ? 'text-red-600' : 'text-green-600'}
        />
        <SummaryCard
          label="Overcharged"
          value={formatRands(summary.overchargedCents)}
          sub="Takealot charged more"
          color="text-red-600"
        />
        <SummaryCard
          label="Undercharged"
          value={formatRands(summary.underchargedCents)}
          sub="Takealot charged less"
          color="text-green-600"
        />
      </div>

      {/* Discrepancy table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Fee Type
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actual (Takealot)
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Calculated (Percepta)
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Difference
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                % Off
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {discrepancies.map((d) => {
              const isOvercharge = d.discrepancyCents > 0;
              return (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center gap-2">
                      {isOvercharge ? (
                        <TrendingUp className="h-4 w-4 text-red-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-green-500" />
                      )}
                      <span className="text-sm font-medium text-gray-900">
                        {FEE_TYPE_LABELS[d.feeType] ?? d.feeType}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-700">
                    {formatRands(d.actualCents)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-700">
                    {formatRands(d.calculatedCents)}
                  </td>
                  <td className={`whitespace-nowrap px-6 py-4 text-right text-sm font-semibold ${
                    isOvercharge ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {isOvercharge ? '+' : '-'}{formatRands(d.discrepancyCents)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-500">
                    {parseFloat(d.discrepancyPct).toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
