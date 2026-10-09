import { Candle, PriceActionAnalysis, SwingPoint } from '../types/crypto';

export function calculateATR(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) return candles[candles.length - 1]?.close * 0.02 || 1;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }

  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

export function detectSwingPoints(candles: Candle[], lookback: number = 3): SwingPoint[] {
  const points: SwingPoint[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= current.high || candles[i + j].high > current.high) {
        isHigh = false;
      }
      if (candles[i - j].low <= current.low || candles[i + j].low < current.low) {
        isLow = false;
      }
    }

    if (isHigh) {
      points.push({
        index: i,
        time: current.time,
        price: current.high,
        type: 'HIGH',
        label: 'SWING'
      });
    } else if (isLow) {
      points.push({
        index: i,
        time: current.time,
        price: current.low,
        type: 'LOW',
        label: 'SWING'
      });
    }
  }

  // Label HH, HL, LH, LL
  let lastHigh: number | null = null;
  let lastLow: number | null = null;

  for (const pt of points) {
    if (pt.type === 'HIGH') {
      if (lastHigh === null) {
        pt.label = 'SWING';
      } else if (pt.price > lastHigh) {
        pt.label = 'HH';
      } else {
        pt.label = 'LH';
      }
      lastHigh = pt.price;
    } else {
      if (lastLow === null) {
        pt.label = 'SWING';
      } else if (pt.price > lastLow) {
        pt.label = 'HL';
      } else {
        pt.label = 'LL';
      }
      lastLow = pt.price;
    }
  }

  return points;
}

export function analyzePriceAction(candles: Candle[]): PriceActionAnalysis {
  if (!candles || candles.length < 15) {
    return {
      trend: 'NEUTRAL_RANGE',
      structure: 'RANGING',
      atr14: 0,
      atrPercent: 0,
      volatilityState: 'NORMAL',
      keySupportLevels: [],
      keyResistanceLevels: [],
      recentBreakout: { occurred: false, direction: 'NONE', level: 0, retestStatus: 'PENDING' },
      swingPoints: [],
      score: 50
    };
  }

  const currentPrice = candles[candles.length - 1].close;
  const atr = calculateATR(candles, 14);
  const atrPercent = (atr / currentPrice) * 100;
  const swingPoints = detectSwingPoints(candles, 2);

  // Identify Key S/R from swing points
  const highs = swingPoints.filter(p => p.type === 'HIGH').map(p => p.price);
  const lows = swingPoints.filter(p => p.type === 'LOW').map(p => p.price);

  const resistanceLevels = highs.filter(h => h > currentPrice).sort((a, b) => a - b).slice(0, 3);
  const supportLevels = lows.filter(l => l < currentPrice).sort((a, b) => b - a).slice(0, 3);

  // Trend detection from swings & Moving Averages
  const closes = candles.map(c => c.close);
  const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, closes.length);
  const ma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, closes.length);

  const recentSwings = swingPoints.slice(-6);
  const hhCount = recentSwings.filter(s => s.label === 'HH').length;
  const hlCount = recentSwings.filter(s => s.label === 'HL').length;
  const lhCount = recentSwings.filter(s => s.label === 'LH').length;
  const llCount = recentSwings.filter(s => s.label === 'LL').length;

  let trend: PriceActionAnalysis['trend'] = 'NEUTRAL_RANGE';
  let structure: PriceActionAnalysis['structure'] = 'RANGING';

  if (hhCount >= 1 && hlCount >= 1 && currentPrice > ma20 && ma20 > ma50) {
    trend = 'STRONG_BULLISH';
    structure = 'HIGHER_HIGHS';
  } else if (currentPrice > ma20 && (hhCount > 0 || hlCount > 0)) {
    trend = 'BULLISH';
    structure = 'HIGHER_HIGHS';
  } else if (llCount >= 1 && lhCount >= 1 && currentPrice < ma20 && ma20 < ma50) {
    trend = 'STRONG_BEARISH';
    structure = 'LOWER_LOWS';
  } else if (currentPrice < ma20 && (llCount > 0 || lhCount > 0)) {
    trend = 'BEARISH';
    structure = 'LOWER_LOWS';
  } else {
    trend = 'NEUTRAL_RANGE';
    structure = 'RANGING';
  }

  // Volatility State
  const volatilityState: PriceActionAnalysis['volatilityState'] =
    atrPercent > 4.5 ? 'EXPANDED' : atrPercent < 1.8 ? 'COMPRESSED' : 'NORMAL';

  // Breakout detection
  const recentHighestHigh = Math.max(...candles.slice(-20, -1).map(c => c.high));
  const recentLowestLow = Math.min(...candles.slice(-20, -1).map(c => c.low));
  let breakoutDirection: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE';
  let breakoutLevel = 0;
  let retestStatus: 'PENDING' | 'TESTING' | 'CONFIRMED_BOUNCE' | 'FAILED' = 'PENDING';

  if (currentPrice > recentHighestHigh) {
    breakoutDirection = 'BULLISH';
    breakoutLevel = recentHighestHigh;
    const distanceToLevel = (currentPrice - breakoutLevel) / breakoutLevel;
    retestStatus = distanceToLevel < 0.015 ? 'TESTING' : distanceToLevel < 0.05 ? 'CONFIRMED_BOUNCE' : 'PENDING';
  } else if (currentPrice < recentLowestLow) {
    breakoutDirection = 'BEARISH';
    breakoutLevel = recentLowestLow;
    retestStatus = 'PENDING';
  }

  // Calculate Deterministic Score (0-100)
  let score = 50;
  if (trend === 'STRONG_BULLISH') score += 30;
  else if (trend === 'BULLISH') score += 18;
  else if (trend === 'BEARISH') score -= 18;
  else if (trend === 'STRONG_BEARISH') score -= 30;

  if (structure === 'HIGHER_HIGHS') score += 10;
  if (breakoutDirection === 'BULLISH' && (retestStatus === 'TESTING' || retestStatus === 'CONFIRMED_BOUNCE')) score += 10;
  if (volatilityState === 'COMPRESSED') score += 5; // potential explosive expansion setup

  score = Math.max(10, Math.min(95, score));

  return {
    trend,
    structure,
    atr14: atr,
    atrPercent,
    volatilityState,
    keySupportLevels: supportLevels.length ? supportLevels : [currentPrice * 0.95, currentPrice * 0.92],
    keyResistanceLevels: resistanceLevels.length ? resistanceLevels : [currentPrice * 1.05, currentPrice * 1.10],
    recentBreakout: {
      occurred: breakoutDirection !== 'NONE',
      direction: breakoutDirection,
      level: breakoutLevel,
      retestStatus
    },
    swingPoints: swingPoints.slice(-12),
    score
  };
}
