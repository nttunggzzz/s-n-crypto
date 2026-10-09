import { db } from '../db/client';
import { sql } from 'drizzle-orm';
import { marketOhlcvCandles, derivativesSnapshots, onchainEcosystemSnapshots } from '../db/schema';
import { UniverseManager } from '../universe/UniverseManager';
import { BinanceSpotProvider } from '../providers/BinanceSpotProvider';
import { BinanceFuturesProvider } from '../providers/BinanceFuturesProvider';
import { DeFiLlamaProvider } from '../providers/DeFiLlamaProvider';

export class BackfillService {
  /**
   * Backfills candles for the active universe (Historical 90 days).
   */
  static async backfillHistoricalCandles(days: number = 90) {
    const symbols = await UniverseManager.getActiveUniverse();
    const spotProvider = new BinanceSpotProvider();
    
    let recordsFetched = 0;
    
    // We will measure inserted by counting before and after
    const countBefore = await db.select({ count: sql<number>`count(*)` }).from(marketOhlcvCandles).then(res => res[0]?.count || 0);

    const timeframes: ('1h' | '4h')[] = ['1h', '4h'];
    
    for (const symbol of symbols) {
      for (const timeframe of timeframes) {
        try {
          const nowMs = Date.now();
          const msPerInterval = timeframe === '1h' ? 3600000 : 14400000;
          const alignedNow = nowMs - (nowMs % msPerInterval);
          let startTime = alignedNow - (days * 24 * 60 * 60 * 1000);
          const endTime = alignedNow - 1; // End at the last millisecond of the previous closed candle
          
          let allKlines: any[] = [];
          
          // Loop to fetch chunks since Binance limit is 1000
          while (startTime <= endTime) {
            const klines = await spotProvider.getKlinesHistorical(symbol, timeframe, startTime, endTime, 1000);
            if (klines.length === 0) break;
            
            // Filter out incomplete candles (just in case)
            const closedKlines = klines.filter(k => k.isClosed);
            allKlines = allKlines.concat(closedKlines);
            startTime = klines[klines.length - 1].timestamp + msPerInterval; // Advance to next interval
            
            await new Promise(res => setTimeout(res, 100)); // Rate limit
          }
          
          if (allKlines.length === 0) continue;
          recordsFetched += allKlines.length;
          
          // Chunk inserts to prevent SQLite variable limits
          const chunkSize = 200;
          for (let i = 0; i < allKlines.length; i += chunkSize) {
            const chunk = allKlines.slice(i, i + chunkSize);
            const records = chunk.map(k => ({
              symbol,
              timeframe,
              bucketTimestamp: k.timestamp,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
              volume: k.volume,
              quoteVolume: (k as any).quoteVolume !== undefined ? (k as any).quoteVolume : null,
              tradesCount: (k as any).tradesCount !== undefined ? (k as any).tradesCount : null,
              isClosed: k.isClosed,
              source: 'BINANCE_SPOT',
              observedAt: k.isClosed ? k.timestamp + (timeframe === '1h' ? 3600000 : 14400000) : nowMs,
              ingestedAt: nowMs,
              qualityStatus: 'BACKFILLED'
            }));
            
            await db.insert(marketOhlcvCandles)
              .values(records)
              .onConflictDoNothing();
          }
          
        } catch (err) {
          console.error(`Historical backfill failed for ${symbol} ${timeframe}:`, err);
        }
      }
    }
    
    const countAfter = await db.select({ count: sql<number>`count(*)` }).from(marketOhlcvCandles).then(res => res[0]?.count || 0);
    const recordsInserted = countAfter - countBefore;

    return { fetched: recordsFetched, inserted: recordsInserted };
  }

  static async backfillDerivatives() {
    const symbols = await UniverseManager.getActiveUniverse();
    const futuresProvider = new BinanceFuturesProvider();
    
    let recordsFetched = 0;
    const countBefore = await db.select({ count: sql<number>`count(*)` }).from(derivativesSnapshots).then(res => res[0]?.count || 0);
    
    for (const symbol of symbols) {
      try {
        const data = await futuresProvider.getDerivativesData(symbol); 
        recordsFetched++;
        
        await db.insert(derivativesSnapshots)
          .values({
            symbol,
            eventTime: data.timestamp,
            openInterestContracts: data.openInterestContracts,
            openInterestUsd: data.openInterestUSD,
            oiChange1hPct: null, // not provided
            oiChange4hPct: data.openInterestChange4h,
            oiChange24hPct: data.openInterestChange24h,
            fundingRate: data.fundingRate,
            fundingIntervalHours: data.fundingIntervalHours ?? 8,
            predictedFundingRate: null,
            longShortRatio: data.longShortRatio,
            longLiquidationsUsd: data.liquidations24h?.longsUSD ?? null,
            shortLiquidationsUsd: data.liquidations24h?.shortsUSD ?? null,
            basisSpreadBps: data.basis,
            oiInterpretation: data.oiInterpretation,
            source: 'BINANCE_FUTURES',
            observedAt: data.timestamp,
            ingestedAt: data.timestamp,
            qualityStatus: data.status === 'LIVE' ? 'AVAILABLE' : 'DEGRADED'
          })
          .onConflictDoNothing();
          
        await new Promise(res => setTimeout(res, 100)); // Rate limit
      } catch (err) {
        console.error(`Derivatives backfill failed for ${symbol}:`, err);
      }
    }
    
    const countAfter = await db.select({ count: sql<number>`count(*)` }).from(derivativesSnapshots).then(res => res[0]?.count || 0);
    const recordsInserted = countAfter - countBefore;

    return { fetched: recordsFetched, inserted: recordsInserted };
  }

  static async backfillDeFiLlama() {
    const llamaProvider = new DeFiLlamaProvider();
    let recordsFetched = 0;
    const countBefore = await db.select({ count: sql<number>`count(*)` }).from(onchainEcosystemSnapshots).then(res => res[0]?.count || 0);
    
    const now = Date.now();
    
    try {
      const tvls = await llamaProvider.getChainTVLs();
      recordsFetched += tvls.length;
      for (const tvl of tvls) {
        await db.insert(onchainEcosystemSnapshots)
          .values({
            entityKey: tvl.chain || tvl.ecosystem,
            entityType: 'CHAIN_TVL',
            ecosystem: tvl.ecosystem,
            eventTime: tvl.timestamp,
            valueUsd: tvl.tvlUSD, // Drizzle type inference fallback, schema requires not null but we filtered
            delta24hUsd: null,
            delta24hPct: tvl.tvlChange24h,
            source: 'DEFILLAMA',
            observedAt: now,
            ingestedAt: now,
            qualityStatus: 'AVAILABLE'
          })
          .onConflictDoNothing();
      }
      
      const stables = await llamaProvider.getStablecoinMetrics();
      recordsFetched += stables.length;
      for (const stable of stables) {
         await db.insert(onchainEcosystemSnapshots)
          .values({
            entityKey: stable.symbol,
            entityType: 'STABLECOIN',
            ecosystem: 'GLOBAL',
            eventTime: stable.timestamp,
            valueUsd: stable.circulatingUSD, // Fallback for strict schema
            delta24hUsd: stable.change24hUSD,
            delta24hPct: stable.change24hPercent,
            source: 'DEFILLAMA',
            observedAt: now,
            ingestedAt: now,
            qualityStatus: 'AVAILABLE'
          })
          .onConflictDoNothing();
      }
    } catch (err) {
      console.error('DeFiLlama backfill failed:', err);
    }
    
    const countAfter = await db.select({ count: sql<number>`count(*)` }).from(onchainEcosystemSnapshots).then(res => res[0]?.count || 0);
    const recordsInserted = countAfter - countBefore;
    
    return { fetched: recordsFetched, inserted: recordsInserted };
  }

  /**
   * Backfills candles for the active universe.
   * Ensures idempotency through ON CONFLICT DO UPDATE.
   */
  static async backfillCandles(timeframe: '15m' | '1h' | '4h' = '4h', limit: number = 200) {
    const symbols = await UniverseManager.getActiveUniverse();
    const spotProvider = new BinanceSpotProvider();
    
    let backfilledCount = 0;
    
    for (const symbol of symbols) {
      try {
        const klines = await spotProvider.getKlines(symbol, timeframe, limit);
        if (klines.length === 0) continue;
        
        const now = Date.now();
        const records = klines.map(k => ({
          symbol,
          timeframe,
          bucketTimestamp: k.timestamp,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
          volume: k.volume,
          quoteVolume: (k as any).quoteVolume !== undefined ? (k as any).quoteVolume : null,
          tradesCount: (k as any).tradesCount !== undefined ? (k as any).tradesCount : null,
          isClosed: k.isClosed,
          source: 'BINANCE_SPOT',
          observedAt: k.isClosed ? k.timestamp + (timeframe === '1h' ? 3600000 : (timeframe === '4h' ? 14400000 : 900000)) : now,
          ingestedAt: now,
          qualityStatus: 'BACKFILLED'
        }));
        
        // SQLite has a limit on variables per query, chunk if necessary.
        // For 200 records * 15 columns = 3000 variables (SQLite default limit is 32766), so it's safe.
        
        await db.insert(marketOhlcvCandles)
          .values(records)
          .onConflictDoNothing(); // Safer and perfectly idempotent for historical immutable candles
          
        backfilledCount += records.length;
        
        // Rate limiting: sleep for 100ms
        await new Promise(res => setTimeout(res, 100));
      } catch (err) {
        console.error(`Backfill failed for ${symbol}:`, err);
      }
    }
    
    return backfilledCount;
  }
}
