import { sql } from 'drizzle-orm';
import type { Config } from '../../config.ts';
import type { Db } from '../../db/client.ts';
import { logger } from '../../logger.ts';
import type { Alerter } from '../../ops/alerts.ts';
import { loadMacroCalendar } from './macroCalendar.ts';
import { CALENDAR_HORIZON_DAYS, hasHighEventAhead } from './newsAdmin.ts';
import { syncNewsSources } from './sources.ts';

export { registerNewsRoutes } from './routes.ts';

/** Untagged, non-macro news is kept this long (module N, N2 task 5); everything else is evidence and stays. */
export const UNTAGGED_NEWS_KEEP_DAYS = 30;

/**
 * Deletes LIVE items that name no pair, are not macro news (MACRO_DATA / CENTRAL_BANK) and are older than 30 days.
 * BACKFILL items (history loaded for research) are never deleted, whatever else is true of them. Returns the rows removed.
 */
export async function purgeUntaggedNews(db: Db, now: Date = new Date()): Promise<number> {
  const before = new Date(now.getTime() - UNTAGGED_NEWS_KEEP_DAYS * 86_400_000).toISOString();
  const { rowCount } = await db.execute(sql`
    DELETE FROM news_items
     WHERE origin = 'LIVE'
       AND cardinality(symbols) = 0
       AND NOT (event_types && ARRAY['MACRO_DATA', 'CENTRAL_BANK']::text[])
       AND first_seen_at < ${before}::timestamptz`);
  return rowCount ?? 0;
}

/**
 * Tells the operator ONCE when the calendar file has run out: no HIGH event in the next 45 days (the gate would then
 * run blind), and once more when it is fixed. Call `check()` at start-up and daily; repeated calls while the state
 * stays the same send nothing.
 */
export class CalendarCoverageWatcher {
  private alerted = false;

  constructor(
    private readonly db: Db,
    private readonly alerter?: Pick<Alerter, 'send'>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Returns whether a HIGH event lies within the horizon. */
  async check(): Promise<boolean> {
    const covered = await hasHighEventAhead(this.db, this.now());
    if (!covered && !this.alerted) {
      this.alerted = true;
      logger.warn('macro calendar: no HIGH event in the next %d days', CALENDAR_HORIZON_DAYS);
      await this.alerter?.send('news-calendar-coverage', 'warn', `Lịch vĩ mô không còn sự kiện HIGH nào trong ${CALENDAR_HORIZON_DAYS} ngày tới — cập nhật macro-calendar.csv (cổng tin sẽ chạy mù).`, true);
    } else if (covered && this.alerted) {
      this.alerted = false;
      await this.alerter?.send('news-calendar-coverage', 'info', 'Lịch vĩ mô đã có lại sự kiện HIGH trong 45 ngày tới.', true);
    }
    return covered;
  }
}

export interface NewsModule {
  stop(): void;
}

/**
 * Start-up of the news layer (N2b): sync the source catalogue, load the macro calendar and watch its coverage, schedule
 * the daily clean-up. An error here is logged and never stops the server; the fetch jobs (RSS, GDELT) arrive with N2c.
 */
export async function startNews(
  db: Db,
  config: Pick<Config, 'NEWS_INGEST_ENABLED' | 'NEWS_CALENDAR_ENABLED'>,
  deps: { alerter?: Pick<Alerter, 'send'>; now?: () => Date } = {},
): Promise<NewsModule> {
  const watcher = new CalendarCoverageWatcher(db, deps.alerter, deps.now);
  const guarded = (what: string, fn: () => Promise<unknown>) =>
    fn().catch(async (err: unknown) => {
      logger.error({ err }, `news layer: ${what} failed`);
      await deps.alerter?.send(`news-${what}`, 'warn', `Module tin tức: ${what} lỗi: ${err instanceof Error ? err.message : String(err)}`).catch(() => undefined);
    });
  await guarded('start', async () => {
    await syncNewsSources(db, { ingest: config.NEWS_INGEST_ENABLED, calendar: config.NEWS_CALENDAR_ENABLED });
    if (config.NEWS_CALENDAR_ENABLED) await loadMacroCalendar(db, { alerter: deps.alerter, ...(deps.now ? { now: deps.now } : {}) });
  });
  const timers: NodeJS.Timeout[] = [];
  if (config.NEWS_CALENDAR_ENABLED) {
    await guarded('calendar-check', () => watcher.check());
    timers.push(setInterval(() => void guarded('calendar-check', () => watcher.check()), 24 * 3_600_000));
  }
  if (config.NEWS_INGEST_ENABLED) {
    const clean = () =>
      void purgeUntaggedNews(db)
        .then((n) => n > 0 && logger.info({ deleted: n }, 'old untagged news removed'))
        .catch((err: unknown) => logger.error({ err }, 'news clean-up failed'));
    clean();
    timers.push(setInterval(clean, 24 * 3_600_000));
  }
  for (const t of timers) t.unref();
  return { stop: () => timers.forEach(clearInterval) };
}
