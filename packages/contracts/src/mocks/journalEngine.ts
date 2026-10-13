/**
 * ⚠️ The ONE place where the journal mock calls the journal math — UI development only.
 * Every number comes from @cex/core, the same functions the server uses ("mock = server"):
 *   allocateSpotFill / replayAllocations (spot allocation, module A §2.1) · allocateFuturesLegs (futures legs) ·
 *   computeEntryResult / futuresEntryResult (entry results, §2.5) · computeJournalStats (statistics) · compareCloseKey.
 * This file only converts between the mock's data (JS-number mock wallet, contract shapes) and the core inputs/outputs.
 */
import {
  Dec,
  allocateFuturesLegs,
  allocateSpotFill,
  compareCloseKey,
  compareRecordIds,
  computeEntryResult,
  computeJournalStats,
  futuresEntryResult,
  replayAllocations,
  type FuturesEntryResult,
  type FuturesLeg,
  type FuturesPositionInput,
  type JournalLotRules,
  type JournalStatsEntryInput,
  type SpotAllocationResult,
  type SpotEntryResult,
  type SpotEntryState,
  type SpotFillInput,
} from '@cex/core';
import type { FuturesTrade, JournalDirection, JournalFill, JournalMistake, JournalResult, JournalStats, JournalStatsRange, Trade } from '../index.ts';

export type { FuturesLeg, SpotAllocationResult, SpotEntryState, SpotFillInput };

const f8 = (n: number) => (Math.round(n * 1e8) / 1e8).toFixed(8);

/** Σ of decimal strings, 8 decimals (quantities shown on an entry). */
export const sumDecimals = (values: readonly string[]): string => values.reduce((a, v) => a.add(v), new Dec(0)).toFixed(8);

// ───────────────────────────── spot

/** Core input of a mock spot trade. */
export const spotFillOfTrade = (t: Trade): SpotFillInput => ({ id: t.id, side: t.side, price: t.price, quantity: t.quantity, quoteQty: t.quoteQty, fee: t.fee, createdAt: t.createdAt });

/** Core input rebuilt from a journal fill (fixture entries: their trades are not in the mock wallet; quote = price × quantity, exact on this exchange). */
export const spotFillOfJournalFill = (f: JournalFill): SpotFillInput => ({
  id: f.tradeId,
  side: f.side,
  price: f.price,
  quantity: f.quantity,
  quoteQty: new Dec(f.price).mul(f.quantity).toFixed(8),
  fee: f.fee,
  createdAt: f.executedAt,
});

/**
 * afterFillId: the largest spot fill id of this (user, pair) that already has a journal row (UNATTRIBUTED included), or null.
 * The mock records fills in id order, so `outOfOrder` stays false here (the server rebuilds when it is true — module A §2.3 (e)).
 */
export function allocateSpot(state: SpotEntryState | null, fill: SpotFillInput, lot: JournalLotRules, afterFillId: string | null): SpotAllocationResult {
  return allocateSpotFill(state, fill, lot, afterFillId);
}

/** Largest fill id (numeric ids, compared like PostgreSQL bigint). */
export const maxFillId = (ids: readonly string[]): string | null => ids.reduce<string | null>((m, id) => (m === null || compareRecordIds(id, m) > 0 ? id : m), null);

/**
 * Fills chosen for ONE MANUAL entry, replayed in fill id order. Exactly one round trip is accepted:
 * the earliest fill must open it (else NO_OPENING_FILL) and nothing may come after it closed (else MULTIPLE_ROUND_TRIPS).
 */
export function replayManualSpot(
  fills: SpotFillInput[],
  lot: JournalLotRules,
): { ok: true; state: SpotEntryState; allocations: Map<string, { allocatedQty: string; unattributedQty: string; allocatedQuote: string; allocatedFee: string }> } | { ok: false; reason: 'NO_OPENING_FILL' | 'MULTIPLE_ROUND_TRIPS' } {
  const r = replayAllocations(fills, lot);
  if (r.allocations.length === 0 || r.allocations[0]!.action === 'UNATTRIBUTED') return { ok: false, reason: 'NO_OPENING_FILL' };
  if (r.entries.length !== 1 || r.allocations.some((a) => a.action === 'UNATTRIBUTED')) return { ok: false, reason: 'MULTIPLE_ROUND_TRIPS' };
  return { ok: true, state: r.entries[0]!.state, allocations: new Map(r.allocations.map((a) => [a.fillId, a])) };
}

// ───────────────────────────── futures

export interface MockFuturesLegInfo {
  positionId: string | null;
  closedPositionId: string | null;
  closeQty: number;
  openQty: number;
}

/** CLOSE / OPEN legs of a mock futures fill; null when the fill has no recorded legs (like a fill from before A2). */
export function futuresLegsOf(t: FuturesTrade, info: MockFuturesLegInfo | undefined, qtyDecimals: number): FuturesLeg[] | null {
  if (!info) return null;
  const close = info.closedPositionId && info.closeQty > 0 ? info.closeQty.toFixed(qtyDecimals) : '0';
  const open = new Dec(t.quantity).sub(close);
  return allocateFuturesLegs({
    id: t.id,
    side: t.side,
    price: t.price,
    quantity: t.quantity,
    fee: t.fee,
    realizedPnl: t.realizedPnl,
    createdAt: t.createdAt,
    positionId: open.gt(0) ? info.positionId : null,
    closedPositionId: info.closedPositionId,
    closeQty: close,
    openQty: open.toFixed(),
  });
}

/** A mock wallet position (JS numbers) as the core reads it. */
export function positionInput(
  p: { side: 'LONG' | 'SHORT'; status: 'OPEN' | 'CLOSED'; quantity: string; realized: number | string; fees: number | string; funding: number | string; openedAt: string; closedAt: string | null; closeReason: string | null },
  legs: readonly JournalFill[],
): FuturesPositionInput {
  const num = (v: number | string) => (typeof v === 'number' ? f8(v) : v);
  return {
    side: p.side,
    status: p.status,
    quantity: p.quantity,
    realizedPnl: num(p.realized),
    fees: num(p.fees),
    funding: num(p.funding),
    openedAt: p.openedAt,
    closedAt: p.closedAt,
    closeReason: p.closeReason,
    legs: legs.filter((l) => l.leg !== 'SPOT').map((l) => ({ leg: l.leg as 'OPEN' | 'CLOSE', price: l.price, qty: l.allocatedQty })),
  };
}

// ───────────────────────────── results

/** Contract result from a core result (market-specific fields are null for the other market). */
export function toJournalResult(r: SpotEntryResult | FuturesEntryResult): JournalResult {
  return {
    rMetricsVersion: r.rMetricsVersion,
    market: r.market,
    direction: r.direction,
    status: r.status,
    entryQty: r.entryQty,
    avgEntryPrice: r.avgEntryPrice,
    avgExitPrice: r.avgExitPrice,
    realizedPnl: r.realizedPnl,
    netPnl: r.netPnl,
    fees: r.fees,
    funding: r.funding,
    riskUsdt: r.riskUsdt,
    rMultiple: r.rMultiple,
    outcome: r.outcome,
    holdingMs: r.holdingMs,
    dustQty: r.market === 'SPOT' ? r.dustQty : null,
    liquidated: r.market === 'FUTURES' ? r.liquidated : null,
    legsConsistent: r.market === 'FUTURES' ? r.legsConsistent : null,
  };
}

export const spotResult = (state: SpotEntryState, initialStop: string | null): JournalResult => toJournalResult(computeEntryResult(state, { initialStop }));
export const futuresResult = (position: FuturesPositionInput, initialStop: string | null): JournalResult => toJournalResult(futuresEntryResult(position, { initialStop }));

/** LONG: a stop at or above the average entry is on the wrong side; SHORT: at or below. */
export function stopOnWrongSide(direction: JournalDirection, stop: string, avgEntryPrice: string | null): boolean {
  if (avgEntryPrice === null) return false;
  const c = new Dec(stop).cmp(new Dec(avgEntryPrice));
  return direction === 'LONG' ? c >= 0 : c <= 0;
}

// ───────────────────────────── statistics

/**
 * journalStats of the mock: CLOSED / VOID entries already filtered by range and filters, in any order
 * (sorted here by (closedAt, id) with compareCloseKey, as computeJournalStats requires).
 */
export function journalStats(entries: JournalStatsEntryInput[], range: JournalStatsRange, from: string | null, to: string): JournalStats {
  const res = computeJournalStats([...entries].sort((a, b) => compareCloseKey({ closedAt: a.closedAt!, id: a.id }, { closedAt: b.closedAt!, id: b.id })));
  return {
    basis: res.basis,
    rMetricsVersion: res.rMetricsVersion,
    range,
    from,
    to,
    weekdayUtcOffsetMinutes: res.weekdayUtcOffsetMinutes,
    excluded: res.excluded,
    summary: res.summary,
    bySetup: res.bySetup,
    bySymbol: res.bySymbol,
    byMarket: res.byMarket,
    byDirection: res.byDirection,
    byWeekday: res.byWeekday,
    byMistake: res.byMistake.map((g) => ({ ...g, key: g.key as JournalMistake })),
  };
}

export type { JournalStatsEntryInput };
