/**
 * MockTakealotClient — Drop-in replacement for TakealotClient in DEMO_MODE.
 *
 * Returns the same 12 products and ~180 orders from demo-data.ts,
 * formatted in exact Takealot API response shapes. Adds artificial
 * delays to simulate network latency.
 *
 * Used by get-seller-client.ts when DEMO_MODE=true and the decrypted
 * API key matches the demo key.
 */

import {
  DEMO_PRODUCTS,
  generateDemoOrders,
  toTakealotOffer,
  toTakealotSale,
} from '../../db/seeds/demo-data.js';
import type {
  TakealotOffer,
  TakealotSale,
  TakealotPaginatedResponse,
} from './index.js';

const PAGE_SIZE = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(): Promise<void> {
  return sleep(100 + Math.random() * 400);
}

export class MockTakealotClient {
  private offers: TakealotOffer[];
  private sales: TakealotSale[];

  constructor() {
    this.offers = DEMO_PRODUCTS.map(toTakealotOffer);
    const demoOrders = generateDemoOrders(42);
    this.sales = demoOrders.map(toTakealotSale);
  }

  async testConnection(): Promise<boolean> {
    await sleep(200);
    return true;
  }

  async getOfferCount(): Promise<{ total: number }> {
    await randomDelay();
    return { total: this.offers.length };
  }

  async getOffers(page: number = 1): Promise<TakealotPaginatedResponse<TakealotOffer>> {
    await randomDelay();
    const start = (page - 1) * PAGE_SIZE;
    const pageOffers = this.offers.slice(start, start + PAGE_SIZE);
    return {
      page_number: page,
      page_size: PAGE_SIZE,
      total_results: this.offers.length,
      offers: pageOffers,
    };
  }

  async *fetchAllOffers(
    onProgress?: (completed: number, total: number) => void
  ): AsyncGenerator<TakealotOffer[], void> {
    await randomDelay();
    if (onProgress) onProgress(this.offers.length, this.offers.length);
    yield this.offers;
  }

  async getSales(
    startDate: string,
    endDate: string,
    page: number = 1
  ): Promise<TakealotPaginatedResponse<TakealotSale>> {
    await randomDelay();

    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const filtered = this.sales.filter((s) => {
      const t = new Date(s.order_date).getTime();
      return t >= start && t <= end;
    });

    const pageStart = (page - 1) * PAGE_SIZE;
    const pageSales = filtered.slice(pageStart, pageStart + PAGE_SIZE);

    return {
      page_number: page,
      page_size: PAGE_SIZE,
      total_results: filtered.length,
      sales: pageSales,
    };
  }

  async *fetchAllSales(
    startDate: string,
    endDate: string,
    onProgress?: (completed: number, chunk: string) => void
  ): AsyncGenerator<TakealotSale[], void> {
    await randomDelay();

    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const filtered = this.sales.filter((s) => {
      const t = new Date(s.order_date).getTime();
      return t >= start && t <= end;
    });

    if (onProgress) onProgress(filtered.length, `${startDate} → ${endDate}`);
    yield filtered;
  }

  async getOffer(offerId: number): Promise<TakealotOffer> {
    await randomDelay();
    const offer = this.offers.find((o) => o.offer_id === offerId);
    if (!offer) throw new Error(`Mock: offer ${offerId} not found`);
    return offer;
  }

  getRateLimitStatus() {
    return {
      limit: 1000,
      remaining: 950,
      resetAt: new Date(Date.now() + 3600_000),
    };
  }
}
