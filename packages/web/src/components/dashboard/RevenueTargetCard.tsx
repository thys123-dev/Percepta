/**
 * RevenueTargetCard — Option 2: Radial Gauge
 *
 * Displays the seller's progress towards their self-set monthly revenue target.
 * - Gauge animates on mount via CSS transition on stroke-dashoffset.
 * - Colour: green ≥75%, amber 50–74%, red <50%.
 * - "Edit target" button opens an inline modal to set/update the target.
 * - Empty state CTA shown when no target has been set yet.
 */

import { useState, useEffect, useRef } from 'react';
import { Target, TrendingUp, AlertTriangle, CheckCircle, Edit2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRevenueTarget } from '../../hooks/useDashboard.js';
import api from '../../services/api.js';
import { clsx } from 'clsx';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRands(cents: number): string {
  const rands = cents / 100;
  if (rands >= 1_000_000) return `R ${(rands / 1_000_000).toFixed(1)}M`;
  if (rands >= 1_000) return `R ${(rands / 1_000).toFixed(1)}k`;
  return `R ${Math.round(rands).toLocaleString()}`;
}

// ── Radial Gauge ─────────────────────────────────────────────────────────────

const RADIUS = 74;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ≈ 464.96

function gaugeColor(pct: number): string {
  if (pct >= 75) return '#10b981'; // green
  if (pct >= 50) return '#f59e0b'; // amber
  return '#ef4444';               // red
}

interface GaugeProps {
  pct: number; // 0–100
}

function RadialGauge({ pct }: GaugeProps) {
  const [displayed, setDisplayed] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Animate from 0 → pct over ~900ms
    const start = performance.now();
    const duration = 900;
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(eased * pct);
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [pct]);

  const offset = CIRCUMFERENCE * (1 - displayed / 100);
  const color = gaugeColor(pct);

  return (
    <div className="relative flex-shrink-0" style={{ width: 180, height: 180 }}>
      <svg width="180" height="180" viewBox="0 0 180 180">
        {/* Track */}
        <circle
          cx="90" cy="90" r={RADIUS}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="14"
          style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
        />
        {/* Fill */}
        <circle
          cx="90" cy="90" r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
        />
      </svg>
      {/* Centre label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-gray-900">{Math.round(displayed)}%</span>
        <span className="text-xs text-gray-500 mt-0.5">of target</span>
      </div>
    </div>
  );
}

// ── Status Pill ───────────────────────────────────────────────────────────────

interface StatusPillProps {
  pct: number;
  daysRemaining: number;
  dailyPaceNeededCents: number;
  currentDailyAvgCents: number;
}

function StatusPill({ pct, daysRemaining, dailyPaceNeededCents, currentDailyAvgCents }: StatusPillProps) {
  const onTrack = currentDailyAvgCents >= dailyPaceNeededCents;

  if (pct >= 100) {
    return (
      <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-green-200">
        <CheckCircle className="w-3.5 h-3.5" />
        Target reached! 🎉
      </span>
    );
  }

  if (daysRemaining <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200">
        Month ended — {Math.round(pct)}% of target reached
      </span>
    );
  }

  if (onTrack) {
    return (
      <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-green-200">
        <TrendingUp className="w-3.5 h-3.5" />
        On track — current daily avg covers target pace
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 bg-orange-50 text-orange-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-orange-200">
      <AlertTriangle className="w-3.5 h-3.5" />
      Behind pace — need {formatRands(dailyPaceNeededCents)}/day to hit target
    </span>
  );
}

// ── Edit Target Modal ─────────────────────────────────────────────────────────

interface EditTargetModalProps {
  currentTargetCents?: number;
  onClose: () => void;
}

function EditTargetModal({ currentTargetCents, onClose }: EditTargetModalProps) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(
    currentTargetCents != null ? String(Math.round(currentTargetCents / 100)) : ''
  );

  const { mutate, isPending } = useMutation({
    mutationFn: (targetRands: number) =>
      api.patch('/sellers/profile', { monthlyRevenuTargetCents: Math.round(targetRands * 100) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['revenue-target'] });
      onClose();
    },
  });

  const handleSave = () => {
    const rands = parseFloat(value);
    if (!isNaN(rands) && rands >= 0) mutate(rands);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          ✕
        </button>
        <h3 className="text-base font-bold text-gray-900">Set Monthly Revenue Target</h3>
        <p className="text-xs text-gray-500 mt-1">
          Your gross revenue goal for the current calendar month.
        </p>
        <div className="mt-4">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            Target amount (ZAR)
          </label>
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500">
            <span className="px-3 py-2.5 bg-gray-50 text-gray-500 text-sm font-semibold border-r border-gray-300">
              R
            </span>
            <input
              type="number"
              min="0"
              step="1000"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              className="flex-1 px-3 py-2.5 text-sm font-semibold text-gray-900 outline-none"
              placeholder="e.g. 80000"
              autoFocus
            />
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={isPending || value === ''}
          className="mt-5 w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          {isPending ? 'Saving…' : 'Save target'}
        </button>
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  onSet: () => void;
}

function EmptyState({ onSet }: EmptyStateProps) {
  return (
    <div className="card p-6 flex flex-col sm:flex-row items-center gap-4">
      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
        <Target className="w-6 h-6 text-emerald-600" />
      </div>
      <div className="flex-1 text-center sm:text-left">
        <p className="text-sm font-semibold text-gray-900">Set your monthly revenue target</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Track your progress towards a revenue goal for this month.
        </p>
      </div>
      <button
        onClick={onSet}
        className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        Set target
      </button>
    </div>
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="card p-6 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="h-4 w-48 bg-gray-100 rounded" />
        <div className="h-7 w-24 bg-gray-100 rounded-lg" />
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-8">
        <div className="w-44 h-44 rounded-full bg-gray-100 flex-shrink-0" />
        <div className="flex-1 grid grid-cols-2 gap-4 w-full">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-4">
              <div className="h-3 w-20 bg-gray-200 rounded mb-2" />
              <div className="h-6 w-24 bg-gray-200 rounded" />
            </div>
          ))}
          <div className="col-span-2 h-8 w-64 bg-gray-100 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function RevenueTargetCard() {
  const { data, isLoading } = useRevenueTarget();
  const [modalOpen, setModalOpen] = useState(false);

  if (isLoading) return <LoadingSkeleton />;

  if (!data || !data.targetSet) {
    return (
      <>
        <EmptyState onSet={() => setModalOpen(true)} />
        {modalOpen && <EditTargetModal onClose={() => setModalOpen(false)} />}
      </>
    );
  }

  const {
    targetCents = 0,
    currentRevenueCents = 0,
    percentComplete = 0,
    daysInMonth = 30,
    daysRemaining = 0,
    dailyPaceNeededCents = 0,
    currentDailyAvgCents = 0,
  } = data;

  const stillNeededCents = Math.max(0, targetCents - currentRevenueCents);

  return (
    <>
      <div className="card p-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                Monthly Revenue Target
              </span>
            </div>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Edit target
          </button>
        </div>

        {/* Body: gauge + stats */}
        <div className="flex flex-col sm:flex-row items-center gap-8">
          <RadialGauge pct={percentComplete} />

          <div className="flex-1 grid grid-cols-2 gap-4 w-full">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500">Revenue earned</p>
              <p className="text-xl font-bold text-gray-900 mt-1">
                {formatRands(currentRevenueCents)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500">Target</p>
              <p className="text-xl font-bold text-gray-900 mt-1">
                {formatRands(targetCents)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500">
                {percentComplete >= 100 ? 'Exceeded by' : 'Still needed'}
              </p>
              <p
                className={clsx('text-xl font-bold mt-1', {
                  'text-green-600': percentComplete >= 100,
                  'text-orange-500': percentComplete < 100,
                })}
              >
                {percentComplete >= 100
                  ? formatRands(currentRevenueCents - targetCents)
                  : formatRands(stillNeededCents)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500">Days left</p>
              <p className="text-xl font-bold text-gray-900 mt-1">
                {daysRemaining}{' '}
                <span className="text-sm font-normal text-gray-400">of {daysInMonth}</span>
              </p>
            </div>

            {/* Status pill */}
            <div className="col-span-2">
              <StatusPill
                pct={percentComplete}
                daysRemaining={daysRemaining}
                dailyPaceNeededCents={dailyPaceNeededCents}
                currentDailyAvgCents={currentDailyAvgCents}
              />
            </div>
          </div>
        </div>
      </div>

      {modalOpen && (
        <EditTargetModal
          currentTargetCents={targetCents}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
