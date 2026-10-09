import { ASSET_CATALOG } from '@cex/contracts';
import { assets } from '../../db/schema.ts';
import type { DbOrTx } from '../../db/client.ts';

/** Inserts the default coin info for assets that have none yet; never overwrites admin edits. */
export async function seedAssets(db: DbOrTx): Promise<void> {
  await db
    .insert(assets)
    .values(ASSET_CATALOG.map((a) => ({ asset: a.asset, name: a.name, tags: [...a.tags], description: a.description })))
    .onConflictDoNothing();
}
