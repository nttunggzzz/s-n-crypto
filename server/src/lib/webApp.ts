import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';

/**
 * Serves a web app's production build (Vite `dist/`) on the API's origin, so cookies and `/ws` need
 * no CORS and the whole exchange is one service (CLAUDE.md invariant 5: one server process).
 * - `/assets/<file>` (content-hashed by Vite): cached for a year, 404 when missing (`/assets` itself is a page).
 * - other files (favicon, robots.txt…): cached for an hour.
 * - any other GET that wants HTML (`/trade/BTCUSDT`, `/assets` page…): `index.html`, never cached,
 *   so a deploy is picked up on the next page load. `/api/*` and `/ws` are never answered here.
 */
export function webApp(dist: string): express.Router {
  const index = path.join(dist, 'index.html');
  if (!existsSync(index)) throw new Error(`WEB_DIST=${dist} has no index.html — build the app first`);
  const router = express.Router();
  // `/assets` alone is also a page of the exchange app (the wallet) — only `/assets/<file>` is a file
  router.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '365d', index: false, redirect: false }));
  router.get(/^\/assets\/./, (_req: Request, res: Response) => void res.status(404).type('text/plain').send('Not found'));
  router.use(express.static(dist, { index: false, maxAge: '1h', redirect: false }));
  router.get(/^(?!\/api(\/|$)|\/ws(\/|$)).*/, (req: Request, res: Response, next: NextFunction) => {
    if (!req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
  return router;
}
