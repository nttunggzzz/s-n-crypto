import { eq } from 'drizzle-orm';
import { TAX_LIMITS, type TaxCategory, type TaxProfile, type TaxSettings, type UpdateTaxSettingsRequest } from '@cex/contracts';
import { AMOUNT_SCALE, dec, hasAtMostScale } from '@cex/core';
import { exchangeSettings, userTaxProfiles } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import type { ExchangeConfig } from '../exchange/exchangeConfig.ts';
import { writeAudit } from '../admin/audit.ts';
import type { Actor } from '../admin/adminService.ts';

/**
 * Vietnam tax (module T, batch T2): the admin settings and the user's self-declared category.
 * The withholding itself happens in OrderService.settleFills (exchange/tax.ts). Reports are batch T3.
 */
export class TaxService {
  constructor(
    private readonly db: Db,
    private readonly config: ExchangeConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  settings(): TaxSettings {
    return this.config.taxSettings();
  }

  /**
   * Only the fields sent change (`taxVndRate: null` clears the rate). The settings row is locked, the change and its
   * TAX_SETTINGS_UPDATE audit row commit together (invariant 13); the in-memory cache is reloaded only after the commit,
   * so fills use the new values from then on and never a value that was rolled back.
   */
  async updateSettings(actor: Actor, p: UpdateTaxSettingsRequest): Promise<TaxSettings> {
    // the contract already validated the body; checked again here (the service may be called without route())
    if (p.taxRate !== undefined) {
      const r = dec(p.taxRate);
      if (r.lte(0) || r.gt(TAX_LIMITS.maxRate) || !hasAtMostScale(r, AMOUNT_SCALE)) throw new AppError('VALIDATION_ERROR', `taxRate must be > 0 and at most ${TAX_LIMITS.maxRate}`, { field: 'taxRate' });
    }
    if (p.taxVndRate !== undefined && p.taxVndRate !== null) {
      const v = dec(p.taxVndRate);
      if (v.lte(0) || !hasAtMostScale(v, AMOUNT_SCALE)) throw new AppError('VALIDATION_ERROR', 'taxVndRate must be > 0', { field: 'taxVndRate' });
    }
    await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(exchangeSettings).where(eq(exchangeSettings.id, 1)).for('update');
      if (!row) throw new Error('exchange_settings row missing — run migrations');
      const t = this.now();
      const before = { taxMode: row.taxMode, taxRate: dec(row.taxRate).toFixed(), taxVndRate: row.taxVndRate === null ? null : dec(row.taxVndRate).toFixed() };
      const set: Partial<typeof exchangeSettings.$inferInsert> = { taxUpdatedAt: t };
      if (p.taxMode !== undefined) set.taxMode = p.taxMode;
      if (p.taxRate !== undefined) set.taxRate = dec(p.taxRate).toFixed();
      if (p.taxVndRate !== undefined) {
        set.taxVndRate = p.taxVndRate === null ? null : dec(p.taxVndRate).toFixed();
        set.taxVndRateUpdatedAt = t;
      }
      await tx.update(exchangeSettings).set(set).where(eq(exchangeSettings.id, 1));
      const after = {
        taxMode: set.taxMode ?? before.taxMode,
        taxRate: set.taxRate ?? before.taxRate,
        taxVndRate: p.taxVndRate !== undefined ? (set.taxVndRate ?? null) : before.taxVndRate,
      };
      await writeAudit(tx, { actorId: actor.user.id, action: 'TAX_SETTINGS_UPDATE', targetType: 'EXCHANGE', before, after, reason: p.reason, ip: actor.ip });
    });
    // the change is committed: a failing cache refresh is logged and retried, it must not turn the request into a 500
    await this.config.reloadAfterCommit();
    return this.settings();
  }

  async profile(userId: string): Promise<TaxProfile> {
    const [row] = await this.db.select().from(userTaxProfiles).where(eq(userTaxProfiles.userId, userId));
    return row ? { category: row.category, updatedAt: row.updatedAt.toISOString() } : { category: 'INDIVIDUAL', updatedAt: null };
  }

  /** Self-declared, no document. Applies to fills from now on (records keep the category of their own fill). */
  async updateProfile(userId: string, category: TaxCategory): Promise<TaxProfile> {
    const t = this.now();
    const [row] = await this.db
      .insert(userTaxProfiles)
      .values({ userId, category, updatedAt: t })
      .onConflictDoUpdate({ target: userTaxProfiles.userId, set: { category, updatedAt: t } })
      .returning();
    return { category: row!.category, updatedAt: row!.updatedAt.toISOString() };
  }
}
