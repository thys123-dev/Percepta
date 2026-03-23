/**
 * useRealtimeUpdates hook
 *
 * Subscribes to Socket.io real-time events and invalidates TanStack Query
 * caches so the dashboard refreshes automatically when:
 *
 *   - A new Takealot order arrives (profit:update event)
 *   - A new alert fires (alert:new event)
 *
 * This is what makes Percepta's dashboard real-time vs. competitors'
 * daily batch updates.
 *
 * Usage:
 *   // Mount this once at the app root or dashboard layout
 *   useRealtimeUpdates();
 */

import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from './useSocket.js';

export interface ProfitUpdateEvent {
  calculated: number;
  lossMakers: number;
  triggeredBy: 'webhook' | 'daily-sync' | 'cogs-update';
  timestamp: string;
}

export interface AlertNewEvent {
  alertId: string;
  alertType: string;
  title: string;
  severity: string;
  timestamp: string;
}

export function useRealtimeUpdates() {
  const queryClient = useQueryClient();
  const { socket, connected } = useSocket();

  // When a new order's profit is calculated (triggered by webhook)
  const handleProfitUpdate = useCallback(
    (event: ProfitUpdateEvent) => {
      console.info('[RT] Profit update received:', event);

      // Invalidate dashboard and product table queries
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['profit-calculations'] });
    },
    [queryClient]
  );

  // When a new alert fires (loss-maker, margin drop, storage warning)
  const handleAlertNew = useCallback(
    (_event: AlertNewEvent) => {
      // Invalidate alerts badge count
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      void queryClient.invalidateQueries({ queryKey: ['alerts-unread-count'] });
    },
    [queryClient]
  );

  useEffect(() => {
    if (!socket) return;

    socket.on('profit:update', handleProfitUpdate);
    socket.on('alert:new', handleAlertNew);

    return () => {
      socket.off('profit:update', handleProfitUpdate);
      socket.off('alert:new', handleAlertNew);
    };
  }, [socket, handleProfitUpdate, handleAlertNew]);

  return { connected };
}
