import {
  AlertPriority,
  Candle,
  CoinMarketData,
  ConfluenceScoreBreakdown,
  ConfluenceWeights,
  DerivativesData,
  OnchainData,
  PriceActionAnalysis,
  RelativeStrengthAnalysis,
  RiskRewardMetrics,
  SectorRotationData,
  SetupSignal,
  SignalStatus,
  SMCAnalysis,
  WhaleTransaction
} from '../types/crypto';
import { analyzeDerivativesConfluence } from './derivativesEngine';
import { analyzePriceAction } from './priceActionEngine';
import { calculateRelativeStrength } from './relativeStrengthEngine';
import { calculateRiskAndTargets } from './riskEngine';
import { analyzeSectorRotations } from './rotationEngine';
import { analyzeSMC } from './smcEngine';
import { scoreWhaleFlows } from './whaleEngine';

export const DEFAULT_WEIGHTS: ConfluenceWeights = {
  marketWeight: 0.10,
  priceActionWeight: 0.20,
  smcWeight: 0.20,
  relativeStrengthWeight: 0.15,
  derivativesWeight: 0.15,
  whaleWeight: 0.10,
  onchainWeight: 0.05,
  rotationWeight: 0.05
};

export function evaluateSetupSignal(params: {
  coin: CoinMarketData;
  candles: Candle[];
  derivatives: DerivativesData;
  whaleTxs: WhaleTransaction[];
  onchain?: OnchainData;
  btcCoin?: CoinMarketData;
  ethCoin?: CoinMarketData;
  allCoins: CoinMarketData[];
  weights?: ConfluenceWeights;
  marketRegimeScore?: number;
}): SetupSignal {
  const {
    coin,
    candles,
    derivatives,
    whaleTxs,
    onchain,
    btcCoin,
    ethCoin,
    allCoins,
    weights = DEFAULT_WEIGHTS,
    marketRegimeScore = 65
  } = params;

  // 1. Run deterministic engines
  const priceAction: PriceActionAnalysis = analyzePriceAction(candles);
  const smc: SMCAnalysis = analyzeSMC(candles);
  const relativeStrength: RelativeStrengthAnalysis = calculateRelativeStrength(coin, btcCoin, ethCoin, allCoins);
  const derivativesAnalysis = analyzeDerivativesConfluence(coin.change24h, derivatives);
  const whaleSummary = scoreWhaleFlows(whaleTxs, coin.symbol);
  const sectorRotations = analyzeSectorRotations(allCoins);

  const matchedSector = sectorRotations.find(s => s.coins.includes(coin.symbol.toUpperCase()));
  const rotationScore = matchedSector ? matchedSector.momentumScore : 50;

  // Onchain scoring
  let onchainScore = 50;
  if (onchain) {
    if (onchain.tvlChange7d > 10) onchainScore += 25;
    else if (onchain.tvlChange7d > 3) onchainScore += 15;
    else if (onchain.tvlChange7d < -5) onchainScore -= 20;

    if (onchain.stablecoinFlow24h > 5_000_000) onchainScore += 15;
    onchainScore = Math.max(10, Math.min(98, onchainScore));
  }

  // 2. Aggregate weighted confluence score
  const scores: ConfluenceScoreBreakdown = {
    marketScore: marketRegimeScore,
    priceActionScore: priceAction.score,
    smcScore: smc.score,
    relativeStrengthScore: relativeStrength.score,
    derivativesScore: derivativesAnalysis.score,
    whaleScore: whaleSummary.score,
    onchainScore,
    rotationScore,
    totalConfluenceScore: 0
  };

  const total =
    scores.marketScore * weights.marketWeight +
    scores.priceActionScore * weights.priceActionWeight +
    scores.smcScore * weights.smcWeight +
    scores.relativeStrengthScore * weights.relativeStrengthWeight +
    scores.derivativesScore * weights.derivativesWeight +
    scores.whaleScore * weights.whaleWeight +
    scores.onchainScore * weights.onchainWeight +
    scores.rotationScore * weights.rotationWeight;

  scores.totalConfluenceScore = Number(total.toFixed(1));

  // 3. Direction and Risk Target Calculation
  const direction: SetupSignal['direction'] =
    priceAction.trend.includes('BULLISH') || smc.marketStructure === 'BULLISH' ? 'LONG' :
    priceAction.trend.includes('BEARISH') || smc.marketStructure === 'BEARISH' ? 'SHORT' : 'NEUTRAL';

  const risk: RiskRewardMetrics = calculateRiskAndTargets(
    coin.price,
    priceAction,
    smc,
    candles,
    direction === 'SHORT' ? 'SHORT' : 'LONG'
  );

  // 4. Evidence generation (strictly deterministic, no fabricated claims)
  const evidencePoints: string[] = [];
  const keyRisks: string[] = [];

  if (smc.bosDetected) evidencePoints.push(`Bullish Break of Structure (BOS) validated at $${smc.bosLevel?.toFixed(2)}.`);
  if (smc.chochDetected) evidencePoints.push(`Change of Character (CHOCH) confirms structural reversal.`);
  if (smc.currentZone === 'DISCOUNT') evidencePoints.push(`Asset is situated in institutional Discount pricing zone relative to dealing range.`);
  if (priceAction.trend === 'STRONG_BULLISH' || priceAction.trend === 'BULLISH') evidencePoints.push(`Price Action confirmed in ${priceAction.trend.replace('_', ' ')} alignment above key exponential moving averages.`);
  if (relativeStrength.rsVsBtc24h > 2.0) evidencePoints.push(`Strong relative strength: outperforming BTC by +${relativeStrength.rsVsBtc24h}% (24h).`);
  if (derivativesAnalysis.signals.length > 0) evidencePoints.push(...derivativesAnalysis.signals);
  if (whaleSummary.netSmartMoneyFlowUSD > 2_000_000) {
    evidencePoints.push(`Verified Smart Money net accumulation of +$${(whaleSummary.netSmartMoneyFlowUSD / 1_000_000).toFixed(1)}M over last 24h.`);
  }
  if (matchedSector && matchedSector.capitalFlow === 'ACCELERATING_INFLOW') {
    evidencePoints.push(`Sector tailwind: ${matchedSector.sectorName} showing accelerating capital inflows (Momentum ${matchedSector.momentumScore}/100).`);
  }

  // Key Risks
  if (derivativesAnalysis.riskAlerts.length > 0) keyRisks.push(...derivativesAnalysis.riskAlerts);
  if (priceAction.keyResistanceLevels.length > 0 && priceAction.keyResistanceLevels[0] < coin.price * 1.04) {
    keyRisks.push(`Immediate overhead resistance located at $${priceAction.keyResistanceLevels[0].toFixed(2)} (within 4% of spot).`);
  }
  if (marketRegimeScore < 50) {
    keyRisks.push(`Broader crypto market regime is currently choppy/risk-off.`);
  }
  if (!risk.isTradeable && risk.rejectionReason) {
    keyRisks.push(risk.rejectionReason);
  }

  // 5. Signal Classification & Priority
  let status: SignalStatus = 'INFO';
  let priority: AlertPriority = 'LOW';

  if (!risk.isTradeable) {
    status = 'INVALIDATED';
    priority = 'LOW';
  } else if (scores.totalConfluenceScore >= 78 && (smc.bosDetected || smc.chochDetected || priceAction.recentBreakout.occurred)) {
    status = 'READY';
    priority = scores.totalConfluenceScore >= 85 ? 'CRITICAL' : 'HIGH';
  } else if (scores.totalConfluenceScore >= 64) {
    status = 'SETUP FORMING';
    priority = 'MEDIUM';
  } else if (scores.totalConfluenceScore >= 48 || whaleSummary.recentLargeTxsCount > 0) {
    status = 'WATCH';
    priority = 'LOW';
  } else {
    status = 'INFO';
    priority = 'LOW';
  }

  const invalidationTrigger = risk.invalidationConditions.join(' | ') || `Break below $${risk.stopLossPrice.toFixed(2)}`;

  return {
    id: `sig-${coin.symbol.toLowerCase()}-${Date.now()}`,
    timestamp: Date.now(),
    coinId: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    category: coin.category,
    currentPrice: coin.price,
    direction,
    status,
    priority,
    scores,
    priceAction,
    smc,
    relativeStrength,
    derivatives,
    onchain,
    whaleSummary,
    risk,
    evidencePoints,
    keyRisks,
    invalidationTrigger,
    candles
  };
}
