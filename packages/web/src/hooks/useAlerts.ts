/**
 * useAlerts hooks
 *
 * TanStack Query hooks for the alert system:
 *   useAlerts         — paginated alert list (supports type/severity/unread filters)
 *   useUnreadCount    — badge number for notification bell
 *   useMarkAlertRead  — mutation to mark a single alert read
 *   useMarkAllRead    — mutation to mark all alerts read
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api.js';

// =============================================================================
// Types
// =============================================================================

export type AlertType = 'loss_maker' | 'margin_drop' | 'storage_warning' | 'fee_overcharge' | 'low_stock';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertRow {
  id: string;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  offerId: number | null;
  actionUrl: string | null;
  isRead: boolean;
  isActedUpon: boolean;
  createdAt: string;
}

export interface AlertsParams {
  type?: AlertType;
  severity?: AlertSeverity;
  unreadOnly?: boolean;
  limit?: number;
  page?: number;
}

interface AlertsResponse {
  data: AlertRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

// =============================================================================
// Hooks
// =============================================================================

export function useAlerts(params: AlertsParams = {}) {
  return useQuery<AlertsResponse>({
    queryKey: ['alerts', params],
    queryFn: () =>
      api.get<AlertsResponse>('/alerts', { params }).then((r) => r.data),
  });
}

export function useUnreadCount() {
  return useQuery<{ count: number }>({
    queryKey: ['alerts-unread-count'],
    queryFn: () =>
      api.get<{ count: number }>('/alerts/unread-count').then((r) => r.data),
    refetchInterval: 30_000, // Poll every 30s as a fallback (WebSocket handles real-time)
  });
}

export function useMarkAlertRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (alertId: string) =>
      api.patch(`/alerts/${alertId}/read`).then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      void queryClient.invalidateQueries({ queryKey: ['alerts-unread-count'] });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.patch('/alerts/read-all').then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      void queryClient.invalidateQueries({ queryKey: ['alerts-unread-count'] });
    },
  });
}
