import type { Router } from 'express';
import type { Db } from '../../db/client.ts';
import { route, type RouteOptions } from '../../lib/http.ts';
import { listMacroEvents, listNewsItems, listSourceHealth } from './newsAdmin.ts';

/**
 * Admin-only news endpoints (Module N, C-D1: no user-facing news). route() enforces the staff role, the 2FA session and
 * the `news.view` permission; the data is exchange-wide (no per-user rows), read-only.
 */
export function registerNewsRoutes(router: Router, opts: RouteOptions, db: Db, clock: () => Date = () => new Date()): void {
  route(router, opts, 'adminNewsItems', async ({ query }) => listNewsItems(db, query));
  route(router, opts, 'adminNewsSources', async () => ({ items: await listSourceHealth(db, clock()) }));
  route(router, opts, 'adminNewsMacroEvents', async ({ query }) => ({ items: await listMacroEvents(db, query, clock()) }));
}
