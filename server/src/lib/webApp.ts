import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';

/**
 * Serves a web app's production build (Vite `dist/`) on the API's origin, so cookies and `/ws` need
 * no CORS and the whole exchange is one service (CLAUDE.md invariant 5: one server process).
 * - `/assets/<name>.<ext>` (content-hashed by Vite): cached for a year, 404 when missing (`/assets`, `/assets/analysis` are pages).
 * - other files (favicon, robots.txt…): cached for an hour.
 * - any other GET that wants HTML (`/trade/BTCUSDT`, `/assets` page…): `index.html`, never cached,
 *   so a deploy is picked up on the next page load. `/api/*` and `/ws` are never answered here.
 * The admin app is a second build mounted at `/admin` (`app.use('/admin', webApp(adminDist, { noindex: true }))`);
 * the exchange app lists `/admin` in `reserved` so it never answers admin paths with its own pages.
 */
export function webApp(dist: string, opts: { reserved?: string[]; noindex?: boolean } = {}): express.Router {
  const index = path.join(dist, 'index.html');
  if (!existsSync(index)) throw new Error(`WEB_DIST=${dist} has no index.html — build the app first`);
  const router = express.Router();
  if (opts.noindex) router.use((_req: Request, res: Response, next: NextFunction) => (res.setHeader('X-Robots-Tag', 'noindex, nofollow'), next()));
  // `/assets` and `/assets/analysis` are also pages of the exchange app — only `/assets/<name>.<ext>` is a file
  router.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '365d', index: false, redirect: false }));
  router.get(/^\/assets\/[^/]+\.\w+$/, (_req: Request, res: Response) => void res.status(404).type('text/plain').send('Not found'));
  router.use(express.static(dist, { index: false, maxAge: '1h', redirect: false }));
  const prefixes = ['/api', '/ws', ...(opts.reserved ?? [])];
  const notOurs = (p: string) => prefixes.some((x) => p === x || p.startsWith(`${x}/`));
  router.get(/.*/, (req: Request, res: Response, next: NextFunction) => {
    if (notOurs(req.path) || !req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
  return router;
}
