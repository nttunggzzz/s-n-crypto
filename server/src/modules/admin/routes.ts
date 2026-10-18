import type { Router } from 'express';
import { clientIp, route, type RouteOptions } from '../../lib/http.ts';
import { RateLimiter } from '../../lib/rateLimit.ts';
import type { AuthContext } from '../auth/authService.ts';
import type { AdminService, Actor } from './adminService.ts';
import type { AnnouncementService } from '../content/announcementService.ts';
import type { InviteService } from '../auth/inviteService.ts';

/** Admin API: route() enforces staff role + 2FA session + permission before any handler runs. */
export function registerAdminRoutes(router: Router, opts: RouteOptions, admin: AdminService, news: AnnouncementService, invites: InviteService, rateLimitScale = 1): void {
  const writeLimit = new RateLimiter(60 * rateLimitScale, 60_000);
  const actor = (auth: AuthContext, req: Parameters<typeof clientIp>[0]): Actor => {
    writeLimit.consume(`admin:${auth.user.id}`);
    return { user: auth.user, ip: clientIp(req) };
  };

  route(router, opts, 'adminOverview', async () => admin.overview());
  route(router, opts, 'adminListUsers', async ({ query }) => admin.listUsers(query));
  // AD1: read-only lookup and export. The export path is registered before ':userId' routes.
  const exportLimit = new RateLimiter(10 * rateLimitScale, 60_000);
  route(router, opts, 'adminUsersExport', async ({ auth, query }) => {
    exportLimit.consume(`admin-export:${auth.user.id}`);
    return admin.usersExport(query);
  });
  route(router, opts, 'adminAuditExport', async ({ auth, query }) => {
    exportLimit.consume(`admin-export:${auth.user.id}`);
    return admin.auditExport(query);
  });
  route(router, opts, 'adminSearchOrders', async ({ query }) => admin.searchOrders(query));
  route(router, opts, 'adminSearchTrades', async ({ query }) => admin.searchTrades(query));
  route(router, opts, 'adminUserSessions', async ({ params }) => admin.userSessions(params.userId));
  route(router, opts, 'adminGetUser', async ({ params }) => admin.getUser(params.userId));
  route(router, opts, 'adminUserOrders', async ({ params, query }) => admin.userOrders(params.userId, query.open === 'true', query.cursor, query.limit));
  route(router, opts, 'adminUserLedger', async ({ params, query }) => admin.userLedger(params.userId, query));
  route(router, opts, 'adminUserFuturesPositions', async ({ params, query }) => admin.userFuturesPositions(params.userId, query.open === 'true', query.cursor, query.limit));
  route(router, opts, 'adminUserBots', async ({ params }) => admin.userBots(params.userId));
  route(router, opts, 'adminUserLoginHistory', async ({ params, query }) => admin.userLoginHistory(params.userId, query.cursor, query.limit));
  route(router, opts, 'adminStopGridBot', async ({ auth, req, params, body }) => admin.stopGridBot(actor(auth, req), params.userId, params.botId, body.reason, body.sellBase));
  route(router, opts, 'adminCancelDcaPlan', async ({ auth, req, params, body }) => admin.cancelDcaPlan(actor(auth, req), params.userId, params.planId, body.reason));

  route(router, opts, 'adminLockUser', async ({ auth, req, params, body }) => admin.setStatus(actor(auth, req), params.userId, 'locked', body.reason));
  route(router, opts, 'adminUnlockUser', async ({ auth, req, params, body }) => admin.setStatus(actor(auth, req), params.userId, 'active', body.reason));
  route(router, opts, 'adminSetSignalsAccess', async ({ auth, req, params, body }) => admin.setSignalsAccess(actor(auth, req), params.userId, body.enabled, body.reason));
  route(router, opts, 'adminSetRole', async ({ auth, req, params, body }) => admin.setRole(actor(auth, req), params.userId, body.role, body.reason));
  route(router, opts, 'adminAdjustBalance', async ({ auth, req, params, body }) => admin.adjustBalance(actor(auth, req), params.userId, body.asset, body.amount, body.reason, body.account));
  route(router, opts, 'adminCancelUserOrder', async ({ auth, req, params, body }) => admin.cancelUserOrder(actor(auth, req), params.userId, params.orderId, body.market, body.reason));
  route(router, opts, 'adminCancelUserOrders', async ({ auth, req, params, body }) => admin.cancelUserOrders(actor(auth, req), params.userId, body.market, body.symbol, body.reason));
  route(router, opts, 'adminRevokeSession', async ({ auth, req, params, body }) => admin.revokeSession(actor(auth, req), params.userId, params.sessionId, body.reason));
  route(router, opts, 'adminRevokeAllSessions', async ({ auth, req, params, body }) => admin.revokeAllSessions(actor(auth, req), params.userId, body.reason));
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
  route(router, opts, 'adminListInvites', async ({ query }) => invites.list(query.status, query.cursor, query.limit));
  route(router, opts, 'adminCreateInvite', async ({ auth, req, body }) => invites.create(actor(auth, req), body));
  route(router, opts, 'adminRevokeInvite', async ({ auth, req, params, body }) => invites.revoke(actor(auth, req), params.inviteId, body.reason));
}
