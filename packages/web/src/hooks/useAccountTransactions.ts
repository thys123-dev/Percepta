/**
 * useAccountTransactions hooks
 *
 * TanStack Query hooks for the Account Transactions CSV import API:
 *   useAccountTransactionImport     — upload CSV (preview + commit)
 *   useAccountTransactionHistory    — list past imports
 *   useAccountTransactionSummary    — breakdown by transaction type
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api.js';
import type {
  AccountTransactionPreview,
  AccountTransactionCommitResult,
} from '@percepta/shared';

// =============================================================================
// Types
// =============================================================================

export interface AccountTransactionImportRecord {
  id: string;
  fileName: string;
  rowCount: number;
  insertedCount: number;
  duplicateCount: number;
  ordersUpdated: number;
  status: string;
  errorMessage: string | null;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  createdAt: string;
}

export interface TransactionTypeSummary {
  transactionType: string;
  count: number;
  totalExclVatCents: number;
  totalVatCents: number;
  totalInclVatCents: number;
}

export interface SellerCostRecord {
  id: string;
  month: string;
  costType: string;
  totalExclVatCents: number;
  totalVatCents: number;
  totalInclVatCents: number;
  transactionCount: number;
}

// =============================================================================
// Account Transaction Import (Preview + Commit)
// =============================================================================

export function useAccountTransactionImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { mode: 'preview' | 'commit'; csvText: string; fileName?: string }) => {
      const res = await api.post('/account-transactions/import', data);
      return res.data as AccountTransactionPreview | AccountTransactionCommitResult;
    },
    onSuccess: (result) => {
      if (result.mode === 'commit') {
        queryClient.invalidateQueries({ queryKey: ['acct-txn-import-history'] });
        queryClient.invalidateQueries({ queryKey: ['acct-txn-summary'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
        queryClient.invalidateQueries({ queryKey: ['fee-summary'] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
      }
    },
  });
}

// =============================================================================
// Import History
// =============================================================================

export function useAccountTransactionHistory() {
  return useQuery({
    queryKey: ['acct-txn-import-history'],
    queryFn: async () => {
      const res = await api.get('/account-transactions/imports');
      return res.data.imports as AccountTransactionImportRecord[];
    },
    staleTime: 60_000,
  });
}

// =============================================================================
// Summary — Breakdown by transaction type for a date range
// =============================================================================

export function useAccountTransactionSummary(params?: { startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: ['acct-txn-summary', params],
    queryFn: async () => {
      const res = await api.get('/account-transactions/summary', { params });
      return res.data as {
        byType: TransactionTypeSummary[];
        costs: SellerCostRecord[];
        dateRange: { start: string; end: string };
      };
    },
    staleTime: 60_000,
  });
}
