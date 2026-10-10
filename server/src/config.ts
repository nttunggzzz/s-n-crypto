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
  /** Email delivery: "log" prints links to the server log, "file" appends JSON lines to EMAIL_OUTBOX (dev / e2e only). */
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
});

export type Config = z.infer<typeof Env> & { symbols: string[]; isProd: boolean; dataKey: string };

/** Fixed key for development/tests only — never valid in production. */
const DEV_DATA_KEY = Buffer.alloc(32, 'cex-dev-only-not-a-secret').toString('base64');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.parse(env);
  if (parsed.NODE_ENV === 'production' && parsed.EMAIL_TRANSPORT !== 'resend') {
    throw new Error(`EMAIL_TRANSPORT=${parsed.EMAIL_TRANSPORT} is not allowed in production`);
  }
  if (parsed.NODE_ENV === 'production' && parsed.MARKET_FEED === 'sim') {
    throw new Error('MARKET_FEED=sim (synthetic prices) is not allowed in production');
  }
  if (parsed.NODE_ENV === 'production' && !parsed.DATA_ENCRYPTION_KEY) {
    throw new Error('DATA_ENCRYPTION_KEY is required in production');
  }
  return {
    ...parsed,
    symbols: parsed.SYMBOLS.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
    isProd: parsed.NODE_ENV === 'production',
    dataKey: parsed.DATA_ENCRYPTION_KEY || DEV_DATA_KEY,
  };
}
