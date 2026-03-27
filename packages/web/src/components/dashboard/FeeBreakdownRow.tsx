/**
 * FeeBreakdownRow
 *
 * Renders as a <tr> inside the product table's <tbody> when a row is expanded.
 * Fetches and displays the fee waterfall for the most recent order of a given offer.
 *
 * Waterfall: Selling Price → −Success Fee → −Fulfilment Fee → −IBT? → −Storage? → −COGS → −Inbound? → Net Profit
 */

import { clsx } from 'clsx';
import { useProductFees } from '../../hooks/useDashboard.js';
import { formatCurrency, formatPct, formatDate } from '../../utils/format.js';

interface WaterfallStep {
  label: string;
  /** Raw cent value (always positive for deductions) */
  cents: number;
  isDeduction: boolean;
  isFinal?: boolean;
}

interface FeeBreakdownRowProps {
  offerId: number;
  /** Number of table columns — needed for colSpan */
  colSpan: number;
}

export function FeeBreakdownRow({ offerId, colSpan }: FeeBreakdownRowProps) {
  const { data, isLoading, isError } = useProductFees(offerId);

  // ─── Loading skeleton ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <tr>
        <td colSpan={colSpan} className="border-b border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-14 w-24 animate-pulse rounded-lg bg-gray-200" />
                {i < 6 && <span className="text-gray-300">→</span>}
              </div>
            ))}
          </div>
        </td>
      </tr>
    );
  }

  // ─── Error / no data ─────────────────────────────────────────────────────────
  if (isError || !data?.data) {
    return (
      <tr>
        <td
          colSpan={colSpan}
          className="border-b border-gray-200 bg-gray-50 px-6 py-3 text-sm text-gray-400"
        >
          No fee data available for this product.
        </td>
      </tr>
    );
  }

  const fee = data.data;

  // Build the waterfall steps
  const steps: WaterfallStep[] = [
    {
      label: 'Selling Price',
      cents: fee.unitSellingPriceCents,
      isDeduction: false,
    },
    {
      label: 'Success Fee',
      cents: fee.successFeeCents,
      isDeduction: true,
    },
    {
      label: 'Fulfilment Fee',
      cents: fee.fulfilmentFeeCents,
      isDeduction: true,
    },
    ...(fee.ibtPenaltyCents > 0
      ? [{ label: 'IBT Penalty', cents: fee.ibtPenaltyCents, isDeduction: true }]
      : []),
    ...(fee.storageFeeAllocatedCents > 0
      ? [{ label: 'Storage Fee', cents: fee.storageFeeAllocatedCents, isDeduction: true }]
      : []),
    ...(fee.vatOnFeesCents > 0
      ? [{ label: 'VAT on Fees', cents: fee.vatOnFeesCents, isDeduction: true }]
      : []),
    { label: 'COGS', cents: fee.cogsCents, isDeduction: true },
    ...(fee.inboundCostCents > 0
      ? [{ label: 'Inbound Cost', cents: fee.inboundCostCents, isDeduction: true }]
      : []),
    {
      label: 'Net Profit',
      cents: fee.netProfitCents,
      isDeduction: false,
      isFinal: true,
    },
  ];

  const isProfit = fee.netProfitCents >= 0;

  return (
    <tr>
      <td colSpan={colSpan} className="border-b border-gray-200 bg-gray-50 px-6 py-4">
        {/* Waterfall strip */}
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
          {steps.map((step, idx) => {
            const isFinalProfit = step.isFinal;
            const isSource = !step.isDeduction && !step.isFinal;

            const boxClass = clsx('flex flex-col rounded-lg border px-3 py-2 min-w-[90px]', {
              // Selling price (source)
              'bg-blue-50 border-blue-200': isSource,
              // Deduction
              'bg-red-50 border-red-100': step.isDeduction,
              // Final: profit or loss
              'bg-green-50 border-green-200': isFinalProfit && isProfit,
              'bg-red-100 border-red-300': isFinalProfit && !isProfit,
            });

            const labelClass = 'text-[11px] font-medium text-gray-500 whitespace-nowrap';
            const valueClass = clsx('text-sm font-bold whitespace-nowrap', {
              'text-blue-700': isSource,
              'text-red-600': step.isDeduction,
              'text-green-700': isFinalProfit && isProfit,
              'text-red-700': isFinalProfit && !isProfit,
            });

            // Deductions show their magnitude (positive display) with a minus sign
            // Final value is shown as-is (can be negative)
            const displayValue = isFinalProfit
              ? formatCurrency(step.cents)
              : step.isDeduction
                ? `−${formatCurrency(Math.abs(step.cents))}`
                : formatCurrency(step.cents);

            return (
              <div key={idx} className="flex flex-shrink-0 items-center gap-2">
                <div className={boxClass}>
                  <span className={labelClass}>{step.label}</span>
                  <span className={valueClass}>{displayValue}</span>
                </div>
                {idx < steps.length - 1 && (
                  <span className="flex-shrink-0 text-sm text-gray-300">→</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Meta row */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>
            Margin:{' '}
            <strong className={fee.marginPct >= 0 ? 'text-green-700' : 'text-red-600'}>
              {formatPct(fee.marginPct)}
            </strong>
          </span>

          {fee.quantity > 1 && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">
              Per unit · order qty: {fee.quantity}
            </span>
          )}

          {fee.cogsIsEstimated && (
            <span className="flex items-center gap-1 text-yellow-600">
              ⚠ COGS estimated — enter actual cost for accurate numbers
            </span>
          )}

          {fee.isIbt && (
            <span className="text-orange-600">⚡ Inter-branch transfer (IBT penalty applied)</span>
          )}

          <span>Based on order: {formatDate(fee.orderDate)}</span>
        </div>
      </td>
    </tr>
  );
}
