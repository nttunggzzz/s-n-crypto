import { AMOUNT_SCALE, Dec, ZERO, dec } from './decimal.ts';

/**
 * The ONE place where R and R statistics are computed (docs/plans/quy-uoc-R-va-nguon-du-lieu.md §1, §1.1).
 * The trading journal (Module A, basis ACTUAL_FILLS) and the signal engine (Module C, basis MODELED_CANDLES)
 * call these functions; they never re-implement them.
 *
 *   risk  = |entry − initial stop| × entry quantity          (price risk only, no fees)
 *   R     = net PnL ÷ risk                                  (fees, slippage, funding are in net PnL)
 *   no initial stop → risk and R are null (A-D4)
 *
 * Pure functions, Decimal only (`Dec`), browser-safe (no node:* imports — the UI imports @cex/core).
 * Changing any formula here → bump R_METRICS_VERSION and note it in the contracts CHANGELOG.
 */
export const R_METRICS_VERSION = 1 as const;

/** R values are kept at 8 decimals (half-up), so a stored R (numeric(38,18)) equals the computed one. */
export const R_SCALE = 8;
/** Ratios in summaries (win rate, expectancy, profit factor) — 8 decimals, half-up. */
export const RATIO_SCALE = 8;

/** A decimal input: a `Dec` or a decimal string such as "12.5" (never a JS number). */
export type DecLike = Dec | string;
/** A point in time: a `Date` or an ISO-8601 string (sub-millisecond digits are kept for ordering). */
export type TimeLike = Date | string;
/** Row id: a bigserial (number or digit string, compared numerically) or a uuid string (compared as text). */
export type RecordId = string | number;
export type ROutcome = 'WIN' | 'LOSS' | 'BREAKEVEN';

// ───────────────────────────── small shared helpers (used by journalFills / journalStats too)

/** `dec()` that also accepts a Dec; `what` names the field in the error. */
export function toDec(v: DecLike, what: string): Dec {
  try {
    return dec(v);
  } catch {
    throw new Error(`${what}: invalid decimal ${JSON.stringify(v)}`);
  }
}

function assertScale(d: Dec, scale: number, what: string): void {
  if (d.decimalPlaces() > scale) throw new Error(`${what}: more than ${scale} decimals (${d.toFixed()})`);
}

/** Fixed 8-decimal string, half-up (inputs are already at ≤ 8 dp wherever money is concerned). */
export function fmt8(d: Dec): string {
  return d.toFixed(AMOUNT_SCALE, Dec.ROUND_HALF_UP);
}

function ratio(a: Dec, b: Dec): string {
  return a.div(b).toFixed(RATIO_SCALE, Dec.ROUND_HALF_UP);
}

interface TimeKey {
  /** epoch milliseconds */
  ms: number;
  /** sub-millisecond part, in nanoseconds within the millisecond (0 for a Date) */
  sub: number;
}

/** Fraction of seconds in ISO ("…T10:00:00.123456Z") or PostgreSQL text ("… 10:00:00.123456+00") form. */
const ISO_FRACTION_RE = /[T ]\d{2}:\d{2}:\d{2}\.(\d+)/;

/** Parses a time; throws on an invalid one. */
export function timeKey(t: TimeLike, what = 'time'): TimeKey {
  if (t instanceof Date) {
    const ms = t.getTime();
    if (Number.isNaN(ms)) throw new Error(`${what}: invalid Date`);
    return { ms, sub: 0 };
  }
  if (typeof t !== 'string') throw new Error(`${what}: expected Date or ISO string`);
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) throw new Error(`${what}: invalid time ${JSON.stringify(t)}`);
  const frac = ISO_FRACTION_RE.exec(t)?.[1] ?? '';
  const sub = frac.length > 3 ? Number(frac.slice(3, 9).padEnd(6, '0')) : 0;
  return { ms, sub };
}

/** ISO string (millisecond precision) of a time. */
export function isoTime(t: TimeLike, what = 'time'): string {
  return new Date(timeKey(t, what).ms).toISOString();
}

function compareTimeKeys(a: TimeKey, b: TimeKey): number {
  return a.ms !== b.ms ? (a.ms < b.ms ? -1 : 1) : a.sub !== b.sub ? (a.sub < b.sub ? -1 : 1) : 0;
}

const DIGITS_RE = /^\d+$/;

function idText(id: RecordId): string {
  if (typeof id === 'number') {
    if (!Number.isSafeInteger(id) || id < 0) throw new Error(`id must be a non-negative safe integer, got ${id}`);
    return String(id);
  }
  if (typeof id !== 'string' || id.length === 0) throw new Error('id must be a non-empty string or number');
  return id;
}

/**
 * Order of row ids, matching PostgreSQL `ORDER BY id`:
 * bigserial ids (numbers or digit strings) numerically; uuids (canonical lowercase) as text.
 */
export function compareRecordIds(a: RecordId, b: RecordId): number {
  const sa = idText(a);
  const sb = idText(b);
  if (DIGITS_RE.test(sa) && DIGITS_RE.test(sb)) {
    const na = sa.replace(/^0+(?=\d)/, '');
    const nb = sb.replace(/^0+(?=\d)/, '');
    if (na.length !== nb.length) return na.length < nb.length ? -1 : 1;
    return na < nb ? -1 : na > nb ? 1 : 0;
  }
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** Normalised id text (what results echo back). */
export function recordIdText(id: RecordId): string {
  return idText(id);
}

/**
 * The sort key every R series must already be in: (close time, id) ascending
 * — journal: (closed_at, entry id); signals: (exited_at, signal id).
 * Use it to sort in JS, or sort in SQL by `date_trunc('milliseconds', closed_at), id` when the rows come back as `Date`
 * (a JS Date has millisecond precision; PostgreSQL keeps microseconds).
 */
export function compareCloseKey(a: { closedAt: TimeLike; id: RecordId }, b: { closedAt: TimeLike; id: RecordId }): number {
  return compareTimeKeys(timeKey(a.closedAt, 'closedAt'), timeKey(b.closedAt, 'closedAt')) || compareRecordIds(a.id, b.id);
}

// ───────────────────────────── R

/**
 * Planned price risk in quote currency: |entryPrice − stopPrice| × quantity, rounded half-up to 8 dp.
 * - direction: LONG needs stop < entry, SHORT needs stop > entry; a stop on the wrong side (or equal to the entry)
 *   has no meaning as a risk → null (the server refuses such input with 409 STOP_WRONG_SIDE).
 * - entryPrice: realised volume-weighted average entry price, before fees.
 * - stopPrice: the INITIAL stop (moving the stop later never changes this). null/undefined → null.
 * - quantity: entry quantity (Σ quantity entered, before fees).
 * Returns null when there is no stop, the stop is on the wrong side, the quantity is 0, or the risk rounds to 0 (R undefined).
 * Inputs: decimal strings or Dec. Throws on non-positive prices or a negative quantity.
 */
export function riskAmount(i: { direction: 'LONG' | 'SHORT'; entryPrice: DecLike; stopPrice: DecLike | null | undefined; quantity: DecLike }): Dec | null {
  if (i.direction !== 'LONG' && i.direction !== 'SHORT') throw new Error('riskAmount: direction must be LONG or SHORT');
  if (i.stopPrice === null || i.stopPrice === undefined) return null;
  const entry = toDec(i.entryPrice, 'riskAmount.entryPrice');
  const stop = toDec(i.stopPrice, 'riskAmount.stopPrice');
  const qty = toDec(i.quantity, 'riskAmount.quantity');
  if (entry.lte(0)) throw new Error('riskAmount: entryPrice must be > 0');
  if (stop.lte(0)) throw new Error('riskAmount: stopPrice must be > 0');
  if (qty.lt(0)) throw new Error('riskAmount: quantity must be >= 0');
  if (i.direction === 'LONG' ? stop.gte(entry) : stop.lte(entry)) return null;
  const risk = entry.sub(stop).abs().mul(qty).toDecimalPlaces(AMOUNT_SCALE, Dec.ROUND_HALF_UP);
  return risk.gt(0) ? risk : null;
}

/**
 * R multiple = netPnl ÷ risk, rounded half-up to 8 dp (R_SCALE).
 * - netPnl: signed net profit/loss in quote currency AFTER every fee, slippage and funding
 *   (for a SHORT the caller's PnL is already (entry − exit) × qty − costs; the denominator stays positive).
 * - risk: from `riskAmount`. null/undefined or 0 → null. Negative → throws.
 */
export function rMultiple(i: { netPnl: DecLike | null | undefined; risk: DecLike | null | undefined }): Dec | null {
  if (i.netPnl === null || i.netPnl === undefined || i.risk === null || i.risk === undefined) return null;
  const risk = toDec(i.risk, 'rMultiple.risk');
  if (risk.lt(0)) throw new Error('rMultiple: risk must be >= 0');
  if (risk.isZero()) return null;
  return toDec(i.netPnl, 'rMultiple.netPnl').div(risk).toDecimalPlaces(R_SCALE, Dec.ROUND_HALF_UP);
}

/**
 * WIN when R > 0 (or, when R is null, net PnL > 0); LOSS when < 0; BREAKEVEN when it is 0 after rounding to 8 dp (half-up).
 * Throws when both are null.
 */
export function rOutcome(i: { r: DecLike | null | undefined; netPnl: DecLike | null | undefined }): ROutcome {
  const v = i.r !== null && i.r !== undefined ? toDec(i.r, 'r') : i.netPnl !== null && i.netPnl !== undefined ? toDec(i.netPnl, 'netPnl') : null;
  if (v === null) throw new Error('rOutcome: needs r or netPnl');
  const x = v.toDecimalPlaces(AMOUNT_SCALE, Dec.ROUND_HALF_UP);
  return x.gt(0) ? 'WIN' : x.lt(0) ? 'LOSS' : 'BREAKEVEN';
}

// ───────────────────────────── summary

/** One closed item of an R series (journal entry or signal). */
export interface RSeriesItem {
  id: RecordId;
  /** close time (journal: closed_at; signal: exited_at) */
  closedAt: TimeLike;
  /** R from `rMultiple` (≤ 8 decimals), or null when there was no initial stop. */
  r: DecLike | null;
  /** Net PnL in quote currency (≤ 8 decimals), or null when the series has no money size (signals: 1R each). */
  netPnl: DecLike | null;
}

export interface RCurvePoint {
  id: string;
  closedAt: string;
  r: string;
  /** C_k = Σ_{i≤k} r_i (C_0 = 0 is implied before the first point) */
  cumR: string;
}

export interface PnlCurvePoint {
  id: string;
  closedAt: string;
  netPnl: string;
  cumNetPnl: string;
}

/**
 * Summary statistics of a closed R series. Decimal values are strings with 8 decimals; counts are integers.
 * n = 0 → every metric null (counts are 0, curves empty). Metrics over R use only items that have R;
 * metrics over USDT use only items that have netPnl; outcomes (win rate, streaks) use every item.
 */
export interface RSummary {
  rMetricsVersion: typeof R_METRICS_VERSION;
  /** all items */
  count: number;
  /** items with R (journal: entries with an initial stop) */
  countWithR: number;
  /** items with netPnl */
  countWithNetPnl: number;
  wins: number;
  losses: number;
  breakevens: number;
  /** wins ÷ count (breakevens count in the denominator), 0–1 */
  winRate: string | null;
  /** Σ r */
  totalR: string | null;
  /** expectancy = plain mean of r = totalR ÷ countWithR */
  expectancyR: string | null;
  /** mean of r over r > 0 (null if none) */
  avgWinR: string | null;
  /** mean of r over r < 0, negative (null if none) */
  avgLossR: string | null;
  /** Σ(r > 0) ÷ |Σ(r < 0)|; null when there is no losing R (undefined), "0.00000000" when no winning R */
  profitFactorR: string | null;
  /** max_k (max_{j≤k} C_j − C_k) on the cumulative R curve starting at C_0 = 0, as a positive number */
  maxDrawdownR: string | null;
  /** Σ netPnl */
  totalNetPnl: string | null;
  /** totalNetPnl ÷ countWithNetPnl */
  avgNetPnl: string | null;
  /** Σ(netPnl > 0) ÷ |Σ(netPnl < 0)|; null when there is no loss */
  profitFactorUsdt: string | null;
  /** drawdown of the cumulative netPnl curve starting at 0 */
  maxDrawdownUsdt: string | null;
  /** longest run of WIN (a BREAKEVEN breaks both runs) */
  longestWinStreak: number | null;
  longestLossStreak: number | null;
  rCurve: RCurvePoint[];
  pnlCurve: PnlCurvePoint[];
}

interface NormItem {
  id: string;
  key: TimeKey;
  closedAt: string;
  r: Dec | null;
  netPnl: Dec | null;
  outcome: ROutcome;
}

function drawdownOf(values: Dec[]): Dec {
  // C_0 = 0 is the first peak, so a series that starts with a loss has its drawdown measured from 0.
  let cum = ZERO;
  let peak = ZERO;
  let maxDd = ZERO;
  for (const v of values) {
    cum = cum.add(v);
    if (cum.gt(peak)) peak = cum;
    const dd = peak.sub(cum);
    if (dd.gt(maxDd)) maxDd = dd;
  }
  return maxDd;
}

/**
 * Summary of a closed R series (R convention §1, §1.1).
 * The series MUST already be sorted ascending by (closedAt, id) — see `compareCloseKey`; unsorted input or a
 * repeated key throws (this function never re-sorts: the order is the caller's decision).
 * Every r must have ≤ 8 decimals (i.e. come from `rMultiple`), every netPnl ≤ 8 decimals; an item needs r or netPnl.
 */
export function summarizeR(series: readonly RSeriesItem[]): RSummary {
  const items: NormItem[] = series.map((s, i) => {
    const r = s.r === null || s.r === undefined ? null : toDec(s.r, `series[${i}].r`);
    const netPnl = s.netPnl === null || s.netPnl === undefined ? null : toDec(s.netPnl, `series[${i}].netPnl`);
    if (r) assertScale(r, R_SCALE, `series[${i}].r (use rMultiple)`);
    if (netPnl) assertScale(netPnl, AMOUNT_SCALE, `series[${i}].netPnl`);
    if (r === null && netPnl === null) throw new Error(`series[${i}]: needs r or netPnl`);
    const key = timeKey(s.closedAt, `series[${i}].closedAt`);
    return { id: idText(s.id), key, closedAt: new Date(key.ms).toISOString(), r, netPnl, outcome: rOutcome({ r, netPnl }) };
  });
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1]!;
    const b = items[i]!;
    const c = compareTimeKeys(a.key, b.key) || compareRecordIds(a.id, b.id);
    if (c >= 0) {
      throw new Error(`summarizeR: series not sorted by (closedAt, id) at index ${i} (${a.closedAt} ${a.id} then ${b.closedAt} ${b.id})`);
    }
  }

  const count = items.length;
  const withR = items.filter((x) => x.r !== null);
  const withPnl = items.filter((x) => x.netPnl !== null);
  const wins = items.filter((x) => x.outcome === 'WIN').length;
  const losses = items.filter((x) => x.outcome === 'LOSS').length;
  const breakevens = count - wins - losses;

  let longestWin = 0;
  let longestLoss = 0;
  let runWin = 0;
  let runLoss = 0;
  for (const x of items) {
    runWin = x.outcome === 'WIN' ? runWin + 1 : 0;
    runLoss = x.outcome === 'LOSS' ? runLoss + 1 : 0;
    longestWin = Math.max(longestWin, runWin);
    longestLoss = Math.max(longestLoss, runLoss);
  }

  const rs = withR.map((x) => x.r!);
  const posR = rs.filter((r) => r.gt(0));
  const negR = rs.filter((r) => r.lt(0));
  const sum = (l: Dec[]) => l.reduce((a, b) => a.add(b), ZERO);
  const totalR = sum(rs);
  const grossWinR = sum(posR);
  const grossLossR = sum(negR).abs();

  const pnls = withPnl.map((x) => x.netPnl!);
  const totalPnl = sum(pnls);
  const grossWinPnl = sum(pnls.filter((p) => p.gt(0)));
  const grossLossPnl = sum(pnls.filter((p) => p.lt(0))).abs();

  let cumR = ZERO;
  const rCurve: RCurvePoint[] = withR.map((x) => {
    cumR = cumR.add(x.r!);
    return { id: x.id, closedAt: x.closedAt, r: fmt8(x.r!), cumR: fmt8(cumR) };
  });
  let cumPnl = ZERO;
  const pnlCurve: PnlCurvePoint[] = withPnl.map((x) => {
    cumPnl = cumPnl.add(x.netPnl!);
    return { id: x.id, closedAt: x.closedAt, netPnl: fmt8(x.netPnl!), cumNetPnl: fmt8(cumPnl) };
  });

  const hasR = rs.length > 0;
  const hasPnl = pnls.length > 0;
  return {
    rMetricsVersion: R_METRICS_VERSION,
    count,
    countWithR: rs.length,
    countWithNetPnl: pnls.length,
    wins,
    losses,
    breakevens,
    winRate: count > 0 ? ratio(new Dec(wins), new Dec(count)) : null,
    totalR: hasR ? fmt8(totalR) : null,
    expectancyR: hasR ? ratio(totalR, new Dec(rs.length)) : null,
    avgWinR: posR.length > 0 ? ratio(grossWinR, new Dec(posR.length)) : null,
    avgLossR: negR.length > 0 ? ratio(sum(negR), new Dec(negR.length)) : null,
    profitFactorR: hasR && grossLossR.gt(0) ? ratio(grossWinR, grossLossR) : null,
    maxDrawdownR: hasR ? fmt8(drawdownOf(rs)) : null,
    totalNetPnl: hasPnl ? fmt8(totalPnl) : null,
    avgNetPnl: hasPnl ? ratio(totalPnl, new Dec(pnls.length)) : null,
    profitFactorUsdt: hasPnl && grossLossPnl.gt(0) ? ratio(grossWinPnl, grossLossPnl) : null,
    maxDrawdownUsdt: hasPnl ? fmt8(drawdownOf(pnls)) : null,
    longestWinStreak: count > 0 ? longestWin : null,
    longestLossStreak: count > 0 ? longestLoss : null,
    rCurve,
    pnlCurve,
  };
}
