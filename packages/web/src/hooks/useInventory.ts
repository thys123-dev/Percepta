/**
 * useInventory hooks
 *
 * TanStack Query data-fetching hooks for the inventory API:
 *   useInventoryStock    — paginated stock levels per DC
 *   useInventoryReturns  — paginated reversed orders
 *   exportInventoryCsv   — trigger CSV download
 */

import { useQuery } from '@tanstack/react-query';
import api from '../services/api.js';

// =============================================================================
// Stock Levels
// =============================================================================

export type StockCoverStatus = 'healthy' | 'low' | 'critical';

export interface StockRow {
  offerId: number;
  /** Takealot's catalogue product ID — shared across sellers listing the same product. */
  tsin: number | null;
  title: string;
  sku: string | null;
  stockJhb: number;
  stockCpt: number;
  stockDbn: number;
  totalStock: number;
  stockCoverDays: number | null;
  stockCoverStatus: StockCoverStatus;
  salesUnits30d: number;
  salesVelocity: number;
  sellingPriceCents: number;
  status: string | null;
  leadtimeDays: number;
}

export type StockSortKey = 'title' | 'stock_cover' | 'sales_velocity' | 'total_stock';

/**
 * Listing-status filter:
 *   active   = Buyable / Not Buyable (default — what the seller can actually sell)
 *   disabled = Disabled by Seller / Disabled by Takealot
 *   all      = no filter
 */
export type StockStatusFilter = 'active' | 'disabled' | 'all';

export interface StockParams {
  search?: string;
  sort?: StockSortKey;
  order?: 'asc' | 'desc';
  limit?: number;
  page?: number;
  statusFilter?: StockStatusFilter;
}

export interface StockData {
  data: StockRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export function useInventoryStock(params: StockParams) {
  return useQuery<StockData>({
    queryKey: ['inventory-stock', params],
    queryFn: () =>
      api
        .get<StockData>('/inventory/stock', { params })
        .then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

// =============================================================================
// Returns
// =============================================================================

export interface ReturnRow {
  orderId: number;
  productTitle: string;
  sku: string | null;
  orderDate: string | null;
  reversalAmountCents: number;
  quantity: number;
  sellingPriceCents: number;
  dateShippedToCustomer: string | null;
  saleStatus: string | null;
}

export type ReturnsSortKey = 'order_date' | 'reversal_amount' | 'product_title';

export interface ReturnsParams {
  sort?: ReturnsSortKey;
  order?: 'asc' | 'desc';
  limit?: number;
  page?: number;
}

export interface ReturnsData {
  data: ReturnRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export function useInventoryReturns(params: ReturnsParams) {
  return useQuery<ReturnsData>({
    queryKey: ['inventory-returns', params],
    queryFn: () =>
      api
        .get<ReturnsData>('/inventory/returns', { params })
        .then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

// =============================================================================
// CSV Export
// =============================================================================

export async function exportInventoryCsv(): Promise<void> {
  const response = await api.get('/inventory/stock/export', {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(new Blob([response.data as BlobPart]));
  const a = document.createElement('a');
  a.href = url;
  const today = new Date().toISOString().split('T')[0];
  a.download = `percepta_inventory_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
