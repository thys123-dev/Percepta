/**
 * useSalesReport hooks — Week 8 expanded
 *
 * TanStack Query hooks for the sales report CSV import + fee auditing API:
 *   useSalesReportImport        — upload CSV (preview + commit)
 *   useImportHistory            — list past imports
 *   useFeeDiscrepancies         — enhanced discrepancy listing with product context
 *   useUpdateDiscrepancyStatus  — PATCH single status
 *   useBulkUpdateStatus         — PATCH bulk status
 *   useProductDiscrepancies     — by-product aggregation
 *   useDiscrepancyChartData     — chart-ready data
 *   useExportDiscrepancies      — trigger CSV download
 *   useAuditSummary             — dashboard widget data
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
  resolvedNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  // Product context (from JOIN)
  productTitle: string | null;
  sku: string | null;
  orderIdNum: number;
  orderDate: string;
  offerId: number | null;
}

export interface FeeDiscrepancySummary {
  totalDiscrepancyCents: number;
  count: number;
  overchargedCents: number;
  underchargedCents: number;
  openCount: number;
  acknowledgedCount: number;
  disputedCount: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ProductDiscrepancy {
  offerId: number | null;
  productTitle: string;
  sku: string | null;
  totalDiscrepancies: number;
  openCount: number;
  totalOverchargedCents: number;
  totalUnderchargedCents: number;
  netImpactCents: number;
  avgDiscrepancyPct: number;
}

export interface ChartFeeTypeData {
  feeType: string;
  label: string;
  count: number;
  totalOverchargedCents: number;
  totalUnderchargedCents: number;
  netImpactCents: number;
}

export interface ChartWeekData {
  week: string;
  count: number;
  overchargedCents: number;
  underchargedCents: number;
  netImpactCents: number;
}

export interface AuditSummary {
  openCount: number;
  totalOverchargedCents: number;
  totalUnderchargedCents: number;
  netImpactCents: number;
  topOverchargedProduct: { name: string; overchargedCents: number } | null;
  hasDiscrepancies: boolean;
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
        queryClient.invalidateQueries({ queryKey: ['import-history'] });
        queryClient.invalidateQueries({ queryKey: ['fee-discrepancies'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
        queryClient.invalidateQueries({ queryKey: ['fee-summary'] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['audit-summary'] });
        queryClient.invalidateQueries({ queryKey: ['product-discrepancies'] });
        queryClient.invalidateQueries({ queryKey: ['discrepancy-chart-data'] });
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
// Fee Discrepancies (Enhanced with product context + pagination)
// =============================================================================

export interface DiscrepancyQueryParams {
  status?: string;
  feeType?: string;
  sortBy?: string;
  page?: number;
  limit?: number;
}

export function useFeeDiscrepancies(params?: DiscrepancyQueryParams) {
  return useQuery({
    queryKey: ['fee-discrepancies', params],
    queryFn: async () => {
      const res = await api.get('/sales-report/discrepancies', { params });
      return res.data as {
        discrepancies: FeeDiscrepancy[];
        summary: FeeDiscrepancySummary;
        pagination: Pagination;
      };
    },
    staleTime: 30_000,
  });
}

// =============================================================================
// Update Discrepancy Status (Single)
// =============================================================================

export function useUpdateDiscrepancyStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id: string; status: 'acknowledged' | 'disputed'; note?: string }) => {
      const res = await api.patch(`/sales-report/discrepancies/${data.id}/status`, {
        status: data.status,
        note: data.note,
      });
      return res.data as { updated: string; status: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fee-discrepancies'] });
      queryClient.invalidateQueries({ queryKey: ['audit-summary'] });
      queryClient.invalidateQueries({ queryKey: ['product-discrepancies'] });
      queryClient.invalidateQueries({ queryKey: ['discrepancy-chart-data'] });
    },
  });
}

// =============================================================================
// Bulk Update Discrepancy Status
// =============================================================================

export function useBulkUpdateDiscrepancyStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { ids: string[]; status: 'acknowledged' | 'disputed'; note?: string }) => {
      const res = await api.patch('/sales-report/discrepancies/bulk-status', data);
      return res.data as { updatedCount: number; status: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fee-discrepancies'] });
      queryClient.invalidateQueries({ queryKey: ['audit-summary'] });
      queryClient.invalidateQueries({ queryKey: ['product-discrepancies'] });
      queryClient.invalidateQueries({ queryKey: ['discrepancy-chart-data'] });
    },
  });
}

// =============================================================================
// Product Discrepancies (Aggregated by product)
// =============================================================================

export function useProductDiscrepancies() {
  return useQuery({
    queryKey: ['product-discrepancies'],
    queryFn: async () => {
      const res = await api.get('/sales-report/discrepancies/by-product');
      return res.data.products as ProductDiscrepancy[];
    },
    staleTime: 60_000,
  });
}

// =============================================================================
// Discrepancy Chart Data
// =============================================================================

export function useDiscrepancyChartData() {
  return useQuery({
    queryKey: ['discrepancy-chart-data'],
    queryFn: async () => {
      const res = await api.get('/sales-report/discrepancies/chart-data');
      return res.data as {
        byFeeType: ChartFeeTypeData[];
        byWeek: ChartWeekData[];
      };
    },
    staleTime: 60_000,
  });
}

// =============================================================================
// Export Discrepancies (CSV download)
// =============================================================================

export function useExportDiscrepancies() {
  return useMutation({
    mutationFn: async () => {
      const res = await api.get('/sales-report/discrepancies/export', {
        responseType: 'blob',
      });
      // Trigger download
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fee_discrepancies_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
  });
}

// =============================================================================
// Audit Summary (Dashboard Widget)
// =============================================================================

export function useAuditSummary() {
  return useQuery({
    queryKey: ['audit-summary'],
    queryFn: async () => {
      const res = await api.get('/sales-report/audit-summary');
      return res.data as AuditSummary;
    },
    staleTime: 60_000,
  });
}
