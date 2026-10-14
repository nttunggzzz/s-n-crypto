import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(8080),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5433/cex'),
  /** Public origin of the web apps, used in email links and CORS. */
  APP_URL: z.string().default('http://localhost:5173'),
  /** Comma separated extra origins allowed by CORS (admin / signals apps). */
  CORS_ORIGINS: z.string().default(''),
  /**
   * binance = real prices · sim = synthetic prices on real pair rules (offline dev, end-to-end tests, CI;
   * refused in production) · off = no market data (unit tests).
   */
  MARKET_FEED: z.enum(['binance', 'sim', 'off']).default('binance'),
  BINANCE_REST_URL: z.string().default('https://api.binance.com'),
  BINANCE_WS_URL: z.string().default('wss://stream.binance.com:9443'),
  /** Binance USDⓈ-M futures (simulated perpetuals). */
  BINANCE_FUTURES_REST_URL: z.string().default('https://fapi.binance.com'),
  BINANCE_FUTURES_WS_URL: z.string().default('wss://fstream.binance.com'),
  /** Listed pairs, in display order (50 USDT pairs; every one passes the 8-decimal rule). */
  SYMBOLS: z.string().default(
    'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,DOGEUSDT,ADAUSDT,AVAXUSDT,LINKUSDT,SUIUSDT,NEARUSDT,UNIUSDT,ENAUSDT,TAOUSDT,ONDOUSDT,PEPEUSDT,WLDUSDT,AAVEUSDT,TRXUSDT,BCHUSDT,FETUSDT,LTCUSDT,TIAUSDT,DOTUSDT,APTUSDT,' +
      'FILUSDT,HBARUSDT,ARBUSDT,XLMUSDT,INJUSDT,ATOMUSDT,TRUMPUSDT,PENGUUSDT,ICPUSDT,JUPUSDT,ALGOUSDT,OPUSDT,VIRTUALUSDT,RENDERUSDT,CRVUSDT,LDOUSDT,POLUSDT,SEIUSDT,SHIBUSDT,ETCUSDT,WIFUSDT,BONKUSDT,FLOKIUSDT,KAIAUSDT,STXUSDT',
  ),
  REQUIRE_EMAIL_VERIFICATION: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Cloudflare Turnstile secret; captcha is skipped when empty. */
  TURNSTILE_SECRET: z.string().default(''),
  /** Turnstile site key (public), handed to the apps by `publicConfig`; set together with the secret. */
  TURNSTILE_SITE_KEY: z.string().default(''),
  /** open = anyone can sign up · invite = an invite code is required (closed staging). Default: invite in production, open otherwise. */
  REGISTRATION: z.enum(['open', 'invite']).optional(),
  /**
   * Email delivery: "resend" (production) · "log" prints the emails to the server log (dev; in production only
   * with REGISTRATION=invite, before a mail domain exists) · "file" appends JSON lines to EMAIL_OUTBOX (e2e).
   */
  EMAIL_TRANSPORT: z.enum(['log', 'file', 'resend']).default('log'),
  EMAIL_OUTBOX: z.string().default('.email-outbox.jsonl'),
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('CEX Sim <no-reply@example.com>'),
  SESSION_TTL_DAYS: z.coerce.number().int().default(30),
  /** base64 of 32 random bytes; encrypts 2FA secrets at rest. Required in production. */
  DATA_ENCRYPTION_KEY: z.string().default(''),
  /** Name shown in authenticator apps. */
  TOTP_ISSUER: z.string().default('CEX Sim'),
  /** Multiplies every per-IP/per-user rate limit (tests raise it; production keeps 1). */
  RATE_LIMIT_SCALE: z.coerce.number().int().min(1).default(1),
  LOG_LEVEL: z.string().default('info'),
  /** Production build of apps/exchange to serve at `/` on this same origin (Docker sets it); empty = API only. */
  WEB_DIST: z.string().default(''),
  /** Production build of apps/admin to serve at `/admin` on this same origin (Docker sets it); empty = none. */
  ADMIN_WEB_DIST: z.string().default(''),
  /** Operator alerts to Telegram (feed down, books out of balance, crash) — set both or neither; empty = log only. */
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_CHAT_ID: z.string().default(''),
  /** Name in front of every alert; default: Railway's environment name, else NODE_ENV. */
  ALERT_ENV_NAME: z.string().default(''),
  /**
   * Module N: fetch news (RSS, GDELT) into `news_items`. Default: off in production (the operator turns it on after
   * reading the N2 report), on in development and tests. In N2b it only sets `news_sources.enabled` of the RSS/GDELT
   * sources; the fetch job itself arrives with N2c.
   */
  NEWS_INGEST_ENABLED: z.enum(['true', 'false']).optional(),
  /** Module N: load the scheduled macro events (macro-calendar.csv) into `macro_events` at start-up. Default on. */
  NEWS_CALENDAR_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Config = Omit<z.infer<typeof Env>, 'REGISTRATION' | 'NEWS_INGEST_ENABLED'> & {
  symbols: string[];
  isProd: boolean;
  dataKey: string;
  REGISTRATION: 'open' | 'invite';
  NEWS_INGEST_ENABLED: boolean;
};

/** Fixed key for development/tests only — never valid in production. */
const DEV_DATA_KEY = Buffer.alloc(32, 'cex-dev-only-not-a-secret').toString('base64');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.parse(env);
  const registration = parsed.REGISTRATION ?? (parsed.NODE_ENV === 'production' ? 'invite' : 'open');
  // Production sends real email (Resend). Exception: a closed server (invite-only) run before a mail domain
  // exists may log emails instead — only invited people can sign up, and the operator reads the links in the log.
  if (parsed.NODE_ENV === 'production' && parsed.EMAIL_TRANSPORT !== 'resend' && !(parsed.EMAIL_TRANSPORT === 'log' && registration === 'invite')) {
    throw new Error(`EMAIL_TRANSPORT=${parsed.EMAIL_TRANSPORT} is not allowed in production (only "resend", or "log" with REGISTRATION=invite)`);
  }
  if (parsed.NODE_ENV === 'production' && parsed.MARKET_FEED === 'sim') {
    throw new Error('MARKET_FEED=sim (synthetic prices) is not allowed in production');
  }
  if (parsed.NODE_ENV === 'production' && !parsed.DATA_ENCRYPTION_KEY) {
    throw new Error('DATA_ENCRYPTION_KEY is required in production');
  }
  if (Boolean(parsed.TELEGRAM_BOT_TOKEN) !== Boolean(parsed.TELEGRAM_CHAT_ID)) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID go together (set both or neither)');
  }
  if (Boolean(parsed.TURNSTILE_SECRET) !== Boolean(parsed.TURNSTILE_SITE_KEY)) {
    throw new Error('TURNSTILE_SECRET and TURNSTILE_SITE_KEY go together (set both or neither)');
  }
  return {
    ...parsed,
    REGISTRATION: registration,
    NEWS_INGEST_ENABLED: parsed.NEWS_INGEST_ENABLED === undefined ? parsed.NODE_ENV !== 'production' : parsed.NEWS_INGEST_ENABLED === 'true',
    symbols: parsed.SYMBOLS.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
    isProd: parsed.NODE_ENV === 'production',
    dataKey: parsed.DATA_ENCRYPTION_KEY || DEV_DATA_KEY,
  };
}
