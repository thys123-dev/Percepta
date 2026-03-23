/**
 * AlertsPage
 *
 * Full-page alert list with:
 *   - Filter tabs: All / Loss-Maker / Margin Drop / Storage Warning
 *   - Unread vs read visual distinction
 *   - Mark individual alert as read
 *   - Mark all as read button
 *   - Severity colour coding (critical = red, warning = amber, info = blue)
 *   - Pagination
 */

import { useState } from 'react';
import {
  AlertTriangle,
  TrendingDown,
  Package,
  CheckCircle2,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  useAlerts,
  useMarkAlertRead,
  useMarkAllRead,
  type AlertType,
  type AlertRow,
} from '../hooks/useAlerts.js';
import { formatDate } from '../utils/format.js';

// Tab filter options
const TABS: { value: AlertType | 'all'; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'All', icon: null },
  { value: 'loss_maker', label: 'Loss-Makers', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { value: 'margin_drop', label: 'Margin Drops', icon: <TrendingDown className="h-3.5 w-3.5" /> },
  { value: 'storage_warning', label: 'Storage', icon: <Package className="h-3.5 w-3.5" /> },
];

// Severity config
const SEVERITY_STYLES: Record<string, { border: string; bg: string; icon: string }> = {
  critical: {
    border: 'border-l-red-500',
    bg: 'bg-red-50',
    icon: 'text-red-500',
  },
  warning: {
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-50',
    icon: 'text-yellow-500',
  },
  info: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-50',
    icon: 'text-blue-500',
  },
};

function AlertIcon({ type }: { type: string }) {
  switch (type) {
    case 'loss_maker':
      return <AlertTriangle className="h-5 w-5" />;
    case 'margin_drop':
      return <TrendingDown className="h-5 w-5" />;
    case 'storage_warning':
      return <Package className="h-5 w-5" />;
    default:
      return <AlertTriangle className="h-5 w-5" />;
  }
}

function AlertCard({
  alert,
  onMarkRead,
}: {
  alert: AlertRow;
  onMarkRead: (id: string) => void;
}) {
  const styles = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.info;

  return (
    <div
      className={clsx(
        'flex gap-3 rounded-lg border-l-4 p-4 transition-all',
        styles.border,
        alert.isRead ? 'bg-white opacity-60' : styles.bg
      )}
    >
      {/* Icon */}
      <div className={clsx('mt-0.5 flex-shrink-0', styles.icon)}>
        <AlertIcon type={alert.alertType} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3
            className={clsx(
              'text-sm',
              alert.isRead ? 'font-medium text-gray-600' : 'font-semibold text-gray-900'
            )}
          >
            {alert.title}
          </h3>
          <span className="flex-shrink-0 text-xs text-gray-400">
            {formatDate(alert.createdAt)}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-600">{alert.message}</p>

        {/* Actions */}
        {!alert.isRead && (
          <button
            onClick={() => onMarkRead(alert.id)}
            className="mt-2 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Mark as read
          </button>
        )}
      </div>
    </div>
  );
}

export function AlertsPage() {
  const [activeTab, setActiveTab] = useState<AlertType | 'all'>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAlerts({
    type: activeTab === 'all' ? undefined : activeTab,
    page,
    limit: 20,
  });

  const markRead = useMarkAlertRead();
  const markAllRead = useMarkAllRead();

  const alerts = data?.data ?? [];
  const pagination = data?.pagination;
  const hasUnread = alerts.some((a) => !a.isRead);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Alerts</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Proactive notifications for loss-makers, margin drops, and storage risks
          </p>
        </div>

        {hasUnread && (
          <button
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setActiveTab(tab.value);
              setPage(1);
            }}
            className={clsx(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              activeTab === tab.value
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Alert list */}
      <div className="space-y-3">
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />
          ))}

        {!isLoading && alerts.length === 0 && (
          <div className="card flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="mb-3 h-12 w-12 text-green-400" />
            <p className="text-lg font-medium text-gray-700">All clear!</p>
            <p className="mt-1 text-sm text-gray-500">
              {activeTab === 'all'
                ? 'No alerts — your business is running smoothly.'
                : `No ${TABS.find((t) => t.value === activeTab)?.label.toLowerCase()} alerts.`}
            </p>
          </div>
        )}

        {!isLoading &&
          alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onMarkRead={(id) => markRead.mutate(id)}
            />
          ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} alerts)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page >= pagination.totalPages}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
