/**
 * Hooks for the Product Details CSV importer.
 *   useProductDetailsImport          — preview / commit
 *   useProductDetailsImportHistory   — past uploads
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api.js';

export interface ProductDetailsPreview {
  mode: 'preview';
  parsed: { totalRows: number; parseErrors: number };
  matching: { matched: number; unmatched: number };
  willPopulate: {
    category: number;
    brand: number;
    dimensions: number;
    successFeeRate: number;
    fulfilmentFee: number;
  };
  parseErrors: Array<{ line: number; message: string }>;
  unmatchedSample: Array<{ tsin: number | null; sku: string | null; productTitle: string | null }>;
}

export interface ProductDetailsCommitResult {
  mode: 'commit';
  importId: string;
  updated: number;
  unmatched: number;
  queuedOrderCount: number;
  message: string;
}

export interface ProductDetailsImportRecord {
  id: string;
  fileName: string;
  rowCount: number;
  matchedCount: number;
  unmatchedCount: number;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

export function useProductDetailsImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { mode: 'preview' | 'commit'; csvText: string; fileName?: string }) => {
      const res = await api.post('/products/details/import', data);
      return res.data as ProductDetailsPreview | ProductDetailsCommitResult;
    },
    onSuccess: (result) => {
      if (result.mode === 'commit') {
        queryClient.invalidateQueries({ queryKey: ['product-details-history'] });
        queryClient.invalidateQueries({ queryKey: ['offer-list'] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['fee-discrepancies'] });
        queryClient.invalidateQueries({ queryKey: ['product-discrepancies'] });
        queryClient.invalidateQueries({ queryKey: ['discrepancy-chart-data'] });
        queryClient.invalidateQueries({ queryKey: ['fee-summary'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      }
    },
  });
}

export function useProductDetailsImportHistory() {
  return useQuery({
    queryKey: ['product-details-history'],
    queryFn: async () => {
      const res = await api.get('/products/details/imports');
      return res.data.imports as ProductDetailsImportRecord[];
    },
    staleTime: 60_000,
  });
}
