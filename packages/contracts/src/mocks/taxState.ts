/** ⚠️ MOCK Vietnam-tax state (0.15.0) — UI development only. Own file so the store imports it without a cycle. */
import type { AdminTaxWithholding, TaxCategory, TaxSettings } from '../index.ts';
import { fixtureMe, fixturePortfolio, fixtureTaxSettings, fixtureTaxWithholdings } from '../fixtures/index.ts';

export interface MockTaxState {
  settings: TaxSettings;
  /** Category of the demo user (tax_profiles). */
  category: TaxCategory;
  profileUpdatedAt: string | null;
  /** Every user's records, newest first (the demo user's have userId = fixtureMe.id). */
  withholdings: AdminTaxWithholding[];
  nextWithholding: number;
}

export interface MockSpotPosition {
  /** Base held (18 dp, like server positions.quantity). */
  quantity: string;
  /** Average cost in USDT (18 dp); null when flat / unknown. */
  avgCost: string | null;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function initialTaxState(empty = false): MockTaxState {
  const all = clone(fixtureTaxWithholdings);
  return {
    settings: clone(fixtureTaxSettings),
    category: 'INDIVIDUAL',
    profileUpdatedAt: null,
    // "empty": the demo user has no trades, so none of their records either (other users' stay for the admin app)
    withholdings: empty ? all.filter((w) => w.userId !== fixtureMe.id) : all,
    nextWithholding: 100,
  };
}

/** Average-cost book of the demo user (server `positions`), seeded from the portfolio fixture (balances are the same in every scenario). */
export function initialPositions(): Record<string, MockSpotPosition> {
  const out: Record<string, MockSpotPosition> = {};
  for (const p of fixturePortfolio.positions) if (p.avgCost !== null) out[p.asset] = { quantity: p.quantity, avgCost: p.avgCost };
  return out;
}
