import { db, sqliteClient } from '../db/client';
import { DataReplayEngine } from '../replay/DataReplayEngine';
import { marketOhlcvCandles } from '../db/schema';
import { eq, desc, and, lte } from 'drizzle-orm';

async function runReplayAudit() {
  const symbol = 'BTCUSDT';
  const tf = '4h';
  
  // Pick a timestamp in the middle of our dataset
  const allCandles = await db.select().from(marketOhlcvCandles)
    .where(and(eq(marketOhlcvCandles.symbol, symbol), eq(marketOhlcvCandles.timeframe, tf)))
    .orderBy(desc(marketOhlcvCandles.bucketTimestamp));
    
  if (allCandles.length < 100) {
    console.log("Not enough candles for replay test");
    return;
  }
  
  const midCandle = allCandles[50];
  const tSim = midCandle.observedAt;
  
  console.log(`Testing replay for ${symbol} at T_sim = ${tSim}`);
  const replayResult = await DataReplayEngine.getPointInTimeCandle(symbol, tf, tSim);
  
  console.log(`Replay Result:`, replayResult?.bucketTimestamp);
  console.log(`Expected Result:`, midCandle.bucketTimestamp);
  
  if (replayResult && replayResult.bucketTimestamp === midCandle.bucketTimestamp) {
    console.log("REPLAY VERIFIED");
  } else {
    console.log("REPLAY FAILED");
  }
  sqliteClient.close();
}

runReplayAudit().catch(console.error);
