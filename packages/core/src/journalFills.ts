import { AMOUNT_SCALE, Dec, ZERO, roundDown, roundUp } from './decimal.ts';
import { ENTRY_PRICE_SCALE, floorSigned, type PositionSide } from './futures.ts';
import {
  R_METRICS_VERSION,
  compareRecordIds,
  fmt8,
  isoTime,
  recordIdText,
  rMultiple,
  rOutcome,
  riskAmount,
  timeKey,
  toDec,
  type DecLike,
  type ROutcome,
  type RecordId,
  type TimeLike,
} from './rMetrics.ts';

/**
 * Trading journal (Module A §2.1, §2.5): how fills become journal entries, and an entry's result.
 * Pure functions, Decimal only, browser-safe (no node:*). Amounts are 8-decimal strings in every state/result.
 *
 * Spot — one AUTO entry OPEN per (user, pair), recorded fill by fill:
 *   BUY,  no open entry  → OPEN   (new entry; the pair's stepSize/minNotional are copied into it)
 *   BUY,  open entry     → ADD
 *   SELL, open entry     → REDUCE, up to the entry's open quantity; the rest is unattributed
 *                          → CLOSE when afterwards open qty < stepSize or open qty × THIS fill's price < minNotional
 *                            (the left-over is dust, no PnL)
 *   SELL, no open entry  → UNATTRIBUTED (spot cannot go short; no entry is opened)
 * On this exchange a BUY fee is taken in the base asset and a SELL fee in the quote asset (contract `Trade.fee`).
 *
 * Futures — one entry = one position; a fill has at most two legs: CLOSE (close_qty, closed_position_id) and
 * OPEN (open_qty, position_id). Legs come from the futures_trades columns added in A2, never from position_id alone.
 */

/** Lot rules of a pair, copied into a spot entry when it opens (journal_entries.lot_step / lot_min_notional). */
export interface JournalLotRules {
  stepSize: DecLike;
  minNotional: DecLike;
}

/** A spot fill (a `trades` row / contract `Trade`). Decimal fields are decimal strings or Dec. */
export interface SpotFillInput {
  id: RecordId;
  side: 'BUY' | 'SELL';
  price: DecLike;
  /** base quantity, ≤ 8 decimals */
  quantity: DecLike;
  /** price × quantity in quote (USDT), ≤ 8 decimals */
  quoteQty: DecLike;
  /** BUY: in base asset; SELL: in quote asset. ≤ 8 decimals */
  fee: DecLike;
  createdAt: TimeLike;
}

export type SpotAllocationAction = 'OPEN' | 'ADD' | 'REDUCE' | 'CLOSE' | 'UNATTRIBUTED';

/**
 * Aggregates of one spot entry (all decimal strings, 8 dp unless noted). It can always be rebuilt from the
 * entry's own fills: `replayAllocations(fillsOfEntry, entry.lotRules).entries[0].state`.
 * Invariant: buyQty − buyFee = soldQty + openQty + dustQty.
 */
export interface SpotEntryState {
  status: 'OPEN' | 'CLOSED';
  /** fill that opened the entry — identifies the entry when allocations are rebuilt */
  openFillId: string;
  lastFillId: string;
  openedAt: string;
  closedAt: string | null;
  /** time of the first allocated SELL: the initial stop is locked from then on (Module A §2.5) */
  firstReduceAt: string | null;
  /** copied at open */
  lotRules: { stepSize: string; minNotional: string };
  fillCount: number;
  /** Σ BUY quantity before fee = entry quantity */
  buyQty: string;
  /** Σ BUY quoteQty = USDT paid */
  buyQuote: string;
  /** Σ BUY fee, base asset */
  buyFee: string;
  /** Σ BUY fee × fill price, USDT value of the buy fees (exact, may have > 8 decimals) */
  buyFeeQuote: string;
  /** Σ allocated SELL quantity */
  soldQty: string;
  /** Σ allocated SELL proceeds before fee */
  sellQuote: string;
  /** Σ allocated SELL fee, quote asset */
  sellFee: string;
  /** net base quantity still open */
  openQty: string;
  /** left-over below the lot rules when the entry closed (no PnL) */
  dustQty: string;
}

/** One journal_fills row worth of allocation. Fee unit = the fill's fee asset (BUY: base, SELL: quote). */
export interface SpotAllocationResult {
  action: SpotAllocationAction;
  allocatedQty: string;
  unattributedQty: string;
  allocatedQuote: string;
  allocatedFee: string;
  /** the entry after this fill; null for UNATTRIBUTED (no entry touched) */
  newState: SpotEntryState | null;
  /**
   * true when the fill id is not greater than `afterFillId` (the largest fill of this (user, pair) already recorded):
   * the fill committed out of id order, so this allocation may differ from `replayAllocations` → rebuild (Module A §2.3 (e)).
   * Checked on every branch, OPEN and UNATTRIBUTED included.
   */
  outOfOrder: boolean;
}

interface SpotFillN {
  id: string;
  side: 'BUY' | 'SELL';
  price: Dec;
  qty: Dec;
  quote: Dec;
  fee: Dec;
  at: string;
}

function scale8(d: Dec, what: string): Dec {
  if (d.decimalPlaces() > AMOUNT_SCALE) throw new Error(`${what}: more than ${AMOUNT_SCALE} decimals (${d.toFixed()})`);
  return d;
}

function normSpotFill(f: SpotFillInput): SpotFillN {
  if (f.side !== 'BUY' && f.side !== 'SELL') throw new Error(`spot fill ${String(f.id)}: side must be BUY or SELL`);
  const price = toDec(f.price, 'fill.price');
  const qty = scale8(toDec(f.quantity, 'fill.quantity'), 'fill.quantity');
  const quote = scale8(toDec(f.quoteQty, 'fill.quoteQty'), 'fill.quoteQty');
  const fee = scale8(toDec(f.fee, 'fill.fee'), 'fill.fee');
  if (price.lte(0) || qty.lte(0)) throw new Error(`spot fill ${String(f.id)}: price and quantity must be > 0`);
  if (quote.lt(0) || fee.lt(0)) throw new Error(`spot fill ${String(f.id)}: quoteQty and fee must be >= 0`);
  if (f.side === 'BUY' && fee.gte(qty)) throw new Error(`spot fill ${String(f.id)}: BUY fee (base) must be < quantity`);
  return { id: recordIdText(f.id), side: f.side, price, qty, quote, fee, at: isoTime(f.createdAt, 'fill.createdAt') };
}

function normLotRules(r: JournalLotRules): { stepSize: Dec; minNotional: Dec } {
  const stepSize = toDec(r.stepSize, 'lotRules.stepSize');
  const minNotional = toDec(r.minNotional, 'lotRules.minNotional');
  if (stepSize.lte(0) || minNotional.lt(0)) throw new Error('lotRules: stepSize must be > 0 and minNotional >= 0');
  return { stepSize, minNotional };
}

const s8 = fmt8;
const d = (v: string) => new Dec(v);

/**
 * Applies one spot fill to the user's open AUTO entry of that pair (Module A §2.1).
 * - entryState: the OPEN entry, or null / a CLOSED entry when none is open.
 * - lotRules: the pair's CURRENT rules; used (and copied into the state) only when this fill opens a new entry —
 *   an existing entry keeps the rules copied when it opened.
 * - afterFillId (REQUIRED from the caller): the largest fill id of this (user, pair) that already has a journal_fills
 *   row — UNATTRIBUTED rows included, any entry — or null when there is none. A fill at or below it is flagged
 *   `outOfOrder` (the open entry alone cannot tell: e.g. a late BUY after the entry closed, or a late SELL with no open entry).
 * A SELL split between the entry and the unattributed part splits proceeds and fee pro rata by quantity, at 8 dp:
 * the entry's proceeds round DOWN, its fee rounds UP; the unattributed part gets the exact remainder.
 */
export function allocateSpotFill(
  entryState: SpotEntryState | null,
  fill: SpotFillInput,
  lotRules: JournalLotRules,
  afterFillId: RecordId | null,
): SpotAllocationResult {
  const f = normSpotFill(fill);
  const open = entryState !== null && entryState.status === 'OPEN' ? entryState : null;
  const outOfOrder = afterFillId !== null && compareRecordIds(f.id, afterFillId) <= 0;
  const lastFillId = open !== null && compareRecordIds(f.id, open.lastFillId) <= 0 ? open.lastFillId : f.id;

  if (f.side === 'BUY') {
    const net = f.qty.sub(f.fee);
    const feeQuote = f.fee.mul(f.price);
    if (open === null) {
      const rules = normLotRules(lotRules);
      const newState: SpotEntryState = {
        status: 'OPEN',
        openFillId: f.id,
        lastFillId: f.id,
        openedAt: f.at,
        closedAt: null,
        firstReduceAt: null,
        lotRules: { stepSize: rules.stepSize.toFixed(), minNotional: rules.minNotional.toFixed() },
        fillCount: 1,
        buyQty: s8(f.qty),
        buyQuote: s8(f.quote),
        buyFee: s8(f.fee),
        buyFeeQuote: feeQuote.toFixed(),
        soldQty: s8(ZERO),
        sellQuote: s8(ZERO),
        sellFee: s8(ZERO),
        openQty: s8(net),
        dustQty: s8(ZERO),
      };
      return { action: 'OPEN', allocatedQty: s8(f.qty), unattributedQty: s8(ZERO), allocatedQuote: s8(f.quote), allocatedFee: s8(f.fee), newState, outOfOrder };
    }
    const newState: SpotEntryState = {
      ...open,
      lastFillId,
      fillCount: open.fillCount + 1,
      buyQty: s8(d(open.buyQty).add(f.qty)),
      buyQuote: s8(d(open.buyQuote).add(f.quote)),
      buyFee: s8(d(open.buyFee).add(f.fee)),
      buyFeeQuote: d(open.buyFeeQuote).add(feeQuote).toFixed(),
      openQty: s8(d(open.openQty).add(net)),
    };
    return { action: 'ADD', allocatedQty: s8(f.qty), unattributedQty: s8(ZERO), allocatedQuote: s8(f.quote), allocatedFee: s8(f.fee), newState, outOfOrder };
  }

  // SELL
  if (open === null) {
    return { action: 'UNATTRIBUTED', allocatedQty: s8(ZERO), unattributedQty: s8(f.qty), allocatedQuote: s8(ZERO), allocatedFee: s8(ZERO), newState: null, outOfOrder };
  }
  const openQty = d(open.openQty);
  const alloc = f.qty.lte(openQty) ? f.qty : openQty;
  const whole = alloc.eq(f.qty);
  const allocQuote = whole ? f.quote : roundDown(f.quote.mul(alloc).div(f.qty));
  const allocFee = whole ? f.fee : roundUp(f.fee.mul(alloc).div(f.qty));
  const left = openQty.sub(alloc);
  const rules = { stepSize: d(open.lotRules.stepSize), minNotional: d(open.lotRules.minNotional) };
  const closes = left.lt(rules.stepSize) || left.mul(f.price).lt(rules.minNotional);
  const newState: SpotEntryState = {
    ...open,
    status: closes ? 'CLOSED' : 'OPEN',
    lastFillId,
    closedAt: closes ? f.at : null,
    firstReduceAt: open.firstReduceAt ?? (alloc.gt(0) ? f.at : null),
    fillCount: open.fillCount + 1,
    soldQty: s8(d(open.soldQty).add(alloc)),
    sellQuote: s8(d(open.sellQuote).add(allocQuote)),
    sellFee: s8(d(open.sellFee).add(allocFee)),
    openQty: s8(closes ? ZERO : left),
    dustQty: s8(closes ? left : ZERO),
  };
  return {
    action: closes ? 'CLOSE' : 'REDUCE',
    allocatedQty: s8(alloc),
    unattributedQty: s8(f.qty.sub(alloc)),
    allocatedQuote: s8(allocQuote),
    allocatedFee: s8(allocFee),
    newState,
    outOfOrder,
  };
}

// ───────────────────────────── results

/** What the user planned; only the initial stop changes the numbers (R denominator). */
export interface JournalPlanInput {
  /** INITIAL stop: the first stop of the entry; null → risk and R are null (A-D4) */
  initialStop: DecLike | null;
}

interface EntryResultBase {
  rMetricsVersion: typeof R_METRICS_VERSION;
  market: 'SPOT' | 'FUTURES';
  direction: PositionSide;
  status: 'OPEN' | 'CLOSED';
  /** Σ quantity entered (spot: Σ BUY qty before fee; futures: Σ OPEN-leg qty) */
  entryQty: string | null;
  /** volume-weighted average entry price before fees (12 dp, half-up) */
  avgEntryPrice: string | null;
  /** volume-weighted average exit price of the reduced part (12 dp, half-up); null when nothing was reduced */
  avgExitPrice: string | null;
  /**
   * PnL realized so far (OPEN entries too); null when nothing was reduced. Meaning differs by market:
   * - spot: net PnL of the SOLD part only (proceeds − sell fees − own cost of the sold quantity);
   * - futures: the position's realized_pnl − ALL fees paid so far (incl. the opening fee of the part still open)
   *   + funding so far. When CLOSED both equal netPnl.
   */
  realizedPnl: string | null;
  /** net PnL of the whole entry — CLOSED only (OPEN → null) */
  netPnl: string | null;
  /** fees paid in quote currency (8 dp, rounded up) */
  fees: string | null;
  /** futures: signed funding (+ received); spot: null (not applicable) */
  funding: string | null;
  /** |avgEntryPrice − initialStop| × entryQty; null without an initial stop or with a stop on the wrong side */
  riskUsdt: string | null;
  /** netPnl ÷ riskUsdt — CLOSED only, null without an initial stop */
  rMultiple: string | null;
  /** CLOSED only */
  outcome: ROutcome | null;
  /** closedAt − openedAt in ms — CLOSED only */
  holdingMs: number | null;
}

export interface SpotEntryResult extends EntryResultBase {
  market: 'SPOT';
  /** left-over below the lot rules when the entry closed */
  dustQty: string;
}

export interface FuturesEntryResult extends EntryResultBase {
  market: 'FUTURES';
  liquidated: boolean;
  /**
   * Σ OPEN legs − Σ CLOSE legs = the position's open quantity. false → the entry is missing legs
   * (the server should flag it for review; the numbers are still from the position row).
   */
  legsConsistent: boolean;
}

function price12(v: Dec): string {
  return v.toDecimalPlaces(ENTRY_PRICE_SCALE, Dec.ROUND_HALF_UP).toFixed();
}

function holdingMs(openedAt: TimeLike, closedAt: TimeLike): number {
  return timeKey(closedAt, 'closedAt').ms - timeKey(openedAt, 'openedAt').ms;
}

function resultTail(status: 'OPEN' | 'CLOSED', net: Dec | null, risk: Dec | null, openedAt: TimeLike, closedAt: TimeLike | null) {
  const closed = status === 'CLOSED';
  const r = closed ? rMultiple({ netPnl: net, risk }) : null;
  return {
    netPnl: closed && net ? s8(net) : null,
    riskUsdt: risk ? s8(risk) : null,
    rMultiple: r ? s8(r) : null,
    outcome: closed && net ? rOutcome({ r, netPnl: net }) : null,
    holdingMs: closed && closedAt !== null ? holdingMs(openedAt, closedAt) : null,
  };
}

/**
 * Result of a SPOT entry (Module A §2.5, A-D7: PnL against the entry's own cost):
 *   unit cost   = buyQuote ÷ (buyQty − buyFee)                       (buy fee in base is inside the cost)
 *   realized    = floorSigned(sellQuote − sellFee − unit cost × soldQty)   (8 dp, toward −∞; dust has no PnL)
 *   entry price = buyQuote ÷ buyQty (before fee); entry qty = buyQty
 *   fees        = roundUp(buyFee × fill price (Σ) + sellFee)
 *   risk        = riskAmount(LONG, entry price, initial stop, buyQty);  R = rMultiple(realized, risk) when CLOSED
 */
export function computeEntryResult(state: SpotEntryState, plan: JournalPlanInput): SpotEntryResult {
  const buyQty = d(state.buyQty);
  const buyQuote = d(state.buyQuote);
  const netQty = buyQty.sub(d(state.buyFee));
  const soldQty = d(state.soldQty);
  const sellQuote = d(state.sellQuote);
  if (buyQty.lte(0) || netQty.lte(0)) throw new Error('computeEntryResult: entry has no bought quantity');
  const avgEntry = buyQuote.div(buyQty);
  const realized = soldQty.gt(0) ? floorSigned(sellQuote.sub(d(state.sellFee)).sub(buyQuote.mul(soldQty).div(netQty))) : null;
  const risk = riskAmount({ direction: 'LONG', entryPrice: avgEntry, stopPrice: plan.initialStop, quantity: buyQty });
  return {
    rMetricsVersion: R_METRICS_VERSION,
    market: 'SPOT',
    direction: 'LONG',
    status: state.status,
    entryQty: s8(buyQty),
    avgEntryPrice: price12(avgEntry),
    avgExitPrice: soldQty.gt(0) ? price12(sellQuote.div(soldQty)) : null,
    realizedPnl: realized ? s8(realized) : null,
    fees: s8(roundUp(d(state.buyFeeQuote).add(d(state.sellFee)))),
    funding: null,
    ...resultTail(state.status, realized, risk, state.openedAt, state.closedAt),
    dustQty: state.dustQty,
  };
}

// ───────────────────────────── futures

/** A futures fill (`futures_trades` row incl. the A2 leg columns). */
export interface FuturesFillInput {
  id: RecordId;
  side: 'BUY' | 'SELL';
  price: DecLike;
  quantity: DecLike;
  /** fee of the whole fill (close + open part), USDT */
  fee: DecLike;
  /** realized PnL of the closing part before fees ("0" for opening fills) */
  realizedPnl: DecLike;
  createdAt: TimeLike;
  /** position after the fill: null when the fill closed the position completely */
  positionId: RecordId | null;
  /** position reduced/closed by this fill (A2 column), null if none */
  closedPositionId: RecordId | null;
  /** A2 columns; both null = a fill from before A2 (cannot be split into legs) */
  closeQty: DecLike | null;
  openQty: DecLike | null;
}

export interface FuturesLeg {
  fillId: string;
  leg: 'OPEN' | 'CLOSE';
  /** the position (= journal entry) this leg belongs to */
  positionId: string;
  side: 'BUY' | 'SELL';
  price: string;
  qty: string;
  /** price × qty, 8 dp */
  quote: string;
  /** pro-rata share of the fill fee by quantity (display only; the entry PnL uses the position's fees) */
  fee: string;
  /** CLOSE leg: the fill's realized PnL; OPEN leg: "0.00000000" */
  realizedPnl: string;
  createdAt: string;
}

/**
 * Splits a futures fill into its CLOSE leg (closed_position_id, close_qty) and OPEN leg (position_id, open_qty) — Module A §2.1.
 * A flip gives two legs: CLOSE into the old position's entry, OPEN into the new one. A full close has position_id null.
 * Fee: CLOSE leg = roundUp(fee × closeQty ÷ qty, 8), OPEN leg = the remainder (sum is exact).
 * Throws for a fill without the A2 leg columns (both null) or inconsistent columns.
 */
export function allocateFuturesLegs(fill: FuturesFillInput): FuturesLeg[] {
  const id = recordIdText(fill.id);
  if (fill.closeQty === null && fill.openQty === null) {
    throw new Error(`futures fill ${id}: no leg columns (close_qty/open_qty) — fills from before A2 cannot be journaled`);
  }
  const price = toDec(fill.price, 'fill.price');
  const qty = scale8(toDec(fill.quantity, 'fill.quantity'), 'fill.quantity');
  const fee = scale8(toDec(fill.fee, 'fill.fee'), 'fill.fee');
  const realized = toDec(fill.realizedPnl, 'fill.realizedPnl');
  const closeQty = fill.closeQty === null ? ZERO : scale8(toDec(fill.closeQty, 'fill.closeQty'), 'fill.closeQty');
  const openQty = fill.openQty === null ? ZERO : scale8(toDec(fill.openQty, 'fill.openQty'), 'fill.openQty');
  if (price.lte(0) || qty.lte(0) || fee.lt(0)) throw new Error(`futures fill ${id}: invalid price/quantity/fee`);
  if (closeQty.lt(0) || openQty.lt(0) || !closeQty.add(openQty).eq(qty)) {
    throw new Error(`futures fill ${id}: close_qty + open_qty must equal quantity`);
  }
  if (closeQty.gt(0) && fill.closedPositionId === null) throw new Error(`futures fill ${id}: close_qty > 0 needs closed_position_id`);
  if (openQty.gt(0) && fill.positionId === null) throw new Error(`futures fill ${id}: open_qty > 0 needs position_id`);
  if (closeQty.isZero() && !realized.isZero()) throw new Error(`futures fill ${id}: realized PnL without a closing part`);

  const at = isoTime(fill.createdAt, 'fill.createdAt');
  const closeFee = openQty.isZero() ? fee : closeQty.isZero() ? ZERO : roundUp(fee.mul(closeQty).div(qty));
  const legs: FuturesLeg[] = [];
  const leg = (kind: 'OPEN' | 'CLOSE', positionId: RecordId, q: Dec, legFee: Dec, pnl: Dec): FuturesLeg => ({
    fillId: id,
    leg: kind,
    positionId: recordIdText(positionId),
    side: fill.side,
    price: price.toFixed(),
    qty: s8(q),
    quote: s8(price.mul(q)),
    fee: s8(legFee),
    realizedPnl: s8(pnl),
    createdAt: at,
  });
  if (closeQty.gt(0)) legs.push(leg('CLOSE', fill.closedPositionId!, closeQty, closeFee, realized));
  if (openQty.gt(0)) legs.push(leg('OPEN', fill.positionId!, openQty, fee.sub(closeFee), ZERO));
  return legs;
}

/** A futures position (futures_positions row) with the legs journaled to its entry. */
export interface FuturesPositionInput {
  side: PositionSide;
  status: 'OPEN' | 'CLOSED';
  /** current open quantity (0 when CLOSED) */
  quantity: DecLike;
  /** Σ over the position's life, before fees and funding */
  realizedPnl: DecLike;
  fees: DecLike;
  /** signed: + received */
  funding: DecLike;
  openedAt: TimeLike;
  closedAt: TimeLike | null;
  /** futures_positions.close_reason ('LIQUIDATION' → liquidated) */
  closeReason: string | null;
  /** this entry's legs (from allocateFuturesLegs), any order */
  legs: readonly { leg: 'OPEN' | 'CLOSE'; price: DecLike; qty: DecLike }[];
}

/**
 * Result of a FUTURES entry (Module A §2.5):
 *   net PnL     = realized_pnl − fees + funding of the position (as pnlService) — CLOSED only
 *   realizedPnl = the same expression on an OPEN position once something was closed: it already subtracts every fee
 *                 paid so far, including the opening fee of the part still open, and adds funding so far
 *                 (unlike spot, where it covers the sold part only)
 *   entry qty   = Σ OPEN-leg qty (not max_quantity: it differs after adding again following a partial close)
 *   entry price = Σ(price × qty) ÷ Σ qty over OPEN legs (volume-weighted, R convention §1)
 *   exit price  = the same over CLOSE legs
 *   risk        = riskAmount(side, entry price, initial stop of the opening order, entry qty);  R = rMultiple(net PnL, risk)
 */
export function futuresEntryResult(position: FuturesPositionInput, plan: JournalPlanInput): FuturesEntryResult {
  let openQty = ZERO;
  let openNotional = ZERO;
  let closeQty = ZERO;
  let closeNotional = ZERO;
  for (const l of position.legs) {
    const q = toDec(l.qty, 'leg.qty');
    const p = toDec(l.price, 'leg.price');
    if (q.lte(0) || p.lte(0)) throw new Error('futuresEntryResult: leg price and qty must be > 0');
    if (l.leg === 'OPEN') {
      openQty = openQty.add(q);
      openNotional = openNotional.add(p.mul(q));
    } else if (l.leg === 'CLOSE') {
      closeQty = closeQty.add(q);
      closeNotional = closeNotional.add(p.mul(q));
    } else {
      throw new Error('futuresEntryResult: leg must be OPEN or CLOSE');
    }
  }
  const current = scale8(toDec(position.quantity, 'position.quantity'), 'position.quantity');
  if (position.status === 'CLOSED' && !current.isZero()) throw new Error('futuresEntryResult: a CLOSED position must have quantity 0');
  const realizedPnl = scale8(toDec(position.realizedPnl, 'position.realizedPnl'), 'position.realizedPnl');
  const fees = scale8(toDec(position.fees, 'position.fees'), 'position.fees');
  const funding = scale8(toDec(position.funding, 'position.funding'), 'position.funding');
  const net = realizedPnl.sub(fees).add(funding);
  const avgEntry = openQty.gt(0) ? openNotional.div(openQty) : null;
  const risk = avgEntry ? riskAmount({ direction: position.side, entryPrice: avgEntry, stopPrice: plan.initialStop, quantity: openQty }) : null;
  const reduced = closeQty.gt(0);
  return {
    rMetricsVersion: R_METRICS_VERSION,
    market: 'FUTURES',
    direction: position.side,
    status: position.status,
    entryQty: openQty.gt(0) ? s8(openQty) : null,
    avgEntryPrice: avgEntry ? price12(avgEntry) : null,
    avgExitPrice: reduced ? price12(closeNotional.div(closeQty)) : null,
    realizedPnl: reduced || position.status === 'CLOSED' ? s8(net) : null,
    fees: s8(fees),
    funding: s8(funding),
    ...resultTail(position.status, net, risk, position.openedAt, position.closedAt),
    liquidated: position.closeReason === 'LIQUIDATION',
    legsConsistent: openQty.sub(closeQty).eq(current),
  };
}

// ───────────────────────────── replay (reconciliation types (d), (e) — Module A §2.3)

export interface SpotAllocation {
  fillId: string;
  action: SpotAllocationAction;
  /** openFillId of the entry the fill went to; null for UNATTRIBUTED */
  entryOpenFillId: string | null;
  allocatedQty: string;
  unattributedQty: string;
  allocatedQuote: string;
  allocatedFee: string;
}

export interface ReplayOptions {
  /** the open entry just before the first fill (replaying from the earliest affected fill); default: none */
  initialState?: SpotEntryState | null;
  /**
   * openFillIds of the stored entries opened inside the replayed range (or the initial state's entry); those no longer
   * opened by any fill are reported (→ VOID). Do not pass entries that closed before the range: they would be reported too.
   */
  knownEntryOpenFillIds?: readonly RecordId[];
}

export interface ReplayResult {
  /** one per fill, ascending id */
  allocations: SpotAllocation[];
  /** entries touched by the replay, in opening order (the initial state first, if given and open) */
  entries: { openFillId: string; state: SpotEntryState }[];
  /** the entry still OPEN at the end, or null */
  finalState: SpotEntryState | null;
  /** knownEntryOpenFillIds that no longer open an entry (e.g. the opening fill disappeared) */
  lostEntryOpenFillIds: string[];
}

/**
 * Rebuilds the spot allocations of one (user, pair) from scratch, in ascending fill id (Module A §2.2 point 5, §2.3 (d)/(e)).
 * Equivalent to calling `allocateSpotFill` fill by fill in id order. Fills are sorted by id here; a repeated id throws.
 * lotRulesSnapshot: the rules copied into the entry — a single snapshot, or a function giving the snapshot of the entry
 * opened by a fill (so every rebuilt entry keeps the rules it was opened with, even if the pair's rules changed since).
 */
export function replayAllocations(
  fills: readonly SpotFillInput[],
  lotRulesSnapshot: JournalLotRules | ((openingFill: SpotFillInput) => JournalLotRules),
  opts: ReplayOptions = {},
): ReplayResult {
  const sorted = [...fills].sort((a, b) => compareRecordIds(a.id, b.id));
  for (let i = 1; i < sorted.length; i++) {
    if (compareRecordIds(sorted[i - 1]!.id, sorted[i]!.id) === 0) throw new Error(`replayAllocations: repeated fill id ${String(sorted[i]!.id)}`);
  }
  let state: SpotEntryState | null = opts.initialState && opts.initialState.status === 'OPEN' ? opts.initialState : null;
  if (state && sorted.length > 0 && compareRecordIds(sorted[0]!.id, state.lastFillId) <= 0) {
    throw new Error('replayAllocations: fills must come after initialState.lastFillId');
  }
  const entries = new Map<string, SpotEntryState>();
  if (state) entries.set(state.openFillId, state);
  const allocations: SpotAllocation[] = [];
  let after: RecordId | null = state ? state.lastFillId : null;
  for (const fill of sorted) {
    const rules = typeof lotRulesSnapshot === 'function' ? lotRulesSnapshot(fill) : lotRulesSnapshot;
    const res = allocateSpotFill(state, fill, rules, after);
    after = fill.id;
    const target = res.newState;
    allocations.push({
      fillId: recordIdText(fill.id),
      action: res.action,
      entryOpenFillId: target ? target.openFillId : null,
      allocatedQty: res.allocatedQty,
      unattributedQty: res.unattributedQty,
      allocatedQuote: res.allocatedQuote,
      allocatedFee: res.allocatedFee,
    });
    if (target) {
      entries.set(target.openFillId, target);
      state = target.status === 'OPEN' ? target : null;
    }
  }
  const opened = new Set(entries.keys());
  const lost = (opts.knownEntryOpenFillIds ?? []).map(recordIdText).filter((id) => !opened.has(id));
  return {
    allocations,
    entries: [...entries.entries()].map(([openFillId, s]) => ({ openFillId, state: s })),
    finalState: state,
    lostEntryOpenFillIds: lost,
  };
}
