/**
 * DashboardPage — the "aha moment" screen
 *
 * Shows sellers their real profit at a glance:
 *   1. Period selector — 7d / 30d / 90d / custom
 *   2. Profitability Scorecard — Net Profit, Revenue, Margin %, Loss-Makers
 *   3. Product Performance Table — sortable, filterable, expandable fee breakdown
 *
 * Real-time updates are handled by useRealtimeUpdates() mounted in DashboardLayout,
 * which invalidates the 'dashboard-summary' and 'products' query keys when
 * a new webhook-triggered profit calculation arrives.
 */

import { useState } from 'react';
import { ProfitScorecard } from '../components/dashboard/ProfitScorecard.js';
import { ProductTable } from '../components/dashboard/ProductTable.js';
import { PeriodSelector } from '../components/dashboard/PeriodSelector.js';
import { FeeSummary } from '../components/dashboard/FeeSummary.js';
import { FeeAuditSummaryCard } from '../components/dashboard/FeeAuditSummaryCard.js';
import type { Period, PeriodParams } from '../hooks/useDashboard.js';

export function DashboardPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();

  const periodParams: PeriodParams = {
    period,
    // Only include custom date range when explicitly selected
    ...(period === 'custom' && startDate ? { startDate } : {}),
    ...(period === 'custom' && endDate ? { endDate } : {}),
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Profitability Dashboard</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Real-time profit visibility for your Takealot business
          </p>
        </div>

        <PeriodSelector
          value={period}
          onChange={setPeriod}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
      </div>

      {/* Profitability Scorecard — 4 KPI cards */}
      <ProfitScorecard periodParams={periodParams} />

      {/* Fee Audit Summary — shows overcharge alerts or all-clear */}
      <FeeAuditSummaryCard />

      {/* Fee Breakdown + Product Table — side by side on wide screens */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Product Performance Table (takes 2/3 width) */}
        <section className="xl:col-span-2">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Product Performance</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Default sort: lowest margin first — loss-makers surface at the top.
              Click any row to see a full fee waterfall breakdown.
            </p>
          </div>
          <ProductTable periodParams={periodParams} />
        </section>

        {/* Portfolio Fee Summary (takes 1/3 width) */}
        <section className="xl:col-span-1">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Where Your Money Goes</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Fee breakdown as a percentage of total revenue
            </p>
          </div>
          <FeeSummary periodParams={periodParams} />
        </section>
      </div>
    </div>
  );
}
