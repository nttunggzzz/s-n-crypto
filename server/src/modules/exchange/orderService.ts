import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { PlaceOcoRequest, PlaceOrderRequest } from '@cex/contracts';
import {
  AMOUNT_SCALE,
  ceilToStep,
  checkNotional,
  checkPrice,
  checkQuantity,
  dec,
  floorToStep,
  hasAtMostScale,
  maxDec,
  minDec,
  roundUp,
  taxVndAmounts,
  toFixedStr,
  walkBook,
  withholdingTax,
  ZERO,
  type Dec,
  type Fill,
  type WalkTarget,
} from '@cex/core';
import { balances, OPEN_STATUSES, orderLists, orders, taxWithholdings, trades, type TpSlData } from '../../db/schema.ts';
import type { Db, Tx } from '../../db/client.ts';
import { AppError, isUniqueViolation } from '../../lib/errors.ts';
import type { MarketDataService } from '../market/marketData.ts';
import { applyBalanceChanges, type BalanceChange } from './ledger.ts';
import type { ExchangeConfig, LoadedSymbol } from './exchangeConfig.ts';
import type { ExchangeEvents, OrderListRow, OrderRow, TradeRow } from './events.ts';
import type { OpenOrderIndex } from './openOrderIndex.ts';
import { Outcome } from './outcome.ts';
import type { NotificationService } from './notificationService.ts';
import { applyFillsToPosition } from './positions.ts';
import { sellTaxContext } from './tax.ts';

export type PlaceOrderInput = z.output<typeof PlaceOrderRequest>;
export type PlaceOcoInput = z.output<typeof PlaceOcoRequest>;
type TpSlInput = { takeProfitPrice?: string; stopLossPrice?: string; stopLossLimitPrice?: string };

/** Open orders per user (an OCO counts as 2). */
export const MAX_OPEN_ORDERS = 200;

export interface OrderResult {
  order: OrderRow;
  trades: TradeRow[];
}

/** Bot orders are tagged with their bot; only the bot (or an admin) cancels them. */
export interface OrderSourceMeta {
  source: 'GRID' | 'DCA';
  sourceId: number;
}

const isOpen = (status: string) => (OPEN_STATUSES as readonly string[]).includes(status);
const fx = (d: Dec) => toFixedStr(d);
const fxn = (d: Dec | null | undefined) => (d ? toFixedStr(d) : null);

function ruleError(v: string | null | undefined): void {
  if (v) throw new AppError(v as AppError['code']);
}

/** Trigger level of a trailing stop, rounded away from the market to the tick. */
export function trailingStopPrice(side: 'BUY' | 'SELL', reference: Dec, bips: number, tick: Dec): Dec {
  return side === 'SELL' ? floorToStep(reference.mul(10_000 - bips).div(10_000), tick) : ceilToStep(reference.mul(10_000 + bips).div(10_000), tick);
}

export class OrderService {
  constructor(
    private readonly db: Db,
    private readonly config: ExchangeConfig,
    private readonly market: MarketDataService,
    private readonly events: ExchangeEvents,
    private readonly index: OpenOrderIndex,
    private readonly notifications: NotificationService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Runs `fn` in one transaction; index + realtime updates are applied only after commit. */
  private async commit<T>(fn: (tx: Tx, out: Outcome) => Promise<T>): Promise<T> {
    const out = new Outcome();
    const value = await this.db.transaction((tx) => fn(tx, out));
    await out.apply(this.db, this.index, this.events);
    return value;
  }

  private requireLive(symbol: string): void {
    if (!this.market.isLive(symbol)) throw new AppError('MARKET_DATA_STALE', `Market data for ${symbol} is not live; trading paused`);
  }

  /** Last traded price (live) — needed to place stops / OCO / alerts relative to the market. */
  private lastPrice(symbol: string): Dec {
    const p = this.market.livePrice(symbol);
    if (!p) throw new AppError('MARKET_DATA_STALE', `No recent trade for ${symbol}`);
    return p;
  }

  private async checkOpenLimit(tx: Tx, userId: string, adding: number): Promise<void> {
    if (adding === 0) return;
    const [r] = await tx
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.userId, userId), inArray(orders.status, [...OPEN_STATUSES])));
    if ((r?.n ?? 0) + adding > MAX_OPEN_ORDERS) throw new AppError('LIMIT_EXCEEDED', `At most ${MAX_OPEN_ORDERS} open orders`, { limit: MAX_OPEN_ORDERS });
  }

  // ═════════════════════════════ place

  async placeOrder(userId: string, input: PlaceOrderInput, meta?: OrderSourceMeta): Promise<OrderResult> {
    const sym = this.config.requireTradable(input.symbol);
    this.requireLive(input.symbol);
    const clientOrderId = input.clientOrderId ?? randomUUID().replace(/-/g, '');
    try {
      return await this.commit(async (tx, out) => {
        await this.checkOpenLimit(tx, userId, input.type === 'MARKET' ? 0 : 1);
        switch (input.type) {
          case 'MARKET':
            return this.placeMarket(tx, out, userId, sym, input, clientOrderId, meta);
          case 'LIMIT':
            return this.placeLimit(tx, out, userId, sym, input, clientOrderId, meta);
          case 'STOP_MARKET':
          case 'STOP_LIMIT':
            return this.placeStop(tx, out, userId, sym, input, clientOrderId);
          case 'TRAILING_STOP_MARKET':
            return this.placeTrailing(tx, out, userId, sym, input, clientOrderId);
        }
      });
    } catch (err) {
      if (isUniqueViolation(err, 'orders_client_id_uq')) throw new AppError('DUPLICATE_CLIENT_ORDER_ID', 'clientOrderId already used');
      throw err;
    }
  }

  /** Validates TP/SL against the entry reference and returns the stored form. */
  private tpslData(sym: LoadedSymbol, t: TpSlInput | undefined, reference: Dec | null): TpSlData | null {
    if (!t) return null;
    const tp = t.takeProfitPrice ? dec(t.takeProfitPrice) : null;
    const sl = t.stopLossPrice ? dec(t.stopLossPrice) : null;
    const slLimit = t.stopLossLimitPrice ? dec(t.stopLossLimitPrice) : null;
    for (const p of [tp, sl, slLimit]) if (p) ruleError(checkPrice(sym.rules, p));
    if (!reference) throw new AppError('MARKET_DATA_STALE', 'No reference price for TP/SL');
    if ((tp && tp.lte(reference)) || (sl && sl.gte(reference))) {
      throw new AppError('INVALID_TPSL', 'Take-profit must be above and stop-loss below the entry price', { reference: fx(reference) });
    }
    return { takeProfitPrice: fxn(tp), stopLossPrice: fxn(sl), stopLossLimitPrice: fxn(slLimit), state: 'PENDING', childOrderListId: null, childOrderIds: [], skippedReason: null };
  }

  /** Inserts an order that reserves funds now, with its ORDER_LOCK ledger entry. */
  private async insertLocked(tx: Tx, out: Outcome, values: typeof orders.$inferInsert, lockAsset: string, lockAmount: Dec): Promise<OrderRow> {
    const [order] = await tx
      .insert(orders)
      .values({ ...values, lockedAsset: lockAsset, lockedAmount: fx(lockAmount) })
      .returning();
    if (lockAmount.gt(0)) {
      out.addBalances(
        (
          await applyBalanceChanges(tx, [
            { userId: order!.userId, asset: lockAsset, type: 'ORDER_LOCK', deltaAvailable: lockAmount.neg(), deltaLocked: lockAmount, refType: 'ORDER', refId: String(order!.id) },
          ])
        ).values(),
      );
    }
    return out.order(order!);
  }

  private async placeMarket(tx: Tx, out: Outcome, userId: string, sym: LoadedSymbol, input: Extract<PlaceOrderInput, { type: 'MARKET' }>, clientOrderId: string, meta?: OrderSourceMeta): Promise<OrderResult> {
    let target: WalkTarget;
    if (input.quantity !== undefined) {
      const qty = dec(input.quantity);
      ruleError(checkQuantity(sym.rules, qty));
      target = { kind: 'base', qty };
    } else {
      const amount = dec(input.quoteOrderQty!);
      if (!hasAtMostScale(amount, AMOUNT_SCALE)) throw new AppError('INVALID_QUANTITY', `quoteOrderQty allows at most ${AMOUNT_SCALE} decimals`);
      target = { kind: 'quote', amount };
    }
    const tpsl = this.tpslData(sym, input.tpsl, this.market.bestAsk(sym.row.symbol));

    const walk = walkBook(input.side, this.market.bookSide(sym.row.symbol, input.side), target, sym.step);
    if (walk.executedQty.isZero()) throw new AppError(target.kind === 'quote' ? 'QUANTITY_TOO_SMALL' : 'INSUFFICIENT_LIQUIDITY');
    if (!walk.complete) throw new AppError('INSUFFICIENT_LIQUIDITY', 'Order book is not deep enough for this order');
    ruleError(checkQuantity(sym.rules, walk.executedQty));
    ruleError(checkNotional(sym.rules, walk.quoteQty));

    const [order] = await tx
      .insert(orders)
      .values({
        userId,
        clientOrderId,
        symbol: sym.row.symbol,
        side: input.side,
        type: 'MARKET',
        status: 'NEW',
        quantity: input.quantity ?? null,
        quoteOrderQty: input.quoteOrderQty ?? null,
        tpsl,
        ...(meta ? { source: meta.source, sourceId: meta.sourceId } : {}),
      })
      .returning();
    return this.settleFills(tx, out, order!, sym, walk.fills, 'TAKER', this.now(), true);
  }

  private async placeLimit(tx: Tx, out: Outcome, userId: string, sym: LoadedSymbol, input: Extract<PlaceOrderInput, { type: 'LIMIT' }>, clientOrderId: string, meta?: OrderSourceMeta): Promise<OrderResult> {
    const price = dec(input.price);
    const qty = dec(input.quantity);
    ruleError(checkPrice(sym.rules, price));
    ruleError(checkQuantity(sym.rules, qty));
    ruleError(checkNotional(sym.rules, qty.mul(price)));
    const tpsl = this.tpslData(sym, input.tpsl, price);
    const isBuy = input.side === 'BUY';
    const order = await this.insertLocked(
      tx,
      out,
      {
        userId,
        clientOrderId,
        symbol: sym.row.symbol,
        side: input.side,
        type: 'LIMIT',
        timeInForce: input.timeInForce,
        status: 'NEW',
        price: fx(price),
        quantity: fx(qty),
        lockPrice: isBuy ? fx(price) : null,
        tpsl,
        ...(meta ? { source: meta.source, sourceId: meta.sourceId } : {}),
      },
      isBuy ? sym.row.quoteAsset : sym.row.baseAsset,
      isBuy ? qty.mul(price) : qty,
    );
    return this.takeAsLimit(tx, out, order, sym);
  }

  /**
   * A working limit order that is marketable takes liquidity up to its price (taker);
   * the rest rests on the book, or expires for IOC.
   */
  private async takeAsLimit(tx: Tx, out: Outcome, order: OrderRow, sym: LoadedSymbol): Promise<OrderResult> {
    const price = dec(order.price!);
    const remaining = dec(order.quantity!).sub(dec(order.executedQty));
    const best = order.side === 'BUY' ? this.market.bestAsk(order.symbol) : this.market.bestBid(order.symbol);
    let tradeRows: TradeRow[] = [];
    if (best !== null && (order.side === 'BUY' ? best.lte(price) : best.gte(price))) {
      const walk = walkBook(order.side, this.market.bookSide(order.symbol, order.side), { kind: 'base', qty: remaining }, sym.step, price);
      if (walk.executedQty.gt(0)) ({ order, trades: tradeRows } = await this.settleFills(tx, out, order, sym, walk.fills, 'TAKER', this.now()));
    }
    if (order.timeInForce === 'IOC' && isOpen(order.status)) order = await this.releaseAndClose(tx, out, order, 'EXPIRED', 'IOC_REMAINDER');
    return { order, trades: tradeRows };
  }

  private async placeStop(
    tx: Tx,
    out: Outcome,
    userId: string,
    sym: LoadedSymbol,
    input: Extract<PlaceOrderInput, { type: 'STOP_MARKET' | 'STOP_LIMIT' }>,
    clientOrderId: string,
  ): Promise<OrderResult> {
    const stop = dec(input.stopPrice);
    ruleError(checkPrice(sym.rules, stop));
    const last = this.lastPrice(sym.row.symbol);
    if (stop.eq(last)) throw new AppError('INVALID_STOP_PRICE', 'Stop price equals the last price', { lastPrice: fx(last) });
    const direction: 'UP' | 'DOWN' = stop.gt(last) ? 'UP' : 'DOWN';
    const isBuy = input.side === 'BUY';
    const common = { userId, clientOrderId, symbol: sym.row.symbol, side: input.side, type: input.type, status: 'NEW' as const, stopPrice: fx(stop), triggerState: 'WAITING' as const, triggerDirection: direction };

    if (input.type === 'STOP_LIMIT') {
      const price = dec(input.price);
      const qty = dec(input.quantity);
      ruleError(checkPrice(sym.rules, price));
      ruleError(checkQuantity(sym.rules, qty));
      ruleError(checkNotional(sym.rules, qty.mul(price)));
      const order = await this.insertLocked(
        tx,
        out,
        { ...common, timeInForce: input.timeInForce, price: fx(price), quantity: fx(qty), lockPrice: isBuy ? fx(price) : null },
        isBuy ? sym.row.quoteAsset : sym.row.baseAsset,
        isBuy ? qty.mul(price) : qty,
      );
      return { order, trades: [] };
    }
    const reserve = this.marketReserve(sym, input.side, input.quantity, input.quoteOrderQty, stop);
    const order = await this.insertLocked(tx, out, { ...common, quantity: input.quantity ? fx(dec(input.quantity)) : null, quoteOrderQty: input.quoteOrderQty ? fx(dec(input.quoteOrderQty)) : null }, reserve.asset, reserve.amount);
    return { order, trades: [] };
  }

  /** Reservation of a stop-market / trailing order: SELL base quantity, BUY the USDT amount. */
  private marketReserve(sym: LoadedSymbol, side: 'BUY' | 'SELL', quantity: string | undefined, quoteOrderQty: string | undefined, refPrice: Dec | null) {
    if (side === 'SELL') {
      const qty = dec(quantity!);
      ruleError(checkQuantity(sym.rules, qty));
      if (refPrice) ruleError(checkNotional(sym.rules, qty.mul(refPrice)));
      return { asset: sym.row.baseAsset, amount: qty };
    }
    const amount = dec(quoteOrderQty!);
    if (!hasAtMostScale(amount, AMOUNT_SCALE)) throw new AppError('INVALID_QUANTITY', `quoteOrderQty allows at most ${AMOUNT_SCALE} decimals`);
    ruleError(checkNotional(sym.rules, amount));
    return { asset: sym.row.quoteAsset, amount };
  }

  private async placeTrailing(
    tx: Tx,
    out: Outcome,
    userId: string,
    sym: LoadedSymbol,
    input: Extract<PlaceOrderInput, { type: 'TRAILING_STOP_MARKET' }>,
    clientOrderId: string,
  ): Promise<OrderResult> {
    const bips = input.trailingDeltaBips;
    if (!Number.isInteger(bips) || bips < 10 || bips > 2000) throw new AppError('INVALID_TRAILING_DELTA', 'trailingDeltaBips must be 10..2000');
    const last = this.lastPrice(sym.row.symbol);
    const activation = input.activationPrice ? dec(input.activationPrice) : null;
    if (activation) {
      ruleError(checkPrice(sym.rules, activation));
      // SELL trails the highs: activates once the price rises to the activation level (and vice versa).
      if (input.side === 'SELL' ? activation.lte(last) : activation.gte(last)) {
        throw new AppError('INVALID_STOP_PRICE', input.side === 'SELL' ? 'activationPrice must be above the last price' : 'activationPrice must be below the last price', { lastPrice: fx(last) });
      }
    }
    const reference = activation ? null : last;
    const stop = reference ? trailingStopPrice(input.side, reference, bips, sym.tick) : null;
    const reserve = this.marketReserve(sym, input.side, input.quantity, input.quoteOrderQty, stop ?? activation);
    const order = await this.insertLocked(
      tx,
      out,
      {
        userId,
        clientOrderId,
        symbol: sym.row.symbol,
        side: input.side,
        type: 'TRAILING_STOP_MARKET',
        status: 'NEW',
        quantity: input.quantity ? fx(dec(input.quantity)) : null,
        quoteOrderQty: input.quoteOrderQty ? fx(dec(input.quoteOrderQty)) : null,
        triggerState: 'WAITING',
        triggerDirection: input.side === 'SELL' ? 'DOWN' : 'UP',
        trailingDeltaBips: bips,
        activationPrice: fxn(activation),
        trailingReferencePrice: fxn(reference),
        stopPrice: fxn(stop),
      },
      reserve.asset,
      reserve.amount,
    );
    return { order, trades: [] };
  }

  // ═════════════════════════════ OCO

  async placeOco(userId: string, input: PlaceOcoInput): Promise<{ list: OrderListRow; legs: OrderRow[] }> {
    const sym = this.config.requireTradable(input.symbol);
    this.requireLive(input.symbol);
    const last = this.lastPrice(input.symbol);
    const qty = dec(input.quantity);
    const price = dec(input.price);
    const stop = dec(input.stopPrice);
    const stopLimit = input.stopLimitPrice ? dec(input.stopLimitPrice) : null;
    for (const p of [price, stop, stopLimit]) if (p) ruleError(checkPrice(sym.rules, p));
    ruleError(checkQuantity(sym.rules, qty));
    ruleError(checkNotional(sym.rules, qty.mul(price)));
    ruleError(checkNotional(sym.rules, qty.mul(stopLimit ?? stop)));
    const valid = input.side === 'SELL' ? price.gt(last) && last.gt(stop) : price.lt(last) && last.lt(stop);
    if (!valid) {
      throw new AppError('INVALID_OCO_PRICES', input.side === 'SELL' ? 'Need price > last price > stopPrice' : 'Need price < last price < stopPrice', { lastPrice: fx(last) });
    }
    if (input.side === 'BUY' && !stopLimit) throw new AppError('VALIDATION_ERROR', 'BUY OCO needs stopLimitPrice');
    try {
      return await this.commit(async (tx, out) => {
        await this.checkOpenLimit(tx, userId, 2);
        return this.createOco(tx, out, {
          userId,
          sym,
          side: input.side,
          qty,
          price,
          stop,
          stopLimit,
          parentOrderId: null,
          clientListId: input.clientListId ?? randomUUID().replace(/-/g, ''),
        });
      });
    } catch (err) {
      if (isUniqueViolation(err, 'order_lists_client_id_uq') || isUniqueViolation(err, 'orders_client_id_uq')) {
        throw new AppError('DUPLICATE_CLIENT_ORDER_ID', 'clientListId already used');
      }
      throw err;
    }
  }

  /**
   * Inserts an OCO. The whole reservation sits on the LIMIT leg; if the STOP leg triggers, the
   * reservation moves to it and the limit leg is canceled (see finishList).
   */
  private async createOco(
    tx: Tx,
    out: Outcome,
    p: { userId: string; sym: LoadedSymbol; side: 'BUY' | 'SELL'; qty: Dec; price: Dec; stop: Dec; stopLimit: Dec | null; parentOrderId: number | null; clientListId: string },
  ): Promise<{ list: OrderListRow; legs: OrderRow[] }> {
    const isBuy = p.side === 'BUY';
    const lockPrice = isBuy ? maxDec(p.price, p.stopLimit!) : null;
    const lockAsset = isBuy ? p.sym.row.quoteAsset : p.sym.row.baseAsset;
    const [list] = await tx
      .insert(orderLists)
      .values({ userId: p.userId, clientListId: p.clientListId, symbol: p.sym.row.symbol, side: p.side, contingencyType: 'OCO', listStatus: 'EXECUTING', parentOrderId: p.parentOrderId })
      .returning();
    const common = { userId: p.userId, symbol: p.sym.row.symbol, side: p.side, status: 'NEW' as const, quantity: fx(p.qty), orderListId: list!.id, parentOrderId: p.parentOrderId, lockPrice: fxn(lockPrice) };
    const limitLeg = await this.insertLocked(
      tx,
      out,
      { ...common, clientOrderId: `${p.clientListId}-L`, type: 'LIMIT', timeInForce: 'GTC', price: fx(p.price) },
      lockAsset,
      isBuy ? p.qty.mul(lockPrice!) : p.qty,
    );
    const [stopLeg] = await tx
      .insert(orders)
      .values({
        ...common,
        clientOrderId: `${p.clientListId}-S`,
        type: p.stopLimit ? 'STOP_LIMIT' : 'STOP_MARKET',
        timeInForce: p.stopLimit ? 'GTC' : null,
        price: fxn(p.stopLimit),
        stopPrice: fx(p.stop),
        triggerState: 'WAITING',
        triggerDirection: isBuy ? 'UP' : 'DOWN',
        lockedAsset: lockAsset,
        lockedAmount: '0',
      })
      .returning();
    out.order(stopLeg!);
    return { list: list!, legs: [limitLeg, stopLeg!] };
  }

  // ═════════════════════════════ settlement

  /**
   * Applies fills inside `tx`: trades, ledger, average cost, executed quantities, status,
   * then follow-ups (OCO sibling, TP/SL children). Caller holds the order row lock (or just inserted it).
   * `quoteComplete`: for orders sized in USDT, whether the whole amount could be used.
   */
  private async settleFills(tx: Tx, out: Outcome, order: OrderRow, sym: LoadedSymbol, fills: Fill[], liquidity: 'MAKER' | 'TAKER', eventAt: Date, quoteComplete = false): Promise<OrderResult> {
    const feeRate = this.config.feeRate;
    const isBuy = order.side === 'BUY';
    const base = sym.row.baseAsset;
    const quote = sym.row.quoteAsset;
    const ref = { refType: 'ORDER' as const, refId: String(order.id) };

    if (!fills.some((f) => f.qty.gt(0))) throw new Error(`settleFills called with no quantity for order ${order.id}`);
    // Vietnam tax (module T §3.2): SELL only, decided at the fill, per fill on the gross value, rounded up.
    const { category: taxCategory, terms: taxTerms } = await sellTaxContext(tx, this.config, order.userId, order.side);
    const parts = fills
      .filter((f) => f.qty.gt(0))
      .map((f) => {
        const quoteQty = f.qty.mul(f.price);
        return {
          price: f.price,
          qty: f.qty,
          quote: quoteQty,
          fee: roundUp(isBuy ? f.qty.mul(feeRate) : quoteQty.mul(feeRate)),
          tax: taxTerms ? withholdingTax(quoteQty, taxTerms.rate) : ZERO,
        };
      });
    const qtySum = parts.reduce((s, p) => s.add(p.qty), ZERO);
    const quoteSum = parts.reduce((s, p) => s.add(p.quote), ZERO);
    const feeSum = parts.reduce((s, p) => s.add(p.fee), ZERO);
    const taxSum = parts.reduce((s, p) => s.add(p.tax), ZERO);

    const executed = dec(order.executedQty).add(qtySum);
    if (order.quantity !== null && executed.gt(dec(order.quantity))) throw new Error(`order ${order.id} overfilled`);
    const filled = order.type === 'MARKET' || (order.quantity !== null ? executed.eq(dec(order.quantity)) : quoteComplete);

    const changes: BalanceChange[] = [];
    const locked = dec(order.lockedAmount);
    let lockedAfter = ZERO;
    if (order.lockedAsset !== null) {
      if (isBuy) {
        // keep = what the remaining quantity still needs; the rest of what was reserved goes back.
        const keep = filled ? ZERO : order.quantity !== null ? dec(order.quantity).sub(executed).mul(dec(order.lockPrice ?? order.price!)) : locked.sub(quoteSum);
        const refund = locked.sub(quoteSum).sub(keep);
        if (refund.lt(0)) throw new Error(`order ${order.id} lock accounting broken: refund=${refund.toString()}`);
        changes.push({ userId: order.userId, asset: quote, type: 'TRADE_DEBIT', deltaLocked: quoteSum.neg(), ...ref });
        if (refund.gt(0)) changes.push({ userId: order.userId, asset: quote, type: 'ORDER_UNLOCK', deltaLocked: refund.neg(), deltaAvailable: refund, ...ref });
        lockedAfter = keep;
      } else {
        lockedAfter = locked.sub(qtySum);
        if (lockedAfter.lt(0) || (filled && !lockedAfter.isZero())) throw new Error(`order ${order.id} lock accounting broken: lockedAfter=${lockedAfter.toString()}`);
        changes.push({ userId: order.userId, asset: base, type: 'TRADE_DEBIT', deltaLocked: qtySum.neg(), ...ref });
      }
    } else if (isBuy) {
      changes.push({ userId: order.userId, asset: quote, type: 'TRADE_DEBIT', deltaAvailable: quoteSum.neg(), ...ref });
    } else {
      changes.push({ userId: order.userId, asset: base, type: 'TRADE_DEBIT', deltaAvailable: qtySum.neg(), ...ref });
    }
    if (isBuy) {
      changes.push({ userId: order.userId, asset: base, type: 'TRADE_CREDIT', deltaAvailable: qtySum, ...ref });
      if (feeSum.gt(0)) changes.push({ userId: order.userId, asset: base, type: 'FEE', deltaAvailable: feeSum.neg(), ...ref });
    } else {
      changes.push({ userId: order.userId, asset: quote, type: 'TRADE_CREDIT', deltaAvailable: quoteSum, ...ref });
      if (feeSum.gt(0)) changes.push({ userId: order.userId, asset: quote, type: 'FEE', deltaAvailable: feeSum.neg(), ...ref });
      // fee and tax are each at most 1% of the fill's gross value, so the proceeds cover them. The only way one fill's net
      // could go negative is a quoteQty below about 2e-8 (both round up to 1e-8), which no real pair produces.
      if (taxSum.gt(0)) changes.push({ userId: order.userId, asset: quote, type: 'TAX_WITHHOLDING', deltaAvailable: taxSum.neg(), ...ref });
    }
    out.addBalances((await applyBalanceChanges(tx, changes)).values());

    const realized = await applyFillsToPosition(tx, order.userId, base, order.side, parts);
    const insertedTrades = await tx
      .insert(trades)
      .values(
        parts.map((p, i) => ({
          orderId: order.id,
          userId: order.userId,
          symbol: order.symbol,
          side: order.side,
          price: fx(p.price),
          quantity: fx(p.qty),
          quoteQty: fx(p.quote),
          fee: fx(p.fee),
          feeAsset: isBuy ? base : quote,
          tax: fx(p.tax),
          taxCategory,
          liquidity,
          realizedPnl: fxn(realized[i]),
          marketEventAt: eventAt,
        })),
      )
      .returning();
    out.trades.push(...insertedTrades);
    if (taxTerms) {
      // one record per withheld trade (unique trade_id): a replayed price event cannot reach here twice for a fill
      // (the order row is locked and re-checked open), and the unique index is the last line of defence.
      await tx.insert(taxWithholdings).values(
        // built from each returned trade row itself (no reliance on RETURNING order)
        insertedTrades.map((t) => {
          const gross = dec(t.quoteQty);
          const taxAmount = dec(t.tax);
          const vnd = taxVndAmounts(gross, taxAmount, taxTerms.vndRate);
          return {
            tradeId: t.id,
            orderId: order.id,
            userId: order.userId,
            symbol: order.symbol,
            asset: quote,
            quantity: fx(dec(t.quantity)),
            price: fx(dec(t.price)),
            grossQuote: fx(gross),
            taxRate: taxTerms.rate.toFixed(),
            taxAmount: fx(taxAmount),
            category: taxTerms.category,
            vndRate: taxTerms.vndRate === null ? null : taxTerms.vndRate.toFixed(),
            grossVnd: vnd.grossVnd === null ? null : vnd.grossVnd.toFixed(0),
            taxVnd: vnd.taxVnd === null ? null : vnd.taxVnd.toFixed(0),
            createdAt: t.createdAt,
          };
        }),
      );
    }

    const [updated] = await tx
      .update(orders)
      .set({
        executedQty: fx(executed),
        cumulativeQuoteQty: fx(dec(order.cumulativeQuoteQty).add(quoteSum)),
        lockedAmount: fx(lockedAfter),
        status: filled ? 'FILLED' : 'PARTIALLY_FILLED',
        updatedAt: this.now(),
      })
      .where(eq(orders.id, order.id))
      .returning();
    let result = out.order(updated!);
    if (filled) result = await this.afterOrderDone(tx, out, result, sym);
    return { order: result, trades: insertedTrades };
  }

  /** Unlocks what the order still reserves and moves it to a final status. */
  private async releaseAndClose(tx: Tx, out: Outcome, order: OrderRow, status: 'CANCELED' | 'EXPIRED', reason: OrderRow['closeReason']): Promise<OrderRow> {
    const locked = dec(order.lockedAmount);
    if (locked.gt(0) && order.lockedAsset) {
      out.addBalances(
        (
          await applyBalanceChanges(tx, [
            { userId: order.userId, asset: order.lockedAsset, type: 'ORDER_UNLOCK', deltaLocked: locked.neg(), deltaAvailable: locked, refType: 'ORDER', refId: String(order.id) },
          ])
        ).values(),
      );
    }
    const [updated] = await tx
      .update(orders)
      .set({ status, closeReason: reason, lockedAmount: '0', updatedAt: this.now() })
      .where(eq(orders.id, order.id))
      .returning();
    let result = out.order(updated!);
    const sym = this.config.findSymbol(order.symbol);
    if (sym) result = await this.afterOrderDone(tx, out, result, sym);
    return result;
  }

  /** Follow-ups once an order is final: OCO sibling cancel, TP/SL children of a BUY. */
  private async afterOrderDone(tx: Tx, out: Outcome, order: OrderRow, sym: LoadedSymbol): Promise<OrderRow> {
    if (order.orderListId !== null && order.status === 'FILLED') await this.finishList(tx, out, order.orderListId, order.id, false);
    if (order.side === 'BUY' && order.tpsl?.state === 'PENDING') return this.placeTpSl(tx, out, order, sym);
    return order;
  }

  /**
   * Ends an OCO because leg `keepId` filled (or triggered). The other open legs are canceled
   * with OCO_SIBLING. With `transferLock`, their reservation moves to the kept leg (no ledger change).
   */
  private async finishList(tx: Tx, out: Outcome, listId: number, keepId: number, transferLock: boolean): Promise<void> {
    const legs = await tx.select().from(orders).where(eq(orders.orderListId, listId)).orderBy(asc(orders.id)).for('update');
    const [list] = await tx.select().from(orderLists).where(eq(orderLists.id, listId)).for('update');
    if (!list || list.listStatus !== 'EXECUTING') return;
    let moved = ZERO;
    for (const leg of legs) {
      if (leg.id === keepId || !isOpen(leg.status)) continue;
      if (transferLock) {
        moved = moved.add(dec(leg.lockedAmount));
        const [c] = await tx
          .update(orders)
          .set({ status: 'CANCELED', closeReason: 'OCO_SIBLING', lockedAmount: '0', updatedAt: this.now() })
          .where(eq(orders.id, leg.id))
          .returning();
        out.order(c!);
      } else {
        await this.releaseAndClose(tx, out, leg, 'CANCELED', 'OCO_SIBLING');
      }
    }
    if (moved.gt(0)) {
      const [k] = await tx
        .update(orders)
        .set({ lockedAmount: sql`${orders.lockedAmount} + ${fx(moved)}`, updatedAt: this.now() })
        .where(eq(orders.id, keepId))
        .returning();
      out.order(k!);
    }
    await tx.update(orderLists).set({ listStatus: 'ALL_DONE', updatedAt: this.now() }).where(eq(orderLists.id, listId));
    out.listIds.add(listId);
  }

  /** Places the SELL take-profit / stop-loss for what a finished BUY actually received. */
  private async placeTpSl(tx: Tx, out: Outcome, parent: OrderRow, sym: LoadedSymbol): Promise<OrderRow> {
    const t = parent.tpsl!;
    const tp = t.takeProfitPrice ? dec(t.takeProfitPrice) : null;
    const sl = t.stopLossPrice ? dec(t.stopLossPrice) : null;
    const slLimit = t.stopLossLimitPrice ? dec(t.stopLossLimitPrice) : null;
    const executed = dec(parent.executedQty);
    let skip: string | null;
    let qty = ZERO;
    if (executed.isZero()) {
      skip = 'PARENT_NOT_FILLED';
    } else {
      const [f] = await tx
        .select({ fee: sql<string | null>`sum(${trades.fee})` })
        .from(trades)
        .where(eq(trades.orderId, parent.id));
      const net = floorToStep(executed.sub(dec(f?.fee ?? '0')), sym.step);
      const [bal] = await tx
        .select()
        .from(balances)
        .where(and(eq(balances.userId, parent.userId), eq(balances.account, 'SPOT'), eq(balances.asset, sym.row.baseAsset)))
        .for('update');
      // The user may have sold part of a partial fill meanwhile: protect only what is still there.
      qty = minDec(net, floorToStep(bal ? dec(bal.available) : ZERO, sym.step));
      skip = checkQuantity(sym.rules, qty) ?? (tp ? checkNotional(sym.rules, qty.mul(tp)) : null) ?? (sl ? checkNotional(sym.rules, qty.mul(slLimit ?? sl)) : null);
    }

    let next: TpSlData;
    if (skip) {
      next = { ...t, state: 'SKIPPED', skippedReason: skip };
      // A BUY canceled before any fill needs no TP/SL — no notification for that.
      if (skip !== 'PARENT_NOT_FILLED') {
        await this.notifications.create(tx, out, parent.userId, { type: 'TPSL_SKIPPED', orderId: String(parent.id), symbol: parent.symbol, reason: skip });
      }
    } else {
      let listId: number | null = null;
      let childIds: number[];
      if (tp && sl) {
        const r = await this.createOco(tx, out, { userId: parent.userId, sym, side: 'SELL', qty, price: tp, stop: sl, stopLimit: slLimit, parentOrderId: parent.id, clientListId: `tpsl-${parent.id}` });
        listId = r.list.id;
        childIds = r.legs.map((l) => l.id);
      } else {
        const common = { userId: parent.userId, symbol: parent.symbol, side: 'SELL' as const, status: 'NEW' as const, quantity: fx(qty), parentOrderId: parent.id };
        const child = tp
          ? await this.insertLocked(tx, out, { ...common, clientOrderId: `tpsl-${parent.id}-tp`, type: 'LIMIT', timeInForce: 'GTC', price: fx(tp) }, sym.row.baseAsset, qty)
          : await this.insertLocked(
              tx,
              out,
              {
                ...common,
                clientOrderId: `tpsl-${parent.id}-sl`,
                type: slLimit ? 'STOP_LIMIT' : 'STOP_MARKET',
                timeInForce: slLimit ? 'GTC' : null,
                price: fxn(slLimit),
                stopPrice: fx(sl!),
                triggerState: 'WAITING',
                triggerDirection: 'DOWN',
              },
              sym.row.baseAsset,
              qty,
            );
        childIds = [child.id];
      }
      next = { ...t, state: 'PLACED', childOrderListId: listId === null ? null : String(listId), childOrderIds: childIds.map(String) };
      await this.notifications.create(tx, out, parent.userId, {
        type: 'TPSL_PLACED',
        orderId: String(parent.id),
        symbol: parent.symbol,
        quantity: fx(qty),
        orderListId: next.childOrderListId,
        childOrderIds: next.childOrderIds,
      });
    }
    const [updated] = await tx.update(orders).set({ tpsl: next, updatedAt: this.now() }).where(eq(orders.id, parent.id)).returning();
    return out.order(updated!);
  }

  // ═════════════════════════════ cancel

  /** Locks an order — and, for an OCO leg, every leg of its list — in id order (deadlock-free). */
  private async lockGroup(tx: Tx, orderId: number, userId?: string): Promise<OrderRow[]> {
    const [meta] = await tx.select({ userId: orders.userId, orderListId: orders.orderListId }).from(orders).where(eq(orders.id, orderId));
    if (!meta || (userId && meta.userId !== userId)) return [];
    if (meta.orderListId !== null) {
      return tx.select().from(orders).where(eq(orders.orderListId, meta.orderListId)).orderBy(asc(orders.id)).for('update');
    }
    return tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
  }

  private async cancelLegs(tx: Tx, out: Outcome, legs: OrderRow[], reason: OrderRow['closeReason']): Promise<void> {
    const listId = legs[0]?.orderListId ?? null;
    for (const leg of legs) if (isOpen(leg.status)) await this.releaseAndClose(tx, out, leg, 'CANCELED', reason);
    if (listId !== null) {
      await tx.update(orderLists).set({ listStatus: 'ALL_DONE', updatedAt: this.now() }).where(eq(orderLists.id, listId));
      out.listIds.add(listId);
    }
  }

  /** Cancels an order; canceling one OCO leg cancels the whole list. */
  async cancelOrder(userId: string, orderId: string, reason: OrderRow['closeReason'] = 'USER_CANCELED'): Promise<OrderRow> {
    const id = Number(orderId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new AppError('NOT_FOUND', 'Order not found');
    let result: OrderRow | undefined;
    await this.commit(async (tx, out) => {
      const group = await this.lockGroup(tx, id, userId);
      const order = group.find((o) => o.id === id);
      if (!order) throw new AppError('NOT_FOUND', 'Order not found');
      if (!isOpen(order.status)) throw new AppError('ORDER_NOT_CANCELABLE', `Order is ${order.status}`);
      if (order.source !== 'USER' && reason === 'USER_CANCELED') throw new AppError('ORDER_NOT_CANCELABLE', 'This order belongs to a bot — stop the bot instead', { source: order.source });
      await this.cancelLegs(tx, out, group, reason);
      result = out.orders.get(id);
    });
    return result!;
  }

  async cancelOrderList(userId: string, listId: string): Promise<number> {
    const id = Number(listId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new AppError('NOT_FOUND', 'Order list not found');
    const [leg] = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.orderListId, id), eq(orders.userId, userId)))
      .limit(1);
    if (!leg) throw new AppError('NOT_FOUND', 'Order list not found');
    await this.commit(async (tx, out) => {
      const group = await this.lockGroup(tx, leg.id, userId);
      if (!group.some((o) => isOpen(o.status))) throw new AppError('ORDER_NOT_CANCELABLE', 'Order list is already done');
      await this.cancelLegs(tx, out, group, 'USER_CANCELED');
    });
    return id;
  }

  async cancelAll(userId: string, symbol?: string, reason: OrderRow['closeReason'] = 'USER_CANCELED'): Promise<OrderRow[]> {
    const where = [eq(orders.userId, userId), inArray(orders.status, [...OPEN_STATUSES])];
    // the user's "cancel all" leaves bot orders alone (admin/bot reasons cancel everything)
    if (reason === 'USER_CANCELED') where.push(eq(orders.source, 'USER'));
    if (symbol) where.push(eq(orders.symbol, symbol));
    const open = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(...where))
      .orderBy(asc(orders.id));
    const canceled = new Map<number, OrderRow>();
    for (const o of open) {
      if (canceled.has(o.id)) continue;
      try {
        await this.commit(async (tx, out) => {
          const group = await this.lockGroup(tx, o.id, userId);
          if (!group.some((g) => g.id === o.id && isOpen(g.status))) return;
          await this.cancelLegs(tx, out, group, reason);
          for (const c of out.orders.values()) if (c.status === 'CANCELED') canceled.set(c.id, c);
        });
      } catch (err) {
        if (!(err instanceof AppError && err.code === 'ORDER_NOT_CANCELABLE')) throw err;
      }
    }
    return [...canceled.values()];
  }

  // ═════════════════════════════ matcher hooks (single matcher process)

  /**
   * Fills the remaining quantity of a working limit at its price (maker).
   * Idempotent: null when the order is no longer a working limit (filled, canceled, replayed event).
   */
  async fillResting(orderId: number, eventAt: Date): Promise<OrderResult | null> {
    return this.commit(async (tx, out) => {
      const order = (await this.lockGroup(tx, orderId)).find((o) => o.id === orderId);
      if (!order || !isOpen(order.status)) return null;
      if (!(order.type === 'LIMIT' || (order.type === 'STOP_LIMIT' && order.triggerState === 'TRIGGERED'))) return null;
      const sym = this.config.findSymbol(order.symbol);
      if (!sym) return null;
      const remaining = dec(order.quantity!).sub(dec(order.executedQty));
      if (remaining.lte(0)) return null;
      const r = await this.settleFills(tx, out, order, sym, [{ price: dec(order.price!), qty: remaining }], 'MAKER', eventAt);
      await this.notifyDone(tx, out, r.order);
      return r;
    });
  }

  /**
   * A waiting stop / trailing stop reached its trigger: STOP_LIMIT becomes a working limit,
   * STOP_MARKET / TRAILING execute against the visible book (the rest expires).
   * Idempotent: null when it is no longer waiting.
   */
  async triggerStop(orderId: number, lastPrice: Dec, eventAt: Date): Promise<OrderResult | null> {
    return this.commit(async (tx, out) => {
      const group = await this.lockGroup(tx, orderId);
      let order = group.find((o) => o.id === orderId);
      if (!order || !isOpen(order.status) || order.triggerState !== 'WAITING') return null;
      const sym = this.config.findSymbol(order.symbol);
      if (!sym) return null;
      if (order.orderListId !== null) await this.finishList(tx, out, order.orderListId, order.id, true);
      [order] = await tx.update(orders).set({ triggerState: 'TRIGGERED', triggeredAt: eventAt, updatedAt: this.now() }).where(eq(orders.id, orderId)).returning();
      out.order(order!);
      await this.notifications.create(tx, out, order!.userId, {
        type: 'STOP_TRIGGERED',
        orderId: String(order!.id),
        symbol: order!.symbol,
        side: order!.side,
        orderType: order!.type,
        stopPrice: fx(dec(order!.stopPrice!)),
        lastPrice: fx(lastPrice),
      });

      let r: OrderResult;
      if (order!.type === 'STOP_LIMIT') {
        r = await this.takeAsLimit(tx, out, order!, sym);
      } else {
        const target: WalkTarget = order!.quantity !== null ? { kind: 'base', qty: dec(order!.quantity).sub(dec(order!.executedQty)) } : { kind: 'quote', amount: dec(order!.lockedAmount) };
        const walk = walkBook(order!.side, this.market.bookSide(order!.symbol, order!.side), target, sym.step);
        r = { order: order!, trades: [] };
        if (walk.executedQty.gt(0)) r = await this.settleFills(tx, out, order!, sym, walk.fills, 'TAKER', eventAt, walk.complete);
        if (isOpen(r.order.status)) r.order = await this.releaseAndClose(tx, out, r.order, 'EXPIRED', 'IOC_REMAINDER');
      }
      await this.notifyDone(tx, out, r.order);
      return r;
    });
  }

  private async notifyDone(tx: Tx, out: Outcome, o: OrderRow): Promise<void> {
    const base = { orderId: String(o.id), symbol: o.symbol, side: o.side, orderType: o.type, executedQty: fx(dec(o.executedQty)) };
    if (o.status === 'FILLED') {
      const avg = dec(o.cumulativeQuoteQty).div(dec(o.executedQty));
      await this.notifications.create(tx, out, o.userId, { type: 'ORDER_FILLED', ...base, avgPrice: fx(avg) });
    } else if (o.status === 'EXPIRED') {
      await this.notifications.create(tx, out, o.userId, { type: 'ORDER_EXPIRED', ...base, reason: o.closeReason ?? 'IOC_REMAINDER' });
    }
  }

  /** Persists a moved trailing reference / trigger level (only while still waiting). */
  async updateTrailing(orderId: number, reference: Dec, stopPrice: Dec): Promise<void> {
    await this.commit(async (tx, out) => {
      const [row] = await tx
        .update(orders)
        .set({ trailingReferencePrice: fx(reference), stopPrice: fx(stopPrice), updatedAt: this.now() })
        .where(and(eq(orders.id, orderId), inArray(orders.status, [...OPEN_STATUSES]), eq(orders.triggerState, 'WAITING')))
        .returning();
      if (row) out.order(row);
    });
  }

  /** Rebuilds the in-memory index from the DB (server start). */
  async loadOpenOrders(): Promise<number> {
    this.index.clear();
    const rows = await this.db.select().from(orders).where(inArray(orders.status, [...OPEN_STATUSES]));
    for (const r of rows) this.index.sync(r);
    return this.index.size();
  }
}
