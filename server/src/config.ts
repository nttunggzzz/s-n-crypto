import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(8080),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5433/cex'),
  /** Public origin of the web apps, used in email links and CORS. */
  APP_URL: z.string().default('http://localhost:5173'),
  /** Comma separated extra origins allowed by CORS (admin / signals apps). */
  CORS_ORIGINS: z.string().default(''),
  /** Disable to run the API without connecting to Binance (tests). */
  MARKET_FEED: z.enum(['binance', 'off']).default('binance'),
  BINANCE_REST_URL: z.string().default('https://api.binance.com'),
  BINANCE_WS_URL: z.string().default('wss://stream.binance.com:9443'),
  SYMBOLS: z.string().default('BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,DOGEUSDT,ADAUSDT,AVAXUSDT,LINKUSDT,SUIUSDT'),
  REQUIRE_EMAIL_VERIFICATION: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Cloudflare Turnstile secret; captcha is skipped when empty. */
  TURNSTILE_SECRET: z.string().default(''),
  /** Email delivery: "log" prints links to the server log (dev only). */
  EMAIL_TRANSPORT: z.enum(['log', 'resend']).default('log'),
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('CEX Sim <no-reply@example.com>'),
  SESSION_TTL_DAYS: z.coerce.number().int().default(30),
  /** Multiplies every per-IP/per-user rate limit (tests raise it; production keeps 1). */
  RATE_LIMIT_SCALE: z.coerce.number().int().min(1).default(1),
  LOG_LEVEL: z.string().default('info'),
});

export type Config = z.infer<typeof Env> & { symbols: string[]; isProd: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.parse(env);
  if (parsed.NODE_ENV === 'production' && parsed.EMAIL_TRANSPORT === 'log') {
    throw new Error('EMAIL_TRANSPORT=log is not allowed in production');
  }
  return {
    ...parsed,
    symbols: parsed.SYMBOLS.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
    isProd: parsed.NODE_ENV === 'production',
  };
}
