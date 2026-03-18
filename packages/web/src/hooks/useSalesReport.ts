/**
 * useSalesReport hooks
 *
 * TanStack Query hooks for the sales report CSV import + fee auditing API:
 *   useSalesReportImport   — upload CSV (preview + commit)
 *   useImportHistory       — list past imports
 *   useFeeDiscrepancies    — fee audit discrepancies
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api.js';

// =============================================================================
// Types
// =============================================================================

export interface SalesReportPreview {
  mode: 'preview';
  parsed: { totalRows: number; parseErrors: number };
  matching: {
    matched: number;
    unmatched: number;
    alreadyImported: number;
    newImports: number;
  };
  feeSummary: {
    totalSuccessFeeCents: number;
    totalFulfilmentFeeCents: number;
    totalCourierCollectionFeeCents: number;
    totalStockTransferFeeCents: number;
    totalGrossSalesCents: number;
    totalNetSalesCents: number;
  };
  parseErrors: Array<{ line: number; message: string }>;
  unmatchedSample: Array<{ orderId: number; productTitle: string; orderDate: string }>;
}

export interface SalesReportCommitResult {
  mode: 'commit';
  importId: string;
  updated: number;
  unmatched: number;
  parseErrors: number;
  message: string;
}

export interface SalesReportImportRecord {
  id: string;
  fileName: string;
  rowCount: number;
  matchedCount: number;
  unmatchedCount: number;
  updatedCount: number;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

export interface FeeDiscrepancy {
  id: string;
  orderId: string;
  feeType: string;
  actualCents: number;
  calculatedCents: number;
  discrepancyCents: number;
  discrepancyPct: string;
  status: string;
  createdAt: string;
}

export interface FeeDiscrepancySummary {
  totalDiscrepancyCents: number;
  count: number;
  overchargedCents: number;
  underchargedCents: number;
}

// =============================================================================
// Sales Report Import (Preview + Commit)
// =============================================================================

export function useSalesReportImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { mode: 'preview' | 'commit'; csvText: string; fileName?: string }) => {
      const res = await api.post('/sales-report/import', data);
      return res.data as SalesReportPreview | SalesReportCommitResult;
    },
    onSuccess: (result) => {
      if (result.mode === 'commit') {
        // Invalidate all affected queries after committing
        queryClient.invalidateQueries({ queryKey: ['import-history'] });
        queryClient.invalidateQueries({ queryKey: ['fee-discrepancies'] });
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

export function useImportHistory() {
  return useQuery({
    queryKey: ['import-history'],
    queryFn: async () => {
      const res = await api.get('/sales-report/imports');
      return res.data.imports as SalesReportImportRecord[];
    },
    staleTime: 60_000,
  });
}

// =============================================================================
// Fee Discrepancies (Audit)
// =============================================================================

export function useFeeDiscrepancies(params?: { status?: string; limit?: number }) {
  return useQuery({
    queryKey: ['fee-discrepancies', params],
    queryFn: async () => {
      const res = await api.get('/sales-report/discrepancies', { params });
      return res.data as {
        discrepancies: FeeDiscrepancy[];
        summary: FeeDiscrepancySummary;
      };
    },
    staleTime: 30_000,
  });
}
