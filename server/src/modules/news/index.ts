import { sql } from 'drizzle-orm';
import type { Config } from '../../config.ts';
import type { Db } from '../../db/client.ts';
import { logger } from '../../logger.ts';
import type { Alerter } from '../../ops/alerts.ts';
import { loadMacroCalendar } from './macroCalendar.ts';
import { syncNewsSources } from './sources.ts';

export { registerNewsRoutes } from './routes.ts';

/** Untagged, non-macro news is kept this long (module N, N2 task 5); everything else is evidence and stays. */
export const UNTAGGED_NEWS_KEEP_DAYS = 30;

/**
 * Deletes live-ingested items that name no pair, are not macro news (MACRO_DATA / CENTRAL_BANK) and are older than 30 days.
 * Items without an ingest run (historical backfill, kept for research) are never deleted. Returns the number of rows removed.
 */
export async function purgeUntaggedNews(db: Db, now: Date = new Date()): Promise<number> {
  const before = new Date(now.getTime() - UNTAGGED_NEWS_KEEP_DAYS * 86_400_000).toISOString();
  const { rowCount } = await db.execute(sql`
    DELETE FROM news_items
     WHERE ingest_run_id IS NOT NULL
       AND cardinality(symbols) = 0
       AND NOT (event_types && ARRAY['MACRO_DATA', 'CENTRAL_BANK']::text[])
       AND first_seen_at < ${before}::timestamptz`);
  return rowCount ?? 0;
}

export interface NewsModule {
  stop(): void;
}

/**
 * Start-up of the news layer (N2b): sync the source catalogue, load the macro calendar, schedule the daily clean-up.
 * An error here is logged and never stops the server; the fetch jobs (RSS, GDELT) arrive with N2c.
 */
export async function startNews(db: Db, config: Pick<Config, 'NEWS_INGEST_ENABLED' | 'NEWS_CALENDAR_ENABLED'>, deps: { alerter?: Pick<Alerter, 'send'> } = {}): Promise<NewsModule> {
  try {
    await syncNewsSources(db, { ingest: config.NEWS_INGEST_ENABLED, calendar: config.NEWS_CALENDAR_ENABLED });
    if (config.NEWS_CALENDAR_ENABLED) await loadMacroCalendar(db, { alerter: deps.alerter });
  } catch (err) {
    logger.error({ err }, 'news layer did not start cleanly - the admin news pages may be empty');
    await deps.alerter?.send('news-start', 'warn', `Module tin tức không khởi động trọn vẹn: ${err instanceof Error ? err.message : String(err)}`).catch(() => undefined);
  }
  const clean = () =>
    void purgeUntaggedNews(db)
      .then((n) => n > 0 && logger.info({ deleted: n }, 'old untagged news removed'))
      .catch((err: unknown) => logger.error({ err }, 'news clean-up failed'));
  if (config.NEWS_INGEST_ENABLED) clean();
  const timer = config.NEWS_INGEST_ENABLED ? setInterval(clean, 24 * 3_600_000) : null;
  timer?.unref();
  return { stop: () => timer && clearInterval(timer) };
}
