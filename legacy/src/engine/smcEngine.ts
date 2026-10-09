import { Candle, FairValueGap, LiquiditySweep, OrderBlock, SMCAnalysis } from '../types/crypto';
import { detectSwingPoints } from './priceActionEngine';

export function findFairValueGaps(candles: Candle[]): FairValueGap[] {
  const fvgs: FairValueGap[] = [];
  if (candles.length < 3) return fvgs;

  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];

    // Bullish FVG: Candle 1 High is less than Candle 3 Low (Gap between c1.high and c3.low)
    if (c3.low > c1.high && (c2.close > c2.open)) {
      const topPrice = c3.low;
      const bottomPrice = c1.high;
      // Check if subsequent candles mitigated it
      let isMitigated = false;
      let mitigationTime: number | undefined;

      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].low <= bottomPrice) {
          isMitigated = true;
          mitigationTime = candles[j].time;
          break;
        }
      }

      fvgs.push({
        startIndex: i - 1,
        time: c2.time,
        type: 'BULLISH',
        topPrice,
        bottomPrice,
        isMitigated,
        mitigationTime
      });
    }

    // Bearish FVG: Candle 1 Low is greater than Candle 3 High
    if (c1.low > c3.high && (c2.close < c2.open)) {
      const topPrice = c1.low;
      const bottomPrice = c3.high;
      let isMitigated = false;
      let mitigationTime: number | undefined;

      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].high >= topPrice) {
          isMitigated = true;
          mitigationTime = candles[j].time;
          break;
        }
      }

      fvgs.push({
        startIndex: i - 1,
        time: c2.time,
        type: 'BEARISH',
        topPrice,
        bottomPrice,
        isMitigated,
        mitigationTime
      });
    }
  }

  return fvgs;
}

export function findOrderBlocks(candles: Candle[]): OrderBlock[] {
  const orderBlocks: OrderBlock[] = [];
  if (candles.length < 5) return orderBlocks;

  const avgVolume = candles.reduce((acc, c) => acc + c.volume, 0) / candles.length;

  for (let i = 2; i < candles.length - 2; i++) {
    const prevCandle = candles[i - 1];
    const triggerCandle = candles[i];
    const followCandle1 = candles[i + 1];
    const followCandle2 = candles[i + 2];

    // Bullish Demand OB: Bearish candle followed by strong bullish displacement with volume
    if (
      triggerCandle.close < triggerCandle.open && // Bearish candle
      followCandle1.close > followCandle1.open && // Next is strong bull
      followCandle2.close > followCandle2.open &&
      (followCandle1.close - followCandle1.open) > (triggerCandle.open - triggerCandle.close) * 1.5 &&
      followCandle1.volume > avgVolume * 1.2
    ) {
      const topPrice = Math.max(triggerCandle.open, triggerCandle.close);
      const bottomPrice = triggerCandle.low;

      let isTested = false;
      let isBreached = false;

      for (let j = i + 3; j < candles.length; j++) {
        if (candles[j].low <= topPrice && candles[j].low >= bottomPrice) {
          isTested = true;
        }
        if (candles[j].close < bottomPrice) {
          isBreached = true;
          break;
        }
      }

      if (!isBreached) {
        orderBlocks.push({
          startIndex: i,
          time: triggerCandle.time,
          type: 'BULLISH_DEMAND',
          topPrice,
          bottomPrice,
          volumeMultiplier: Number((followCandle1.volume / (avgVolume || 1)).toFixed(2)),
          isTested,
          isBreached
        });
      }
    }

    // Bearish Supply OB: Bullish candle followed by strong bearish displacement
    if (
      triggerCandle.close > triggerCandle.open &&
      followCandle1.close < followCandle1.open &&
      followCandle2.close < followCandle2.open &&
      (followCandle1.open - followCandle1.close) > (triggerCandle.close - triggerCandle.open) * 1.5 &&
      followCandle1.volume > avgVolume * 1.2
    ) {
      const topPrice = triggerCandle.high;
      const bottomPrice = Math.min(triggerCandle.open, triggerCandle.close);

      let isTested = false;
      let isBreached = false;

      for (let j = i + 3; j < candles.length; j++) {
        if (candles[j].high >= bottomPrice && candles[j].high <= topPrice) {
          isTested = true;
        }
        if (candles[j].close > topPrice) {
          isBreached = true;
          break;
        }
      }

      if (!isBreached) {
        orderBlocks.push({
          startIndex: i,
          time: triggerCandle.time,
          type: 'BEARISH_SUPPLY',
          topPrice,
          bottomPrice,
          volumeMultiplier: Number((followCandle1.volume / (avgVolume || 1)).toFixed(2)),
          isTested,
          isBreached
        });
      }
    }
  }

  return orderBlocks;
}

export function detectLiquiditySweeps(candles: Candle[]): LiquiditySweep[] {
  const sweeps: LiquiditySweep[] = [];
  if (candles.length < 10) return sweeps;

  for (let i = 5; i < candles.length - 1; i++) {
    const current = candles[i];
    const next = candles[i + 1];

    // Lookback prior 5 candles highs and lows
    const priorHigh = Math.max(...candles.slice(i - 5, i).map(c => c.high));
    const priorLow = Math.min(...candles.slice(i - 5, i).map(c => c.low));

    // Sweep Highs: Wick broke prior high but candle closed below it
    if (current.high > priorHigh && current.close < priorHigh) {
      const reversalConfirmed = next.close < current.close;
      sweeps.push({
        time: current.time,
        level: priorHigh,
        type: 'SWEEP_HIGHS',
        reversalConfirmed
      });
    }

    // Sweep Lows: Wick broke prior low but candle closed above it
    if (current.low < priorLow && current.close > priorLow) {
      const reversalConfirmed = next.close > current.close;
      sweeps.push({
        time: current.time,
        level: priorLow,
        type: 'SWEEP_LOWS',
        reversalConfirmed
      });
    }
  }

  return sweeps;
}

export function analyzeSMC(candles: Candle[]): SMCAnalysis {
  if (!candles || candles.length < 15) {
    return {
      marketStructure: 'CONSOLIDATION',
      bosDetected: false,
      chochDetected: false,
      activeOrderBlocks: [],
      activeFVGs: [],
      recentSweeps: [],
      equilibriumPrice: 0,
      currentZone: 'EQUILIBRIUM',
      score: 50,
      deterministicSummary: 'Insufficient candle data for institutional structure verification.'
    };
  }

  const currentPrice = candles[candles.length - 1].close;
  const swings = detectSwingPoints(candles, 2);
  const fvgs = findFairValueGaps(candles);
  const unmitigatedFVGs = fvgs.filter(f => !f.isMitigated).slice(-4);
  const orderBlocks = findOrderBlocks(candles).slice(-4);
  const sweeps = detectLiquiditySweeps(candles).slice(-3);

  // Dealing Range & Equilibrium
  const highPeriod = Math.max(...candles.slice(-30).map(c => c.high));
  const lowPeriod = Math.min(...candles.slice(-30).map(c => c.low));
  const equilibriumPrice = (highPeriod + lowPeriod) / 2;

  let currentZone: SMCAnalysis['currentZone'] = 'EQUILIBRIUM';
  if (currentPrice < equilibriumPrice * 0.98) {
    currentZone = 'DISCOUNT';
  } else if (currentPrice > equilibriumPrice * 1.02) {
    currentZone = 'PREMIUM';
  }

  // BOS & CHOCH Detection
  const swingHighs = swings.filter(s => s.type === 'HIGH');
  const swingLows = swings.filter(s => s.type === 'LOW');

  let bosDetected = false;
  let bosLevel: number | undefined;
  let chochDetected = false;
  let chochLevel: number | undefined;
  let marketStructure: SMCAnalysis['marketStructure'] = 'CONSOLIDATION';

  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const lastSwingHigh = swingHighs[swingHighs.length - 1];
    const prevSwingHigh = swingHighs[swingHighs.length - 2];
    const lastSwingLow = swingLows[swingLows.length - 1];
    const prevSwingLow = swingLows[swingLows.length - 2];

    // Bullish BOS: Current price broken above last swing high in an already upward sequence
    if (currentPrice > lastSwingHigh.price) {
      bosDetected = true;
      bosLevel = lastSwingHigh.price;
      marketStructure = 'BULLISH';
    } else if (currentPrice < lastSwingLow.price) {
      bosDetected = true;
      bosLevel = lastSwingLow.price;
      marketStructure = 'BEARISH';
    }

    // CHOCH: If previous structure was bearish (LH, LL) and now breaks above recent swing high
    if (lastSwingLow.price < prevSwingLow.price && currentPrice > lastSwingHigh.price) {
      chochDetected = true;
      chochLevel = lastSwingHigh.price;
      marketStructure = 'BULLISH';
    } else if (lastSwingHigh.price > prevSwingHigh.price && currentPrice < lastSwingLow.price) {
      chochDetected = true;
      chochLevel = lastSwingLow.price;
      marketStructure = 'BEARISH';
    }
  }

  // Calculate Deterministic SMC Score
  let score = 50;
  if (marketStructure === 'BULLISH') score += 20;
  if (marketStructure === 'BEARISH') score -= 20;
  if (bosDetected && marketStructure === 'BULLISH') score += 15;
  if (chochDetected && marketStructure === 'BULLISH') score += 20;

  // Bullish demand order blocks in discount zone are high confluence
  const hasDemandOBNear = orderBlocks.some(ob => ob.type === 'BULLISH_DEMAND' && currentPrice >= ob.bottomPrice * 0.99 && currentPrice <= ob.topPrice * 1.03);
  if (hasDemandOBNear) score += 15;

  const hasBullishFVGNear = unmitigatedFVGs.some(fvg => fvg.type === 'BULLISH' && currentPrice >= fvg.bottomPrice && currentPrice <= fvg.topPrice * 1.02);
  if (hasBullishFVGNear) score += 10;

  const recentLowSweep = sweeps.some(s => s.type === 'SWEEP_LOWS' && s.reversalConfirmed);
  if (recentLowSweep) score += 15;

  if (currentZone === 'DISCOUNT' && marketStructure === 'BULLISH') score += 10;

  score = Math.max(10, Math.min(98, score));

  // Generate deterministic summary
  const summaryParts: string[] = [];
  if (bosDetected) summaryParts.push(`Bullish BOS validated at $${bosLevel?.toFixed(2)}`);
  if (chochDetected) summaryParts.push(`CHOCH structural pivot confirmed`);
  if (hasDemandOBNear) summaryParts.push(`Testing Bullish Demand Order Block`);
  if (unmitigatedFVGs.length > 0) summaryParts.push(`${unmitigatedFVGs.length} unmitigated FVG imbalance zones identified`);
  if (recentLowSweep) summaryParts.push(`Sell-side liquidity sweep with confirmed price rejection`);
  summaryParts.push(`Trading in institutional ${currentZone} zone (Equilibrium: $${equilibriumPrice.toFixed(2)})`);

  return {
    marketStructure,
    bosDetected,
    bosLevel,
    chochDetected,
    chochLevel,
    activeOrderBlocks: orderBlocks,
    activeFVGs: unmitigatedFVGs,
    recentSweeps: sweeps,
    equilibriumPrice,
    currentZone,
    score,
    deterministicSummary: summaryParts.join(' • ')
  };
}
