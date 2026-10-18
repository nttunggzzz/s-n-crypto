/**
 * ⚠️ Mock resolvers of the admin risk endpoints (module AD, batch AD2) — UI development only.
 * Same rules as the server ("mock = server"): staff + 2FA + permission (`users.read` for positions / liquidations,
 * `exchange.read` for funding / metrics). The query is validated by the handler, but schema defaults are NOT applied to
 * `query`, so each default is repeated here.
 */
import type { EndpointName } from '../index.ts';
import { fixtureFundingSummary, fixtureLiquidations, fixtureMetricsDay, fixtureMetricsTotals, fixtureRiskPositions, fixtureRiskTotals } from '../fixtures/adminRisk.ts';
import { MockError, now, requireStaff, type Resolver } from './common.ts';

type RiskEndpoint = 'adminRiskPositions' | 'adminLiquidations' | 'adminFundingSummary' | 'adminMetrics';

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;
const LIQ_CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|(\d+)$/;

/** Ascending by the key, nulls last, ties by positionId ascending. */
function byKey(key: (p: (typeof fixtureRiskPositions)[number]) => number | null, dir: 1 | -1) {
  return (a: (typeof fixtureRiskPositions)[number], b: (typeof fixtureRiskPositions)[number]) => {
    const x = key(a);
    const y = key(b);
    if (x === null || y === null) return x === y ? Number(a.positionId) - Number(b.positionId) : x === null ? 1 : -1;
    return (x - y) * dir || Number(a.positionId) - Number(b.positionId);
  };
}

export const adminRiskResolvers: { [N in Extract<EndpointName, RiskEndpoint>]: Resolver<N> } = {
  adminRiskPositions: ({ query }) => {
    requireStaff('users.read');
    const symbol = query.get('symbol');
    const side = query.get('side');
    const sort = query.get('sort') ?? 'liqDistance';
    const limit = Number(query.get('limit') ?? 50);
    const offset = query.get('cursor') === null ? 0 : Number(query.get('cursor'));
    if (!Number.isSafeInteger(offset) || offset < 0) throw new MockError('VALIDATION_ERROR', 'Invalid cursor');
    const rows = fixtureRiskPositions
      .filter((p) => (!symbol || p.symbol === symbol) && (!side || p.side === side))
      // key is a display-only JS number here (mock ordering); the values shown stay the fixture's strings
      .sort(sort === 'notional' ? byKey((p) => (p.notional === null ? null : Number(p.notional)), -1) : byKey((p) => (p.liqDistance === null ? null : Number(p.liqDistance)), 1));
    const items = rows.slice(offset, offset + limit);
    return {
      items,
      nextCursor: rows.length > offset + limit ? String(offset + limit) : null,
      totals: fixtureRiskTotals.filter((t) => !symbol || t.symbol === symbol),
      asOf: now(),
    };
  },
  adminLiquidations: ({ query }) => {
    requireStaff('users.read');
    const symbol = query.get('symbol');
    const from = query.get('from');
    const to = query.get('to');
    const limit = Number(query.get('limit') ?? 50);
    const c = query.get('cursor');
    const m = c === null ? null : LIQ_CURSOR.exec(c);
    if (c !== null && !m) throw new MockError('VALIDATION_ERROR', 'Invalid cursor');
    const rows = [...fixtureLiquidations]
      .filter((l) => (!symbol || l.symbol === symbol) && (!from || Date.parse(l.liquidatedAt) >= Date.parse(from)) && (!to || Date.parse(l.liquidatedAt) <= Date.parse(to)))
      .sort((a, b) => Date.parse(b.liquidatedAt) - Date.parse(a.liquidatedAt) || Number(b.positionId) - Number(a.positionId))
      .filter((l) => {
        if (!m) return true;
        const t = Date.parse(l.liquidatedAt);
        const ct = Date.parse(m[1]!);
        return t < ct || (t === ct && Number(l.positionId) < Number(m[2]));
      });
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return { items, nextCursor: rows.length > limit && last ? `${last.liquidatedAt}|${last.positionId}` : null };
  },
  adminFundingSummary: ({ query }) => {
    requireStaff('exchange.read');
    const symbol = query.get('symbol');
    const items = fixtureFundingSummary.items.filter((i) => !symbol || i.symbol === symbol);
    // the fixture window is fixed; the totals are only exact for the unfiltered view
    return { ...fixtureFundingSummary, from: query.get('from') ?? fixtureFundingSummary.from, to: query.get('to') ?? fixtureFundingSummary.to, items };
  },
  adminMetrics: ({ query }) => {
    requireStaff('exchange.read');
    const range = (query.get('range') ?? '7d') as '7d' | '30d' | '90d';
    const n = Number.parseInt(range, 10);
    const t = Date.now();
    const today = Math.floor((t + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS;
    const first = today - (n - 1) * DAY_MS;
    const days = Array.from({ length: n }, (_, i) => fixtureMetricsDay(new Date(first + i * DAY_MS + VN_OFFSET_MS).toISOString().slice(0, 10), i));
    return { range, from: new Date(first).toISOString(), to: new Date(t).toISOString(), days, totals: fixtureMetricsTotals(days), excludedNonUsdtFills: 0 };
  },
};
