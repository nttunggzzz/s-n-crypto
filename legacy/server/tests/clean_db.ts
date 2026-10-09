import { db, sqliteClient } from '../db/client';
import { derivativesSnapshots, onchainEcosystemSnapshots, marketOhlcvCandles } from '../db/schema';
import { eq } from 'drizzle-orm';

async function clean() {
  console.log("Cleaning synthetic derivatives data...");
  await db.update(derivativesSnapshots)
    .set({
      oiChange1hPct: null,
      basisSpreadBps: null,
      longLiquidationsUsd: null,
      shortLiquidationsUsd: null
    });
    
  console.log("Cleaning synthetic DeFiLlama data...");
  await db.update(onchainEcosystemSnapshots)
    .set({ delta24hUsd: null })
    .where(eq(onchainEcosystemSnapshots.entityType, 'CHAIN_TVL'));
    
  console.log("Cleaning synthetic tradesCount and quoteVolume in candles...");
  await db.update(marketOhlcvCandles)
    .set({ quoteVolume: null, tradesCount: null })
    .where(eq(marketOhlcvCandles.tradesCount, 0));

  console.log("Cleanup done.");
  sqliteClient.close();
}

clean().catch(console.error);
