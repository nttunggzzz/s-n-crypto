export type SignalStatus = 'INFO' | 'WATCH' | 'SETUP FORMING' | 'READY' | 'INVALIDATED';
export type AlertPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type MarketRegimeType = 'BULLISH_EXPANSION' | 'RANGE_BOUND' | 'BEARISH_DISTRIBUTION' | 'VOLATILITY_SQUEEZE' | 'TRANSITIONAL';
export type EntityType = 'MARKET_MAKER' | 'FUND' | 'EXCHANGE' | 'INSTITUTION' | 'SMART_MONEY' | 'WHALE' | 'TREASURY';
export type TransactionIntent = 'TRANSFER' | 'ACCUMULATION' | 'DISTRIBUTION' | 'EXCHANGE_INFLOW' | 'EXCHANGE_OUTFLOW' | 'CONTRACT_INTERACTION';

export interface Candle {
  time: number; // Unix timestamp in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CoinMarketData {
  id: string;
  symbol: string;
  name: string;
  category: string;
  price: number | null;
  change24h: number | null;
  change7d?: number | null;
  volume24h: number | null;
  volumeChange24h: number | null;
  marketCap: number | null;
  circulatingSupply: number | null;
  dominance?: number | null;
  high24h: number | null;
  low24h: number | null;
  sparkline?: number[];
  lastUpdated: number;
}

export interface DerivativesData {
  symbol: string;
  openInterestUSD: number | null;
  openInterestChange24h: number | null; // percentage
  fundingRate: number | null; // percentage (e.g. 0.01%)
  predictedFundingRate?: number | null;
  longShortRatio: number | null;
  liquidations24h: {
    longsUSD: number | null;
    shortsUSD: number | null;
    totalUSD: number | null;
  } | null;
  basis: number | null; // perp vs spot spread percentage
  oiInterpretation: 'LONG_BUILDUP' | 'SHORT_BUILDUP' | 'LONG_LIQUIDATION' | 'SHORT_SQUEEZE' | 'SPOT_DRIVEN' | 'NEUTRAL' | 'UNAVAILABLE';
}

export interface OnchainData {
  symbol: string;
  tvlUSD: number;
  tvlChange7d: number;
  protocolRevenue24h: number;
  protocolFees24h: number;
  activeAddresses24h: number;
  transactionCount24h: number;
  stablecoinSupplyUSD: number;
  stablecoinFlow24h: number;
  bridgeFlowUSD24h: number;
}

export interface WhaleTransaction {
  id: string;
  timestamp: number;
  txHash: string;
  tokenSymbol: string;
  tokenAmount: number;
  usdValue: number;
  senderAddress: string;
  senderLabel?: string;
  senderType?: EntityType;
  receiverAddress: string;
  receiverLabel?: string;
  receiverType?: EntityType;
  classification: TransactionIntent;
  confidence: number; // 0-100
  reasoning: string;
  impactScore: number; // 1-10
}

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  type: 'HIGH' | 'LOW';
  label: 'HH' | 'HL' | 'LH' | 'LL' | 'SWING';
}

export interface PriceActionAnalysis {
  trend: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL_RANGE' | 'BEARISH' | 'STRONG_BEARISH';
  structure: 'HIGHER_HIGHS' | 'LOWER_LOWS' | 'RANGING' | 'EXPANDING';
  atr14: number;
  atrPercent: number;
  volatilityState: 'COMPRESSED' | 'NORMAL' | 'EXPANDED';
  keySupportLevels: number[];
  keyResistanceLevels: number[];
  recentBreakout: {
    occurred: boolean;
    direction: 'BULLISH' | 'BEARISH' | 'NONE';
    level: number;
    retestStatus: 'PENDING' | 'TESTING' | 'CONFIRMED_BOUNCE' | 'FAILED';
  };
  swingPoints: SwingPoint[];
  score: number; // 0-100
}

export interface FairValueGap {
  startIndex: number;
  time: number;
  type: 'BULLISH' | 'BEARISH';
  topPrice: number;
  bottomPrice: number;
  isMitigated: boolean;
  mitigationTime?: number;
}

export interface OrderBlock {
  startIndex: number;
  time: number;
  type: 'BULLISH_DEMAND' | 'BEARISH_SUPPLY';
  topPrice: number;
  bottomPrice: number;
  volumeMultiplier: number;
  isTested: boolean;
  isBreached: boolean;
}

export interface LiquiditySweep {
  time: number;
  level: number;
  type: 'SWEEP_HIGHS' | 'SWEEP_LOWS';
  reversalConfirmed: boolean;
}

export interface SMCAnalysis {
  marketStructure: 'BULLISH' | 'BEARISH' | 'CONSOLIDATION';
  bosDetected: boolean;
  bosLevel?: number;
  chochDetected: boolean;
  chochLevel?: number;
  activeOrderBlocks: OrderBlock[];
  activeFVGs: FairValueGap[];
  recentSweeps: LiquiditySweep[];
  equilibriumPrice: number;
  currentZone: 'DISCOUNT' | 'EQUILIBRIUM' | 'PREMIUM';
  score: number; // 0-100
  deterministicSummary: string;
}

export interface RelativeStrengthAnalysis {
  symbol: string;
  rsVsBtc24h: number; // % relative performance
  rsVsBtc7d: number;
  rsVsEth24h: number;
  rsVsEth7d: number;
  rsVsMarket24h: number;
  outperformingSector: boolean;
  rankInSector: number;
  totalCoinsInSector: number;
  rsTier: 'LEADER' | 'STRONG' | 'INLINE' | 'LAGGARD';
  score: number; // 0-100
}

export interface SectorRotationData {
  sector: string;
  name: string;
  coins: string[];
  totalMarketCapUSD: number;
  volume24hUSD: number;
  volumeChange24h: number;
  avgPriceChange24h: number;
  avgPriceChange7d: number;
  tvlUSD: number;
  capitalFlowState: 'INFLOW_ACCELERATING' | 'MODERATE_INFLOW' | 'STAGNANT' | 'OUTFLOW';
  momentumScore: number; // 0-100
}

export interface SectorRotationSummary {
  sectorKey: string;
  sectorName: string;
  coins: string[];
  totalMarketCapUSD: number;
  totalVolume24h: number;
  volumeChange24h: number;
  averageChange24h: number;
  averageChange7d: number;
  tvlUSD: number;
  capitalFlow: 'ACCELERATING_INFLOW' | 'MODERATE_INFLOW' | 'STAGNANT' | 'OUTFLOW_HEAVY' | 'ROTATION_OUT';
  momentumScore: number;
  leaderCoin: string;
  leaderChange24h: number;
}

export interface BacktestConfig {
  minSetupScore: number;
  minRiskRewardRatio: number;
  maxHoldingPeriodBars: number;
  slippagePercent: number;
  feePercent: number;
  requireSMCConfirmation: boolean;
  requireDerivativesConfirmation: boolean;
  requireRSLeader: boolean;
}

export interface ConfluenceWeights {
  marketWeight: number;
  priceActionWeight: number;
  smcWeight: number;
  relativeStrengthWeight: number;
  derivativesWeight: number;
  whaleWeight: number;
  onchainWeight: number;
  rotationWeight: number;
}

export interface RiskRewardMetrics {
  entryPrice: number;
  entryZone: [number, number]; // [min, max]
  entryTrigger: string;
  stopLossPrice: number;
  stopLossPercent: number;
  stopLossRationale: string;
  takeProfit1: number;
  takeProfit1Percent: number;
  takeProfit2: number;
  takeProfit2Percent: number;
  takeProfit3: number;
  takeProfit3Percent: number;
  riskAmountPerUnit: number;
  rewardToTp1: number;
  rewardToTp2: number;
  rewardToTp3: number;
  riskRewardRatio: number; // calculated at TP2
  isTradeable: boolean;
  rejectionReason?: string;
  invalidationConditions: string[];
}

export interface ConfluenceScoreBreakdown {
  marketScore: number;
  priceActionScore: number;
  smcScore: number;
  relativeStrengthScore: number;
  derivativesScore: number;
  whaleScore: number;
  onchainScore: number;
  rotationScore: number;
  totalConfluenceScore: number; // 0-100 weighted
}

export interface SetupSignal {
  id: string;
  timestamp: number;
  coinId: string;
  symbol: string;
  name: string;
  category: string;
  currentPrice: number;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  status: SignalStatus;
  priority: AlertPriority;
  scores: ConfluenceScoreBreakdown;
  priceAction: PriceActionAnalysis;
  smc: SMCAnalysis;
  relativeStrength: RelativeStrengthAnalysis;
  derivatives: DerivativesData;
  onchain?: OnchainData;
  whaleSummary?: {
    recentLargeTxsCount: number;
    netSmartMoneyFlowUSD: number;
    dominantIntent: TransactionIntent;
  };
  risk: RiskRewardMetrics;
  evidencePoints: string[];
  keyRisks: string[];
  invalidationTrigger: string;
  candles: Candle[];
}

export interface AICommitteeReport {
  signalId: string;
  symbol: string;
  timestamp: number;
  verdict: 'STRONG_CONVICTION_SETUP' | 'MODERATE_SETUP' | 'WATCHLIST_ONLY' | 'REJECTED_UNFAVORABLE_RR' | 'INVALIDATED';
  confidenceScore: number; // 0-100
  executiveThesis: string;
  facts: string[];
  inferences: string[];
  uncertainties: string[];
  catalystsAndConfluences: string[];
  counterThesisRisks: string[];
  invalidationPlan: string;
  macroContext: string;
  committeeSummary: string;
  modelUsed: string;
}

export interface BacktestTrade {
  id: string;
  symbol: string;
  confluenceScore: number;
  entryDate?: string;
  entryPrice: number;
  exitDate?: string;
  exitPrice: number;
  outcome: 'WIN' | 'LOSS';
  pnlR: number;
  pnlPercent: number;
  exitReason: string;
  direction?: 'LONG' | 'SHORT';
  holdingHours: number;
}

export interface BacktestSummary {
  strategyName: string;
  assetTested?: string;
  timeframe?: string;
  period?: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number; // percentage
  profitFactor: number;
  expectancyR: number;
  totalReturnPercent: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  avgHoldingHours?: number;
  byScoreBracket: Array<{ scoreBracket: string; trades: number; winRate: number; avgReturnPercent: number }>;
  byRegime: Array<{ regime: string; trades: number; winRate: number; profitFactor: number }>;
  trades: BacktestTrade[];
  equityCurve: { date: string; equity: number; drawdown: number }[];
}

export interface ProviderHealth {
  providerName: string;
  category: 'MARKET_DATA' | 'EXCHANGE_KLINES' | 'DERIVATIVES' | 'ONCHAIN' | 'WHALE' | 'REGIME' | 'ALERTS';
  status: 'OPERATIONAL' | 'DEGRADED' | 'FAILED' | 'CACHED_FALLBACK' | 'NOT_CONFIGURED';
  latencyMs: number;
  lastSuccessfulFetch: number;
  dataFreshnessSec: number;
  errorRatePercent: number;
}

export interface MarketRegimeResponse {
  regime: 'BULLISH_EXPANSION' | 'RANGE_BOUND' | 'BEARISH_DISTRIBUTION' | 'VOLATILITY_SQUEEZE' | 'TRANSITIONAL';
  score: number;
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
  status: 'LIVE' | 'FRESH' | 'STALE' | 'DATA_UNAVAILABLE';
}

export interface TVLResponse {
  ecosystem: string;
  chain?: string;
  protocol?: string;
  tvlUSD: number;
  tvlChange24h: number;
  tvlChange7d: number;
  timestamp: number;
  source: string;
  status: string;
}

export interface StablecoinResponse {
  symbol: string;
  name: string;
  circulatingUSD: number;
  change24hUSD: number;
  change24hPercent: number;
  chainDistribution: Record<string, number>;
  timestamp: number;
  source: string;
  status: string;
}

export interface TelegramAlertConfig {
  botToken: string;
  chatId: string;
  enabledPriorities: AlertPriority[];
  minScoreThreshold: number;
  sendDailyDigest: boolean;
  simulationMode: boolean;
}
