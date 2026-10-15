import { sql } from 'drizzle-orm';
import type { NewsSourceKind } from '@cex/contracts';
import type { Db } from '../../db/client.ts';
import { newsSources } from '../../db/schema.ts';

/**
 * The news sources of Module N (N0 report: docs/reports/2026-10-14-module-N-nguon.md section 1-3). Fixed catalogue in
 * code; `syncNewsSources` copies it into `news_sources` at start-up so that runs and items can point at a source row.
 * `name` is what the admin list shows as an item's `source` (GDELT data must be credited to the GDELT Project).
 */
export interface NewsSourceDef {
  id: string;
  name: string;
  kind: NewsSourceKind;
  url: string;
  /** Seconds between two attempts (RSS 3 min, GDELT file every 15 min, calendar file daily). */
  pollIntervalSec: number;
}

export const RSS_POLL_SEC = 180;
export const GDELT_POLL_SEC = 900;
export const CALENDAR_POLL_SEC = 86_400;

export const CALENDAR_SOURCE_ID = 'official-calendar';
/** Shown as `source` of every macro event (they all come from the official calendar file). */
export const CALENDAR_SOURCE_NAME = 'Official Calendars';

export const NEWS_SOURCES: readonly NewsSourceDef[] = [
  { id: 'rss-coindesk', name: 'CoinDesk', kind: 'RSS', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', pollIntervalSec: RSS_POLL_SEC },
  { id: 'rss-cointelegraph', name: 'Cointelegraph', kind: 'RSS', url: 'https://cointelegraph.com/rss', pollIntervalSec: RSS_POLL_SEC },
  { id: 'rss-decrypt', name: 'Decrypt', kind: 'RSS', url: 'https://decrypt.co/feed', pollIntervalSec: RSS_POLL_SEC },
  { id: 'rss-theblock', name: 'The Block', kind: 'RSS', url: 'https://www.theblock.co/rss.xml', pollIntervalSec: RSS_POLL_SEC },
  { id: 'rss-fed', name: 'Federal Reserve press releases', kind: 'RSS', url: 'https://www.federalreserve.gov/feeds/press_all.xml', pollIntervalSec: RSS_POLL_SEC },
  { id: 'rss-sec', name: 'SEC press releases', kind: 'RSS', url: 'https://www.sec.gov/news/pressreleases.rss', pollIntervalSec: RSS_POLL_SEC },
  { id: 'gdelt-gkg', name: 'GDELT Project (GKG)', kind: 'GDELT', url: 'https://data.gdeltproject.org/gdeltv2/lastupdate.txt', pollIntervalSec: GDELT_POLL_SEC },
  {
    id: CALENDAR_SOURCE_ID,
    name: CALENDAR_SOURCE_NAME,
    kind: 'OFFICIAL_CALENDAR',
    url: 'repo:server/src/modules/news/data/macro-calendar.csv',
    pollIntervalSec: CALENDAR_POLL_SEC,
  },
];

/** `enabled` of a source under the configuration: the calendar follows NEWS_CALENDAR_ENABLED, every fetched source NEWS_INGEST_ENABLED. */
export function sourceEnabled(def: Pick<NewsSourceDef, 'kind'>, flags: { ingest: boolean; calendar: boolean }): boolean {
  return def.kind === 'OFFICIAL_CALENDAR' ? flags.calendar : flags.ingest;
}

/**
 * Upserts the catalogue (name, url, kind, interval, `enabled` from the configuration). Safe to run on every start
 * and from two places at once: the same rows come out. Sources that are no longer in the catalogue are left alone
 * (their runs and items are history).
 */
export async function syncNewsSources(db: Db, flags: { ingest: boolean; calendar: boolean }, defs: readonly NewsSourceDef[] = NEWS_SOURCES): Promise<void> {
  await db
    .insert(newsSources)
    .values(defs.map((d) => ({ id: d.id, name: d.name, kind: d.kind, url: d.url, pollIntervalSec: d.pollIntervalSec, enabled: sourceEnabled(d, flags) })))
    .onConflictDoUpdate({
      target: newsSources.id,
      // unchanged rows are not rewritten (updated_at stays the time of the last real change)
      setWhere: sql`(${newsSources.name}, ${newsSources.kind}, ${newsSources.url}, ${newsSources.pollIntervalSec}, ${newsSources.enabled}) IS DISTINCT FROM (excluded.name, excluded.kind, excluded.url, excluded.poll_interval_sec, excluded.enabled)`,
      set: {
        name: sql`excluded.name`,
        kind: sql`excluded.kind`,
        url: sql`excluded.url`,
        pollIntervalSec: sql`excluded.poll_interval_sec`,
        enabled: sql`excluded.enabled`,
        updatedAt: sql`now()`,
      },
    });
}
