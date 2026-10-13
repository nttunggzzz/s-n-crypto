/**
 * ⚠️ The ONE place where the journal mock does journal math — UI development only.
 *
 * TODO(A1 wiring, after be/journal-a1-stats is merged): replace each placeholder below with the @cex/core function named
 * in its TODO (and add "@cex/core" to packages/contracts/package.json dependencies), so the mock and the server use the
 * same code ("mock = server"). The resolvers in journal.ts only call this file, so the wiring stays here:
 *   allocateSpot        → allocateSpotFill(entryState | null, fill, lotRules)
 *   futuresLegs         → allocateFuturesLegs(fill)
 *   entryResult         → computeEntryResult(state, plan) (SPOT) / futuresEntryResult(position, plan) (FUTURES)
 *   replaySpot          → replayAllocations(fills[], lotRulesSnapshot)
 *   journalStats        → computeJournalStats(closedEntries, opts) (+ summarizeR, R_METRICS_VERSION)
 *
 * Until then: quantities are allocated with plain JS numbers (state machine of module A §2.1, placeholder rounding),
 * live entries get NO computed result (every result field null = "not computed yet"), and statistics are the
 * hand-computed fixture (`fixtureJournalStats`) whatever the filters — only `excluded` is counted from the mock entries.
 */
import type { JournalResult, JournalStats, RSummary } from '../index.ts';
import { fixtureJournalStats } from '../fixtures/journal.ts';
import type { MockLotRules } from './journalState.ts';

// TODO(A1 wiring): R_METRICS_VERSION from @cex/core.
const R_METRICS_VERSION = 1;

const round8 = (x: number) => Math.round(x * 1e8) / 1e8;
const s8 = (x: number) => round8(x).toFixed(8);

// ───────────────────────────── spot allocation (module A §2.1)

export interface SpotEntryState {
  /** Σ(bought − buy fee in the coin) − Σ allocated sells. */
  openQty: number;
}

export interface SpotFillIn {
  side: 'BUY' | 'SELL';
  price: string;
  quantity: string;
  quoteQty: string;
  fee: string;
}

export interface SpotAllocation {
  action: 'OPEN' | 'ADD' | 'REDUCE' | 'CLOSE' | 'UNATTRIBUTED';
  allocatedQty: string;
  unattributedQty: string;
  allocatedQuote: string;
  allocatedFee: string;
  /** null after CLOSE / UNATTRIBUTED without an entry. */
  newState: SpotEntryState | null;
  /** CLOSE only: what was left below stepSize / minNotional. */
  dustQty: string | null;
}

/** TODO(A1 wiring): allocateSpotFill from @cex/core. Placeholder with JS numbers. */
export function allocateSpot(state: SpotEntryState | null, fill: SpotFillIn, lot: MockLotRules): SpotAllocation {
  const qty = Number(fill.quantity);
  const fee = Number(fill.fee);
  if (fill.side === 'BUY') {
    return {
      action: state ? 'ADD' : 'OPEN',
      allocatedQty: s8(qty),
      unattributedQty: s8(0),
      allocatedQuote: s8(Number(fill.quoteQty)),
      allocatedFee: s8(fee),
      newState: { openQty: round8((state?.openQty ?? 0) + qty - fee) },
      dustQty: null,
    };
  }
  if (!state) return { action: 'UNATTRIBUTED', allocatedQty: s8(0), unattributedQty: s8(qty), allocatedQuote: s8(0), allocatedFee: s8(0), newState: null, dustQty: null };
  const alloc = Math.min(qty, state.openQty);
  const share = qty > 0 ? alloc / qty : 0;
  const left = round8(state.openQty - alloc);
  const closes = left < Number(lot.stepSize) - 1e-12 || left * Number(fill.price) < Number(lot.minNotional);
  return {
    action: closes ? 'CLOSE' : 'REDUCE',
    allocatedQty: s8(alloc),
    unattributedQty: s8(qty - alloc),
    allocatedQuote: s8(Number(fill.quoteQty) * share),
    allocatedFee: s8(fee * share),
    newState: closes ? null : { openQty: left },
    dustQty: closes ? s8(left) : null,
  };
}

/**
 * TODO(A1 wiring): replayAllocations from @cex/core. Replays the fills of ONE entry in fill id order (MANUAL create /
 * addOrderIds). `closedEarly` = the entry closed before the last fill (the request is refused: ENTRY_NOT_EXTENDABLE).
 */
export function replaySpot(fills: SpotFillIn[], lot: MockLotRules): { allocations: SpotAllocation[]; state: SpotEntryState | null; closedEarly: boolean } {
  let state: SpotEntryState | null = null;
  const allocations: SpotAllocation[] = [];
  let closedAt = -1;
  fills.forEach((f, i) => {
    const a = allocateSpot(state, f, lot);
    allocations.push(a);
    state = a.newState;
    if (a.action === 'CLOSE' && closedAt < 0) closedAt = i;
  });
  return { allocations, state, closedEarly: closedAt >= 0 && closedAt < fills.length - 1 };
}

// ───────────────────────────── futures legs (module A §2.1)

export interface FuturesFillLegsIn {
  positionId: string | null;
  closedPositionId: string | null;
  closeQty: number;
  openQty: number;
}

/** TODO(A1 wiring): allocateFuturesLegs from @cex/core. CLOSE leg first, then OPEN (a flip has both). */
export function futuresLegs(fill: FuturesFillLegsIn): { leg: 'OPEN' | 'CLOSE'; positionId: string; qty: number }[] {
  const legs: { leg: 'OPEN' | 'CLOSE'; positionId: string; qty: number }[] = [];
  if (fill.closeQty > 0 && fill.closedPositionId) legs.push({ leg: 'CLOSE', positionId: fill.closedPositionId, qty: fill.closeQty });
  if (fill.openQty > 0 && fill.positionId) legs.push({ leg: 'OPEN', positionId: fill.positionId, qty: fill.openQty });
  return legs;
}

// ───────────────────────────── results and statistics

/** Every field null: "not computed yet" (never 0 by guess). */
export const PENDING_RESULT: JournalResult = {
  entryQty: null,
  avgEntryPrice: null,
  avgExitPrice: null,
  netPnl: null,
  fees: null,
  funding: null,
  riskUsdt: null,
  rMultiple: null,
  outcome: null,
  holdingMs: null,
};

/**
 * TODO(A1 wiring): computeEntryResult (SPOT) / futuresEntryResult (FUTURES) from @cex/core.
 * Placeholder: the fixture result while the entry is untouched, otherwise PENDING_RESULT.
 */
export function entryResult(current: JournalResult, fixtureResult: boolean): JournalResult {
  return fixtureResult ? current : { ...PENDING_RESULT };
}

export const EMPTY_SUMMARY: RSummary = {
  rMetricsVersion: R_METRICS_VERSION,
  count: 0,
  wins: 0,
  losses: 0,
  breakevens: 0,
  winRate: null,
  rCount: 0,
  totalR: null,
  expectancyR: null,
  profitFactorR: null,
  profitFactorUsdt: null,
  netPnl: null,
  maxDrawdownR: null,
  maxDrawdownUsdt: null,
  longestWinStreak: null,
  longestLossStreak: null,
  curve: [],
};

/**
 * TODO(A1 wiring): computeJournalStats(closedEntries, opts) from @cex/core over the CLOSED, non-VOID, non-needsReview
 * entries of the range and filters (sorted by closedAt, id). Placeholder: the fixture statistics, or nothing (count 0)
 * when the mock has no demo data.
 */
export function journalStats(hasDemoData: boolean): Pick<JournalStats, 'summary' | 'bySetup' | 'bySymbol' | 'byDirection' | 'byWeekday' | 'byMistake'> {
  if (!hasDemoData) return { summary: { ...EMPTY_SUMMARY, curve: [] }, bySetup: [], bySymbol: [], byDirection: [], byWeekday: [], byMistake: [] };
  const { summary, bySetup, bySymbol, byDirection, byWeekday, byMistake } = structuredClone(fixtureJournalStats);
  return { summary, bySetup, bySymbol, byDirection, byWeekday, byMistake };
}
