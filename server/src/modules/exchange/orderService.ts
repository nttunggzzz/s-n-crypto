import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import type { PlaceOrderRequest } from '@cex/contracts';
import {
  AMOUNT_SCALE,
  checkNotional,
  checkPrice,
  checkQuantity,
  dec,
  hasAtMostScale,
  roundUp,
  toFixedStr,
  walkBook,
  ZERO,
  type Dec,
  type Fill,
  type WalkTarget,
} from '@cex/core';
import { OPEN_STATUSES, orders, trades } from '../../db/schema.ts';
import type { Db, Tx } from '../../db/client.ts';
import { AppError, isUniqueViolation } from '../../lib/errors.ts';
import type { MarketDataService } from '../market/marketData.ts';
import { applyBalanceChanges, type BalanceChange, type BalanceState } from './ledger.ts';
import type { ExchangeConfig, LoadedSymbol } from './exchangeConfig.ts';
import type { ExchangeEvents, OrderRow, TradeRow } from './events.ts';
import type { OpenOrderIndex } from './openOrderIndex.ts';

export type PlaceOrderInput = z.output<typeof PlaceOrderRequest>;

export interface OrderResult {
  order: OrderRow;
  trades: TradeRow[];
  balances: BalanceState[];
}

const isOpen = (status: string) => (OPEN_STATUSES as readonly string[]).includes(status);

function ruleError(v: string | null): void {
  if (v) throw new AppError(v as AppError['code']);
}

export class OrderService {
  constructor(
    private readonly db: Db,
    private readonly config: ExchangeConfig,
    private readonly market: MarketDataService,
    private readonly events: ExchangeEvents,
    private readonly index: OpenOrderIndex,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ───────────────────────────── place

  async placeOrder(userId: string, input: PlaceOrderInput): Promise<OrderResult> {
    const sym = this.config.requireTradable(input.symbol);
    if (!this.market.isLive(input.symbol)) {
      throw new AppError('MARKET_DATA_STALE', `Market data for ${input.symbol} is not live; trading paused`);
    }
    const clientOrderId = input.clientOrderId ?? randomUUID().replace(/-/g, '');
    // Phase 2 order types are declared in the contract; the engine lands in the next commit.
    if ((input.type !== 'MARKET' && input.type !== 'LIMIT') || ('tpsl' in input && input.tpsl)) {
      throw new AppError('VALIDATION_ERROR', `${input.type} / TP-SL is not available yet`);
    }
    try {
      const result = input.type === 'MARKET' ? await this.placeMarket(userId, sym, input, clientOrderId) : await this.placeLimit(userId, sym, input, clientOrderId);
      if (isOpen(result.order.status)) this.index.add(result.order);
      this.events.publish({ orders: [result.order], trades: result.trades, balances: result.balances });
      return result;
    } catch (err) {
      if (isUniqueViolation(err, 'orders_client_id_uq')) throw new AppError('DUPLICATE_CLIENT_ORDER_ID', 'clientOrderId already used');
      throw err;
    }
  }

  private async placeMarket(
    userId: string,
    sym: LoadedSymbol,
    input: Extract<PlaceOrderInput, { type: 'MARKET' }>,
    clientOrderId: string,
  ): Promise<OrderResult> {
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

    const walk = walkBook(input.side, this.market.bookSide(sym.row.symbol, input.side), target, sym.step);
    if (walk.executedQty.isZero()) {
      throw new AppError(target.kind === 'quote' ? 'QUANTITY_TOO_SMALL' : 'INSUFFICIENT_LIQUIDITY');
    }
    if (!walk.complete) throw new AppError('INSUFFICIENT_LIQUIDITY', 'Order book is not deep enough for this order');
    ruleError(checkQuantity(sym.rules, walk.executedQty));
    ruleError(checkNotional(sym.rules, walk.quoteQty));

    return this.db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          userId,
          clientOrderId,
          symbol: sym.row.symbol,
          side: input.side,
          type: 'MARKET',
          timeInForce: null,
          status: 'NEW',
          quantity: input.quantity ?? null,
          quoteOrderQty: input.quoteOrderQty ?? null,
        })
        .returning();
      return this.settleFills(tx, order!, sym, walk.fills, 'TAKER', this.now());
    });
  }

  private async placeLimit(
    userId: string,
    sym: LoadedSymbol,
    input: Extract<PlaceOrderInput, { type: 'LIMIT' }>,
    clientOrderId: string,
  ): Promise<OrderResult> {
    const price = dec(input.price);
    const qty = dec(input.quantity);
    ruleError(checkPrice(sym.rules, price));
    ruleError(checkQuantity(sym.rules, qty));
    ruleError(checkNotional(sym.rules, qty.mul(price)));

    const lockAsset = input.side === 'BUY' ? sym.row.quoteAsset : sym.row.baseAsset;
    const lockAmount = input.side === 'BUY' ? qty.mul(price) : qty;

    // Marketable on arrival? Then it takes liquidity up to its limit, the rest rests on the book.
    const best = input.side === 'BUY' ? this.market.bestAsk(sym.row.symbol) : this.market.bestBid(sym.row.symbol);
    const marketable = best !== null && (input.side === 'BUY' ? best.lte(price) : best.gte(price));
    const walk = marketable ? walkBook(input.side, this.market.bookSide(sym.row.symbol, input.side), { kind: 'base', qty }, sym.step, price) : null;

    return this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(orders)
        .values({
          userId,
          clientOrderId,
          symbol: sym.row.symbol,
          side: input.side,
          type: 'LIMIT',
          timeInForce: input.timeInForce,
          status: 'NEW',
          price: toFixedStr(price),
          quantity: toFixedStr(qty),
          lockedAsset: lockAsset,
          lockedAmount: toFixedStr(lockAmount),
        })
        .returning();
      let order = inserted!;
      const lockBalances = await applyBalanceChanges(tx, [
        {
          userId,
          asset: lockAsset,
          type: 'ORDER_LOCK',
          deltaAvailable: lockAmount.neg(),
          deltaLocked: lockAmount,
          refType: 'ORDER',
          refId: String(order.id),
        },
      ]);
      let tradeRows: TradeRow[] = [];
      const balanceMap = new Map<string, BalanceState>();
      for (const b of lockBalances.values()) balanceMap.set(`${b.userId}|${b.asset}`, b);

      if (walk && walk.executedQty.gt(0)) {
        const settled = await this.settleFills(tx, order, sym, walk.fills, 'TAKER', this.now());
        order = settled.order;
        tradeRows = settled.trades;
        for (const b of settled.balances) balanceMap.set(`${b.userId}|${b.asset}`, b);
      }

      if (order.timeInForce === 'IOC' && isOpen(order.status)) {
        const released = await this.releaseAndClose(tx, order, 'EXPIRED');
        order = released.order;
        for (const b of released.balances) balanceMap.set(`${b.userId}|${b.asset}`, b);
      }
      return { order, trades: tradeRows, balances: [...balanceMap.values()] };
    });
  }

  // ───────────────────────────── settle

  /**
   * Applies fills to an order inside `tx`: inserts trades, moves balances through the ledger,
   * updates executed quantities and status. Caller must hold the order row (fresh insert or FOR UPDATE).
   */
  private async settleFills(tx: Tx, order: OrderRow, sym: LoadedSymbol, fills: Fill[], liquidity: 'MAKER' | 'TAKER', eventAt: Date): Promise<OrderResult> {
    const feeRate = this.config.feeRate;
    const isBuy = order.side === 'BUY';
    const base = sym.row.baseAsset;
    const quote = sym.row.quoteAsset;
    const feeAsset = isBuy ? base : quote;
    const ref = { refType: 'ORDER' as const, refId: String(order.id) };

    let qtySum = ZERO;
    let quoteSum = ZERO;
    let feeSum = ZERO;
    const tradeValues: (typeof trades.$inferInsert)[] = [];
    for (const f of fills) {
      if (f.qty.lte(0)) continue;
      const quoteQty = f.qty.mul(f.price);
      const fee = roundUp(isBuy ? f.qty.mul(feeRate) : quoteQty.mul(feeRate));
      qtySum = qtySum.add(f.qty);
      quoteSum = quoteSum.add(quoteQty);
      feeSum = feeSum.add(fee);
      tradeValues.push({
        orderId: order.id,
        userId: order.userId,
        symbol: order.symbol,
        side: order.side,
        price: toFixedStr(f.price),
        quantity: toFixedStr(f.qty),
        quoteQty: toFixedStr(quoteQty),
        fee: toFixedStr(fee),
        feeAsset,
        liquidity,
        marketEventAt: eventAt,
      });
    }
    if (qtySum.isZero()) throw new Error(`settleFills called with no quantity for order ${order.id}`);

    const changes: BalanceChange[] = [];
    let lockedAfter = dec(order.lockedAmount);
    if (order.type === 'LIMIT') {
      const limit = dec(order.price!);
      if (isBuy) {
        const release = qtySum.mul(limit);
        changes.push({ userId: order.userId, asset: quote, type: 'TRADE_DEBIT', deltaLocked: quoteSum.neg(), ...ref });
        const refund = release.sub(quoteSum);
        if (refund.gt(0)) changes.push({ userId: order.userId, asset: quote, type: 'ORDER_UNLOCK', deltaLocked: refund.neg(), deltaAvailable: refund, ...ref });
        lockedAfter = lockedAfter.sub(release);
      } else {
        changes.push({ userId: order.userId, asset: base, type: 'TRADE_DEBIT', deltaLocked: qtySum.neg(), ...ref });
        lockedAfter = lockedAfter.sub(qtySum);
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
    }
    const balanceState = await applyBalanceChanges(tx, changes);
    const insertedTrades = await tx.insert(trades).values(tradeValues).returning();

    const executed = dec(order.executedQty).add(qtySum);
    const cumQuote = dec(order.cumulativeQuoteQty).add(quoteSum);
    const fullyFilled = order.type === 'MARKET' || (order.quantity !== null && executed.eq(dec(order.quantity)));
    if (order.quantity !== null && executed.gt(dec(order.quantity))) throw new Error(`order ${order.id} overfilled`);
    if (lockedAfter.lt(0) || (fullyFilled && order.type === 'LIMIT' && !lockedAfter.isZero())) {
      throw new Error(`order ${order.id} lock accounting broken: lockedAfter=${lockedAfter.toString()}`);
    }
    const [updated] = await tx
      .update(orders)
      .set({
        executedQty: toFixedStr(executed),
        cumulativeQuoteQty: toFixedStr(cumQuote),
        lockedAmount: toFixedStr(lockedAfter),
        status: fullyFilled ? 'FILLED' : 'PARTIALLY_FILLED',
        updatedAt: this.now(),
      })
      .where(eq(orders.id, order.id))
      .returning();
    return { order: updated!, trades: insertedTrades, balances: [...balanceState.values()] };
  }

  /** Unlocks whatever the order still reserves and moves it to a final status. */
  private async releaseAndClose(tx: Tx, order: OrderRow, status: 'CANCELED' | 'EXPIRED'): Promise<{ order: OrderRow; balances: BalanceState[] }> {
    const locked = dec(order.lockedAmount);
    let balanceList: BalanceState[] = [];
    if (locked.gt(0) && order.lockedAsset) {
      const state = await applyBalanceChanges(tx, [
        {
          userId: order.userId,
          asset: order.lockedAsset,
          type: 'ORDER_UNLOCK',
          deltaLocked: locked.neg(),
          deltaAvailable: locked,
          refType: 'ORDER',
          refId: String(order.id),
        },
      ]);
      balanceList = [...state.values()];
    }
    const [updated] = await tx
      .update(orders)
      .set({ status, lockedAmount: '0', updatedAt: this.now() })
      .where(eq(orders.id, order.id))
      .returning();
    return { order: updated!, balances: balanceList };
  }

  // ───────────────────────────── cancel

  async cancelOrder(userId: string, orderId: string): Promise<OrderRow> {
    const id = Number(orderId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new AppError('NOT_FOUND', 'Order not found');
    const result = await this.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.userId, userId)))
        .for('update');
      if (!order) throw new AppError('NOT_FOUND', 'Order not found');
      if (!isOpen(order.status)) throw new AppError('ORDER_NOT_CANCELABLE', `Order is ${order.status}`);
      return this.releaseAndClose(tx, order, 'CANCELED');
    });
    this.index.remove(result.order.symbol, result.order.id);
    this.events.publish({ orders: [result.order], balances: result.balances });
    return result.order;
  }

  async cancelAll(userId: string, symbol?: string): Promise<OrderRow[]> {
    const where = [eq(orders.userId, userId), inArray(orders.status, [...OPEN_STATUSES])];
    if (symbol) where.push(eq(orders.symbol, symbol));
    const open = await this.db.select({ id: orders.id }).from(orders).where(and(...where)).orderBy(asc(orders.id));
    const canceled: OrderRow[] = [];
    for (const o of open) {
      try {
        canceled.push(await this.cancelOrder(userId, String(o.id)));
      } catch (err) {
        // Filled or canceled in the meantime: not an error for "cancel all".
        if (!(err instanceof AppError && err.code === 'ORDER_NOT_CANCELABLE')) throw err;
      }
    }
    return canceled;
  }

  // ───────────────────────────── matching (called by the Matcher only)

  /**
   * Fills the remaining quantity of a resting LIMIT order at its limit price (maker).
   * Idempotent: returns null if the order is no longer open (filled, canceled, replayed event).
   */
  async fillResting(orderId: number, eventAt: Date): Promise<OrderResult | null> {
    const result = await this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
      if (!order || !isOpen(order.status) || order.type !== 'LIMIT') return null;
      const sym = this.config.findSymbol(order.symbol);
      if (!sym) return null;
      const remaining = dec(order.quantity!).sub(dec(order.executedQty));
      if (remaining.lte(0)) return null;
      return this.settleFills(tx, order, sym, [{ price: dec(order.price!), qty: remaining }], 'MAKER', eventAt);
    });
    if (result) {
      if (!isOpen(result.order.status)) this.index.remove(result.order.symbol, result.order.id);
      this.events.publish({ orders: [result.order], trades: result.trades, balances: result.balances });
    }
    return result;
  }

  /** Rebuilds the in-memory index from the DB (server start). */
  async loadOpenOrders(): Promise<number> {
    this.index.clear();
    const rows = await this.db
      .select()
      .from(orders)
      .where(and(inArray(orders.status, [...OPEN_STATUSES]), eq(orders.type, 'LIMIT')));
    for (const r of rows) this.index.add(r);
    return rows.length;
  }
}
