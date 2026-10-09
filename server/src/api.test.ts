import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ApiError, createApiClient, type ApiClient, type ServerMessage } from '@cex/contracts';
import { loadConfig } from './config.ts';
import { createApp, allowedOrigins } from './app.ts';
import { AuthService } from './modules/auth/authService.ts';
import { LogEmailSender } from './modules/auth/email.ts';
import { CandleService } from './modules/market/candleService.ts';
import { RealtimeHub } from './realtime/hub.ts';
import { reconcile } from './modules/exchange/reconciliation.ts';
import { createTestEnv, marketTrade, setBook, type TestEnv } from '../test/helpers.ts';

const config = loadConfig({ NODE_ENV: 'test', MARKET_FEED: 'off', APP_URL: 'http://localhost:5173', RATE_LIMIT_SCALE: '100' });

let env: TestEnv;
let server: http.Server;
let hub: RealtimeHub;
let mail: LogEmailSender;
let base: string;

/** API client with its own cookie jar (one per simulated browser). */
function browser(): ApiClient & { cookie: () => string } {
  let cookie = '';
  const client = createApiClient({
    baseUrl: base,
    validateResponses: true, // every response is checked against the contract
    fetch: async (input, init) => {
      const res = await fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), ...(cookie ? { cookie } : {}) } });
      const set = res.headers.getSetCookie();
      for (const c of set) {
        const [pair] = c.split(';');
        if (pair!.startsWith('cex_session=')) cookie = pair!.endsWith('=') ? '' : pair!;
      }
      return res;
    },
  });
  return Object.assign(client, { cookie: () => cookie });
}

async function expectApiError(p: Promise<unknown>, code: string, status?: number) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.code === code && (status === undefined || e.status === status));
}

let emailSeq = 0;
async function signedUpUser(verify = true) {
  const b = browser();
  const email = `api${++emailSeq}-${Date.now()}@test.local`;
  await b.register({ body: { email, password: 'correct horse battery', name: 'Tester' } });
  if (verify) {
    const msg = mail.sent.findLast((m) => m.to === email)!;
    const token = /token=([\w-]+)/.exec(msg.text)![1]!;
    await b.verifyEmail({ body: { token } });
  }
  return { b, email };
}

beforeAll(async () => {
  env = await createTestEnv();
  mail = new LogEmailSender();
  const auth = new AuthService(env.database.db, config, mail);
  const app = createApp({ config, db: env.database.db, auth, market: env.market, exchange: env.ex, candles: new CandleService(env.database.db, null) });
  server = http.createServer(app);
  hub = new RealtimeHub(env.market, env.ex, auth, allowedOrigins(config));
  hub.attach(server);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  // keep the book fresh relative to the real clock used by the HTTP layer
  env.clock.ms = Date.now();
  setBook(env, 'BTCUSDT', [['99.00', '1.00000']], [['100.00', '0.50000'], ['101.00', '1.00000']]);
});

afterAll(async () => {
  hub.close();
  await new Promise((r) => server.close(r));
  await env.close();
});

describe('API', () => {
  it('health and public market endpoints follow the contract', async () => {
    const b = browser();
    expect((await b.health()).status).toBe('ok');
    const info = await b.exchangeInfo();
    expect(info.symbols.map((s) => s.symbol)).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(info.symbols[0]).toMatchObject({ tickSize: '0.01', stepSize: '0.00001', pricePrecision: 2, quantityPrecision: 5, enabled: true });
    const tickers = await b.tickers();
    const eth = tickers.items.find((t) => t.symbol === 'ETHUSDT')!;
    expect(eth.status).toBe('UNAVAILABLE');
    expect(eth.lastPrice).toBeNull(); // never 0
    const depth = await b.depth({ params: { symbol: 'BTCUSDT' } });
    expect(depth.asks[0]).toEqual(['100.00', '0.50000']);
    await expectApiError(b.depth({ params: { symbol: 'NOPEUSDT' } }), 'NOT_FOUND', 404);
  });

  it('requires sign-in and a verified email to trade', async () => {
    const anon = browser();
    await expectApiError(anon.balances(), 'UNAUTHENTICATED', 401);
    const { b } = await signedUpUser(false);
    expect((await b.me()).emailVerified).toBe(false);
    await expectApiError(b.faucetClaim(), 'EMAIL_NOT_VERIFIED', 403);
  });

  it('full flow: register → verify → faucet → market buy → limit → fill → history', async () => {
    const { b } = await signedUpUser();
    const claim = await b.faucetClaim();
    expect(claim.claimed).toBe('10000.00000000');
    expect((await b.faucetStatus()).canClaim).toBe(false);

    const buy = await b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '1' } });
    expect(buy.order.status).toBe('FILLED');
    expect(buy.order.avgPrice).toBe('100.50000000');
    expect(buy.fills).toHaveLength(2);

    const limit = await b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '95' } });
    expect(limit.order.status).toBe('NEW');
    expect((await b.openOrders()).items.map((o) => o.id)).toEqual([limit.order.id]);

    marketTrade(env, 'BTCUSDT', '94.99');
    await env.ex.matcher.idle('BTCUSDT');
    const filled = await b.getOrder({ params: { orderId: limit.order.id } });
    expect(filled.status).toBe('FILLED');

    const balances = await b.balances();
    const usdt = balances.items.find((x) => x.asset === 'USDT')!;
    expect(usdt).toMatchObject({ available: '9890.00000000', locked: '0.00000000', valueUsdt: '9890.00000000' });
    const btc = balances.items.find((x) => x.asset === 'BTC')!;
    expect(btc.total).toBe('1.09890000');

    const history = await b.orderHistory({ query: { limit: 1 } });
    expect(history.items).toHaveLength(1);
    expect(history.nextCursor).not.toBeNull();
    const page2 = await b.orderHistory({ query: { limit: 1, cursor: history.nextCursor! } });
    expect(page2.items[0]!.id).toBe(buy.order.id);

    const myTrades = await b.myTrades({ query: { symbol: 'BTCUSDT' } });
    expect(myTrades.items).toHaveLength(3);
    const ledger = await b.ledger({ query: { asset: 'USDT' } });
    expect(ledger.items.every((e) => e.type !== 'ORDER_LOCK' && e.type !== 'ORDER_UNLOCK')).toBe(true);

    expect((await reconcile(env.database.db, false)).mismatches).toEqual([]);
  });

  it('validation errors use the standard error shape', async () => {
    const { b } = await signedUpUser();
    await expectApiError(b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '-1', price: '1' } }), 'VALIDATION_ERROR', 400);
    await expectApiError(b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.1' } }), 'INSUFFICIENT_BALANCE', 400);
  });

  it("another user's order is invisible (404, not 403)", async () => {
    const { b: alice } = await signedUpUser();
    const { b: bob } = await signedUpUser();
    await alice.faucetClaim();
    const o = await alice.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '90' } });
    await expectApiError(bob.getOrder({ params: { orderId: o.order.id } }), 'NOT_FOUND', 404);
    await expectApiError(bob.cancelOrder({ params: { orderId: o.order.id } }), 'NOT_FOUND', 404);
    expect((await alice.cancelOrder({ params: { orderId: o.order.id } })).status).toBe('CANCELED');
  });

  it('logout revokes the session; sessions can be listed and revoked', async () => {
    const { b, email } = await signedUpUser();
    const other = browser();
    await other.login({ body: { email, password: 'correct horse battery' } });
    const list = await b.listSessions();
    expect(list.items).toHaveLength(2);
    const otherSession = list.items.find((s) => !s.current)!;
    await b.revokeSession({ params: { sessionId: otherSession.id } });
    await expectApiError(other.me(), 'UNAUTHENTICATED', 401);
    await b.logout();
    await expectApiError(b.me(), 'UNAUTHENTICATED', 401);
  });

  it('locks login after repeated wrong passwords', async () => {
    const { email } = await signedUpUser();
    const b = browser();
    for (let i = 0; i < 5; i++) await expectApiError(b.login({ body: { email, password: 'wrong password!' } }), 'UNAUTHENTICATED', 401);
    await expectApiError(b.login({ body: { email, password: 'correct horse battery' } }), 'RATE_LIMITED', 429);
  });

  it('password reset sets a new password and signs out everywhere', async () => {
    const { b, email } = await signedUpUser();
    await browser().forgotPassword({ body: { email } });
    await browser().forgotPassword({ body: { email: 'nobody@test.local' } }); // same response, no enumeration
    const token = /token=([\w-]+)/.exec(mail.sent.findLast((m) => m.to === email && m.subject.includes('mật khẩu'))!.text)![1]!;
    await browser().resetPassword({ body: { token, newPassword: 'a brand new password' } });
    await expectApiError(b.me(), 'UNAUTHENTICATED');
    await expectApiError(browser().resetPassword({ body: { token, newPassword: 'reuse attempt 123' } }), 'VALIDATION_ERROR');
    const fresh = browser();
    await fresh.login({ body: { email, password: 'a brand new password' } });
    expect((await fresh.me()).email).toBe(email);
  });

  it('rejects cross-site and non-JSON writes (CSRF)', async () => {
    const { b } = await signedUpUser();
    const res = await fetch(`${base}/api/v1/wallet/faucet`, {
      method: 'POST',
      headers: { cookie: b.cookie(), origin: 'https://evil.example', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(403);
    const res2 = await fetch(`${base}/api/v1/wallet/faucet`, { method: 'POST', headers: { cookie: b.cookie(), 'content-type': 'text/plain' }, body: '{}' });
    expect(res2.status).toBe(400);
  });

  it('realtime: user channel needs a session and receives order + balance events', async () => {
    const { b } = await signedUpUser();
    await b.faucetClaim();
    const wsUrl = base.replace('http', 'ws') + '/ws';

    const anon = new WebSocket(wsUrl);
    await new Promise((r) => anon.once('open', r));
    anon.send(JSON.stringify({ type: 'subscribe', channel: 'user' }));
    const anonReply = await new Promise<ServerMessage>((r) => anon.once('message', (d) => r(JSON.parse(String(d)))));
    expect(anonReply).toMatchObject({ type: 'error', code: 'UNAUTHENTICATED' });
    anon.close();

    const ws = new WebSocket(wsUrl, { headers: { cookie: b.cookie() } });
    const messages: ServerMessage[] = [];
    ws.on('message', (d) => messages.push(JSON.parse(String(d))));
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ type: 'subscribe', channel: 'user' }));
    ws.send(JSON.stringify({ type: 'subscribe', channel: 'ticker:BTCUSDT' }));
    await new Promise((r) => setTimeout(r, 100));
    await b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '90' } });
    await new Promise((r) => setTimeout(r, 200));
    ws.close();

    expect(messages).toContainEqual({ type: 'subscribed', channel: 'user' });
    const userEvents = messages.filter((m) => m.type === 'event' && m.channel === 'user').map((m) => (m as { data: { kind: string } }).data.kind);
    expect(userEvents).toEqual(expect.arrayContaining(['order', 'balance']));
    expect(messages.some((m) => m.type === 'event' && m.channel === 'ticker:BTCUSDT')).toBe(true);
  });
});
