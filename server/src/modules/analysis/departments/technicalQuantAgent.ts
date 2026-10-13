import {
  atrDec,
  bollingerBandsDec,
  dec,
  emaDec,
  floorSigned,
  macdDec,
  maxDec,
  minDec,
  realizedVolatilityPctDec,
  rsiDec,
  smaDec,
  toOptionalFixedStr,
  vwapDec,
  zScoreDec,
  ZERO,
  type Dec,
  type OhlcvCandleDec,
} from '@cex/core';
import type { CryptoMarketSnapshot, DepartmentFinding, EvidenceItem, RiskFlag } from '@cex/contracts';
import type { ResilientLlmAdapter } from '../llmAdapter.ts';

/**
 * Department 1: Technical & Quant Research Agent
 *
 * Responsibilities:
 * - Computes deterministic trend, momentum, volatility, and mean-reversion metrics exclusively from closed candles.
 * - Never reads order book, derivatives funding, or on-chain fundamentals (prevents department overlap).
 * - Separates `OBSERVED` bar metrics from `INFERRED` trend/volatility classifications.
 */
export async function runTechnicalQuantAgent(
  snapshot: CryptoMarketSnapshot,
  llm: ResilientLlmAdapter,
): Promise<DepartmentFinding> {
  const startMs = Date.now();
  const department = 'technical_quant' as const;
  const closed = snapshot.spot.closedCandles;
  const missingData: string[] = [];
  const riskFlags: RiskFlag[] = [];
  const evidence: EvidenceItem[] = [];

  if (snapshot.spotDataStatus === 'UNAVAILABLE' || closed.length < 15) {
    missingData.push(`closedCandles (need >= 15, got ${closed.length})`);
    riskFlags.push({
      code: 'TECH_INSUFFICIENT_CANDLES',
      severity: 'WARNING',
      department,
      title: 'Insufficient closed candles for technical analysis',
      detail: `Only ${closed.length} closed candle(s) available as of ${snapshot.asOf}; minimum 15 required.`,
      blocksExecution: true,
    });
    return {
      department,
      status: snapshot.spotDataStatus === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'DEGRADED',
      stance: 'ABSTAIN',
      score: '0.00',
      confidence: '0.00',
      summary: 'DATA_UNAVAILABLE: Insufficient closed candles to compute reliable technical & quant indicators.',
      metrics: { closedCandleCount: String(closed.length) },
      evidence,
      riskFlags,
      missingData,
      durationMs: Math.max(0, Date.now() - startMs),
    };
  }

  const candleDecs: OhlcvCandleDec[] = closed.map((c) => ({
    openTime: c.openTime,
    closeTime: c.closeTime,
    open: dec(c.open),
    high: dec(c.high),
    low: dec(c.low),
    close: dec(c.close),
    volume: dec(c.volume),
    quoteVolume: dec(c.quoteVolume),
    closed: true,
  }));
  const closes: Dec[] = candleDecs.map((c) => c.close);
  const lastClose = closes[closes.length - 1]!;

  const sma20 = smaDec(closes, 20);
  const ema12 = emaDec(closes, 12);
  const ema26 = emaDec(closes, 26);
  const rsi14 = rsiDec(closes, 14);
  const macd = macdDec(closes, 12, 26, 9);
  const bb20 = bollingerBandsDec(closes, 20);
  const atr14 = atrDec(candleDecs, 14);
  const vwap = vwapDec(candleDecs.slice(-24));
  const zScore20 = zScoreDec(closes, 20);
  const realizedVolPct = realizedVolatilityPctDec(closes, Math.min(20, closes.length - 1), 365);

  if (!macd) missingData.push('macd_12_26_9 (requires >= 34 closed candles)');
  if (!bb20) missingData.push('bollinger_20 (requires >= 20 closed candles)');

  // Record OBSERVED evidence
  evidence.push({
    id: `${snapshot.snapshotId}-tech-close`,
    kind: 'OBSERVED',
    department,
    metric: 'lastClosedBarPrice',
    value: lastClose.toFixed(8),
    source: `spot.closedCandles[${closed.length - 1}]`,
    observedAt: new Date(closed[closed.length - 1]!.closeTime).toISOString(),
    dataStatus: snapshot.spotDataStatus,
    note: `Latest closed ${snapshot.interval} bar close price.`,
  });

  if (rsi14) {
    evidence.push({
      id: `${snapshot.snapshotId}-tech-rsi14`,
      kind: 'OBSERVED',
      department,
      metric: 'rsi14',
      value: rsi14.toFixed(2),
      source: 'quant.rsiDec(14)',
      observedAt: snapshot.asOf,
      dataStatus: snapshot.spotDataStatus,
      note: 'Wilder 14-period RSI on closed bars.',
    });
  }

  if (atr14) {
    evidence.push({
      id: `${snapshot.snapshotId}-tech-atr14`,
      kind: 'OBSERVED',
      department,
      metric: 'atr14',
      value: atr14.toFixed(8),
      source: 'quant.atrDec(14)',
      observedAt: snapshot.asOf,
      dataStatus: snapshot.spotDataStatus,
      note: 'Wilder 14-period Average True Range in quote price units.',
    });
  }

  // Deterministic directional score (-100..+100)
  let rawScore = ZERO;

  // 1. Trend component (-40..+40)
  if (ema12 && ema26) {
    const spreadPct = ema12.sub(ema26).div(ema26).mul(100);
    const trendContribution = minDec(dec('40'), maxDec(dec('-40'), spreadPct.mul(15)));
    rawScore = rawScore.add(trendContribution);
  } else if (sma20) {
    const vsSmaPct = lastClose.sub(sma20).div(sma20).mul(100);
    rawScore = rawScore.add(minDec(dec('30'), maxDec(dec('-30'), vsSmaPct.mul(10))));
  }

  // 2. Momentum component (-35..+35)
  if (rsi14) {
    // RSI > 55 bullish, < 45 bearish, > 78 overbought warning, < 22 oversold warning
    const centered = rsi14.sub(50);
    rawScore = rawScore.add(minDec(dec('25'), maxDec(dec('-25'), centered.mul('0.8'))));
    if (rsi14.gt(78)) {
      riskFlags.push({
        code: 'TECH_RSI_EXTREME_OVERBOUGHT',
        severity: 'WARNING',
        department,
        title: 'RSI(14) extreme overbought',
        detail: `RSI(14) is ${rsi14.toFixed(2)} (> 78), indicating exhaustion risk for chasing long entries.`,
        blocksExecution: false,
      });
    } else if (rsi14.lt(22)) {
      riskFlags.push({
        code: 'TECH_RSI_EXTREME_OVERSOLD',
        severity: 'WARNING',
        department,
        title: 'RSI(14) extreme oversold',
        detail: `RSI(14) is ${rsi14.toFixed(2)} (< 22), indicating sharp bounce risk for late short entries.`,
        blocksExecution: false,
      });
    }
  }

  if (macd) {
    const macdSign = macd.histogram.gt(ZERO) ? dec('12') : macd.histogram.lt(ZERO) ? dec('-12') : ZERO;
    rawScore = rawScore.add(macdSign);
  }

  // 3. VWAP & Bollinger structure (-25..+25)
  if (vwap && vwap.gt(ZERO)) {
    const vwapDiffPct = lastClose.sub(vwap).div(vwap).mul(100);
    rawScore = rawScore.add(minDec(dec('15'), maxDec(dec('-15'), vwapDiffPct.mul(5))));
  }

  const clampedScore = floorSigned(minDec(dec('100'), maxDec(dec('-100'), rawScore)), 2);
  const absScore = clampedScore.abs();
  const stance =
    snapshot.spotDataStatus !== 'LIVE'
      ? 'ABSTAIN'
      : clampedScore.gte(15)
        ? 'BULLISH'
        : clampedScore.lte(-15)
          ? 'BEARISH'
          : 'NEUTRAL';

  // Inferred volatility & trend conclusion
  const atrPct = atr14 && lastClose.gt(ZERO) ? atr14.div(lastClose).mul(100) : null;
  const volRegime =
    atrPct && atrPct.gt(4) ? 'EXTREME_VOLATILITY' : atrPct && atrPct.gt(2) ? 'HIGH_VOLATILITY' : 'NORMAL_VOLATILITY';

  if (volRegime === 'EXTREME_VOLATILITY') {
    riskFlags.push({
      code: 'TECH_EXTREME_ATR_VOLATILITY',
      severity: 'WARNING',
      department,
      title: 'Extreme bar-to-bar ATR volatility',
      detail: `ATR(14) is ${atrPct!.toFixed(2)}% of price, requiring wider stops and smaller volatility-adjusted size.`,
      blocksExecution: false,
    });
  }

  evidence.push({
    id: `${snapshot.snapshotId}-tech-regime-inference`,
    kind: 'INFERRED',
    department,
    metric: 'technicalRegimeClassification',
    value: `${stance}_${volRegime}`,
    source: 'technicalQuantAgent',
    observedAt: snapshot.asOf,
    dataStatus: snapshot.spotDataStatus,
    note: `Inferred from EMA12/26 spread, RSI(14)=${rsi14 ? rsi14.toFixed(2) : 'N/A'}, and ATR%= ${atrPct ? atrPct.toFixed(2) : 'N/A'}%.`,
  });

  const completeness = dec(closed.length >= 35 ? '0.90' : '0.65');
  const signalStrength = minDec(dec('1'), absScore.div(60).add('0.35'));
  const rawConf = snapshot.spotDataStatus === 'LIVE' ? minDec(dec('0.95'), completeness.mul(signalStrength)) : dec('0.25');

  const metrics: Record<string, string | null> = {
    lastClose: lastClose.toFixed(8),
    sma20: toOptionalFixedStr(sma20, 8),
    ema12: toOptionalFixedStr(ema12, 8),
    ema26: toOptionalFixedStr(ema26, 8),
    rsi14: toOptionalFixedStr(rsi14, 2),
    macdLine: toOptionalFixedStr(macd?.macd, 8),
    macdSignal: toOptionalFixedStr(macd?.signal, 8),
    macdHistogram: toOptionalFixedStr(macd?.histogram, 8),
    bollingerUpper: toOptionalFixedStr(bb20?.upper, 8),
    bollingerLower: toOptionalFixedStr(bb20?.lower, 8),
    bollingerBandwidthBps: toOptionalFixedStr(bb20?.bandwidthBps, 2),
    atr14: toOptionalFixedStr(atr14, 8),
    atrPct: toOptionalFixedStr(atrPct, 4),
    vwap24: toOptionalFixedStr(vwap, 8),
    zScore20: toOptionalFixedStr(zScore20, 4),
    realizedVol365Pct: toOptionalFixedStr(realizedVolPct, 2),
    volatilityRegime: volRegime,
  };

  const fallbackSummary =
    `Technical & Quant (${snapshot.symbol} ${snapshot.interval}): Stance=${stance} (score=${clampedScore.toFixed(2)}). ` +
    `Close=${lastClose.toFixed(2)}, RSI(14)=${metrics.rsi14 ?? 'N/A'}, ATR(14)=${metrics.atr14 ?? 'N/A'} (${volRegime}), ` +
    `VWAP=${metrics.vwap24 ?? 'N/A'}.`;

  const narrative = await llm.narrate({
    department,
    rolePrompt: 'Technical & Quant Research Analyst on closed crypto OHLCV bars.',
    structuredContext: metrics,
    fallbackSummary,
  });

  return {
    department,
    status: snapshot.spotDataStatus === 'LIVE' ? 'OK' : 'DEGRADED',
    stance,
    score: clampedScore.toFixed(2),
    confidence: floorSigned(rawConf, 2).toFixed(2),
    summary: narrative.text,
    metrics,
    evidence,
    riskFlags,
    missingData,
    durationMs: Math.max(0, Date.now() - startMs),
  };
}
