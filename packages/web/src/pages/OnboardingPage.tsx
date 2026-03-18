import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp,
  Key,
  Loader2,
  CheckCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  PackageCheck,
  ChevronRight,
  SkipForward,
  DollarSign,
} from 'lucide-react';
import { apiClient } from '../services/api.js';
import { useSyncStatus } from '../hooks/useSyncStatus.js';
import { useDashboardSummary } from '../hooks/useDashboard.js';
import { useOfferList, useUpdateCogs } from '../hooks/useCogsImport.js';
import { formatCurrency, formatPct } from '../utils/format.js';

// =============================================================================
// Step type
// =============================================================================

type OnboardingStep = 'connect' | 'syncing' | 'cogs' | 'aha';

const STEP_LABELS: Record<OnboardingStep, string> = {
  connect: 'Connect',
  syncing: 'Syncing',
  cogs: 'Set COGS',
  aha: 'Your profits',
};

const STEPS: OnboardingStep[] = ['connect', 'syncing', 'cogs', 'aha'];

// =============================================================================
// OnboardingPage
// =============================================================================

export function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<OnboardingStep>('connect');
  const [apiKey, setApiKey] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);

  // Inline COGS editing state: offerId → { cogsCents, inboundCostCents }
  const [cogsEdits, setCogsEdits] = useState<
    Record<number, { cogsCents: string; inboundCostCents: string }>
  >({});
  const [cogsSaveError, setCogsSaveError] = useState<string | null>(null);

  // ── Poll sync status ──────────────────────────────────────────────────────
  const { data: syncStatus } = useSyncStatus();

  // Advance syncing → cogs when sync completes
  if (step === 'syncing' && syncStatus?.status === 'complete') {
    setStep('cogs');
  }

  // ── Dashboard summary for aha moment ─────────────────────────────────────
  const { data: summary } = useDashboardSummary(
    { period: '30d' },
  );

  // ── Offers for COGS step (top 15 by sales) ────────────────────────────────
  const { data: offersData, isLoading: offersLoading } = useOfferList({
    sort: 'sales',
    limit: 15,
    page: 1,
  });

  const offers = offersData?.data ?? [];

  // ── Mutations ─────────────────────────────────────────────────────────────
  const connectMutation = useMutation({
    mutationFn: (key: string) =>
      apiClient.post('/sellers/connect', { apiKey: key }).then((r) => r.data),
    onSuccess: () => {
      setConnectError(null);
      setStep('syncing');
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setConnectError(
        err.response?.data?.message ?? 'Failed to connect. Please check your API key.'
      );
    },
  });

  const updateCogsMutation = useUpdateCogs();

  const completeOnboardingMutation = useMutation({
    mutationFn: () =>
      apiClient.patch('/sellers/profile', { onboardingComplete: true }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-me'] });
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleConnect = () => {
    setConnectError(null);
    if (!apiKey.trim()) {
      setConnectError('Please paste your Takealot API key.');
      return;
    }
    connectMutation.mutate(apiKey.trim());
  };

  const handleSaveCogs = async () => {
    setCogsSaveError(null);

    const products = Object.entries(cogsEdits)
      .filter(([, v]) => v.cogsCents !== '')
      .map(([offerId, v]) => ({
        offerId: Number(offerId),
        cogsCents: Math.round(parseFloat(v.cogsCents) * 100),
        inboundCostCents: v.inboundCostCents
          ? Math.round(parseFloat(v.inboundCostCents) * 100)
          : 0,
      }))
      .filter((p) => !isNaN(p.cogsCents) && p.cogsCents >= 0);

    if (products.length > 0) {
      try {
        await updateCogsMutation.mutateAsync(products);
      } catch {
        setCogsSaveError('Failed to save COGS. Please try again.');
        return;
      }
    }
    setStep('aha');
  };

  const handleSkipCogs = () => {
    setStep('aha');
  };

  const handleFinish = async () => {
    await completeOnboardingMutation.mutateAsync();
    navigate('/dashboard');
  };

  // ── Step indicator ────────────────────────────────────────────────────────
  const currentIdx = STEPS.indexOf(step);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600">
            <TrendingUp className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to Percepta</h1>
          <p className="mt-1 text-sm text-gray-500">
            Real-time profit intelligence for Takealot sellers
          </p>
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex items-center justify-center">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors
                    ${s === step
                      ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                      : i < currentIdx
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                >
                  {i < currentIdx ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`hidden text-xs sm:block ${s === step ? 'font-semibold text-brand-700' : 'text-gray-400'}`}
                >
                  {STEP_LABELS[s]}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-2 h-px w-10 sm:w-16 ${i < currentIdx ? 'bg-green-400' : 'bg-gray-200'}`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="card">

          {/* ══ Step 1: Connect ══════════════════════════════════════════════ */}
          {step === 'connect' && (
            <>
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50">
                  <Key className="h-5 w-5 text-brand-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">Connect your Takealot account</h2>
                  <p className="text-sm text-gray-500">Takes about 30 seconds</p>
                </div>
              </div>

              <p className="mb-4 text-sm text-gray-600">
                Paste your Takealot Seller API key below. Find it in your{' '}
                <a
                  href="https://seller.takealot.com/api/seller-api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-600 hover:underline"
                >
                  Seller Portal → API Settings
                </a>
                .
              </p>

              <div className="space-y-3">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                  placeholder="Paste your API key here"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  disabled={connectMutation.isPending}
                  autoComplete="off"
                />

                {connectError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    <XCircle className="h-4 w-4 flex-shrink-0" />
                    {connectError}
                  </div>
                )}

                <button
                  onClick={handleConnect}
                  disabled={connectMutation.isPending || !apiKey.trim()}
                  className="btn-primary w-full"
                >
                  {connectMutation.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Testing connection...
                    </span>
                  ) : (
                    'Connect & Start Sync'
                  )}
                </button>
              </div>

              <p className="mt-4 text-center text-xs text-gray-400">
                🔒 Your API key is encrypted at rest with AES-256 and never shared.
              </p>
            </>
          )}

          {/* ══ Step 2: Syncing ══════════════════════════════════════════════ */}
          {step === 'syncing' && (
            <div className="py-4 text-center">
              <div className="mb-4 flex justify-center">
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <div className="absolute inset-0 animate-ping rounded-full bg-brand-100 opacity-75" />
                  <RefreshCw className="relative h-8 w-8 animate-spin text-brand-600" />
                </div>
              </div>

              <h2 className="mb-1 text-lg font-semibold text-gray-900">
                Syncing your data...
              </h2>
              <p className="mb-6 text-sm text-gray-500">
                We're fetching your products and last 180 days of sales. This takes 2–5 minutes.
              </p>

              {syncStatus?.counts && (
                <div className="mb-6 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-2xl font-bold text-gray-900">
                      {syncStatus.counts.offers.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500">Products found</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-2xl font-bold text-gray-900">
                      {syncStatus.counts.orders.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500">Orders found</div>
                  </div>
                </div>
              )}

              {syncStatus?.status === 'failed' && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  Sync failed. Don't worry — it will retry automatically.
                </div>
              )}

              <p className="text-xs text-gray-400">
                You'll advance automatically once the sync completes.
              </p>
            </div>
          )}

          {/* ══ Step 3: COGS ═════════════════════════════════════════════════ */}
          {step === 'cogs' && (
            <>
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50">
                  <PackageCheck className="h-5 w-5 text-brand-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">
                    Enter your cost of goods (COGS)
                  </h2>
                  <p className="text-sm text-gray-500">
                    This unlocks your true net profit. You can skip and add later.
                  </p>
                </div>
              </div>

              {offersLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />
                  ))}
                </div>
              ) : offers.length === 0 ? (
                <p className="text-center text-sm text-gray-500">No products found yet.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
                        <th className="px-3 py-2 text-left">Product</th>
                        <th className="px-3 py-2 text-right">Price</th>
                        <th className="w-28 px-3 py-2 text-right">COGS (R)</th>
                        <th className="w-28 px-3 py-2 text-right">Inbound (R)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {offers.map((offer) => {
                        const edit = cogsEdits[offer.offerId];
                        const cogsVal = edit?.cogsCents ?? (
                          offer.cogsCents != null ? (offer.cogsCents / 100).toFixed(2) : ''
                        );
                        const inboundVal = edit?.inboundCostCents ?? (
                          offer.inboundCostCents ? (offer.inboundCostCents / 100).toFixed(2) : ''
                        );

                        return (
                          <tr key={offer.offerId} className="hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <div className="max-w-[180px] truncate font-medium text-gray-800">
                                {offer.title ?? `Offer #${offer.offerId}`}
                              </div>
                              {offer.sku && (
                                <div className="text-xs text-gray-400">{offer.sku}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600">
                              {offer.sellingPriceCents != null
                                ? formatCurrency(offer.sellingPriceCents)
                                : '—'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={cogsVal}
                                onChange={(e) =>
                                  setCogsEdits((prev) => ({
                                    ...prev,
                                    [offer.offerId]: {
                                      cogsCents: e.target.value,
                                      inboundCostCents:
                                        prev[offer.offerId]?.inboundCostCents ?? inboundVal.toString(),
                                    },
                                  }))
                                }
                                placeholder="0.00"
                                className="w-full rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={inboundVal}
                                onChange={(e) =>
                                  setCogsEdits((prev) => ({
                                    ...prev,
                                    [offer.offerId]: {
                                      cogsCents: prev[offer.offerId]?.cogsCents ?? cogsVal.toString(),
                                      inboundCostCents: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="0.00"
                                className="w-full rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {cogsSaveError && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  <XCircle className="h-4 w-4 flex-shrink-0" />
                  {cogsSaveError}
                </div>
              )}

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={handleSkipCogs}
                  className="btn-secondary flex items-center gap-1.5"
                >
                  <SkipForward className="h-4 w-4" />
                  Skip for now
                </button>
                <button
                  onClick={handleSaveCogs}
                  disabled={updateCogsMutation.isPending}
                  className="btn-primary flex flex-1 items-center justify-center gap-2"
                >
                  {updateCogsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      Save & Continue
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>

              <p className="mt-3 text-center text-xs text-gray-400">
                You can add or update COGS for all products from the COGS page anytime.
              </p>
            </>
          )}

          {/* ══ Step 4: Aha Moment ═══════════════════════════════════════════ */}
          {step === 'aha' && (
            <div className="py-2 text-center">
              <div className="mb-4 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
                  <CheckCircle className="h-10 w-10 text-green-500" />
                </div>
              </div>

              <h2 className="mb-1 text-xl font-bold text-gray-900">
                Here's your profit snapshot 🎉
              </h2>
              <p className="mb-6 text-sm text-gray-500">
                Based on your last 30 days of sales on Takealot
              </p>

              {summary ? (
                <div className="mb-6 grid grid-cols-2 gap-3 text-left">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                      <DollarSign className="h-3.5 w-3.5" />
                      Revenue (30d)
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatCurrency(summary.totalRevenueCents)}
                    </div>
                  </div>

                  <div
                    className={`rounded-xl border p-4 text-left ${
                      summary.netProfitCents >= 0
                        ? 'border-green-200 bg-green-50'
                        : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <div
                      className={`mb-0.5 text-xs font-medium ${
                        summary.netProfitCents >= 0 ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      Net Profit (30d)
                    </div>
                    <div
                      className={`text-2xl font-bold ${
                        summary.netProfitCents >= 0 ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {formatCurrency(summary.netProfitCents)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-0.5 text-xs font-medium text-gray-500">
                      Profit Margin
                    </div>
                    <div
                      className={`text-2xl font-bold ${
                        summary.profitMarginPct >= 25
                          ? 'text-green-700'
                          : summary.profitMarginPct >= 0
                            ? 'text-yellow-600'
                            : 'text-red-700'
                      }`}
                    >
                      {formatPct(summary.profitMarginPct)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-0.5 text-xs font-medium text-gray-500">
                      Orders (30d)
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                      {summary.orderCount.toLocaleString()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-6 grid grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
                  ))}
                </div>
              )}

              {summary?.lossMakerCount != null && summary.lossMakerCount > 0 && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  ⚠️ You have{' '}
                  <strong>{summary.lossMakerCount} loss-making product{summary.lossMakerCount > 1 ? 's' : ''}</strong>.
                  {' '}Your dashboard will show you exactly which ones.
                </div>
              )}

              <button
                onClick={handleFinish}
                disabled={completeOnboardingMutation.isPending}
                className="btn-primary w-full"
              >
                {completeOnboardingMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading dashboard...
                  </span>
                ) : (
                  'View My Full Dashboard →'
                )}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
