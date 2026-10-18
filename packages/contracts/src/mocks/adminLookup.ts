/**
 * ⚠️ Mock resolvers of batch AD1 (admin lookup and export). Same rules as the server: market required, user = uuid or
 * 8-digit UID (unknown = 404), newest first, cursor = id of the last row, same permissions.
 */
import type { EndpointName } from '../index.ts';
import { AUDIT_EXPORT_COLUMNS, USERS_EXPORT_COLUMNS, csvTextCell } from '../adminLookup.ts';
import { fixtureAdminOrderRows, fixtureAdminTradeRows, fixtureAdminUserSessions } from '../fixtures/adminLookup.ts';
import { MockError, requireStaff, type Resolver } from './common.ts';
import { findUser } from './admin.ts';
import { mockStore } from './store.ts';

type AdminLookupEndpoint = 'adminSearchOrders' | 'adminSearchTrades' | 'adminUserSessions' | 'adminAuditExport' | 'adminUsersExport';

const MAX_EXPORT_ROWS = 10_000;

function csv(header: readonly string[], rows: (string | null)[][]): string {
  const esc = (v: string | null) => (v === null ? '' : /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}
const vnTime = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);

function userIdOf(ref: string | null): string | null {
  if (ref === null) return null;
  const u = mockStore.adminUsers.find((x) => x.id === ref.toLowerCase() || x.uid === ref);
  if (!u) throw new MockError('NOT_FOUND', 'User not found');
  return u.id;
}

function page<T extends { id: string }>(rows: T[], q: URLSearchParams): { items: T[]; nextCursor: string | null } {
  const limit = Number(q.get('limit') ?? 50);
  const cursor = q.get('cursor');
  const start = cursor === null ? 0 : rows.findIndex((r) => r.id === cursor) + 1;
  if (cursor !== null && start === 0) return { items: [], nextCursor: null };
  const items = rows.slice(start, start + limit);
  return { items, nextCursor: start + limit < rows.length ? items[items.length - 1]!.id : null };
}

function market(q: URLSearchParams): 'SPOT' | 'FUTURES' {
  const m = q.get('market');
  if (m !== 'SPOT' && m !== 'FUTURES') throw new MockError('VALIDATION_ERROR', 'market is required (SPOT or FUTURES)');
  return m;
}
const inRange = (iso: string, q: URLSearchParams) => (!q.get('from') || Date.parse(iso) >= Date.parse(q.get('from')!)) && (!q.get('to') || Date.parse(iso) <= Date.parse(q.get('to')!));

export const adminLookupResolvers: { [N in Extract<EndpointName, AdminLookupEndpoint>]: Resolver<N> } = {
  adminSearchOrders: ({ query }) => {
    requireStaff('users.read');
    const m = market(query);
    const userId = userIdOf(query.get('user'));
    const status = query.get('status') ?? 'all';
    const open = (s: string) => s === 'NEW' || s === 'PARTIALLY_FILLED';
    return page(
      fixtureAdminOrderRows.filter(
        (o) =>
          o.market === m &&
          (!userId || o.userId === userId) &&
          (!query.get('symbol') || o.symbol === query.get('symbol')) &&
          (!query.get('side') || o.side === query.get('side')) &&
          (!query.get('orderId') || o.id === query.get('orderId')) &&
          (!query.get('clientOrderId') || o.clientOrderId === query.get('clientOrderId')) &&
          (status === 'all' || (status === 'open') === open(o.status)) &&
          inRange(o.createdAt, query),
      ),
      query,
    );
  },
  adminSearchTrades: ({ query }) => {
    requireStaff('users.read');
    const m = market(query);
    const userId = userIdOf(query.get('user'));
    return page(
      fixtureAdminTradeRows.filter(
        (t) =>
          t.market === m &&
          (!userId || t.userId === userId) &&
          (!query.get('symbol') || t.symbol === query.get('symbol')) &&
          (!query.get('side') || t.side === query.get('side')) &&
          (!query.get('orderId') || t.orderId === query.get('orderId')) &&
          inRange(t.createdAt, query),
      ),
      query,
    );
  },
  adminUserSessions: ({ params }) => {
    requireStaff('users.read');
    const u = findUser(params.userId!);
    return { items: u.id === mockStore.adminUsers[0]!.id ? fixtureAdminUserSessions : [] };
  },
  adminAuditExport: ({ query }) => {
    requireStaff('audit.read');
    const rows = mockStore.auditLogs
      .filter((e) => (!query.get('action') || e.action === query.get('action')) && (!query.get('actorId') || e.actor?.id === query.get('actorId')) && (!query.get('targetId') || e.targetId === query.get('targetId')) && inRange(e.createdAt, query))
      .slice(0, MAX_EXPORT_ROWS);
    return csv(
      AUDIT_EXPORT_COLUMNS,
      rows.map((e) => [
        e.id,
        e.createdAt,
        vnTime(e.createdAt),
        e.actor?.id ?? null,
        csvTextCell(e.actor?.email ?? null),
        e.action,
        e.targetType,
        e.targetId,
        csvTextCell(e.reason),
        csvTextCell(e.ip),
        csvTextCell(e.before === null || e.before === undefined ? null : JSON.stringify(e.before)),
        csvTextCell(e.after === null || e.after === undefined ? null : JSON.stringify(e.after)),
      ]),
    );
  },
  adminUsersExport: ({ query }) => {
    requireStaff('users.export');
    const q = query.get('q')?.toLowerCase();
    const rows = mockStore.adminUsers
      .filter((u) => (!q || u.email.includes(q) || u.id === q || u.uid === q) && (!query.get('role') || u.role === query.get('role')) && (!query.get('status') || u.status === query.get('status')))
      .slice(0, MAX_EXPORT_ROWS);
    return csv(
      USERS_EXPORT_COLUMNS,
      rows.map((u) => [u.uid, u.id, csvTextCell(u.email), csvTextCell(u.name), u.role, u.status, String(u.emailVerified), String(u.twoFactorEnabled), String(u.signalsAccess), String(u.isBot), u.createdAt, u.lastSeenAt]),
    );
  },
};
