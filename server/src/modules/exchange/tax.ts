import { eq } from 'drizzle-orm';
import type { Dec } from '@cex/core';
import { userTaxProfiles, type TaxCategoryValue } from '../../db/schema.ts';
import type { DbOrTx } from '../../db/client.ts';
import type { ExchangeConfig } from './exchangeConfig.ts';

/** What a SELL fill is withheld with (snapshot taken at the fill). */
export interface WithholdingTerms {
  rate: Dec;
  category: Exclude<TaxCategoryValue, 'DOMESTIC_ORG'>;
  vndRate: Dec | null;
}

/** The user's self-declared category; no row = INDIVIDUAL (module T §3.3). */
export async function taxCategoryOf(db: DbOrTx, userId: string): Promise<TaxCategoryValue> {
  const [row] = await db.select({ category: userTaxProfiles.category }).from(userTaxProfiles).where(eq(userTaxProfiles.userId, userId));
  return row?.category ?? 'INDIVIDUAL';
}

/**
 * Whether (and how) a spot fill is withheld — module T §0, §3.2. Only a SELL, only while taxMode = WITHHOLD at the
 * fill, never for a DOMESTIC_ORG seller (who declares 20% itself). Bot orders and `is_bot` accounts are withheld like
 * anyone else (T-D4). Read inside the fill's transaction. Futures, transfers, faucet, admin and reset never call this.
 */
export async function withholdingTerms(tx: DbOrTx, config: ExchangeConfig, userId: string, side: 'BUY' | 'SELL'): Promise<WithholdingTerms | null> {
  if (side !== 'SELL') return null;
  const tax = config.tax;
  if (tax.mode !== 'WITHHOLD' || tax.rate.lte(0)) return null;
  const category = await taxCategoryOf(tx, userId);
  if (category === 'DOMESTIC_ORG') return null;
  return { rate: tax.rate, category, vndRate: tax.vndRate };
}
