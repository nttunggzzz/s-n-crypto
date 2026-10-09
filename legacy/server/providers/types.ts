export type DataQualityStatus =
  | 'LIVE'
  | 'FRESH'
  | 'STALE'
  | 'DEGRADED'
  | 'ERROR'
  | 'DATA_UNAVAILABLE'
  | 'NOT_CONFIGURED'
  | 'MOCK';

export type ProviderStatus = 'OPERATIONAL' | 'DEGRADED' | 'NOT_CONFIGURED' | 'FAILED' | 'CACHED_FALLBACK';

export interface ProviderTelemetry {
  providerId: string;
  providerName: string;
  category: 'MARKET_DATA' | 'DERIVATIVES' | 'ONCHAIN' | 'WHALE' | 'REGIME' | 'ALERTS';
  status: ProviderStatus;
  latencyMs: number;
  lastSuccessfulFetch: number;
  lastFailureTime?: number;
  errorCount: number;
  errorRatePercent: number;
  dataFreshnessSec: number;
  rateLimitRemaining?: number;
  activeEndpoints: string[];
  notes?: string;
}

export interface NormalizedMarketQuote {
  symbol: string;
  id: string;
  name: string;
  category: string;
  price: number | null;
  change24h: number | null;
  change7d: number | null;
  volume24h: number | null;
  volumeChange24h: number | null;
  marketCap: number | null;
  circulatingSupply: number | null;
  high24h: number | null;
  low24h: number | null;
  sparkline?: number[];
  timestamp: number;
  source: string;
  status: DataQualityStatus;
}

export interface NormalizedCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NormalizedDerivatives {
  symbol: string;
  openInterestUSD: number | null;
  openInterestContracts: number | null;
  openInterestChange24h: number | null;
  openInterestChange4h: number | null;
  openInterestChange1h: number | null;
  fundingRate: number | null; // e.g. 0.0001 (0.01%)
  fundingIntervalHours: number | null;
  nextFundingTime: number | null;
  longShortRatio: number | null;
  liquidations24h: {
    longsUSD: number | null;
    shortsUSD: number | null;
    totalUSD: number | null;
    status: DataQualityStatus;
    note?: string;
  } | null;
  basis: number | null;
  oiInterpretation: 'LONG_BUILDUP' | 'SHORT_BUILDUP' | 'LONG_LIQUIDATION' | 'SHORT_SQUEEZE' | 'SPOT_DRIVEN' | 'NEUTRAL' | 'UNAVAILABLE';
  timestamp: number;
  source: string;
  status: DataQualityStatus;
  history?: Array<{ time: number; openInterest: number; price?: number }>;
}

export interface NormalizedTVL {
  ecosystem: string;
  chain?: string;
  protocol?: string;
  tvlUSD: number | null;
  tvlChange24h: number | null;
  tvlChange7d: number | null;
  timestamp: number;
  source: string;
  status: DataQualityStatus;
}

export interface NormalizedStablecoin {
  symbol: string;
  name: string;
  circulatingUSD: number | null;
  change24hUSD: number | null;
  change24hPercent: number | null;
  chainDistribution: Record<string, number>;
  timestamp: number;
  source: string;
  status: DataQualityStatus;
}

export interface NormalizedWhaleEvent {
  id: string;
  timestamp: number;
  txHash: string;
  tokenSymbol: string;
  tokenAmount: number;
  usdValue: number;
  senderAddress: string;
  senderLabel?: string;
  senderType?: 'MARKET_MAKER' | 'FUND' | 'EXCHANGE' | 'INSTITUTION' | 'SMART_MONEY' | 'WHALE' | 'TREASURY';
  receiverAddress: string;
  receiverLabel?: string;
  receiverType?: 'MARKET_MAKER' | 'FUND' | 'EXCHANGE' | 'INSTITUTION' | 'SMART_MONEY' | 'WHALE' | 'TREASURY';
  classification: 'TRANSFER' | 'ACCUMULATION' | 'DISTRIBUTION' | 'EXCHANGE_INFLOW' | 'EXCHANGE_OUTFLOW' | 'CONTRACT_INTERACTION' | 'UNKNOWN';
  confidence: number;
  reasoning: string;
  impactScore: number;
  source: string;
  status: DataQualityStatus;
}

export interface NormalizedMarketRegime {
  regime: 'BULLISH_EXPANSION' | 'RANGE_BOUND' | 'BEARISH_DISTRIBUTION' | 'VOLATILITY_SQUEEZE' | 'TRANSITIONAL';
  score: number; // 0 - 100
  sentiment: 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF';
  breadthPercentage: number;
  advancersCount: number;
  declinersCount: number;
  btcDominance: number;
  ethDominance: number;
  totalMarketCapUSD: number;
  total2USD: number;
  total3USD: number;
  averageAtrPercent: number;
  components: {
    btcTrendScore: number;
    ethTrendScore: number;
    breadthScore: number;
    volatilityScore: number;
    momentumScore: number;
  };
  methodology: string;
  timestamp: number;
  source: string;
  status: DataQualityStatus;
}
