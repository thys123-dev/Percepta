/**
 * Takealot Seller API Client
 *
 * Core API client with:
 * - Authorization: Key <api-key> authentication
 * - Dynamic rate limit tracking via x-RateLimit-* headers
 * - Exponential backoff on 429 responses
 * - Auto-pagination for list endpoints
 * - Request logging and error handling
 *
 * API Reference: https://seller-api.takealot.com/api-docs/
 * Base URL: https://seller-api.takealot.com
 */

import { env } from '../../config/env.js';
import { OFFERS_PER_PAGE, MAX_SALES_DATE_RANGE_DAYS } from '@percepta/shared';

// ---- Types ----

export interface TakealotOffer {
  offer_id: number;
  tsin: number;
  sku: string;
  barcode: string;
  title: string;
  selling_price: number; // in cents
  rrp: number;
  status: string;
  offer_url: string;
  product_label_number: string;
  leadtime_days: number;
  leadtime_stock: Array<{
    merchant_warehouse: { warehouse_id: number; name: string };
    quantity_available: number;
  }>;
  stock_at_takealot: Array<{
    dc: string;
    quantity: number;
  }>;
  stock_cover: number | null;
  sales_units: Array<{
    dc: string;
    units: number;
  }>;
  discount: number;
  // Note: dimensions/weight may or may not be available — must validate
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  category?: string;
}

export interface TakealotSale {
  order_id: number;
  order_item_id: number;
  order_date: string;
  sale_status: string;
  product_title: string;
  takealot_url_mobi: string;
  sku: string;
  tsin: number;
  offer_id: number;
  quantity: number;
  selling_price: number; // total (unit price × quantity), in cents
  dc: string; // fulfillment DC
  customer_dc: string; // nearest DC to customer
  promotion: string;
  customer: string;
  po_number: number;
  shipment_name: string;
}

export interface TakealotPaginatedResponse<T> {
  page_number: number;
  page_size: number;
  total_results: number;
  offers?: T[];
  sales?: T[];
  [key: string]: unknown;
}

interface RateLimitState {
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp in ms
}

// ---- Client ----

export class TakealotClient {
  private apiKey: string;
  private baseUrl: string;
  private rateLimit: RateLimitState = {
    limit: 1000,
    remaining: 1000,
    resetAt: Date.now() + 3600000,
  };

  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_BACKOFF_MS = 1000;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? env.TAKEALOT_API_BASE_URL;
  }

  // ---- Core HTTP ----

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    options?: {
      body?: unknown;
      params?: Record<string, string>;
      retryCount?: number;
    }
  ): Promise<T> {
    const retryCount = options?.retryCount ?? 0;

    // Check rate limit before making request
    if (this.rateLimit.remaining <= 1 && Date.now() < this.rateLimit.resetAt) {
      const waitMs = this.rateLimit.resetAt - Date.now() + 100;
      console.warn(
        `[TakealotClient] Rate limit approaching. Waiting ${waitMs}ms until reset.`
      );
      await this.sleep(waitMs);
    }

    // Build URL with query params
    const url = new URL(path, this.baseUrl);
    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Key ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (options?.body && (method === 'POST' || method === 'PATCH')) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url.toString(), fetchOptions);

      // Update rate limit tracking from response headers
      this.updateRateLimit(response.headers);

      // Handle 429 Too Many Requests with exponential backoff
      if (response.status === 429) {
        if (retryCount >= TakealotClient.MAX_RETRIES) {
          throw new TakealotApiError(
            'Rate limit exceeded after max retries',
            429,
            path
          );
        }

        const backoffMs =
          TakealotClient.BASE_BACKOFF_MS * Math.pow(2, retryCount) +
          Math.random() * 500;

        console.warn(
          `[TakealotClient] Rate limited (429). Retry ${retryCount + 1}/${TakealotClient.MAX_RETRIES} in ${backoffMs}ms`
        );

        await this.sleep(backoffMs);
        return this.request<T>(method, path, {
          ...options,
          retryCount: retryCount + 1,
        });
      }

      // Handle other errors
      if (!response.ok) {
        const errorBody = await response.text();
        throw new TakealotApiError(
          `Takealot API error: ${response.status} ${response.statusText} — ${errorBody}`,
          response.status,
          path
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof TakealotApiError) throw error;

      // Network errors — retry with backoff
      if (retryCount < TakealotClient.MAX_RETRIES) {
        const backoffMs = TakealotClient.BASE_BACKOFF_MS * Math.pow(2, retryCount);
        console.warn(
          `[TakealotClient] Network error on ${path}. Retry ${retryCount + 1}/${TakealotClient.MAX_RETRIES} in ${backoffMs}ms`
        );
        await this.sleep(backoffMs);
        return this.request<T>(method, path, {
          ...options,
          retryCount: retryCount + 1,
        });
      }

      throw new TakealotApiError(
        `Network error after ${TakealotClient.MAX_RETRIES} retries: ${(error as Error).message}`,
        0,
        path
      );
    }
  }

  private updateRateLimit(headers: Headers) {
    const limit = headers.get('x-RateLimit-Limit');
    const remaining = headers.get('x-RateLimit-Remaining');
    const reset = headers.get('x-RateLimit-Reset');

    if (limit) this.rateLimit.limit = parseInt(limit, 10);
    if (remaining) this.rateLimit.remaining = parseInt(remaining, 10);
    if (reset) this.rateLimit.resetAt = parseInt(reset, 10) * 1000; // Convert to ms
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ---- Public API Methods ----

  /**
   * Test the API key by fetching offer count.
   * Returns true if the key is valid.
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.request<{ total: number }>('GET', '/v2/offers/count');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get total number of offers.
   */
  async getOfferCount(): Promise<number> {
    const result = await this.request<{ total: number }>('GET', '/v2/offers/count');
    return result.total;
  }

  /**
   * Fetch a single page of offers.
   */
  async getOffers(page: number = 0): Promise<TakealotPaginatedResponse<TakealotOffer>> {
    return this.request<TakealotPaginatedResponse<TakealotOffer>>(
      'GET',
      '/v2/offers',
      {
        params: {
          page_number: page.toString(),
          page_size: OFFERS_PER_PAGE.toString(),
        },
      }
    );
  }

  /**
   * Fetch ALL offers with auto-pagination.
   * Yields offers page by page for memory efficiency.
   * Emits progress callbacks.
   */
  async *fetchAllOffers(
    onProgress?: (completed: number, total: number) => void
  ): AsyncGenerator<TakealotOffer[], void, unknown> {
    const totalCount = await this.getOfferCount();
    const totalPages = Math.ceil(totalCount / OFFERS_PER_PAGE);
    let completed = 0;

    for (let page = 0; page < totalPages; page++) {
      const response = await this.getOffers(page);
      const offers = response.offers ?? [];
      completed += offers.length;

      if (onProgress) onProgress(completed, totalCount);

      yield offers;
    }
  }

  /**
   * Fetch sales for a date range (max 180 days per request).
   */
  async getSales(
    startDate: string,
    endDate: string,
    page: number = 0
  ): Promise<TakealotPaginatedResponse<TakealotSale>> {
    return this.request<TakealotPaginatedResponse<TakealotSale>>(
      'GET',
      '/v2/sales',
      {
        params: {
          start_date: startDate,
          end_date: endDate,
          page_number: page.toString(),
          page_size: '100',
        },
      }
    );
  }

  /**
   * Fetch ALL sales for a date range with auto-pagination.
   * Automatically chunks date ranges >180 days.
   */
  async *fetchAllSales(
    startDate: Date,
    endDate: Date,
    onProgress?: (completed: number, chunk: string) => void
  ): AsyncGenerator<TakealotSale[], void, unknown> {
    // Split into 180-day chunks
    const chunks = this.splitDateRange(startDate, endDate, MAX_SALES_DATE_RANGE_DAYS);
    let totalCompleted = 0;

    for (const chunk of chunks) {
      const chunkStart = this.formatDate(chunk.start);
      const chunkEnd = this.formatDate(chunk.end);

      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const response = await this.getSales(chunkStart, chunkEnd, page);
        const sales = response.sales ?? [];

        totalCompleted += sales.length;
        if (onProgress) onProgress(totalCompleted, `${chunkStart} to ${chunkEnd}`);

        if (sales.length > 0) {
          yield sales;
        }

        hasMore = sales.length >= 100; // If we got a full page, there might be more
        page++;
      }
    }
  }

  /**
   * Fetch a single offer by offer ID.
   */
  async getOffer(offerId: number): Promise<TakealotOffer> {
    return this.request<TakealotOffer>('GET', `/v2/offers/offer/${offerId}`);
  }

  /**
   * Update offer price on Takealot (Phase 2 — price optimizer).
   */
  async updateOfferPrice(
    offerId: number,
    sellingPrice: number,
    rrp?: number
  ): Promise<unknown> {
    const body: Record<string, number> = { selling_price: sellingPrice };
    if (rrp !== undefined) body.rrp = rrp;

    return this.request('PATCH', `/v2/offers/offer/${offerId}`, { body });
  }

  /**
   * Get stock counts.
   */
  async getStockCounts(): Promise<unknown> {
    return this.request('GET', '/v2/offers/stock_counts');
  }

  /**
   * Get stock health stats.
   */
  async getStockHealthStats(): Promise<unknown> {
    return this.request('GET', '/v2/offers/stock_health_stats');
  }

  // ---- Helpers ----

  private splitDateRange(
    start: Date,
    end: Date,
    maxDays: number
  ): Array<{ start: Date; end: Date }> {
    const chunks: Array<{ start: Date; end: Date }> = [];
    let current = new Date(start);

    while (current < end) {
      const chunkEnd = new Date(current);
      chunkEnd.setDate(chunkEnd.getDate() + maxDays);

      chunks.push({
        start: new Date(current),
        end: chunkEnd > end ? new Date(end) : chunkEnd,
      });

      current = new Date(chunkEnd);
      current.setDate(current.getDate() + 1);
    }

    return chunks;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0]!;
  }

  /**
   * Get current rate limit status.
   */
  getRateLimitStatus(): RateLimitState {
    return { ...this.rateLimit };
  }
}

// ---- Error Class ----

export class TakealotApiError extends Error {
  statusCode: number;
  path: string;

  constructor(message: string, statusCode: number, path: string) {
    super(message);
    this.name = 'TakealotApiError';
    this.statusCode = statusCode;
    this.path = path;
  }
}
