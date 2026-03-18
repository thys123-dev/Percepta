import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, Key, Loader2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { apiClient } from '../services/api.js';
import { useSyncStatus } from '../hooks/useSyncStatus.js';

type OnboardingStep = 'connect' | 'syncing' | 'complete';

export function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<OnboardingStep>('connect');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Poll sync status once we've connected the API key
  const { data: syncStatus } = useSyncStatus();

  // When sync completes, advance to done state
  if (step === 'syncing' && syncStatus?.status === 'complete') {
    setStep('complete');
  }

  // Connect API key mutation
  const connectMutation = useMutation({
    mutationFn: (key: string) =>
      apiClient.post('/sellers/connect', { apiKey: key }).then((r) => r.data),
    onSuccess: () => {
      setError(null);
      setStep('syncing');
      // Start polling sync status
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setError(
        err.response?.data?.message ?? 'Failed to connect. Please check your API key.'
      );
    },
  });

  const handleConnect = () => {
    setError(null);
    if (!apiKey.trim()) {
      setError('Please paste your Takealot API key.');
      return;
    }
    connectMutation.mutate(apiKey.trim());
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg">
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
        <div className="mb-6 flex items-center justify-center gap-2">
          {(['connect', 'syncing', 'complete'] as OnboardingStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold
                  ${step === s ? 'bg-brand-600 text-white' : i < ['connect', 'syncing', 'complete'].indexOf(step) ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}
              >
                {i + 1}
              </div>
              {i < 2 && <div className="h-px w-8 bg-gray-200" />}
            </div>
          ))}
        </div>

        <div className="card">
          {/* ---- Step 1: Connect API Key ---- */}
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

                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    <XCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
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

          {/* ---- Step 2: Syncing ---- */}
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
                We're fetching your products and last 180 days of sales from Takealot.
                This takes 2–5 minutes.
              </p>

              {/* Live counts */}
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
                You'll be redirected to your dashboard automatically when sync completes.
              </p>
            </div>
          )}

          {/* ---- Step 3: Complete ---- */}
          {step === 'complete' && (
            <div className="py-4 text-center">
              <div className="mb-4 flex justify-center">
                <CheckCircle className="h-16 w-16 text-green-500" />
              </div>

              <h2 className="mb-1 text-lg font-semibold text-gray-900">
                Your data is ready!
              </h2>
              <p className="mb-6 text-sm text-gray-500">
                We synced{' '}
                <span className="font-semibold text-gray-900">
                  {syncStatus?.counts?.offers?.toLocaleString() ?? '—'} products
                </span>{' '}
                and{' '}
                <span className="font-semibold text-gray-900">
                  {syncStatus?.counts?.orders?.toLocaleString() ?? '—'} orders
                </span>
                .
              </p>

              <button
                onClick={() => navigate('/dashboard')}
                className="btn-primary w-full"
              >
                View My Profit Dashboard →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
