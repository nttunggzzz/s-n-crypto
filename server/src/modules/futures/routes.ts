import type { Router } from 'express';
import { and, count, desc, eq, gte, inArray, lt, lte, notInArray, type SQL } from 'drizzle-orm';
import { MAX_LEVERAGE, type AdminFuturesSymbol } from '@cex/contracts';
import { dec } from '@cex/core';
import { futuresFundingEvents, futuresOrders, futuresPositions, futuresSymbols, futuresTrades, ledgerEntries, OPEN_STATUSES } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { clientIp, route, type RouteOptions } from '../../lib/http.ts';
import { AppError } from '../../lib/errors.ts';
import { RateLimiter } from '../../lib/rateLimit.ts';
import { writeAudit } from '../admin/audit.ts';
import { idCursor } from '../admin/adminService.ts';
import type { MarketDataService } from '../market/marketData.ts';
import { makePriceOf } from '../exchange/routes.ts';
import { serializeBalance, serializeLedger } from '../exchange/serializers.ts';
import type { Futures } from './index.ts';
import { serializeFuturesOrder, serializeFuturesTrade, serializePosition, type FPositionRow } from './serializers.ts';

type DateCol = typeof futuresOrders.createdAt | typeof futuresTrades.createdAt | typeof futuresPositions.closedAt | typeof ledgerEntries.createdAt;
const range = (col: DateCol, q: { from?: string; to?: string }): SQL[] => [...(q.from ? [gte(col, new Date(q.from))] : []), ...(q.to ? [lte(col, new Date(q.to))] : [])];

function page<T extends { id: number }, R>(rows: T[], limit: number, map: (r: T) => R) {
  const more = rows.length > limit;
  const items = more ? rows.slice(0, limit) : rows;
  return { items: items.map(map), nextCursor: more ? String(items[items.length - 1]!.id) : null };
}

export function registerFuturesRoutes(router: Router, opts: RouteOptions, db: Db, f: Futures, spotMarket: MarketDataService, rateLimitScale = 1): void {
  const { service, config, market, marks } = f;
  const orderLimit = new RateLimiter(10 * rateLimitScale, 1000);
  const known = (symbol: string) => config.get(symbol);
  const position = (p: FPositionRow) => serializePosition(p, config.find(p.symbol), marks.liveMark(p.symbol));

  // ───── market data (public)
  route(router, opts, 'futuresExchangeInfo', async () => ({
    tradingHalted: config.exchange.tradingHalted,
    fees: config.feesInfo(),
    maxLeverage: MAX_LEVERAGE,
    marginModes: ['ISOLATED' as const],
    symbols: config.all().map((c) => config.toInfo(c)),
    serverTime: new Date().toISOString(),
  }));
  route(router, opts, 'futuresTickers', async () => ({
    items: config.all().map((c) => {
      const m = marks.get(c.row.symbol);
      return { ...market.getTicker(c.row.symbol), markPrice: m.markPrice, indexPrice: m.indexPrice, fundingRate: m.fundingRate, nextFundingTime: m.nextFundingTime };
    }),
  }));
  route(router, opts, 'futuresMarkPrice', async ({ params }) => (known(params.symbol), marks.get(params.symbol)));
  route(router, opts, 'futuresDepth', async ({ params, query }) => (known(params.symbol), market.getDepth(params.symbol, Math.min(query.limit, 20))));
  route(router, opts, 'futuresMarketTrades', async ({ params, query }) => {
    known(params.symbol);
    return { symbol: params.symbol, items: market.getTrades(params.symbol, query.limit), status: market.getStatus(params.symbol) };
  });
  route(router, opts, 'futuresCandles', async ({ params, query }) => {
    known(params.symbol);
    return { symbol: params.symbol, interval: query.interval, items: await f.candles.get(params.symbol, query.interval, query.limit, query.endTime) };
  });
  route(router, opts, 'futuresFundingHistory', async ({ params, query }) => {
    known(params.symbol);
    const rows = await db.select().from(futuresFundingEvents).where(eq(futuresFundingEvents.symbol, params.symbol)).orderBy(desc(futuresFundingEvents.fundingTime)).limit(query.limit);
    return { items: rows.map((r) => ({ symbol: r.symbol, fundingTime: r.fundingTime.toISOString(), rate: dec(r.rate).toFixed(), markPrice: dec(r.markPrice).toFixed() })) };
  });
  route(router, opts, 'futuresMarketStatus', async () => market.getMarketStatus());

  // ───── wallet
  route(router, opts, 'futuresAccount', async ({ auth }) => service.account(auth.user.id));
  route(router, opts, 'futuresTransfer', async ({ auth, body }) => {
    orderLimit.consume(`user:${auth.user.id}`);
    const states = await service.transfer(auth.user.id, body.direction, body.amount);
    const spot = states.find((s) => s.account === 'SPOT')!;
    return { spot: serializeBalance('USDT', spot.available, spot.locked, makePriceOf(spotMarket)), futures: await service.account(auth.user.id) };
  });
  route(router, opts, 'futuresLedger', async ({ auth, query }) => {
    const where: SQL[] = [eq(ledgerEntries.userId, auth.user.id), eq(ledgerEntries.account, 'FUTURES'), ...range(ledgerEntries.createdAt, query)];
    if (query.hideLocks === 'true') where.push(notInArray(ledgerEntries.type, ['ORDER_LOCK', 'ORDER_UNLOCK']));
    const c = idCursor(query.cursor);
    if (c) where.push(lt(ledgerEntries.id, c));
    const rows = await db.select().from(ledgerEntries).where(and(...where)).orderBy(desc(ledgerEntries.id)).limit(query.limit + 1);
    return page(rows, query.limit, serializeLedger);
  });

  // ───── leverage
  route(router, opts, 'futuresSymbolSettings', async ({ auth }) => ({ items: await service.settings(auth.user.id) }));
  route(router, opts, 'futuresSetLeverage', async ({ auth, params, body }) => service.setLeverage(auth.user.id, params.symbol, body.leverage));

  // ───── orders
  route(router, opts, 'futuresPlaceOrder', async ({ auth, body }) => {
    orderLimit.consume(`user:${auth.user.id}`);
    return serializeFuturesOrder(await service.placeOrder(auth.user.id, body));
  });
  route(router, opts, 'futuresOpenOrders', async ({ auth, query }) => ({ items: (await service.openOrders(auth.user.id, query.symbol)).map(serializeFuturesOrder) }));
  route(router, opts, 'futuresOrderHistory', async ({ auth, query }) => {
    const where: SQL[] = [eq(futuresOrders.userId, auth.user.id), notInArray(futuresOrders.status, [...OPEN_STATUSES]), ...range(futuresOrders.createdAt, query)];
    if (query.symbol) where.push(eq(futuresOrders.symbol, query.symbol));
    const c = idCursor(query.cursor);
    if (c) where.push(lt(futuresOrders.id, c));
    const rows = await db.select().from(futuresOrders).where(and(...where)).orderBy(desc(futuresOrders.id)).limit(query.limit + 1);
    return page(rows, query.limit, serializeFuturesOrder);
  });
  route(router, opts, 'futuresCancelOrder', async ({ auth, params }) => serializeFuturesOrder(await service.cancelOrder(auth.user.id, params.orderId)));
  route(router, opts, 'futuresCancelAll', async ({ auth, query }) => ({ canceled: (await service.cancelAll(auth.user.id, query.symbol)).map(serializeFuturesOrder) }));
  route(router, opts, 'futuresMyTrades', async ({ auth, query }) => {
    const where: SQL[] = [eq(futuresTrades.userId, auth.user.id), ...range(futuresTrades.createdAt, query)];
    if (query.symbol) where.push(eq(futuresTrades.symbol, query.symbol));
    const c = idCursor(query.cursor);
    if (c) where.push(lt(futuresTrades.id, c));
    const rows = await db.select().from(futuresTrades).where(and(...where)).orderBy(desc(futuresTrades.id)).limit(query.limit + 1);
    return page(rows, query.limit, serializeFuturesTrade);
  });

  // ───── positions
  route(router, opts, 'futuresPositions', async ({ auth }) => ({ items: (await service.openPositions(auth.user.id)).map(position) }));
  route(router, opts, 'futuresPositionHistory', async ({ auth, query }) => {
    const where: SQL[] = [eq(futuresPositions.userId, auth.user.id), eq(futuresPositions.status, 'CLOSED'), ...range(futuresPositions.closedAt, query)];
    if (query.symbol) where.push(eq(futuresPositions.symbol, query.symbol));
    const c = idCursor(query.cursor);
    if (c) where.push(lt(futuresPositions.id, c));
    const rows = await db.select().from(futuresPositions).where(and(...where)).orderBy(desc(futuresPositions.id)).limit(query.limit + 1);
    return page(rows, query.limit, position);
  });
  route(router, opts, 'futuresClosePosition', async ({ auth, params, body }) => {
    orderLimit.consume(`user:${auth.user.id}`);
    return serializeFuturesOrder(await service.closePosition(auth.user.id, params.symbol, body.quantity));
  });
  route(router, opts, 'futuresAdjustMargin', async ({ auth, params, body }) => position(await service.adjustMargin(auth.user.id, params.symbol, body.amount)));
  route(router, opts, 'futuresSetTpSl', async ({ auth, params, body }) => position(await service.setTpSl(auth.user.id, params.symbol, body.takeProfitPrice, body.stopLossPrice)));

  // ───── admin
  const adminView = async (symbol: string): Promise<AdminFuturesSymbol> => {
    const c = config.get(symbol);
    const [p] = await db.select({ n: count() }).from(futuresPositions).where(and(eq(futuresPositions.symbol, symbol), eq(futuresPositions.status, 'OPEN')));
    const [o] = await db.select({ n: count() }).from(futuresOrders).where(and(eq(futuresOrders.symbol, symbol), inArray(futuresOrders.status, [...OPEN_STATUSES])));
    return { ...config.toInfo(c), sourceStatus: c.row.sourceStatus, adminEnabled: c.row.enabled, openPositions: p?.n ?? 0, openOrders: o?.n ?? 0, updatedAt: c.row.updatedAt.toISOString() };
  };
  route(router, opts, 'adminFuturesSymbols', async () => ({ items: await Promise.all(config.all().map((c) => adminView(c.row.symbol))) }));
  route(router, opts, 'adminUpdateFuturesSymbol', async ({ auth, req, params, body }) => {
    const c = config.get(params.symbol);
    const set: Partial<typeof futuresSymbols.$inferInsert> = {};
    if (body.enabled !== undefined) set.enabled = body.enabled;
    if (body.maxLeverage !== undefined) set.maxLeverage = body.maxLeverage;
    if (body.maintenanceMarginRate !== undefined) {
      const r = dec(body.maintenanceMarginRate);
      if (r.lt('0.001') || r.gt('0.1')) throw new AppError('VALIDATION_ERROR', 'maintenanceMarginRate must be between 0.001 and 0.1', { field: 'maintenanceMarginRate' });
      set.maintenanceMarginRate = r.toFixed();
    }
    const before = { enabled: c.row.enabled, maxLeverage: c.row.maxLeverage, maintenanceMarginRate: c.mmr.toFixed() };
    await db.transaction(async (tx) => {
      await tx.update(futuresSymbols).set({ ...set, updatedAt: new Date() }).where(eq(futuresSymbols.symbol, params.symbol));
      await writeAudit(tx, { actorId: auth.user.id, action: 'FUTURES_SYMBOL_UPDATE', targetType: 'SYMBOL', targetId: params.symbol, before, after: { ...before, ...set }, reason: body.reason, ip: clientIp(req) });
    });
    await config.reload();
    return adminView(params.symbol);
  });

}
