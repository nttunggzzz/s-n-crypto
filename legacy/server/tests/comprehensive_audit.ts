import { db, sqliteClient } from '../db/client';
import { 
  assetUniverseRegistry, 
  marketOhlcvCandles, 
  derivativesSnapshots, 
  onchainEcosystemSnapshots 
} from '../db/schema';
import { sql, eq, and, asc, desc } from 'drizzle-orm';

async function run() {
  console.log("--- DB AUDIT START ---");
  
  // 1. Universe
  const universe = await db.select().from(assetUniverseRegistry);
  console.log(`Universe Assets: ${universe.length}, Active: ${universe.filter(a => a.isActive).length}, Inactive: ${universe.filter(a => !a.isActive).length}`);

  // 2. OHLCV
  const candles = await db.select({
    symbol: marketOhlcvCandles.symbol,
    timeframe: marketOhlcvCandles.timeframe,
    count: sql<number>`count(*)`,
    minT: sql<number>`min(${marketOhlcvCandles.bucketTimestamp})`,
    maxT: sql<number>`max(${marketOhlcvCandles.bucketTimestamp})`,
  }).from(marketOhlcvCandles).groupBy(marketOhlcvCandles.symbol, marketOhlcvCandles.timeframe);

  console.log("--- OHLCV PER SYMBOL ---");
  for (const c of candles) {
    console.log(`${c.symbol} [${c.timeframe}]: count=${c.count}, min=${c.minT}, max=${c.maxT}`);
  }

  const nullQuotes = await db.select({ c: sql<number>`count(*)` }).from(marketOhlcvCandles).where(sql`quote_volume IS NULL`);
  console.log(`Candles with NULL quoteVolume: ${nullQuotes[0].c}`);

  // 3. Derivatives
  const derivs = await db.select({ c: sql<number>`count(*)` }).from(derivativesSnapshots);
  console.log(`Derivatives Snapshots: ${derivs[0].c}`);

  // 4. Onchain
  const tvl = await db.select({ c: sql<number>`count(*)` }).from(onchainEcosystemSnapshots).where(eq(onchainEcosystemSnapshots.entityType, 'CHAIN_TVL'));
  const stable = await db.select({ c: sql<number>`count(*)` }).from(onchainEcosystemSnapshots).where(eq(onchainEcosystemSnapshots.entityType, 'STABLECOIN'));
  console.log(`TVL Snapshots: ${tvl[0].c}, Stablecoin: ${stable[0].c}`);

  sqliteClient.close();
}
run().catch(console.error);
