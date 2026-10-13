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
  toFixedStr,
  ZERO,
  type Dec,
} from '@cex/core';
import { CryptoTradingAgentsOrchestrator } from './orchestrator.ts';
import type { RawCandleInput } from './snapshotBuilder.ts';

export interface HistoricalBacktestBar extends RawCandleInput {
  dataStatus?: DataStatus;
  spreadBps?: string;
  fundingRate8h?: string | null;
  openInterest?: string;
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
 * Computes Deflated Sharpe Ratio (Bailey & López de Prado, 2014) to penalize multiple testing and fat tails.
 * `null` when the observed Sharpe is undefined or there are fewer than 5 returns.
 */
function computeDeflatedSharpeRatioDec(
  observedSharpe: Dec | null,
  barReturns: readonly Dec[],
  numTrials = 10,
): Dec | null {
  if (observedSharpe === null || barReturns.length < 5) return null;
  const n = barReturns.length;
  const trials = Math.max(2, numTrials);
  // Expected maximum Sharpe under null hypothesis of N independent trials
  const eulerMascheroni = 0.5772156649;
  const z1 = Math.sqrt(2 * Math.log(trials));
  const z2 = Math.sqrt(2 * Math.log(trials / Math.E));
  const srBenchmark = (1 - eulerMascheroni) * z1 + eulerMascheroni * z2;
  const sr0 = srBenchmark / Math.sqrt(Math.max(1, n));

  const srNum = observedSharpe.toNumber() / Math.sqrt(365);
  const diff = (srNum - sr0) * Math.sqrt(Math.max(1, n - 1));
  const prob = normalCdf(diff);
  return floorSigned(dec(prob.toFixed(6)), 4);
}

/**
 * Estimates Probability of Backtest Overfitting (PBO) across 4 sub-period partitions
 * by comparing in-sample vs out-of-sample return rank consistency.
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
 * Signals at bar `t` close execute at bar `t + 1` open with realistic fees, orderbook slippage, 8h funding, and bar volume caps.
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

  const oiHistory: string[] = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]!;
    if (bar.openInterest) oiHistory.push(bar.openInterest);
    else oiHistory.push(toFixedStr(dec(bar.volume).mul(dec(bar.close))));

    if (i < warmup || i >= bars.length - 1) {
      continue;
    }

    const nextBar = bars[i + 1]!;
    const status: DataStatus = bar.dataStatus ?? 'LIVE';
    const spreadBps = dec(bar.spreadBps ?? '4.0');
    const mid = dec(bar.close);
    const halfSpread = mid.mul(spreadBps).div(20_000);
    const bestBid = mid.sub(halfSpread);
    const bestAsk = mid.add(halfSpread);

    // Construct synthetic or explicit L2 book at bar t close
    const barQuoteVol =
      bar.quoteVolume !== undefined ? dec(bar.quoteVolume) : dec(bar.volume).mul(mid);
    const levelQty = floorToStep(maxDec(stepSize.mul(10), barQuoteVol.mul('0.05').div(mid)), stepSize);
    const bids: SnapshotBookLevel[] = bar.bids ?? [
      { price: bestBid.toFixed(2), qty: levelQty.toFixed(stepSize.decimalPlaces()) },
      { price: bestBid.mul('0.998').toFixed(2), qty: levelQty.mul(2).toFixed(stepSize.decimalPlaces()) },
    ];
    const asks: SnapshotBookLevel[] = bar.asks ?? [
      { price: bestAsk.toFixed(2), qty: levelQty.toFixed(stepSize.decimalPlaces()) },
      { price: bestAsk.mul('1.002').toFixed(2), qty: levelQty.mul(2).toFixed(stepSize.decimalPlaces()) },
    ];

    const currentDd = maxDrawdownPctDec(equityCurve);

    // Run point-in-time analysis using ONLY closed bars [0..i]
    const report = await orchestrator.analyzeFromRawInput({
      symbol: input.symbol,
      interval: input.interval,
      asOfMs: bar.closeTime,
      spotDataStatus: status,
      futuresDataStatus: status,
      rules: input.rules,
      spot: {
        lastPrice: bar.close,
        bestBid: bestBid.toFixed(2),
        bestAsk: bestAsk.toFixed(2),
        priceChangePct24h:
          i >= 1
            ? dec(bar.close).sub(dec(bars[i - 1]!.close)).div(dec(bars[i - 1]!.close)).mul(100).toFixed(2)
            : '0.00',
        quoteVolume24h: toFixedStr(barQuoteVol),
        tickerUpdatedAtMs: bar.closeTime,
        bookUpdatedAtMs: bar.closeTime,
        bids,
        asks,
        recentTrades: [
          {
            id: `t-${i}-1`,
            price: bar.close,
            qty: floorToStep(maxDec(stepSize, dec(bar.volume).mul('0.6')), stepSize).toFixed(stepSize.decimalPlaces()),
            quoteQty: toFixedStr(barQuoteVol.mul('0.6')),
            isBuyerMaker: dec(bar.close).lt(dec(bar.open)),
            time: bar.closeTime - 1000,
          },
          {
            id: `t-${i}-2`,
            price: bar.close,
            qty: floorToStep(maxDec(stepSize, dec(bar.volume).mul('0.4')), stepSize).toFixed(stepSize.decimalPlaces()),
            quoteQty: toFixedStr(barQuoteVol.mul('0.4')),
            isBuyerMaker: dec(bar.close).gte(dec(bar.open)),
            time: bar.closeTime - 500,
          },
        ],
        candles: bars.slice(0, i + 1).map((b) => ({ ...b, closed: true })),
      },
      derivatives: {
        status,
        markPrice: bar.close,
        indexPrice: bar.close,
        lastFundingRate: bar.fundingRate8h ?? '0.000100',
        nextFundingTime: bar.closeTime + 8 * 3_600_000,
        openInterestSeries: oiHistory.slice(Math.max(0, i - 10), i + 1),
        updatedAtMs: bar.closeTime,
      },
      portfolio: {
        provided: true,
        equityUsdt: toFixedStr(equity),
        availableUsdt: toFixedStr(equity),
        currentDrawdownPct: currentDd.toFixed(4),
        dailyLossPct: '0.0000',
        weeklyLossPct: '0.0000',
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
    if (executedQty.gt(maxBarQty) && maxBarQty.gt(ZERO)) {
      executedQty = maxBarQty;
      liquidityCapped = true;
      liquidityCappedTrades++;
    }

    if (executedQty.lte(ZERO)) {
      barReturns.push(ZERO);
      equityCurve.push(equity);
      continue;
    }

    const entryNotional = executedQty.mul(nextOpen);
    const bookLevels = (side === 'LONG' ? asks : bids).map((l) => ({ price: dec(l.price), qty: dec(l.qty) }));
    const depthSlip = estimateDepthSlippageDec(
      side === 'LONG' ? 'BUY' : 'SELL',
      bookLevels,
      entryNotional,
      stepSize,
    );
    const slipBps = maxDec(spreadBps.div(2), depthSlip.slippageBps ?? spreadBps.div(2));

    // Apply entry + exit slippage (roundUp cost)
    const entrySlipCost = roundUp(entryNotional.mul(slipBps).div(10_000), AMOUNT_SCALE);
    const exitNotional = executedQty.mul(nextClose);
    const exitSlipCost = roundUp(exitNotional.mul(slipBps).div(10_000), AMOUNT_SCALE);
    const tradeSlippage = entrySlipCost.add(exitSlipCost);

    // Apply entry + exit fees (`roundUp` what the user pays)
    const entryFee = roundUp(entryNotional.mul(feeRate), AMOUNT_SCALE);
    const exitFee = roundUp(exitNotional.mul(feeRate), AMOUNT_SCALE);
    const tradeFees = entryFee.add(exitFee);

    // Apply perpetual funding payment (`fundingPayment` returns + received, - paid)
    const fundingRateDec = dec(nextBar.fundingRate8h ?? '0.0001');
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

  const wfEfficiency =
    walkForwardFolds.length > 0 && isSharpeSum !== null && oosSharpeSum !== null && isSharpeSum.abs().gt('0.01')
      ? oosSharpeSum.div(isSharpeSum)
      : null;

  // PASS needs both overfitting diagnostics to be defined; an inestimable PBO/DSR can never pass.
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
