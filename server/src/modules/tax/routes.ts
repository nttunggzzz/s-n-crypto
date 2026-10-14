import type { Router } from 'express';
import type { Db } from '../../db/client.ts';
import { clientIp, route, type RouteOptions } from '../../lib/http.ts';
import { RateLimiter } from '../../lib/rateLimit.ts';
import { exportAdminTaxCsv, exportTaxCsv } from '../exchange/exports.ts';
import { cursorId, page } from '../exchange/routes.ts';
import { adminTaxSummary, serializeAdminWithholding, serializeWithholding, userTaxSummary, withholdingRows } from './reports.ts';
import type { TaxService } from './taxService.ts';

/**
 * Vietnam tax endpoints: settings + profile (batch T2) and the reports (batch T3: summary, record list, CSV - for the
 * user and for staff). route() enforces auth, the staff role + 2FA session + permission (`tax.read` for the reports).
 * The user reports are always filtered by the session user; there is no id in any path, so nothing to 404 on.
 */
export function registerTaxRoutes(router: Router, opts: RouteOptions, tax: TaxService, db: Db, rateLimitScale = 1): void {
  const writeLimit = new RateLimiter(30 * rateLimitScale, 60_000);
  const exportLimit = new RateLimiter(10 * rateLimitScale, 60_000);

  route(router, opts, 'taxProfile', async ({ auth }) => tax.profile(auth.user.id));
  route(router, opts, 'taxUpdateProfile', async ({ auth, body }) => {
    writeLimit.consume(`tax-profile:${auth.user.id}`);
    return tax.updateProfile(auth.user.id, body.category);
  });

  route(router, opts, 'adminTaxSettings', async () => tax.settings());
  route(router, opts, 'adminUpdateTaxSettings', async ({ auth, req, body }) => {
    writeLimit.consume(`admin:${auth.user.id}`);
    return tax.updateSettings({ user: auth.user, ip: clientIp(req) }, body);
  });

  // ───── reports - user (own data only)

  route(router, opts, 'taxSummary', async ({ auth, query }) => userTaxSummary(db, auth.user.id, query.year));
  route(router, opts, 'taxWithholdings', async ({ auth, query }) => {
    const rows = await withholdingRows(db, { userId: auth.user.id, symbol: query.symbol, from: query.from, to: query.to }, { cursor: cursorId(query.cursor), take: query.limit + 1 });
    const p = page(rows, query.limit);
    return { items: p.items.map(serializeWithholding), nextCursor: p.nextCursor };
  });
  route(router, opts, 'taxExport', async ({ auth, query }) => {
    exportLimit.consume(`tax-export:${auth.user.id}`);
    return exportTaxCsv(db, auth.user.id, query);
  });

  // ───── reports - staff (tax.read)

  route(router, opts, 'adminTaxSummary', async ({ query }) => adminTaxSummary(db, query.period));
  route(router, opts, 'adminTaxWithholdings', async ({ query }) => {
    const rows = await withholdingRows(db, { userId: query.userId, symbol: query.symbol, from: query.from, to: query.to }, { cursor: cursorId(query.cursor), take: query.limit + 1 });
    const p = page(rows, query.limit);
    return { items: p.items.map(serializeAdminWithholding), nextCursor: p.nextCursor };
  });
  route(router, opts, 'adminTaxExport', async ({ auth, query }) => {
    exportLimit.consume(`tax-export:${auth.user.id}`);
    return exportAdminTaxCsv(db, query);
  });
}
