import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { GridBot, GridPreview } from '@cex/contracts';
import { ZERO, ceilToStep, dec, floorToStep, maxDec, minDec, toFixedStr, type Dec } from '@cex/core';
import { gridBotCells, gridBots, notifications, OPEN_STATUSES, orders, trades } from '../../db/schema.ts';
import type { Db, Tx } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import { logger } from '../../logger.ts';
import type { Exchange } from '../exchange/index.ts';
import { getBalances } from '../exchange/ledger.ts';
import type { LoadedSymbol } from '../exchange/exchangeConfig.ts';
import type { MarketDataService } from '../market/marketData.ts';
import type { BotsEvents } from './events.ts';

export type BotRow = typeof gridBots.$inferSelect;
type CellRow = typeof gridBotCells.$inferSelect;
type OrderRow = typeof orders.$inferSelect;

export const MAX_RUNNING_GRIDS = 5;
/** Placement errors that will go away by themselves: retry on the next sweep instead of stopping. */
const TRANSIENT = new Set(['MARKET_DATA_STALE', 'TRADING_HALTED', 'RATE_LIMITED', 'INTERNAL_ERROR']);
const ONE = dec('1');

export interface GridParams {
  symbol: string;
  lowerPrice: string;
  upperPrice: string;
  gridCount: number;
  mode: 'ARITHMETIC' | 'GEOMETRIC';
  investment: string;
}

interface GridPlan {
  sym: LoadedSymbol;
  last: Dec;
  levels: Dec[];
  cells: { idx: number; buy: Dec; sell: Dec; side: 'BUY' | 'SELL' }[];
  q: Dec;
  nBuy: number;
  nSell: number;
  initialBuy: Dec;
  profitMin: Dec;
  profitMax: Dec;
  minInvestment: Dec;
}

const invalid = (message: string, details?: Record<string, unknown>) => new AppError('INVALID_GRID', message, details);

/**
 * Spot grid bot. Cell i = band [L_i, L_i+1]: it either holds quote and rests a BUY at L_i, or holds
 * base and rests a SELL at L_i+1. A filled BUY becomes a SELL one cell-step up and vice versa; each
 * completed BUY→SELL round books its profit (extracted to the bot's free quote).
 *
 * All orders are normal spot orders (source GRID) through OrderService, so balances, locks, fees and
 * reconciliation are exactly the spot rules. `sync(bot)` makes the cells match the real orders and is
 * safe to repeat: it runs after every bot order event and on a periodic sweep, one bot at a time.
 */
export class GridService {
  private readonly queues = new Map<number, Promise<unknown>>();
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly db: Db,
    private readonly ex: Exchange,
    private readonly market: MarketDataService,
    private readonly events: BotsEvents,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** React to the bot's own order events (fills, cancels). */
  attach(): void {
    this.ex.events.on('order', (_userId, o) => {
      if (o.source === 'GRID' && o.sourceId !== null && o.status !== 'NEW' && o.status !== 'PARTIALLY_FILLED') void this.enqueue(o.sourceId, () => this.sync(o.sourceId!));
    });
  }

  start(sweepMs = 15_000): void {
    this.attach();
    this.timer = setInterval(() => void this.sweep().catch((err) => logger.error({ err }, 'grid sweep failed')), sweepMs);
    this.timer.unref();
  }

  /** Stops the periodic sweep (server shutdown). */
  shutdown(): void {
    clearInterval(this.timer);
  }

  /** Waits until every queued bot task is done (tests). */
  async idle(): Promise<void> {
    while (this.queues.size) await Promise.all([...this.queues.values()]);
  }

  private enqueue<T>(botId: number, task: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(botId) ?? Promise.resolve();
    const next = prev.then(task, task);
    const tracked = next.catch((err) => logger.error({ err, botId }, 'grid task failed')).finally(() => {
      if (this.queues.get(botId) === tracked) this.queues.delete(botId);
    });
    this.queues.set(botId, tracked);
    return next;
  }

  // ───────────────────────────── plan / preview

  private plan(p: GridParams): GridPlan {
    const sym = this.ex.config.requireTradable(p.symbol);
    if (sym.row.quoteAsset !== 'USDT') throw invalid('Grid bots trade USDT pairs');
    const last = this.market.livePrice(p.symbol);
    if (!last) throw new AppError('MARKET_DATA_STALE', `No live price for ${p.symbol}`);
    const lower = dec(p.lowerPrice);
    const upper = dec(p.upperPrice);
    const investment = dec(p.investment);
    if (!lower.lt(upper)) throw invalid('lowerPrice must be below upperPrice');
    if (!(lower.lt(last) && last.lt(upper))) throw invalid('The current price must be inside the range', { lastPrice: last.toFixed() });
    if (investment.decimalPlaces() > 8) throw invalid('investment allows at most 8 decimals');
    const n = p.gridCount;
    const tick = sym.tick;
    const levels: Dec[] = [];
    for (let i = 0; i <= n; i++) {
      const raw = p.mode === 'ARITHMETIC' ? lower.add(upper.sub(lower).mul(i).div(n)) : lower.mul(upper.div(lower).pow(dec(String(i)).div(n)));
      levels.push(raw.toNearest(tick, 4)); // ROUND_HALF_UP to the tick
    }
    for (let i = 1; i < levels.length; i++) if (!levels[i]!.gt(levels[i - 1]!)) throw invalid('Too many grids for this range and tick size');
    if (levels[0]!.lte(0)) throw invalid('lowerPrice is too low');
    const cells = levels.slice(0, -1).map((buy, idx) => ({ idx, buy, sell: levels[idx + 1]!, side: buy.lt(last) ? ('BUY' as const) : ('SELL' as const) }));
    const nBuy = cells.filter((c) => c.side === 'BUY').length;
    const nSell = n - nBuy;
    const fee = this.ex.config.feeRate;
    const keep = ONE.sub(fee);
    // Vietnam tax (module T): a SELL leg also pays taxRate of its gross value while withholding is on. Counted for every
    // user (a DOMESTIC_ORG seller is not withheld, so the check is only stricter for them).
    const tax = this.ex.config.tax;
    const keepSell = keep.sub(tax.mode === 'WITHHOLD' ? tax.rate : ZERO);
    // base per cell q: BUY cells reserve q·buy quote, SELL cells need q base bought now at market
    // (paid at the ask, fee taken from the base) — so the bot never spends more than the investment
    const buyRef = maxDec(last, this.market.bestAsk(p.symbol) ?? last);
    const per = cells.filter((c) => c.side === 'BUY').reduce((a, c) => a.add(c.buy), ZERO).add(buyRef.mul(nSell).div(keep));
    const q = floorToStep(investment.div(per), sym.step);
    const minQ = maxDec(dec(sym.row.minQty), ceilToStep(dec(sym.row.minNotional).div(levels[0]!), sym.step));
    const minInvestment = minQ.mul(per).toDecimalPlaces(2, 0);
    if (q.lt(minQ)) throw invalid(`Investment too small: at least ${minInvestment.toFixed()} USDT for this grid`, { minInvestment: minInvestment.toFixed() });
    if (q.gt(dec(sym.row.maxQty))) throw invalid('Quantity per grid above the pair maximum');
    // one round: buy q at `buy` (fee in base) → sell q·keep at `sell`, minus fee and tax of the gross value
    const ratios = cells.map((c) => c.sell.div(c.buy).mul(keep).mul(keepSell).sub(1));
    const profitMin = ratios.reduce((a, r) => minDec(a, r), ratios[0]!);
    const profitMax = ratios.reduce((a, r) => maxDec(a, r), ratios[0]!);
    if (profitMin.lte(0)) throw invalid('The grid spacing is smaller than the fees (and tax): every round would lose money');
    const initialBuy = nSell > 0 ? ceilToStep(q.mul(nSell).div(keep), sym.step) : ZERO;
    return { sym, last, levels, cells, q, nBuy, nSell, initialBuy, profitMin, profitMax, minInvestment };
  }

  preview(p: GridParams): GridPreview {
    const g = this.plan(p);
    return {
      levels: g.levels.map((l) => l.toFixed()),
      lastPrice: g.last.toFixed(),
      quantityPerGrid: g.q.toFixed(),
      buyOrders: g.nBuy,
      sellOrders: g.nSell,
      initialBuyQuantity: g.initialBuy.toFixed(),
      profitPerGridMin: g.profitMin.toDecimalPlaces(6, 1).toFixed(),
      profitPerGridMax: g.profitMax.toDecimalPlaces(6, 1).toFixed(),
      minInvestment: g.minInvestment.toFixed(),
    };
  }

  // ───────────────────────────── lifecycle

  async create(userId: string, p: GridParams): Promise<GridBot> {
    const g = this.plan(p);
    const [running] = await this.db
      .select({ n: count() })
      .from(gridBots)
      .where(and(eq(gridBots.userId, userId), inArray(gridBots.status, ['STARTING', 'RUNNING'])));
    if ((running?.n ?? 0) >= MAX_RUNNING_GRIDS) throw new AppError('LIMIT_EXCEEDED', `At most ${MAX_RUNNING_GRIDS} running grid bots`, { limit: MAX_RUNNING_GRIDS });
    const t = this.now();
    const bot = await this.db.transaction(async (tx) => {
      const [b] = await tx
        .insert(gridBots)
        .values({ userId, symbol: p.symbol, lowerPrice: g.levels[0]!.toFixed(), upperPrice: g.levels.at(-1)!.toFixed(), gridCount: p.gridCount, mode: p.mode, investment: toFixedStr(dec(p.investment)), quantityPerGrid: g.q.toFixed(), status: 'STARTING', createdAt: t, updatedAt: t })
        .returning();
      await tx.insert(gridBotCells).values(g.cells.map((c) => ({ botId: b!.id, idx: c.idx, buyPrice: c.buy.toFixed(), sellPrice: c.sell.toFixed(), side: c.side, quantity: g.q.toFixed() })));
      return b!;
    });
    // what the BUY cells reserve; the rest of the investment (after the initial buy) is the bot's spare quote
    const reserved = g.cells.filter((c) => c.side === 'BUY').reduce((a, c) => a.add(c.buy.mul(g.q)), ZERO);
    const investment = dec(p.investment);
    return this.enqueue(bot.id, async () => {
      try {
        if (g.nSell > 0) {
          // buy the base for the cells above the price, then price each of them at the average cost
          const r = await this.ex.orders.placeOrder(userId, { symbol: p.symbol, side: 'BUY', type: 'MARKET', quantity: g.initialBuy.toFixed(), clientOrderId: `g${bot.id}-init` }, { source: 'GRID', sourceId: bot.id });
          const fee = r.trades.reduce((a, x) => a.add(dec(x.fee)), ZERO);
          const received = dec(r.order.executedQty).sub(fee);
          const avg = dec(r.order.cumulativeQuoteQty).div(received);
          const cost = toFixedStr(avg.mul(g.q).toDecimalPlaces(8, 0));
          await this.db.transaction(async (tx) => {
            await tx.update(gridBotCells).set({ costQuote: cost }).where(and(eq(gridBotCells.botId, bot.id), eq(gridBotCells.side, 'SELL')));
            // freeQuote may dip a hair below 0 (step rounding / slippage of the initial buy): the next rebuy is then slightly smaller
            const freeQuote = investment.sub(reserved).sub(dec(r.order.cumulativeQuoteQty));
            await tx.update(gridBots).set({ freeBase: toFixedStr(received.sub(g.q.mul(g.nSell))), freeQuote: toFixedStr(freeQuote), status: 'RUNNING', updatedAt: this.now() }).where(eq(gridBots.id, bot.id));
          });
        } else {
          await this.db.update(gridBots).set({ freeQuote: toFixedStr(investment.sub(reserved)), status: 'RUNNING', updatedAt: this.now() }).where(eq(gridBots.id, bot.id));
        }
      } catch (err) {
        await this.db.delete(gridBots).where(eq(gridBots.id, bot.id)); // nothing was bought: no trace needed
        throw err;
      }
      await this.sync(bot.id);
      return this.view(bot.id);
    });
  }

  /** Admin stop (reason ADMIN): `audit` runs in the transaction that stops the bot (invariant 13). */
  async adminStop(userId: string, botId: number, sellBase: boolean, audit: (tx: Tx, bot: BotRow) => Promise<unknown>): Promise<GridBot> {
    const b = await this.own(userId, botId);
    if (b.status !== 'RUNNING') throw new AppError('CONFLICT', 'The bot is not running');
    return this.enqueue(botId, async () => {
      if (!(await this.halt(botId, 'STOPPED', 'ADMIN', sellBase, audit))) throw new AppError('CONFLICT', 'The bot is not running');
      return this.view(botId);
    });
  }

  async stop(userId: string, botId: number, sellBase: boolean): Promise<GridBot> {
    const b = await this.own(userId, botId);
    if (b.status !== 'RUNNING') throw new AppError('CONFLICT', 'The bot is not running');
    return this.enqueue(botId, async () => {
      await this.halt(botId, 'STOPPED', 'USER', sellBase);
      return this.view(botId);
    });
  }

  /** Stops a bot: no more placements, cancel its open orders, optionally sell what it holds. false = it was not running. */
  private async halt(botId: number, status: 'STOPPED' | 'ERROR', reason: string, sellBase = false, audit?: (tx: Tx, bot: BotRow) => Promise<unknown>): Promise<boolean> {
    const b = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(gridBots)
        .set({ status, stopReason: reason, stoppedAt: this.now(), updatedAt: this.now() })
        .where(and(eq(gridBots.id, botId), inArray(gridBots.status, ['STARTING', 'RUNNING'])))
        .returning();
      if (row && audit) await audit(tx, row);
      return row;
    });
    if (!b) return false;
    const open = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.source, 'GRID'), eq(orders.sourceId, botId), inArray(orders.status, [...OPEN_STATUSES])));
    for (const o of open) {
      try {
        await this.ex.orders.cancelOrder(b.userId, String(o.id), 'BOT_STOPPED');
      } catch (err) {
        if (!(err instanceof AppError && err.code === 'ORDER_NOT_CANCELABLE')) throw err;
      }
    }
    // what the bot holds once its orders are gone (partial fills included); then sell the base or value it
    const held = await this.holdings(b.id, b);
    const sold = sellBase ? await this.sellHoldings(b, held.base) : { qty: ZERO, net: ZERO };
    const left = held.base.sub(sold.qty);
    const price = this.market.livePrice(b.symbol);
    const finalValue = left.isZero() ? held.quote.add(sold.net) : price ? held.quote.add(sold.net).add(left.mul(price)) : null;
    await this.db
      .update(gridBots)
      .set({ finalValue: finalValue === null ? null : toFixedStr(finalValue.toDecimalPlaces(8, 1)) })
      .where(eq(gridBots.id, botId));
    const [row] = await this.db
      .insert(notifications)
      .values({ userId: b.userId, type: 'GRID_BOT_STOPPED', payload: { botId: String(botId), symbol: b.symbol, reason, gridProfit: toFixedStr(dec(b.gridProfit)) } })
      .returning();
    this.events.emit('notification', b.userId, row!);
    this.events.emit('gridBot', b.userId, await this.view(botId));
    return true;
  }

  /** Market-sells the bot's base (never more than the wallet has free). Returns the base sold and the quote received. */
  private async sellHoldings(b: BotRow, held: Dec): Promise<{ qty: Dec; net: Dec }> {
    const none = { qty: ZERO, net: ZERO };
    const sym = this.ex.config.findSymbol(b.symbol);
    if (!sym) return none;
    const [bal] = await getBalances(this.db, b.userId, [sym.row.baseAsset]);
    const qty = floorToStep(minDec(held, bal ? dec(bal.available) : ZERO), sym.step);
    if (qty.lt(dec(sym.row.minQty))) return none;
    try {
      const r = await this.ex.orders.placeOrder(b.userId, { symbol: b.symbol, side: 'SELL', type: 'MARKET', quantity: qty.toFixed(), clientOrderId: `g${b.id}-close` }, { source: 'GRID', sourceId: b.id });
      const paid = r.trades.reduce((a, x) => a.add(dec(x.fee)).add(dec(x.tax)), ZERO);
      return { qty: dec(r.order.executedQty), net: dec(r.order.cumulativeQuoteQty).sub(paid) };
    } catch (err) {
      logger.warn({ err, botId: b.id }, 'grid stop: could not sell the base');
      return none;
    }
  }

  // ───────────────────────────── sync

  /** Every running bot (the periodic safety net for missed events / transient errors). */
  async sweep(): Promise<void> {
    const running = await this.db.select({ id: gridBots.id }).from(gridBots).where(eq(gridBots.status, 'RUNNING'));
    await Promise.all(running.map((b) => this.enqueue(b.id, () => this.sync(b.id))));
  }

  /** Makes the bot's cells match the real orders: book filled orders, place missing ones. */
  async sync(botId: number): Promise<void> {
    const [b] = await this.db.select().from(gridBots).where(eq(gridBots.id, botId));
    if (!b || b.status !== 'RUNNING') return;
    const sym = this.ex.config.findSymbol(b.symbol);
    if (!sym) return void (await this.halt(botId, 'ERROR', 'SYMBOL_REMOVED'));
    const cells = await this.db.select().from(gridBotCells).where(eq(gridBotCells.botId, botId)).orderBy(asc(gridBotCells.idx));
    let changed = false;
    for (const cell of cells) {
      if (cell.orderId !== null) {
        const [o] = await this.db.select().from(orders).where(eq(orders.id, cell.orderId));
        if (!o || o.status === 'NEW' || o.status === 'PARTIALLY_FILLED') continue;
        if (o.status === 'FILLED') {
          await this.book(b, cell, o, sym);
          changed = true;
        } else {
          // canceled / expired by someone else than the bot (admin, account reset…)
          return void (await this.halt(botId, 'ERROR', o.closeReason === 'ADMIN' ? 'ADMIN' : 'ORDER_CANCELED'));
        }
      }
    }
    const fresh = await this.db.select().from(gridBotCells).where(eq(gridBotCells.botId, botId)).orderBy(asc(gridBotCells.idx));
    for (const cell of fresh) {
      if (cell.orderId !== null) continue;
      const placed = await this.place(b, cell);
      if (placed === 'stop') return;
      if (placed) changed = true;
    }
    if (changed) this.events.emit('gridBot', b.userId, await this.view(botId));
  }

  /** A cell's order filled: switch the cell to the other side (and book a round on a SELL). */
  private async book(b: BotRow, cell: CellRow, o: OrderRow, sym: LoadedSymbol): Promise<void> {
    const feeRows = await this.db.select({ fee: trades.fee, tax: trades.tax }).from(trades).where(eq(trades.orderId, o.id));
    const fee = feeRows.reduce((a, r) => a.add(dec(r.fee)), ZERO);
    const tax = feeRows.reduce((a, r) => a.add(dec(r.tax)), ZERO); // SELL only (0 on a BUY)
    const q = dec(b.quantityPerGrid);
    await this.db.transaction(async (tx) => {
      const [bot] = await tx.select().from(gridBots).where(eq(gridBots.id, b.id)).for('update');
      const [c] = await tx
        .select()
        .from(gridBotCells)
        .where(and(eq(gridBotCells.botId, b.id), eq(gridBotCells.idx, cell.idx)))
        .for('update');
      if (!bot || !c || c.orderId !== o.id) return; // already booked
      if (o.side === 'BUY') {
        // received base (fee is taken from it); top up from the bot's spare base to keep q per cell
        const received = dec(o.executedQty).sub(fee);
        const pool = received.add(dec(bot.freeBase));
        const sellQty = minDec(q, floorToStep(pool, sym.step));
        // the cell reserved quantity·buy; a fill below the limit leaves the difference to the bot
        const unspent = dec(c.quantity).mul(dec(c.buyPrice)).sub(dec(o.cumulativeQuoteQty));
        await tx.update(gridBotCells).set({ side: 'SELL', quantity: sellQty.toFixed(), costQuote: toFixedStr(dec(o.cumulativeQuoteQty)), orderId: null }).where(and(eq(gridBotCells.botId, b.id), eq(gridBotCells.idx, c.idx)));
        await tx
          .update(gridBots)
          .set({ freeBase: toFixedStr(pool.sub(sellQty)), freeQuote: toFixedStr(dec(bot.freeQuote).add(unspent)), updatedAt: this.now() })
          .where(eq(gridBots.id, b.id));
      } else {
        // received quote (fee and tax are taken from it); keep q·buy for the next BUY, the rest is profit
        const received = dec(o.cumulativeQuoteQty).sub(fee).sub(tax);
        const profit = received.sub(dec(c.costQuote));
        const buy = dec(c.buyPrice);
        const pool = received.add(dec(bot.freeQuote));
        const buyQty = minDec(q, floorToStep(pool.div(buy), sym.step));
        await tx.update(gridBotCells).set({ side: 'BUY', quantity: buyQty.toFixed(), costQuote: '0', orderId: null, rounds: c.rounds + 1, profit: toFixedStr(dec(c.profit).add(profit)) }).where(and(eq(gridBotCells.botId, b.id), eq(gridBotCells.idx, c.idx)));
        await tx
          .update(gridBots)
          .set({ freeQuote: toFixedStr(pool.sub(buyQty.mul(buy))), gridProfit: toFixedStr(dec(bot.gridProfit).add(profit)), completedRounds: bot.completedRounds + 1, updatedAt: this.now() })
          .where(eq(gridBots.id, b.id));
      }
    });
  }

  /** Places the cell's order. true = placed, false = retry later, 'stop' = the bot was stopped. */
  private async place(b: BotRow, cell: CellRow): Promise<boolean | 'stop'> {
    const qty = dec(cell.quantity);
    const price = cell.side === 'BUY' ? cell.buyPrice : cell.sellPrice;
    // deterministic id: a retry after a crash finds the order instead of placing a second one
    const clientOrderId = `g${b.id}-${cell.idx}-${cell.rounds}-${cell.side[0]}`;
    let orderId: number;
    try {
      const r = await this.ex.orders.placeOrder(b.userId, { symbol: b.symbol, side: cell.side, type: 'LIMIT', timeInForce: 'GTC', price: dec(price).toFixed(), quantity: qty.toFixed(), clientOrderId }, { source: 'GRID', sourceId: b.id });
      orderId = r.order.id;
    } catch (err) {
      const code = err instanceof AppError ? err.code : 'INTERNAL_ERROR';
      if (code === 'DUPLICATE_CLIENT_ORDER_ID') {
        const [o] = await this.db
          .select({ id: orders.id })
          .from(orders)
          .where(and(eq(orders.userId, b.userId), eq(orders.clientOrderId, clientOrderId)));
        if (!o) return false;
        orderId = o.id;
      } else if (TRANSIENT.has(code)) {
        return false;
      } else {
        logger.warn({ botId: b.id, cell: cell.idx, code }, 'grid order rejected; stopping the bot');
        await this.halt(b.id, 'ERROR', code);
        return 'stop';
      }
    }
    await this.db
      .update(gridBotCells)
      .set({ orderId })
      .where(and(eq(gridBotCells.botId, b.id), eq(gridBotCells.idx, cell.idx)));
    return true;
  }

  // ───────────────────────────── reads

  private async own(userId: string, botId: number): Promise<BotRow> {
    const [b] = await this.db
      .select()
      .from(gridBots)
      .where(and(eq(gridBots.id, botId), eq(gridBots.userId, userId)));
    if (!b) throw new AppError('NOT_FOUND', 'Bot not found');
    return b;
  }

  async list(userId: string): Promise<GridBot[]> {
    const rows = await this.db.select({ id: gridBots.id }).from(gridBots).where(eq(gridBots.userId, userId)).orderBy(desc(gridBots.id));
    return Promise.all(rows.map((r) => this.view(r.id)));
  }

  async get(userId: string, botId: number): Promise<GridBot> {
    await this.own(userId, botId);
    return this.view(botId);
  }

  async orders(userId: string, botId: number): Promise<OrderRow[]> {
    await this.own(userId, botId);
    const open = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.source, 'GRID'), eq(orders.sourceId, botId), inArray(orders.status, [...OPEN_STATUSES])))
      .orderBy(desc(orders.id));
    const done = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.source, 'GRID'), eq(orders.sourceId, botId)))
      .orderBy(desc(orders.id))
      .limit(100);
    const seen = new Set(open.map((o) => o.id));
    return [...open, ...done.filter((o) => !seen.has(o.id))].slice(0, 100);
  }

  /**
   * What the bot owns: each cell's quote (BUY) or base (SELL) — a linked order's fills already moved part of it
   * to the other asset (net of the fee, and of the tax on a SELL) — plus the spare base/quote.
   */
  private async holdings(botId: number, b: BotRow): Promise<{ base: Dec; quote: Dec }> {
    const cells = await this.db.select().from(gridBotCells).where(eq(gridBotCells.botId, botId));
    const ids = cells.map((c) => c.orderId).filter((x): x is number => x !== null);
    const linked = ids.length ? await this.db.select().from(orders).where(inArray(orders.id, ids)) : [];
    const feeRows = ids.length
      ? await this.db
          .select({ orderId: trades.orderId, fee: sql<string>`sum(${trades.fee})`, tax: sql<string>`sum(${trades.tax})` })
          .from(trades)
          .where(inArray(trades.orderId, ids))
          .groupBy(trades.orderId)
      : [];
    const byId = new Map(linked.map((x) => [x.id, x]));
    const fees = new Map(feeRows.map((r) => [r.orderId, dec(r.fee)]));
    const taxes = new Map(feeRows.map((r) => [r.orderId, dec(r.tax)]));
    let base = dec(b.freeBase);
    let quote = dec(b.freeQuote);
    for (const c of cells) {
      const ord = c.orderId === null ? undefined : byId.get(c.orderId);
      const exec = ord ? dec(ord.executedQty) : ZERO;
      const cum = ord ? dec(ord.cumulativeQuoteQty) : ZERO;
      const fee = (ord && fees.get(ord.id)) ?? ZERO;
      const tax = (ord && taxes.get(ord.id)) ?? ZERO;
      if (c.side === 'BUY') {
        quote = quote.add(dec(c.quantity).mul(dec(c.buyPrice))).sub(cum);
        base = base.add(exec).sub(fee); // a BUY pays its fee in base
      } else {
        base = base.add(dec(c.quantity)).sub(exec);
        quote = quote.add(cum).sub(fee).sub(tax); // a SELL pays its fee and its tax in quote
      }
    }
    return { base, quote };
  }

  async view(botId: number): Promise<GridBot> {
    const [b] = await this.db.select().from(gridBots).where(eq(gridBots.id, botId));
    if (!b) throw new AppError('NOT_FOUND', 'Bot not found');
    const [o] = await this.db
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.source, 'GRID'), eq(orders.sourceId, botId), inArray(orders.status, [...OPEN_STATUSES])));
    const running = b.status === 'RUNNING' || b.status === 'STARTING';
    const { base, quote } = running ? await this.holdings(botId, b) : { base: ZERO, quote: ZERO };
    const price = this.market.livePrice(b.symbol);
    const value = running ? (price ? base.mul(price).add(quote) : null) : b.finalValue === null ? null : dec(b.finalValue);
    return {
      id: String(b.id),
      symbol: b.symbol,
      lowerPrice: dec(b.lowerPrice).toFixed(),
      upperPrice: dec(b.upperPrice).toFixed(),
      gridCount: b.gridCount,
      mode: b.mode,
      investment: toFixedStr(dec(b.investment)),
      quantityPerGrid: dec(b.quantityPerGrid).toFixed(),
      status: b.status === 'STARTING' ? 'RUNNING' : b.status,
      stopReason: b.stopReason,
      gridProfit: toFixedStr(dec(b.gridProfit)),
      completedRounds: b.completedRounds,
      baseHeld: toFixedStr(base),
      quoteHeld: toFixedStr(quote),
      totalValue: value === null ? null : toFixedStr(value.toDecimalPlaces(8, 1)),
      totalPnl: value === null ? null : toFixedStr(value.toDecimalPlaces(8, 1).sub(dec(b.investment))),
      openOrders: o?.n ?? 0,
      createdAt: b.createdAt.toISOString(),
      stoppedAt: b.stoppedAt?.toISOString() ?? null,
    };
  }

  /** Admin account reset: stop every bot of the user (their orders are canceled by the reset). */
  async resetUser(userId: string): Promise<void> {
    const running = await this.db
      .select({ id: gridBots.id })
      .from(gridBots)
      .where(and(eq(gridBots.userId, userId), inArray(gridBots.status, ['STARTING', 'RUNNING'])));
    for (const r of running) await this.enqueue(r.id, () => this.halt(r.id, 'STOPPED', 'ADMIN'));
  }
}
