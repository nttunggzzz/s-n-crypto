import { db, sqliteClient } from '../db/client';
import { assetUniverseRegistry } from '../db/schema';
import { inArray, eq } from 'drizzle-orm';

async function fix() {
  await db.update(assetUniverseRegistry)
    .set({ isActive: false })
    .where(inArray(assetUniverseRegistry.symbol, ['MATICUSDT', 'RNDRUSDT']));
    
  console.log("Marked MATIC and RNDR as inactive.");
  sqliteClient.close();
}

fix().catch(console.error);
