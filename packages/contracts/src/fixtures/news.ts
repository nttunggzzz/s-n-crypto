/**
 * Module N fixtures (0.17.0) — UI development only. Times are fixed (UTC) so mock output is reproducible.
 * Covers: item with tone (GDELT) and without (RSS, official), `publishedAt: null`, `symbols: []` (macro-wide),
 * one STALE source and one UNAVAILABLE source, an upcoming HIGH macro event and a released one with `actual`.
 */
import type { AnalysisNewsContext, NewsItemAdmin, NewsSourceHealth, SnapshotMacroEvent, SnapshotNews } from '../index.ts';

export const NEWS_CLASSIFIER_VERSION = 'rules-v0.1';

/** Newest `firstSeenAt` first (the order the admin list returns). */
export const fixtureNewsItems: NewsItemAdmin[] = [
  {
    id: 'n-006',
    title: 'Exchange pauses BTC withdrawals after wallet incident',
    url: 'https://example.com/news/exchange-pauses-btc-withdrawals',
    source: 'Crypto RSS A',
    publishedAt: null,
    firstSeenAt: '2026-10-14T08:20:00.000Z',
    symbols: ['BTCUSDT'],
    eventTypes: ['EXCHANGE_INCIDENT', 'HACK_EXPLOIT'],
    tone: null,
    classifierVersion: NEWS_CLASSIFIER_VERSION,
    sourceKind: 'RSS',
    ingestedRunId: 'run-0412',
  },
  {
    id: 'n-005',
    title: 'Spot ETH ETF sees record weekly inflows',
    url: 'https://example.com/news/eth-etf-inflows',
    source: 'GDELT GKG',
    publishedAt: '2026-10-14T07:45:00.000Z',
    firstSeenAt: '2026-10-14T08:00:00.000Z',
    symbols: ['ETHUSDT'],
    eventTypes: ['ETF'],
    tone: '3.2',
    classifierVersion: NEWS_CLASSIFIER_VERSION,
    sourceKind: 'GDELT',
    ingestedRunId: 'run-0411',
  },
  {
    id: 'n-004',
    title: 'Fed officials signal patience on rates',
    url: 'https://example.com/news/fed-patience',
    source: 'GDELT GKG',
    publishedAt: '2026-10-14T05:30:00.000Z',
    firstSeenAt: '2026-10-14T05:45:00.000Z',
    symbols: [],
    eventTypes: ['CENTRAL_BANK', 'MACRO_DATA'],
    tone: '-1.4',
    classifierVersion: NEWS_CLASSIFIER_VERSION,
    sourceKind: 'GDELT',
    ingestedRunId: 'run-0409',
  },
  {
    id: 'n-003',
    title: 'Regulator opens inquiry into token issuer',
    url: 'https://example.com/news/regulator-inquiry',
    source: 'Official Releases',
    publishedAt: '2026-10-13T20:00:00.000Z',
    firstSeenAt: '2026-10-13T20:10:00.000Z',
    symbols: ['SOLUSDT'],
    eventTypes: ['REGULATORY_ACTION'],
    tone: null,
    classifierVersion: NEWS_CLASSIFIER_VERSION,
    sourceKind: 'RSS',
    ingestedRunId: 'run-0398',
  },
  {
    id: 'n-002',
    title: 'Exchange lists a new perpetual market',
    url: 'https://example.com/news/new-perp-listing',
    source: 'Crypto RSS A',
    publishedAt: '2026-10-13T11:00:00.000Z',
    firstSeenAt: '2026-10-13T11:05:00.000Z',
    symbols: ['BNBUSDT'],
    eventTypes: ['LISTING'],
    tone: null,
    classifierVersion: NEWS_CLASSIFIER_VERSION,
    sourceKind: 'RSS',
    ingestedRunId: 'run-0390',
  },
  {
    id: 'n-001',
    title: 'Retail payments firm adds stablecoin settlement',
    url: 'https://example.com/news/stablecoin-settlement',
    source: 'GDELT GKG',
    publishedAt: '2026-10-12T09:00:00.000Z',
    firstSeenAt: '2026-10-12T09:15:00.000Z',
    symbols: ['BTCUSDT', 'ETHUSDT'],
    eventTypes: ['ADOPTION'],
    tone: '0.8',
    classifierVersion: NEWS_CLASSIFIER_VERSION,
    sourceKind: 'GDELT',
    ingestedRunId: null,
  },
];

/** One LIVE, one STALE (3+ failed cycles), one UNAVAILABLE (never succeeded), one disabled. */
export const fixtureNewsSources: NewsSourceHealth[] = [
  {
    id: 'src-gdelt',
    name: 'GDELT GKG',
    kind: 'GDELT',
    enabled: true,
    status: 'LIVE',
    lastSuccessAt: '2026-10-14T08:00:00.000Z',
    lastErrorAt: null,
    consecutiveFailures: 0,
    medianLagSeconds: 900,
    itemsLast24h: 412,
  },
  {
    id: 'src-rss-a',
    name: 'Crypto RSS A',
    kind: 'RSS',
    enabled: true,
    status: 'STALE',
    lastSuccessAt: '2026-10-14T06:00:00.000Z',
    lastErrorAt: '2026-10-14T08:20:00.000Z',
    consecutiveFailures: 5,
    medianLagSeconds: null,
    itemsLast24h: 38,
  },
  {
    id: 'src-calendar',
    name: 'Official Calendars',
    kind: 'OFFICIAL_CALENDAR',
    enabled: true,
    status: 'UNAVAILABLE',
    lastSuccessAt: null,
    lastErrorAt: '2026-10-14T08:10:00.000Z',
    consecutiveFailures: 2,
    medianLagSeconds: null,
    itemsLast24h: 0,
  },
  {
    id: 'src-fred',
    name: 'FRED',
    kind: 'FRED',
    enabled: false,
    status: 'UNAVAILABLE',
    lastSuccessAt: null,
    lastErrorAt: null,
    consecutiveFailures: 0,
    medianLagSeconds: null,
    itemsLast24h: 0,
  },
];

/** HIGH event still ahead, and one already released (has `actual`). */
export const fixtureMacroEvents: SnapshotMacroEvent[] = [
  {
    code: 'CPI',
    name: 'US CPI (Sep)',
    scheduledAt: '2026-10-14T12:30:00.000Z',
    importance: 'HIGH',
    source: 'Official Calendars',
    actual: null,
    actualKnownAt: null,
  },
  {
    code: 'PCE',
    name: 'US PCE (Aug)',
    scheduledAt: '2026-09-30T12:30:00.000Z',
    importance: 'MEDIUM',
    source: 'Official Calendars',
    actual: '2.7',
    actualKnownAt: '2026-09-30T12:30:05.000Z',
  },
];

/** Snapshot news slice: sources partly alive, with the items of BTCUSDT's day. */
export const fixtureSnapshotNews: SnapshotNews = {
  status: 'LIVE',
  observedAt: '2026-10-14T08:25:00.000Z',
  sourcesLive: 1,
  sourcesTotal: 3,
  items: fixtureNewsItems.slice(0, 3).map(({ sourceKind: _k, ingestedRunId: _r, ...item }) => item),
};

/** Report news context for an advice that was held back by a HIGH event (uncertainty raised). */
export const fixtureAnalysisNewsContext: AnalysisNewsContext = {
  status: 'LIVE',
  itemsUsed: [
    {
      id: 'n-006',
      title: 'Exchange pauses BTC withdrawals after wallet incident',
      source: 'Crypto RSS A',
      firstSeenAt: '2026-10-14T08:20:00.000Z',
      eventTypes: ['EXCHANGE_INCIDENT', 'HACK_EXPLOIT'],
      tone: null,
    },
    {
      id: 'n-004',
      title: 'Fed officials signal patience on rates',
      source: 'GDELT GKG',
      firstSeenAt: '2026-10-14T05:45:00.000Z',
      eventTypes: ['CENTRAL_BANK', 'MACRO_DATA'],
      tone: '-1.4',
    },
  ],
  upcomingEvents: [fixtureMacroEvents[0]!],
  tilt: { positive: 0, negative: 1, neutral: 1, meanTone: '-1.4', validated: false },
  impact: ['UNCERTAINTY_RAISED'],
  summaryLine: 'Tin tức: CPI Mỹ (mức tác động cao) công bố trong 4 giờ nữa và có tin sự cố sàn; độ tin cậy bị giới hạn ở 0.60, hướng không đổi.',
};
