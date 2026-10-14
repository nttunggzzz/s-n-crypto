import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Config } from './config.ts';
import type { Db } from './db/client.ts';
import { AppError } from './lib/errors.ts';
import { errorHandler, readSessionToken, route, type RouteOptions } from './lib/http.ts';
import { ADMIN_BASE_PATH } from '@cex/contracts';
import { webApp } from './lib/webApp.ts';
import type { AuthService } from './modules/auth/authService.ts';
import { registerAuthRoutes } from './modules/auth/routes.ts';
import type { MarketDataService } from './modules/market/marketData.ts';
import type { CandleService } from './modules/market/candleService.ts';
import { binanceDepthFetcher, DepthSnapshots } from './modules/market/depthSnapshots.ts';
import { SparklineService } from './modules/market/sparklines.ts';
import { AnnouncementService } from './modules/content/announcementService.ts';
import type { Futures } from './modules/futures/index.ts';
import { registerFuturesRoutes } from './modules/futures/routes.ts';
import { registerBotRoutes, type Bots } from './modules/bots/index.ts';
import { registerMarketRoutes } from './modules/market/routes.ts';
import type { Exchange } from './modules/exchange/index.ts';
import { registerExchangeRoutes } from './modules/exchange/routes.ts';
import { AdminService } from './modules/admin/adminService.ts';
import { registerAdminRoutes } from './modules/admin/routes.ts';
import { TaxService } from './modules/tax/taxService.ts';
import { registerTaxRoutes } from './modules/tax/routes.ts';

export interface AppDeps {
  config: Config;
  db: Db;
  auth: AuthService;
  market: MarketDataService;
  exchange: Exchange;
  candles: CandleService;
  /** Deep order books; default: Binance REST when the feed is on, none otherwise. */
  depthSnapshots?: DepthSnapshots;
  /** Simulated futures (phase F). */
  futures?: Futures;
  /** Recurring buys + grid bots (phase 2.6). */
  bots?: Bots;
  version?: string;
  /** Production build of the exchange web app to serve at `/` (config WEB_DIST); none in dev. */
  webDist?: string;
  /** Production build of the admin web app to serve at `/admin` (config ADMIN_WEB_DIST); none in dev. */
  adminWebDist?: string;
}

export function allowedOrigins(config: Config): Set<string> {
  return new Set([config.APP_URL, ...config.CORS_ORIGINS.split(',').map((s) => s.trim())].filter(Boolean));
}

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/**
 * Helmet's default Content-Security-Policy (scripts only from this origin) plus, when the sign-up captcha is on,
 * what the Cloudflare Turnstile widget needs: its script, its iframe and its check request. Nothing else is opened.
 */
export function cspDirectives(captcha: boolean) {
  const directives = { ...helmet.contentSecurityPolicy.getDefaultDirectives() };
  if (captcha) {
    directives['script-src'] = ["'self'", TURNSTILE_ORIGIN];
    directives['frame-src'] = [TURNSTILE_ORIGIN];
    directives['connect-src'] = ["'self'", TURNSTILE_ORIGIN];
  }
  return directives;
}

export function createApp(deps: AppDeps) {
  const { config } = deps;
  const app = express();
  const origins = allowedOrigins(config);
  const opts: RouteOptions = {
    requireEmailVerification: config.REQUIRE_EMAIL_VERIFICATION,
    validateResponses: !config.isProd,
    requireStaffTwoFactor: config.NODE_ENV !== 'development',
  };

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Railway / Cloudflare in front
  app.use(helmet({ contentSecurityPolicy: { directives: cspDirectives(config.TURNSTILE_SITE_KEY !== '') } }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());

  // CORS for our own web apps only (credentials allowed).
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && origins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization');
        res.setHeader('Access-Control-Max-Age', '600');
        res.status(204).end();
        return;
      }
    }
    next();
  });

  // CSRF: state-changing requests must come from an allowed origin (when the browser says where
  // it comes from) and carry JSON, which a cross-site <form> cannot send.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const origin = req.headers.origin;
    if (origin && !origins.has(origin) && origin !== `${req.protocol}://${req.get('host')}`) {
      return next(new AppError('FORBIDDEN', 'Origin not allowed'));
    }
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
      return next(new AppError('VALIDATION_ERROR', 'Content-Type must be application/json'));
    }
    next();
  });

  // Session resolution for every API call.
  app.use('/api', async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = readSessionToken(req);
      req.auth = token ? await deps.auth.authenticate(token) : null;
      if (req.auth && req.auth.user.status === 'locked') throw new AppError('ACCOUNT_LOCKED', 'Account is locked');
      next();
    } catch (err) {
      next(err);
    }
  });

  const router = express.Router();
  route(router, opts, 'health', async () => ({
    status: 'ok' as const,
    time: new Date().toISOString(),
    version: deps.version ?? 'dev',
    market: deps.market.connection,
  }));
  route(router, opts, 'publicConfig', async () => ({
    registration: config.REGISTRATION === 'invite' ? ('INVITE_ONLY' as const) : ('OPEN' as const),
    captchaSiteKey: config.TURNSTILE_SITE_KEY || null,
    emailVerificationRequired: config.REQUIRE_EMAIL_VERIFICATION,
    emailDelivery: config.EMAIL_TRANSPORT === 'resend' ? ('sent' as const) : ('log' as const),
    marketFeed: config.MARKET_FEED,
  }));
  registerAuthRoutes(router, opts, deps.auth, config);
  const exConfig = deps.exchange.config;
  registerMarketRoutes(router, opts, {
    market: deps.market,
    config: exConfig,
    candles: deps.candles,
    depthSnapshots: deps.depthSnapshots ?? new DepthSnapshots(config.MARKET_FEED === 'binance' ? binanceDepthFetcher(config.BINANCE_REST_URL) : null), // sim/off: the 20 live levels only
    sparklines: new SparklineService(deps.candles, deps.market, () => exConfig.allSymbols().map((s) => s.row.symbol)),
  });
  const news = new AnnouncementService(deps.db);
  route(router, opts, 'announcements', async ({ query }) => ({ items: await news.listPublic(query.limit) }));
  registerExchangeRoutes(router, opts, deps.db, deps.exchange, deps.market, config.RATE_LIMIT_SCALE);
  registerAdminRoutes(router, opts, new AdminService(deps.db, deps.exchange, deps.market, deps.futures, deps.bots), news, deps.auth.invites, config.RATE_LIMIT_SCALE);
  registerTaxRoutes(router, opts, new TaxService(deps.db, exConfig), deps.db, config.RATE_LIMIT_SCALE);
  if (deps.futures) registerFuturesRoutes(router, opts, deps.db, deps.futures, deps.market, config.RATE_LIMIT_SCALE);
  if (deps.bots) registerBotRoutes(router, opts, deps.bots, config.RATE_LIMIT_SCALE);
  app.use(router);
  // one origin for both apps: the same session cookie, `/ws` and no CORS (the admin app manages the exchange's users)
  if (deps.adminWebDist) app.use(ADMIN_BASE_PATH, webApp(deps.adminWebDist, { noindex: true }));
  if (deps.webDist) app.use(webApp(deps.webDist, { reserved: [ADMIN_BASE_PATH] }));

  app.use('/api', (_req: Request, _res: Response, next: NextFunction) => next(new AppError('NOT_FOUND', 'No such endpoint')));
  app.use(errorHandler);
  return app;
}
