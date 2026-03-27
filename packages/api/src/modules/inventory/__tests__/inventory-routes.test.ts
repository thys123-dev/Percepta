/**
 * Integration tests for inventory API routes.
 *
 * Uses Fastify's inject() so requests go through the full Fastify
 * plugin lifecycle (route matching, preHandlers, serialization) without
 * needing a real network socket.
 *
 * The database and Redis are vi.mock'd so tests are fast, deterministic,
 * and run without any external services.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { inventoryRoutes } from '../routes.js';

// =============================================================================
// Mock heavy dependencies before importing anything that imports them
// =============================================================================

const SELLER_ID = 'test-seller-00000000-0000-0000-0001';

// Mock the authenticate middleware so it sets request.user without JWT verification
vi.mock('../../../middleware/auth.js', () => ({
  authenticate: vi.fn(async (request: { user: unknown }) => {
    request.user = { sellerId: SELLER_ID };
  }),
}));

// Mock DB
vi.mock('../../../db/index.js', () => ({
  db: {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    insert: vi.fn(),
    values: vi.fn(),
    returning: vi.fn(),
  },
  schema: {
    offers: {
      sellerId: 'seller_id',
      offerId: 'offer_id',
      title: 'title',
      sku: 'sku',
      stockJhb: 'stock_jhb',
      stockCpt: 'stock_cpt',
      stockDbn: 'stock_dbn',
      stockCoverDays: 'stock_cover_days',
      salesUnits30d: 'sales_units_30d',
      sellingPriceCents: 'selling_price_cents',
      status: 'status',
      leadtimeDays: 'leadtime_days',
    },
    orders: {
      sellerId: 'seller_id',
      orderId: 'order_id',
      productTitle: 'product_title',
      sku: 'sku',
      orderDate: 'order_date',
      reversalAmountCents: 'reversal_amount_cents',
      quantity: 'quantity',
      sellingPriceCents: 'selling_price_cents',
      dateShippedToCustomer: 'date_shipped_to_customer',
      saleStatus: 'sale_status',
      hasReversal: 'has_reversal',
    },
  },
}));

// Mock Redis cache — always miss so routes always execute DB queries
vi.mock('../../../modules/sync/redis.js', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}));

// =============================================================================
// Test fixture data
// =============================================================================

const MOCK_STOCK_ROWS = [
  {
    offerId: 100001,
    title: 'Braai Master Tongs Set',
    sku: 'BRAAI-001',
    stockJhb: 10,
    stockCpt: 5,
    stockDbn: 2,
    stockCoverDays: 20,
    salesUnits30d: 30,
    sellingPriceCents: 34900,
    status: 'buyable',
    leadtimeDays: 2,
  },
  {
    offerId: 100002,
    title: 'Rooibos Face Cream 50ml',
    sku: 'ROOI-001',
    stockJhb: 0,
    stockCpt: 3,
    stockDbn: 0,
    stockCoverDays: 5,
    salesUnits30d: 18,
    sellingPriceCents: 19900,
    status: 'buyable',
    leadtimeDays: 1,
  },
];

const MOCK_RETURN_ROWS = [
  {
    orderId: 98765432,
    productTitle: 'Wireless Earbuds Pro',
    sku: 'EARB-001',
    orderDate: new Date('2026-03-10T08:00:00Z'),
    reversalAmountCents: 89900,
    quantity: 1,
    sellingPriceCents: 89900,
    dateShippedToCustomer: new Date('2026-03-12T10:00:00Z'),
    saleStatus: 'Returned',
  },
];

// =============================================================================
// Helper: fluent chain mock builder for drizzle queries
// =============================================================================

function makeSelectChain(finalValue: unknown) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(finalValue),
  };
  return chain;
}

function makeCountChain(total: number) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ total }]),
  };
}

// =============================================================================
// App factory — rebuild fresh for each test
// =============================================================================

async function buildApp() {
  const app = Fastify({ logger: false });

  // Convert ZodErrors to 400 responses (mirrors what a production error handler would do)
  app.setErrorHandler(async (err, _request, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.errors[0]?.message });
    }
    return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error' });
  });

  await app.register(inventoryRoutes, { prefix: '/inventory' });
  await app.ready();
  return app;
}

// =============================================================================
// GET /inventory/stock
// =============================================================================

describe('GET /inventory/stock', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('returns 200 with data array and pagination', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain(MOCK_STOCK_ROWS) as never)
      .mockReturnValueOnce(makeCountChain(2) as never);

    const res = await app.inject({ method: 'GET', url: '/inventory/stock' });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[]; pagination: { page: number; totalItems: number } }>();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.totalItems).toBe(2);
  });

  it('derives totalStock, stockCoverStatus and salesVelocity in response', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain(MOCK_STOCK_ROWS) as never)
      .mockReturnValueOnce(makeCountChain(2) as never);

    const res = await app.inject({ method: 'GET', url: '/inventory/stock' });
    const body = res.json<{ data: Array<{
      totalStock: number;
      stockCoverStatus: string;
      salesVelocity: number;
    }> }>();

    const first = body.data[0];
    expect(first.totalStock).toBe(10 + 5 + 2); // JHB + CPT + DBN
    expect(first.stockCoverStatus).toBe('healthy'); // 20 days ≥ 14
    expect(first.salesVelocity).toBe(1.0); // 30 / 30

    const second = body.data[1];
    expect(second.stockCoverStatus).toBe('critical'); // 5 days < 7
  });

  it('accepts valid sort and order query params', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as never)
      .mockReturnValueOnce(makeCountChain(0) as never);

    const res = await app.inject({
      method: 'GET',
      url: '/inventory/stock?sort=title&order=desc',
    });
    expect(res.statusCode).toBe(200);
  });

  it('respects limit and page query params in pagination response', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as never)
      .mockReturnValueOnce(makeCountChain(0) as never);

    const res = await app.inject({
      method: 'GET',
      url: '/inventory/stock?limit=10&page=2',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ pagination: { page: number; pageSize: number } }>();
    expect(body.pagination.page).toBe(2);
    expect(body.pagination.pageSize).toBe(10);
  });

  it('rejects limit > 200 with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/inventory/stock?limit=201',
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects page < 1 with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/inventory/stock?page=0',
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an unknown sort key with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/inventory/stock?sort=invalid_key',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns empty data array when seller has no offers', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as never)
      .mockReturnValueOnce(makeCountChain(0) as never);

    const res = await app.inject({ method: 'GET', url: '/inventory/stock' });
    const body = res.json<{ data: unknown[]; pagination: { totalItems: number } }>();
    expect(body.data).toHaveLength(0);
    expect(body.pagination.totalItems).toBe(0);
  });

  it('each response row includes all required fields', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain(MOCK_STOCK_ROWS) as never)
      .mockReturnValueOnce(makeCountChain(2) as never);

    const res = await app.inject({ method: 'GET', url: '/inventory/stock' });
    const body = res.json<{ data: Array<Record<string, unknown>> }>();
    const row = body.data[0];

    expect(row).toHaveProperty('offerId');
    expect(row).toHaveProperty('title');
    expect(row).toHaveProperty('sku');
    expect(row).toHaveProperty('stockJhb');
    expect(row).toHaveProperty('stockCpt');
    expect(row).toHaveProperty('stockDbn');
    expect(row).toHaveProperty('totalStock');
    expect(row).toHaveProperty('stockCoverDays');
    expect(row).toHaveProperty('stockCoverStatus');
    expect(row).toHaveProperty('salesUnits30d');
    expect(row).toHaveProperty('salesVelocity');
    expect(row).toHaveProperty('sellingPriceCents');
    expect(row).toHaveProperty('status');
    expect(row).toHaveProperty('leadtimeDays');
  });
});

// =============================================================================
// GET /inventory/stock/export
// =============================================================================

describe('GET /inventory/stock/export', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('returns 200 with text/csv content type', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(MOCK_STOCK_ROWS),
    } as never);

    const res = await app.inject({ method: 'GET', url: '/inventory/stock/export' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('includes a Content-Disposition attachment header with .csv filename', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(MOCK_STOCK_ROWS),
    } as never);

    const res = await app.inject({ method: 'GET', url: '/inventory/stock/export' });
    const disposition = res.headers['content-disposition'] as string;
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('.csv');
  });

  it('first line of response is the CSV header', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(MOCK_STOCK_ROWS),
    } as never);

    const res = await app.inject({ method: 'GET', url: '/inventory/stock/export' });
    const firstLine = res.body.split('\n')[0];
    expect(firstLine).toBe(
      'SKU,Title,Stock JHB,Stock CPT,Stock DBN,Total Stock,Stock Cover Days,Sales Velocity (units/day),Selling Price (R),Status'
    );
  });

  it('includes one data row per offer plus the header', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(MOCK_STOCK_ROWS),
    } as never);

    const res = await app.inject({ method: 'GET', url: '/inventory/stock/export' });
    const lines = res.body.split('\n');
    // 1 header + 2 data rows
    expect(lines).toHaveLength(3);
  });

  it('data rows contain product SKUs', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(MOCK_STOCK_ROWS),
    } as never);

    const res = await app.inject({ method: 'GET', url: '/inventory/stock/export' });
    expect(res.body).toContain('BRAAI-001');
    expect(res.body).toContain('ROOI-001');
  });

  it('returns just the header when seller has no offers', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([]),
    } as never);

    const res = await app.inject({ method: 'GET', url: '/inventory/stock/export' });
    const lines = res.body.split('\n').filter(Boolean);
    expect(lines).toHaveLength(1); // header only
  });
});

// =============================================================================
// GET /inventory/returns
// =============================================================================

describe('GET /inventory/returns', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('returns 200 with data array and pagination', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain(MOCK_RETURN_ROWS) as never)
      .mockReturnValueOnce(makeCountChain(1) as never);

    const res = await app.inject({ method: 'GET', url: '/inventory/returns' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[]; pagination: unknown }>();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
  });

  it('serializes orderDate and dateShippedToCustomer as ISO strings', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain(MOCK_RETURN_ROWS) as never)
      .mockReturnValueOnce(makeCountChain(1) as never);

    const res = await app.inject({ method: 'GET', url: '/inventory/returns' });
    const body = res.json<{ data: Array<{ orderDate: string; dateShippedToCustomer: string }> }>();
    const row = body.data[0];
    expect(row.orderDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(row.dateShippedToCustomer).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('accepts sort=reversal_amount query param', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as never)
      .mockReturnValueOnce(makeCountChain(0) as never);

    const res = await app.inject({
      method: 'GET',
      url: '/inventory/returns?sort=reversal_amount&order=desc',
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects unknown sort key with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/inventory/returns?sort=unknown_key',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns empty data when no reversed orders exist', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as never)
      .mockReturnValueOnce(makeCountChain(0) as never);

    const res = await app.inject({ method: 'GET', url: '/inventory/returns' });
    const body = res.json<{ data: unknown[] }>();
    expect(body.data).toHaveLength(0);
  });

  it('each response row includes all required fields', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain(MOCK_RETURN_ROWS) as never)
      .mockReturnValueOnce(makeCountChain(1) as never);

    const res = await app.inject({ method: 'GET', url: '/inventory/returns' });
    const body = res.json<{ data: Array<Record<string, unknown>> }>();
    const row = body.data[0];

    expect(row).toHaveProperty('orderId');
    expect(row).toHaveProperty('productTitle');
    expect(row).toHaveProperty('sku');
    expect(row).toHaveProperty('orderDate');
    expect(row).toHaveProperty('reversalAmountCents');
    expect(row).toHaveProperty('quantity');
    expect(row).toHaveProperty('sellingPriceCents');
    expect(row).toHaveProperty('dateShippedToCustomer');
    expect(row).toHaveProperty('saleStatus');
  });

  it('defaults sort to order_date descending (returns 200)', async () => {
    const { db } = await import('../../../db/index.js');
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as never)
      .mockReturnValueOnce(makeCountChain(0) as never);

    const res = await app.inject({ method: 'GET', url: '/inventory/returns' });
    expect(res.statusCode).toBe(200);
  });
});
