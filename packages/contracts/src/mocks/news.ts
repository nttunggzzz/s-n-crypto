/**
 * ⚠️ Mock resolvers of the admin news endpoints (0.17.0) — UI development only.
 * Same rules as the server will have ("mock = server"): staff + 2FA + `news.view`; the query is already validated
 * against `AdminNewsItemsQuery` by the handler (VALIDATION_ERROR); newest `firstSeenAt` first; the cursor is the id
 * of the last item of the previous page (unknown cursor → empty page); `from`/`to` bound `firstSeenAt` inclusively.
 */
import type { EndpointName } from '../index.ts';
import { fixtureNewsItems, fixtureNewsSources } from '../fixtures/news.ts';
import { requireStaff, type Resolver } from './common.ts';

type NewsEndpoint = 'adminNewsItems' | 'adminNewsSources';

export const newsResolvers: { [N in Extract<EndpointName, NewsEndpoint>]: Resolver<N> } = {
  adminNewsItems: ({ query }) => {
    requireStaff('news.view');
    const symbol = query.get('symbol');
    const eventType = query.get('eventType');
    const source = query.get('source');
    const from = query.get('from');
    const to = query.get('to');
    const rows = fixtureNewsItems.filter(
      (n) =>
        (!symbol || n.symbols.includes(symbol)) &&
        (!eventType || n.eventTypes.some((t) => t === eventType)) &&
        (!source || n.source === source) &&
        (!from || Date.parse(n.firstSeenAt) >= Date.parse(from)) &&
        (!to || Date.parse(n.firstSeenAt) <= Date.parse(to)),
    );
    const limit = Number(query.get('limit') ?? 50);
    const cursor = query.get('cursor');
    const start = cursor === null ? 0 : rows.findIndex((r) => r.id === cursor) + 1;
    if (cursor !== null && start === 0) return { items: [], nextCursor: null };
    const items = rows.slice(start, start + limit);
    return { items, nextCursor: start + limit < rows.length ? items[items.length - 1]!.id : null };
  },
  adminNewsSources: () => (requireStaff('news.view'), { items: fixtureNewsSources }),
};
