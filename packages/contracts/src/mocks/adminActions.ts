/**
 * ⚠️ Mock resolvers for the AD3 admin actions - UI development only.
 * Same rules as the server: a reason is required (schema), the bot account is protected (the server also refuses your
 * own account and an equal/higher role; the mock persona is staff AND the demo user, so it does not check that), an order that is not the user's (or not in the demo store) is NOT_FOUND, a closed order is
 * ORDER_NOT_CANCELABLE, canceled orders get closeReason ADMIN, an OCO cancels as a whole. Only the demo user has orders
 * and sessions in the mock store.
 */
import { fixtureAdminSessionIds } from '../fixtures/index.ts';
import { cancel, isOpen } from './engine.ts';
import { audit, findUser } from './admin.ts';
import { finishOrder } from './futures.ts';
import { MockError, requireStaff, type Resolver } from './common.ts';
import { mockStore } from './store.ts';

type AdminActionEndpoint = 'adminCancelUserOrder' | 'adminCancelUserOrders' | 'adminRevokeSession' | 'adminRevokeAllSessions';

const isDemoUser = (userId: string) => userId.endsWith('000000000001');

function guardTarget(userId: string) {
  const u = findUser(userId);
  if (u.isBot) throw new MockError('BOT_ACCOUNT_PROTECTED', 'The signal bot account cannot be modified');
  return u;
}

/** Live (not revoked) session ids of the demo user. */
const liveSessions = (userId: string): string[] => (isDemoUser(userId) ? fixtureAdminSessionIds.filter((id) => !mockStore.adminRevokedSessions.has(id)) : []);

export const adminActionResolvers: { [N in AdminActionEndpoint]: Resolver<N> } = {
  adminCancelUserOrder: ({ params, body }) => {
    requireStaff('orders.manage');
    const u = guardTarget(params.userId!);
    const market = body.market === 'FUTURES' ? 'FUTURES' : 'SPOT';
    const demo = isDemoUser(u.id);
    const canceledOrderIds: string[] = [];
    if (market === 'SPOT') {
      const o = demo ? [...mockStore.openOrders, ...mockStore.history].find((x) => x.id === params.orderId) : undefined;
      if (!o) throw new MockError('NOT_FOUND', 'Order not found');
      if (!isOpen(o)) throw new MockError('ORDER_NOT_CANCELABLE', `Order is ${o.status}`);
      const before = mockStore.openOrders.filter(isOpen).map((x) => x.id);
      cancel(o, 'ADMIN');
      const stillOpen = new Set(mockStore.openOrders.filter(isOpen).map((x) => x.id));
      for (const id of before) if (!stillOpen.has(id)) canceledOrderIds.push(id);
      mockStore.openOrders = mockStore.openOrders.filter((x) => isOpen(x));
    } else {
      const o = demo ? [...mockStore.futures.orders, ...mockStore.futures.history].find((x) => x.id === params.orderId) : undefined;
      if (!o) throw new MockError('NOT_FOUND', 'Order not found');
      if (o.status !== 'NEW' && o.status !== 'PARTIALLY_FILLED') throw new MockError('ORDER_NOT_CANCELABLE', `Order is ${o.status}`);
      finishOrder(o, 'CANCELED', 'ADMIN');
      canceledOrderIds.push(o.id);
    }
    const auditLogId = audit({
      action: 'ORDER_CANCEL',
      targetType: 'USER',
      targetId: u.id,
      before: { market, orderId: params.orderId, status: 'NEW' },
      after: { canceledOrderIds, closeReason: 'ADMIN', stoppedBotId: null },
      reason: String(body.reason),
    });
    return { market, orderId: params.orderId!, canceledOrderIds, stoppedBotId: null, auditLogId };
  },
  adminCancelUserOrders: ({ params, body }) => {
    requireStaff('orders.manage');
    const u = guardTarget(params.userId!);
    const demo = isDemoUser(u.id);
    const symbol = typeof body.symbol === 'string' ? body.symbol : undefined;
    const auditLogIds: string[] = [];
    let spotCanceled = 0;
    let futuresCanceled = 0;
    if (demo && body.market !== 'FUTURES') {
      const open = mockStore.openOrders.filter((o) => isOpen(o) && (!symbol || o.symbol === symbol));
      const before = new Set(mockStore.openOrders.filter(isOpen).map((x) => x.id));
      for (const o of open) if (isOpen(o)) cancel(o, 'ADMIN');
      const after = new Set(mockStore.openOrders.filter(isOpen).map((x) => x.id));
      const gone = [...before].filter((id) => !after.has(id));
      mockStore.openOrders = mockStore.openOrders.filter((x) => isOpen(x));
      spotCanceled = gone.length;
      if (spotCanceled) auditLogIds.push(audit({ action: 'ORDER_CANCEL', targetType: 'USER', targetId: u.id, before: { market: 'SPOT', symbol: symbol ?? null }, after: { canceled: spotCanceled, closeReason: 'ADMIN', canceledOrderIds: gone }, reason: String(body.reason) }));
    }
    if (demo && body.market !== 'SPOT') {
      const open = mockStore.futures.orders.filter((o) => !symbol || o.symbol === symbol);
      for (const o of open) finishOrder(o, 'CANCELED', 'ADMIN');
      futuresCanceled = open.length;
      if (futuresCanceled) auditLogIds.push(audit({ action: 'ORDER_CANCEL', targetType: 'USER', targetId: u.id, before: { market: 'FUTURES', symbol: symbol ?? null }, after: { canceled: futuresCanceled, closeReason: 'ADMIN', canceledOrderIds: open.map((o) => o.id) }, reason: String(body.reason) }));
    }
    return { spotCanceled, futuresCanceled, stoppedBotIds: [], auditLogIds };
  },
  adminRevokeSession: ({ params, body }) => {
    requireStaff('users.lock');
    const u = guardTarget(params.userId!);
    const id = params.sessionId!;
    if (!liveSessions(u.id).includes(id)) throw new MockError('NOT_FOUND', 'Session not found');
    mockStore.adminRevokedSessions.add(id);
    const auditLogId = audit({ action: 'SESSION_REVOKE', targetType: 'USER', targetId: u.id, before: { sessionId: id }, after: { revoked: 1 }, reason: String(body.reason) });
    return { revoked: 1, auditLogId };
  },
  adminRevokeAllSessions: ({ params, body }) => {
    requireStaff('users.lock');
    const u = guardTarget(params.userId!);
    const live = liveSessions(u.id);
    for (const id of live) mockStore.adminRevokedSessions.add(id);
    if (live.length === 0) return { revoked: 0, auditLogId: null };
    const auditLogId = audit({ action: 'SESSION_REVOKE', targetType: 'USER', targetId: u.id, before: { sessionIds: live }, after: { revoked: live.length }, reason: String(body.reason) });
    return { revoked: live.length, auditLogId };
  },
};
