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

/** What settleFills needs about the seller of a fill: the category to store on the trade, and the withholding terms (if any). */
export interface SellTaxContext {
  /** The seller's category AT THE FILL, stored on the trade (also while taxMode = OFF and for DOMESTIC_ORG). null for a BUY. */
  category: TaxCategoryValue | null;
  terms: WithholdingTerms | null;
}

/**
 * Whether (and how) a spot fill is withheld — module T §0, §3.2. Only a SELL, only while taxMode = WITHHOLD at the
 * fill, never for a DOMESTIC_ORG seller (who declares 20% itself). Bot orders and `is_bot` accounts are withheld like
 * anyone else (T-D4). Read inside the fill's transaction; the seller's category is read exactly once and is also
 * stored on every SELL trade whatever the mode (T3 step 0). Futures, transfers, faucet, admin and reset never call this.
 */
export async function sellTaxContext(tx: DbOrTx, config: ExchangeConfig, userId: string, side: 'BUY' | 'SELL'): Promise<SellTaxContext> {
  if (side !== 'SELL') return { category: null, terms: null };
  const category = await taxCategoryOf(tx, userId);
  const tax = config.tax;
  if (tax.mode !== 'WITHHOLD' || tax.rate.lte(0) || category === 'DOMESTIC_ORG') return { category, terms: null };
  return { category, terms: { rate: tax.rate, category, vndRate: tax.vndRate } };
}
