/**
 * Module AD / AD2 fixtures — UI development only. Numbers are hand-computed (mmr 0.004, tick 0.1 BTC / 0.01 ETH) so a
 * screen can be checked by eye:
 *  - BTC LONG 0.01 @ 80000, 20x, margin 40.005, mark 80000: liq 76314.8, distance 0.046065, ratio 3.2 / 40.005.
 *  - BTC SHORT 0.5 @ 79000, 10x, margin 3950, mark 80000: PnL -500, liq 86553.7, distance 0.081921, ratio 160 / 3450.
 *  - ETH LONG 2 @ 2500, 5x, margin 1000, mark STALE: everything that needs the mark is null.
 */
import { dec, toFixedStr } from '@cex/core';
import type { AdminFundingSummary, AdminLiquidation, AdminMetrics, MetricsDay, RiskPosition, RiskSymbolTotals } from '../adminRisk.ts';

export const fixtureRiskPositions: RiskPosition[] = [
  {
    positionId: '101',
    userId: '00000000-0000-4000-8000-000000000001',
    uid: '10000001',
    email: 'demo@example.com',
    isBot: false,
    symbol: 'BTCUSDT',
    side: 'LONG',
    leverage: 20,
    quantity: '0.01',
    entryPrice: '80000',
    markPrice: '80000',
    notional: '800.00000000',
    margin: '40.00500000',
    unrealizedPnl: '0.00000000',
    liquidationPrice: '76314.8',
    liqDistance: '0.046065',
    marginRatio: '0.079990',
    openedAt: '2026-10-16T02:00:00.000Z',
  },
  {
    positionId: '102',
    userId: '00000000-0000-4000-8000-000000000002',
    uid: '10000002',
    email: 'trader@example.com',
    isBot: false,
    symbol: 'BTCUSDT',
    side: 'SHORT',
    leverage: 10,
    quantity: '0.5',
    entryPrice: '79000',
    markPrice: '80000',
    notional: '40000.00000000',
    margin: '3950.00000000',
    unrealizedPnl: '-500.00000000',
    liquidationPrice: '86553.7',
    liqDistance: '0.081921',
    marginRatio: '0.046377',
    openedAt: '2026-10-15T09:30:00.000Z',
  },
  {
    positionId: '103',
    userId: '00000000-0000-4000-8000-000000000002',
    uid: '10000002',
    email: 'trader@example.com',
    isBot: false,
    symbol: 'ETHUSDT',
    side: 'LONG',
    leverage: 5,
    quantity: '2',
    entryPrice: '2500',
    markPrice: null,
    notional: null,
    margin: '1000.00000000',
    unrealizedPnl: null,
    liquidationPrice: '2008.04',
    liqDistance: null,
    marginRatio: null,
    openedAt: '2026-10-14T11:00:00.000Z',
  },
];

export const fixtureRiskTotals: RiskSymbolTotals[] = [
  { symbol: 'BTCUSDT', positions: 2, longQty: '0.01', shortQty: '0.5', longNotional: '800.00000000', shortNotional: '40000.00000000', margin: '3990.00500000', markStatus: 'LIVE' },
  { symbol: 'ETHUSDT', positions: 1, longQty: '2', shortQty: '0', longNotional: null, shortNotional: null, margin: '1000.00000000', markStatus: 'STALE' },
];

/** Newest first. Loss = margin − payout: the first lost it all (the remainder did not cover the fee), the second got 1.5 back. */
export const fixtureLiquidations: AdminLiquidation[] = [
  {
    positionId: '98',
    userId: '00000000-0000-4000-8000-000000000001',
    uid: '10000001',
    email: 'demo@example.com',
    isBot: false,
    symbol: 'BTCUSDT',
    side: 'LONG',
    leverage: 20,
    quantity: '0.01',
    entryPrice: '80000',
    liquidationPrice: '76300',
    margin: '40.00500000',
    lostMargin: '40.00500000',
    fee: '0.00000000',
    liquidatedAt: '2026-10-16T21:15:00.000Z',
  },
  {
    positionId: '90',
    userId: '00000000-0000-4000-8000-000000000002',
    uid: '10000002',
    email: 'trader@example.com',
    isBot: false,
    symbol: 'ETHUSDT',
    side: 'SHORT',
    leverage: 10,
    quantity: '1',
    entryPrice: '2500',
    liquidationPrice: '2740',
    margin: '250.00000000',
    lostMargin: '248.50000000',
    fee: '13.70000000',
    liquidatedAt: '2026-10-15T04:00:00.000Z',
  },
];

/** Funding of a window: LONG pays SHORT while the rate is positive. */
export const fixtureFundingSummary: AdminFundingSummary = {
  from: '2026-10-10T00:00:00.000Z',
  to: '2026-10-17T00:00:00.000Z',
  items: [
    {
      symbol: 'BTCUSDT',
      long: { paid: '4.20000000', received: '0.50000000', net: '-3.70000000', payments: 9 },
      short: { paid: '0.30000000', received: '3.80000000', net: '3.50000000', payments: 5 },
      net: '-0.20000000',
      payments: 14,
    },
    {
      symbol: 'ETHUSDT',
      long: { paid: '1.00000000', received: '0.00000000', net: '-1.00000000', payments: 3 },
      short: { paid: '0.00000000', received: '0.90000000', net: '0.90000000', payments: 2 },
      net: '-0.10000000',
      payments: 5,
    },
  ],
  totals: {
    long: { paid: '5.20000000', received: '0.50000000', net: '-4.70000000', payments: 12 },
    short: { paid: '0.30000000', received: '4.70000000', net: '4.40000000', payments: 7 },
    net: '-0.30000000',
    payments: 19,
  },
};

const ZERO = '0.00000000';
export const fixtureZeroMetricsDay = (date: string): MetricsDay => ({ date, spotVolume: ZERO, futuresVolume: ZERO, spotFees: ZERO, futuresFees: ZERO, taxWithheld: ZERO, newUsers: 0, activeTraders: 0, liquidations: 0 });

/** A busy day: every 4th day (i % 4 === 0) is a zero day, so a chart has gaps. `i` counts from the oldest day. */
export function fixtureMetricsDay(date: string, i: number): MetricsDay {
  if (i % 4 === 0) return fixtureZeroMetricsDay(date);
  const k = i % 4;
  return {
    date,
    spotVolume: toFixedStr(dec(String(k)).mul('1000')),
    futuresVolume: toFixedStr(dec(String(k)).mul('5000')),
    spotFees: toFixedStr(dec(String(k))),
    futuresFees: toFixedStr(dec(String(k)).mul('2.5')),
    taxWithheld: k === 2 ? '1.25000000' : ZERO,
    newUsers: k,
    activeTraders: 2 + k,
    liquidations: k === 3 ? 1 : 0,
  };
}

/** Sums of `days`; `activeTraders` is the largest day here (the true distinct count needs the fills — the server computes it). */
export function fixtureMetricsTotals(days: MetricsDay[]): AdminMetrics['totals'] {
  const sum = (pick: (d: MetricsDay) => string) => toFixedStr(days.reduce((a, d) => a.add(dec(pick(d))), dec('0')));
  return {
    spotVolume: sum((d) => d.spotVolume),
    futuresVolume: sum((d) => d.futuresVolume),
    spotFees: sum((d) => d.spotFees),
    futuresFees: sum((d) => d.futuresFees),
    taxWithheld: sum((d) => d.taxWithheld),
    newUsers: days.reduce((a, d) => a + d.newUsers, 0),
    activeTraders: Math.max(0, ...days.map((d) => d.activeTraders)),
    liquidations: days.reduce((a, d) => a + d.liquidations, 0),
  };
}
