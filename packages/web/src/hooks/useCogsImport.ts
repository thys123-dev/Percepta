/**
 * useCogsImport hooks
 *
 * Data-fetching and mutation hooks for COGS management:
 *   useOfferList    — paginated offer list with search
 *   useUpdateCogs   — PATCH /sellers/cogs (manual inline edits)
 *   useCsvImport    — POST /sellers/cogs/import (preview + commit)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api.js';

// =============================================================================
// Types
// =============================================================================

export interface OfferForCogs {
  offerId: number;
  title: string | null;
  sku: string | null;
  category: string | null;
  sellingPriceCents: number | null;
  cogsCents: number | null;
  cogsSource: string;
  inboundCostCents: number;
  salesUnits30d: number;
  stockCoverDays: number | null;
}

export interface OfferListParams {
  limit?: number;
  page?: number;
  search?: string;
  sort?: 'title' | 'sales' | 'cogs';
}

export interface OfferListData {
  data: OfferForCogs[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface CogsRow {
  offerId: number;
  cogsCents: number;
  inboundCostCents?: number;
}

export interface CsvPreviewItem {
  offerId: number | null;
  title: string | null;
  sku: string | null;
  cogsCents: number;
  inboundCostCents: number;
  matched: boolean;
}

export interface CsvImportPayload {
  mode: 'preview' | 'commit';
  rows: {
    /**
     * Either offerId or sku (or both) must be provided. The backend will
     * try offerId first, then fall back to a (sellerId, sku) lookup.
     */
    offerId?: number;
    sku?: string;
    cogsCents: number;
    inboundCostCents?: number;
  }[];
}

export interface CsvImportResult {
  mode: 'preview' | 'commit';
  // Preview mode:
  preview?: CsvPreviewItem[];
  matched?: number;
  unmatched?: number;
  // Commit mode:
  updated?: number;
}

// =============================================================================
// useOfferList — GET /sellers/offers
// =============================================================================

export function useOfferList(params: OfferListParams = {}) {
  return useQuery<OfferListData>({
    queryKey: ['offer-list', params],
    queryFn: () =>
      api.get<OfferListData>('/sellers/offers', { params }).then((r) => r.data),
    staleTime: 30_000,
  });
}

// =============================================================================
// useUpdateCogs — PATCH /sellers/cogs (manual inline edits)
// =============================================================================

export function useUpdateCogs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (products: CogsRow[]) =>
      api.patch('/sellers/cogs', { products }).then((r) => r.data),
    onSuccess: () => {
      // Invalidate offer list, product performance table and dashboard metrics
      queryClient.invalidateQueries({ queryKey: ['offer-list'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['fee-summary'] });
    },
  });
}

// =============================================================================
// useCsvImport — POST /sellers/cogs/import (preview + commit)
// =============================================================================

export function useCsvImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CsvImportPayload) =>
      api.post<CsvImportResult>('/sellers/cogs/import', payload).then((r) => r.data),
    onSuccess: (data) => {
      // Only invalidate caches after a commit — not after a preview
      if (data.mode === 'commit') {
        queryClient.invalidateQueries({ queryKey: ['offer-list'] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
        queryClient.invalidateQueries({ queryKey: ['fee-summary'] });
      }
    },
  });
}
