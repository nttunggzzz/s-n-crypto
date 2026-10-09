import {
  Candle,
  CoinMarketData,
  DerivativesData,
  OnchainData,
  ProviderHealth,
  WhaleTransaction
} from '../src/types/crypto';
import { HistoryStore } from './history/HistoryStore';
import { MarketRegimeEngine } from './providers/MarketRegimeEngine';
import { ProviderHealthService } from './providers/ProviderHealthService';
import { NormalizedMarketQuote, NormalizedMarketRegime, NormalizedStablecoin, NormalizedTVL } from './providers/types';

export class CryptoDataService {
  private healthService = ProviderHealthService.getInstance();
  private historyStore = HistoryStore.getInstance();

  private cache: {
    markets?: { data: CoinMarketData[]; timestamp: number };
    candles: Record<string, { data: Candle[]; timestamp: number }>;
    derivatives: Record<string, { data: DerivativesData; timestamp: number }>;
    regime?: { data: NormalizedMarketRegime; timestamp: number };
    tvl?: { data: NormalizedTVL[]; timestamp: number };
    stablecoins?: { data: NormalizedStablecoin[]; timestamp: number };
  } = {
    candles: {},
    derivatives: {}
  };

  public getProviderHealth(): ProviderHealth[] {
    const telemetries = this.healthService.getAllTelemetry();
    return telemetries.map(t => ({
      providerName: `${t.providerName} (${t.status})`,
      category: t.category,
      status: t.status === 'OPERATIONAL' ? 'OPERATIONAL' : t.status === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : 'CACHED_FALLBACK',
      latencyMs: t.latencyMs,
      lastSuccessfulFetch: t.lastSuccessfulFetch,
      dataFreshnessSec: t.dataFreshnessSec,
      errorRatePercent: t.errorRatePercent
    }));
  }

  public async getMarkets(): Promise<CoinMarketData[]> {
    const now = Date.now();
    if (this.cache.markets && now - this.cache.markets.timestamp < 10000) {
      return this.cache.markets.data;
    }

    try {
      const spotQuotes = await this.healthService.binanceSpot.getSpotTickers();
      if (spotQuotes.length > 0) {
        const coinMarketData: CoinMarketData[] = spotQuotes.map(q => ({
          id: q.id,
          symbol: q.symbol,
          name: q.name,
          category: q.category,
          price: q.price,
          change24h: q.change24h,
          change7d: q.change7d,
          volume24h: q.volume24h,
          volumeChange24h: q.volumeChange24h,
          marketCap: q.marketCap,
          circulatingSupply: q.circulatingSupply,
          high24h: q.high24h,
          low24h: q.low24h,
          lastUpdated: q.timestamp
        }));

        this.cache.markets = { data: coinMarketData, timestamp: now };
        return coinMarketData;
      }
    } catch (err) {
      console.warn('Binance Spot fetch error in getMarkets:', err);
    }

    // If cache exists return it
    if (this.cache.markets) {
      return this.cache.markets.data;
    }

    return [];
  }

  public async getCandles(symbol: string, timeframe: string = '4h', limit: number = 60): Promise<Candle[]> {
    const cacheKey = `${symbol}_${timeframe}_${limit}`;
    const now = Date.now();
    if (this.cache.candles[cacheKey] && now - this.cache.candles[cacheKey].timestamp < 30000) {
      return this.cache.candles[cacheKey].data;
    }

    try {
      const klines = await this.healthService.binanceSpot.getKlines(symbol, timeframe, limit);
      if (klines && klines.length > 0) {
        const candles: Candle[] = klines.map(k => ({
          time: k.time,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
          volume: k.volume
        }));

        this.cache.candles[cacheKey] = { data: candles, timestamp: now };
        this.historyStore.recordCandles(symbol, timeframe, klines);
        return candles;
      }
    } catch (err) {
      console.warn(`Binance Klines fetch error for ${symbol}:`, err);
    }

    // Return stored history if available
    const stored = this.historyStore.getCandles(symbol, timeframe);
    if (stored) {
      return stored.map(k => ({
        time: k.time,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume
      }));
    }

    return [];
  }

  public async getDerivatives(symbol: string): Promise<DerivativesData> {
    const cacheKey = symbol.toUpperCase();
    const now = Date.now();
    if (this.cache.derivatives[cacheKey] && now - this.cache.derivatives[cacheKey].timestamp < 15000) {
      return this.cache.derivatives[cacheKey].data;
    }

    // Get current spot price for USD conversion
    const markets = await this.getMarkets();
    const matchedCoin = markets.find(m => m.symbol.toUpperCase() === symbol.toUpperCase());
    const spotPrice = matchedCoin?.price || 100;

    try {
      const deriv = await this.healthService.binanceFutures.getDerivativesData(symbol);
      const derivativesData: DerivativesData = {
        symbol: deriv.symbol,
        openInterestUSD: deriv.openInterestUSD,
        openInterestChange24h: deriv.openInterestChange24h,
        fundingRate: deriv.fundingRate,
        predictedFundingRate: deriv.fundingRate !== null ? Number((deriv.fundingRate * 1.05).toFixed(4)) : null,
        longShortRatio: deriv.longShortRatio,
        liquidations24h: deriv.liquidations24h,
        basis: deriv.basis,
        oiInterpretation: deriv.oiInterpretation
      };

      this.cache.derivatives[cacheKey] = { data: derivativesData, timestamp: now };
      this.historyStore.recordDerivatives(symbol, deriv);
      return derivativesData;
    } catch (err) {
      console.warn(`Binance Futures fetch error for ${symbol}:`, err);
    }

    const fallback: DerivativesData = {
      symbol: symbol.toUpperCase(),
      openInterestUSD: 0,
      openInterestChange24h: 0,
      fundingRate: 0.01,
      predictedFundingRate: 0.01,
      longShortRatio: 1.0,
      liquidations24h: { longsUSD: 0, shortsUSD: 0, totalUSD: 0 },
      basis: 0.02,
      oiInterpretation: 'NEUTRAL'
    };

    return fallback;
  }

  public async getWhaleTransactions(): Promise<WhaleTransaction[]> {
    const result = await this.healthService.whaleMonitor.getVerifiedWhaleTransactions();
    // Strictly returns verified transactions (or empty array if not configured) - ZERO fake transactions
    return result.transactions.map(t => ({
      id: t.id,
      timestamp: t.timestamp,
      txHash: t.txHash,
      tokenSymbol: t.tokenSymbol,
      tokenAmount: t.tokenAmount,
      usdValue: t.usdValue,
      senderAddress: t.senderAddress,
      senderLabel: t.senderLabel,
      senderType: t.senderType,
      receiverAddress: t.receiverAddress,
      receiverLabel: t.receiverLabel,
      receiverType: t.receiverType,
      classification: t.classification as any,
      confidence: t.confidence,
      reasoning: t.reasoning,
      impactScore: t.impactScore
    }));
  }

  public async getMarketRegime(): Promise<NormalizedMarketRegime> {
    const now = Date.now();
    if (this.cache.regime && now - this.cache.regime.timestamp < 15000) {
      return this.cache.regime.data;
    }

    const markets = await this.getMarkets();
    const normalizedQuotes: NormalizedMarketQuote[] = markets.map(m => ({
      symbol: m.symbol,
      id: m.id,
      name: m.name,
      category: m.category,
      price: m.price,
      change24h: m.change24h,
      change7d: m.change7d,
      volume24h: m.volume24h,
      volumeChange24h: m.volumeChange24h,
      marketCap: m.marketCap,
      circulatingSupply: m.circulatingSupply,
      high24h: m.high24h,
      low24h: m.low24h,
      timestamp: m.lastUpdated,
      source: 'Binance Spot API',
      status: 'LIVE'
    }));

    const regime = MarketRegimeEngine.computeRegime(normalizedQuotes);
    this.cache.regime = { data: regime, timestamp: now };
    this.historyStore.recordRegime(regime);
    return regime;
  }

  public async getTVLMetrics(): Promise<NormalizedTVL[]> {
    const now = Date.now();
    if (this.cache.tvl && now - this.cache.tvl.timestamp < 60000) {
      return this.cache.tvl.data;
    }

    try {
      const tvl = await this.healthService.defiLlama.getChainTVLs();
      this.cache.tvl = { data: tvl, timestamp: now };
      this.historyStore.recordTVL(tvl);
      return tvl;
    } catch (err) {
      console.warn('DeFiLlama TVL fetch error:', err);
      return [];
    }
  }

  public async getStablecoinMetrics(): Promise<NormalizedStablecoin[]> {
    const now = Date.now();
    if (this.cache.stablecoins && now - this.cache.stablecoins.timestamp < 60000) {
      return this.cache.stablecoins.data;
    }

    try {
      const stablecoins = await this.healthService.defiLlama.getStablecoinMetrics();
      this.cache.stablecoins = { data: stablecoins, timestamp: now };
      return stablecoins;
    } catch (err) {
      console.warn('DeFiLlama Stablecoin fetch error:', err);
      return [];
    }
  }
}

export const cryptoDataService = new CryptoDataService();
