import type { Router } from 'express';
import { clientIp, route, type RouteOptions } from '../../lib/http.ts';
import { RateLimiter } from '../../lib/rateLimit.ts';
import type { AuthContext } from '../auth/authService.ts';
import type { AdminService, Actor } from './adminService.ts';
import type { AnnouncementService } from '../content/announcementService.ts';

/** Admin API: route() enforces staff role + 2FA session + permission before any handler runs. */
export function registerAdminRoutes(router: Router, opts: RouteOptions, admin: AdminService, news: AnnouncementService, rateLimitScale = 1): void {
  const writeLimit = new RateLimiter(60 * rateLimitScale, 60_000);
  const actor = (auth: AuthContext, req: Parameters<typeof clientIp>[0]): Actor => {
    writeLimit.consume(`admin:${auth.user.id}`);
    return { user: auth.user, ip: clientIp(req) };
  };

  route(router, opts, 'adminOverview', async () => admin.overview());
  route(router, opts, 'adminListUsers', async ({ query }) => admin.listUsers(query));
  route(router, opts, 'adminGetUser', async ({ params }) => admin.getUser(params.userId));
  route(router, opts, 'adminUserOrders', async ({ params, query }) => admin.userOrders(params.userId, query.open === 'true', query.cursor, query.limit));
  route(router, opts, 'adminUserLedger', async ({ params, query }) => admin.userLedger(params.userId, query));

  route(router, opts, 'adminLockUser', async ({ auth, req, params, body }) => admin.setStatus(actor(auth, req), params.userId, 'locked', body.reason));
  route(router, opts, 'adminUnlockUser', async ({ auth, req, params, body }) => admin.setStatus(actor(auth, req), params.userId, 'active', body.reason));
  route(router, opts, 'adminSetSignalsAccess', async ({ auth, req, params, body }) => admin.setSignalsAccess(actor(auth, req), params.userId, body.enabled, body.reason));
  route(router, opts, 'adminSetRole', async ({ auth, req, params, body }) => admin.setRole(actor(auth, req), params.userId, body.role, body.reason));
  route(router, opts, 'adminAdjustBalance', async ({ auth, req, params, body }) => admin.adjustBalance(actor(auth, req), params.userId, body.asset, body.amount, body.reason));
  route(router, opts, 'adminResetAccount', async ({ auth, req, params, body }) => admin.resetAccount(actor(auth, req), params.userId, body.reason));

  route(router, opts, 'adminGetSettings', async () => admin.settings());
  route(router, opts, 'adminUpdateSettings', async ({ auth, req, body }) => admin.updateSettings(actor(auth, req), body));
  route(router, opts, 'adminHaltTrading', async ({ auth, req, body }) => admin.setHalted(actor(auth, req), true, body.reason));
  route(router, opts, 'adminResumeTrading', async ({ auth, req, body }) => admin.setHalted(actor(auth, req), false, body.reason));
  route(router, opts, 'adminListSymbols', async () => ({ items: await admin.listSymbols() }));
  route(router, opts, 'adminUpdateSymbol', async ({ auth, req, params, body }) => admin.updateSymbol(actor(auth, req), params.symbol, body.enabled, body.cancelOpenOrders, body.reason));

  route(router, opts, 'adminAuditLogs', async ({ query }) => admin.auditLogs(query));
  route(router, opts, 'adminReconciliationRuns', async ({ query }) => admin.reconciliationRuns(query.cursor, query.limit));
  route(router, opts, 'adminRunReconciliation', async ({ auth, req }) => admin.runReconciliation(actor(auth, req)));

  route(router, opts, 'adminUpdateAsset', async ({ auth, req, params, body }) => admin.updateAsset(actor(auth, req), params.asset, body, body.reason));
  route(router, opts, 'adminListAnnouncements', async ({ query }) => news.listAdmin(query.includeHidden === 'true', query.cursor, query.limit));
  route(router, opts, 'adminCreateAnnouncement', async ({ auth, req, body }) => news.create(actor(auth, req), body));
  route(router, opts, 'adminUpdateAnnouncement', async ({ auth, req, params, body }) => news.update(actor(auth, req), params.announcementId, body));
}
