// Adapted from TauricResearch/TradingAgents v0.6.0 (commit 1394a3f72aa4393e1a98f51b382434c4b4c2d972, Apache-2.0):
// tradingagents/agents/rating.py, tradingagents/portfolio.py. Modified (ported to zod, crypto fields). See THIRD_PARTY_NOTICES.md.
import { z } from 'zod';
import { CandleInterval, DataStatus, DecimalString, EpochMs, IsoDateTime, OrderSide, SymbolCode } from './common.ts';

/**
 * Seven specialized departments in the Crypto-Native Multi-Agent Analysis Subsystem
 * adapted from TauricResearch/TradingAgents (`v0.6.0`, commit `1394a3f72aa4393e1a98f51b382434c4b4c2d972`).
 *
 * Time fields: `EpochMs` only where the value lives on the candle/trade time axis (candle bounds, trade time,
 * the `asOfMs` cut-off compared against candle `closeTime`); every other instant is `IsoDateTime`.
 * Missing data is `null`, never `"0"`.
 */
export const AnalysisDepartmentId = z.enum([
  'technical_quant',
  'order_flow_microstructure',
  'derivatives_positioning',
  'crypto_fundamentals_sentiment',
  'bull_bear_debate',
  'risk_execution_review',
  'final_synthesis',
]);
export type AnalysisDepartmentId = z.infer<typeof AnalysisDepartmentId>;

/**
 * 5-tier directional rating plus non-tradeable `REVIEW` sentinel (adapted from upstream `rating.py` #1170).
 * `REVIEW` is emitted whenever market data is `STALE`/`UNAVAILABLE`, required departments fail, or circuit breakers halt trading.
 */
export const CryptoAnalysisRating = z.enum([
  'BUY',
  'OVERWEIGHT',
  'HOLD',
  'UNDERWEIGHT',
  'SELL',
  'REVIEW',
]);
export type CryptoAnalysisRating = z.infer<typeof CryptoAnalysisRating>;

export const EvidenceKind = z.enum(['OBSERVED', 'INFERRED']);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

export const EvidenceItem = z.object({
  id: z.string().min(1),
  kind: EvidenceKind,
  department: AnalysisDepartmentId,
  metric: z.string().min(1),
  value: z.string().nullable(),
  source: z.string().min(1),
  observedAt: IsoDateTime,
  dataStatus: DataStatus,
  note: z.string(),
});
export type EvidenceItem = z.infer<typeof EvidenceItem>;

export const RiskFlagSeverity = z.enum(['INFO', 'WARNING', 'CRITICAL', 'BLOCKER']);
export type RiskFlagSeverity = z.infer<typeof RiskFlagSeverity>;

export const RiskFlag = z.object({
  code: z.string().min(1),
  severity: RiskFlagSeverity,
  department: AnalysisDepartmentId,
  title: z.string().min(1),
  detail: z.string().min(1),
  blocksExecution: z.boolean(),
});
export type RiskFlag = z.infer<typeof RiskFlag>;

export const SnapshotCandle = z.object({
  openTime: EpochMs,
  closeTime: EpochMs,
  open: DecimalString,
  high: DecimalString,
  low: DecimalString,
  close: DecimalString,
  volume: DecimalString,
  quoteVolume: DecimalString,
  closed: z.literal(true),
});
export type SnapshotCandle = z.infer<typeof SnapshotCandle>;

export const SnapshotBookLevel = z.object({
  price: DecimalString,
  qty: DecimalString,
});
export type SnapshotBookLevel = z.infer<typeof SnapshotBookLevel>;

export const SnapshotPublicTrade = z.object({
  id: z.string(),
  price: DecimalString,
  qty: DecimalString,
  quoteQty: DecimalString,
  isBuyerMaker: z.boolean(),
  time: EpochMs,
});
export type SnapshotPublicTrade = z.infer<typeof SnapshotPublicTrade>;

export const SnapshotSymbolRules = z.object({
  symbol: SymbolCode,
  baseAsset: z.string().min(1),
  quoteAsset: z.string().min(1),
  tickSize: DecimalString,
  stepSize: DecimalString,
  minQty: DecimalString,
  maxQty: DecimalString,
  minNotional: DecimalString,
  feeRate: DecimalString,
});
export type SnapshotSymbolRules = z.infer<typeof SnapshotSymbolRules>;

export const SnapshotDerivativesState = z.object({
  status: DataStatus,
  markPrice: DecimalString.nullable(),
  indexPrice: DecimalString.nullable(),
  lastFundingRate: DecimalString.nullable(),
  /** Same type as `FuturesMarkPrice.nextFundingTime` (futures.ts). */
  nextFundingTime: IsoDateTime.nullable(),
  openInterestSeries: z.array(DecimalString),
  /** Contract parameters from the futures config; `null` when the caller did not supply them (never a guessed default). */
  maxLeverage: z.number().int().positive().nullable(),
  maintenanceMarginRate: DecimalString.nullable(),
  takerFeeRate: DecimalString.nullable(),
  updatedAt: IsoDateTime.nullable(),
});
export type SnapshotDerivativesState = z.infer<typeof SnapshotDerivativesState>;

export const SnapshotHeadline = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source: z.string().min(1),
  publishedAt: IsoDateTime,
  sentimentTilt: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']),
});
export type SnapshotHeadline = z.infer<typeof SnapshotHeadline>;

export const SnapshotOnChainAndMacro = z.object({
  status: DataStatus,
  observedAt: IsoDateTime.nullable(),
  marketCapUsd: DecimalString.nullable(),
  realizedCapUsd: DecimalString.nullable(),
  dailyTxVolumeUsd: DecimalString.nullable(),
  exchangeDepositsUsd: DecimalString.nullable(),
  exchangeWithdrawalsUsd: DecimalString.nullable(),
  smartBuysUsd: DecimalString.nullable(),
  smartSellsUsd: DecimalString.nullable(),
  circulatingSupply: DecimalString.nullable(),
  dailyVolumeTokens: DecimalString.nullable(),
  btcTrendScore: DecimalString.nullable(),
  altBreadthScore: DecimalString.nullable(),
  btcDominanceScore: DecimalString.nullable(),
  perpFundingScore: DecimalString.nullable(),
  drawdownVolScore: DecimalString.nullable(),
  momentumThrustScore: DecimalString.nullable(),
  headlines: z.array(SnapshotHeadline),
});
export type SnapshotOnChainAndMacro = z.infer<typeof SnapshotOnChainAndMacro>;

/**
 * 3-state Portfolio Context adapted from upstream `portfolio.py` (`NOT_PROVIDED` | `FLAT` | `ACTIVE_POSITIONS`)
 * with deterministic SHA-256 fingerprint for auditability.
 */
export const SnapshotPortfolioStatus = z.enum(['NOT_PROVIDED', 'FLAT', 'ACTIVE_POSITIONS']);
export type SnapshotPortfolioStatus = z.infer<typeof SnapshotPortfolioStatus>;

export const SnapshotActivePosition = z.object({
  symbol: SymbolCode,
  marketType: z.enum(['SPOT', 'FUTURES_PERP']),
  side: z.enum(['LONG', 'SHORT']),
  qty: DecimalString,
  entryPrice: DecimalString,
  markPrice: DecimalString,
  marginUsdt: DecimalString.nullable(),
  maintenanceMarginRate: DecimalString.nullable(),
  unrealizedPnlUsdt: DecimalString,
});
export type SnapshotActivePosition = z.infer<typeof SnapshotActivePosition>;

/**
 * Account figures are `null` when not provided (always so for `NOT_PROVIDED`): "not provided" is not a flat,
 * zero-drawdown account (upstream `portfolio.py`: treating it as flat would invent a fact about the account).
 */
export const SnapshotPortfolioContext = z.object({
  status: SnapshotPortfolioStatus,
  equityUsdt: DecimalString.nullable(),
  availableUsdt: DecimalString.nullable(),
  currentDrawdownPct: DecimalString.nullable(),
  dailyLossPct: DecimalString.nullable(),
  weeklyLossPct: DecimalString.nullable(),
  consecutiveLosses: z.number().int().nonnegative().nullable(),
  activePositions: z.array(SnapshotActivePosition),
  fingerprint: z.string().min(16),
});
export type SnapshotPortfolioContext = z.infer<typeof SnapshotPortfolioContext>;

export const TimestampAlignmentReport = z.object({
  aligned: z.boolean(),
  asOf: IsoDateTime,
  asOfMs: EpochMs,
  maxAllowedStalenessMs: z.number().int().positive(),
  observedMaxLagMs: z.number().int().nonnegative(),
  unclosedCandlesFiltered: z.number().int().nonnegative(),
  lookaheadItemsFiltered: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});
export type TimestampAlignmentReport = z.infer<typeof TimestampAlignmentReport>;

/**
 * Authoritative Point-in-Time Crypto Market Snapshot (`snapshot.py` + `date_window.py` crypto adaptation).
 */
export const CryptoMarketSnapshot = z.object({
  snapshotId: z.string().min(1),
  symbol: SymbolCode,
  interval: CandleInterval,
  asOf: IsoDateTime,
  asOfMs: EpochMs,
  spotDataStatus: DataStatus,
  futuresDataStatus: DataStatus,
  spotTradeBlock: z.string().nullable(),
  futuresTradeBlock: z.string().nullable(),
  rules: SnapshotSymbolRules,
  spot: z.object({
    lastPrice: DecimalString.nullable(),
    bestBid: DecimalString.nullable(),
    bestAsk: DecimalString.nullable(),
    priceChangePct24h: DecimalString.nullable(),
    quoteVolume24h: DecimalString.nullable(),
    tickerUpdatedAt: IsoDateTime.nullable(),
    bookUpdatedAt: IsoDateTime.nullable(),
    bids: z.array(SnapshotBookLevel),
    asks: z.array(SnapshotBookLevel),
    recentTrades: z.array(SnapshotPublicTrade),
    closedCandles: z.array(SnapshotCandle),
  }),
  derivatives: SnapshotDerivativesState.nullable(),
  onChainAndMacro: SnapshotOnChainAndMacro.nullable(),
  portfolio: SnapshotPortfolioContext,
  timestampAlignment: TimestampAlignmentReport,
});
export type CryptoMarketSnapshot = z.infer<typeof CryptoMarketSnapshot>;

export const DepartmentStance = z.enum(['BULLISH', 'BEARISH', 'NEUTRAL', 'ABSTAIN']);
export type DepartmentStance = z.infer<typeof DepartmentStance>;

export const DepartmentExecutionStatus = z.enum(['OK', 'DEGRADED', 'FAILED', 'UNAVAILABLE']);
export type DepartmentExecutionStatus = z.infer<typeof DepartmentExecutionStatus>;

export const DepartmentFinding = z.object({
  department: AnalysisDepartmentId,
  status: DepartmentExecutionStatus,
  stance: DepartmentStance,
  /** Directional score in [-100.00, +100.00]. */
  score: DecimalString,
  /** Confidence in [0.00, 1.00]. */
  confidence: DecimalString,
  summary: z.string().min(1),
  metrics: z.record(z.string(), z.string().nullable()),
  evidence: z.array(EvidenceItem),
  riskFlags: z.array(RiskFlag),
  missingData: z.array(z.string()),
  durationMs: z.number().nonnegative(),
});
export type DepartmentFinding = z.infer<typeof DepartmentFinding>;

export const BullBearDebateRound = z.object({
  round: z.number().int().positive(),
  bullArgument: z.string().min(1),
  bearArgument: z.string().min(1),
  challengerCritique: z.string().min(1),
  citedEvidenceIds: z.array(z.string()),
});
export type BullBearDebateRound = z.infer<typeof BullBearDebateRound>;

export const BullBearDebateResult = z.object({
  status: DepartmentExecutionStatus,
  rounds: z.array(BullBearDebateRound),
  bullThesis: z.string().min(1),
  bearThesis: z.string().min(1),
  independentChallenge: z.string().min(1),
  unresolvedRisks: z.array(z.string()),
  consensusTilt: z.enum(['BULLISH', 'BEARISH', 'BALANCED', 'INCONCLUSIVE']),
  /** Conviction score in [-100.00, +100.00]. */
  debateConvictionScore: DecimalString,
});
export type BullBearDebateResult = z.infer<typeof BullBearDebateResult>;

export const SizingConstraintKindSchema = z.enum([
  'KELLY',
  'FIXED_FRACTIONAL',
  'VOLATILITY',
  'LIQUIDITY',
  'CONCENTRATION',
  'BELOW_MIN_LOT',
  'BLOCKED',
]);
export type SizingConstraintKindSchema = z.infer<typeof SizingConstraintKindSchema>;

export const PositionSizingLadderOutput = z.object({
  kellyQty: DecimalString,
  fixedFractionalQty: DecimalString,
  volatilityAdjustedQty: DecimalString,
  liquidityConstrainedQty: DecimalString,
  concentrationCappedQty: DecimalString,
  finalQuantity: DecimalString,
  finalNotionalUsdt: DecimalString,
  bindingConstraint: SizingConstraintKindSchema,
  lossPerUnitUsdt: DecimalString,
  netRewardPerUnitUsdt: DecimalString.nullable(),
  netRiskRewardRatio: DecimalString.nullable(),
  lotCheckError: z.string().nullable(),
});
export type PositionSizingLadderOutput = z.infer<typeof PositionSizingLadderOutput>;

export const CircuitBreakerStatusSchema = z.enum(['NORMAL', 'CAUTION', 'WARNING', 'CRITICAL', 'EMERGENCY']);
export type CircuitBreakerStatusSchema = z.infer<typeof CircuitBreakerStatusSchema>;

export const RiskExecutionReview = z.object({
  approved: z.boolean(),
  vetoReasons: z.array(z.string()),
  aggressiveView: z.string().min(1),
  conservativeView: z.string().min(1),
  neutralSynthesis: z.string().min(1),
  circuitBreakerStatus: CircuitBreakerStatusSchema,
  circuitBreakerMultiplier: DecimalString,
  estimatedSlippageBps: DecimalString.nullable(),
  liquidationBufferBps: DecimalString.nullable(),
  sizingLadder: PositionSizingLadderOutput.nullable(),
});
export type RiskExecutionReview = z.infer<typeof RiskExecutionReview>;

export const InvalidationCondition = z.object({
  id: z.string().min(1),
  metric: z.string().min(1),
  operator: z.enum(['LT', 'LTE', 'GT', 'GTE', 'EQ', 'STATUS_NOT_LIVE']),
  threshold: z.string().min(1),
  description: z.string().min(1),
});
export type InvalidationCondition = z.infer<typeof InvalidationCondition>;

/**
 * Advisory Trade Proposal:
 * Strictly separated from order execution (`advisoryOnly: true`, `liveExecutionEnabled: false`).
 * Never triggers `OrderService.placeOrder` or balance mutations.
 */
export const AdvisoryTradeProposal = z.object({
  advisoryOnly: z.literal(true),
  liveExecutionEnabled: z.literal(false),
  marketType: z.enum(['SPOT', 'FUTURES_PERP', 'NONE']),
  action: z.enum(['LONG', 'SHORT', 'REDUCE', 'HOLD', 'NO_TRADE']),
  side: OrderSide.nullable(),
  entryPrice: DecimalString.nullable(),
  stopLossPrice: DecimalString.nullable(),
  takeProfitPrice: DecimalString.nullable(),
  recommendedQuantity: DecimalString,
  recommendedNotionalUsdt: DecimalString,
  maxLeverage: DecimalString,
});
export type AdvisoryTradeProposal = z.infer<typeof AdvisoryTradeProposal>;

export const AnalysisAuditMetadata = z.object({
  upstreamRepo: z.literal('https://github.com/TauricResearch/TradingAgents'),
  upstreamCommit: z.literal('1394a3f72aa4393e1a98f51b382434c4b4c2d972'),
  upstreamVersion: z.literal('v0.6.0'),
  subsystemVersion: z.string().min(1),
  llmProvider: z.string().min(1),
  deterministicMathEngine: z.literal('@cex/core/Dec'),
  portfolioFingerprint: z.string().min(16),
  snapshotHash: z.string().min(16),
  runSignature: z.string().min(16),
  degradedDepartments: z.array(AnalysisDepartmentId),
  priorLessonsUsed: z.number().int().nonnegative(),
  totalDurationMs: z.number().nonnegative(),
});
export type AnalysisAuditMetadata = z.infer<typeof AnalysisAuditMetadata>;

export const CryptoMarketAnalysisReport = z.object({
  reportId: z.string().min(1),
  symbol: SymbolCode,
  interval: CandleInterval,
  asOf: IsoDateTime,
  rating: CryptoAnalysisRating,
  /** Overall confidence in [0.00, 1.00]. */
  confidence: DecimalString,
  /** Uncertainty score in [0.00, 1.00] (higher when data is missing/conflicting or regimes diverge). */
  uncertaintyScore: DecimalString,
  uncertaintyReasons: z.array(z.string()),
  executiveSummary: z.string().min(1),
  departmentFindings: z.array(DepartmentFinding),
  debate: BullBearDebateResult,
  riskReview: RiskExecutionReview,
  invalidationConditions: z.array(InvalidationCondition),
  advisoryProposal: AdvisoryTradeProposal,
  evidence: z.array(EvidenceItem),
  riskFlags: z.array(RiskFlag),
  audit: AnalysisAuditMetadata,
});
export type CryptoMarketAnalysisReport = z.infer<typeof CryptoMarketAnalysisReport>;

// ───────────────────────────── Walk-Forward & Backtest Evaluation Schemas

/** Fold bounds are candle `openTime`/`closeTime` (EpochMs). A Sharpe ratio is `null` when undefined (< 2 returns or zero variance). */
export const WalkForwardFoldMetrics = z.object({
  foldIndex: z.number().int().nonnegative(),
  trainStartMs: EpochMs,
  trainEndMs: EpochMs,
  testStartMs: EpochMs,
  testEndMs: EpochMs,
  inSampleSharpe: DecimalString.nullable(),
  outOfSampleSharpe: DecimalString.nullable(),
  outOfSampleReturnPct: DecimalString,
  outOfSampleMaxDrawdownPct: DecimalString,
  tradeCount: z.number().int().nonnegative(),
});
export type WalkForwardFoldMetrics = z.infer<typeof WalkForwardFoldMetrics>;

export const BacktestEvaluationSummary = z.object({
  symbol: SymbolCode,
  interval: CandleInterval,
  mode: z.literal('HISTORICAL_SIMULATION'),
  liveExecutionEnabled: z.literal(false),
  initialEquityUsdt: DecimalString,
  finalEquityUsdt: DecimalString,
  totalReturnPct: DecimalString,
  benchmarkBuyHoldReturnPct: DecimalString,
  excessReturnPct: DecimalString,
  maxDrawdownPct: DecimalString,
  /**
   * Ratio statistics are `null` when they are undefined for the sample (too few returns, zero variance,
   * no downside, no drawdown, no trades, no losing trade) — never a placeholder such as `0`, `0.5` or `9.99`.
   */
  sharpeRatio: DecimalString.nullable(),
  sortinoRatio: DecimalString.nullable(),
  calmarRatio: DecimalString.nullable(),
  /** Deflated Sharpe Ratio (Bailey & López de Prado, 2014) adjusted for multiple testing & non-normal returns. */
  deflatedSharpeRatio: DecimalString.nullable(),
  /** Probability of Backtest Overfitting (PBO, 0..1) estimated across combinatorial partitions. */
  probabilityOfBacktestOverfitting: DecimalString.nullable(),
  winRatePct: DecimalString.nullable(),
  profitFactor: DecimalString.nullable(),
  totalTrades: z.number().int().nonnegative(),
  turnoverMultiple: DecimalString,
  totalFeesPaidUsdt: DecimalString,
  totalSlippageCostUsdt: DecimalString,
  totalFundingPaidUsdt: DecimalString,
  liquidityCappedTrades: z.number().int().nonnegative(),
  staleOrHaltedSkips: z.number().int().nonnegative(),
  walkForwardEfficiencyRatio: DecimalString.nullable(),
  walkForwardFolds: z.array(WalkForwardFoldMetrics),
  verdict: z.enum(['PASS_RESEARCH_GATE', 'CAUTIOUS_INCONCLUSIVE', 'FAIL_OVERFIT_OR_NEGATIVE']),
  profitabilityDisclaimer: z.string().min(20),
});
export type BacktestEvaluationSummary = z.infer<typeof BacktestEvaluationSummary>;
