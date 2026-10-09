import { Candle, PriceActionAnalysis, RiskRewardMetrics, SMCAnalysis } from '../types/crypto';

export function calculateRiskAndTargets(
  currentPrice: number,
  priceAction: PriceActionAnalysis,
  smc: SMCAnalysis,
  candles: Candle[],
  direction: 'LONG' | 'SHORT' = 'LONG'
): RiskRewardMetrics {
  const atr = priceAction.atr14 || currentPrice * 0.025;
  const invalidationConditions: string[] = [];

  if (direction === 'LONG') {
    // 1. Structure-based Entry Zone
    // Preferred: Retest into bullish demand order block or bullish FVG or key support
    let entryMin = currentPrice * 0.985;
    let entryMax = currentPrice * 1.005;
    let entryTrigger = 'Limit orders scaled into demand zone on minor pullbacks';

    const nearbyOB = smc.activeOrderBlocks.find(
      ob => ob.type === 'BULLISH_DEMAND' && ob.topPrice <= currentPrice * 1.02 && ob.bottomPrice >= currentPrice * 0.90
    );

    const nearbyFVG = smc.activeFVGs.find(
      fvg => fvg.type === 'BULLISH' && fvg.topPrice <= currentPrice * 1.02 && fvg.bottomPrice >= currentPrice * 0.90
    );

    if (nearbyOB) {
      entryMin = nearbyOB.bottomPrice;
      entryMax = Math.min(currentPrice, nearbyOB.topPrice);
      entryTrigger = `Limit entry within validated Bullish Demand Order Block ($${entryMin.toFixed(2)} – $${entryMax.toFixed(2)})`;
    } else if (nearbyFVG) {
      entryMin = nearbyFVG.bottomPrice;
      entryMax = Math.min(currentPrice, nearbyFVG.topPrice);
      entryTrigger = `Imbalance mitigation retest entry in Bullish FVG ($${entryMin.toFixed(2)} – $${entryMax.toFixed(2)})`;
    } else if (priceAction.keySupportLevels.length > 0) {
      const topSupport = priceAction.keySupportLevels[0];
      entryMin = topSupport * 0.995;
      entryMax = Math.min(currentPrice, topSupport * 1.015);
      entryTrigger = `Horizontal pivot support retest ($${entryMin.toFixed(2)} – $${entryMax.toFixed(2)})`;
    }

    const midEntry = (entryMin + entryMax) / 2;

    // 2. Structure-based Stop Loss
    let stopLossPrice: number;
    let stopLossRationale: string;

    const swingLows = priceAction.swingPoints.filter(s => s.type === 'LOW');
    const recentSwingLow = swingLows.length > 0 ? swingLows[swingLows.length - 1].price : null;

    if (nearbyOB) {
      // Below OB bottom with 0.5 ATR buffer
      stopLossPrice = nearbyOB.bottomPrice - atr * 0.4;
      stopLossRationale = `Placed below Bullish Demand Order Block base ($${nearbyOB.bottomPrice.toFixed(2)}) + 0.4x ATR buffer for structure invalidation.`;
      invalidationConditions.push(`4H Candle close below $${stopLossPrice.toFixed(2)} breaches institutional demand boundary.`);
    } else if (recentSwingLow && recentSwingLow < midEntry) {
      stopLossPrice = recentSwingLow - atr * 0.35;
      stopLossRationale = `Placed below structural swing low ($${recentSwingLow.toFixed(2)}) + 0.35x ATR buffer.`;
      invalidationConditions.push(`Break of swing low ($${recentSwingLow.toFixed(2)}) constitutes bearish CHOCH.`);
    } else {
      stopLossPrice = midEntry - atr * 1.8;
      stopLossRationale = `ATR Volatility stop placed at 1.8x ATR below entry midpoint.`;
      invalidationConditions.push(`Price decline beyond 1.8x ATR ($${stopLossPrice.toFixed(2)}) signals trend breakdown.`);
    }

    // Guard against stop being equal or above entry
    if (stopLossPrice >= midEntry * 0.99) {
      stopLossPrice = midEntry * 0.95;
    }

    const riskAmount = midEntry - stopLossPrice;
    const stopLossPercent = Number(((riskAmount / midEntry) * 100).toFixed(2));

    // 3. Targets: TP1, TP2, TP3
    const swingHighs = priceAction.swingPoints.filter(s => s.type === 'HIGH').map(s => s.price).filter(p => p > midEntry);
    const keyResistances = priceAction.keyResistanceLevels.filter(r => r > midEntry);

    // Target 1: 1.5R or nearest resistance
    const target1ByR = midEntry + riskAmount * 1.5;
    const target1ByStructure = keyResistances[0] || (swingHighs[0] ? swingHighs[0] * 0.99 : target1ByR);
    const takeProfit1 = Math.max(midEntry * 1.02, Math.min(target1ByR, target1ByStructure));
    const takeProfit1Percent = Number((((takeProfit1 - midEntry) / midEntry) * 100).toFixed(2));

    // Target 2: 2.5R or major swing high
    const target2ByR = midEntry + riskAmount * 2.5;
    const target2ByStructure = swingHighs[0] || (keyResistances[1] || target2ByR);
    const takeProfit2 = Math.max(takeProfit1 * 1.02, Math.max(target2ByR, target2ByStructure));
    const takeProfit2Percent = Number((((takeProfit2 - midEntry) / midEntry) * 100).toFixed(2));

    // Target 3: 4.0R or liquidity sweep above highs
    const takeProfit3 = midEntry + riskAmount * 4.0;
    const takeProfit3Percent = Number((((takeProfit3 - midEntry) / midEntry) * 100).toFixed(2));

    const rewardToTp1 = Number(((takeProfit1 - midEntry) / riskAmount).toFixed(2));
    const rewardToTp2 = Number(((takeProfit2 - midEntry) / riskAmount).toFixed(2));
    const rewardToTp3 = Number(((takeProfit3 - midEntry) / riskAmount).toFixed(2));

    const riskRewardRatio = rewardToTp2;
    const isTradeable = riskRewardRatio >= 1.5 && stopLossPercent <= 12;
    let rejectionReason: string | undefined;

    if (!isTradeable) {
      if (riskRewardRatio < 1.5) {
        rejectionReason = `Risk/Reward ratio (${riskRewardRatio.toFixed(2)}) is below the required 1.50 minimum institutional threshold.`;
      } else if (stopLossPercent > 12) {
        rejectionReason = `Stop Loss distance (${stopLossPercent.toFixed(1)}%) is excessively wide for safe risk positioning.`;
      }
    }

    invalidationConditions.push(`BTC breaking key HTF support invalidates crypto-wide long setups.`);

    return {
      entryPrice: Number(midEntry.toFixed(4)),
      entryZone: [Number(entryMin.toFixed(4)), Number(entryMax.toFixed(4))],
      entryTrigger,
      stopLossPrice: Number(stopLossPrice.toFixed(4)),
      stopLossPercent,
      stopLossRationale,
      takeProfit1: Number(takeProfit1.toFixed(4)),
      takeProfit1Percent,
      takeProfit2: Number(takeProfit2.toFixed(4)),
      takeProfit2Percent,
      takeProfit3: Number(takeProfit3.toFixed(4)),
      takeProfit3Percent,
      riskAmountPerUnit: Number(riskAmount.toFixed(4)),
      rewardToTp1,
      rewardToTp2,
      rewardToTp3,
      riskRewardRatio,
      isTradeable,
      rejectionReason,
      invalidationConditions
    };
  } else {
    // SHORT direction support
    const entryMin = currentPrice * 0.995;
    const entryMax = currentPrice * 1.015;
    const midEntry = (entryMin + entryMax) / 2;
    const stopLossPrice = midEntry + atr * 1.8;
    const riskAmount = stopLossPrice - midEntry;
    const stopLossPercent = Number(((riskAmount / midEntry) * 100).toFixed(2));
    const takeProfit1 = midEntry - riskAmount * 1.5;
    const takeProfit2 = midEntry - riskAmount * 2.5;
    const takeProfit3 = midEntry - riskAmount * 4.0;

    return {
      entryPrice: Number(midEntry.toFixed(4)),
      entryZone: [Number(entryMin.toFixed(4)), Number(entryMax.toFixed(4))],
      entryTrigger: 'Resistance retest short execution',
      stopLossPrice: Number(stopLossPrice.toFixed(4)),
      stopLossPercent,
      stopLossRationale: 'Stop loss placed above supply zone and swing high structure.',
      takeProfit1: Number(takeProfit1.toFixed(4)),
      takeProfit1Percent: Number((((midEntry - takeProfit1) / midEntry) * 100).toFixed(2)),
      takeProfit2: Number(takeProfit2.toFixed(4)),
      takeProfit2Percent: Number((((midEntry - takeProfit2) / midEntry) * 100).toFixed(2)),
      takeProfit3: Number(takeProfit3.toFixed(4)),
      takeProfit3Percent: Number((((midEntry - takeProfit3) / midEntry) * 100).toFixed(2)),
      riskAmountPerUnit: Number(riskAmount.toFixed(4)),
      rewardToTp1: 1.5,
      rewardToTp2: 2.5,
      rewardToTp3: 4.0,
      riskRewardRatio: 2.5,
      isTradeable: true,
      invalidationConditions: ['Candle close above structural supply invalidates short thesis.']
    };
  }
}
