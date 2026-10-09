import { db, sqliteClient } from '../db/client';
import { sql } from 'drizzle-orm';
import { marketOhlcvCandles, derivativesSnapshots, onchainEcosystemSnapshots } from '../db/schema';

async function run() {
  const candlesZeroVol = await db.select({ c: sql<number>`count(*)` }).from(marketOhlcvCandles).where(sql`volume = 0`);
  console.log('Candles with volume=0:', candlesZeroVol[0].c);

  const candlesNullQuote = await db.select({ c: sql<number>`count(*)` }).from(marketOhlcvCandles).where(sql`quote_volume IS NULL`);
  const candlesZeroQuote = await db.select({ c: sql<number>`count(*)` }).from(marketOhlcvCandles).where(sql`quote_volume = 0`);
  console.log('Candles with quote_volume IS NULL:', candlesNullQuote[0].c);
  console.log('Candles with quote_volume = 0:', candlesZeroQuote[0].c);

  const derivsNullOi = await db.select({ c: sql<number>`count(*)` }).from(derivativesSnapshots).where(sql`open_interest_usd IS NULL`);
  console.log('Derivatives with NULL open_interest_usd:', derivsNullOi[0].c);

  const derivsZeroOi = await db.select({ c: sql<number>`count(*)` }).from(derivativesSnapshots).where(sql`open_interest_usd = 0`);
  console.log('Derivatives with 0 open_interest_usd:', derivsZeroOi[0].c);

  sqliteClient.close();
}
run().catch(console.error);
