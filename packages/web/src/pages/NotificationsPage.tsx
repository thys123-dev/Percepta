/**
 * Notifications Page
 *
 * Lets sellers configure email notification preferences:
 *  - Weekly digest (every Sunday)
 *  - Real-time loss alerts with configurable margin threshold
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, Bell, TrendingDown, Clock, CheckCircle } from 'lucide-react';
import { useNotificationPrefs, useUpdateNotificationPrefs } from '../hooks/useNotificationPrefs.js';

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
        checked ? 'bg-brand-600' : 'bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function NotificationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: prefs, isLoading } = useNotificationPrefs();
  const update = useUpdateNotificationPrefs();

  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [lossAlerts, setLossAlerts] = useState(true);
  const [marginThreshold, setMarginThreshold] = useState(15);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (prefs) {
      setWeeklyDigest(prefs.emailWeeklyDigest);
      setLossAlerts(prefs.emailLossAlerts);
      setMarginThreshold(prefs.emailMarginThreshold);
    }
  }, [prefs]);

  // Handle ?disable= query param from email unsubscribe links
  useEffect(() => {
    const disable = searchParams.get('disable');
    if (!disable || !prefs) return;

    const payload: Record<string, boolean> = {};
    if (disable === 'emailWeeklyDigest' && prefs.emailWeeklyDigest) {
      payload.emailWeeklyDigest = false;
      setWeeklyDigest(false);
    } else if (disable === 'emailLossAlerts' && prefs.emailLossAlerts) {
      payload.emailLossAlerts = false;
      setLossAlerts(false);
    }

    if (Object.keys(payload).length > 0) {
      update.mutateAsync(payload).then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      });
    }

    // Clear the query param so it doesn't re-trigger
    setSearchParams({}, { replace: true });
  }, [searchParams, prefs]);

  const handleSave = async () => {
    await update.mutateAsync({
      emailWeeklyDigest: weeklyDigest,
      emailLossAlerts: lossAlerts,
      emailMarginThreshold: marginThreshold,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const lastDigestLabel = prefs?.lastWeeklyDigestAt
    ? new Date(prefs.lastWeeklyDigestAt).toLocaleDateString('en-ZA', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Not yet sent';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notification Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure how and when Percepta sends you email alerts.
        </p>
      </div>

      {/* Weekly Digest Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-50 p-2">
              <Mail className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Weekly Profit Report</h2>
              <p className="mt-1 text-sm text-gray-500">
                Sent every Sunday morning with your weekly revenue, profit, top/bottom performers,
                and one actionable recommendation.
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                <Clock className="h-3.5 w-3.5" />
                <span>Last sent: {lastDigestLabel}</span>
              </div>
            </div>
          </div>
          <ToggleSwitch
            checked={weeklyDigest}
            onChange={setWeeklyDigest}
            disabled={update.isPending}
          />
        </div>
      </div>

      {/* Loss Alerts Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-red-50 p-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-gray-900">Real-Time Loss Alerts</h2>
              <p className="mt-1 text-sm text-gray-500">
                Instant email when a product sells at a loss, or when a product's margin drops below
                your threshold.
              </p>

              {/* Threshold input */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Alert when margin drops below
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={marginThreshold}
                    onChange={(e) => setMarginThreshold(Number(e.target.value))}
                    disabled={!lossAlerts || update.isPending}
                    className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  You'll receive an email any time a product's margin falls below this number.
                </p>
              </div>
            </div>
          </div>
          <ToggleSwitch
            checked={lossAlerts}
            onChange={setLossAlerts}
            disabled={update.isPending}
          />
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <div className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle className="h-4 w-4" />
            Preferences saved
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={update.isPending}
          className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {update.isPending ? 'Saving…' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}
