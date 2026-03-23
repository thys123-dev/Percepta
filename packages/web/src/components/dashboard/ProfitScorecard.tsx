import { AlertTriangle } from 'lucide-react';
import { MetricCard } from './MetricCard.js';
import {
  useDashboardSummary,
  type PeriodParams,
} from '../../hooks/useDashboard.js';
import { formatCurrencyCompact, formatPct } from '../../utils/format.js';

interface ProfitScorecardProps {
  periodParams: PeriodParams;
}

export function ProfitScorecard({ periodParams }: ProfitScorecardProps) {
  const { data, isLoading } = useDashboardSummary(periodParams);

  const periodLabel =
    periodParams.period === 'custom' ? 'vs prev period' : `vs prev ${periodParams.period}`;

  // Margin colour class
  const marginClass = data
    ? data.profitMarginPct >= 25
      ? 'text-profit-positive'
      : data.profitMarginPct >= 0
        ? 'text-yellow-600'
        : 'text-profit-negative'
    : undefined;

  // Profit colour class
  const profitClass = data
    ? data.netProfitCents >= 0
      ? 'text-profit-positive'
      : 'text-profit-negative'
    : undefined;

  // Loss-maker alert badge
  const lossMakerBadge =
    data && data.lossMakerCount > 0 ? (
      <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        <AlertTriangle className="h-3 w-3" />
        Alert
      </span>
    ) : undefined;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Net Profit"
        value={data ? formatCurrencyCompact(data.netProfitCents) : '—'}
        loading={isLoading}
        trend={data?.trends.profitDelta}
        trendLabel={periodLabel}
        valueClassName={profitClass}
      />

      <MetricCard
        label="Total Revenue"
        value={data ? formatCurrencyCompact(data.totalRevenueCents) : '—'}
        loading={isLoading}
        trend={data?.trends.revenueDelta}
        trendLabel={periodLabel}
      />

      <MetricCard
        label="Profit Margin"
        value={data ? formatPct(data.profitMarginPct) : '—'}
        loading={isLoading}
        trend={data?.trends.marginDelta}
        trendSuffix="pp"
        trendLabel={periodLabel}
        valueClassName={marginClass}
      />

      <MetricCard
        label="Loss-Making Products"
        value={data ? String(data.lossMakerCount) : '—'}
        loading={isLoading}
        badge={lossMakerBadge}
        valueClassName={
          data && data.lossMakerCount > 0 ? 'text-profit-negative' : 'text-gray-900'
        }
      />
    </div>
  );
}
