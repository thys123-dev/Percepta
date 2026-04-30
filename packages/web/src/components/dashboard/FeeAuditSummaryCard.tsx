import { Scale, AlertTriangle, CheckCircle, ArrowRight, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuditSummary } from '../../hooks/useSalesReport';

export function FeeAuditSummaryCard() {
  const { data, isLoading, isError } = useAuditSummary();

  const formatRands = (cents: number) =>
    `R${(Math.abs(cents) / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          <span className="text-sm text-gray-500">Loading audit summary...</span>
        </div>
      </div>
    );
  }

  if (isError) return null; // Silently fail — dashboard still works

  if (!data || !data.hasDiscrepancies) {
    // All-clear green state
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-green-900">Fee Audit: All Clear</h3>
              <p className="text-xs text-green-700">
                No fee discrepancies detected. Import a sales report to verify your fees.
              </p>
            </div>
          </div>
          <Link
            to="/dashboard/fees-insights?tab=discrepancies"
            className="inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:text-green-800"
          >
            View
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  // Has discrepancies — show alert-style card
  const severity = data.totalOverchargedCents >= 20000 ? 'critical' : 'warning';
  const borderColor = severity === 'critical' ? 'border-red-200' : 'border-amber-200';
  const bgColor = severity === 'critical' ? 'bg-red-50' : 'bg-amber-50';
  const iconBg = severity === 'critical' ? 'bg-red-100' : 'bg-amber-100';
  const iconColor = severity === 'critical' ? 'text-red-600' : 'text-amber-600';
  const titleColor = severity === 'critical' ? 'text-red-900' : 'text-amber-900';
  const textColor = severity === 'critical' ? 'text-red-700' : 'text-amber-700';
  const linkColor = severity === 'critical' ? 'text-red-700 hover:text-red-800' : 'text-amber-700 hover:text-amber-800';

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-6`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>
            <AlertTriangle className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div>
            <h3 className={`text-sm font-semibold ${titleColor}`}>
              Fee Audit: {data.openCount} Open {data.openCount === 1 ? 'Issue' : 'Issues'}
            </h3>
            <div className={`mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${textColor}`}>
              {data.totalOverchargedCents > 0 && (
                <span>Overcharged: {formatRands(data.totalOverchargedCents)}</span>
              )}
              {data.netImpactCents !== 0 && (
                <span className="font-semibold">
                  Net: {data.netImpactCents > 0 ? '+' : '-'}{formatRands(data.netImpactCents)}
                </span>
              )}
              {data.topOverchargedProduct && (
                <span>Top: {data.topOverchargedProduct.name}</span>
              )}
            </div>
          </div>
        </div>
        <Link
          to="/dashboard/fees-insights?tab=discrepancies"
          className={`inline-flex items-center gap-1 text-sm font-medium ${linkColor} whitespace-nowrap`}
        >
          Review
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
