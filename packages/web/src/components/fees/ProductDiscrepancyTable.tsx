import { Loader2, Package, AlertTriangle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { useProductDiscrepancies } from '../../hooks/useSalesReport';

export function ProductDiscrepancyTable() {
  const { data: products, isLoading, isError } = useProductDiscrepancies();

  const formatRands = (cents: number) =>
    `R${(Math.abs(cents) / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white p-12">
        <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
        <span className="text-sm text-gray-500">Loading product analysis...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
        <p className="mt-2 text-sm text-red-700">Failed to load product discrepancies.</p>
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <Package className="mx-auto h-12 w-12 text-gray-300" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900">No Product Data</h3>
        <p className="mt-2 text-sm text-gray-500">
          Import a sales report CSV to see per-product fee discrepancy analysis.
        </p>
      </div>
    );
  }

  // Top 10 for the bar chart
  const chartData = products.slice(0, 10).map((p) => ({
    name: (p.productTitle ?? 'Unknown').length > 25
      ? `${(p.productTitle ?? 'Unknown').substring(0, 25)}...`
      : (p.productTitle ?? 'Unknown'),
    overcharged: p.totalOverchargedCents / 100,
    undercharged: -(p.totalUnderchargedCents / 100),
    net: p.netImpactCents / 100,
  }));

  return (
    <div className="space-y-6">
      {/* Top 10 horizontal bar chart */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Top 10 Products by Fee Impact</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 120, right: 20, top: 5, bottom: 5 }}>
              <XAxis type="number" tickFormatter={(v: number) => `R${v.toFixed(0)}`} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => `R${Math.abs(value).toFixed(2)}`}
                labelStyle={{ fontWeight: 600 }}
              />
              <Bar dataKey="net" name="Net Impact" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.net > 0 ? '#ef4444' : '#22c55e'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Product table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Product</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Issues</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Open</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Overcharged</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Undercharged</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Net Impact</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Avg %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((p, i) => (
                <tr key={p.offerId ?? i} className="hover:bg-gray-50">
                  <td className="max-w-[250px] px-6 py-3">
                    <div className="truncate text-sm font-medium text-gray-900">{p.productTitle ?? 'Unknown'}</div>
                    <div className="text-xs text-gray-500">{p.sku ?? ''}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-700">{p.totalDiscrepancies}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {p.openCount > 0 ? (
                      <span className="text-sm font-medium text-amber-600">{p.openCount}</span>
                    ) : (
                      <span className="text-sm text-gray-400">0</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-red-600">{formatRands(p.totalOverchargedCents)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-green-600">{formatRands(p.totalUnderchargedCents)}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold ${p.netImpactCents > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {p.netImpactCents > 0 ? '+' : '-'}{formatRands(p.netImpactCents)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-500">{p.avgDiscrepancyPct?.toFixed(1) ?? '—'}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
