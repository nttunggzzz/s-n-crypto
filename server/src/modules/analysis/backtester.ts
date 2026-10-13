import {
  BacktestEvaluationSummary,
  type CandleInterval,
  type DataStatus,
  type SnapshotBookLevel,
  type SnapshotSymbolRules,
  type WalkForwardFoldMetrics,
} from '@cex/contracts';
import {
  AMOUNT_SCALE,
  dec,
  estimateDepthSlippageDec,
  floorSigned,
  floorToStep,
  fundingPayment,
  maxDec,
  maxDrawdownPctDec,
  roundDown,
  roundUp,
  smaDec,
  spreadBpsDec,
  toFixedStr,
  ZERO,
  type Dec,
} from '@cex/core';
import { CryptoTradingAgentsOrchestrator } from './orchestrator.ts';
import type { RawCandleInput } from './snapshotBuilder.ts';

/**
 * One historical bar plus whatever market state was recorded with it. Every optional field that is absent stays
 * absent in the analysis snapshot (null / UNAVAILABLE); nothing is filled in with a default.
 */
export interface HistoricalBacktestBar extends RawCandleInput {
  /** Feed status at the bar close. Absent -> treated as UNAVAILABLE (no trade), never assumed LIVE. */
  dataStatus?: DataStatus;
  /** Top-of-book spread at the bar close. With no `bids`/`asks`, a synthetic book is built from it (flagged synthetic). */
  spreadBps?: string;
  fundingRate8h?: string | null;
  openInterest?: string;
  /** Perpetual mark / index at the bar close. Absent -> the derivatives department abstains. */
  markPrice?: string;
  indexPrice?: string;
  bids?: SnapshotBookLevel[];
  asks?: SnapshotBookLevel[];
}

export interface WalkForwardBacktestInput {
  symbol: string;
  interval: CandleInterval;
  initialEquityUsdt: string;
  rules: SnapshotSymbolRules;
  bars: HistoricalBacktestBar[];
  warmupBars?: number;
  maxVolumeParticipation?: string;
  numTrialStrategiesAssumed?: number;
  walkForwardFoldCount?: number;
  orchestrator?: CryptoTradingAgentsOrchestrator;
}

export interface SimulatedTradeRecord {
  entryBarIndex: number;
  exitBarIndex: number;
  side: 'LONG' | 'SHORT';
  qty: string;
  entryPrice: string;
  exitPrice: string;
  grossPnlUsdt: string;
  feesPaidUsdt: string;
  slippageCostUsdt: string;
  fundingPaidUsdt: string;
  netPnlUsdt: string;
  liquidityCapped: boolean;
}

const PROFITABILITY_DISCLAIMER =
  'DISCLAIMER: Historical simulation results, walk-forward metrics, and multi-agent confidence scores are for research evaluation only and never guarantee future live trading profitability. Live order execution is permanently disabled.';

const DAY_MS = 86_400_000;

/**
 * Quote volume of the 24h window ending at `bars[i]` (close times in (t − 24h, t]). `null` unless the window is
 * complete (24h / bar length bars, all with a recorded `quoteVolume`) — a single bar is never reported as 24h volume.
 */
function quoteVolumeOver24h(bars: readonly HistoricalBacktestBar[], i: number): string | null {
  const bar = bars[i]!;
  const barMs = bar.closeTime - bar.openTime + 1;
  if (barMs <= 0 || DAY_MS % barMs !== 0) return null;
  const needed = DAY_MS / barMs;
  let sum = ZERO;
  let count = 0;
  for (let j = i; j >= 0 && bars[j]!.closeTime > bar.closeTime - DAY_MS; j--) {
    const qv = bars[j]!.quoteVolume;
    if (qv === undefined) return null;
    sum = sum.add(dec(qv));
    count++;
  }
  return count === needed ? toFixedStr(sum) : null;
}

/** Signed ratio floored to 4 decimals as a string, or `null` when the ratio is undefined. */
function fixed4OrNull(value: Dec | null): string | null {
  return value === null ? null : floorSigned(value, 4).toFixed(4);
}

/** Standard normal CDF approximation (Abramowitz & Stegun 26.2.17) for Deflated Sharpe Ratio. */
function normalCdf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * absX);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);
  return 0.5 * (1 + sign * erf);
}

/**
 * Annualized Sharpe and Sortino of per-bar returns. Each is `null` when undefined for the sample:
 * fewer than 2 returns, zero variance (Sharpe) or no negative return (Sortino). Never a placeholder 0.
 */
function computeSharpeAndSortinoDec(barReturns: readonly Dec[], barsPerYear = 365): {
  sharpe: Dec | null;
  sortino: Dec | null;
} {
  if (barReturns.length < 2) return { sharpe: null, sortino: null };
  const mean = smaDec(barReturns, barReturns.length) ?? ZERO;
  let sqSum = ZERO;
  let downSqSum = ZERO;
  for (const r of barReturns) {
    const diff = r.sub(mean);
    sqSum = sqSum.add(diff.mul(diff));
    if (r.lt(ZERO)) {
      downSqSum = downSqSum.add(r.mul(r));
    }
  }
  const std = sqSum.div(barReturns.length - 1).sqrt();
  const downStd = downSqSum.div(barReturns.length).sqrt();
  const annFactor = dec(String(barsPerYear)).sqrt();

  const sharpe = std.gt(ZERO) ? mean.div(std).mul(annFactor) : null;
  const sortino = downStd.gt(ZERO) ? mean.div(downStd).mul(annFactor) : null;
  return { sharpe, sortino };
}

/**
 * Inverse standard normal CDF Φ⁻¹(p) for 0 < p < 1 (Acklam's rational approximation, relative error < 1.2e-9).
 * Returns NaN outside (0, 1) so callers can reject the result.
 */
export function inverseNormalCdf(p: number): number {
  if (!(p > 0 && p < 1)) return Number.NaN;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > 1 - pLow) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

/**
 * Deflated Sharpe Ratio (Bailey & López de Prado, 2014), multiple-testing part only.
 * - Benchmark SR0 = expected maximum Sharpe of N independent null trials:
 *   N = 1 -> SR0 = 0; N >= 2 -> SR0 = [(1 − γ)·Φ⁻¹(1 − 1/N) + γ·Φ⁻¹(1 − 1/(N·e))] / √n (γ = Euler–Mascheroni).
 * - DSR = Φ((SR − SR0)·√(n − 1)) with SR the per-bar Sharpe. It does NOT apply the skewness/kurtosis correction of the
 *   paper (returns are treated as normal), so fat tails are not penalized. Floating-point math: this is a probability,
 *   not money.
 * - `null` when the observed Sharpe is undefined, there are fewer than 5 returns, N < 1, or the result is not finite.
 */
export function computeDeflatedSharpeRatioDec(
  observedSharpe: Dec | null,
  barReturns: readonly Dec[],
  numTrials = 10,
  barsPerYear = 365,
): Dec | null {
  if (observedSharpe === null || barReturns.length < 5 || !Number.isInteger(numTrials) || numTrials < 1) return null;
  const n = barReturns.length;
  const eulerMascheroni = 0.5772156649015329;
  const srBenchmark =
    numTrials === 1
      ? 0
      : (1 - eulerMascheroni) * inverseNormalCdf(1 - 1 / numTrials) +
        eulerMascheroni * inverseNormalCdf(1 - 1 / (numTrials * Math.E));
  const sr0 = srBenchmark / Math.sqrt(n);

  const srPerBar = observedSharpe.toNumber() / Math.sqrt(barsPerYear);
  const z = (srPerBar - sr0) * Math.sqrt(n - 1);
  if (!Number.isFinite(z)) return null;
  const prob = normalCdf(z);
  if (!Number.isFinite(prob)) return null;
  return floorSigned(dec(prob.toFixed(6)), 4);
}

/**
 * Overfitting heuristic labelled "PBO": 4 equal chunks, 4 fixed in-sample/out-of-sample pairings, share of pairings where
 * the out-of-sample Sharpe is <= 0 or below a quarter of the in-sample Sharpe. This is a simplified screen, NOT the full
 * combinatorially symmetric cross-validation (CSCV) of Bailey et al. across strategy configurations.
 * `null` (not estimable) when there are fewer than 8 returns or any partition's Sharpe is undefined —
 * never a placeholder such as 0.5.
 */
function estimatePboDec(barReturns: readonly Dec[]): Dec | null {
  if (barReturns.length < 8) return null;
  const chunkSize = Math.floor(barReturns.length / 4);
  if (chunkSize < 2) return null;

  const chunkScores: Dec[] = [];
  for (let c = 0; c < 4; c++) {
    const slice = barReturns.slice(c * chunkSize, (c + 1) * chunkSize);
    const { sharpe } = computeSharpeAndSortinoDec(slice, 365);
    if (sharpe === null) return null;
    chunkScores.push(sharpe);
  }

  // Pairwise split checks: how often is the second-half Sharpe negative or worse than median when first-half is positive
  const splits: Array<{ is: Dec; oos: Dec }> = [
    { is: chunkScores[0]!.add(chunkScores[1]!).div(2), oos: chunkScores[2]!.add(chunkScores[3]!).div(2) },
    { is: chunkScores[0]!.add(chunkScores[2]!).div(2), oos: chunkScores[1]!.add(chunkScores[3]!).div(2) },
    { is: chunkScores[0]!.add(chunkScores[3]!).div(2), oos: chunkScores[1]!.add(chunkScores[2]!).div(2) },
    { is: chunkScores[1]!.add(chunkScores[2]!).div(2), oos: chunkScores[0]!.add(chunkScores[3]!).div(2) },
  ];

  let overfitCount = 0;
  for (const s of splits) {
    if (s.oos.lte(ZERO) || (s.is.gt(ZERO) && s.oos.lt(s.is.mul('0.25')))) {
      overfitCount++;
    }
  }
  return floorSigned(dec(String(overfitCount)).div(splits.length), 4);
}

/**
 * Point-in-time Historical Simulation & Walk-Forward Evaluator.
 *
 * Strictly separates historical simulation from live trading (`mode: 'HISTORICAL_SIMULATION'`, `liveExecutionEnabled: false`).
 * Signals at bar `t` close execute at bar `t + 1` open with fees, orderbook slippage, 8h funding, and bar volume caps.
 * Market state the bars did not record (status, book, trades, mark/index, funding, OI, 24h ticker) is passed as
 * missing, never filled in; a book synthesised from the bar spread is flagged `orderBookSynthetic`.
 */
export async function runWalkForwardBacktest(input: WalkForwardBacktestInput): Promise<{
  summary: BacktestEvaluationSummary;
  trades: SimulatedTradeRecord[];
}> {
  const orchestrator = input.orchestrator ?? new CryptoTradingAgentsOrchestrator({ maxDebateRounds: 1 });
  const warmup = Math.max(15, input.warmupBars ?? 20);
  const maxVolPart = dec(input.maxVolumeParticipation ?? '0.05');
  const feeRate = dec(input.rules.feeRate);
  const stepSize = dec(input.rules.stepSize);
  const bars = [...input.bars].sort((a, b) => a.openTime - b.openTime);

  const initialEquity = dec(input.initialEquityUsdt);
  let equity = initialEquity;
  const equityCurve: Dec[] = [initialEquity];
  const barReturns: Dec[] = [];
  const trades: SimulatedTradeRecord[] = [];

  let totalFeesPaid = ZERO;
  let totalSlippageCost = ZERO;
  let totalFundingPaid = ZERO;
  let liquidityCappedTrades = 0;
  let staleOrHaltedSkips = 0;
  let consecutiveLosses = 0;
  let totalNotionalTraded = ZERO;

  // Close time -> bar, for the real 24h look-back (a 1-bar change is never relabelled as a 24h change).
  const barByCloseTime = new Map<number, HistoricalBacktestBar>(bars.map((b) => [b.closeTime, b]));

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]!;
    if (i < warmup || i >= bars.length - 1) {
      continue;
    }

    const nextBar = bars[i + 1]!;
    // A bar without a recorded feed status is not assumed LIVE.
    const status: DataStatus = bar.dataStatus ?? 'UNAVAILABLE';
    const mid = dec(bar.close);

    // Order book at bar t close: the bar's recorded levels when it has them; otherwise a synthetic two-level book from
    // the bar's spread and volume, flagged `orderBookSynthetic` so its evidence is INFERRED, not OBSERVED.
    // Neither -> no book at all: the order-flow department blocks and no trade is simulated.
    const recordedBook = (bar.bids?.length ?? 0) > 0 && (bar.asks?.length ?? 0) > 0;
    const spreadBps: Dec | null =
      bar.spreadBps !== undefined
        ? dec(bar.spreadBps)
        : recordedBook
          ? spreadBpsDec(dec(bar.bids![0]!.price), dec(bar.asks![0]!.price))
          : null;
    let bids: SnapshotBookLevel[] = [];
    let asks: SnapshotBookLevel[] = [];
    let orderBookSynthetic = false;
    if (recordedBook) {
      bids = bar.bids!;
      asks = bar.asks!;
    } else if (spreadBps !== null) {
      const halfSpread = mid.mul(spreadBps).div(20_000);
      const synthBid = mid.sub(halfSpread);
      const synthAsk = mid.add(halfSpread);
      const barQuoteVol = bar.quoteVolume !== undefined ? dec(bar.quoteVolume) : dec(bar.volume).mul(mid);
      const levelQty = floorToStep(maxDec(stepSize.mul(10), barQuoteVol.mul('0.05').div(mid)), stepSize);
      bids = [
        { price: synthBid.toFixed(2), qty: levelQty.toFixed(stepSize.decimalPlaces()) },
        { price: synthBid.mul('0.998').toFixed(2), qty: levelQty.mul(2).toFixed(stepSize.decimalPlaces()) },
      ];
      asks = [
        { price: synthAsk.toFixed(2), qty: levelQty.toFixed(stepSize.decimalPlaces()) },
        { price: synthAsk.mul('1.002').toFixed(2), qty: levelQty.mul(2).toFixed(stepSize.decimalPlaces()) },
      ];
      orderBookSynthetic = true;
    }

    // 24h ticker fields only from a complete 24h window of recorded bars; otherwise null.
    const dayAgo = barByCloseTime.get(bar.closeTime - DAY_MS);
    const priceChangePct24h =
      dayAgo && dec(dayAgo.close).gt(ZERO)
        ? dec(bar.close).sub(dayAgo.close).div(dayAgo.close).mul(100).toFixed(2)
        : null;
    const quoteVolume24h = quoteVolumeOver24h(bars, i);

    // Derivatives only from what the bar recorded: no spot close as mark/index, no default funding, no volume x price
    // as open interest, no invented next funding time. Without a mark the derivatives department abstains.
    const oiWindow = bars.slice(Math.max(0, i - 10), i + 1);
    const openInterestSeries = oiWindow.every((b) => b.openInterest !== undefined)
      ? oiWindow.map((b) => b.openInterest!)
      : [];
    const derivativesStatus: DataStatus = bar.markPrice !== undefined ? status : 'UNAVAILABLE';

    const currentDd = maxDrawdownPctDec(equityCurve);

    // Run point-in-time analysis using ONLY closed bars [0..i]
    const report = await orchestrator.analyzeFromRawInput({
      symbol: input.symbol,
      interval: input.interval,
      asOfMs: bar.closeTime,
      spotDataStatus: status,
      futuresDataStatus: derivativesStatus,
      rules: input.rules,
      spot: {
        lastPrice: bar.close,
        bestBid: bids[0]?.price ?? null,
        bestAsk: asks[0]?.price ?? null,
        priceChangePct24h,
        quoteVolume24h,
        tickerUpdatedAtMs: bar.closeTime,
        bookUpdatedAtMs: bids.length > 0 || asks.length > 0 ? bar.closeTime : null,
        bids,
        asks,
        orderBookSynthetic,
        // No historical public trades are recorded with a bar; candle-direction proxies would be invented order flow.
        recentTrades: [],
        candles: bars.slice(0, i + 1).map((b) => ({ ...b, closed: true })),
      },
      derivatives: {
        status: derivativesStatus,
        markPrice: bar.markPrice ?? null,
        indexPrice: bar.indexPrice ?? null,
        lastFundingRate: bar.fundingRate8h ?? null,
        nextFundingTime: null,
        openInterestSeries,
        updatedAtMs: bar.markPrice !== undefined ? bar.closeTime : null,
      },
      // The simulation tracks equity, drawdown and the loss streak; daily/weekly loss are not tracked -> not provided.
      portfolio: {
        provided: true,
        equityUsdt: toFixedStr(equity),
        availableUsdt: toFixedStr(equity),
        currentDrawdownPct: currentDd.toFixed(4),
        consecutiveLosses,
        activePositions: [],
      },
    });

    if (
      status !== 'LIVE' ||
      report.rating === 'REVIEW' ||
      report.advisoryProposal.action === 'NO_TRADE' ||
      report.advisoryProposal.action === 'HOLD'
    ) {
      if (status !== 'LIVE' || report.rating === 'REVIEW') {
        staleOrHaltedSkips++;
      }
      barReturns.push(ZERO);
      equityCurve.push(equity);
      orchestrator.memoryLog.settleDueEpisodes({
        symbol: input.symbol,
        barCloseTimeMs: nextBar.closeTime,
        closePrice: nextBar.close,
      });
      continue;
    }

    // Execute on nextBar.open (NO same-bar close look-ahead!)
    const side: 'LONG' | 'SHORT' = report.advisoryProposal.action === 'SHORT' ? 'SHORT' : 'LONG';
    const rawQty = dec(report.advisoryProposal.recommendedQuantity);
    const nextOpen = dec(nextBar.open);
    const nextClose = dec(nextBar.close);

    // Enforce bar liquidity participation cap on nextBar volume
    const nextBarQuoteVol =
      nextBar.quoteVolume !== undefined ? dec(nextBar.quoteVolume) : dec(nextBar.volume).mul(nextOpen);
    const maxBarNotional = nextBarQuoteVol.mul(maxVolPart);
    const maxBarQty = floorToStep(maxBarNotional.div(nextOpen), stepSize);

    let executedQty = rawQty;
    let liquidityCapped = false;
    // maxBarQty can be 0 (next bar too thin for one step): then nothing fills — it is never "uncapped".
    if (executedQty.gt(maxBarQty)) {
      executedQty = maxBarQty;
      liquidityCapped = true;
      liquidityCappedTrades++;
    }

    const entryNotional = executedQty.mul(nextOpen);
    const bookLevels = (side === 'LONG' ? asks : bids).map((l) => ({ price: dec(l.price), qty: dec(l.qty) }));
    const depthSlip = estimateDepthSlippageDec(
      side === 'LONG' ? 'BUY' : 'SELL',
      bookLevels,
      entryNotional,
      stepSize,
    );
    const halfSpreadBps = spreadBps !== null ? spreadBps.div(2) : null;
    const slipBps =
      depthSlip.slippageBps !== null && halfSpreadBps !== null
        ? maxDec(halfSpreadBps, depthSlip.slippageBps)
        : (depthSlip.slippageBps ?? halfSpreadBps);

    // Nothing fills, or the execution cost cannot be estimated (no spread, no book) -> no simulated trade.
    if (executedQty.lte(ZERO) || slipBps === null) {
      barReturns.push(ZERO);
      equityCurve.push(equity);
      continue;
    }

    // Apply entry + exit slippage (roundUp cost)
    const entrySlipCost = roundUp(entryNotional.mul(slipBps).div(10_000), AMOUNT_SCALE);
    const exitNotional = executedQty.mul(nextClose);
    const exitSlipCost = roundUp(exitNotional.mul(slipBps).div(10_000), AMOUNT_SCALE);
    const tradeSlippage = entrySlipCost.add(exitSlipCost);

    // Apply entry + exit fees (`roundUp` what the user pays)
    const entryFee = roundUp(entryNotional.mul(feeRate), AMOUNT_SCALE);
    const exitFee = roundUp(exitNotional.mul(feeRate), AMOUNT_SCALE);
    const tradeFees = entryFee.add(exitFee);

    // Apply perpetual funding payment (`fundingPayment` returns + received, - paid).
    // No recorded rate -> 0.01% charged AGAINST the position (Module C §3.2 convention), never a default sign that
    // would pay a SHORT.
    const fundingRateDec =
      nextBar.fundingRate8h !== undefined && nextBar.fundingRate8h !== null
        ? dec(nextBar.fundingRate8h)
        : dec(side === 'LONG' ? '0.0001' : '-0.0001');
    const fundingCashflow = fundingPayment(side, executedQty, nextClose, fundingRateDec);
    const fundingCost = fundingCashflow.negated();

    const grossPnl =
      side === 'LONG'
        ? nextClose.sub(nextOpen).mul(executedQty)
        : nextOpen.sub(nextClose).mul(executedQty);
    const netPnl = floorSigned(
      grossPnl.sub(tradeFees).sub(tradeSlippage).add(fundingCashflow),
      AMOUNT_SCALE,
    );

    const prevEquity = equity;
    equity = maxDec(ZERO, equity.add(netPnl));
    const barRet = prevEquity.gt(ZERO) ? netPnl.div(prevEquity) : ZERO;
    barReturns.push(barRet);
    equityCurve.push(equity);

    totalFeesPaid = totalFeesPaid.add(tradeFees);
    totalSlippageCost = totalSlippageCost.add(tradeSlippage);
    totalFundingPaid = totalFundingPaid.add(fundingCost);
    totalNotionalTraded = totalNotionalTraded.add(entryNotional).add(exitNotional);

    if (netPnl.lt(ZERO)) consecutiveLosses++;
    else if (netPnl.gt(ZERO)) consecutiveLosses = 0;

    trades.push({
      entryBarIndex: i + 1,
      exitBarIndex: i + 1,
      side,
      qty: executedQty.toFixed(stepSize.decimalPlaces()),
      entryPrice: nextOpen.toFixed(2),
      exitPrice: nextClose.toFixed(2),
      grossPnlUsdt: floorSigned(grossPnl, AMOUNT_SCALE).toFixed(AMOUNT_SCALE),
      feesPaidUsdt: toFixedStr(tradeFees),
      slippageCostUsdt: toFixedStr(tradeSlippage),
      fundingPaidUsdt: fundingCost.toFixed(AMOUNT_SCALE),
      netPnlUsdt: netPnl.toFixed(AMOUNT_SCALE),
      liquidityCapped,
    });

    orchestrator.memoryLog.recordDecision({
      episodeId: `ep-${input.symbol}-${bar.closeTime}`,
      symbol: input.symbol,
      decisionAtMs: bar.closeTime,
      horizonHours: 1,
      rating: report.rating,
      entryPrice: nextBar.open,
    });
    orchestrator.memoryLog.settleDueEpisodes({
      symbol: input.symbol,
      barCloseTimeMs: nextBar.closeTime,
      closePrice: nextBar.close,
    });
  }

  // Compute summary metrics
  const totalReturnPct = initialEquity.gt(ZERO)
    ? equity.sub(initialEquity).div(initialEquity).mul(100)
    : ZERO;

  const firstTradeBar = bars[Math.min(warmup, bars.length - 1)]!;
  const lastTradeBar = bars[bars.length - 1]!;
  const benchmarkReturnPct = dec(firstTradeBar.open).gt(ZERO)
    ? dec(lastTradeBar.close).sub(dec(firstTradeBar.open)).div(dec(firstTradeBar.open)).mul(100)
    : ZERO;
  const excessReturnPct = totalReturnPct.sub(benchmarkReturnPct);

  const mddPct = maxDrawdownPctDec(equityCurve);
  const { sharpe, sortino } = computeSharpeAndSortinoDec(barReturns, 365);
  const calmar = mddPct.gt(ZERO) ? totalReturnPct.div(mddPct) : null;
  const dsr = computeDeflatedSharpeRatioDec(sharpe, barReturns, input.numTrialStrategiesAssumed ?? 10);
  const pbo = estimatePboDec(barReturns);

  let wins = 0;
  let grossWins = ZERO;
  let grossLosses = ZERO;
  for (const t of trades) {
    const net = dec(t.netPnlUsdt);
    if (net.gt(ZERO)) {
      wins++;
      grossWins = grossWins.add(net);
    } else if (net.lt(ZERO)) {
      grossLosses = grossLosses.add(net.abs());
    }
  }
  // No trades -> no win rate; no losing trade -> profit factor undefined (never a capped 9.99 or 0).
  const winRatePct = trades.length > 0 ? dec(String(wins)).div(trades.length).mul(100) : null;
  const profitFactor = grossLosses.gt(ZERO) ? grossWins.div(grossLosses) : null;
  const turnoverMultiple = initialEquity.gt(ZERO) ? totalNotionalTraded.div(initialEquity) : ZERO;

  // Compute Walk-Forward Folds (Out-of-Sample validation)
  const foldCount = Math.max(1, Math.min(4, input.walkForwardFoldCount ?? 2));
  const walkForwardFolds: WalkForwardFoldMetrics[] = [];
  const activeBars = bars.slice(warmup);
  const foldSize = Math.floor(barReturns.length / foldCount);

  // Walk-forward efficiency needs every fold's in-sample and out-of-sample Sharpe; one undefined -> null.
  let isSharpeSum: Dec | null = ZERO;
  let oosSharpeSum: Dec | null = ZERO;

  if (foldSize >= 4) {
    for (let f = 0; f < foldCount; f++) {
      const startIdx = f * foldSize;
      const endIdx = f === foldCount - 1 ? barReturns.length : (f + 1) * foldSize;
      const foldReturns = barReturns.slice(startIdx, endIdx);
      const splitPoint = Math.max(2, Math.floor(foldReturns.length * 0.6));
      const trainRets = foldReturns.slice(0, splitPoint);
      const testRets = foldReturns.slice(splitPoint);

      const isMetrics = computeSharpeAndSortinoDec(trainRets, 365);
      const oosMetrics = computeSharpeAndSortinoDec(testRets, 365);
      isSharpeSum = isSharpeSum !== null && isMetrics.sharpe !== null ? isSharpeSum.add(isMetrics.sharpe) : null;
      oosSharpeSum = oosSharpeSum !== null && oosMetrics.sharpe !== null ? oosSharpeSum.add(oosMetrics.sharpe) : null;

      let foldEq = dec('100');
      const foldEqCurve: Dec[] = [foldEq];
      for (const r of testRets) {
        foldEq = foldEq.mul(dec('1').add(r));
        foldEqCurve.push(foldEq);
      }
      const oosRetPct = foldEq.sub(100);
      const oosMddPct = maxDrawdownPctDec(foldEqCurve);

      const trainStartBar = activeBars[startIdx] ?? firstTradeBar;
      const trainEndBar = activeBars[Math.min(activeBars.length - 1, startIdx + splitPoint - 1)] ?? firstTradeBar;
      const testStartBar = activeBars[Math.min(activeBars.length - 1, startIdx + splitPoint)] ?? lastTradeBar;
      const testEndBar = activeBars[Math.min(activeBars.length - 1, endIdx - 1)] ?? lastTradeBar;

      const foldTrades = trades.filter(
        (t) => t.entryBarIndex >= warmup + startIdx + splitPoint && t.entryBarIndex <= warmup + endIdx,
      ).length;

      walkForwardFolds.push({
        foldIndex: f,
        trainStartMs: trainStartBar.openTime,
        trainEndMs: trainEndBar.closeTime,
        testStartMs: testStartBar.openTime,
        testEndMs: testEndBar.closeTime,
        inSampleSharpe: fixed4OrNull(isMetrics.sharpe),
        outOfSampleSharpe: fixed4OrNull(oosMetrics.sharpe),
        outOfSampleReturnPct: floorSigned(oosRetPct, 4).toFixed(4),
        outOfSampleMaxDrawdownPct: oosMddPct.toFixed(4),
        tradeCount: foldTrades,
      });
    }
  }

  // WFE = ΣOOS / ΣIS only when the in-sample Sharpe sum is positive (> 0.01): with ΣIS <= 0 the ratio is meaningless
  // (two losing sides would give a "good" positive ratio), so it is null.
  const wfEfficiency =
    walkForwardFolds.length > 0 && isSharpeSum !== null && oosSharpeSum !== null && isSharpeSum.gt('0.01')
      ? oosSharpeSum.div(isSharpeSum)
      : null;

  // Research screen only. `PASS_RESEARCH_GATE` is NOT the M3 gate (Module C §3.3: live MODELED_CANDLES of one engine
  // version) and never releases or unlocks anything. PASS needs both overfitting diagnostics to be defined.
  const verdict =
    pbo !== null && dsr !== null && pbo.lt('0.50') && dsr.gte('0.50') && totalReturnPct.gt(ZERO)
      ? 'PASS_RESEARCH_GATE'
      : totalReturnPct.gt('-5.0') && mddPct.lt('15.0')
        ? 'CAUTIOUS_INCONCLUSIVE'
        : 'FAIL_OVERFIT_OR_NEGATIVE';

  const summary = BacktestEvaluationSummary.parse({
    symbol: input.symbol,
    interval: input.interval,
    mode: 'HISTORICAL_SIMULATION',
    liveExecutionEnabled: false,
    initialEquityUsdt: toFixedStr(initialEquity),
    finalEquityUsdt: toFixedStr(roundDown(equity, AMOUNT_SCALE)),
    totalReturnPct: floorSigned(totalReturnPct, 4).toFixed(4),
    benchmarkBuyHoldReturnPct: floorSigned(benchmarkReturnPct, 4).toFixed(4),
    excessReturnPct: floorSigned(excessReturnPct, 4).toFixed(4),
    maxDrawdownPct: mddPct.toFixed(4),
    sharpeRatio: fixed4OrNull(sharpe),
    sortinoRatio: fixed4OrNull(sortino),
    calmarRatio: fixed4OrNull(calmar),
    deflatedSharpeRatio: dsr !== null ? dsr.toFixed(4) : null,
    probabilityOfBacktestOverfitting: pbo !== null ? pbo.toFixed(4) : null,
    winRatePct: winRatePct !== null ? roundDown(winRatePct, 4).toFixed(4) : null,
    profitFactor: profitFactor !== null ? roundDown(profitFactor, 4).toFixed(4) : null,
    totalTrades: trades.length,
    turnoverMultiple: roundDown(turnoverMultiple, 4).toFixed(4),
    totalFeesPaidUsdt: toFixedStr(totalFeesPaid),
    totalSlippageCostUsdt: toFixedStr(totalSlippageCost),
    totalFundingPaidUsdt: totalFundingPaid.toFixed(AMOUNT_SCALE),
    liquidityCappedTrades,
    staleOrHaltedSkips,
    walkForwardEfficiencyRatio: fixed4OrNull(wfEfficiency),
    walkForwardFolds,
    verdict,
    profitabilityDisclaimer: PROFITABILITY_DISCLAIMER,
  });

  return { summary, trades };
}
