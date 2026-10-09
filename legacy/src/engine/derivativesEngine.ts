import { DerivativesData } from '../types/crypto';

export function analyzeDerivativesConfluence(
  priceChange24h: number,
  derivatives: DerivativesData
): {
  score: number;
  interpretation: DerivativesData['oiInterpretation'];
  signals: string[];
  riskAlerts: string[];
} {
  const { openInterestChange24h, fundingRate, longShortRatio, liquidations24h } = derivatives;
  const signals: string[] = [];
  const riskAlerts: string[] = [];

  let interpretation: DerivativesData['oiInterpretation'] = 'NEUTRAL';
  let score = 50;

  // Combination 1: Price UP + OI UP (Aggressive Long Buildup / Organic Trend Inflow)
  if (priceChange24h > 1.5 && openInterestChange24h > 4) {
    if (fundingRate > 0.04) {
      interpretation = 'LONG_BUILDUP';
      signals.push('Heavy Long positioning detected. Funding rate is elevated (+ ' + (fundingRate * 100).toFixed(3) + '%/8h).');
      riskAlerts.push('High funding increases cascading long liquidation risk on sudden pullbacks.');
      score += 15; // good momentum but check leverage risk
    } else {
      interpretation = 'LONG_BUILDUP';
      signals.push('Healthy institutional Long expansion with non-overheated funding.');
      score += 30;
    }
  }
  // Combination 2: Price DOWN + OI UP (Aggressive Short Buildup -> High Short Squeeze potential)
  else if (priceChange24h < -1.5 && openInterestChange24h > 5) {
    if (fundingRate < -0.01) {
      interpretation = 'SHORT_SQUEEZE';
      signals.push('Aggressive Short buildup in negative funding territory. Potential high-velocity Short Squeeze trigger.');
      score += 25;
    } else {
      interpretation = 'SHORT_BUILDUP';
      signals.push('Short-sellers adding leverage with price downward pressure.');
      score -= 20;
    }
  }
  // Combination 3: Price UP + OI DOWN (Short Covering / Squeeze liquidation run)
  else if (priceChange24h > 2 && openInterestChange24h < -3) {
    interpretation = 'SHORT_SQUEEZE';
    signals.push('Upward move driven by Short covering and liquidations rather than fresh spot accumulation.');
    score += 10;
  }
  // Combination 4: Price DOWN + OI DOWN (Long Liquidations / Flush)
  else if (priceChange24h < -2 && openInterestChange24h < -4) {
    interpretation = 'LONG_LIQUIDATION';
    signals.push('Leverage flush: Long positions liquidated, clearing open interest overhang.');
    if (liquidations24h.longsUSD > 5_000_000) {
      signals.push('Significant $ ' + (liquidations24h.longsUSD / 1_000_000).toFixed(1) + 'M Long flush completed, creating discount reset.');
      score += 15; // reset can be fertile for reversal
    }
  }
  // Combination 5: Spot-driven
  else if (Math.abs(openInterestChange24h) < 2 && Math.abs(priceChange24h) > 2) {
    interpretation = 'SPOT_DRIVEN';
    signals.push('Price expansion is spot-volume driven with low leverage speculation.');
    score += 20;
  }

  // Check Long/Short sentiment divergence
  if (longShortRatio < 0.85 && priceChange24h >= 0) {
    signals.push('Retail is heavily net-short (' + longShortRatio.toFixed(2) + ' L/S ratio), creating bullish contrarian fuel.');
    score += 10;
  } else if (longShortRatio > 2.2) {
    riskAlerts.push('Extreme retail long bias (' + longShortRatio.toFixed(2) + ' L/S ratio), elevated flush risk.');
    score -= 15;
  }

  // Extreme funding penalty
  if (fundingRate > 0.06) {
    riskAlerts.push('Overheated funding (' + (fundingRate * 100).toFixed(2) + '%). Long holding cost is prohibitive.');
    score -= 25;
  }

  score = Math.max(10, Math.min(98, score));

  return {
    score,
    interpretation,
    signals,
    riskAlerts
  };
}
