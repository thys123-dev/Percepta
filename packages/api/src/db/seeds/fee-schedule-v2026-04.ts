/**
 * Seed: Takealot Fulfilment Fee Schedule v2026-04
 *
 * Inserts the April 2026 fulfilment fee rows into the fee_schedule table.
 * These rows are used by the Week 8 Fee Auditing Dashboard for reconciliation.
 *
 * IMPORTANT:
 *   - Do NOT delete existing rows (needed for historical calculation accuracy)
 *   - Run once when deploying the April 2026 fee update
 *   - Uses ON CONFLICT DO NOTHING so re-running is safe
 *
 * Usage:
 *   npx tsx packages/api/src/db/seeds/fee-schedule-v2026-04.ts
 */

import { db, schema } from '../index.js';

const EFFECTIVE_FROM = new Date('2026-04-01');
const CALCULATION_VERSION = 'v2026-04';

// Fee rows — (Rands → flatRateCents = Rands × 100, excl. VAT)
// category_group values map to FulfilmentSizeTier in the fee engine:
//   standard_a → Standard_NonPerishable
//   standard_b → Standard_FMCG
//   standard_c → Standard_General
//   standard_d → Standard_Electronics

const FULFILMENT_ROWS = [
  // ── Standard / standard_a (Non-Perishable, Household Cleaning, Liquor) ──
  { sizeTier: 'Standard', categoryGroup: 'standard_a', weightTier: 'Light',      flatRateCents: 2200  },
  { sizeTier: 'Standard', categoryGroup: 'standard_a', weightTier: 'Heavy',      flatRateCents: 5200  },
  { sizeTier: 'Standard', categoryGroup: 'standard_a', weightTier: 'HeavyPlus',  flatRateCents: 10700 },
  { sizeTier: 'Standard', categoryGroup: 'standard_a', weightTier: 'VeryHeavy',  flatRateCents: 10700 },

  // ── Standard / standard_b (Stationery, Pets, Baby, Consumer Beauty, Health FMCG, Bathroom) ──
  { sizeTier: 'Standard', categoryGroup: 'standard_b', weightTier: 'Light',      flatRateCents: 3300  },
  { sizeTier: 'Standard', categoryGroup: 'standard_b', weightTier: 'Heavy',      flatRateCents: 5200  },
  { sizeTier: 'Standard', categoryGroup: 'standard_b', weightTier: 'HeavyPlus',  flatRateCents: 10700 },
  { sizeTier: 'Standard', categoryGroup: 'standard_b', weightTier: 'VeryHeavy',  flatRateCents: 10700 },

  // ── Standard / standard_c (all other Standard categories) ──
  { sizeTier: 'Standard', categoryGroup: 'standard_c', weightTier: 'Light',      flatRateCents: 4500  },
  { sizeTier: 'Standard', categoryGroup: 'standard_c', weightTier: 'Heavy',      flatRateCents: 5200  },
  { sizeTier: 'Standard', categoryGroup: 'standard_c', weightTier: 'HeavyPlus',  flatRateCents: 10700 },
  { sizeTier: 'Standard', categoryGroup: 'standard_c', weightTier: 'VeryHeavy',  flatRateCents: 10700 },

  // ── Standard / standard_d (Mobile, Laptops, Appliances, TV, Audio, Smart Home) ──
  { sizeTier: 'Standard', categoryGroup: 'standard_d', weightTier: 'Light',      flatRateCents: 6000  },
  { sizeTier: 'Standard', categoryGroup: 'standard_d', weightTier: 'Heavy',      flatRateCents: 6000  },
  { sizeTier: 'Standard', categoryGroup: 'standard_d', weightTier: 'HeavyPlus',  flatRateCents: 10700 },
  { sizeTier: 'Standard', categoryGroup: 'standard_d', weightTier: 'VeryHeavy',  flatRateCents: 10700 },

  // ── Large (volume > 35,000 and ≤ 130,000 cm³) ──
  { sizeTier: 'Large',    categoryGroup: 'large',       weightTier: 'Light',      flatRateCents: 6000  },
  { sizeTier: 'Large',    categoryGroup: 'large',       weightTier: 'Heavy',      flatRateCents: 6500  },
  { sizeTier: 'Large',    categoryGroup: 'large',       weightTier: 'HeavyPlus',  flatRateCents: 10700 },
  { sizeTier: 'Large',    categoryGroup: 'large',       weightTier: 'VeryHeavy',  flatRateCents: 11800 },

  // ── Oversize (volume > 130,000 and ≤ 200,000 cm³) ──
  { sizeTier: 'Oversize', categoryGroup: 'oversize',    weightTier: 'Light',      flatRateCents: 10700 },
  { sizeTier: 'Oversize', categoryGroup: 'oversize',    weightTier: 'Heavy',      flatRateCents: 13000 },
  { sizeTier: 'Oversize', categoryGroup: 'oversize',    weightTier: 'HeavyPlus',  flatRateCents: 16000 },
  { sizeTier: 'Oversize', categoryGroup: 'oversize',    weightTier: 'VeryHeavy',  flatRateCents: 16000 },

  // ── Bulky (volume > 200,000 and ≤ 545,000 cm³) ──
  { sizeTier: 'Bulky',    categoryGroup: 'bulky',       weightTier: 'Light',      flatRateCents: 10700 },
  { sizeTier: 'Bulky',    categoryGroup: 'bulky',       weightTier: 'Heavy',      flatRateCents: 14500 },
  { sizeTier: 'Bulky',    categoryGroup: 'bulky',       weightTier: 'HeavyPlus',  flatRateCents: 16000 },
  { sizeTier: 'Bulky',    categoryGroup: 'bulky',       weightTier: 'VeryHeavy',  flatRateCents: 17200 },

  // ── Extra Bulky (volume > 545,000 cm³) ──
  { sizeTier: 'ExtraBulky', categoryGroup: 'extra_bulky', weightTier: 'Light',    flatRateCents: 27000 },
  { sizeTier: 'ExtraBulky', categoryGroup: 'extra_bulky', weightTier: 'Heavy',    flatRateCents: 27000 },
  { sizeTier: 'ExtraBulky', categoryGroup: 'extra_bulky', weightTier: 'HeavyPlus', flatRateCents: 32000 },
  { sizeTier: 'ExtraBulky', categoryGroup: 'extra_bulky', weightTier: 'VeryHeavy', flatRateCents: 39000 },
] as const;

async function seed() {
  console.log(`Seeding ${FULFILMENT_ROWS.length} April 2026 fulfilment fee rows…`);

  const rows = FULFILMENT_ROWS.map((r) => ({
    feeType: 'fulfilment' as const,
    categoryGroup: r.categoryGroup,
    sizeTier: r.sizeTier,
    weightTier: r.weightTier,
    flatRateCents: r.flatRateCents,
    calculationVersion: CALCULATION_VERSION,
    effectiveFrom: EFFECTIVE_FROM,
    effectiveTo: null,
    notes: `April 2026 fee update — ${r.sizeTier}/${r.categoryGroup}/${r.weightTier}: R${(r.flatRateCents / 100).toFixed(2)} excl. VAT`,
  }));

  // Insert all rows; skip duplicates (safe to re-run)
  await db.insert(schema.feeSchedule).values(rows).onConflictDoNothing();

  console.log(`Done. ${rows.length} rows inserted (duplicates skipped).`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
