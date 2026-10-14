/**
 * Module N fixtures (0.17.0) — UI development only. Times are fixed (UTC) so mock output is reproducible.
 * Shaped after the N0 findings: GDELT items have `publishedAt: null` (GKG carries no publish time) and the GDELT source
 * has `medianLagMs: null`; static calendar sources are LIVE while loaded. Covers items with / without tone, symbols `[]`
 * (market-wide), three items sharing one `firstSeenAt`, a STALE source, a disabled source, a negative lag, an upcoming HIGH
 * macro event and a released one with `actual`.
 */
import type { AnalysisNewsContext, NewsItemAdmin, NewsSourceHealth, SnapshotMacroEvent, SnapshotNews } from '../index.ts';

export const NEWS_CLASSIFIER_VERSION = 'rules-v0.1';

/** Order of the admin list: `(firstSeenAt DESC, id DESC)`. n-008, n-007 and n-002 share one `firstSeenAt`. */
export const fixtureNewsItems: NewsItemAdmin[] = [
  {
    id: 'n-006',
    title: 'Exchange pauses BTC withdrawals after wallet incident',
    url: 'https://example.com/news/exchange-pauses-btc-withdrawals',
    source: 'Crypto RSS A',
    sourceId: 'src-rss-a',
    publishedAt: null,
    firstSeenAt: '2026-10-14T08:20:00.000Z',
    symbols: ['BTCUSDT'],
    eventTypes: ['HACK_EXPLOIT', 'EXCHANGE_INCIDENT'],
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
    sourceId: 'src-gdelt',
    publishedAt: null,
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
    sourceId: 'src-gdelt',
    publishedAt: null,
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
    source: 'Decrypt RSS',
    sourceId: 'src-rss-b',
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
    id: 'n-008',
    title: 'Stablecoin issuer publishes reserve attestation',
    url: 'https://example.com/news/stablecoin-attestation',
    source: 'Decrypt RSS',
    sourceId: 'src-rss-b',
    publishedAt: '2026-10-13T11:04:00.000Z',
    firstSeenAt: '2026-10-13T11:05:00.000Z',
    symbols: [],
    eventTypes: ['OTHER'],
    tone: null,
    classifierVersion: NEWS_CLASSIFIER_VERSION,
    sourceKind: 'RSS',
    ingestedRunId: 'run-0390',
  },
  {
    id: 'n-007',
    title: 'Mainnet upgrade date announced for ETH',
    url: 'https://example.com/news/eth-upgrade-date',
    source: 'Decrypt RSS',
    sourceId: 'src-rss-b',
    publishedAt: '2026-10-13T11:05:04.000Z',
    firstSeenAt: '2026-10-13T11:05:00.000Z',
    symbols: ['ETHUSDT'],
    eventTypes: ['OTHER'],
    tone: null,
    classifierVersion: NEWS_CLASSIFIER_VERSION,
    sourceKind: 'RSS',
    ingestedRunId: 'run-0390',
  },
  {
    id: 'n-002',
    title: 'Exchange lists a new perpetual market',
    url: 'https://example.com/news/new-perp-listing',
    source: 'Crypto RSS A',
    sourceId: 'src-rss-a',
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
    sourceId: 'src-gdelt',
    publishedAt: null,
    firstSeenAt: '2026-10-12T09:15:00.000Z',
    symbols: ['BTCUSDT', 'ETHUSDT'],
    eventTypes: ['ADOPTION'],
    tone: '0.8',
    classifierVersion: NEWS_CLASSIFIER_VERSION,
    sourceKind: 'GDELT',
    ingestedRunId: null,
  },
];

/** LIVE GDELT (lag unknown: null), STALE RSS, LIVE RSS with a negative lag, LIVE static calendar, one disabled source. */
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
    medianLagMs: null,
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
    medianLagMs: 300_000,
    itemsLast24h: 38,
  },
  {
    id: 'src-rss-b',
    name: 'Decrypt RSS',
    kind: 'RSS',
    enabled: true,
    status: 'LIVE',
    lastSuccessAt: '2026-10-14T08:24:00.000Z',
    lastErrorAt: null,
    consecutiveFailures: 0,
    // negative: the feed stamps publication times slightly ahead of our clock (never clamped to 0)
    medianLagMs: -4_000,
    itemsLast24h: 51,
  },
  {
    id: 'src-calendar',
    name: 'Official Calendars',
    kind: 'OFFICIAL_CALENDAR',
    enabled: true,
    status: 'LIVE',
    lastSuccessAt: '2026-10-14T00:00:00.000Z',
    lastErrorAt: null,
    consecutiveFailures: 0,
    medianLagMs: null,
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
    medianLagMs: null,
    itemsLast24h: 0,
  },
];

/** HIGH events still ahead (CPI, FOMC) and one already released (PCE, has `actual`; v0 real data has none). */
export const fixtureMacroEvents: SnapshotMacroEvent[] = [
  {
    code: 'PCE',
    name: 'US PCE (Aug)',
    scheduledAt: '2026-09-30T12:30:00.000Z',
    importance: 'MEDIUM',
    source: 'Official Calendars',
    actual: '2.7',
    actualKnownAt: '2026-09-30T12:30:05.000Z',
  },
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
    code: 'FOMC_DECISION',
    name: 'FOMC rate decision',
    scheduledAt: '2026-10-28T18:00:00.000Z',
    importance: 'HIGH',
    source: 'Official Calendars',
    actual: null,
    actualKnownAt: null,
  },
];

/** Snapshot news slice at asOf 2026-10-14T09:00:00Z: `sources` = the 4 enabled sources (3 LIVE), the first 3 items. */
export const fixtureSnapshotNews: SnapshotNews = {
  status: 'LIVE',
  observedAt: '2026-10-14T08:25:00.000Z',
  sourcesLive: 3,
  sourcesTotal: 4,
  sources: fixtureNewsSources
    .filter((s) => s.enabled)
    .map((s) => ({ name: s.name, kind: s.kind, status: s.status, lastSuccessAt: s.lastSuccessAt })),
  items: fixtureNewsItems.slice(0, 3).map(({ sourceId: _s, sourceKind: _k, ingestedRunId: _r, ...item }) => item),
};

/**
 * Report news context at asOf 2026-10-14T09:00:00Z for BTCUSDT under the v0 rules: n-006 is a HACK_EXPLOIT item on the pair
 * first seen 40 minutes before asOf -> BLOCKED; CPI (HIGH) in 3.5 hours -> uncertainty raised. n-006 has no tone (unscored).
 */
export const fixtureAnalysisNewsContext: AnalysisNewsContext = {
  status: 'LIVE',
  itemsUsed: [
    {
      id: 'n-006',
      title: 'Exchange pauses BTC withdrawals after wallet incident',
      url: 'https://example.com/news/exchange-pauses-btc-withdrawals',
      source: 'Crypto RSS A',
      publishedAt: null,
      firstSeenAt: '2026-10-14T08:20:00.000Z',
      symbols: ['BTCUSDT'],
      eventTypes: ['HACK_EXPLOIT', 'EXCHANGE_INCIDENT'],
      tone: null,
      classifierVersion: NEWS_CLASSIFIER_VERSION,
    },
    {
      id: 'n-004',
      title: 'Fed officials signal patience on rates',
      url: 'https://example.com/news/fed-patience',
      source: 'GDELT GKG',
      publishedAt: null,
      firstSeenAt: '2026-10-14T05:45:00.000Z',
      symbols: [],
      eventTypes: ['CENTRAL_BANK', 'MACRO_DATA'],
      tone: '-1.4',
      classifierVersion: NEWS_CLASSIFIER_VERSION,
    },
  ],
  upcomingEvents: [fixtureMacroEvents[1]!],
  tilt: { positive: 0, negative: 1, neutral: 0, unscored: 1, meanTone: '-1.4', validated: false },
  impact: ['BLOCKED', 'UNCERTAINTY_RAISED'],
  summaryLine:
    'Tin tức: tin hack/sự cố sàn liên quan BTCUSDT (thấy lúc 08:20 UTC) nên không mở tín hiệu mới; CPI Mỹ mức cao công bố 12:30 UTC, độ tin cậy giới hạn ở 0.60.',
};
