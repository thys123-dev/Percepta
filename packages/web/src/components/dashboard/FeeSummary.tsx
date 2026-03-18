/**
 * FeeSummary
 *
 * Portfolio-level fee breakdown: shows where your money goes as a horizontal
 * bar chart (Recharts) plus a numeric table. Helps sellers understand which
 * fee types are eating into their revenue.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useFeeSummary, type PeriodParams } from '../../hooks/useDashboard.js';
import { formatCurrency, formatPct } from '../../utils/format.js';

const FEE_COLORS: Record<string, string> = {
  success_fee: '#f97316', // orange-500
  fulfilment: '#ef4444',  // red-500
  ibt_penalty: '#a855f7', // purple-500
  storage: '#eab308',     // yellow-500
};

interface FeeSummaryProps {
  periodParams: PeriodParams;
}

export function FeeSummary({ periodParams }: FeeSummaryProps) {
  const { data, isLoading } = useFeeSummary(periodParams);

  if (isLoading) {
    return (
      <div className="card">
        <div className="mb-4 h-5 w-40 animate-pulse rounded bg-gray-100" />
        <div className="h-48 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  if (!data || data.totalFeesCents === 0) {
    return (
      <div className="card">
        <h3 className="text-base font-semibold text-gray-900">Fee Breakdown</h3>
        <p className="mt-2 text-sm text-gray-400">
          No fee data for this period. Fees will appear after your first order is processed.
        </p>
      </div>
    );
  }

  // Prepare chart data — only show fee types that have actual values
  const chartData = data.feeBreakdown
    .filter((f) => f.totalCents > 0)
    .map((f) => ({
      name: f.label,
      feeType: f.feeType,
      rands: f.totalCents / 100,
      cents: f.totalCents,
      pct: f.pctOfRevenue,
    }));

  return (
    <div className="card">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Fee Breakdown</h3>
          <p className="mt-0.5 text-sm text-gray-500">
            Total fees: {formatCurrency(data.totalFeesCents)} ({formatPct(data.totalFeesPctOfRevenue)} of revenue)
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="mb-4 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 8, bottom: 0, left: 8 }}
          >
            <XAxis
              type="number"
              tickFormatter={(v: number) =>
                v >= 1000 ? `R${(v / 1000).toFixed(0)}k` : `R${v}`
              }
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#374151' }}
            />
            <Tooltip
              formatter={(value: number) => [formatCurrency(Math.round(value * 100)), 'Total']}
              labelStyle={{ fontWeight: 600 }}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                fontSize: 13,
              }}
            />
            <Bar dataKey="rands" radius={[0, 6, 6, 0]} barSize={28}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.feeType}
                  fill={FEE_COLORS[entry.feeType] ?? '#6b7280'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detail table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-2 text-left font-medium text-gray-500">Fee Type</th>
              <th className="pb-2 text-right font-medium text-gray-500">Amount</th>
              <th className="pb-2 text-right font-medium text-gray-500">% of Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.feeBreakdown.map((fee) => (
              <tr key={fee.feeType}>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor: FEE_COLORS[fee.feeType] ?? '#6b7280',
                      }}
                    />
                    <span className="font-medium text-gray-700">{fee.label}</span>
                  </div>
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-gray-700">
                  {formatCurrency(fee.totalCents)}
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-gray-500">
                  {formatPct(fee.pctOfRevenue)}
                </td>
              </tr>
            ))}
            {/* Totals row */}
            <tr className="border-t border-gray-200 font-semibold">
              <td className="pt-2 text-gray-900">Total Fees</td>
              <td className="pt-2 text-right font-mono tabular-nums text-gray-900">
                {formatCurrency(data.totalFeesCents)}
              </td>
              <td className="pt-2 text-right font-mono tabular-nums text-gray-900">
                {formatPct(data.totalFeesPctOfRevenue)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
