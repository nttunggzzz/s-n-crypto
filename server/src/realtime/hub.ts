import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { ClientMessage, CandleInterval, REALTIME_MAX_CHANNELS, WS_SESSION_ENDED, type ServerMessage } from '@cex/contracts';
import { logger } from '../logger.ts';
import { parseCookieHeader, readSessionToken } from '../lib/http.ts';
import type { AuthService } from '../modules/auth/authService.ts';
import type { MarketDataService } from '../modules/market/marketData.ts';
import type { Exchange } from '../modules/exchange/index.ts';
import { serializeBalance, serializeOrder, serializeOrderList, serializeTrade } from '../modules/exchange/serializers.ts';
import { serializeNotification } from '../modules/exchange/notificationService.ts';
import { serializeAlert } from '../modules/exchange/alertService.ts';
import { makePriceOf } from '../modules/exchange/routes.ts';
import type { Futures } from '../modules/futures/index.ts';
import type { Bots } from '../modules/bots/index.ts';
import { serializeFuturesOrder, serializeFuturesTrade, serializePosition } from '../modules/futures/serializers.ts';

interface Client {
  ws: WebSocket;
  userId: string | null;
  /** Session the connection was opened with (re-checked every heartbeat; ended → connection closed). */
  sessionId: string | null;
  channels: Set<string>;
  alive: boolean;
}

/** depth arrives every 100ms from Binance; clients get at most this rate. */
const DEPTH_THROTTLE_MS = 500;
const TICKER_THROTTLE_MS = 1000;
/** `tickers` / `futures:tickers`: one batch of the pairs that changed, at most this often. */
const TICKER_BATCH_MS = 1000;
export { WS_SESSION_ENDED };

/**
 * WebSocket fan-out at /ws. Users never connect to Binance directly.
 * Auth: session cookie (or `?` none) on the upgrade request; only the `user` channel needs it.
 */
export class RealtimeHub {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  private readonly clients = new Set<Client>();
  private readonly lastSent = new Map<string, number>();
  private readonly pendingSend = new Map<string, NodeJS.Timeout>();
  private heartbeat: NodeJS.Timeout | undefined;
  private batchTimer: NodeJS.Timeout | undefined;
  /** Pairs whose ticker changed since the last `tickers` / `futures:tickers` batch. */
  private readonly changedTickers = new Set<string>();
  private readonly changedFuturesTickers = new Set<string>();
  /** Subscriptions allowed per connection (tests lower it). */
  maxChannels = REALTIME_MAX_CHANNELS;
  private lastStatusKey = '';
  private readonly onConfigChanged = () => {
    // reload() runs after every admin change; push only when halt / disabled pairs actually changed
    const key = this.ex.config.statusKey();
    if (key === this.lastStatusKey) return;
    this.lastStatusKey = key;
    this.broadcast('exchange:status', () => this.ex.config.exchangeStatus());
  };

  /** An admin signed these sessions out: close their connections now (the client reconnects as a guest) instead of at the next heartbeat. */
  private readonly onSessionsEnded = (sessionIds: string[]) => {
    const ended = new Set(sessionIds);
    for (const c of this.clients) if (c.sessionId && ended.has(c.sessionId)) c.ws.close(WS_SESSION_ENDED, 'session ended');
  };

  constructor(
    private readonly market: MarketDataService,
    private readonly ex: Exchange,
    private readonly auth: AuthService,
    private readonly allowedOrigins: Set<string>,
    private readonly futures?: Futures,
    private readonly bots?: Bots,
  ) {}

  attach(server: Server): void {
    server.on('upgrade', (req, socket, head) => {
      if (!req.url?.startsWith('/ws')) return;
      const origin = req.headers.origin;
      if (origin && !this.allowedOrigins.has(origin)) {
        socket.destroy();
        return;
      }
      void this.resolveUser(req).then((auth) => {
        this.wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, auth));
      });
    });
    this.auth.sessionEvents.on('ended', this.onSessionsEnded);
    this.wireMarket();
    this.wireExchange();
    this.wireFutures();
    this.wireBots();
    this.heartbeat = setInterval(() => {
      for (const c of this.clients) {
        if (!c.alive) {
          c.ws.terminate();
          continue;
        }
        c.alive = false;
        c.ws.ping();
      }
      void this.dropEndedSessions().catch((err) => logger.warn({ err }, 'ws session check failed'));
    }, 30_000);
    this.heartbeat.unref();
    this.batchTimer = setInterval(() => this.flushTickerBatches(), TICKER_BATCH_MS);
    this.batchTimer.unref();
  }

  close(): void {
    clearInterval(this.heartbeat);
    clearInterval(this.batchTimer);
    this.ex.config.off('changed', this.onConfigChanged);
    this.auth.sessionEvents.off('ended', this.onSessionsEnded);
    for (const c of this.clients) c.ws.terminate();
    this.wss.close();
  }

  private async resolveUser(req: IncomingMessage): Promise<{ userId: string; sessionId: string } | null> {
    try {
      const token = readSessionToken({ headers: req.headers, cookies: parseCookieHeader(req.headers.cookie) });
      if (!token) return null;
      const ctx = await this.auth.authenticate(token);
      return ctx && ctx.user.status === 'active' ? { userId: ctx.user.id, sessionId: ctx.session.id } : null;
    } catch (err) {
      logger.warn({ err }, 'ws auth failed');
      return null;
    }
  }

  /**
   * Closes signed-in connections whose session has ended (sign-out, revoked, password reset, account
   * locked, expired), so private events stop flowing to a tab that is no longer signed in.
   * Runs every heartbeat; the client reconnects as a guest.
   */
  async dropEndedSessions(): Promise<void> {
    const authed = [...this.clients].filter((c) => c.sessionId);
    if (authed.length === 0) return;
    const live = await this.auth.liveSessionIds([...new Set(authed.map((c) => c.sessionId!))]);
    for (const c of authed) if (!live.has(c.sessionId!)) c.ws.close(WS_SESSION_ENDED, 'session ended');
  }

  private onConnection(ws: WebSocket, auth: { userId: string; sessionId: string } | null): void {
    const client: Client = { ws, userId: auth?.userId ?? null, sessionId: auth?.sessionId ?? null, channels: new Set(), alive: true };
    this.clients.add(client);
    ws.on('pong', () => (client.alive = true));
    ws.on('close', () => this.clients.delete(client));
    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = ClientMessage.parse(JSON.parse(raw.toString()));
      } catch {
        this.send(client, { type: 'error', code: 'VALIDATION_ERROR', message: 'Invalid message' });
        return;
      }
      if (msg.type === 'ping') return this.send(client, { type: 'pong' });
      if (msg.type === 'unsubscribe') {
        client.channels.delete(msg.channel);
        return this.send(client, { type: 'unsubscribed', channel: msg.channel });
      }
      const err = this.checkChannel(msg.channel, client);
      if (err) return this.send(client, { type: 'error', code: err.code, message: err.message, channel: msg.channel });
      client.channels.add(msg.channel);
      this.send(client, { type: 'subscribed', channel: msg.channel });
      this.sendSnapshot(client, msg.channel);
    });
  }

  private checkChannel(channel: string, client: Client): { code: string; message: string } | null {
    if (client.channels.has(channel)) return null; // re-subscribing: just send the snapshot again
    if (client.channels.size >= this.maxChannels) return { code: 'RATE_LIMITED', message: `Too many subscriptions (max ${this.maxChannels})` };
    if (channel === 'user') return client.userId ? null : { code: 'UNAUTHENTICATED', message: 'Sign in required' };
    if (channel === 'market:status' || channel === 'exchange:status' || channel === 'tickers') return null;
    if (channel.startsWith('futures:')) return this.checkFuturesChannel(channel);
    const [kind, symbol, interval] = channel.split(':');
    if (!symbol || !this.ex.config.findSymbol(symbol)) return { code: 'NOT_FOUND', message: 'Unknown channel' };
    if (kind === 'ticker' || kind === 'depth' || kind === 'trades') return interval === undefined ? null : { code: 'NOT_FOUND', message: 'Unknown channel' };
    if (kind === 'candles' && CandleInterval.safeParse(interval).success) return null;
    return { code: 'NOT_FOUND', message: 'Unknown channel' };
  }

  private checkFuturesChannel(channel: string): { code: string; message: string } | null {
    const notFound = { code: 'NOT_FOUND', message: 'Unknown channel' };
    if (!this.futures) return notFound;
    if (channel === 'futures:status' || channel === 'futures:tickers') return null;
    const [, kind, symbol, interval, extra] = channel.split(':');
    if (extra !== undefined || !symbol || !this.futures.config.find(symbol)) return notFound;
    if (kind === 'ticker' || kind === 'mark' || kind === 'depth' || kind === 'trades') return interval === undefined ? null : notFound;
    if (kind === 'candles' && CandleInterval.safeParse(interval).success) return null;
    return notFound;
  }

  private futuresTicker(symbol: string) {
    const f = this.futures!;
    const m = f.marks.get(symbol);
    return { ...f.market.getTicker(symbol), markPrice: m.markPrice, indexPrice: m.indexPrice, fundingRate: m.fundingRate, nextFundingTime: m.nextFundingTime };
  }

  private sendSnapshot(client: Client, channel: string): void {
    if (channel.startsWith('futures:')) {
      const f = this.futures!;
      if (channel === 'futures:status') return this.event(client, channel, f.market.getMarketStatus());
      if (channel === 'futures:tickers') return this.event(client, channel, { items: f.config.all().map((c) => this.futuresTicker(c.row.symbol)) });
      const [, kind, symbol, interval] = channel.split(':') as [string, string, string, string | undefined];
      if (kind === 'ticker') this.event(client, channel, this.futuresTicker(symbol));
      else if (kind === 'mark') this.event(client, channel, f.marks.get(symbol));
      else if (kind === 'depth') this.event(client, channel, f.market.getDepth(symbol));
      else if (kind === 'candles') {
        const c = f.market.getFormingCandle(symbol, interval as CandleInterval);
        if (c) this.event(client, channel, c);
      }
      return;
    }
    const [kind, symbol, interval] = channel.split(':');
    if (channel === 'market:status') return this.event(client, channel, this.market.getMarketStatus());
    if (channel === 'exchange:status') return this.event(client, channel, this.ex.config.exchangeStatus());
    if (channel === 'tickers') return this.event(client, channel, { items: this.ex.config.allSymbols().map((s) => this.market.getTicker(s.row.symbol)) });
    if (!symbol) return;
    if (kind === 'ticker') this.event(client, channel, this.market.getTicker(symbol));
    else if (kind === 'depth') this.event(client, channel, this.market.getDepth(symbol));
    else if (kind === 'candles') {
      const c = this.market.getFormingCandle(symbol, interval as CandleInterval);
      if (c) this.event(client, channel, c);
    }
  }

  private send(client: Client, msg: ServerMessage): void {
    if (client.ws.readyState === client.ws.OPEN) client.ws.send(JSON.stringify(msg));
  }

  private event(client: Client, channel: string, data: unknown): void {
    this.send(client, { type: 'event', channel, data });
  }

  private broadcast(channel: string, data: () => unknown): void {
    let payload: string | null = null;
    for (const c of this.clients) {
      if (!c.channels.has(channel) || c.ws.readyState !== c.ws.OPEN) continue;
      payload ??= JSON.stringify({ type: 'event', channel, data: data() } satisfies ServerMessage);
      c.ws.send(payload);
    }
  }

  /** Sends at most once per `ms` per channel, always delivering the latest state (trailing edge). */
  private throttled(channel: string, ms: number, data: () => unknown): void {
    const last = this.lastSent.get(channel) ?? 0;
    const wait = last + ms - Date.now();
    if (wait <= 0) {
      this.lastSent.set(channel, Date.now());
      this.broadcast(channel, data);
    } else if (!this.pendingSend.has(channel)) {
      this.pendingSend.set(
        channel,
        setTimeout(() => {
          this.pendingSend.delete(channel);
          this.lastSent.set(channel, Date.now());
          this.broadcast(channel, data);
        }, wait),
      );
    }
  }

  /** Sends each batch channel the pairs that changed since the last flush (nothing when nobody listens). */
  private flushTickerBatches(): void {
    const flush = (channel: string, changed: Set<string>, ticker: (symbol: string) => unknown) => {
      if (changed.size === 0) return;
      const symbols = [...changed];
      changed.clear();
      this.broadcast(channel, () => ({ items: symbols.map(ticker) }));
    };
    flush('tickers', this.changedTickers, (s) => this.market.getTicker(s));
    if (this.futures) flush('futures:tickers', this.changedFuturesTickers, (s) => this.futuresTicker(s));
  }

  private wireMarket(): void {
    this.market.on('depth', (symbol) => this.throttled(`depth:${symbol}`, DEPTH_THROTTLE_MS, () => this.market.getDepth(symbol)));
    this.market.on('ticker', (symbol) => {
      this.changedTickers.add(symbol);
      this.throttled(`ticker:${symbol}`, TICKER_THROTTLE_MS, () => this.market.getTicker(symbol));
    });
    this.market.on('trade', (symbol, trade) => this.broadcast(`trades:${symbol}`, () => trade));
    this.market.on('candle', (symbol, interval, candle) => this.broadcast(`candles:${symbol}:${interval}`, () => candle));
    this.market.on('status', () => this.broadcast('market:status', () => this.market.getMarketStatus()));
  }

  private wireFutures(): void {
    const f = this.futures;
    if (!f) return;
    f.market.on('depth', (symbol) => this.throttled(`futures:depth:${symbol}`, DEPTH_THROTTLE_MS, () => f.market.getDepth(symbol)));
    f.market.on('ticker', (symbol) => {
      this.changedFuturesTickers.add(symbol);
      this.throttled(`futures:ticker:${symbol}`, TICKER_THROTTLE_MS, () => this.futuresTicker(symbol));
    });
    f.market.on('trade', (symbol, trade) => this.broadcast(`futures:trades:${symbol}`, () => trade));
    f.market.on('candle', (symbol, interval, candle) => this.broadcast(`futures:candles:${symbol}:${interval}`, () => candle));
    f.market.on('status', () => this.broadcast('futures:status', () => f.market.getMarketStatus()));
    f.marks.on('mark', (symbol) => {
      this.changedFuturesTickers.add(symbol); // the futures ticker carries mark price + funding
      this.broadcast(`futures:mark:${symbol}`, () => f.marks.get(symbol));
    });
    f.events.on('order', (userId, o) => this.toUser(userId, { kind: 'futuresOrder', order: serializeFuturesOrder(o) }));
    f.events.on('trade', (userId, t) => this.toUser(userId, { kind: 'futuresTrade', trade: serializeFuturesTrade(t) }));
    f.events.on('position', (userId, p) => this.toUser(userId, { kind: 'futuresPosition', position: serializePosition(p, f.config.find(p.symbol), f.marks.liveMark(p.symbol)) }));
    f.events.on('notification', (userId, n) => this.toUser(userId, { kind: 'notification', notification: serializeNotification(n) }));
    f.events.on('account', (userId) => {
      if (![...this.clients].some((c) => c.userId === userId && c.channels.has('user'))) return;
      void f.service
        .account(userId)
        .then((account) => this.toUser(userId, { kind: 'futuresAccount', account }))
        .catch((err) => logger.warn({ err }, 'futures account push failed'));
    });
  }

  private wireBots(): void {
    const b = this.bots;
    if (!b) return;
    b.events.on('dcaPlan', (userId, plan) => this.toUser(userId, { kind: 'dcaPlan', plan }));
    b.events.on('gridBot', (userId, bot) => this.toUser(userId, { kind: 'gridBot', bot }));
    b.events.on('notification', (userId, n) => this.toUser(userId, { kind: 'notification', notification: serializeNotification(n) }));
  }

  private toUser(userId: string, data: unknown): void {
    for (const c of this.clients) if (c.userId === userId && c.channels.has('user')) this.event(c, 'user', data);
  }

  private wireExchange(): void {
    this.lastStatusKey = this.ex.config.statusKey();
    this.ex.config.on('changed', this.onConfigChanged);
    const priceOf = makePriceOf(this.market);
    this.ex.events.on('order', (userId, o) => this.toUser(userId, { kind: 'order', order: serializeOrder(o) }));
    this.ex.events.on('trade', (userId, t) => this.toUser(userId, { kind: 'trade', trade: serializeTrade(t) }));
    this.ex.events.on('orderList', (userId, l, legs) => this.toUser(userId, { kind: 'orderList', orderList: serializeOrderList(l, legs) }));
    this.ex.events.on('notification', (userId, n) => this.toUser(userId, { kind: 'notification', notification: serializeNotification(n) }));
    this.ex.events.on('alert', (userId, a) => this.toUser(userId, { kind: 'alert', alert: serializeAlert(a) }));
    // spot wallet only; the futures wallet is pushed as `futuresAccount`
    this.ex.events.on('balance', (userId, b) => b.account === 'SPOT' && this.toUser(userId, { kind: 'balance', balance: serializeBalance(b.asset, b.available, b.locked, priceOf) }));
  }
}
