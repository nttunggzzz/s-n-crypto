/**
 * ⚠️ Mock resolvers of the admin news endpoints (0.17.0) — UI development only.
 * Same rules as the server will have ("mock = server"): staff + 2FA + `news.view`; the query is already validated against
 * its schema by the handler (VALIDATION_ERROR). Items: order `(firstSeenAt DESC, id DESC)`, opaque base64url cursor of
 * `firstSeenAt|id`, next page = strictly before the cursor, malformed cursor = VALIDATION_ERROR (like `adminListUsers`).
 */
import type { EndpointName } from '../index.ts';
import { NEWS_MACRO_EVENTS_MAX_DAYS } from '../news.ts';
import { fixtureMacroEvents, fixtureNewsItems, fixtureNewsSources } from '../fixtures/news.ts';
import { MockError, now, requireStaff, type Resolver } from './common.ts';

type NewsEndpoint = 'adminNewsItems' | 'adminNewsSources' | 'adminNewsMacroEvents';

const encodeCursor = (firstSeenAt: string, id: string) => btoa(`${firstSeenAt}|${id}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function decodeCursor(c: string): { t: number; id: string } {
  let text: string;
  try {
    text = atob(c.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    throw new MockError('VALIDATION_ERROR', 'Invalid cursor');
  }
  const sep = text.indexOf('|');
  const t = Date.parse(text.slice(0, sep));
  const id = text.slice(sep + 1);
  if (sep < 0 || !id || Number.isNaN(t)) throw new MockError('VALIDATION_ERROR', 'Invalid cursor');
  return { t, id };
}

const DAY_MS = 86_400_000;

export const newsResolvers: { [N in Extract<EndpointName, NewsEndpoint>]: Resolver<N> } = {
  adminNewsItems: ({ query }) => {
    requireStaff('news.view');
    const symbol = query.get('symbol');
    const eventType = query.get('eventType');
    const sourceId = query.get('sourceId');
    const from = query.get('from');
    const to = query.get('to');
    const cursor = query.get('cursor');
    const after = cursor === null ? null : decodeCursor(cursor);
    const limit = Number(query.get('limit') ?? 50);
    const rows = fixtureNewsItems
      .filter(
        (n) =>
          (!symbol || n.symbols.includes(symbol)) &&
          (!eventType || n.eventTypes.some((t) => t === eventType)) &&
          (!sourceId || n.sourceId === sourceId) &&
          (!from || Date.parse(n.firstSeenAt) >= Date.parse(from)) &&
          (!to || Date.parse(n.firstSeenAt) <= Date.parse(to)),
      )
      .sort((a, b) => Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
      .filter((n) => {
        if (after === null) return true;
        const t = Date.parse(n.firstSeenAt);
        return t < after.t || (t === after.t && n.id < after.id);
      });
    const items = rows.slice(0, limit);
    return { items, nextCursor: rows.length > limit ? encodeCursor(items[items.length - 1]!.firstSeenAt, items[items.length - 1]!.id) : null };
  },
  adminNewsSources: () => (requireStaff('news.view'), { items: fixtureNewsSources }),
  adminNewsMacroEvents: ({ query }) => {
    requireStaff('news.view');
    const code = query.get('code');
    const importance = query.get('importance');
    const span = NEWS_MACRO_EVENTS_MAX_DAYS * DAY_MS;
    const from = query.get('from') !== null ? Date.parse(query.get('from')!) : query.get('to') !== null ? Date.parse(query.get('to')!) - span : Date.parse(now());
    const to = query.get('to') !== null ? Date.parse(query.get('to')!) : from + span;
    return {
      items: fixtureMacroEvents
        .filter((e) => (!code || e.code === code) && (!importance || e.importance === importance) && Date.parse(e.scheduledAt) >= from && Date.parse(e.scheduledAt) <= to)
        .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)),
    };
  },
};
