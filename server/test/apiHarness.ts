import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import { createApiClient, type ApiClient, type Role } from '@cex/contracts';
import { loadConfig } from '../src/config.ts';
import { createApp, allowedOrigins } from '../src/app.ts';
import { users } from '../src/db/schema.ts';
import { AuthService } from '../src/modules/auth/authService.ts';
import { LogEmailSender } from '../src/modules/auth/email.ts';
import { base32Decode, hotp, totpStep } from '../src/modules/auth/totp.ts';
import { CandleService } from '../src/modules/market/candleService.ts';
import { DepthSnapshots, type DepthFetcher } from '../src/modules/market/depthSnapshots.ts';
import { RealtimeHub } from '../src/realtime/hub.ts';
import { createTestEnv, type TestEnv } from './helpers.ts';

export type Browser = ApiClient & { cookie: () => string };

/** A real HTTP server + DB for API tests; every response is validated against the contract. */
export class ApiHarness {
  env!: TestEnv;
  mail = new LogEmailSender();
  base = '';
  private server!: http.Server;
  hub!: RealtimeHub;
  private seq = 0;
  /** Auth clock offset: TOTP codes are single-use per 30 s step, so tests move this clock forward. */
  skewMs = 0;
  authNow = () => new Date(Date.now() + this.skewMs);

  /** Optional fake Binance REST order book for deep-depth tests. */
  async start(opts: { depthFetcher?: DepthFetcher } = {}): Promise<void> {
    const config = loadConfig({ NODE_ENV: 'test', MARKET_FEED: 'off', APP_URL: 'http://localhost:5173', RATE_LIMIT_SCALE: '100' });
    this.env = await createTestEnv();
    const auth = new AuthService(this.env.database.db, config, this.mail, this.authNow);
    const app = createApp({ config, db: this.env.database.db, auth, market: this.env.market, exchange: this.env.ex, candles: new CandleService(this.env.database.db, null), depthSnapshots: new DepthSnapshots(opts.depthFetcher ?? null), futures: this.env.futures, bots: this.env.bots });
    this.server = http.createServer(app);
    this.hub = new RealtimeHub(this.env.market, this.env.ex, auth, allowedOrigins(config), this.env.futures, this.env.bots);
    this.hub.attach(this.server);
    await new Promise<void>((r) => this.server.listen(0, r));
    this.base = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    this.hub.close();
    await new Promise((r) => this.server.close(r));
    await this.env.close();
  }

  /** API client with its own cookie jar (one simulated browser). */
  browser(): Browser {
    let cookie = '';
    const client = createApiClient({
      baseUrl: this.base,
      validateResponses: true,
      fetch: async (input, init) => {
        const res = await fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), ...(cookie ? { cookie } : {}) } });
        for (const c of res.headers.getSetCookie()) {
          const [pair] = c.split(';');
          if (pair!.startsWith('cex_session=')) cookie = pair!.endsWith('=') ? '' : pair!;
        }
        return res;
      },
    });
    return Object.assign(client, { cookie: () => cookie });
  }

  /** Registered + verified user; optionally with a role set directly in the DB. */
  async user(role: Role = 'user'): Promise<{ b: Browser; email: string; id: string; password: string }> {
    const b = this.browser();
    const email = `u${++this.seq}-${Date.now()}@test.local`;
    const password = 'correct horse battery';
    const { user } = await b.register({ body: { email, password, name: `U${this.seq}` } });
    const token = /token=([\w-]+)/.exec(this.mail.sent.findLast((m) => m.to === email)!.text)![1]!;
    await b.verifyEmail({ body: { token } });
    if (role !== 'user') await this.env.database.db.update(users).set({ role }).where(eq(users.id, user.id));
    return { b, email, id: user.id, password };
  }

  /** Staff account with 2FA on; its browser session is 2FA-verified (enabled in-session). */
  async staff(role: Role) {
    const u = await this.user(role);
    const { secret } = await u.b.setupTwoFactor({ body: { currentPassword: u.password } });
    const totp = new Totp(secret, this);
    const { recoveryCodes } = await u.b.enableTwoFactor({ body: { code: totp.next() } });
    return { ...u, totp, recoveryCodes };
  }
}

/** Authenticator-app stand-in. Each call moves the auth clock to the next 30 s step (codes are single-use). */
export class Totp {
  constructor(
    readonly secret: string,
    private readonly h: { skewMs: number; authNow: () => Date },
  ) {}
  next(): string {
    this.h.skewMs += 30_000;
    return this.now();
  }
  /** Code for the current step without moving the clock (to test replays). */
  now(): string {
    return hotp(base32Decode(this.secret), totpStep(this.h.authNow().getTime()));
  }
}
