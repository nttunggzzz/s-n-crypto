import { describe, expect, it } from 'vitest';
import {
  CryptoMarketAnalysisReport,
  BacktestEvaluationSummary,
  type CryptoMarketSnapshot,
  type DepartmentFinding,
} from '@cex/contracts';
import { dec, toFixedStr } from '@cex/core';
import { computeDeflatedSharpeRatioDec } from './backtester.ts';
import { runDerivativesPositioningAgent } from './departments/derivativesAgent.ts';
import { runOrderFlowMicrostructureAgent } from './departments/orderFlowAgent.ts';
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
      // Each bar opens 15 away from the previous close (alternating gap), so "fill at bar t close" and
      // "fill at bar t+1 open" are different prices and the entry-price assertion below can tell them apart.
      const open = price.add(i % 2 === 0 ? '15' : '-15');
      const close = open.add(step);
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
    // No look-ahead fill: a decision at bar i close fills at bar i+1 OPEN (and the 1-bar hold exits at bar i+1 close).
    for (const t of trades) {
      const fillBar = bars[t.entryBarIndex]!;
      expect(t.entryPrice).toBe(dec(fillBar.open).toFixed(2));
      expect(t.exitPrice).toBe(dec(fillBar.close).toFixed(2));
    }
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
    // No portfolio -> the portfolio circuit breakers are NOT_APPLICABLE, not a made-up NORMAL.
    expect(report.riskReview.circuitBreakerStatus).toBe('NOT_APPLICABLE');
    const risk = report.departmentFindings.find((d) => d.department === 'risk_execution_review')!;
    expect(risk.missingData).toContain(
      'portfolio (NOT_PROVIDED): sizing uses the $10,000 reference baseline; portfolio circuit breakers not applicable',
    );

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

  it('10. Deflated Sharpe is finite for 1, 2, 3 and 10 trials and never rises as the trial count grows', () => {
    // Observed annualized Sharpe 20 on n = 10 returns -> per-bar SR = 20 / sqrt(365) = 1.046848, sqrt(n - 1) = 3.
    // N = 1: SR0 = 0 -> z = 3.140544 -> Phi(z) = 0.999157 -> "0.9991".
    //   (Before the fix N = 1 and N = 2 both became trials = 2, sqrt(2 ln(2/e)) = NaN, Phi(NaN) = 0 -> a fake "0.0000".)
    // N = 10: SR0 = [(1 - g) Phi^-1(0.9) + g Phi^-1(1 - 1/(10e))] / sqrt(10)
    //       = (0.42278 * 1.28155 + 0.57722 * 1.7893) / 3.16228 = 0.4979 -> z = (1.046848 - 0.4979) * 3 = 1.6467 -> ~0.950
    const returns = Array.from({ length: 10 }, () => dec('0.01'));
    const values = [1, 2, 3, 10].map((n) => computeDeflatedSharpeRatioDec(dec('20'), returns, n));
    for (const v of values) {
      expect(v).not.toBeNull();
      expect(Number.isFinite(v!.toNumber())).toBe(true);
    }
    expect(values[0]!.toFixed(4)).toBe('0.9991');
    expect(values[3]!.gte('0.9495') && values[3]!.lte('0.9510')).toBe(true);
    for (let k = 1; k < values.length; k++) expect(values[k]!.lte(values[k - 1]!)).toBe(true);
    expect(values[3]!.lt(values[0]!)).toBe(true);
    // A non-positive trial count is rejected, not clamped to 2.
    expect(computeDeflatedSharpeRatioDec(dec('20'), returns, 0)).toBeNull();
  });

  it('11. Backtest bars without recorded derivatives / status / spread are passed as missing, never filled in', async () => {
    const baseTime = Date.parse('2026-10-01T00:00:00.000Z');
    const makeBars = (extra: Partial<HistoricalBacktestBar>): HistoricalBacktestBar[] => {
      const out: HistoricalBacktestBar[] = [];
      let price = dec('60000');
      for (let i = 0; i < 45; i++) {
        const step = i % 5 === 0 ? dec('-80') : dec('210');
        const close = price.add(step);
        out.push({
          openTime: baseTime + i * 3_600_000,
          closeTime: baseTime + (i + 1) * 3_600_000 - 1,
          open: price.toFixed(2),
          high: (close.gt(price) ? close : price).add('120').toFixed(2),
          low: (close.lt(price) ? close : price).sub('90').toFixed(2),
          close: close.toFixed(2),
          volume: '180.00000',
          quoteVolume: toFixedStr(dec('180').mul(close)),
          closed: true,
          ...extra,
        });
        price = close;
      }
      return out;
    };
    const run = async (bars: HistoricalBacktestBar[]) => {
      const seen: Array<{ snapshot: CryptoMarketSnapshot; finding: DepartmentFinding }> = [];
      const micro: DepartmentFinding[] = [];
      const orchestrator = new CryptoTradingAgentsOrchestrator({
        maxDebateRounds: 1,
        departmentOverrides: {
          derivatives_positioning: async (snapshot, llm) => {
            const finding = await runDerivativesPositioningAgent(snapshot, llm);
            seen.push({ snapshot, finding });
            return finding;
          },
          order_flow_microstructure: async (snapshot, llm) => {
            const finding = await runOrderFlowMicrostructureAgent(snapshot, llm);
            micro.push(finding);
            return finding;
          },
        },
      });
      const result = await runWalkForwardBacktest({
        symbol: 'BTCUSDT', interval: '1h', initialEquityUsdt: '100000.00000000', rules: BT_RULES, bars, warmupBars: 20, orchestrator,
      });
      return { ...result, seen, micro };
    };

    // A) LIVE bars with a spread but no funding / OI / mark: derivatives department abstains on every decision bar.
    const bars = makeBars({ dataStatus: 'LIVE', spreadBps: '4.0000' });
    const a = await run(bars);
    expect(a.seen).toHaveLength(24); // decisions at bars 20..43
    for (const { snapshot, finding } of a.seen) {
      expect(finding.stance).toBe('ABSTAIN');
      expect(finding.status).toBe('UNAVAILABLE');
      expect(snapshot.futuresDataStatus).toBe('UNAVAILABLE');
      expect(snapshot.derivatives).toMatchObject({
        markPrice: null, indexPrice: null, lastFundingRate: null, nextFundingTime: null, openInterestSeries: [],
      });
      expect(snapshot.spot.recentTrades).toEqual([]); // no candle-direction "trades"
      expect(snapshot.spot.orderBookSynthetic).toBe(true); // book from the bar spread is flagged
    }
    const at = (i: number) => a.seen.find((s) => s.snapshot.asOfMs === bars[i]!.closeTime)!.snapshot;
    // Bar 23 has no bar 24h earlier -> no 24h change (the old code reported the 1-bar change as 24h).
    expect(at(23).spot.priceChangePct24h).toBeNull();
    // Bar 24 vs bar 0: close0 = 60000 - 80 = 59920; close24 = 60000 + 5*(-80) + 20*210 = 63800;
    // (63800 - 59920) / 59920 * 100 = 6.47530.. -> "6.48" (half-up).
    expect(at(24).spot.priceChangePct24h).toBe('6.48');
    // 24h quote volume only for a complete 24-bar window: bar 20 has 21 bars -> null; bar 23 has bars 0..23.
    expect(at(20).spot.quoteVolume24h).toBeNull();
    const sum0to23 = bars.slice(0, 24).reduce((s, b) => s.add(b.quoteVolume!), dec('0'));
    expect(at(23).spot.quoteVolume24h).toBe(toFixedStr(sum0to23));
    // Evidence read from the synthetic book is INFERRED, never OBSERVED, and the department reports DEGRADED.
    expect(a.micro).toHaveLength(24);
    for (const f of a.micro) {
      const bookEvidence = f.evidence.filter((e) => e.metric === 'spreadBps' || e.metric === 'depthWithin2PctUsdt');
      expect(bookEvidence.length).toBeGreaterThan(0);
      expect(bookEvidence.every((e) => e.kind === 'INFERRED')).toBe(true);
      expect(f.status).toBe('DEGRADED');
    }

    // B) Bars without a recorded dataStatus are not assumed LIVE: no trade, every decision skipped.
    const b = await run(makeBars({ spreadBps: '4.0000' }));
    expect(b.trades).toHaveLength(0);
    expect(b.summary.staleOrHaltedSkips).toBe(24);

    // C) LIVE bars with neither a spread nor a recorded book: no book is invented -> core order-flow blocks, no trade.
    const c = await run(makeBars({ dataStatus: 'LIVE' }));
    expect(c.trades).toHaveLength(0);
    expect(c.summary.staleOrHaltedSkips).toBe(24);
    expect(c.seen.every((s) => s.snapshot.spot.bids.length === 0 && s.snapshot.spot.asks.length === 0)).toBe(true);
  });

  it('12. Risk review: a provided account with no equity is vetoed; a provided account without drawdown fails closed', async () => {
    const orchestrator = new CryptoTradingAgentsOrchestrator();
    const base = createBaseSnapshotInput();

    const zeroEquity = await orchestrator.analyzeFromRawInput({
      ...base,
      portfolio: { ...base.portfolio!, equityUsdt: '0.00000000', availableUsdt: '0.00000000' },
    });
    expect(zeroEquity.riskReview.approved).toBe(false);
    expect(zeroEquity.riskReview.vetoReasons.some((r) => r.includes('no positive equity'))).toBe(true);
    expect(zeroEquity.riskReview.sizingLadder).toBeNull(); // not sized on the $10,000 baseline
    expect(zeroEquity.advisoryProposal.recommendedQuantity).toBe('0.00000000');

    const { currentDrawdownPct: _dd, ...noDrawdown } = base.portfolio!;
    const missingDd = await orchestrator.analyzeFromRawInput({ ...base, portfolio: noDrawdown });
    expect(missingDd.riskReview.circuitBreakerStatus).toBe('CRITICAL');
    expect(missingDd.riskReview.circuitBreakerMultiplier).toBe('0.00');
    expect(missingDd.riskReview.approved).toBe(false);
    expect(missingDd.rating).toBe('REVIEW');
  });

  it('13. Derivatives: unavailable futures feed with an open position blocks; a missing index is not replaced by spot', async () => {
    const orchestrator = new CryptoTradingAgentsOrchestrator();
    const base = createBaseSnapshotInput();
    const position = {
      symbol: 'BTCUSDT',
      marketType: 'FUTURES_PERP' as const,
      side: 'LONG' as const,
      qty: '0.10000',
      entryPrice: base.spot.lastPrice!,
      markPrice: base.spot.lastPrice!,
      marginUsdt: '5000.00000000',
      maintenanceMarginRate: '0.0050',
      unrealizedPnlUsdt: '0.00000000',
    };
    const noFeed = await orchestrator.analyzeFromRawInput({
      ...base,
      derivatives: null,
      portfolio: { ...base.portfolio!, activePositions: [position] },
    });
    expect(noFeed.riskFlags.some((f) => f.code === 'DERIV_LIQUIDATION_BUFFER_UNKNOWN' && f.blocksExecution)).toBe(true);
    expect(noFeed.riskReview.approved).toBe(false);

    const noIndex = await orchestrator.analyzeFromRawInput({ ...base, derivatives: { ...base.derivatives!, indexPrice: null } });
    const deriv = noIndex.departmentFindings.find((d) => d.department === 'derivatives_positioning')!;
    expect(deriv.metrics.indexPrice).toBeNull();
    expect(deriv.metrics.basisBps).toBeNull(); // the old fallback computed a basis against the spot last price
    expect(deriv.missingData).toContain('derivatives.indexPrice (basis not computed)');
  });

  it('14. On-chain data without an observation time is withheld (cannot be checked against asOf)', async () => {
    const base = createBaseSnapshotInput();
    const input: BuildCryptoMarketSnapshotInput = { ...base, onChainAndMacro: { ...base.onChainAndMacro!, observedAtMs: null } };
    const { snapshot } = buildCryptoMarketSnapshot(input);
    expect(snapshot.onChainAndMacro?.status).toBe('UNAVAILABLE');
    expect(snapshot.onChainAndMacro?.marketCapUsd).toBeNull();
    expect(snapshot.onChainAndMacro?.headlines).toEqual([]);
    expect(snapshot.timestampAlignment.warnings.some((w) => w.includes('no observedAt'))).toBe(true);

    const report = await new CryptoTradingAgentsOrchestrator().analyzeFromRawInput(input);
    const fund = report.departmentFindings.find((d) => d.department === 'crypto_fundamentals_sentiment')!;
    expect(fund.stance).toBe('ABSTAIN');
  });

  it('15. Backtest: a next bar too thin for one step fills nothing; WFE is null when the in-sample Sharpe sum is <= 0', async () => {
    const baseTime = Date.parse('2026-10-01T00:00:00.000Z');

    // A) Every bar trades 0.0001 BTC: max fill = floor(0.0001 * close * 0.05 / open, 0.00001) = floor(~0.000005) = 0.
    //    The recorded book is deep, so the analysis still proposes trades; none may fill (the old code filled in full).
    const thin: HistoricalBacktestBar[] = [];
    let price = dec('60000');
    for (let i = 0; i < 42; i++) {
      const step = i % 5 === 0 ? dec('-80') : dec('210');
      const close = price.add(step);
      thin.push({
        openTime: baseTime + i * 3_600_000,
        closeTime: baseTime + (i + 1) * 3_600_000 - 1,
        open: price.toFixed(2),
        high: (close.gt(price) ? close : price).add('120').toFixed(2),
        low: (close.lt(price) ? close : price).sub('90').toFixed(2),
        close: close.toFixed(2),
        volume: '0.00010',
        quoteVolume: toFixedStr(dec('0.0001').mul(close)),
        closed: true,
        dataStatus: 'LIVE',
        fundingRate8h: '0.000100',
        bids: [{ price: close.sub('1').toFixed(2), qty: '50.00000' }, { price: close.sub('10').toFixed(2), qty: '100.00000' }],
        asks: [{ price: close.add('1').toFixed(2), qty: '50.00000' }, { price: close.add('10').toFixed(2), qty: '100.00000' }],
      });
      price = close;
    }
    const thinRun = await runWalkForwardBacktest({
      symbol: 'BTCUSDT', interval: '1h', initialEquityUsdt: '100000.00000000', rules: BT_RULES, bars: thin, warmupBars: 20,
    });
    expect(thinRun.summary.liquidityCappedTrades).toBeGreaterThanOrEqual(1); // proposals happened ...
    expect(thinRun.trades).toHaveLength(0); // ... and none filled
    expect(thinRun.summary.totalFeesPaidUsdt).toBe('0.00000000');

    // B) The cli.ts sample series loses in-sample in both folds: WFE = sum(OOS) / sum(IS) of two negatives would look
    //    "good" (positive), so it must be null.
    const sample: HistoricalBacktestBar[] = [];
    price = dec('64000');
    for (let i = 0; i < 45; i++) {
      const step = i % 5 === 0 ? dec('-120') : dec('185');
      const close = price.add(step);
      const vol = dec('180').add(String((i % 7) * 15));
      sample.push({
        openTime: baseTime + i * 3_600_000,
        closeTime: baseTime + (i + 1) * 3_600_000 - 1,
        open: price.toFixed(2),
        high: (close.gt(price) ? close : price).add('140').toFixed(2),
        low: (close.lt(price) ? close : price).sub('110').toFixed(2),
        close: close.toFixed(2),
        volume: vol.toFixed(5),
        quoteVolume: toFixedStr(vol.mul(close)),
        closed: true,
        dataStatus: 'LIVE',
        spreadBps: '3.2000',
        fundingRate8h: '0.000100',
      });
      price = close;
    }
    const wf = await runWalkForwardBacktest({
      symbol: 'BTCUSDT', interval: '1h', initialEquityUsdt: '100000.00000000', rules: BT_RULES, bars: sample, warmupBars: 20, walkForwardFoldCount: 2,
    });
    expect(wf.summary.walkForwardFolds).toHaveLength(2);
    const isSum = wf.summary.walkForwardFolds.reduce((s, f) => s.add(f.inSampleSharpe!), dec('0'));
    expect(isSum.lte(0)).toBe(true); // the case under test really occurs
    expect(wf.summary.walkForwardEfficiencyRatio).toBeNull();
  });
});

const BT_RULES = {
  symbol: 'BTCUSDT',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  tickSize: '0.01',
  stepSize: '0.00001',
  minQty: '0.00010',
  maxQty: '100.00000',
  minNotional: '10.00',
  feeRate: '0.0010',
};
