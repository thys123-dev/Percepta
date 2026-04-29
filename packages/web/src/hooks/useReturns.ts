/**
 * useReturns hooks
 *
 * TanStack Query hooks for the Takealot Returns Export XLSX import API.
 *   useTakealotReturnsImport       — upload XLSX (preview + commit)
 *   useTakealotReturnsImportHistory — list past imports
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api.js';
import type {
  TakealotReturnsPreview,
  TakealotReturnsCommitResult,
} from '@percepta/shared';

export interface TakealotReturnImportRecord {
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

export function useTakealotReturnsImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      mode: 'preview' | 'commit';
      fileBase64: string;
      fileName?: string;
    }) => {
      const res = await api.post('/returns/import', data);
      return res.data as TakealotReturnsPreview | TakealotReturnsCommitResult;
    },
    onSuccess: (result) => {
      if (result.mode === 'commit') {
        queryClient.invalidateQueries({ queryKey: ['takealot-returns-history'] });
        queryClient.invalidateQueries({ queryKey: ['inventory-returns'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      }
    },
  });
}

export function useTakealotReturnsImportHistory() {
  return useQuery({
    queryKey: ['takealot-returns-history'],
    queryFn: async () => {
      const res = await api.get('/returns/imports');
      return res.data.imports as TakealotReturnImportRecord[];
    },
    staleTime: 60_000,
  });
}

/** Read a File and return its contents as a base64 string (no data: prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read file'));
        return;
      }
      // Strip the "data:<mime>;base64," prefix
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}
