/** Fixtures for the AD3 admin actions (cancel a user's orders, revoke sessions). */
import type { AdminCancelOrderResult, AdminCancelOrdersResult, AdminRevokeSessionsResult } from '../index.ts';

/** Sessions the mock knows for the demo user (revoke one → the other stays; unknown id → NOT_FOUND). */
export const fixtureAdminSessionIds = ['a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002'] as const;

/** Cancelling one leg of the demo user's OCO list cancels both legs. */
export const fixtureAdminCancelOrderResult: AdminCancelOrderResult = {
  market: 'SPOT',
  orderId: '103',
  canceledOrderIds: ['103', '104'],
  stoppedBotId: null,
  auditLogId: '9101',
};

export const fixtureAdminCancelOrdersResult: AdminCancelOrdersResult = {
  spotCanceled: 4,
  futuresCanceled: 1,
  stoppedBotIds: [],
  auditLogIds: ['9102', '9103'],
};

export const fixtureAdminRevokeSessionsResult: AdminRevokeSessionsResult = { revoked: 1, auditLogId: '9104' };
