import { describe, expect, it } from 'vitest';
import { CryptoMarketAnalysisReport, BacktestEvaluationSummary } from '@cex/contracts';
import { dec, toFixedStr } from '@cex/core';
import {
  buildCryptoMarketSnapshot,
  CryptoTradingAgentsOrchestrator,
  LlmProviderError,
  PointInTimeMemoryLog,
  ResilientLlmAdapter,
  runWalkForwardBacktest,
  type AnalysisLlmProvider,
  type BuildCryptoMarketSnapshotInput,
  type HistoricalBacktestBar,
} from './index.ts';

function createBaseSnapshotInput(overrides?: Partial<BuildCryptoMarketSnapshotInput>): BuildCryptoMarketSnapshotInput {
  const baseTime = Date.parse('2026-10-10T00:00:00.000Z');
  const candles = [];
  let price = dec('64000');

  for (let i = 0; i < 40; i++) {
    const delta = i % 6 === 0 ? dec('-90') : dec('160');
    const open = price;
    const close = price.add(delta);
    const high = (close.gt(open) ? close : open).add('110');
    const low = (close.lt(open) ? close : open).sub('80');
    const vol = dec('150');
    candles.push({
      openTime: baseTime + i * 3_600_000,
      closeTime: baseTime + (i + 1) * 3_600_000 - 1,
      open: open.toFixed(2),
      high: high.toFixed(2),
      low: low.toFixed(2),
      close: close.toFixed(2),
      volume: vol.toFixed(5),
      quoteVolume: toFixedStr(vol.mul(close)),
      closed: true,
    });
    price = close;
  }

  const asOfMs = candles[candles.length - 1]!.closeTime;
  const lastClose = candles[candles.length - 1]!.close;

  return {
    symbol: 'BTCUSDT',
    interval: '1h',
    asOfMs,
    spotDataStatus: 'LIVE',
    futuresDataStatus: 'LIVE',
    rules: {
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      tickSize: '0.01',
      stepSize: '0.00001',
      minQty: '0.00010',
      maxQty: '100.00000',
      minNotional: '10.00',
      feeRate: '0.0010',
    },
    spot: {
      lastPrice: lastClose,
      bestBid: dec(lastClose).sub('4').toFixed(2),
      bestAsk: dec(lastClose).add('4').toFixed(2),
      priceChangePct24h: '3.80',
      quoteVolume24h: '450000000.00',
      tickerUpdatedAtMs: asOfMs - 200,
      bookUpdatedAtMs: asOfMs - 150,
      bids: [
        { price: dec(lastClose).sub('4').toFixed(2), qty: '3.00000' },
        { price: dec(lastClose).sub('15').toFixed(2), qty: '8.00000' },
      ],
      asks: [
        { price: dec(lastClose).add('4').toFixed(2), qty: '2.50000' },
        { price: dec(lastClose).add('15').toFixed(2), qty: '6.00000' },
      ],
      recentTrades: [
        {
          id: 'tr-1',
          price: lastClose,
          qty: '1.80000',
          quoteQty: dec(lastClose).mul('1.8').toFixed(2),
          isBuyerMaker: false,
          time: asOfMs - 1000,
        },
        {
          id: 'tr-2',
          price: dec(lastClose).sub('4').toFixed(2),
          qty: '0.40000',
          quoteQty: dec(lastClose).sub('4').mul('0.4').toFixed(2),
          isBuyerMaker: true,
          time: asOfMs - 500,
        },
      ],
      candles,
    },
    derivatives: {
      status: 'LIVE',
      markPrice: dec(lastClose).add('6').toFixed(2),
      indexPrice: lastClose,
      lastFundingRate: '0.000100',
      nextFundingTime: asOfMs + 8 * 3_600_000,
      openInterestSeries: ['120000000', '122000000', '125000000', '128000000', '131000000', '135000000', '139000000', '144000000'],
      updatedAtMs: asOfMs - 300,
    },
    onChainAndMacro: {
      status: 'LIVE',
      observedAtMs: asOfMs - 500,
      marketCapUsd: '1300000000000',
      realizedCapUsd: '700000000000',
      dailyTxVolumeUsd: '60000000000',
      exchangeDepositsUsd: '350000000',
      exchangeWithdrawalsUsd: '620000000',
      smartBuysUsd: '88000000',
      smartSellsUsd: '31000000',
      circulatingSupply: '19750000',
      dailyVolumeTokens: '290000',
      btcTrendScore: '84',
      altBreadthScore: '72',
      btcDominanceScore: '76',
      perpFundingScore: '80',
      drawdownVolScore: '82',
      momentumThrustScore: '79',
      headlines: [
        {
          id: 'h-1',
          title: 'Institutional spot accumulation continues alongside rising open interest',
          source: 'MarketWire',
          publishedAt: new Date(asOfMs - 120_000).toISOString(),
          sentimentTilt: 'BULLISH',
        },
      ],
    },
    portfolio: {
      provided: true,
      equityUsdt: '100000.00000000',
      availableUsdt: '100000.00000000',
      currentDrawdownPct: '1.0000',
      dailyLossPct: '0.2000',
      weeklyLossPct: '0.5000',
      consecutiveLosses: 0,
      activePositions: [],
    },
    ...overrides,
  };
}

describe('Phase 5 Validation: Crypto-Native Multi-Agent Market Analysis Subsystem', () => {
  it('1. Orchestration & failure isolation: executes all 7 departments and isolates department crashes safely', async () => {
    const orchestrator = new CryptoTradingAgentsOrchestrator({ maxDebateRounds: 2 });
    const input = createBaseSnapshotInput();
    const report = await orchestrator.analyzeFromRawInput(input);

    expect(CryptoMarketAnalysisReport.safeParse(report).success).toBe(true);
    expect(report.departmentFindings.map((d) => d.department)).toEqual([
      'technical_quant',
      'order_flow_microstructure',
      'derivatives_positioning',
      'crypto_fundamentals_sentiment',
      'bull_bear_debate',
      'risk_execution_review',
      'final_synthesis',
    ]);
    expect(report.rating).toBe('BUY');
    expect(report.advisoryProposal.advisoryOnly).toBe(true);
    expect(report.advisoryProposal.liveExecutionEnabled).toBe(false);
    expect(dec(report.advisoryProposal.recommendedQuantity).gt(0)).toBe(true);

    // Non-core department failure (fundamentals throws) -> isolated as FAILED, pipeline still succeeds
    const nonCoreFailOrchestrator = new CryptoTradingAgentsOrchestrator({
      departmentOverrides: {
        crypto_fundamentals_sentiment: async () => {
          throw new Error('Simulated on-chain indexer crash');
        },
      },
    });
    const degradedReport = await nonCoreFailOrchestrator.analyzeFromRawInput(input);
    const fundDept = degradedReport.departmentFindings.find((d) => d.department === 'crypto_fundamentals_sentiment');
    expect(fundDept?.status).toBe('FAILED');
    expect(degradedReport.audit.degradedDepartments).toContain('crypto_fundamentals_sentiment');

    // Core department failure (order_flow_microstructure throws) -> blocks execution and routes rating to REVIEW
    const coreFailOrchestrator = new CryptoTradingAgentsOrchestrator({
      departmentOverrides: {
        order_flow_microstructure: async () => {
          throw new Error('OrderBook L2 stream corrupted');
        },
      },
    });
    const reviewReport = await coreFailOrchestrator.analyzeFromRawInput(input);
    expect(reviewReport.rating).toBe('REVIEW');
    expect(reviewReport.advisoryProposal.action).toBe('NO_TRADE');
    expect(reviewReport.advisoryProposal.recommendedQuantity).toBe('0.00000000');
  });

  it('2. Missing & stale market data: downgrades STALE/UNAVAILABLE feeds to REVIEW and never fabricates missing providers', async () => {
    const orchestrator = new CryptoTradingAgentsOrchestrator();

    // Case A: Explicit STALE spotDataStatus
    const staleReport = await orchestrator.analyzeFromRawInput(
      createBaseSnapshotInput({
        spotDataStatus: 'STALE',
        derivatives: null,
        onChainAndMacro: null,
      }),
    );
    expect(staleReport.rating).toBe('REVIEW');
    expect(staleReport.riskReview.approved).toBe(false);
    expect(staleReport.advisoryProposal.action).toBe('NO_TRADE');

    const derivFinding = staleReport.departmentFindings.find((d) => d.department === 'derivatives_positioning')!;
    const fundFinding = staleReport.departmentFindings.find((d) => d.department === 'crypto_fundamentals_sentiment')!;
    expect(derivFinding.status).toBe('UNAVAILABLE');
    expect(derivFinding.summary).toContain('DATA_UNAVAILABLE');
    expect(fundFinding.status).toBe('UNAVAILABLE');
    expect(fundFinding.summary).toContain('DATA_UNAVAILABLE');

    // Case B: Timestamp lag > maxAllowedStalenessMs (15s) automatically downgrades LIVE -> STALE
    const base = createBaseSnapshotInput();
    const laggedReport = await orchestrator.analyzeFromRawInput({
      ...base,
      spot: {
        ...base.spot,
        tickerUpdatedAtMs: base.asOfMs - 45_000, // 45s old > 15s threshold
      },
    });
    expect(laggedReport.rating).toBe('REVIEW');
    expect(laggedReport.riskReview.approved).toBe(false);
  });

  it('3. Timestamp alignment & look-ahead bias prevention: strips unclosed candles, future items, and future memory lessons', async () => {
    const base = createBaseSnapshotInput();
    const asOfMs = base.asOfMs;

    const withLookahead: BuildCryptoMarketSnapshotInput = {
      ...base,
      spot: {
        ...base.spot,
        candles: [
          ...base.spot.candles,
          // Unclosed in-progress candle with huge fake spike
          {
            openTime: asOfMs + 1,
            closeTime: asOfMs + 3_600_000,
            open: '69000.00',
            high: '999999.00',
            low: '69000.00',
            close: '888888.00',
            volume: '5000.00000',
            closed: false,
          },
          // Closed candle from the future (> asOfMs)
          {
            openTime: asOfMs + 3_600_001,
            closeTime: asOfMs + 7_200_000,
            open: '70000.00',
            high: '75000.00',
            low: '70000.00',
            close: '74000.00',
            volume: '1000.00000',
            closed: true,
          },
        ],
        recentTrades: [
          ...base.spot.recentTrades,
          {
            id: 'future-trade',
            price: '999999.00',
            qty: '50.00000',
            quoteQty: '49999950.00',
            isBuyerMaker: false,
            time: asOfMs + 60_000,
          },
        ],
      },
      onChainAndMacro: {
        ...base.onChainAndMacro!,
        headlines: [
          ...base.onChainAndMacro!.headlines!,
          {
            id: 'future-headline',
            title: 'Future announcement after asOf cutoff',
            source: 'FutureFeed',
            publishedAt: new Date(asOfMs + 300_000).toISOString(),
            sentimentTilt: 'BEARISH',
          },
        ],
      },
    };

    const { snapshot } = buildCryptoMarketSnapshot(withLookahead);
    expect(snapshot.timestampAlignment.unclosedCandlesFiltered).toBe(1);
    expect(snapshot.timestampAlignment.lookaheadItemsFiltered).toBe(3); // 1 future candle + 1 future trade + 1 future headline
    expect(snapshot.spot.closedCandles.every((c) => c.closed && c.closeTime <= asOfMs)).toBe(true);
    expect(snapshot.spot.recentTrades.every((t) => t.time <= asOfMs)).toBe(true);
    expect(snapshot.onChainAndMacro?.headlines.length).toBe(1);

    // PointInTimeMemoryLog look-ahead guard
    const mem = new PointInTimeMemoryLog();
    mem.recordDecision({
      episodeId: 'ep-past',
      symbol: 'BTCUSDT',
      decisionAtMs: asOfMs - 7_200_000,
      horizonHours: 1,
      rating: 'BUY',
      entryPrice: '65000.00',
    });
    mem.recordDecision({
      episodeId: 'ep-future',
      symbol: 'BTCUSDT',
      decisionAtMs: asOfMs - 1_800_000,
      horizonHours: 2, // settles at asOfMs + 5_400_000 (in the future!)
      rating: 'BUY',
      entryPrice: '66000.00',
    });
    mem.settleDueEpisodes({
      symbol: 'BTCUSDT',
      barCloseTimeMs: asOfMs + 7_200_000,
      closePrice: '67000.00',
    });

    // Querying as of asOfMs must NOT return ep-future because its settlement occurred after asOfMs
    const lessonsAtAsOf = mem.getSettledLessonsAsOf('BTCUSDT', asOfMs);
    expect(lessonsAtAsOf.length).toBe(0);
    const lessonsInFuture = mem.getSettledLessonsAsOf('BTCUSDT', asOfMs + 7_200_000);
    expect(lessonsInFuture.length).toBe(2);
  });

  it('4. Decimal, circuit-breaker, and liquidation-proximity risk gates veto unsafe trades', async () => {
    const orchestrator = new CryptoTradingAgentsOrchestrator();

    // Case A: Critical drawdown >= 15% triggers circuit breaker halt
    const base = createBaseSnapshotInput();
    const haltedReport = await orchestrator.analyzeFromRawInput({
      ...base,
      portfolio: {
        ...base.portfolio!,
        currentDrawdownPct: '16.5000',
      },
    });
    expect(haltedReport.riskReview.circuitBreakerStatus).toBe('CRITICAL');
    expect(haltedReport.riskReview.circuitBreakerMultiplier).toBe('0.00');
    expect(haltedReport.riskReview.approved).toBe(false);
    expect(haltedReport.rating).toBe('REVIEW');
    expect(haltedReport.advisoryProposal.recommendedQuantity).toBe('0.00000000');

    // Case B: Active futures position dangerously close to isolated liquidation price
    const lastPrice = base.spot.lastPrice!;
    const liqDangerReport = await orchestrator.analyzeFromRawInput({
      ...base,
      portfolio: {
        ...base.portfolio!,
        activePositions: [
          {
            symbol: 'BTCUSDT',
            marketType: 'FUTURES_PERP',
            side: 'LONG',
            qty: '1.00000',
            entryPrice: lastPrice,
            markPrice: lastPrice,
            marginUsdt: '400.00000000', // Tiny margin on ~68k notional -> already liquidatable / < 300 bps buffer
            maintenanceMarginRate: '0.0050',
            unrealizedPnlUsdt: '0.00000000',
          },
        ],
      },
    });
    expect(liqDangerReport.riskReview.approved).toBe(false);
    expect(liqDangerReport.riskFlags.some((f) => f.code === 'DERIV_LIQUIDATION_PROXIMITY')).toBe(true);
  });

  it('5. API errors, retries, rate limits, timeouts, and reconnects recover or fall back deterministically', async () => {
    let callCount = 0;
    let reconnected = false;

    const flakyProvider: AnalysisLlmProvider = {
      providerId: 'flaky-test-llm',
      async generateNarrative(req) {
        callCount++;
        if (callCount === 1) {
          throw new LlmProviderError('HTTP 429 Too Many Requests', 'RATE_LIMIT', {
            retryable: true,
            retryAfterMs: 1,
          });
        }
        if (callCount === 2) {
          throw new LlmProviderError('Socket ECONNRESET', 'DISCONNECTED', { retryable: true });
        }
        return { text: `Narrated: ${req.fallbackSummary}`, providerId: 'flaky-test-llm' };
      },
      async reconnect() {
        reconnected = true;
      },
    };

    const adapter = new ResilientLlmAdapter({
      primaryProvider: flakyProvider,
      maxRetries: 3,
      baseBackoffMs: 1,
      sleepFn: async () => {},
    });

    const res = await adapter.narrate({
      department: 'technical_quant',
      rolePrompt: 'Analyst',
      structuredContext: {},
      fallbackSummary: 'Fallback summary text',
    });

    expect(res.usedFallback).toBe(false);
    expect(res.attempts).toBe(3);
    expect(reconnected).toBe(true);
    const stats = adapter.getTelemetry();
    expect(stats.rateLimitHits).toBe(1);
    expect(stats.reconnectAttempts).toBe(1);
    expect(stats.reconnectSuccesses).toBe(1);

    // Exhausted retries -> automatic fallback to DeterministicQuantNarrator
    const alwaysFailingProvider: AnalysisLlmProvider = {
      providerId: 'down-llm',
      async generateNarrative() {
        throw new LlmProviderError('Gateway Timeout', 'TIMEOUT', { retryable: true });
      },
    };
    const fbAdapter = new ResilientLlmAdapter({
      primaryProvider: alwaysFailingProvider,
      maxRetries: 1,
      baseBackoffMs: 1,
      sleepFn: async () => {},
    });
    const fbRes = await fbAdapter.narrate({
      department: 'final_synthesis',
      rolePrompt: 'Head',
      structuredContext: {},
      fallbackSummary: 'Deterministic synthesis',
    });
    expect(fbRes.usedFallback).toBe(true);
    expect(fbRes.text).toBe('Deterministic synthesis');
    expect(fbAdapter.getTelemetry().fallbackActivations).toBe(1);
  });

  it('6. Reproducibility & auditability: identical point-in-time inputs produce identical hashes and runSignatures', async () => {
    const input = createBaseSnapshotInput();
    const orch1 = new CryptoTradingAgentsOrchestrator({ maxDebateRounds: 2 });
    const orch2 = new CryptoTradingAgentsOrchestrator({ maxDebateRounds: 2 });

    const rep1 = await orch1.analyzeFromRawInput(input);
    const rep2 = await orch2.analyzeFromRawInput(input);

    expect(rep1.audit.snapshotHash).toBe(rep2.audit.snapshotHash);
    expect(rep1.audit.portfolioFingerprint).toBe(rep2.audit.portfolioFingerprint);
    expect(rep1.audit.runSignature).toBe(rep2.audit.runSignature);
    expect(rep1.rating).toBe(rep2.rating);
    expect(rep1.advisoryProposal).toEqual(rep2.advisoryProposal);
  });

  it('7. Backtesting & walk-forward evaluation: deducts fees, slippage, and 8h funding, caps bar liquidity, and computes DSR/PBO', async () => {
    const baseTime = Date.parse('2026-10-01T00:00:00.000Z');
    const bars: HistoricalBacktestBar[] = [];
    let price = dec('60000');

    for (let i = 0; i < 42; i++) {
      const step = i % 5 === 0 ? dec('-80') : dec('210');
      const open = price;
      const close = price.add(step);
      const high = (close.gt(open) ? close : open).add('120');
      const low = (close.lt(open) ? close : open).sub('90');
      // Make bar 28 have constrained volume so liquidity participation cap is exercised
      const vol = i === 28 ? dec('0.25') : dec('180');
      bars.push({
        openTime: baseTime + i * 3_600_000,
        closeTime: baseTime + (i + 1) * 3_600_000 - 1,
        open: open.toFixed(2),
        high: high.toFixed(2),
        low: low.toFixed(2),
        close: close.toFixed(2),
        volume: vol.toFixed(5),
        quoteVolume: toFixedStr(vol.mul(close)),
        closed: true,
        // Make bar 30 STALE to verify stale bar skip
        dataStatus: i === 30 ? 'STALE' : 'LIVE',
        spreadBps: '4.0000',
        fundingRate8h: '0.000100',
        openInterest: dec('140000000').add(String(i * 1_500_000)).toFixed(2),
      });
      price = close;
    }

    const { summary, trades } = await runWalkForwardBacktest({
      symbol: 'BTCUSDT',
      interval: '1h',
      initialEquityUsdt: '100000.00000000',
      rules: {
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        tickSize: '0.01',
        stepSize: '0.00001',
        minQty: '0.00010',
        maxQty: '100.00000',
        minNotional: '10.00',
        feeRate: '0.0010',
      },
      bars,
      warmupBars: 20,
      maxVolumeParticipation: '0.05',
      walkForwardFoldCount: 2,
    });

    expect(BacktestEvaluationSummary.safeParse(summary).success).toBe(true);
    expect(summary.mode).toBe('HISTORICAL_SIMULATION');
    expect(summary.liveExecutionEnabled).toBe(false);
    expect(trades.length).toBeGreaterThan(0);
    expect(dec(summary.totalFeesPaidUsdt).gt(0)).toBe(true);
    expect(dec(summary.totalSlippageCostUsdt).gt(0)).toBe(true);
    expect(dec(summary.totalFundingPaidUsdt).gt(0)).toBe(true);
    expect(summary.liquidityCappedTrades).toBeGreaterThanOrEqual(1);
    expect(summary.staleOrHaltedSkips).toBeGreaterThanOrEqual(1);
    expect(summary.walkForwardFolds.length).toBe(2);
    expect(summary.profitabilityDisclaimer).toContain('never guarantee future live trading profitability');
  });

  it('8. Missing account and contract data stay null in the snapshot (no invented zeros or default rates)', async () => {
    const base = createBaseSnapshotInput();
    const input: BuildCryptoMarketSnapshotInput = { ...base, portfolio: { provided: false } };
    const { snapshot } = buildCryptoMarketSnapshot(input);

    expect(snapshot.portfolio.status).toBe('NOT_PROVIDED');
    expect(snapshot.portfolio.equityUsdt).toBeNull();
    expect(snapshot.portfolio.currentDrawdownPct).toBeNull();
    expect(snapshot.portfolio.consecutiveLosses).toBeNull();
    // The caller gave no contract parameters: no guessed 20x / 0.0050 / 0.0004.
    expect(snapshot.derivatives?.maxLeverage).toBeNull();
    expect(snapshot.derivatives?.maintenanceMarginRate).toBeNull();
    expect(snapshot.derivatives?.takerFeeRate).toBeNull();
    // nextFundingTime uses the same ISO type as FuturesMarkPrice.nextFundingTime.
    expect(snapshot.derivatives?.nextFundingTime).toBe(new Date(base.asOfMs + 8 * 3_600_000).toISOString());

    const report = await new CryptoTradingAgentsOrchestrator().analyzeFromRawInput(input);
    expect(report.audit.priorLessonsUsed).toBe(0);
    expect(report.riskReview.circuitBreakerStatus).toBe('NORMAL');
    const risk = report.departmentFindings.find((d) => d.department === 'risk_execution_review')!;
    expect(risk.missingData).toContain('portfolio.equityUsdt (using $10,000 reference baseline)');
    expect(risk.missingData).toContain('portfolio.currentDrawdownPct (not provided; circuit breaker cannot use it)');

    // An active futures position whose maintenance margin rate is unknown everywhere fails closed.
    const unknownMmr = await new CryptoTradingAgentsOrchestrator().analyzeFromRawInput({
      ...base,
      portfolio: {
        ...base.portfolio!,
        activePositions: [
          {
            symbol: 'BTCUSDT',
            marketType: 'FUTURES_PERP',
            side: 'LONG',
            qty: '0.10000',
            entryPrice: base.spot.lastPrice!,
            markPrice: base.spot.lastPrice!,
            marginUsdt: '5000.00000000',
            maintenanceMarginRate: null,
            unrealizedPnlUsdt: '0.00000000',
          },
        ],
      },
    });
    expect(unknownMmr.riskFlags.some((f) => f.code === 'DERIV_LIQUIDATION_BUFFER_UNKNOWN' && f.blocksExecution)).toBe(true);
    expect(unknownMmr.riskReview.approved).toBe(false);
  });

  it('9. Backtest ratios that are undefined for the sample are null, and an inestimable PBO/DSR cannot pass', async () => {
    const baseTime = Date.parse('2026-10-01T00:00:00.000Z');
    const bars: HistoricalBacktestBar[] = [];
    for (let i = 0; i < 25; i++) {
      bars.push({
        openTime: baseTime + i * 3_600_000,
        closeTime: baseTime + (i + 1) * 3_600_000 - 1,
        open: '60000.00',
        high: '60100.00',
        low: '59900.00',
        close: '60000.00',
        volume: '100.00000',
        closed: true,
        // Every decision bar is STALE -> no trade can be taken, every bar return is exactly 0.
        dataStatus: 'STALE',
      });
    }
    const { summary, trades } = await runWalkForwardBacktest({
      symbol: 'BTCUSDT',
      interval: '1h',
      initialEquityUsdt: '100000.00000000',
      rules: {
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        tickSize: '0.01',
        stepSize: '0.00001',
        minQty: '0.00010',
        maxQty: '100.00000',
        minNotional: '10.00',
        feeRate: '0.0010',
      },
      bars,
      warmupBars: 20,
    });

    // Decisions at bars 20..23 (the last bar has no next bar to fill on): 4 zero returns, 0 trades.
    expect(trades).toHaveLength(0);
    expect(summary.totalTrades).toBe(0);
    expect(summary.staleOrHaltedSkips).toBe(4);
    expect(summary.winRatePct).toBeNull(); // no trades
    expect(summary.profitFactor).toBeNull(); // no losing trade (was a capped 9.99 / 0 before)
    expect(summary.sharpeRatio).toBeNull(); // zero variance
    expect(summary.sortinoRatio).toBeNull(); // no downside
    expect(summary.calmarRatio).toBeNull(); // no drawdown
    expect(summary.deflatedSharpeRatio).toBeNull(); // < 5 returns
    expect(summary.probabilityOfBacktestOverfitting).toBeNull(); // < 8 returns (was a placeholder 0.5)
    expect(summary.walkForwardEfficiencyRatio).toBeNull(); // fold size floor(4/2) = 2 < 4 -> no folds
    expect(summary.walkForwardFolds).toHaveLength(0);
    expect(summary.maxDrawdownPct).toBe('0.0000'); // a real zero stays zero
    expect(summary.totalReturnPct).toBe('0.0000');
    // totalReturn 0 > -5 and drawdown 0 < 15, but PBO/DSR are null -> never PASS_RESEARCH_GATE.
    expect(summary.verdict).toBe('CAUTIOUS_INCONCLUSIVE');
  });
});
