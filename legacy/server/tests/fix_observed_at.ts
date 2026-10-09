import { db, sqliteClient } from '../db/client';
import { marketOhlcvCandles } from '../db/schema';
import { sql, eq } from 'drizzle-orm';

async function fix() {
  await db.update(marketOhlcvCandles)
    .set({
      observedAt: sql`${marketOhlcvCandles.bucketTimestamp} + CASE WHEN ${marketOhlcvCandles.timeframe} = '1h' THEN 3600000 ELSE 14400000 END`
    })
    .where(eq(marketOhlcvCandles.isClosed, true));
    
  console.log("Fixed observedAt");
  sqliteClient.close();
}

fix().catch(console.error);
