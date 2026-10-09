import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { ClientMessage, CandleInterval, type ServerMessage } from '@cex/contracts';
import { logger } from '../logger.ts';
import { parseCookieHeader, readSessionToken } from '../lib/http.ts';
import type { AuthService } from '../modules/auth/authService.ts';
import type { MarketDataService } from '../modules/market/marketData.ts';
import type { Exchange } from '../modules/exchange/index.ts';
import { serializeBalance, serializeOrder, serializeTrade } from '../modules/exchange/serializers.ts';
import { makePriceOf } from '../modules/exchange/routes.ts';

interface Client {
  ws: WebSocket;
  userId: string | null;
  channels: Set<string>;
  alive: boolean;
}

const MAX_CHANNELS = 50;
/** depth arrives every 100ms from Binance; clients get at most this rate. */
const DEPTH_THROTTLE_MS = 500;
const TICKER_THROTTLE_MS = 1000;

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

  constructor(
    private readonly market: MarketDataService,
    private readonly ex: Exchange,
    private readonly auth: AuthService,
    private readonly allowedOrigins: Set<string>,
  ) {}

  attach(server: Server): void {
    server.on('upgrade', (req, socket, head) => {
      if (!req.url?.startsWith('/ws')) return;
      const origin = req.headers.origin;
      if (origin && !this.allowedOrigins.has(origin)) {
        socket.destroy();
        return;
      }
      void this.resolveUser(req).then((userId) => {
        this.wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, userId));
      });
    });
    this.wireMarket();
    this.wireExchange();
    this.heartbeat = setInterval(() => {
      for (const c of this.clients) {
        if (!c.alive) {
          c.ws.terminate();
          continue;
        }
        c.alive = false;
        c.ws.ping();
      }
    }, 30_000);
    this.heartbeat.unref();
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const c of this.clients) c.ws.terminate();
    this.wss.close();
  }

  private async resolveUser(req: IncomingMessage): Promise<string | null> {
    try {
      const token = readSessionToken({ headers: req.headers, cookies: parseCookieHeader(req.headers.cookie) });
      if (!token) return null;
      const ctx = await this.auth.authenticate(token);
      return ctx && ctx.user.status === 'active' ? ctx.user.id : null;
    } catch (err) {
      logger.warn({ err }, 'ws auth failed');
      return null;
    }
  }

  private onConnection(ws: WebSocket, userId: string | null): void {
    const client: Client = { ws, userId, channels: new Set(), alive: true };
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
    if (client.channels.size >= MAX_CHANNELS) return { code: 'RATE_LIMITED', message: 'Too many subscriptions' };
    if (channel === 'user') return client.userId ? null : { code: 'UNAUTHENTICATED', message: 'Sign in required' };
    if (channel === 'market:status') return null;
    const [kind, symbol, interval] = channel.split(':');
    if (!symbol || !this.ex.config.findSymbol(symbol)) return { code: 'NOT_FOUND', message: 'Unknown channel' };
    if (kind === 'ticker' || kind === 'depth' || kind === 'trades') return interval === undefined ? null : { code: 'NOT_FOUND', message: 'Unknown channel' };
    if (kind === 'candles' && CandleInterval.safeParse(interval).success) return null;
    return { code: 'NOT_FOUND', message: 'Unknown channel' };
  }

  private sendSnapshot(client: Client, channel: string): void {
    const [kind, symbol, interval] = channel.split(':');
    if (channel === 'market:status') return this.event(client, channel, this.market.getMarketStatus());
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

  private wireMarket(): void {
    this.market.on('depth', (symbol) => this.throttled(`depth:${symbol}`, DEPTH_THROTTLE_MS, () => this.market.getDepth(symbol)));
    this.market.on('ticker', (symbol) => this.throttled(`ticker:${symbol}`, TICKER_THROTTLE_MS, () => this.market.getTicker(symbol)));
    this.market.on('trade', (symbol, trade) => this.broadcast(`trades:${symbol}`, () => trade));
    this.market.on('candle', (symbol, interval, candle) => this.broadcast(`candles:${symbol}:${interval}`, () => candle));
    this.market.on('status', () => this.broadcast('market:status', () => this.market.getMarketStatus()));
  }

  private toUser(userId: string, data: unknown): void {
    for (const c of this.clients) if (c.userId === userId && c.channels.has('user')) this.event(c, 'user', data);
  }

  private wireExchange(): void {
    const priceOf = makePriceOf(this.market);
    this.ex.events.on('order', (userId, o) => this.toUser(userId, { kind: 'order', order: serializeOrder(o) }));
    this.ex.events.on('trade', (userId, t) => this.toUser(userId, { kind: 'trade', trade: serializeTrade(t) }));
    this.ex.events.on('balance', (userId, b) => this.toUser(userId, { kind: 'balance', balance: serializeBalance(b.asset, b.available, b.locked, priceOf) }));
  }
}
