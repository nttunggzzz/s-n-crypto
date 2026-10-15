import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, gt, inArray, lt, sql, type SQL } from 'drizzle-orm';
import type { FuturesAccount, FuturesSymbolSettings, NotificationType } from '@cex/contracts';
import {
  ZERO,
  averageEntry,
  checkPrice,
  checkQuantity,
  dec,
  floorSigned,
  initialMargin,
  isLiquidatable,
  isMultipleOfStep,
  maxDec,
  minDec,
  pnl,
  rawPnl,
  roundDown,
  roundUp,
  toFixedStr,
  walkBook,
  type Dec,
  type Fill,
  type PositionSide,
} from '@cex/core';
import { balances, futuresOrders, futuresPositions, futuresTrades, futuresUserSymbols, notifications, OPEN_STATUSES } from '../../db/schema.ts';
import type { Db, Tx } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import { logger } from '../../logger.ts';
import { applyBalanceChanges, type BalanceChange, type BalanceState } from '../exchange/ledger.ts';
import type { ExchangeEvents } from '../exchange/events.ts';
import type { MarketDataService } from '../market/marketData.ts';
import type { FuturesConfig, LoadedContract } from './config.ts';
import type { FuturesMarkService } from './markData.ts';
import { FOutcome, type FOrderRow, type FPositionRow, type FuturesEvents } from './serializers.ts';

export const MAX_OPEN_FUTURES_ORDERS = 100;
export const DEFAULT_LEVERAGE = 10;

type Purpose = FOrderRow['purpose'];

export interface FuturesOrderInput {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: string;
  price?: string;
  timeInForce?: 'GTC' | 'IOC';
  reduceOnly?: boolean;
  clientOrderId?: string;
  tpsl?: { takeProfitPrice?: string | null; stopLossPrice?: string | null };
}

function ruleError(v: string | null): void {
  if (v) throw new AppError(v as 'INVALID_QUANTITY', v.toLowerCase().replaceAll('_', ' '));
}

const F = 'FUTURES' as const;
const sideOf = (orderSide: 'BUY' | 'SELL'): PositionSide => (orderSide === 'BUY' ? 'LONG' : 'SHORT');
const closeReasonOf = (p: Purpose): FPositionRow['closeReason'] =>
  p === 'TAKE_PROFIT' ? 'TAKE_PROFIT' : p === 'STOP_LOSS' ? 'STOP_LOSS' : p === 'LIQUIDATION' ? 'LIQUIDATION' : p === 'ADMIN' ? 'ADMIN' : 'USER';

/**
 * Simulated USDT-M perpetuals (isolated margin, one-way mode).
 *
 * Money: the FUTURES/USDT balance. `locked` = open orders' reservations (marginLocked + feeLocked)
 * + open positions' margin — reconciliation checks exactly that. Every change goes through
 * applyBalanceChanges.
 *
 * Concurrency: every operation on (user, symbol) first locks that user's futures_user_symbols row,
 * so user actions, fills, TP/SL, liquidation and funding on a position run one at a time.
 * Realtime events are published only after commit (FOutcome).
 */
export class FuturesService {
  constructor(
    private readonly db: Db,
    readonly config: FuturesConfig,
    readonly market: MarketDataService,
    readonly marks: FuturesMarkService,
    readonly events: FuturesEvents,
    private readonly exchangeEvents: ExchangeEvents,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ───────────────────────────── plumbing

  private async commit<T>(fn: (tx: Tx, out: FOutcome) => Promise<T>): Promise<T> {
    const out = new FOutcome();
    const value = await this.db.transaction((tx) => fn(tx, out));
    out.publish(this.events);
    return value;
  }

  /** The per-(user, symbol) lock; creates the settings row with defaults on first use. */
  private async lockSymbol(tx: Tx, userId: string, symbol: string) {
    await tx.insert(futuresUserSymbols).values({ userId, symbol, leverage: DEFAULT_LEVERAGE }).onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(futuresUserSymbols)
      .where(and(eq(futuresUserSymbols.userId, userId), eq(futuresUserSymbols.symbol, symbol)))
      .for('update');
    return row!;
  }

  private async openPosition(tx: Tx, userId: string, symbol: string): Promise<FPositionRow | undefined> {
    const [p] = await tx
      .select()
      .from(futuresPositions)
      .where(and(eq(futuresPositions.userId, userId), eq(futuresPositions.symbol, symbol), eq(futuresPositions.status, 'OPEN')))
      .for('update');
    return p;
  }

  private async balances(tx: Tx, out: FOutcome, changes: BalanceChange[]): Promise<Map<string, BalanceState>> {
    const real = changes.filter((c) => !(c.deltaAvailable ?? ZERO).isZero() || !(c.deltaLocked ?? ZERO).isZero());
    if (real.length === 0) return new Map();
    const state = await applyBalanceChanges(tx, real);
    for (const c of real) if (c.account === F) out.accounts.add(c.userId);
    return state;
  }

  private async notify(tx: Tx, out: FOutcome, userId: string, type: NotificationType, payload: Record<string, unknown>): Promise<void> {
    const [row] = await tx.insert(notifications).values({ userId, type, payload }).returning();
    out.notifications.push(row!);
  }

  private requireLive(symbol: string): Dec {
    const mark = this.marks.liveMark(symbol);
    if (!this.market.isLive(symbol) || mark === null) throw new AppError('MARKET_DATA_STALE', `Futures market data for ${symbol} is not live; trading paused`);
    return mark;
  }

  // ───────────────────────────── account & transfers

  async account(userId: string): Promise<FuturesAccount> {
    const [b] = await this.db
      .select()
      .from(balances)
      .where(and(eq(balances.userId, userId), eq(balances.account, F), eq(balances.asset, 'USDT')));
    const available = b ? dec(b.available) : ZERO;
    const locked = b ? dec(b.locked) : ZERO;
    const positions = await this.db
      .select()
      .from(futuresPositions)
      .where(and(eq(futuresPositions.userId, userId), eq(futuresPositions.status, 'OPEN')));
    const [o] = await this.db
      .select({ v: sql<string | null>`sum(${futuresOrders.marginLocked} + ${futuresOrders.feeLocked})` })
      .from(futuresOrders)
      .where(and(eq(futuresOrders.userId, userId), inArray(futuresOrders.status, [...OPEN_STATUSES])));
    let positionMargin = ZERO;
    let upnl: Dec | null = ZERO;
    for (const p of positions) {
      positionMargin = positionMargin.add(dec(p.margin));
      const mark = this.marks.liveMark(p.symbol);
      upnl = upnl === null || mark === null ? null : upnl.add(pnl(p.side, dec(p.entryPrice), mark, dec(p.quantity)));
    }
    const wallet = available.add(locked);
    return {
      asset: 'USDT',
      walletBalance: toFixedStr(wallet),
      available: toFixedStr(available),
      positionMargin: toFixedStr(positionMargin),
      orderMargin: toFixedStr(dec(o?.v ?? '0')),
      unrealizedPnl: upnl === null ? null : toFixedStr(upnl),
      equity: upnl === null ? null : toFixedStr(wallet.add(upnl)),
      openPositions: positions.length,
    };
  }

  async transfer(userId: string, direction: 'SPOT_TO_FUTURES' | 'FUTURES_TO_SPOT', amountStr: string): Promise<BalanceState[]> {
    const amount = dec(amountStr);
    if (amount.lte(0) || amount.decimalPlaces() > 8) throw new AppError('VALIDATION_ERROR', 'amount must be > 0 with at most 8 decimals', { field: 'amount' });
    const ref = randomUUID();
    const sign = direction === 'SPOT_TO_FUTURES' ? 1 : -1;
    const changed = await this.commit(async (tx, out) => {
      // debit first so an insufficient balance fails before anything is credited
      const legs: BalanceChange[] = [
        { userId, account: sign > 0 ? 'SPOT' : F, asset: 'USDT', type: 'TRANSFER', deltaAvailable: amount.neg(), refType: 'TRANSFER', refId: ref },
        { userId, account: sign > 0 ? F : 'SPOT', asset: 'USDT', type: 'TRANSFER', deltaAvailable: amount, refType: 'TRANSFER', refId: ref },
      ];
      return [...(await this.balances(tx, out, legs)).values()];
    });
    this.exchangeEvents.publish({ balances: changed.filter((b) => b.account === 'SPOT') });
    return changed;
  }

  // ───────────────────────────── leverage

  async settings(userId: string): Promise<FuturesSymbolSettings[]> {
    const rows = await this.db.select().from(futuresUserSymbols).where(eq(futuresUserSymbols.userId, userId));
    const mine = new Map(rows.map((r) => [r.symbol, r]));
    return this.config.all().map((c) => {
      const r = mine.get(c.row.symbol);
      return { symbol: c.row.symbol, leverage: r?.leverage ?? Math.min(DEFAULT_LEVERAGE, c.row.maxLeverage), marginMode: r?.marginMode ?? 'ISOLATED' };
    });
  }

  async setLeverage(userId: string, symbol: string, leverage: number): Promise<FuturesSymbolSettings> {
    const c = this.config.get(symbol);
    if (leverage > c.row.maxLeverage) throw new AppError('INVALID_LEVERAGE', `Max leverage on ${symbol} is ${c.row.maxLeverage}x`, { maxLeverage: c.row.maxLeverage });
    return this.commit(async (tx) => {
      await this.lockSymbol(tx, userId, symbol);
      const busy = (await this.openPosition(tx, userId, symbol)) !== undefined || (await this.openOrderCount(tx, userId, symbol)) > 0;
      if (busy) throw new AppError('LEVERAGE_LOCKED', 'Close the position and cancel open orders on this symbol first');
      const [r] = await tx
        .update(futuresUserSymbols)
        .set({ leverage, updatedAt: this.now() })
        .where(and(eq(futuresUserSymbols.userId, userId), eq(futuresUserSymbols.symbol, symbol)))
        .returning();
      return { symbol, leverage: r!.leverage, marginMode: r!.marginMode };
    });
  }

  private async openOrderCount(tx: Tx, userId: string, symbol?: string): Promise<number> {
    const where: SQL[] = [eq(futuresOrders.userId, userId), inArray(futuresOrders.status, [...OPEN_STATUSES])];
    if (symbol) where.push(eq(futuresOrders.symbol, symbol));
    const [r] = await tx
      .select({ n: count() })
      .from(futuresOrders)
      .where(and(...where));
    return r?.n ?? 0;
  }

  // ───────────────────────────── orders

  async placeOrder(userId: string, input: FuturesOrderInput): Promise<FOrderRow> {
    return this.commit((tx, out) => this.place(tx, out, userId, input, 'TRADE'));
  }

  async closePosition(userId: string, symbol: string, quantity?: string): Promise<FOrderRow> {
    return this.commit(async (tx, out) => {
      await this.lockSymbol(tx, userId, symbol);
      const pos = await this.openPosition(tx, userId, symbol);
      if (!pos) throw new AppError('NOT_FOUND', 'No open position on this symbol');
      const qty = quantity ? minDec(dec(quantity), dec(pos.quantity)) : dec(pos.quantity);
      return this.place(tx, out, userId, { symbol, side: pos.side === 'LONG' ? 'SELL' : 'BUY', type: 'MARKET', quantity: qty.toFixed(), reduceOnly: true }, 'CLOSE');
    });
  }

  /**
   * Validates and executes/rests one order inside `tx` (takes the (user, symbol) lock; re-taking it
   * in the same transaction is a no-op). Reduce-only orders are allowed on a disabled contract so
   * positions can always be closed — but not while trading is halted.
   */
  private async place(tx: Tx, out: FOutcome, userId: string, input: FuturesOrderInput, purpose: Purpose): Promise<FOrderRow> {
    const reduceOnly = input.reduceOnly ?? false;
    let c: LoadedContract;
    if (reduceOnly) {
      if (this.config.exchange.tradingHalted) throw new AppError('TRADING_HALTED', 'Trading is halted by the operator');
      c = this.config.get(input.symbol);
    } else c = this.config.requireTradable(input.symbol);
    const mark = this.requireLive(input.symbol);
    const settings = await this.lockSymbol(tx, userId, input.symbol);
    const leverage = settings.leverage;
    if (leverage > c.row.maxLeverage) throw new AppError('INVALID_LEVERAGE', `Max leverage on ${input.symbol} is ${c.row.maxLeverage}x — lower it first`, { maxLeverage: c.row.maxLeverage });

    const qty = dec(input.quantity);
    ruleError(checkQuantity(c.rules, qty));
    const limitPrice = input.type === 'LIMIT' ? dec(input.price!) : null;
    if (limitPrice) ruleError(checkPrice(c.rules, limitPrice));
    // value check at the order price (limit) or the mark (market); closing orders are exempt (any size may close)
    const refPrice = limitPrice ?? mark;
    if (!reduceOnly && refPrice.mul(qty).lt(dec(c.row.minNotional))) {
      throw new AppError('NOTIONAL_TOO_SMALL', `Minimum order value is ${c.row.minNotional} USDT`, { minNotional: dec(c.row.minNotional).toFixed() });
    }

    const pos = await this.openPosition(tx, userId, input.symbol);
    if (reduceOnly && (!pos || pos.side === sideOf(input.side) || qty.gt(dec(pos.quantity)))) {
      throw new AppError('REDUCE_ONLY_REJECTED', 'Reduce-only needs an opposite position at least as large as the order');
    }
    let tp: Dec | null = null;
    let sl: Dec | null = null;
    if (input.tpsl && !reduceOnly) {
      tp = input.tpsl.takeProfitPrice ? dec(input.tpsl.takeProfitPrice) : null;
      sl = input.tpsl.stopLossPrice ? dec(input.tpsl.stopLossPrice) : null;
      this.checkTpSl(c, sideOf(input.side), mark, tp, sl);
    }
    if ((await this.openOrderCount(tx, userId)) >= MAX_OPEN_FUTURES_ORDERS && input.type === 'LIMIT') {
      throw new AppError('LIMIT_EXCEEDED', `At most ${MAX_OPEN_FUTURES_ORDERS} open futures orders`, { limit: MAX_OPEN_FUTURES_ORDERS });
    }
    const clientOrderId = input.clientOrderId ?? `f-${randomUUID()}`;
    if (input.clientOrderId) {
      const [dup] = await tx
        .select({ id: futuresOrders.id })
        .from(futuresOrders)
        .where(and(eq(futuresOrders.userId, userId), eq(futuresOrders.clientOrderId, clientOrderId)));
      if (dup) throw new AppError('DUPLICATE_CLIENT_ORDER_ID', 'clientOrderId already used');
    }

    const t = this.now();
    const [inserted] = await tx
      .insert(futuresOrders)
      .values({
        userId,
        clientOrderId,
        symbol: input.symbol,
        side: input.side,
        type: input.type,
        purpose,
        timeInForce: input.type === 'LIMIT' ? (input.timeInForce ?? 'GTC') : null,
        price: limitPrice ? limitPrice.toFixed() : null,
        quantity: qty.toFixed(),
        reduceOnly,
        leverage,
        status: 'NEW',
        takeProfitPrice: tp?.toFixed() ?? null,
        stopLossPrice: sl?.toFixed() ?? null,
        createdAt: t,
        updatedAt: t,
      })
      .returning();
    let order = inserted!;

    // take liquidity now: market orders, and the marketable part of a limit
    const levels = this.market.bookSide(input.symbol, input.side);
    const walk = walkBook(input.side, levels, { kind: 'base', qty }, c.step, limitPrice ?? undefined);
    // like spot: a market order must be fillable in full from the visible book. Exception: a reduce-only MARKET order (closing
    // a position) takes what the visible 20 levels hold and ends EXPIRED/INSUFFICIENT_LIQUIDITY below, so that a position larger
    // than the book can still be closed step by step; with nothing to take at all it is rejected like any other market order.
    if (input.type === 'MARKET' && !walk.complete && !(reduceOnly && walk.fills.length > 0)) {
      throw new AppError('INSUFFICIENT_LIQUIDITY', 'Order book is not deep enough for this order');
    }
    for (const f of walk.fills) {
      order = await this.applyFill(tx, out, order, c, f, 'TAKER', false);
      if (order.status !== 'NEW' && order.status !== 'PARTIALLY_FILLED') break; // reduce-only ran out of position
    }

    const remaining = dec(order.quantity).sub(dec(order.executedQty));
    const isOpen = order.status === 'NEW' || order.status === 'PARTIALLY_FILLED';
    if (isOpen && remaining.gt(0)) {
      if (input.type === 'MARKET' || order.timeInForce === 'IOC') {
        order = await this.finish(tx, out, order, 'EXPIRED', input.type === 'MARKET' ? 'INSUFFICIENT_LIQUIDITY' : 'IOC_EXPIRED');
      } else {
        // rest: reserve margin (unless reduce-only) + fee at the taker rate for the remaining quantity
        const fees = this.config.fees;
        const m = reduceOnly ? ZERO : initialMargin(limitPrice!, remaining, leverage);
        const fee = roundUp(limitPrice!.mul(remaining).mul(fees.taker));
        await this.balances(tx, out, [{ userId, account: F, asset: 'USDT', type: 'ORDER_LOCK', deltaAvailable: m.add(fee).neg(), deltaLocked: m.add(fee), refType: 'FUTURES_ORDER', refId: String(order.id) }]);
        [order] = await tx
          .update(futuresOrders)
          .set({ marginLocked: toFixedStr(m), feeLocked: toFixedStr(fee), updatedAt: this.now() })
          .where(eq(futuresOrders.id, order.id))
          .returning() as [FOrderRow];
      }
    }
    return out.order(order);
  }

  private checkTpSl(c: LoadedContract, side: PositionSide, mark: Dec, tp: Dec | null, sl: Dec | null): void {
    for (const p of [tp, sl]) {
      if (p !== null && (p.lte(0) || !isMultipleOfStep(p, c.tick))) throw new AppError('INVALID_TPSL', `TP/SL must be > 0 and a multiple of ${c.tick.toFixed()}`);
    }
    const bad = (tp !== null && (side === 'LONG' ? tp.lte(mark) : tp.gte(mark))) || (sl !== null && (side === 'LONG' ? sl.gte(mark) : sl.lte(mark)));
    if (bad) throw new AppError('INVALID_TPSL', 'LONG: take-profit above and stop-loss below the mark price (SHORT: the opposite)', { markPrice: mark.toFixed() });
  }

  /**
   * One fill: the closing part first (one-way mode), then the opening part.
   * `fromReservation`: the order is resting and its reservation pays for this fill.
   */
  private async applyFill(tx: Tx, out: FOutcome, order: FOrderRow, c: LoadedContract, f: Fill, liquidity: 'MAKER' | 'TAKER', fromReservation: boolean): Promise<FOrderRow> {
    const fees = this.config.fees;
    const rate = liquidity === 'MAKER' ? fees.maker : fees.taker;
    const userId = order.userId;
    const dir = sideOf(order.side);
    const price = f.price;
    const t = this.now();
    let pos = await this.openPosition(tx, userId, order.symbol);

    const closeQty = pos && pos.side !== dir ? minDec(f.qty, dec(pos.quantity)) : ZERO;
    const openQty = order.reduceOnly ? ZERO : f.qty.sub(closeQty);
    const executed = closeQty.add(openQty);
    if (executed.isZero()) return this.finish(tx, out, order, 'CANCELED', 'REDUCE_ONLY');

    const changes: BalanceChange[] = [];
    const ref = { refType: 'FUTURES_ORDER' as const, refId: String(order.id) };
    let realized = ZERO;
    let feePaid = ZERO;

    // reservation shares (resting orders only)
    let marginLocked = dec(order.marginLocked);
    let feeLocked = dec(order.feeLocked);
    let marginShare = ZERO;
    let feeShare = ZERO;
    if (fromReservation) {
      const remaining = dec(order.quantity).sub(dec(order.executedQty));
      const last = executed.gte(remaining);
      marginShare = last ? marginLocked : roundDown(marginLocked.mul(executed).div(remaining));
      feeShare = last ? feeLocked : roundDown(feeLocked.mul(executed).div(remaining));
      marginLocked = marginLocked.sub(marginShare);
      feeLocked = feeLocked.sub(feeShare);
    }

    // ── closing part
    if (pos && closeQty.gt(0)) {
      const q = dec(pos.quantity);
      const m = dec(pos.margin);
      const released = closeQty.gte(q) ? m : roundDown(m.mul(closeQty).div(q));
      const p = pnl(pos.side, dec(pos.entryPrice), price, closeQty);
      const closeFee = roundUp(price.mul(closeQty).mul(rate));
      const gross = released.add(p);
      const charged = minDec(closeFee, maxDec(gross, ZERO));
      const payout = maxDec(gross.sub(charged), ZERO);
      if (gross.lt(0)) logger.warn({ positionId: pos.id, deficit: gross.toFixed() }, 'futures close beyond bankruptcy (absorbed by the exchange)');
      changes.push({ userId, account: F, asset: 'USDT', type: 'REALIZED_PNL', deltaAvailable: payout, deltaLocked: released.neg(), refType: 'FUTURES_POSITION', refId: String(pos.id) });
      realized = p;
      feePaid = feePaid.add(charged);
      const left = q.sub(closeQty);
      const closed = left.isZero();
      [pos] = (await tx
        .update(futuresPositions)
        .set({
          quantity: left.toFixed(),
          margin: toFixedStr(m.sub(released)),
          realizedPnl: toFixedStr(dec(pos.realizedPnl).add(p)),
          fees: toFixedStr(dec(pos.fees).add(charged)),
          closedQuantity: dec(pos.closedQuantity).add(closeQty).toFixed(),
          closedNotional: toFixedStr(dec(pos.closedNotional).add(price.mul(closeQty))),
          ...(closed ? { status: 'CLOSED' as const, closeReason: closeReasonOf(order.purpose), closedAt: t, takeProfitPrice: null, stopLossPrice: null } : {}),
          updatedAt: t,
        })
        .where(eq(futuresPositions.id, pos.id))
        .returning()) as [FPositionRow];
      out.position(pos!);
      if (closed) {
        await this.cancelReduceOnly(tx, out, userId, order.symbol, order.id);
        pos = undefined;
      }
    }

    // ── opening part
    let positionId = pos?.id ?? null;
    if (openQty.gt(0)) {
      const openFee = roundUp(price.mul(openQty).mul(rate));
      let im: Dec;
      if (fromReservation) {
        im = closeQty.isZero() ? marginShare : roundDown(marginShare.mul(openQty).div(executed));
        // margin moves from the order reservation to the position (both locked): no balance change
        const spareMargin = marginShare.sub(im);
        const feeFromShare = minDec(openFee, feeShare);
        const extraFee = openFee.sub(feeFromShare);
        const spareFee = feeShare.sub(feeFromShare);
        changes.push({ userId, account: F, asset: 'USDT', type: 'FEE', deltaLocked: feeFromShare.neg(), ...ref });
        if (spareMargin.add(spareFee).gt(0)) changes.push({ userId, account: F, asset: 'USDT', type: 'ORDER_UNLOCK', deltaAvailable: spareMargin.add(spareFee), deltaLocked: spareMargin.add(spareFee).neg(), ...ref });
        if (extraFee.gt(0)) changes.push({ userId, account: F, asset: 'USDT', type: 'FEE', deltaAvailable: extraFee.neg(), ...ref });
      } else {
        im = initialMargin(price, openQty, order.leverage);
        changes.push({ userId, account: F, asset: 'USDT', type: 'ORDER_LOCK', deltaAvailable: im.neg(), deltaLocked: im, ...ref });
        changes.push({ userId, account: F, asset: 'USDT', type: 'FEE', deltaAvailable: openFee.neg(), ...ref });
      }
      feePaid = feePaid.add(openFee);
      if (pos) {
        [pos] = (await tx
          .update(futuresPositions)
          .set({
            quantity: dec(pos.quantity).add(openQty).toFixed(),
            maxQuantity: maxDec(dec(pos.maxQuantity), dec(pos.quantity).add(openQty)).toFixed(),
            entryPrice: averageEntry(dec(pos.quantity), dec(pos.entryPrice), openQty, price).toFixed(),
            margin: toFixedStr(dec(pos.margin).add(im)),
            fees: toFixedStr(dec(pos.fees).add(openFee)),
            ...(order.takeProfitPrice !== null ? { takeProfitPrice: order.takeProfitPrice } : {}),
            ...(order.stopLossPrice !== null ? { stopLossPrice: order.stopLossPrice } : {}),
            updatedAt: t,
          })
          .where(eq(futuresPositions.id, pos.id))
          .returning()) as [FPositionRow];
      } else {
        [pos] = (await tx
          .insert(futuresPositions)
          .values({
            userId,
            symbol: order.symbol,
            side: dir,
            quantity: openQty.toFixed(),
            maxQuantity: openQty.toFixed(),
            entryPrice: price.toFixed(),
            leverage: order.leverage,
            margin: toFixedStr(im),
            fees: toFixedStr(openFee),
            takeProfitPrice: order.takeProfitPrice,
            stopLossPrice: order.stopLossPrice,
            openedAt: t,
            updatedAt: t,
          })
          .returning()) as [FPositionRow];
      }
      out.position(pos!);
      positionId = pos!.id;
    } else if (fromReservation) {
      // closing-only fill of a resting order: its reservation share is no longer needed
      const spare = marginShare.add(feeShare);
      if (spare.gt(0)) changes.push({ userId, account: F, asset: 'USDT', type: 'ORDER_UNLOCK', deltaAvailable: spare, deltaLocked: spare.neg(), ...ref });
    }

    // credits (REALIZED_PNL, unlocks) before debits, so a flip can pay its new margin from the close
    changes.sort((a, b) => Number((b.deltaAvailable ?? ZERO).gt(0)) - Number((a.deltaAvailable ?? ZERO).gt(0)));
    await this.balances(tx, out, changes);

    const [trade] = await tx
      .insert(futuresTrades)
      .values({
        orderId: order.id,
        userId,
        positionId,
        symbol: order.symbol,
        side: order.side,
        price: price.toFixed(),
        quantity: executed.toFixed(),
        quoteQty: toFixedStr(price.mul(executed)),
        fee: toFixedStr(feePaid),
        liquidity,
        realizedPnl: toFixedStr(realized),
        createdAt: t,
      })
      .returning();
    out.trades.push(trade!);

    const execTotal = dec(order.executedQty).add(executed);
    const done = execTotal.gte(dec(order.quantity));
    const [updated] = await tx
      .update(futuresOrders)
      .set({
        executedQty: execTotal.toFixed(),
        executedNotional: toFixedStr(dec(order.executedNotional).add(price.mul(executed))),
        fee: toFixedStr(dec(order.fee).add(feePaid)),
        realizedPnl: toFixedStr(dec(order.realizedPnl).add(realized)),
        marginLocked: toFixedStr(marginLocked),
        feeLocked: toFixedStr(feeLocked),
        status: done ? 'FILLED' : 'PARTIALLY_FILLED',
        updatedAt: t,
      })
      .where(eq(futuresOrders.id, order.id))
      .returning();
    let result = out.order(updated!);
    // reduce-only with nothing left to reduce: end it
    if (!done && order.reduceOnly && !(await this.openPosition(tx, userId, order.symbol))) result = await this.finish(tx, out, result, 'CANCELED', 'REDUCE_ONLY');
    return result;
  }

  /** Ends an open order and releases whatever it still reserves. */
  private async finish(tx: Tx, out: FOutcome, order: FOrderRow, status: 'CANCELED' | 'EXPIRED', reason: string): Promise<FOrderRow> {
    const spare = dec(order.marginLocked).add(dec(order.feeLocked));
    if (spare.gt(0)) {
      await this.balances(tx, out, [{ userId: order.userId, account: F, asset: 'USDT', type: 'ORDER_UNLOCK', deltaAvailable: spare, deltaLocked: spare.neg(), refType: 'FUTURES_ORDER', refId: String(order.id) }]);
    }
    const [row] = await tx
      .update(futuresOrders)
      .set({ status, closeReason: reason, marginLocked: '0', feeLocked: '0', updatedAt: this.now() })
      .where(eq(futuresOrders.id, order.id))
      .returning();
    return out.order(row!);
  }

  private async cancelReduceOnly(tx: Tx, out: FOutcome, userId: string, symbol: string, exceptId: number): Promise<void> {
    const rows = await tx
      .select()
      .from(futuresOrders)
      .where(and(eq(futuresOrders.userId, userId), eq(futuresOrders.symbol, symbol), eq(futuresOrders.reduceOnly, true), inArray(futuresOrders.status, [...OPEN_STATUSES])))
      .for('update');
    for (const o of rows) if (o.id !== exceptId) await this.finish(tx, out, o, 'CANCELED', 'REDUCE_ONLY');
  }

  async cancelOrder(userId: string, orderId: string, reason = 'USER_CANCELED'): Promise<FOrderRow> {
    const id = Number(orderId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new AppError('NOT_FOUND', 'Order not found');
    const [peek] = await this.db
      .select()
      .from(futuresOrders)
      .where(and(eq(futuresOrders.id, id), eq(futuresOrders.userId, userId)));
    if (!peek) throw new AppError('NOT_FOUND', 'Order not found');
    return this.commit(async (tx, out) => {
      await this.lockSymbol(tx, userId, peek.symbol);
      const [o] = await tx.select().from(futuresOrders).where(eq(futuresOrders.id, id)).for('update');
      if (!o || (o.status !== 'NEW' && o.status !== 'PARTIALLY_FILLED')) throw new AppError('ORDER_NOT_CANCELABLE', `Order is ${o?.status ?? 'gone'}`);
      return this.finish(tx, out, o, 'CANCELED', reason);
    });
  }

  async cancelAll(userId: string, symbol?: string, reason = 'USER_CANCELED'): Promise<FOrderRow[]> {
    const where: SQL[] = [eq(futuresOrders.userId, userId), inArray(futuresOrders.status, [...OPEN_STATUSES])];
    if (symbol) where.push(eq(futuresOrders.symbol, symbol));
    const open = await this.db
      .select({ id: futuresOrders.id })
      .from(futuresOrders)
      .where(and(...where))
      .orderBy(asc(futuresOrders.id));
    const done: FOrderRow[] = [];
    for (const o of open) {
      try {
        done.push(await this.cancelOrder(userId, String(o.id), reason));
      } catch (err) {
        if (!(err instanceof AppError && err.code === 'ORDER_NOT_CANCELABLE')) throw err; // filled meanwhile
      }
    }
    return done;
  }

  // ───────────────────────────── positions

  async adjustMargin(userId: string, symbol: string, amountStr: string): Promise<FPositionRow> {
    const amount = dec(amountStr);
    if (amount.isZero() || amount.decimalPlaces() > 8) throw new AppError('VALIDATION_ERROR', 'amount must be non-zero with at most 8 decimals', { field: 'amount' });
    this.config.get(symbol);
    return this.commit(async (tx, out) => {
      await this.lockSymbol(tx, userId, symbol);
      const pos = await this.openPosition(tx, userId, symbol);
      if (!pos) throw new AppError('NOT_FOUND', 'No open position on this symbol');
      const m = dec(pos.margin);
      if (amount.lt(0)) {
        const mark = this.requireLive(symbol);
        const q = dec(pos.quantity);
        // keep at least the initial margin at the mark price (profit can count, but margin never goes below 0)
        const keep = maxDec(mark.mul(q).div(pos.leverage).sub(rawPnl(pos.side, dec(pos.entryPrice), mark, q)), ZERO);
        const maxRemovable = maxDec(roundDown(m.sub(keep)), ZERO);
        if (amount.neg().gt(maxRemovable)) throw new AppError('MARGIN_TOO_LOW', 'Removing that much would leave less than the initial margin', { maxRemovable: toFixedStr(maxRemovable) });
      }
      await this.balances(tx, out, [{ userId, account: F, asset: 'USDT', type: 'MARGIN_ADJUST', deltaAvailable: amount.neg(), deltaLocked: amount, refType: 'FUTURES_POSITION', refId: String(pos.id) }]);
      const [p] = await tx
        .update(futuresPositions)
        .set({ margin: toFixedStr(m.add(amount)), updatedAt: this.now() })
        .where(eq(futuresPositions.id, pos.id))
        .returning();
      return out.position(p!);
    });
  }

  async setTpSl(userId: string, symbol: string, tpStr: string | null, slStr: string | null): Promise<FPositionRow> {
    const c = this.config.get(symbol);
    return this.commit(async (tx, out) => {
      await this.lockSymbol(tx, userId, symbol);
      const pos = await this.openPosition(tx, userId, symbol);
      if (!pos) throw new AppError('NOT_FOUND', 'No open position on this symbol');
      const tp = tpStr === null ? null : dec(tpStr);
      const sl = slStr === null ? null : dec(slStr);
      if (tp !== null || sl !== null) this.checkTpSl(c, pos.side, this.requireLive(symbol), tp, sl);
      const [p] = await tx
        .update(futuresPositions)
        .set({ takeProfitPrice: tp?.toFixed() ?? null, stopLossPrice: sl?.toFixed() ?? null, updatedAt: this.now() })
        .where(eq(futuresPositions.id, pos.id))
        .returning();
      return out.position(p!);
    });
  }

  // ───────────────────────────── engine hooks (called by FuturesEngine)

  /** Resting limits crossed by the traded range [low, high] (strictly through) fill as maker at their price. */
  async fillResting(symbol: string, low: Dec, high: Dec): Promise<number> {
    if (this.config.exchange.tradingHalted || !this.market.isLive(symbol)) return 0;
    const c = this.config.find(symbol);
    if (!c) return 0;
    const candidates = await this.db
      .select({ id: futuresOrders.id, userId: futuresOrders.userId })
      .from(futuresOrders)
      .where(
        and(
          eq(futuresOrders.symbol, symbol),
          eq(futuresOrders.type, 'LIMIT'),
          inArray(futuresOrders.status, [...OPEN_STATUSES]),
          sql`((${futuresOrders.side} = 'BUY' and ${futuresOrders.price} > ${low.toFixed()}) or (${futuresOrders.side} = 'SELL' and ${futuresOrders.price} < ${high.toFixed()}))`,
        ),
      )
      .orderBy(asc(futuresOrders.id));
    let n = 0;
    for (const cand of candidates) {
      try {
        const filled = await this.commit(async (tx, out) => {
          await this.lockSymbol(tx, cand.userId, symbol);
          const [o] = await tx.select().from(futuresOrders).where(eq(futuresOrders.id, cand.id)).for('update');
          if (!o || (o.status !== 'NEW' && o.status !== 'PARTIALLY_FILLED')) return false;
          const limit = dec(o.price!);
          if (!(o.side === 'BUY' ? limit.gt(low) : limit.lt(high))) return false;
          let qty = dec(o.quantity).sub(dec(o.executedQty));
          if (o.reduceOnly) {
            const pos = await this.openPosition(tx, o.userId, symbol);
            if (!pos || pos.side === sideOf(o.side)) {
              await this.finish(tx, out, o, 'CANCELED', 'REDUCE_ONLY');
              return false;
            }
            qty = minDec(qty, dec(pos.quantity));
          }
          const row = await this.applyFill(tx, out, o, c, { price: limit, qty }, 'MAKER', true);
          if (row.status === 'FILLED') {
            await this.notify(tx, out, o.userId, 'FUTURES_ORDER_FILLED', { orderId: String(o.id), symbol, side: o.side, executedQty: dec(row.executedQty).toFixed(), avgPrice: limit.toFixed() });
          }
          return true;
        });
        if (filled) n++;
      } catch (err) {
        logger.error({ err, orderId: cand.id }, 'futures limit fill failed');
      }
    }
    return n;
  }

  /** Liquidation and TP/SL checks for every open position on `symbol` at the live mark price. */
  async processMark(symbol: string): Promise<void> {
    if (this.config.exchange.tradingHalted) return;
    const mark = this.marks.liveMark(symbol);
    const c = this.config.find(symbol);
    if (mark === null || !c) return;
    const open = await this.db
      .select()
      .from(futuresPositions)
      .where(and(eq(futuresPositions.symbol, symbol), eq(futuresPositions.status, 'OPEN')));
    for (const p of open) {
      try {
        if (isLiquidatable(p.side, dec(p.entryPrice), mark, dec(p.quantity), dec(p.margin), c.mmr)) await this.liquidate(p.id, c);
        else if (this.tpslHit(p, mark)) await this.closeByTrigger(p.id, c);
      } catch (err) {
        logger.error({ err, positionId: p.id }, 'futures mark processing failed');
      }
    }
  }

  private tpslHit(p: FPositionRow, mark: Dec): 'TAKE_PROFIT' | 'STOP_LOSS' | null {
    const tp = p.takeProfitPrice === null ? null : dec(p.takeProfitPrice);
    const sl = p.stopLossPrice === null ? null : dec(p.stopLossPrice);
    if (tp && (p.side === 'LONG' ? mark.gte(tp) : mark.lte(tp))) return 'TAKE_PROFIT';
    if (sl && (p.side === 'LONG' ? mark.lte(sl) : mark.gte(sl))) return 'STOP_LOSS';
    return null;
  }

  /** Closes the whole position at the mark price; loss is capped at its margin (balances never go negative). */
  async liquidate(positionId: number, c: LoadedContract): Promise<boolean> {
    const fees = this.config.fees;
    return this.commit(async (tx, out) => {
      const [peek] = await tx.select().from(futuresPositions).where(eq(futuresPositions.id, positionId));
      if (!peek) return false;
      await this.lockSymbol(tx, peek.userId, peek.symbol);
      const pos = await this.openPosition(tx, peek.userId, peek.symbol);
      const mark = this.marks.liveMark(peek.symbol);
      if (!pos || pos.id !== positionId || mark === null) return false;
      const q = dec(pos.quantity);
      const m = dec(pos.margin);
      if (!isLiquidatable(pos.side, dec(pos.entryPrice), mark, q, m, c.mmr)) return false; // recovered meanwhile

      // isolated position: every open order on the symbol is canceled first (frees their reservations)
      const orders = await tx
        .select()
        .from(futuresOrders)
        .where(and(eq(futuresOrders.userId, pos.userId), eq(futuresOrders.symbol, pos.symbol), inArray(futuresOrders.status, [...OPEN_STATUSES])))
        .for('update');
      for (const o of orders) await this.finish(tx, out, o, 'CANCELED', 'LIQUIDATED');

      const p = pnl(pos.side, dec(pos.entryPrice), mark, q);
      const gross = m.add(p);
      const fee = minDec(roundUp(mark.mul(q).mul(fees.liquidation)), maxDec(gross, ZERO));
      const payout = maxDec(gross.sub(fee), ZERO);
      await this.balances(tx, out, [{ userId: pos.userId, account: F, asset: 'USDT', type: 'LIQUIDATION', deltaAvailable: payout, deltaLocked: m.neg(), refType: 'FUTURES_POSITION', refId: String(pos.id) }]);
      const t = this.now();
      const side = pos.side === 'LONG' ? ('SELL' as const) : ('BUY' as const);
      const [order] = await tx
        .insert(futuresOrders)
        .values({
          userId: pos.userId,
          clientOrderId: `liq-${pos.id}`,
          symbol: pos.symbol,
          side,
          type: 'MARKET',
          purpose: 'LIQUIDATION',
          quantity: q.toFixed(),
          executedQty: q.toFixed(),
          executedNotional: toFixedStr(mark.mul(q)),
          reduceOnly: true,
          leverage: pos.leverage,
          status: 'FILLED',
          fee: toFixedStr(fee),
          realizedPnl: toFixedStr(p),
          closeReason: 'LIQUIDATED',
          createdAt: t,
          updatedAt: t,
        })
        .returning();
      out.order(order!);
      const [trade] = await tx
        .insert(futuresTrades)
        .values({ orderId: order!.id, userId: pos.userId, positionId: pos.id, symbol: pos.symbol, side, price: mark.toFixed(), quantity: q.toFixed(), quoteQty: toFixedStr(mark.mul(q)), fee: toFixedStr(fee), liquidity: 'TAKER', realizedPnl: toFixedStr(p), createdAt: t })
        .returning();
      out.trades.push(trade!);
      const [closed] = await tx
        .update(futuresPositions)
        .set({
          status: 'CLOSED',
          quantity: '0',
          margin: '0',
          realizedPnl: toFixedStr(dec(pos.realizedPnl).add(p)),
          fees: toFixedStr(dec(pos.fees).add(fee)),
          closedQuantity: dec(pos.closedQuantity).add(q).toFixed(),
          closedNotional: toFixedStr(dec(pos.closedNotional).add(mark.mul(q))),
          closeReason: 'LIQUIDATION',
          takeProfitPrice: null,
          stopLossPrice: null,
          closedAt: t,
          updatedAt: t,
        })
        .where(eq(futuresPositions.id, pos.id))
        .returning();
      out.position(closed!);
      if (gross.lt(0)) logger.warn({ positionId: pos.id, deficit: gross.toFixed() }, 'liquidation beyond bankruptcy (absorbed by the exchange)');
      await this.notify(tx, out, pos.userId, 'POSITION_LIQUIDATED', { positionId: String(pos.id), symbol: pos.symbol, side: pos.side, quantity: q.toFixed(), markPrice: mark.toFixed(), lostMargin: toFixedStr(m.sub(payout)) });
      return true;
    });
  }

  /** TP/SL reached (mark price): close the whole position at market. No liquidity → retried on the next mark. */
  private async closeByTrigger(positionId: number, c: LoadedContract): Promise<boolean> {
    return this.commit(async (tx, out) => {
      const [peek] = await tx.select().from(futuresPositions).where(eq(futuresPositions.id, positionId));
      if (!peek) return false;
      await this.lockSymbol(tx, peek.userId, peek.symbol);
      const pos = await this.openPosition(tx, peek.userId, peek.symbol);
      const mark = this.marks.liveMark(peek.symbol);
      if (!pos || pos.id !== positionId || mark === null || !this.market.isLive(pos.symbol)) return false;
      const hit = this.tpslHit(pos, mark);
      if (!hit) return false;
      const side = pos.side === 'LONG' ? ('SELL' as const) : ('BUY' as const);
      const q = dec(pos.quantity);
      if (!walkBook(side, this.market.bookSide(pos.symbol, side), { kind: 'base', qty: q }, c.step).complete) return false;
      const order = await this.place(tx, out, pos.userId, { symbol: pos.symbol, side, type: 'MARKET', quantity: q.toFixed(), reduceOnly: true }, hit);
      const avg = dec(order.executedQty).isZero() ? mark : dec(order.executedNotional).div(dec(order.executedQty));
      await this.notify(tx, out, pos.userId, 'POSITION_TPSL', { positionId: String(pos.id), symbol: pos.symbol, side: pos.side, reason: hit, quantity: dec(order.executedQty).toFixed(), price: avg.toDecimalPlaces(8).toFixed(), realizedPnl: toFixedStr(dec(order.realizedPnl)) });
      return true;
    });
  }

  /**
   * Pays/charges funding on every position that was open at `fundingTime` (idempotent per
   * position and time). Funding changes the isolated margin; never below 0.
   */
  async settleFunding(symbol: string, fundingTime: Date, rateStr: string, markStr: string): Promise<number> {
    const rate = dec(rateStr);
    const mark = dec(markStr);
    await this.db.execute(sql`INSERT INTO futures_funding_events (symbol, funding_time, rate, mark_price) VALUES (${symbol}, ${fundingTime}, ${rate.toFixed()}, ${mark.toFixed()}) ON CONFLICT DO NOTHING`);
    const open = await this.db
      .select({ id: futuresPositions.id, userId: futuresPositions.userId })
      .from(futuresPositions)
      .where(and(eq(futuresPositions.symbol, symbol), eq(futuresPositions.status, 'OPEN'), lt(futuresPositions.openedAt, fundingTime)));
    let n = 0;
    for (const cand of open) {
      try {
        const paid = await this.commit(async (tx, out) => {
          await this.lockSymbol(tx, cand.userId, symbol);
          const pos = await this.openPosition(tx, cand.userId, symbol);
          if (!pos || pos.id !== cand.id) return false;
          let amount = floorSigned(dec(pos.quantity).mul(mark).mul(rate).mul(pos.side === 'LONG' ? -1 : 1));
          const m = dec(pos.margin);
          if (m.add(amount).lt(0)) amount = m.neg();
          const ins = await tx.execute(sql`
            INSERT INTO futures_funding_payments (position_id, funding_time, user_id, symbol, amount)
            VALUES (${pos.id}, ${fundingTime}, ${pos.userId}, ${symbol}, ${amount.toFixed()}) ON CONFLICT DO NOTHING RETURNING position_id`);
          if (ins.rows.length === 0) return false; // already paid
          await this.balances(tx, out, [{ userId: pos.userId, account: F, asset: 'USDT', type: 'FUNDING_FEE', deltaLocked: amount, refType: 'FUTURES_POSITION', refId: String(pos.id) }]);
          const [p] = await tx
            .update(futuresPositions)
            .set({ margin: toFixedStr(m.add(amount)), funding: toFixedStr(dec(pos.funding).add(amount)), updatedAt: this.now() })
            .where(eq(futuresPositions.id, pos.id))
            .returning();
          out.position(p!);
          return true;
        });
        if (paid) n++;
      } catch (err) {
        logger.error({ err, positionId: cand.id }, 'funding payment failed');
      }
    }
    return n;
  }

  /** Admin account reset: cancel futures orders and close positions without PnL (margin back to the wallet). */
  async resetUser(userId: string): Promise<void> {
    await this.cancelAll(userId, undefined, 'ADMIN');
    const open = await this.db
      .select({ id: futuresPositions.id, symbol: futuresPositions.symbol })
      .from(futuresPositions)
      .where(and(eq(futuresPositions.userId, userId), eq(futuresPositions.status, 'OPEN')));
    for (const o of open) {
      await this.commit(async (tx, out) => {
        await this.lockSymbol(tx, userId, o.symbol);
        const pos = await this.openPosition(tx, userId, o.symbol);
        if (!pos) return;
        const m = dec(pos.margin);
        await this.balances(tx, out, [{ userId, account: F, asset: 'USDT', type: 'ACCOUNT_RESET', deltaAvailable: m, deltaLocked: m.neg(), refType: 'FUTURES_POSITION', refId: String(pos.id) }]);
        const [p] = await tx
          .update(futuresPositions)
          .set({ status: 'CLOSED', quantity: '0', margin: '0', closeReason: 'ADMIN', closedAt: this.now(), updatedAt: this.now(), takeProfitPrice: null, stopLossPrice: null })
          .where(eq(futuresPositions.id, pos.id))
          .returning();
        out.position(p!);
      });
    }
  }

  // ───────────────────────────── reads

  async openOrders(userId: string, symbol?: string): Promise<FOrderRow[]> {
    const where: SQL[] = [eq(futuresOrders.userId, userId), inArray(futuresOrders.status, [...OPEN_STATUSES])];
    if (symbol) where.push(eq(futuresOrders.symbol, symbol));
    return this.db
      .select()
      .from(futuresOrders)
      .where(and(...where))
      .orderBy(desc(futuresOrders.id));
  }

  async openPositions(userId: string): Promise<FPositionRow[]> {
    return this.db
      .select()
      .from(futuresPositions)
      .where(and(eq(futuresPositions.userId, userId), eq(futuresPositions.status, 'OPEN')))
      .orderBy(asc(futuresPositions.symbol));
  }

  /** Symbols that currently have open positions or resting orders (the engine only checks those). */
  async activeSymbols(): Promise<{ positions: Set<string>; orders: Set<string> }> {
    const p = await this.db.selectDistinct({ s: futuresPositions.symbol }).from(futuresPositions).where(eq(futuresPositions.status, 'OPEN'));
    const o = await this.db
      .selectDistinct({ s: futuresOrders.symbol })
      .from(futuresOrders)
      .where(and(eq(futuresOrders.type, 'LIMIT'), inArray(futuresOrders.status, [...OPEN_STATUSES]), gt(futuresOrders.quantity, futuresOrders.executedQty)));
    return { positions: new Set(p.map((r) => r.s)), orders: new Set(o.map((r) => r.s)) };
  }
}
