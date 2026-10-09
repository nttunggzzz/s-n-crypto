import { eq, sql } from 'drizzle-orm';
import { DEFAULT_PREFERENCES, Preferences, type Preferences as PreferencesT } from '@cex/contracts';
import { userPreferences } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import type { ExchangeConfig } from './exchangeConfig.ts';

export class PreferencesService {
  constructor(
    private readonly db: Db,
    private readonly config: ExchangeConfig,
  ) {}

  async get(userId: string): Promise<PreferencesT> {
    const [row] = await this.db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
    // Stored data may predate newer fields: fill from defaults, drop anything invalid.
    const parsed = Preferences.safeParse({ ...DEFAULT_PREFERENCES, ...((row?.data as object) ?? {}) });
    return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
  }

  async update(userId: string, patch: Partial<PreferencesT>): Promise<PreferencesT> {
    const current = await this.get(userId);
    const next = Preferences.parse({ ...current, ...patch });
    // Unknown pairs are dropped rather than rejected (a pair may be delisted later).
    next.favorites = [...new Set(next.favorites)].filter((s) => this.config.findSymbol(s));
    await this.db
      .insert(userPreferences)
      .values({ userId, data: next })
      .onConflictDoUpdate({ target: userPreferences.userId, set: { data: next, updatedAt: sql`now()` } });
    return next;
  }
}
