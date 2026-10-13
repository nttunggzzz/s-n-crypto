// Formulas adapted from MIT-licensed skills (see THIRD_PARTY_NOTICES.md for the full license texts):
// - agiprolabs/claude-trading-skills (c) 2026 AGIPro: custom-indicators (NVT, MVRV, exchange flow, OI momentum,
//   liquidity score, smart money flow, token velocity), risk-management (circuit breakers), position-sizing (fractional Kelly).
// - tradermonty/claude-trading-skills (c) 2026 TraderMonty: crypto-regime-analyzer (6-component regime composite).
// Modified: ported from Python to TypeScript on Dec (decimal.js); differences from the source are noted at
// liquidityScoreDec (weights) and computeCryptoRegimeCompositeDec (fail-closed rule).
import { AMOUNT_SCALE, Dec, ZERO, dec, floorToStep, maxDec, minDec, roundDown, roundUp } from './decimal.ts';
import { walkBook, type BookLevel, type Side } from './book.ts';
import { floorSigned, isLiquidatable, liquidationPrice, type PositionSide } from './futures.ts';
import { positionSizeForRisk } from './risk.ts';
import { checkNotional, checkQuantity, type SymbolRules } from './rules.ts';

/** Scale used for intermediate ratios, indicators, and basis points. */
export const INDICATOR_SCALE = 8;
export const BPS_MULTIPLIER = new Dec(10_000);
export const PCT_MULTIPLIER = new Dec(100);
const ONE = new Dec(1);
const TWO = new Dec(2);

export interface OhlcvCandleDec {
  openTime: number;
  closeTime: number;
  open: Dec;
  high: Dec;
  low: Dec;
  close: Dec;
  volume: Dec;
  quoteVolume: Dec;
  closed: boolean;
}

// ───────────────────────────── Technical & Quant Indicators (Closed Candles Only)

/** Simple Moving Average over the last `period` values. Returns null when fewer than `period` items exist. */
export function smaDec(values: readonly Dec[], period: number): Dec | null {
  if (period <= 0 || values.length < period) return null;
  let sum = ZERO;
  for (let i = values.length - period; i < values.length; i++) {
    sum = sum.add(values[i]!);
  }
  return sum.div(period);
}

/** Exponential Moving Average over `values` using standard smoothing `k = 2 / (period + 1)`. */
export function emaDec(values: readonly Dec[], period: number): Dec | null {
  if (period <= 0 || values.length < period) return null;
  const seed = smaDec(values.slice(0, period), period);
  if (!seed) return null;
  const k = TWO.div(period + 1);
  const oneMinusK = ONE.sub(k);
  let ema = seed;
  for (let i = period; i < values.length; i++) {
    ema = values[i]!.mul(k).add(ema.mul(oneMinusK));
  }
  return ema;
}

/** Exponential Moving Average series for every bar from `period - 1` onwards. */
export function emaSeriesDec(values: readonly Dec[], period: number): Dec[] {
  if (period <= 0 || values.length < period) return [];
  const seed = smaDec(values.slice(0, period), period)!;
  const k = TWO.div(period + 1);
  const oneMinusK = ONE.sub(k);
  const out: Dec[] = [seed];
  let ema = seed;
  for (let i = period; i < values.length; i++) {
    ema = values[i]!.mul(k).add(ema.mul(oneMinusK));
    out.push(ema);
  }
  return out;
}

/** Wilder's RSI (0..100) over `closes`. Needs at least `period + 1` closes. */
export function rsiDec(closes: readonly Dec[], period = 14): Dec | null {
  if (period <= 0 || closes.length < period + 1) return null;
  let avgGain = ZERO;
  let avgLoss = ZERO;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i]!.sub(closes[i - 1]!);
    if (diff.gt(ZERO)) avgGain = avgGain.add(diff);
    else if (diff.lt(ZERO)) avgLoss = avgLoss.add(diff.abs());
  }
  avgGain = avgGain.div(period);
  avgLoss = avgLoss.div(period);

  const pMinus1 = new Dec(period - 1);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i]!.sub(closes[i - 1]!);
    const gain = diff.gt(ZERO) ? diff : ZERO;
    const loss = diff.lt(ZERO) ? diff.abs() : ZERO;
    avgGain = avgGain.mul(pMinus1).add(gain).div(period);
    avgLoss = avgLoss.mul(pMinus1).add(loss).div(period);
  }

  if (avgLoss.isZero()) return avgGain.isZero() ? new Dec(50) : PCT_MULTIPLIER;
  const rs = avgGain.div(avgLoss);
  return PCT_MULTIPLIER.sub(PCT_MULTIPLIER.div(ONE.add(rs)));
}

export interface MacdResultDec {
  macd: Dec;
  signal: Dec;
  histogram: Dec;
}

/** Standard MACD (fast=12, slow=26, signal=9). Needs at least `slow + signal - 1` closes. */
export function macdDec(closes: readonly Dec[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): MacdResultDec | null {
  if (fastPeriod <= 0 || slowPeriod <= fastPeriod || signalPeriod <= 0) return null;
  if (closes.length < slowPeriod + signalPeriod - 1) return null;

  const fastSeries = emaSeriesDec(closes, fastPeriod);
  const slowSeries = emaSeriesDec(closes, slowPeriod);
  const offset = slowPeriod - fastPeriod;
  const macdLine: Dec[] = [];
  for (let i = 0; i < slowSeries.length; i++) {
    macdLine.push(fastSeries[i + offset]!.sub(slowSeries[i]!));
  }
  const sig = emaDec(macdLine, signalPeriod);
  if (!sig) return null;
  const latestMacd = macdLine[macdLine.length - 1]!;
  return {
    macd: latestMacd,
    signal: sig,
    histogram: latestMacd.sub(sig),
  };
}

export interface BollingerBandsDec {
  middle: Dec;
  upper: Dec;
  lower: Dec;
  bandwidthBps: Dec;
  percentB: Dec | null;
}

/** Bollinger Bands (default 20-period, 2 population std devs). */
export function bollingerBandsDec(closes: readonly Dec[], period = 20, numStdDev: Dec = TWO): BollingerBandsDec | null {
  const middle = smaDec(closes, period);
  if (!middle || middle.lte(ZERO)) return null;
  let sqSum = ZERO;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i]!.sub(middle);
    sqSum = sqSum.add(diff.mul(diff));
  }
  const stdDev = sqSum.div(period).sqrt();
  const offset = stdDev.mul(numStdDev);
  const upper = middle.add(offset);
  const lower = middle.sub(offset);
  const width = upper.sub(lower);
  const bandwidthBps = width.div(middle).mul(BPS_MULTIPLIER);
  const lastClose = closes[closes.length - 1]!;
  const percentB = width.gt(ZERO) ? lastClose.sub(lower).div(width) : null;
  return { middle, upper, lower, bandwidthBps, percentB };
}

/** Wilder's Average True Range (ATR) over closed candles. Needs at least `period + 1` candles. */
export function atrDec(candles: readonly (Pick<OhlcvCandleDec, 'high' | 'low' | 'close'> & { closed?: boolean })[], period = 14): Dec | null {
  const closedCandles = candles.filter((c) => c.closed !== false);
  if (period <= 0 || closedCandles.length < period + 1) return null;
  const trs: Dec[] = [];
  for (let i = 1; i < closedCandles.length; i++) {
    const cur = closedCandles[i]!;
    const prevClose = closedCandles[i - 1]!.close;
    const hl = cur.high.sub(cur.low);
    const hpc = cur.high.sub(prevClose).abs();
    const lpc = cur.low.sub(prevClose).abs();
    trs.push(maxDec(hl, maxDec(hpc, lpc)));
  }
  let atr = ZERO;
  for (let i = 0; i < period; i++) atr = atr.add(trs[i]!);
  atr = atr.div(period);
  const pMinus1 = new Dec(period - 1);
  for (let i = period; i < trs.length; i++) {
    atr = atr.mul(pMinus1).add(trs[i]!).div(period);
  }
  return atr;
}

/** Volume-Weighted Average Price (VWAP) over closed `candles`. */
export function vwapDec(candles: readonly (Pick<OhlcvCandleDec, 'high' | 'low' | 'close' | 'volume' | 'quoteVolume'> & { closed?: boolean })[]): Dec | null {
  const closedCandles = candles.filter((c) => c.closed !== false);
  if (closedCandles.length === 0) return null;
  let totalVol = ZERO;
  let totalQuote = ZERO;
  for (const c of closedCandles) {
    if (c.volume.lte(ZERO)) continue;
    totalVol = totalVol.add(c.volume);
    if (c.quoteVolume.gt(ZERO)) {
      totalQuote = totalQuote.add(c.quoteVolume);
    } else {
      const typicalPrice = c.high.add(c.low).add(c.close).div(3);
      totalQuote = totalQuote.add(typicalPrice.mul(c.volume));
    }
  }
  if (totalVol.lte(ZERO)) return null;
  return totalQuote.div(totalVol);
}

/** Z-score of the latest value relative to the trailing `period` window. */
export function zScoreDec(values: readonly Dec[], period = 20): Dec | null {
  const mean = smaDec(values, period);
  if (!mean) return null;
  let sqSum = ZERO;
  for (let i = values.length - period; i < values.length; i++) {
    const d = values[i]!.sub(mean);
    sqSum = sqSum.add(d.mul(d));
  }
  const std = sqSum.div(period).sqrt();
  if (std.isZero()) return ZERO;
  return values[values.length - 1]!.sub(mean).div(std);
}

/** Annualized realized volatility (%) from bar closes. Crypto defaults to 365 days/year. */
export function realizedVolatilityPctDec(closes: readonly Dec[], lookback = 20, barsPerYear = 365): Dec | null {
  if (lookback < 2 || closes.length < lookback + 1 || barsPerYear <= 0) return null;
  const returns: Dec[] = [];
  const start = closes.length - lookback - 1;
  for (let i = start + 1; i < closes.length; i++) {
    const prev = closes[i - 1]!;
    const cur = closes[i]!;
    if (prev.lte(ZERO) || cur.lte(ZERO)) return null;
    returns.push(cur.sub(prev).div(prev));
  }
  const mean = smaDec(returns, returns.length)!;
  let sqSum = ZERO;
  for (const r of returns) {
    const d = r.sub(mean);
    sqSum = sqSum.add(d.mul(d));
  }
  const variance = sqSum.div(returns.length - 1);
  return variance.sqrt().mul(new Dec(barsPerYear).sqrt()).mul(PCT_MULTIPLIER);
}

// ───────────────────────────── Order Flow & Market Microstructure

/** Bid-ask spread in basis points relative to the mid price: `((ask - bid) / mid) * 10000`. */
export function spreadBpsDec(bestBid: Dec | null, bestAsk: Dec | null): Dec | null {
  if (!bestBid || !bestAsk || bestBid.lte(ZERO) || bestAsk.lte(ZERO) || bestAsk.lt(bestBid)) return null;
  const mid = bestBid.add(bestAsk).div(TWO);
  if (mid.lte(ZERO)) return null;
  return bestAsk.sub(bestBid).div(mid).mul(BPS_MULTIPLIER);
}

/**
 * Order book notional imbalance in `[-1, +1]`:
 * `(bidNotional - askNotional) / (bidNotional + askNotional)`.
 * Positive = bid-heavy (buy support); Negative = ask-heavy (sell wall).
 */
export function orderBookImbalanceDec(bids: readonly BookLevel[], asks: readonly BookLevel[], maxLevels = 20): Dec | null {
  const bSlice = bids.slice(0, maxLevels);
  const aSlice = asks.slice(0, maxLevels);
  let bidNotional = ZERO;
  let askNotional = ZERO;
  for (const b of bSlice) {
    if (b.price.gt(ZERO) && b.qty.gt(ZERO)) bidNotional = bidNotional.add(b.price.mul(b.qty));
  }
  for (const a of aSlice) {
    if (a.price.gt(ZERO) && a.qty.gt(ZERO)) askNotional = askNotional.add(a.price.mul(a.qty));
  }
  const total = bidNotional.add(askNotional);
  if (total.lte(ZERO)) return null;
  return bidNotional.sub(askNotional).div(total);
}

export interface DepthSlippageEstimate {
  reachable: boolean;
  executedQty: Dec;
  quoteQty: Dec;
  avgFillPrice: Dec | null;
  referencePrice: Dec | null;
  /** Slippage vs best level in basis points (rounded up — cost to user). */
  slippageBps: Dec | null;
}

/**
 * Deterministic slippage estimate by walking the visible order book (`walkBook`).
 * Uses `roundUp` on slippage bps so execution friction is never understated.
 */
export function estimateDepthSlippageDec(
  side: Side,
  levels: readonly BookLevel[],
  quoteNotionalUsdt: Dec,
  stepSize: Dec,
): DepthSlippageEstimate {
  if (levels.length === 0 || quoteNotionalUsdt.lte(ZERO) || stepSize.lte(ZERO)) {
    return { reachable: false, executedQty: ZERO, quoteQty: ZERO, avgFillPrice: null, referencePrice: null, slippageBps: null };
  }
  const refPrice = levels[0]!.price;
  if (refPrice.lte(ZERO)) {
    return { reachable: false, executedQty: ZERO, quoteQty: ZERO, avgFillPrice: null, referencePrice: null, slippageBps: null };
  }
  const walk = walkBook(side, levels, { kind: 'quote', amount: quoteNotionalUsdt }, stepSize);
  if (walk.executedQty.lte(ZERO)) {
    return { reachable: false, executedQty: ZERO, quoteQty: ZERO, avgFillPrice: null, referencePrice: refPrice, slippageBps: null };
  }
  const avgFillPrice = walk.quoteQty.div(walk.executedQty);
  const rawDiff = side === 'BUY' ? avgFillPrice.sub(refPrice) : refPrice.sub(avgFillPrice);
  const rawBps = maxDec(ZERO, rawDiff.div(refPrice).mul(BPS_MULTIPLIER));
  return {
    reachable: walk.complete,
    executedQty: walk.executedQty,
    quoteQty: walk.quoteQty,
    avgFillPrice,
    referencePrice: refPrice,
    slippageBps: roundUp(rawBps, 4),
  };
}

export interface TakerFlowMetrics {
  buyQuoteVolume: Dec;
  sellQuoteVolume: Dec;
  totalQuoteVolume: Dec;
  netTakerFlowUsdt: Dec;
  /** `[-1, +1]`: `(buyQuote - sellQuote) / totalQuote` */
  imbalanceRatio: Dec | null;
}

/** Computes net taker flow from public trades (`isBuyerMaker === false` means buyer was taker/aggressor). */
export function takerFlowImbalanceDec(trades: readonly { price: Dec; qty: Dec; isBuyerMaker: boolean }[]): TakerFlowMetrics {
  let buyQuote = ZERO;
  let sellQuote = ZERO;
  for (const t of trades) {
    if (t.price.lte(ZERO) || t.qty.lte(ZERO)) continue;
    const q = t.price.mul(t.qty);
    if (t.isBuyerMaker) sellQuote = sellQuote.add(q);
    else buyQuote = buyQuote.add(q);
  }
  const total = buyQuote.add(sellQuote);
  return {
    buyQuoteVolume: roundDown(buyQuote, AMOUNT_SCALE),
    sellQuoteVolume: roundDown(sellQuote, AMOUNT_SCALE),
    totalQuoteVolume: roundDown(total, AMOUNT_SCALE),
    netTakerFlowUsdt: floorSigned(buyQuote.sub(sellQuote), AMOUNT_SCALE),
    imbalanceRatio: total.gt(ZERO) ? buyQuote.sub(sellQuote).div(total) : null,
  };
}

/**
 * Composite Liquidity Score (0..100) adapted from `custom-indicators` Indicator 7:
 * Combines orderbook depth within 2% of mid, bid-ask spread score, and slippage score.
 * Modified: weights 0.45 / 0.35 / 0.20 (source: 0.4 / 0.3 / 0.3, or 0.5 / 0.3 / 0.2 for CEX-dominant tokens).
 */
export function liquidityScoreDec(params: {
  depthWithin2PctUsdt: Dec;
  spreadBps: Dec | null;
  targetPositionUsdt: Dec;
  poolOrQuoteVolumeUsdt?: Dec | null;
}): Dec {
  const target = params.targetPositionUsdt.gt(ZERO) ? params.targetPositionUsdt : new Dec(10_000);
  const depthScore = minDec(ONE, maxDec(ZERO, params.depthWithin2PctUsdt.div(target.mul(5))));
  const spreadScore = params.spreadBps === null ? ZERO : maxDec(ZERO, ONE.sub(params.spreadBps.div(PCT_MULTIPLIER)));
  const volBase = params.poolOrQuoteVolumeUsdt && params.poolOrQuoteVolumeUsdt.gt(ZERO) ? params.poolOrQuoteVolumeUsdt : params.depthWithin2PctUsdt.mul(10);
  const volumeScore = minDec(ONE, maxDec(ZERO, volBase.div(target.mul(50))));
  const weighted = depthScore.mul(new Dec('0.45')).add(spreadScore.mul(new Dec('0.35'))).add(volumeScore.mul(new Dec('0.20')));
  return roundDown(weighted.mul(PCT_MULTIPLIER), 2);
}

// ───────────────────────────── Derivatives & Positioning

/** Perpetual mark-to-index basis in bps: `((markPrice - indexPrice) / indexPrice) * 10000`. */
export function perpBasisBpsDec(markPrice: Dec | null, indexPrice: Dec | null): Dec | null {
  if (!markPrice || !indexPrice || markPrice.lte(ZERO) || indexPrice.lte(ZERO)) return null;
  return markPrice.sub(indexPrice).div(indexPrice).mul(BPS_MULTIPLIER);
}

/** Annualized funding rate (%) assuming 3 funding settlements per day (every 8 hours) × 365 days = 1095 settlements/year. */
export function fundingAnnualizedPctDec(eightHourFundingRate: Dec | null, settlementsPerDay = 3): Dec | null {
  if (!eightHourFundingRate || settlementsPerDay <= 0) return null;
  return eightHourFundingRate.mul(settlementsPerDay * 365).mul(PCT_MULTIPLIER);
}

/** Open interest momentum (%) over lookback period (`custom-indicators` Indicator 5). */
export function openInterestMomentumPctDec(oiSeries: readonly Dec[], lookback = 7): Dec | null {
  if (lookback <= 0 || oiSeries.length < lookback + 1) return null;
  const oldVal = oiSeries[oiSeries.length - 1 - lookback]!;
  const newVal = oiSeries[oiSeries.length - 1]!;
  if (oldVal.lte(ZERO)) return null;
  return newVal.sub(oldVal).div(oldVal).mul(PCT_MULTIPLIER);
}

export type OiPriceRegime = 'LONG_BUILDUP' | 'SHORT_BUILDUP' | 'SHORT_SQUEEZE' | 'LONG_LIQUIDATION' | 'NEUTRAL';

/** Classifies derivatives positioning from price change and open interest momentum. */
export function classifyOiPriceRegime(priceChangePct: Dec | null, oiChangePct: Dec | null, deadbandPct: Dec = new Dec('0.25')): OiPriceRegime {
  if (!priceChangePct || !oiChangePct) return 'NEUTRAL';
  if (priceChangePct.abs().lte(deadbandPct) || oiChangePct.abs().lte(deadbandPct)) return 'NEUTRAL';
  if (oiChangePct.gt(ZERO) && priceChangePct.gt(ZERO)) return 'LONG_BUILDUP';
  if (oiChangePct.gt(ZERO) && priceChangePct.lt(ZERO)) return 'SHORT_BUILDUP';
  if (oiChangePct.lt(ZERO) && priceChangePct.gt(ZERO)) return 'SHORT_SQUEEZE';
  return 'LONG_LIQUIDATION';
}

/** Distance from current mark price to isolated liquidation price in basis points. */
export function liquidationBufferBpsDec(
  side: PositionSide,
  entry: Dec,
  mark: Dec,
  qty: Dec,
  margin: Dec,
  mmr: Dec,
  tick?: Dec,
): { liquidationPrice: Dec | null; bufferBps: Dec | null; isLiquidatable: boolean } {
  if (mark.lte(ZERO) || qty.lte(ZERO)) {
    return { liquidationPrice: null, bufferBps: null, isLiquidatable: false };
  }
  const liq = liquidationPrice(side, entry, qty, margin, mmr, tick);
  const liquidatable = isLiquidatable(side, entry, mark, qty, margin, mmr);
  if (!liq) return { liquidationPrice: null, bufferBps: null, isLiquidatable: liquidatable };
  const rawBuffer = side === 'LONG' ? mark.sub(liq).div(mark) : liq.sub(mark).div(mark);
  return {
    liquidationPrice: liq,
    bufferBps: floorSigned(rawBuffer.mul(BPS_MULTIPLIER), 2),
    isLiquidatable: liquidatable,
  };
}

// ───────────────────────────── Crypto Fundamentals, Tokenomics & Regime (`custom-indicators` + `crypto-regime-analyzer`)

/** Indicator 1: NVT Ratio = Market Cap / Daily On-Chain Tx Volume USD. */
export function nvtRatioDec(marketCapUsd: Dec | null, dailyTxVolumeUsd: Dec | null): { ratio: Dec | null; signal: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'UNAVAILABLE' } {
  if (!marketCapUsd || !dailyTxVolumeUsd || marketCapUsd.lte(ZERO) || dailyTxVolumeUsd.lte(ZERO)) {
    return { ratio: null, signal: 'UNAVAILABLE' };
  }
  const ratio = marketCapUsd.div(dailyTxVolumeUsd);
  const signal = ratio.gt(65) ? 'BEARISH' : ratio.lt(25) ? 'BULLISH' : 'NEUTRAL';
  return { ratio: roundUp(ratio, 4), signal };
}

/** Indicator 2: MVRV Ratio = Market Cap / Realized Cap. */
export function mvrvRatioDec(marketCapUsd: Dec | null, realizedCapUsd: Dec | null): { ratio: Dec | null; signal: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'UNAVAILABLE' } {
  if (!marketCapUsd || !realizedCapUsd || marketCapUsd.lte(ZERO) || realizedCapUsd.lte(ZERO)) {
    return { ratio: null, signal: 'UNAVAILABLE' };
  }
  const ratio = marketCapUsd.div(realizedCapUsd);
  const signal = ratio.gt(new Dec('3.5')) ? 'BEARISH' : ratio.lt(ONE) ? 'BULLISH' : 'NEUTRAL';
  return { ratio: roundUp(ratio, 4), signal };
}

/** Indicator 3: Exchange Netflow = Deposits - Withdrawals (normalized by marketCap when available). */
export function exchangeNetflowDec(
  depositsUsd: Dec | null,
  withdrawalsUsd: Dec | null,
  marketCapUsd?: Dec | null,
): { netflowUsd: Dec | null; netflowRatioBps: Dec | null; signal: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'UNAVAILABLE' } {
  if (!depositsUsd || !withdrawalsUsd || depositsUsd.lt(ZERO) || withdrawalsUsd.lt(ZERO)) {
    return { netflowUsd: null, netflowRatioBps: null, signal: 'UNAVAILABLE' };
  }
  const netflow = depositsUsd.sub(withdrawalsUsd);
  const ratioBps = marketCapUsd && marketCapUsd.gt(ZERO) ? netflow.div(marketCapUsd).mul(BPS_MULTIPLIER) : null;
  const signal = netflow.gt(ZERO) ? 'BEARISH' : netflow.lt(ZERO) ? 'BULLISH' : 'NEUTRAL';
  return { netflowUsd: floorSigned(netflow, 2), netflowRatioBps: ratioBps ? floorSigned(ratioBps, 4) : null, signal };
}

/** Indicator 8: Smart Money Flow Ratio = (smartBuys - smartSells) / totalVolume. */
export function smartMoneyFlowDec(
  smartBuysUsd: Dec | null,
  smartSellsUsd: Dec | null,
  totalVolumeUsd: Dec | null,
): { netFlowUsd: Dec | null; smfRatio: Dec | null; signal: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'UNAVAILABLE' } {
  if (!smartBuysUsd || !smartSellsUsd || !totalVolumeUsd || totalVolumeUsd.lte(ZERO)) {
    return { netFlowUsd: null, smfRatio: null, signal: 'UNAVAILABLE' };
  }
  const net = smartBuysUsd.sub(smartSellsUsd);
  const ratio = net.div(totalVolumeUsd);
  const signal = ratio.gt(new Dec('0.1')) ? 'BULLISH' : ratio.lt(new Dec('-0.1')) ? 'BEARISH' : 'NEUTRAL';
  return { netFlowUsd: floorSigned(net, 2), smfRatio: floorSigned(ratio, 6), signal };
}

/** Indicator 9: Token Velocity = Daily Trading Volume (tokens) / Circulating Supply. */
export function tokenVelocityDec(
  dailyVolumeTokens: Dec | null,
  circulatingSupply: Dec | null,
): { velocity: Dec | null; interpretation: 'HIGH_SPECULATION' | 'MODERATE' | 'LOW' | 'VERY_LOW_STRONG_HOLDERS' | 'UNAVAILABLE' } {
  if (!dailyVolumeTokens || !circulatingSupply || dailyVolumeTokens.lt(ZERO) || circulatingSupply.lte(ZERO)) {
    return { velocity: null, interpretation: 'UNAVAILABLE' };
  }
  const vel = dailyVolumeTokens.div(circulatingSupply);
  const interpretation = vel.gt(new Dec('0.3'))
    ? 'HIGH_SPECULATION'
    : vel.gt(new Dec('0.1'))
      ? 'MODERATE'
      : vel.gt(new Dec('0.05'))
        ? 'LOW'
        : 'VERY_LOW_STRONG_HOLDERS';
  return { velocity: roundUp(vel, 6), interpretation };
}

export interface CryptoRegimeComponentsInput {
  btcTrendScore?: Dec | null;
  altBreadthScore?: Dec | null;
  btcDominanceScore?: Dec | null;
  perpFundingScore?: Dec | null;
  drawdownVolScore?: Dec | null;
  momentumThrustScore?: Dec | null;
}

export interface CryptoRegimeCompositeResult {
  score: Dec | null;
  zone: 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF' | 'UNAVAILABLE';
  availableComponents: number;
  missingComponents: string[];
}

const REGIME_WEIGHTS: ReadonlyArray<{ key: keyof CryptoRegimeComponentsInput; weight: Dec }> = [
  { key: 'btcTrendScore', weight: new Dec('0.25') },
  { key: 'altBreadthScore', weight: new Dec('0.20') },
  { key: 'btcDominanceScore', weight: new Dec('0.15') },
  { key: 'perpFundingScore', weight: new Dec('0.15') },
  { key: 'drawdownVolScore', weight: new Dec('0.15') },
  { key: 'momentumThrustScore', weight: new Dec('0.10') },
];

/**
 * 6-component Crypto Regime Composite (0..100) from `crypto-regime-analyzer`.
 * Missing components have their weight proportionally redistributed; fails closed (`UNAVAILABLE`) if 0 components exist.
 * Modified: the source (`scripts/scorer.py`) fails closed unless >= 4 components and >= 65% of the model weight remain;
 * this port redistributes from a single component upward.
 */
export function computeCryptoRegimeCompositeDec(input: CryptoRegimeComponentsInput): CryptoRegimeCompositeResult {
  let weightedSum = ZERO;
  let activeWeight = ZERO;
  let available = 0;
  const missing: string[] = [];

  for (const { key, weight } of REGIME_WEIGHTS) {
    const val = input[key];
    if (val === undefined || val === null) {
      missing.push(key);
      continue;
    }
    const clamped = minDec(PCT_MULTIPLIER, maxDec(ZERO, val));
    weightedSum = weightedSum.add(clamped.mul(weight));
    activeWeight = activeWeight.add(weight);
    available++;
  }

  if (available === 0 || activeWeight.lte(ZERO)) {
    return { score: null, zone: 'UNAVAILABLE', availableComponents: 0, missingComponents: missing };
  }

  const score = roundDown(weightedSum.div(activeWeight), 2);
  const zone = score.gte(80) ? 'RISK_ON' : score.gte(40) ? 'NEUTRAL' : 'RISK_OFF';
  return { score, zone, availableComponents: available, missingComponents: missing };
}

// ───────────────────────────── Risk Management & Position Sizing Ladder (`risk-management` + `position-sizing`)

/**
 * Fractional Kelly fraction of equity (`0..maxFraction`).
 * `f* = (p * b - q) / b`. Never allows full Kelly (`kellyFractionMultiplier` capped at `0.50`, default `0.25`).
 * If edge is <= 0, returns 0.
 */
export function fractionalKellyFractionDec(params: {
  winRate: Dec;
  payoffRatio: Dec;
  kellyMultiplier?: Dec;
  maxFractionCap?: Dec;
}): Dec {
  if (params.winRate.lte(ZERO) || params.winRate.gte(ONE) || params.payoffRatio.lte(ZERO)) return ZERO;
  const q = ONE.sub(params.winRate);
  const fullKelly = params.winRate.mul(params.payoffRatio).sub(q).div(params.payoffRatio);
  if (fullKelly.lte(ZERO)) return ZERO;
  const mult = minDec(new Dec('0.50'), maxDec(ZERO, params.kellyMultiplier ?? new Dec('0.25')));
  const cap = params.maxFractionCap ?? new Dec('0.25');
  return minDec(cap, roundDown(fullKelly.mul(mult), 6));
}

export type SizingConstraintKind =
  | 'KELLY'
  | 'FIXED_FRACTIONAL'
  | 'VOLATILITY'
  | 'LIQUIDITY'
  | 'CONCENTRATION'
  | 'BELOW_MIN_LOT'
  | 'BLOCKED';

export interface PositionSizingLadderInput {
  side: 'LONG' | 'SHORT';
  equityUsdt: Dec;
  entryPrice: Dec;
  stopLossPrice: Dec;
  takeProfitPrice?: Dec | null;
  rules: SymbolRules;
  feeRate: Dec;
  /** Risk % of account per trade, e.g. `1` = 1%. */
  riskPercent?: Dec;
  /** ATR in price units (for volatility-adjusted sizing). */
  atrPrice?: Dec | null;
  /** Target daily portfolio volatility %, e.g. `2` = 2%. */
  targetDailyVolPercent?: Dec;
  /** Estimated win rate in `(0, 1)` for Quarter-Kelly sizing. */
  estimatedWinRate?: Dec | null;
  /** Visible orderbook depth in USDT within acceptable slippage (for liquidity constraint). */
  visibleDepthUsdt?: Dec | null;
  /** Max participation of visible depth, e.g. `0.10` = 10%. */
  maxDepthParticipation?: Dec;
  /** Max concentration fraction of equity in a single token, e.g. `0.10` = 10%. */
  maxConcentrationFraction?: Dec;
  /** Portfolio drawdown multiplier (`1` normal, `0.5` caution, `0` halted). */
  drawdownSizeMultiplier?: Dec;
}

export interface PositionSizingLadderResult {
  kellyQty: Dec;
  fixedFractionalQty: Dec;
  volatilityAdjustedQty: Dec;
  liquidityConstrainedQty: Dec;
  concentrationCappedQty: Dec;
  finalQuantity: Dec;
  finalNotionalUsdt: Dec;
  bindingConstraint: SizingConstraintKind;
  lossPerUnitUsdt: Dec;
  netRewardPerUnitUsdt: Dec | null;
  netRiskRewardRatio: Dec | null;
  lotCheckError: string | null;
}

/**
 * Deterministic 5-step Position Sizing Ladder (`position-sizing` + `risk-management` + `@cex/core` lot rules).
 * Works for both LONG and SHORT, includes round-trip fee drag, floors to `stepSize`, and checks `minQty`/`maxQty`/`minNotional`.
 */
export function computePositionSizingLadder(input: PositionSizingLadderInput): PositionSizingLadderResult {
  const step = dec(input.rules.stepSize);
  const zeroOut = (reason: SizingConstraintKind, err: string | null = null): PositionSizingLadderResult => ({
    kellyQty: ZERO,
    fixedFractionalQty: ZERO,
    volatilityAdjustedQty: ZERO,
    liquidityConstrainedQty: ZERO,
    concentrationCappedQty: ZERO,
    finalQuantity: ZERO,
    finalNotionalUsdt: ZERO,
    bindingConstraint: reason,
    lossPerUnitUsdt: ZERO,
    netRewardPerUnitUsdt: null,
    netRiskRewardRatio: null,
    lotCheckError: err,
  });

  if (input.equityUsdt.lte(ZERO) || input.entryPrice.lte(ZERO) || input.stopLossPrice.lte(ZERO) || step.lte(ZERO)) {
    return zeroOut('BLOCKED', 'Invalid equity, price, or stepSize');
  }
  const ddMult = input.drawdownSizeMultiplier ?? ONE;
  if (ddMult.lte(ZERO)) {
    return zeroOut('BLOCKED', 'Trading halted by drawdown circuit breaker');
  }

  const isLong = input.side === 'LONG';
  if (isLong && input.stopLossPrice.gte(input.entryPrice)) {
    return zeroOut('BLOCKED', 'LONG stop-loss must be below entry price');
  }
  if (!isLong && input.stopLossPrice.lte(input.entryPrice)) {
    return zeroOut('BLOCKED', 'SHORT stop-loss must be above entry price');
  }

  const fee = maxDec(ZERO, input.feeRate);
  const priceRisk = input.entryPrice.sub(input.stopLossPrice).abs();
  const feePerUnitStop = fee.mul(input.entryPrice.add(input.stopLossPrice));
  const lossPerUnit = priceRisk.add(feePerUnitStop);

  let netRewardPerUnit: Dec | null = null;
  let netRR: Dec | null = null;
  if (input.takeProfitPrice && input.takeProfitPrice.gt(ZERO)) {
    const validTp = isLong ? input.takeProfitPrice.gt(input.entryPrice) : input.takeProfitPrice.lt(input.entryPrice);
    if (validTp) {
      const grossReward = input.takeProfitPrice.sub(input.entryPrice).abs();
      const feePerUnitTp = fee.mul(input.entryPrice.add(input.takeProfitPrice));
      netRewardPerUnit = grossReward.sub(feePerUnitTp);
      if (lossPerUnit.gt(ZERO)) {
        netRR = floorSigned(netRewardPerUnit.div(lossPerUnit), 4);
      }
    }
  }

  // 1. Fixed Fractional size (uses `@cex/core` positionSizeForRisk for LONG, exact mirror for SHORT)
  const riskPct = input.riskPercent ?? ONE;
  let fixedFractionalQty: Dec;
  if (isLong) {
    fixedFractionalQty = positionSizeForRisk({
      equity: input.equityUsdt.mul(ddMult),
      riskPercent: riskPct,
      entryPrice: input.entryPrice,
      stopPrice: input.stopLossPrice,
      stepSize: step,
      feeRate: fee,
    }).quantity;
  } else {
    const riskAmount = input.equityUsdt.mul(ddMult).mul(riskPct).div(PCT_MULTIPLIER);
    fixedFractionalQty = floorToStep(riskAmount.div(lossPerUnit), step);
  }

  // 2. Concentration Capped size (default 10% of equity)
  const maxConc = input.maxConcentrationFraction ?? new Dec('0.10');
  const maxConcNotional = input.equityUsdt.mul(ddMult).mul(maxConc);
  const concentrationCappedQty = floorToStep(maxConcNotional.div(input.entryPrice), step);

  // 3. Volatility-Adjusted size (ATR-based)
  const targetVolPct = input.targetDailyVolPercent ?? TWO;
  let volatilityAdjustedQty = concentrationCappedQty;
  if (input.atrPrice && input.atrPrice.gt(ZERO)) {
    const targetDailyMoveUsdt = input.equityUsdt.mul(ddMult).mul(targetVolPct).div(PCT_MULTIPLIER);
    volatilityAdjustedQty = floorToStep(targetDailyMoveUsdt.div(input.atrPrice), step);
  }

  // 4. Liquidity-Constrained size (capped at maxParticipation of visible depth)
  const maxParticipation = input.maxDepthParticipation ?? new Dec('0.10');
  let liquidityConstrainedQty = concentrationCappedQty;
  if (input.visibleDepthUsdt && input.visibleDepthUsdt.gt(ZERO)) {
    const maxLiqNotional = input.visibleDepthUsdt.mul(maxParticipation);
    liquidityConstrainedQty = floorToStep(maxLiqNotional.div(input.entryPrice), step);
  }

  // 5. Quarter-Kelly size
  const winRate = input.estimatedWinRate ?? new Dec('0.52');
  const payoff = netRR && netRR.gt(ZERO) ? netRR : new Dec('1.5');
  const kellyFrac = fractionalKellyFractionDec({
    winRate,
    payoffRatio: payoff,
    kellyMultiplier: new Dec('0.25'),
    maxFractionCap: maxConc,
  });
  const kellyNotional = input.equityUsdt.mul(ddMult).mul(kellyFrac);
  const kellyQty = kellyFrac.gt(ZERO) ? floorToStep(kellyNotional.div(input.entryPrice), step) : ZERO;

  const candidates: Array<{ kind: SizingConstraintKind; qty: Dec }> = [
    { kind: 'FIXED_FRACTIONAL', qty: fixedFractionalQty },
    { kind: 'CONCENTRATION', qty: concentrationCappedQty },
    { kind: 'VOLATILITY', qty: volatilityAdjustedQty },
    { kind: 'LIQUIDITY', qty: liquidityConstrainedQty },
    { kind: 'KELLY', qty: kellyQty },
  ];

  let binding = candidates[0]!;
  for (const c of candidates) {
    if (c.qty.lt(binding.qty)) binding = c;
  }

  const maxQtyDec = dec(input.rules.maxQty);
  const cappedQty = minDec(binding.qty, floorToStep(maxQtyDec, step));
  const notional = roundUp(cappedQty.mul(input.entryPrice), AMOUNT_SCALE);
  const qtyErr = checkQuantity(input.rules, cappedQty);
  const notionalErr = qtyErr ?? checkNotional(input.rules, notional);

  if (notionalErr || cappedQty.lte(ZERO)) {
    return {
      kellyQty,
      fixedFractionalQty,
      volatilityAdjustedQty,
      liquidityConstrainedQty,
      concentrationCappedQty,
      finalQuantity: ZERO,
      finalNotionalUsdt: ZERO,
      bindingConstraint: binding.qty.lte(ZERO) ? binding.kind : 'BELOW_MIN_LOT',
      lossPerUnitUsdt: roundUp(lossPerUnit, AMOUNT_SCALE),
      netRewardPerUnitUsdt: netRewardPerUnit ? floorSigned(netRewardPerUnit, AMOUNT_SCALE) : null,
      netRiskRewardRatio: netRR,
      lotCheckError: notionalErr ?? 'Quantity is zero',
    };
  }

  return {
    kellyQty,
    fixedFractionalQty,
    volatilityAdjustedQty,
    liquidityConstrainedQty,
    concentrationCappedQty,
    finalQuantity: cappedQty,
    finalNotionalUsdt: notional,
    bindingConstraint: binding.kind,
    lossPerUnitUsdt: roundUp(lossPerUnit, AMOUNT_SCALE),
    netRewardPerUnitUsdt: netRewardPerUnit ? floorSigned(netRewardPerUnit, AMOUNT_SCALE) : null,
    netRiskRewardRatio: netRR,
    lotCheckError: null,
  };
}

// ───────────────────────────── Portfolio Risk Metrics & Circuit Breakers (`risk-management`)

/** Maximum peak-to-trough drawdown (%) from an equity curve. */
export function maxDrawdownPctDec(equityCurve: readonly Dec[]): Dec {
  if (equityCurve.length === 0) return ZERO;
  let peak = equityCurve[0]!;
  let maxDd = ZERO;
  for (const eq of equityCurve) {
    if (eq.gt(peak)) peak = eq;
    if (peak.gt(ZERO)) {
      const dd = peak.sub(eq).div(peak).mul(PCT_MULTIPLIER);
      if (dd.gt(maxDd)) maxDd = dd;
    }
  }
  return roundUp(maxDd, 4);
}

/** Current drawdown (%) from the running peak to the latest equity value. */
export function currentDrawdownPctDec(equityCurve: readonly Dec[]): Dec {
  if (equityCurve.length === 0) return ZERO;
  let peak = ZERO;
  for (const eq of equityCurve) {
    if (eq.gt(peak)) peak = eq;
  }
  if (peak.lte(ZERO)) return ZERO;
  const last = equityCurve[equityCurve.length - 1]!;
  return roundUp(maxDec(ZERO, peak.sub(last).div(peak).mul(PCT_MULTIPLIER)), 4);
}

/** Historical Value at Risk (VaR) and Expected Shortfall (CVaR) as positive loss percentages. */
export function historicalVarAndCvarPctDec(
  returnPctSeries: readonly Dec[],
  confidence = new Dec('0.95'),
): { varPct: Dec | null; cvarPct: Dec | null } {
  if (returnPctSeries.length < 5) return { varPct: null, cvarPct: null };
  const sorted = [...returnPctSeries].sort((a, b) => a.cmp(b));
  const alpha = ONE.sub(confidence);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(alpha.mul(sorted.length).toNumber())));
  const worstAtIdx = sorted[idx]!;
  const varPct = worstAtIdx.lt(ZERO) ? roundUp(worstAtIdx.abs(), 4) : ZERO;

  const tailCount = idx + 1;
  let tailSum = ZERO;
  for (let i = 0; i < tailCount; i++) tailSum = tailSum.add(sorted[i]!);
  const tailAvg = tailSum.div(tailCount);
  const cvarPct = tailAvg.lt(ZERO) ? roundUp(tailAvg.abs(), 4) : ZERO;
  return { varPct, cvarPct };
}

export interface CircuitBreakerEvaluation {
  halted: boolean;
  sizeMultiplier: Dec;
  status: 'NORMAL' | 'CAUTION' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  reasons: string[];
}

/**
 * Evaluates portfolio circuit breakers (`risk-management` skill):
 * - Drawdown tiers: 0–5% normal (1.0x), 5–10% caution (0.5x), 10–15% warning (0.25x), >=15% critical/emergency (0x halt).
 * - Daily loss limit (default -3% conservative / -4% moderate).
 * - Consecutive loss streak: >=3 (0.5x), >=5 (0.25x), >=7 (0x halt).
 */
export function evaluateCircuitBreakersDec(params: {
  currentDrawdownPct: Dec;
  dailyLossPct?: Dec | null;
  weeklyLossPct?: Dec | null;
  consecutiveLosses?: number;
  maxDrawdownLimitPct?: Dec;
  dailyLossLimitPct?: Dec;
}): CircuitBreakerEvaluation {
  const reasons: string[] = [];
  let mult = ONE;
  let status: CircuitBreakerEvaluation['status'] = 'NORMAL';
  const maxDdLimit = params.maxDrawdownLimitPct ?? new Dec(15);
  const dailyLimit = params.dailyLossLimitPct ?? new Dec(4);
  const dd = params.currentDrawdownPct;

  if (dd.gte(20)) {
    status = 'EMERGENCY';
    mult = ZERO;
    reasons.push(`Drawdown ${dd.toFixed(2)}% >= 20% emergency threshold`);
  } else if (dd.gte(maxDdLimit)) {
    status = 'CRITICAL';
    mult = ZERO;
    reasons.push(`Drawdown ${dd.toFixed(2)}% >= ${maxDdLimit.toFixed(2)}% critical limit`);
  } else if (dd.gte(10)) {
    status = 'WARNING';
    mult = minDec(mult, new Dec('0.25'));
    reasons.push(`Drawdown ${dd.toFixed(2)}% in 10-15% warning zone (minimum size 0.25x)`);
  } else if (dd.gte(5)) {
    status = 'CAUTION';
    mult = minDec(mult, new Dec('0.50'));
    reasons.push(`Drawdown ${dd.toFixed(2)}% in 5-10% caution zone (reduced size 0.50x)`);
  }

  if (params.dailyLossPct && params.dailyLossPct.gte(dailyLimit)) {
    status = status === 'EMERGENCY' ? 'EMERGENCY' : 'CRITICAL';
    mult = ZERO;
    reasons.push(`Daily loss ${params.dailyLossPct.toFixed(2)}% reached daily halt limit ${dailyLimit.toFixed(2)}%`);
  }

  if (params.weeklyLossPct && params.weeklyLossPct.gte(10)) {
    status = status === 'EMERGENCY' ? 'EMERGENCY' : 'CRITICAL';
    mult = ZERO;
    reasons.push(`Weekly loss ${params.weeklyLossPct.toFixed(2)}% reached 10% full halt limit`);
  } else if (params.weeklyLossPct && params.weeklyLossPct.gte(5)) {
    if (status === 'NORMAL') status = 'CAUTION';
    mult = minDec(mult, new Dec('0.50'));
    reasons.push(`Weekly loss ${params.weeklyLossPct.toFixed(2)}% >= 5% (size reduced 50%)`);
  }

  const streak = params.consecutiveLosses ?? 0;
  if (streak >= 7) {
    status = status === 'EMERGENCY' ? 'EMERGENCY' : 'CRITICAL';
    mult = ZERO;
    reasons.push(`${streak} consecutive losses >= 7 (24h cooling halt)`);
  } else if (streak >= 5) {
    if (status === 'NORMAL' || status === 'CAUTION') status = 'WARNING';
    mult = minDec(mult, new Dec('0.25'));
    reasons.push(`${streak} consecutive losses >= 5 (minimum size 0.25x)`);
  } else if (streak >= 3) {
    if (status === 'NORMAL') status = 'CAUTION';
    mult = minDec(mult, new Dec('0.50'));
    reasons.push(`${streak} consecutive losses >= 3 (reduced size 0.50x)`);
  }

  return {
    halted: mult.lte(ZERO),
    sizeMultiplier: mult,
    status,
    reasons,
  };
}

/** Helper to safely format optional `Dec` to fixed decimal string or null. */
export function toOptionalFixedStr(d: Dec | null | undefined, scale = INDICATOR_SCALE): string | null {
  if (d === null || d === undefined) return null;
  return d.toFixed(scale);
}

export { dec };
