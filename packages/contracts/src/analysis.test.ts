import { describe, expect, it } from 'vitest';
import {
  AdvisoryTradeProposal,
  BacktestEvaluationSummary,
  CryptoMarketAnalysisReport,
  CryptoMarketSnapshot,
  DepartmentFinding,
  EvidenceItem,
  SnapshotCandle,
} from './analysis.ts';

describe('@cex/contracts analysis schemas', () => {
  it('validates SnapshotCandle requires closed: true and decimal strings', () => {
    const valid = SnapshotCandle.safeParse({
      openTime: 1_700_000_000_000,
      closeTime: 1_700_003_599_999,
      open: '65000.00',
      high: '65250.50',
      low: '64800.00',
      close: '65100.25',
      volume: '142.34500',
      quoteVolume: '9252425.12000000',
      closed: true,
    });
    expect(valid.success).toBe(true);

    const unclosed = SnapshotCandle.safeParse({
      openTime: 1_700_000_000_000,
      closeTime: 1_700_003_599_999,
      open: '65000.00',
      high: '65250.50',
      low: '64800.00',
      close: '65100.25',
      volume: '142.34500',
      quoteVolume: '9252425.12000000',
      closed: false,
    });
    expect(unclosed.success).toBe(false);
  });

  it('distinguishes OBSERVED vs INFERRED evidence items and enforces DecimalString on DepartmentFinding', () => {
    const ev = EvidenceItem.parse({
      id: 'ev-rsi-14',
      kind: 'OBSERVED',
      department: 'technical_quant',
      metric: 'rsi14',
      value: '62.45',
      source: 'closedCandles:1h',
      observedAt: '2026-10-12T12:00:00.000Z',
      dataStatus: 'LIVE',
      note: 'Computed from 35 closed 1h candles',
    });
    expect(ev.kind).toBe('OBSERVED');

    const finding = DepartmentFinding.parse({
      department: 'technical_quant',
      status: 'OK',
      stance: 'BULLISH',
      score: '45.50',
      confidence: '0.78',
      summary: 'Bullish momentum above EMA20 with moderate RSI.',
      metrics: { rsi14: '62.45', atr14: '480.12000000' },
      evidence: [ev],
      riskFlags: [],
      missingData: [],
      durationMs: 4,
    });
    expect(finding.department).toBe('technical_quant');

    // Reject float/scientific notation in score
    expect(
      DepartmentFinding.safeParse({
        ...finding,
        score: '1.2e-5',
      }).success,
    ).toBe(false);
  });

  it('enforces advisoryOnly: true and liveExecutionEnabled: false on AdvisoryTradeProposal and BacktestEvaluationSummary', () => {
    const validProposal = AdvisoryTradeProposal.safeParse({
      advisoryOnly: true,
      liveExecutionEnabled: false,
      marketType: 'SPOT',
      action: 'LONG',
      side: 'BUY',
      entryPrice: '65000.00',
      stopLossPrice: '63700.00',
      takeProfitPrice: '68000.00',
      recommendedQuantity: '0.15000',
      recommendedNotionalUsdt: '9750.00000000',
      maxLeverage: '1.00',
    });
    expect(validProposal.success).toBe(true);

    const liveEnabledAttempt = AdvisoryTradeProposal.safeParse({
      advisoryOnly: true,
      liveExecutionEnabled: true,
      marketType: 'SPOT',
      action: 'LONG',
      side: 'BUY',
      entryPrice: '65000.00',
      stopLossPrice: '63700.00',
      takeProfitPrice: '68000.00',
      recommendedQuantity: '0.15000',
      recommendedNotionalUsdt: '9750.00000000',
      maxLeverage: '1.00',
    });
    expect(liveEnabledAttempt.success).toBe(false);

    const backtestSummary = BacktestEvaluationSummary.safeParse({
      symbol: 'BTCUSDT',
      interval: '1h',
      mode: 'HISTORICAL_SIMULATION',
      liveExecutionEnabled: false,
      initialEquityUsdt: '100000.00000000',
      finalEquityUsdt: '104250.00000000',
      totalReturnPct: '4.2500',
      benchmarkBuyHoldReturnPct: '3.1000',
      excessReturnPct: '1.1500',
      maxDrawdownPct: '2.8500',
      sharpeRatio: '1.4200',
      sortinoRatio: '1.9500',
      calmarRatio: '1.4912',
      deflatedSharpeRatio: '1.1800',
      probabilityOfBacktestOverfitting: '0.1250',
      winRatePct: '56.2500',
      profitFactor: '1.4800',
      totalTrades: 16,
      turnoverMultiple: '2.4000',
      totalFeesPaidUsdt: '240.00000000',
      totalSlippageCostUsdt: '85.50000000',
      totalFundingPaidUsdt: '32.10000000',
      liquidityCappedTrades: 2,
      staleOrHaltedSkips: 1,
      walkForwardEfficiencyRatio: '0.7800',
      walkForwardFolds: [],
      verdict: 'PASS_RESEARCH_GATE',
      profitabilityDisclaimer:
        'Historical simulation with fees, slippage, and funding does not guarantee future live profitability.',
    });
    expect(backtestSummary.success).toBe(true);
  });

  it('validates complete CryptoMarketSnapshot and CryptoMarketAnalysisReport', () => {
    const snap = CryptoMarketSnapshot.parse({
      snapshotId: 'snap-btc-1',
      symbol: 'BTCUSDT',
      interval: '1h',
      asOf: '2026-10-12T12:00:00.000Z',
      asOfMs: 1_791_806_400_000,
      spotDataStatus: 'LIVE',
      futuresDataStatus: 'LIVE',
      spotTradeBlock: null,
      futuresTradeBlock: null,
      rules: {
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        tickSize: '0.01',
        stepSize: '0.00001',
        minQty: '0.00010',
        maxQty: '100.00000',
        minNotional: '10.00',
        feeRate: '0.001',
      },
      spot: {
        lastPrice: '65000.00',
        bestBid: '64995.00',
        bestAsk: '65005.00',
        priceChangePct24h: '2.50',
        quoteVolume24h: '500000000.00',
        tickerUpdatedAt: '2026-10-12T12:00:00.000Z',
        bookUpdatedAt: '2026-10-12T12:00:00.000Z',
        bids: [{ price: '64995.00', qty: '1.50000' }],
        asks: [{ price: '65005.00', qty: '1.25000' }],
        recentTrades: [],
        closedCandles: [],
      },
      derivatives: null,
      onChainAndMacro: null,
      portfolio: {
        status: 'FLAT',
        equityUsdt: '100000.00000000',
        availableUsdt: '100000.00000000',
        currentDrawdownPct: '0.0000',
        dailyLossPct: '0.0000',
        weeklyLossPct: '0.0000',
        consecutiveLosses: 0,
        activePositions: [],
        fingerprint: '0123456789abcdef0123456789abcdef',
      },
      timestampAlignment: {
        aligned: true,
        asOf: '2026-10-12T12:00:00.000Z',
        asOfMs: 1_791_806_400_000,
        maxAllowedStalenessMs: 15_000,
        observedMaxLagMs: 120,
        unclosedCandlesFiltered: 1,
        lookaheadItemsFiltered: 0,
        warnings: [],
      },
    });
    expect(snap.symbol).toBe('BTCUSDT');

    const report = CryptoMarketAnalysisReport.parse({
      reportId: 'rep-btc-1',
      symbol: 'BTCUSDT',
      interval: '1h',
      asOf: '2026-10-12T12:00:00.000Z',
      rating: 'REVIEW',
      confidence: '0.00',
      uncertaintyScore: '1.00',
      uncertaintyReasons: ['Insufficient closed candles for technical indicators'],
      executiveSummary: 'Data insufficient -> REVIEW.',
      departmentFindings: [],
      debate: {
        status: 'DEGRADED',
        rounds: [],
        bullThesis: 'DATA_UNAVAILABLE',
        bearThesis: 'DATA_UNAVAILABLE',
        independentChallenge: 'Insufficient data to validate bull or bear thesis.',
        unresolvedRisks: ['No closed candles'],
        consensusTilt: 'INCONCLUSIVE',
        debateConvictionScore: '0.00',
      },
      riskReview: {
        approved: false,
        vetoReasons: ['Insufficient closed candles'],
        aggressiveView: 'Abstain due to missing bars.',
        conservativeView: 'Veto execution until candle feed populates.',
        neutralSynthesis: 'Hold flat.',
        circuitBreakerStatus: 'NORMAL',
        circuitBreakerMultiplier: '1.00',
        estimatedSlippageBps: null,
        liquidationBufferBps: null,
        sizingLadder: null,
      },
      invalidationConditions: [],
      advisoryProposal: {
        advisoryOnly: true,
        liveExecutionEnabled: false,
        marketType: 'NONE',
        action: 'NO_TRADE',
        side: null,
        entryPrice: null,
        stopLossPrice: null,
        takeProfitPrice: null,
        recommendedQuantity: '0.00000000',
        recommendedNotionalUsdt: '0.00000000',
        maxLeverage: '1.00',
      },
      evidence: [],
      riskFlags: [],
      audit: {
        upstreamRepo: 'https://github.com/TauricResearch/TradingAgents',
        upstreamCommit: '1394a3f72aa4393e1a98f51b382434c4b4c2d972',
        upstreamVersion: 'v0.6.0',
        subsystemVersion: '1.0.0',
        llmProvider: 'deterministic-quant-narrator',
        deterministicMathEngine: '@cex/core/Dec',
        portfolioFingerprint: '0123456789abcdef0123456789abcdef',
        snapshotHash: 'abcdef0123456789abcdef0123456789',
        runSignature: 'fedcba9876543210fedcba9876543210',
        degradedDepartments: [],
        PriorLessonsUsed: 0,
        totalDurationMs: 5,
      },
    });
    expect(report.rating).toBe('REVIEW');
  });
});
