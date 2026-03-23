import { Loader2, BarChart3 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area,
} from 'recharts';
import { useDiscrepancyChartData } from '../../hooks/useSalesReport';

export function DiscrepancyCharts() {
  const { data, isLoading, isError } = useDiscrepancyChartData();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white p-12">
        <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
        <span className="text-sm text-gray-500">Loading chart data...</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-sm text-red-700">Failed to load chart data.</p>
      </div>
    );
  }

  const hasData = data.byFeeType.length > 0 || data.byWeek.length > 0;

  if (!hasData) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <BarChart3 className="mx-auto h-12 w-12 text-gray-300" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900">No Insights Yet</h3>
        <p className="mt-2 text-sm text-gray-500">
          Import sales reports over time to see trends in fee discrepancies.
        </p>
      </div>
    );
  }

  // Format fee type data for stacked bar
  const feeTypeChartData = data.byFeeType.map((d) => ({
    name: d.label,
    Overcharged: d.totalOverchargedCents / 100,
    Undercharged: d.totalUnderchargedCents / 100,
    count: d.count,
  }));

  // Format weekly trend data
  const weeklyData = data.byWeek.map((d) => ({
    week: new Date(d.week).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }),
    Overcharged: d.overchargedCents / 100,
    Undercharged: d.underchargedCents / 100,
    Net: d.netImpactCents / 100,
  }));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* By Fee Type — Stacked Bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Discrepancies by Fee Type</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={feeTypeChartData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v: number) => `R${v}`} />
              <Tooltip formatter={(v: number) => `R${v.toFixed(2)}`} />
              <Legend />
              <Bar dataKey="Overcharged" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Undercharged" stackId="a" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weekly Trend — Area Chart */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Weekly Trend</h3>
        {weeklyData.length < 2 ? (
          <div className="flex h-64 items-center justify-center text-sm text-gray-400">
            Need at least 2 weeks of data for trends
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="overchargedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="underchargedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => `R${v}`} />
                <Tooltip formatter={(v: number) => `R${Math.abs(v).toFixed(2)}`} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="Overcharged"
                  stroke="#ef4444"
                  fillOpacity={1}
                  fill="url(#overchargedGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="Undercharged"
                  stroke="#22c55e"
                  fillOpacity={1}
                  fill="url(#underchargedGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
