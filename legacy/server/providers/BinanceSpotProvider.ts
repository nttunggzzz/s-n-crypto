import { BaseProvider } from './BaseProvider';
import { NormalizedCandle, NormalizedMarketQuote } from './types';

export const TRACKED_UNIVERSE_CONFIG: Array<{
  id: string;
  symbol: string;
  name: string;
  category: string;
  circulatingSupply: number;
}> = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', category: 'BITCOIN_ECOSYSTEM', circulatingSupply: 19800000 },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', category: 'ETH_L2', circulatingSupply: 120400000 },
  { id: 'solana', symbol: 'SOL', name: 'Solana', category: 'SOLANA_ECOSYSTEM', circulatingSupply: 470000000 },
  { id: 'chainlink', symbol: 'LINK', name: 'Chainlink', category: 'DEFI_PRIMITIVES', circulatingSupply: 608000000 },
  { id: 'aave', symbol: 'AAVE', name: 'Aave', category: 'DEFI_PRIMITIVES', circulatingSupply: 14980000 },
  { id: 'sui', symbol: 'SUI', name: 'Sui', category: 'MODULAR_INFRA', circulatingSupply: 2850000000 },
  { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche', category: 'MODULAR_INFRA', circulatingSupply: 405000000 },
  { id: 'near', symbol: 'NEAR', name: 'NEAR Protocol', category: 'AI_DEPIN', circulatingSupply: 1215000000 },
  { id: 'bittensor', symbol: 'TAO', name: 'Bittensor', category: 'AI_DEPIN', circulatingSupply: 7380000 },
  { id: 'render-token', symbol: 'RENDER', name: 'Render', category: 'AI_DEPIN', circulatingSupply: 518000000 },
  { id: 'ondo-finance', symbol: 'ONDO', name: 'Ondo Finance', category: 'RWA_TOKENIZATION', circulatingSupply: 1437000000 },
  { id: 'arbitrum', symbol: 'ARB', name: 'Arbitrum', category: 'ETH_L2', circulatingSupply: 4120000000 },
  { id: 'optimism', symbol: 'OP', name: 'Optimism', category: 'ETH_L2', circulatingSupply: 1250000000 },
  { id: 'injective-protocol', symbol: 'INJ', name: 'Injective', category: 'MODULAR_INFRA', circulatingSupply: 100000000 },
  { id: 'celestia', symbol: 'TIA', name: 'Celestia', category: 'MODULAR_INFRA', circulatingSupply: 220000000 },
  { id: 'pendle', symbol: 'PENDLE', name: 'Pendle', category: 'DEFI_PRIMITIVES', circulatingSupply: 158000000 },
  { id: 'uniswap', symbol: 'UNI', name: 'Uniswap', category: 'DEFI_PRIMITIVES', circulatingSupply: 600000000 },
  { id: 'jupiter-exchange-solana', symbol: 'JUP', name: 'Jupiter', category: 'SOLANA_ECOSYSTEM', circulatingSupply: 1350000000 },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', category: 'MEME_SPECULATION', circulatingSupply: 147000000000 },
  { id: 'pepe', symbol: 'PEPE', name: 'Pepe', category: 'MEME_SPECULATION', circulatingSupply: 420690000000000 }
];

export class BinanceSpotProvider extends BaseProvider {
  constructor() {
    super({
      providerId: 'BINANCE_SPOT',
      providerName: 'Binance Public Spot API',
      category: 'MARKET_DATA',
      baseUrl: 'https://api.binance.com',
      timeoutMs: 4500,
      maxRetries: 2,
      activeEndpoints: [
        '/api/v3/ticker/24hr',
        '/api/v3/klines'
      ],
      notes: 'Public REST endpoint for live spot tickers and OHLCV klines.'
    });
  }

  public async getSpotTickers(): Promise<NormalizedMarketQuote[]> {
    const rawData = await this.fetchWithRetry<any[]>('/api/v3/ticker/24hr');
    const tickerMap = new Map<string, any>();
    for (const item of rawData) {
      tickerMap.set(item.symbol, item);
    }

    const now = Date.now();
    const normalized: NormalizedMarketQuote[] = [];

    for (const coin of TRACKED_UNIVERSE_CONFIG) {
      const pair = `${coin.symbol}USDT`;
      const item = tickerMap.get(pair);

      if (item) {
        const price = parseFloat(item.lastPrice);
        const change24h = parseFloat(item.priceChangePercent);
        const volume24h = parseFloat(item.quoteVolume);
        const high24h = parseFloat(item.highPrice);
        const low24h = parseFloat(item.lowPrice);
        const marketCap = Math.round(price * coin.circulatingSupply);

        normalized.push({
          symbol: coin.symbol,
          id: coin.id,
          name: coin.name,
          category: coin.category,
          price: Number(price.toFixed(price < 1 ? 6 : 2)),
          change24h: Number(change24h.toFixed(2)),
          change7d: null, // Binance 24h ticker does not provide 7d change
          volume24h: Math.round(volume24h),
          volumeChange24h: null, // Binance 24h ticker does not provide volume change compared to previous day
          marketCap,
          circulatingSupply: coin.circulatingSupply,
          high24h: Number(high24h.toFixed(price < 1 ? 6 : 2)),
          low24h: Number(low24h.toFixed(price < 1 ? 6 : 2)),
          timestamp: now,
          source: 'Binance Spot API (api.binance.com)',
          status: 'LIVE'
        });
      }
    }

    return normalized;
  }

  public async getKlinesHistorical(symbol: string, timeframe: string = '4h', startTime: number, endTime: number, limit: number = 1000) {
    const pair = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
    const endpoint = `/api/v3/klines?symbol=${pair}&interval=${timeframe}&startTime=${startTime}&endTime=${endTime}&limit=${limit}`;
    const rawKlines = await this.fetchWithRetry<any[]>(endpoint);
    const now = Date.now();

    return rawKlines.map(k => ({
      timestamp: Number(k[0]),
      time: Number(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      quoteVolume: k[7] !== undefined && k[7] !== null ? parseFloat(k[7]) : null,
      tradesCount: k[8] !== undefined && k[8] !== null ? parseInt(k[8], 10) : null,
      isClosed: now > Number(k[6])
    }));
  }

  public async getKlines(symbol: string, timeframe: string = '4h', limit: number = 60) {
    const pair = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
    const endpoint = `/api/v3/klines?symbol=${pair}&interval=${timeframe}&limit=${limit}`;
    const rawKlines = await this.fetchWithRetry<any[]>(endpoint);
    const now = Date.now();

    return rawKlines.map(k => ({
      timestamp: Number(k[0]),
      time: Number(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      quoteVolume: k[7] !== undefined && k[7] !== null ? parseFloat(k[7]) : null,
      tradesCount: k[8] !== undefined && k[8] !== null ? parseInt(k[8], 10) : null,
      isClosed: now > Number(k[6])
    }));
  }
}
