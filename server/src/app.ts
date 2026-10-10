import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Config } from './config.ts';
import type { Db } from './db/client.ts';
import { AppError } from './lib/errors.ts';
import { errorHandler, readSessionToken, route, type RouteOptions } from './lib/http.ts';
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
}

export function allowedOrigins(config: Config): Set<string> {
  return new Set([config.APP_URL, ...config.CORS_ORIGINS.split(',').map((s) => s.trim())].filter(Boolean));
}

export function createApp(deps: AppDeps) {
  const { config } = deps;
  const app = express();
  const origins = allowedOrigins(config);
  const opts: RouteOptions = { requireEmailVerification: config.REQUIRE_EMAIL_VERIFICATION, validateResponses: !config.isProd };

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Railway / Cloudflare in front
  app.use(helmet());
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
  registerAuthRoutes(router, opts, deps.auth, config);
  const exConfig = deps.exchange.config;
  registerMarketRoutes(router, opts, {
    market: deps.market,
    config: exConfig,
    candles: deps.candles,
    depthSnapshots: deps.depthSnapshots ?? new DepthSnapshots(config.MARKET_FEED === 'binance' ? binanceDepthFetcher(config.BINANCE_REST_URL) : null),
    sparklines: new SparklineService(deps.candles, deps.market, () => exConfig.allSymbols().map((s) => s.row.symbol)),
  });
  const news = new AnnouncementService(deps.db);
  route(router, opts, 'announcements', async ({ query }) => ({ items: await news.listPublic(query.limit) }));
  registerExchangeRoutes(router, opts, deps.db, deps.exchange, deps.market, config.RATE_LIMIT_SCALE);
  registerAdminRoutes(router, opts, new AdminService(deps.db, deps.exchange, deps.market, deps.futures, deps.bots), news, config.RATE_LIMIT_SCALE);
  if (deps.futures) registerFuturesRoutes(router, opts, deps.db, deps.futures, deps.market, config.RATE_LIMIT_SCALE);
  if (deps.bots) registerBotRoutes(router, opts, deps.bots, config.RATE_LIMIT_SCALE);
  app.use(router);

  app.use('/api', (_req: Request, _res: Response, next: NextFunction) => next(new AppError('NOT_FOUND', 'No such endpoint')));
  app.use(errorHandler);
  return app;
}
