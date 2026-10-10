import type { Router } from 'express';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import { route, type RouteOptions } from '../../lib/http.ts';
import { RateLimiter } from '../../lib/rateLimit.ts';
import type { Exchange } from '../exchange/index.ts';
import { serializeOrder } from '../exchange/serializers.ts';
import type { MarketDataService } from '../market/marketData.ts';
import { DcaService } from './dcaService.ts';
import { BotsEvents } from './events.ts';
import { GridService } from './gridService.ts';

export interface Bots {
  events: BotsEvents;
  dca: DcaService;
  grid: GridService;
  start(): void;
  stop(): void;
  /** Admin account reset: stop grid bots and cancel recurring buys first. */
  resetUser(userId: string): Promise<void>;
}

/** Recurring buys + spot grid bots (phase 2.6). Both trade through the normal spot engine. */
export function createBots(db: Db, ex: Exchange, market: MarketDataService, now?: () => Date): Bots {
  const events = new BotsEvents();
  const dca = new DcaService(db, ex, events, now);
  const grid = new GridService(db, ex, market, events, now);
  return {
    events,
    dca,
    grid,
    start() {
      dca.start();
      grid.start();
    },
    stop() {
      dca.stop();
      grid.shutdown();
    },
    async resetUser(userId) {
      await dca.resetUser(userId);
      await grid.resetUser(userId);
    },
  };
}

const botId = (s: string) => {
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n <= 0) throw new AppError('NOT_FOUND', 'Bot not found');
  return n;
};

export function registerBotRoutes(router: Router, opts: RouteOptions, bots: Bots, rateLimitScale = 1): void {
  const limit = new RateLimiter(10 * rateLimitScale, 60_000);
  const consume = (userId: string) => limit.consume(`bots:${userId}`);

  route(router, opts, 'dcaPlans', async ({ auth }) => ({ items: await bots.dca.list(auth.user.id) }));
  route(router, opts, 'createDcaPlan', async ({ auth, body }) => (consume(auth.user.id), bots.dca.create(auth.user.id, body)));
  route(router, opts, 'updateDcaPlan', async ({ auth, params, body }) => bots.dca.update(auth.user.id, params.planId, body));
  route(router, opts, 'cancelDcaPlan', async ({ auth, params }) => bots.dca.cancel(auth.user.id, params.planId));
  route(router, opts, 'dcaRuns', async ({ auth, params, query }) => bots.dca.runs(auth.user.id, params.planId, query.cursor, query.limit));

  route(router, opts, 'gridBotPreview', async ({ body }) => bots.grid.preview(body));
  route(router, opts, 'gridBots', async ({ auth }) => ({ items: await bots.grid.list(auth.user.id) }));
  route(router, opts, 'createGridBot', async ({ auth, body }) => (consume(auth.user.id), bots.grid.create(auth.user.id, body)));
  route(router, opts, 'getGridBot', async ({ auth, params }) => bots.grid.get(auth.user.id, botId(params.botId)));
  route(router, opts, 'stopGridBot', async ({ auth, params, body }) => bots.grid.stop(auth.user.id, botId(params.botId), body.sellBase));
  route(router, opts, 'gridBotOrders', async ({ auth, params }) => ({ items: (await bots.grid.orders(auth.user.id, botId(params.botId))).map(serializeOrder) }));
}
