import { clsx } from 'clsx';
import type { Period } from '../../hooks/useDashboard.js';

interface PeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
  /** Custom range start — only shown when value === 'custom' */
  startDate?: string;
  endDate?: string;
  onStartDateChange?: (date: string) => void;
  onEndDateChange?: (date: string) => void;
}

const PRESETS: { value: Period; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'custom', label: 'Custom' },
];

export function PeriodSelector({
  value,
  onChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: PeriodSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset buttons */}
      <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => onChange(preset.value)}
            className={clsx(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              value === preset.value
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Custom date inputs */}
      {value === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate ?? ''}
            onChange={(e) => onStartDateChange?.(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-400">→</span>
          <input
            type="date"
            value={endDate ?? ''}
            onChange={(e) => onEndDateChange?.(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      )}
    </div>
  );
}
