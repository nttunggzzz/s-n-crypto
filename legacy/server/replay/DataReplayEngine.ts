import { db } from '../db/client';
import { marketOhlcvCandles, derivativesSnapshots, marketRegimeSnapshots, assetUniverseRegistry } from '../db/schema';
import { lte, and, desc, eq } from 'drizzle-orm';

export class DataReplayEngine {
  /**
   * Retrieves the latest candle for a symbol that was observable at or before T_sim.
   * Completely eliminates look-ahead bias.
   */
  static async getPointInTimeCandle(symbol: string, timeframe: string, tSim: number) {
    const result = await db.select()
      .from(marketOhlcvCandles)
      .where(
        and(
          eq(marketOhlcvCandles.symbol, symbol),
          eq(marketOhlcvCandles.timeframe, timeframe),
          lte(marketOhlcvCandles.observedAt, tSim)
        )
      )
      .orderBy(desc(marketOhlcvCandles.bucketTimestamp))
      .limit(1);
      
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Retrieves all active symbols in the universe at T_sim
   */
  static async getUniverseAt(tSim: number) {
    const assets = await db.select()
      .from(assetUniverseRegistry)
      .where(
        and(
          lte(assetUniverseRegistry.createdAt, new Date(tSim)),
          eq(assetUniverseRegistry.isUniverseMember, true)
        )
      );
    return assets.map(a => a.symbol);
  }
}
