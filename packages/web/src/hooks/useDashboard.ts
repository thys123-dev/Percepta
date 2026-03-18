/**
 * useDashboard hooks
 *
 * TanStack Query data-fetching hooks for the dashboard API:
 *   useDashboardSummary  — profitability scorecard + trends
 *   useProducts          — paginated product performance table
 *   useProductFees       — fee waterfall for a single product
 */

import { useQuery } from '@tanstack/react-query';
import api from '../services/api.js';

// =============================================================================
// Period
// =============================================================================

export type Period = '7d' | '30d' | '90d' | 'custom';

export interface PeriodParams {
  period: Period;
  startDate?: string;
  endDate?: string;
}

// =============================================================================
// Dashboard Summary
// =============================================================================

export interface DashboardSummaryData {
  period: { startDate: string; endDate: string; label: string };
  totalRevenueCents: number;
  totalFeesCents: number;
  totalCogsCents: number;
  totalInboundCents: number;
  netProfitCents: number;
  profitMarginPct: number;
  orderCount: number;
  productCount: number;
  lossMakerCount: number;
  trends: {
    revenueDelta: number;
    profitDelta: number;
    marginDelta: number;
  };
}

export function useDashboardSummary(params: PeriodParams) {
  return useQuery<DashboardSummaryData>({
    queryKey: ['dashboard-summary', params],
    queryFn: () =>
      api
        .get<DashboardSummaryData>('/dashboard/summary', { params })
        .then((r) => r.data),
  });
}

// =============================================================================
// Product Performance Table
// =============================================================================

export type ApiSortKey =
  | 'margin_pct'
  | 'revenue'
  | 'profit'
  | 'units_sold'
  | 'fees'
  | 'last_sale';

export interface ProductRow {
  offerId: number;
  title: string;
  sku: string | null;
  category: string | null;
  cogsSource: string;
  unitsSold: number;
  revenueCents: number;
  totalFeesCents: number;
  cogsCents: number;
  inboundCostCents: number;
  netProfitCents: number;
  marginPct: number;
  cogsIsEstimated: boolean;
  orderCount: number;
  lastSaleDate: string;
  marginStatus: 'profitable' | 'marginal' | 'loss_maker';
}

export interface ProductsParams extends PeriodParams {
  sort?: ApiSortKey;
  order?: 'asc' | 'desc';
  limit?: number;
  page?: number;
}

export interface ProductsData {
  data: ProductRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export function useProducts(params: ProductsParams) {
  return useQuery<ProductsData>({
    queryKey: ['products', params],
    queryFn: () =>
      api
        .get<ProductsData>('/dashboard/products', { params })
        .then((r) => r.data),
  });
}

// =============================================================================
// Per-Product Fee Breakdown
// =============================================================================

export interface ProductFeesData {
  offerId: number;
  title: string | null;
  category: string | null;
  cogsSource: string;
  cogsIsEstimated: boolean;
  isIbt: boolean;
  orderDate: string;
  unitSellingPriceCents: number;
  successFeeCents: number;
  fulfilmentFeeCents: number;
  ibtPenaltyCents: number;
  storageFeeAllocatedCents: number;
  totalFeeCents: number;
  cogsCents: number;
  inboundCostCents: number;
  netProfitCents: number;
  revenueCents: number;
  marginPct: number;
}

export function useProductFees(offerId: number | null) {
  return useQuery<{ data: ProductFeesData | null }>({
    queryKey: ['product-fees', offerId],
    queryFn: () =>
      api
        .get<{ data: ProductFeesData | null }>(`/dashboard/products/${offerId}/fees`)
        .then((r) => r.data),
    enabled: offerId !== null,
    staleTime: 60_000, // fee structure rarely changes mid-session
  });
}
