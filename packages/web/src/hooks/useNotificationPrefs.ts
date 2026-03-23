/**
 * useNotificationPrefs
 *
 * TanStack Query hooks for reading and updating email notification preferences.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api.js';

export interface NotificationPrefs {
  emailWeeklyDigest: boolean;
  emailLossAlerts: boolean;
  emailMarginThreshold: number;
  lastWeeklyDigestAt: string | null;
}

export interface UpdatePrefsPayload {
  emailWeeklyDigest?: boolean;
  emailLossAlerts?: boolean;
  emailMarginThreshold?: number;
}

export function useNotificationPrefs() {
  return useQuery<NotificationPrefs>({
    queryKey: ['notification-prefs'],
    queryFn: async () => {
      const { data } = await api.get<NotificationPrefs>('/email/preferences');
      return data;
    },
  });
}

export function useUpdateNotificationPrefs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdatePrefsPayload) => {
      await api.patch('/email/preferences', payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-prefs'] });
    },
  });
}
