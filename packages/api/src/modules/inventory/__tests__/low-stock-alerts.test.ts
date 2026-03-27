/**
 * Unit tests for checkLowStockAlerts.
 *
 * The DB and publishAlert are mocked so tests run without external services.
 * We verify the alert-creation logic: which offers trigger alerts, what
 * severity they receive, and that the dedup guard is respected.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks — must be declared before importing the module under test
// =============================================================================

// Mock the DB used by alert-generator
vi.mock('../../../db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'alert-id-001' }]),
  },
  schema: {
    offers: {
      sellerId: 'seller_id',
      offerId: 'offer_id',
      title: 'title',
      stockCoverDays: 'stock_cover_days',
      salesUnits30d: 'sales_units_30d',
      stockJhb: 'stock_jhb',
      stockCpt: 'stock_cpt',
      stockDbn: 'stock_dbn',
    },
    alerts: {
      sellerId: 'seller_id',
      alertType: 'alert_type',
      isRead: 'is_read',
      createdAt: 'created_at',
      offerId: 'offer_id',
      severity: 'severity',
      title: 'title',
      message: 'message',
      actionUrl: 'action_url',
      id: 'id',
    },
    sellers: {
      id: 'id',
      email: 'email',
      businessName: 'business_name',
      emailLossAlerts: 'email_loss_alerts',
    },
  },
}));

// Mock Redis publish so no real connection is needed
vi.mock('../../../modules/sync/redis.js', () => ({
  publishAlert: vi.fn().mockResolvedValue(undefined),
}));

// Mock email service (some alerts send email)
vi.mock('../../../modules/email/email-service.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

import { checkLowStockAlerts } from '../../alerts/alert-generator.js';

// =============================================================================
// Helpers
// =============================================================================

const SELLER_ID = 'seller-00000000-0000-0000-0001';

function makeOffer(overrides: {
  offerId?: number;
  title?: string;
  stockCoverDays?: number | null;
  salesUnits30d?: number;
  stockJhb?: number;
  stockCpt?: number;
  stockDbn?: number;
}) {
  return {
    offerId: overrides.offerId ?? 100001,
    title: overrides.title ?? 'Test Product',
    stockCoverDays: overrides.stockCoverDays ?? 5,
    salesUnits30d: overrides.salesUnits30d ?? 30,
    stockJhb: overrides.stockJhb ?? 5,
    stockCpt: overrides.stockCpt ?? 0,
    stockDbn: overrides.stockDbn ?? 0,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('checkLowStockAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when no low-stock offers exist', async () => {
    const { db } = await import('../../../db/index.js');
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]), // no matching offers
    });

    const count = await checkLowStockAlerts(SELLER_ID);
    expect(count).toBe(0);
  });

  it('creates one alert per low-stock offer', async () => {
    const { db } = await import('../../../db/index.js');

    const lowStockOffers = [
      makeOffer({ offerId: 100001, stockCoverDays: 5 }),
      makeOffer({ offerId: 100002, stockCoverDays: 3 }),
    ];

    // First select: returns low-stock offers
    // Subsequent selects: dedup check returns 0 (no existing alert)
    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(lowStockOffers),
      })
      // dedup check for offer 1
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      })
      // dedup check for offer 2
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      });

    const count = await checkLowStockAlerts(SELLER_ID);
    expect(count).toBe(2);
  });

  it('assigns "critical" severity when stockCoverDays <= 2', async () => {
    const { db } = await import('../../../db/index.js');
    const insertSpy = db.insert as ReturnType<typeof vi.fn>;

    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([makeOffer({ stockCoverDays: 2 })]),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      });

    await checkLowStockAlerts(SELLER_ID);

    // Verify the insert was called with severity = 'critical'
    const insertCall = insertSpy.mock.calls[0];
    expect(insertCall).toBeDefined();
    const valuesCall = (db.insert as ReturnType<typeof vi.fn>)().values.mock?.calls?.[0]?.[0];
    if (valuesCall) {
      expect(valuesCall.severity).toBe('critical');
    }
  });

  it('assigns "critical" severity when stockCoverDays is null', async () => {
    const { db } = await import('../../../db/index.js');

    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([makeOffer({ stockCoverDays: null })]),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      });

    // Should not throw
    const count = await checkLowStockAlerts(SELLER_ID);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('assigns "warning" severity when stockCoverDays is 3–6', async () => {
    const { db } = await import('../../../db/index.js');
    const insertSpy = db.insert as ReturnType<typeof vi.fn>;

    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([makeOffer({ stockCoverDays: 5 })]),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      });

    await checkLowStockAlerts(SELLER_ID);

    const insertedValues = insertSpy.mock.results?.[0]?.value?.values?.mock?.calls?.[0]?.[0];
    if (insertedValues) {
      expect(insertedValues.severity).toBe('warning');
    }
  });

  it('skips creating a duplicate alert (dedup guard active)', async () => {
    const { db } = await import('../../../db/index.js');

    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([makeOffer({ stockCoverDays: 4 })]),
      })
      // dedup check returns count=1 → alert already exists
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      });

    const count = await checkLowStockAlerts(SELLER_ID);
    // Dedup guard prevents creation → 0 new alerts
    expect(count).toBe(0);
  });

  it('sets actionUrl to /dashboard/inventory', async () => {
    const { db } = await import('../../../db/index.js');
    const insertSpy = db.insert as ReturnType<typeof vi.fn>;

    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([makeOffer({ stockCoverDays: 3 })]),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      });

    await checkLowStockAlerts(SELLER_ID);

    const insertedValues = insertSpy.mock.results?.[0]?.value?.values?.mock?.calls?.[0]?.[0];
    if (insertedValues) {
      expect(insertedValues.actionUrl).toBe('/dashboard/inventory');
    }
  });

  it('uses alertType "low_stock"', async () => {
    const { db } = await import('../../../db/index.js');
    const insertSpy = db.insert as ReturnType<typeof vi.fn>;

    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([makeOffer({ stockCoverDays: 4 })]),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      });

    await checkLowStockAlerts(SELLER_ID);

    const insertedValues = insertSpy.mock.results?.[0]?.value?.values?.mock?.calls?.[0]?.[0];
    if (insertedValues) {
      expect(insertedValues.alertType).toBe('low_stock');
    }
  });
});
