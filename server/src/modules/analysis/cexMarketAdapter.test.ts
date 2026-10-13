import { describe, expect, it } from 'vitest';
import { dec, stepDecimals } from '@cex/core';
import type { Candle, CandleInterval, FuturesSymbolInfo } from '@cex/contracts';
import type { Db } from '../../db/client.ts';
import type { ExchangeConfig, LoadedSymbol, SymbolRow } from '../exchange/exchangeConfig.ts';
import type { FuturesConfig, LoadedContract, FuturesSymbolRow } from '../futures/config.ts';
import { FuturesMarkService } from '../futures/markData.ts';
import { CandleService } from '../market/candleService.ts';
import { DepthSnapshots } from '../market/depthSnapshots.ts';
import { MarketDataService } from '../market/marketData.ts';
import { SimFeed, simSpecs } from '../market/sim/feed.ts';
import { CexMarketDataAdapter } from './cexMarketAdapter.ts';
import { CryptoTradingAgentsOrchestrator } from './orchestrator.ts';

function makeLoadedSpotSymbol(params: {
  symbol: string;
  baseAsset: string;
  quoteAsset?: string;
  tickSize?: string;
  stepSize?: string;
  minQty?: string;
  maxQty?: string;
  minNotional?: string;
  enabled?: boolean;
}): LoadedSymbol {
  const quoteAsset = params.quoteAsset ?? 'USDT';
  const tickSize = params.tickSize ?? '0.01000000';
  const stepSize = params.stepSize ?? '0.00010000';
  const minQty = params.minQty ?? '0.00010000';
  const maxQty = params.maxQty ?? '1000.00000000';
  const minNotional = params.minNotional ?? '10.00000000';
  const row: SymbolRow = {
    symbol: params.symbol,
    baseAsset: params.baseAsset,
    quoteAsset,
    tickSize,
    stepSize,
    minQty,
    maxQty,
    minNotional,
    enabled: params.enabled ?? true,
    sourceStatus: 'TRADING',
    sortOrder: 0,
    updatedAt: new Date('2026-04-01T00:00:00.000Z'),
  };
  return {
    row,
    rules: {
      symbol: row.symbol,
      baseAsset: row.baseAsset,
      quoteAsset: row.quoteAsset,
      tickSize: row.tickSize,
      stepSize: row.stepSize,
      minQty: row.minQty,
      maxQty: row.maxQty,
      minNotional: row.minNotional,
    },
    tick: dec(row.tickSize),
    step: dec(row.stepSize),
  };
}

function makeLoadedFuturesContract(params: {
  symbol: string;
  baseAsset: string;
  underlyingAsset: string;
  multiplier?: number;
  tickSize?: string;
  stepSize?: string;
  maxLeverage?: number;
  maintenanceMarginRate?: string;
  enabled?: boolean;
}): LoadedContract {
  const tickSize = params.tickSize ?? '0.10000000';
  const stepSize = params.stepSize ?? '0.00100000';
  const minQty = '0.00100000';
  const maxQty = '1000.00000000';
  const minNotional = '5.00000000';
  const mmr = params.maintenanceMarginRate ?? '0.00400000';
  const row: FuturesSymbolRow = {
    symbol: params.symbol,
    baseAsset: params.baseAsset,
    quoteAsset: 'USDT',
    underlyingAsset: params.underlyingAsset,
    multiplier: params.multiplier ?? 1,
    tickSize,
    stepSize,
    minQty,
    maxQty,
    minNotional,
    maxLeverage: params.maxLeverage ?? 20,
    maintenanceMarginRate: mmr,
    enabled: params.enabled ?? true,
    sourceStatus: 'TRADING',
    sortOrder: 0,
    updatedAt: new Date('2026-04-01T00:00:00.000Z'),
  };
  return {
    row,
    rules: {
      symbol: row.symbol,
      baseAsset: row.baseAsset,
      quoteAsset: row.quoteAsset,
      tickSize: row.tickSize,
      stepSize: row.stepSize,
      minQty: row.minQty,
      maxQty: row.maxQty,
      minNotional: row.minNotional,
    },
    tick: dec(row.tickSize),
    step: dec(row.stepSize),
    mmr: dec(row.maintenanceMarginRate),
  };
}

function createTestHarness(opts?: {
  nowMs?: number;
  staleThresholdMs?: number;
  tradingHalted?: boolean;
  disabledSpotSymbols?: string[];
  disabledFuturesSymbols?: string[];
}) {
  let clockMs = opts?.nowMs ?? Date.parse('2026-04-10T12:00:00.000Z');
  const staleThresholdMs = opts?.staleThresholdMs ?? 15_000;
  let tradingHalted = opts?.tradingHalted ?? false;
  const disabledSpot = new Set(opts?.disabledSpotSymbols ?? []);
  const disabledFutures = new Set(opts?.disabledFuturesSymbols ?? []);

  const spotSymbols: LoadedSymbol[] = [
    makeLoadedSpotSymbol({
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      tickSize: '0.01000000',
      stepSize: '0.00010000',
      enabled: !disabledSpot.has('BTCUSDT'),
    }),
    makeLoadedSpotSymbol({
      symbol: 'ETHUSDT',
      baseAsset: 'ETH',
      tickSize: '0.01000000',
      stepSize: '0.00100000',
      enabled: !disabledSpot.has('ETHUSDT'),
    }),
    makeLoadedSpotSymbol({
      symbol: 'PEPEUSDT',
      baseAsset: 'PEPE',
      tickSize: '0.00000001',
      stepSize: '1.00000000',
      minQty: '1000.00000000',
      maxQty: '1000000000.00000000',
      enabled: !disabledSpot.has('PEPEUSDT'),
    }),
  ];

  const futuresContracts: LoadedContract[] = [
    makeLoadedFuturesContract({
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      underlyingAsset: 'BTC',
      multiplier: 1,
      tickSize: '0.10000000',
      stepSize: '0.00100000',
      maxLeverage: 20,
      maintenanceMarginRate: '0.00400000',
      enabled: !disabledFutures.has('BTCUSDT'),
    }),
    makeLoadedFuturesContract({
      symbol: 'ETHUSDT',
      baseAsset: 'ETH',
      underlyingAsset: 'ETH',
      multiplier: 1,
      tickSize: '0.01000000',
      stepSize: '0.01000000',
      maxLeverage: 20,
      maintenanceMarginRate: '0.00400000',
      enabled: !disabledFutures.has('ETHUSDT'),
    }),
    makeLoadedFuturesContract({
      symbol: '1000PEPEUSDT',
      baseAsset: '1000PEPE',
      underlyingAsset: 'PEPE',
      multiplier: 1000,
      tickSize: '0.00001000',
      stepSize: '1.00000000',
      maxLeverage: 10,
      maintenanceMarginRate: '0.00500000',
      enabled: !disabledFutures.has('1000PEPEUSDT'),
    }),
  ];

  const exchangeConfig = {
    allSymbols: () => spotSymbols,
    findSymbol: (sym: string) => spotSymbols.find((s) => s.row.symbol === sym),
    get feeRate() {
      return dec('0.0010');
    },
    get makerFeeRate() {
      return dec('0.0010');
    },
    get tradingHalted() {
      return tradingHalted;
    },
    setTradingHalted(val: boolean) {
      tradingHalted = val;
    },
    settings: {
      staleThresholdMs,
      futuresMakerFee: '0.0002',
      futuresTakerFee: '0.0004',
      futuresLiquidationFee: '0.0050',
    },
    exchangeStatus: () => ({
      tradingHalted,
      disabledSymbols: spotSymbols.filter((s) => !s.row.enabled).map((s) => s.row.symbol),
      updatedAt: new Date(clockMs).toISOString(),
    }),
  } as unknown as ExchangeConfig & { setTradingHalted: (val: boolean) => void };

  const futuresConfig = {
    all: () => futuresContracts,
    find: (sym: string) => futuresContracts.find((c) => c.row.symbol === sym),
    fees: {
      maker: dec('0.0002'),
      taker: dec('0.0004'),
      liquidation: dec('0.0050'),
    },
    toInfo: (c: LoadedContract): FuturesSymbolInfo => ({
      symbol: c.row.symbol,
      baseAsset: c.row.baseAsset,
      quoteAsset: 'USDT',
      underlyingAsset: c.row.underlyingAsset,
      multiplier: c.row.multiplier,
      tickSize: c.tick.toFixed(),
      stepSize: c.step.toFixed(),
      minQty: dec(c.row.minQty).toFixed(),
      maxQty: dec(c.row.maxQty).toFixed(),
      minNotional: dec(c.row.minNotional).toFixed(),
      pricePrecision: stepDecimals(c.row.tickSize),
      quantityPrecision: stepDecimals(c.row.stepSize),
      maxLeverage: c.row.maxLeverage,
      maintenanceMarginRate: c.mmr.toFixed(),
      enabled: c.row.enabled,
    }),
  } as unknown as FuturesConfig;

  const market = new MarketDataService(
    spotSymbols.map((s) => s.row.symbol),
    () => staleThresholdMs,
    () => clockMs,
  );
  market.setConnection('CONNECTED');

  const futuresMarket = new MarketDataService(
    futuresContracts.map((c) => c.row.symbol),
    () => staleThresholdMs,
    () => clockMs,
  );
  futuresMarket.setConnection('CONNECTED');

  const marks = new FuturesMarkService(
    () => staleThresholdMs,
    () => clockMs,
  );

  const candleSeriesBySymbol = new Map<string, Candle[]>();
  let candleFetchCount = 0;

  const candles = new CandleService({} as Db, null, {
    storedFallback: false,
    history: (symbol: string, _interval: CandleInterval, limit: number, endTime?: number) => {
      candleFetchCount++;
      const all = candleSeriesBySymbol.get(symbol) ?? [];
      const filtered = endTime !== undefined ? all.filter((c) => c.openTime <= endTime) : all;
      return filtered.slice(-limit);
    },
  });

  return {
    getClockMs: () => clockMs,
    setClockMs: (ms: number) => {
      clockMs = ms;
    },
    getCandleFetchCount: () => candleFetchCount,
    setCandles: (symbol: string, list: Candle[]) => {
      candleSeriesBySymbol.set(symbol, list);
    },
    exchangeConfig,
    futuresConfig,
    market,
    futuresMarket,
    marks,
    candles,
  };
}

function buildClosedCandleFixtures(params: {
  count: number;
  endCloseTimeMs: number;
  intervalMs?: number;
  startPrice?: number;
  stepPrice?: number;
  includeFormingLast?: boolean;
}): Candle[] {
  const intervalMs = params.intervalMs ?? 3_600_000;
  const startPrice = params.startPrice ?? 64_000;
  const stepPrice = params.stepPrice ?? 25;
  const result: Candle[] = [];
  for (let i = 0; i < params.count; i++) {
    const closeTime = params.endCloseTimeMs - (params.count - 1 - i) * intervalMs;
    const openTime = closeTime - intervalMs + 1;
    const base = startPrice + i * stepPrice;
    const vol = 12.5 + (i % 5);
    const isLast = i === params.count - 1;
    result.push({
      openTime,
      closeTime,
      open: base.toFixed(2),
      high: (base + 45).toFixed(2),
      low: (base - 20).toFixed(2),
      close: (base + 20).toFixed(2),
      volume: vol.toFixed(4),
      quoteVolume: ((base + 20) * vol).toFixed(2),
      closed: params.includeFormingLast && isLast ? false : true,
    });
  }
  return result;
}

describe('CexMarketDataAdapter — Real CEX Service Integration & Safety', () => {
  it('constructs a valid snapshot from representative real service outputs (BTCUSDT & ETHUSDT) and runs all 7 departments', async () => {
    const h = createTestHarness();
    const nowMs = h.getClockMs();

    // Populate 60 closed 1h candles + 1 forming candle (as returned by Binance /api/v3/klines)
    const btcCandles = buildClosedCandleFixtures({
      count: 61,
      endCloseTimeMs: nowMs + 1_800_000,
      includeFormingLast: true,
    });
    h.setCandles('BTCUSDT', btcCandles);

    // Populate Spot depth, ticker, and public trades
    h.market.ingestDepth(
      'BTCUSDT',
      [
        ['65500.00', '1.2500'],
        ['65495.50', '2.5000'],
        ['65490.00', '4.0000'],
      ],
      [
        ['65501.00', '0.8500'],
        ['65505.00', '1.7500'],
        ['65510.00', '3.2000'],
      ],
      nowMs - 1_200,
    );
    h.market.ingestTicker('BTCUSDT', {
      lastPrice: '65500.50',
      openPrice: '64100.00',
      highPrice: '65800.00',
      lowPrice: '63950.00',
      priceChange: '1400.50',
      priceChangePercent: '2.184',
      volume: '14250.1250',
      quoteVolume: '921500000.00',
      bestBid: '65500.00',
      bestAsk: '65501.00',
      eventTime: nowMs - 800,
    });
    h.market.ingestTrade('BTCUSDT', {
      id: 9001,
      price: '65500.00',
      qty: '0.2500',
      time: nowMs - 2_000,
      isBuyerMaker: false,
    });
    h.market.ingestTrade('BTCUSDT', {
      id: 9002,
      price: '65500.50',
      qty: '0.4000',
      time: nowMs - 900,
      isBuyerMaker: false,
    });

    // Populate Futures markPrice@1s
    h.marks.ingest(
      'BTCUSDT',
      {
        markPrice: '65508.20',
        indexPrice: '65500.40',
        fundingRate: '0.00010000',
        nextFundingTime: nowMs + 7_200_000,
        eventTime: nowMs - 600,
      },
      nowMs - 600,
    );

    const adapter = new CexMarketDataAdapter(
      {
        exchangeConfig: h.exchangeConfig,
        market: h.market,
        candles: h.candles,
        futures: {
          config: h.futuresConfig,
          market: h.futuresMarket,
          marks: h.marks,
        },
        now: h.getClockMs,
      },
      { allowedSymbols: ['BTCUSDT', 'ETHUSDT'] },
    );

    const orchestrator = new CryptoTradingAgentsOrchestrator();
    const { captured, report } = await adapter.analyzeSymbol('BTCUSDT', orchestrator, {
      interval: '1h',
      asOfMs: nowMs,
    });

    expect(captured.snapshot.symbol).toBe('BTCUSDT');
    expect(captured.snapshot.spotDataStatus).toBe('LIVE');
    expect(captured.snapshot.futuresDataStatus).toBe('LIVE');
    expect(captured.snapshot.spotTradeBlock).toBeNull();
    expect(captured.snapshot.futuresTradeBlock).toBeNull();

    // Forming candle was automatically stripped; 60 closed candles retained
    expect(captured.snapshot.spot.closedCandles).toHaveLength(60);
    expect(captured.provenance.counts.unclosedCandlesFiltered).toBe(1);
    expect(captured.provenance.fields.closedCandles).toBe('AVAILABLE');
    expect(captured.provenance.fields.ticker).toBe('AVAILABLE');
    expect(captured.provenance.fields.orderBookDepth).toBe('AVAILABLE');
    expect(captured.provenance.fields.recentTrades).toBe('AVAILABLE');
    expect(captured.provenance.fields.futuresMarkPrice).toBe('AVAILABLE');
    expect(captured.provenance.fields.fundingRate).toBe('AVAILABLE');

    // Unavailable fields in existing CEX services are honestly documented, never synthesized
    expect(captured.provenance.fields.openInterest).toBe('UNAVAILABLE');
    expect(captured.provenance.fields.onChainAndMacro).toBe('UNAVAILABLE');
    expect(captured.snapshot.derivatives?.openInterestSeries).toEqual([]);
    expect(captured.snapshot.onChainAndMacro).toBeNull();

    // Trade quoteQty computed via @cex/core Dec
    expect(captured.snapshot.spot.recentTrades).toHaveLength(2);
    expect(captured.snapshot.spot.recentTrades[0]?.quoteQty).toBe('16375.00000000');

    // 7-department execution succeeded with live execution permanently disabled
    expect(report.advisoryProposal.liveExecutionEnabled).toBe(false);
    expect(report.departmentFindings).toHaveLength(7);
    expect(report.debate.consensusTilt).toBeDefined();
    expect(typeof report.riskReview.approved).toBe('boolean');
  });

  it('merges 1000-level DepthSnapshots when useDeepDepth is enabled', async () => {
    const h = createTestHarness();
    const nowMs = h.getClockMs();

    h.market.ingestDepth(
      'ETHUSDT',
      [['3200.00', '2.000']],
      [['3200.50', '1.500']],
      nowMs - 500,
    );

    const depthSnapshots = new DepthSnapshots(
      async () => ({
        bids: [
          ['3200.00', '2.000'],
          ['3195.00', '10.000'],
          ['3190.00', '25.000'],
        ],
        asks: [
          ['3200.50', '1.500'],
          ['3205.00', '8.000'],
          ['3210.00', '20.000'],
        ],
      }),
      h.getClockMs,
    );

    const adapter = new CexMarketDataAdapter({
      exchangeConfig: h.exchangeConfig,
      market: h.market,
      candles: h.candles,
      depthSnapshots,
      now: h.getClockMs,
    });

    const res = await adapter.captureSnapshot('ETHUSDT', { useDeepDepth: true });
    expect(res.snapshot.spot.bids).toHaveLength(3);
    expect(res.snapshot.spot.asks).toHaveLength(3);
    expect(res.snapshot.spot.bids[2]?.price).toBe('3190');
    expect(res.snapshot.spot.asks[2]?.price).toBe('3210');
  });

  it('filters forming candles, straddling candles (openTime < asOfMs < closeTime), and future candles', async () => {
    const h = createTestHarness();
    const asOfMs = h.getClockMs();

    const closedBefore = buildClosedCandleFixtures({
      count: 30,
      endCloseTimeMs: asOfMs - 3_600_000,
    });
    // Straddling candle: opened before asOfMs, closes after asOfMs, marked closed=true in historical DB
    const straddlingCandle: Candle = {
      openTime: asOfMs - 1_800_000,
      closeTime: asOfMs + 1_800_000 - 1,
      open: '65000.00',
      high: '66000.00',
      low: '64900.00',
      close: '65800.00',
      volume: '100.0000',
      quoteVolume: '6580000.00',
      closed: true,
    };
    // Future candle: openTime > asOfMs
    const futureCandle: Candle = {
      openTime: asOfMs + 1_800_000,
      closeTime: asOfMs + 5_400_000 - 1,
      open: '65800.00',
      high: '67000.00',
      low: '65700.00',
      close: '66900.00',
      volume: '85.0000',
      quoteVolume: '5686500.00',
      closed: true,
    };
    h.setCandles('BTCUSDT', [...closedBefore, straddlingCandle, futureCandle]);

    // Also inject an in-memory forming candle in MarketDataService
    h.market.ingestCandle('BTCUSDT', '1h', {
      openTime: asOfMs - 600_000,
      closeTime: asOfMs + 3_000_000 - 1,
      open: '65100.00',
      high: '65250.00',
      low: '65050.00',
      close: '65200.00',
      volume: '14.2000',
      quoteVolume: '925840.00',
      closed: false,
    });

    h.market.ingestDepth('BTCUSDT', [['65000.00', '1.0']], [['65001.00', '1.0']], asOfMs - 500);

    const adapter = new CexMarketDataAdapter({
      exchangeConfig: h.exchangeConfig,
      market: h.market,
      candles: h.candles,
      now: h.getClockMs,
    });

    const captured = await adapter.captureSnapshot('BTCUSDT', { asOfMs });
    expect(captured.snapshot.spot.closedCandles).toHaveLength(30);
    expect(
      captured.snapshot.spot.closedCandles.every(
        (c) => c.closed && c.closeTime <= asOfMs && c.openTime <= asOfMs,
      ),
    ).toBe(true);
    expect(captured.provenance.counts.unclosedCandlesFiltered).toBe(1);
    expect(captured.provenance.counts.futureCandlesFiltered).toBe(1);
  });

  it('withholds future-dated ticker, book, markPrice, and trades to prevent look-ahead leakage', async () => {
    const h = createTestHarness();
    const asOfMs = h.getClockMs();

    // Ingest observations dated AFTER asOfMs
    h.market.ingestDepth(
      'BTCUSDT',
      [['69000.00', '5.0']],
      [['69001.00', '5.0']],
      asOfMs + 5_000,
    );
    h.market.ingestTicker('BTCUSDT', {
      lastPrice: '69000.50',
      openPrice: '64000.00',
      highPrice: '69500.00',
      lowPrice: '63900.00',
      priceChange: '5000.50',
      priceChangePercent: '7.813',
      volume: '10000',
      quoteVolume: '680000000',
      bestBid: '69000.00',
      bestAsk: '69001.00',
      eventTime: asOfMs + 5_000,
    });
    h.market.ingestTrade('BTCUSDT', {
      id: 1,
      price: '64500.00',
      qty: '0.5',
      time: asOfMs - 1_000,
      isBuyerMaker: false,
    });
    h.market.ingestTrade('BTCUSDT', {
      id: 2,
      price: '69000.00',
      qty: '2.0',
      time: asOfMs + 3_000,
      isBuyerMaker: false,
    });
    h.marks.ingest(
      'BTCUSDT',
      {
        markPrice: '69010.00',
        indexPrice: '69000.00',
        fundingRate: '0.00050000',
        nextFundingTime: asOfMs + 7_200_000,
        eventTime: asOfMs + 4_000,
      },
      asOfMs + 4_000,
    );

    const adapter = new CexMarketDataAdapter({
      exchangeConfig: h.exchangeConfig,
      market: h.market,
      candles: h.candles,
      futures: {
        config: h.futuresConfig,
        market: h.futuresMarket,
        marks: h.marks,
      },
      now: h.getClockMs,
    });

    const captured = await adapter.captureSnapshot('BTCUSDT', { asOfMs });

    // Future prices must be withheld (null / empty) so agents never see future observations
    expect(captured.snapshot.spot.lastPrice).toBeNull();
    expect(captured.snapshot.spot.bestBid).toBeNull();
    expect(captured.snapshot.spot.bestAsk).toBeNull();
    expect(captured.snapshot.spot.bids).toHaveLength(0);
    expect(captured.snapshot.spot.asks).toHaveLength(0);
    expect(captured.snapshot.derivatives?.markPrice).toBeNull();
    expect(captured.snapshot.derivatives?.indexPrice).toBeNull();
    expect(captured.snapshot.derivatives?.lastFundingRate).toBeNull();

    // Only the past trade (id=1) is retained; future trade (id=2) is filtered
    expect(captured.snapshot.spot.recentTrades).toHaveLength(1);
    expect(captured.snapshot.spot.recentTrades[0]?.id).toBe('1');
    expect(captured.provenance.counts.futureTradesFiltered).toBe(1);

    // Status downgraded to STALE and aligned=false
    expect(captured.snapshot.spotDataStatus).toBe('STALE');
    expect(captured.snapshot.futuresDataStatus).toBe('STALE');
    expect(captured.snapshot.timestampAlignment.aligned).toBe(false);
    expect(captured.provenance.fields.ticker).toBe('WITHHELD_LOOKAHEAD');
    expect(captured.provenance.fields.orderBookDepth).toBe('WITHHELD_LOOKAHEAD');
    expect(captured.provenance.fields.futuresMarkPrice).toBe('WITHHELD_LOOKAHEAD');
  });

  it('detects and rejects crossed order books, out-of-order depth levels, and corrupt OHLC candles', async () => {
    const h = createTestHarness();
    const nowMs = h.getClockMs();

    // Corrupt candle (high < open) + 1 valid closed candle
    h.setCandles('BTCUSDT', [
      {
        openTime: nowMs - 7_200_000,
        closeTime: nowMs - 3_600_001,
        open: '65000.00',
        high: '64000.00', // invalid: high < open
        low: '63500.00',
        close: '64500.00',
        volume: '10.0',
        quoteVolume: '645000.00',
        closed: true,
      },
      {
        openTime: nowMs - 3_600_000,
        closeTime: nowMs - 1,
        open: '64500.00',
        high: '64800.00',
        low: '64400.00',
        close: '64700.00',
        volume: '12.0',
        quoteVolume: '776400.00',
        closed: true,
      },
    ]);

    // Crossed order book: bestBid (65100) >= bestAsk (65050)
    h.market.ingestDepth(
      'BTCUSDT',
      [['65100.00', '1.0']],
      [['65050.00', '1.0']],
      nowMs - 500,
    );

    const adapter = new CexMarketDataAdapter({
      exchangeConfig: h.exchangeConfig,
      market: h.market,
      candles: h.candles,
      now: h.getClockMs,
    });

    const crossedResult = await adapter.captureSnapshot('BTCUSDT', { asOfMs: nowMs });
    expect(crossedResult.provenance.counts.corruptCandlesFiltered).toBe(1);
    expect(crossedResult.snapshot.spot.closedCandles).toHaveLength(1);
    expect(crossedResult.provenance.counts.crossedBookDetected).toBe(true);
    expect(crossedResult.provenance.fields.orderBookDepth).toBe('WITHHELD_INVALID');
    expect(crossedResult.snapshot.spot.bids).toEqual([]);
    expect(crossedResult.snapshot.spot.asks).toEqual([]);
    expect(crossedResult.snapshot.spotDataStatus).toBe('STALE');

    // Now ingest a non-crossed book that has out-of-order and zero/negative levels
    h.market.ingestDepth(
      'BTCUSDT',
      [
        ['65000.00', '1.0'],
        ['65010.00', '2.0'], // out of order (higher than previous bid)
        ['64990.00', '0'], // invalid zero qty
        ['64980.00', '3.5'],
      ],
      [
        ['65005.00', '1.5'],
        ['65002.00', '1.0'], // out of order (lower than previous ask)
        ['65015.00', '2.2'],
      ],
      nowMs - 200,
    );

    const sanitizedResult = await adapter.captureSnapshot('BTCUSDT', { asOfMs: nowMs + 100 });
    expect(sanitizedResult.provenance.counts.crossedBookDetected).toBe(false);
    expect(sanitizedResult.provenance.counts.invalidBookLevelsFiltered).toBe(3);
    expect(sanitizedResult.snapshot.spot.bids).toEqual([
      { price: '65000', qty: '1' },
      { price: '64980', qty: '3.5' },
    ]);
    expect(sanitizedResult.snapshot.spot.asks).toEqual([
      { price: '65005', qty: '1.5' },
      { price: '65015', qty: '2.2' },
    ]);
  });

  it('handles disconnected feeds and partially available Futures data gracefully', async () => {
    const h = createTestHarness();
    const nowMs = h.getClockMs();

    h.setCandles(
      'ETHUSDT',
      buildClosedCandleFixtures({ count: 35, endCloseTimeMs: nowMs - 1_000, startPrice: 3_100, stepPrice: 5 }),
    );
    h.market.ingestDepth('ETHUSDT', [['3250.00', '4.0']], [['3250.50', '4.0']], nowMs - 1_000);
    h.market.ingestTicker('ETHUSDT', {
      lastPrice: '3250.25',
      openPrice: '3100.00',
      highPrice: '3280.00',
      lowPrice: '3090.00',
      priceChange: '150.25',
      priceChangePercent: '4.846',
      volume: '50000',
      quoteVolume: '160000000',
      bestBid: '3250.00',
      bestAsk: '3250.50',
      eventTime: nowMs - 1_000,
    });

    // Spot feed disconnects while Futures mark was never ingested (partially available)
    h.market.setConnection('DISCONNECTED');

    const adapter = new CexMarketDataAdapter({
      exchangeConfig: h.exchangeConfig,
      market: h.market,
      candles: h.candles,
      futures: {
        config: h.futuresConfig,
        market: h.futuresMarket,
        marks: h.marks,
      },
      now: h.getClockMs,
    });

    const orchestrator = new CryptoTradingAgentsOrchestrator();
    const { captured, report } = await adapter.analyzeSymbol('ETHUSDT', orchestrator, {
      asOfMs: nowMs,
    });

    // Disconnected Spot feed downgrades LIVE -> STALE and sets spotTradeBlock = PRICE_STALE
    expect(captured.provenance.spotFeedConnection).toBe('DISCONNECTED');
    expect(captured.snapshot.spotDataStatus).toBe('STALE');
    expect(captured.snapshot.spotTradeBlock).toBe('PRICE_STALE');

    // Futures mark was never ingested -> UNAVAILABLE and futuresTradeBlock = PRICE_STALE
    expect(captured.snapshot.futuresDataStatus).toBe('UNAVAILABLE');
    expect(captured.snapshot.futuresTradeBlock).toBe('PRICE_STALE');
    expect(captured.provenance.fields.futuresMarkPrice).toBe('UNAVAILABLE');

    // Orchestrator still completes cleanly and reports degraded departments + REVIEW rating
    expect(report.audit.degradedDepartments.length).toBeGreaterThan(0);
    expect(report.rating).toBe('REVIEW');
  });

  it('preserves zero values ("0" vs null) and normalizes 1000PEPEUSDT multiplier to Spot scale', async () => {
    const h = createTestHarness();
    const nowMs = h.getClockMs();

    // Case A: Spot depth ingested, but NO ticker ingested -> ticker fields must be null (UNAVAILABLE), not '0'
    h.market.ingestDepth(
      'PEPEUSDT',
      [['0.00001250', '100000000']],
      [['0.00001252', '100000000']],
      nowMs - 500,
    );

    const adapter = new CexMarketDataAdapter({
      exchangeConfig: h.exchangeConfig,
      market: h.market,
      candles: h.candles,
      futures: {
        config: h.futuresConfig,
        market: h.futuresMarket,
        marks: h.marks,
      },
      now: h.getClockMs,
    });

    const withoutTicker = await adapter.captureSnapshot('pepeusdt', { asOfMs: nowMs });
    expect(withoutTicker.snapshot.symbol).toBe('PEPEUSDT');
    expect(withoutTicker.provenance.futuresSymbol).toBe('1000PEPEUSDT');
    expect(withoutTicker.provenance.futuresMultiplier).toBe(1000);
    expect(withoutTicker.snapshot.spot.lastPrice).toBeNull();
    expect(withoutTicker.snapshot.spot.priceChangePct24h).toBeNull();
    expect(withoutTicker.snapshot.spot.quoteVolume24h).toBeNull();
    expect(withoutTicker.provenance.fields.ticker).toBe('UNAVAILABLE');

    // Case B: Ingest a real ticker with 0% price change and a 1000PEPEUSDT mark with 0 funding rate
    h.market.ingestTicker('PEPEUSDT', {
      lastPrice: '0.00001251',
      openPrice: '0.00001251',
      highPrice: '0.00001260',
      lowPrice: '0.00001240',
      priceChange: '0.00000000',
      priceChangePercent: '0.000',
      volume: '50000000000',
      quoteVolume: '0',
      bestBid: '0.00001250',
      bestAsk: '0.00001252',
      eventTime: nowMs - 300,
    });
    // 1000PEPEUSDT mark price is for 1000 PEPE (0.01251500 USDT per 1000 PEPE = 0.000012515 per 1 PEPE)
    h.marks.ingest(
      '1000PEPEUSDT',
      {
        markPrice: '0.01251500',
        indexPrice: '0.01251000',
        fundingRate: '0.00000000',
        nextFundingTime: nowMs + 3_600_000,
        eventTime: nowMs - 250,
      },
      nowMs - 250,
    );

    // Query using the futures contract symbol '1000PEPEUSDT' directly -> resolves to PEPEUSDT + 1000PEPEUSDT
    const withZeroAndMultiplier = await adapter.captureSnapshot('1000PEPEUSDT', {
      asOfMs: nowMs + 1,
    });
    expect(withZeroAndMultiplier.snapshot.symbol).toBe('PEPEUSDT');
    expect(withZeroAndMultiplier.provenance.requestedSymbol).toBe('1000PEPEUSDT');
    expect(withZeroAndMultiplier.provenance.spotSymbol).toBe('PEPEUSDT');
    expect(withZeroAndMultiplier.provenance.futuresSymbol).toBe('1000PEPEUSDT');

    // True zero values are preserved as '0', never coerced to null
    expect(withZeroAndMultiplier.snapshot.spot.priceChangePct24h).toBe('0');
    expect(withZeroAndMultiplier.snapshot.spot.quoteVolume24h).toBe('0');
    expect(withZeroAndMultiplier.snapshot.derivatives?.lastFundingRate).toBe('0');

    // 1000PEPEUSDT markPrice (0.01251500) divided by 1000 -> 0.000012515 (matches Spot 0.00001251 scale!)
    expect(withZeroAndMultiplier.snapshot.derivatives?.markPrice).toBe('0.000012515');
    expect(withZeroAndMultiplier.snapshot.derivatives?.indexPrice).toBe('0.00001251');
  });

  it('deduplicates concurrent captureSnapshot requests and enforces allowlist & exchange halt lifecycle', async () => {
    const h = createTestHarness();
    const nowMs = h.getClockMs();

    h.setCandles('BTCUSDT', buildClosedCandleFixtures({ count: 30, endCloseTimeMs: nowMs - 1_000 }));
    h.market.ingestDepth('BTCUSDT', [['65000.00', '1.0']], [['65001.00', '1.0']], nowMs - 500);

    const adapter = new CexMarketDataAdapter(
      {
        exchangeConfig: h.exchangeConfig,
        market: h.market,
        candles: h.candles,
        futures: {
          config: h.futuresConfig,
          market: h.futuresMarket,
          marks: h.marks,
        },
        now: h.getClockMs,
      },
      { allowedSymbols: ['BTCUSDT'] },
    );

    // Concurrent calls for the same symbol & asOfMs share the in-flight promise (CandleService called once)
    const [r1, r2, r3] = await Promise.all([
      adapter.captureSnapshot('BTCUSDT', { asOfMs: nowMs }),
      adapter.captureSnapshot('btcusdt', { asOfMs: nowMs }),
      adapter.captureSnapshot('BTCUSDT', { asOfMs: nowMs }),
    ]);
    expect(h.getCandleFetchCount()).toBe(1);
    expect(r1.snapshotHash).toBe(r2.snapshotHash);
    expect(r2.snapshotHash).toBe(r3.snapshotHash);

    // Symbol outside allowlist throws SYMBOL_DISABLED
    await expect(adapter.captureSnapshot('ETHUSDT', { asOfMs: nowMs })).rejects.toMatchObject({
      code: 'SYMBOL_DISABLED',
    });

    // Unknown symbol throws NOT_FOUND
    await expect(adapter.captureSnapshot('DOESNOTEXIST', { asOfMs: nowMs })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    // Halting the exchange updates spotTradeBlock and futuresTradeBlock to HALTED
    h.exchangeConfig.setTradingHalted(true);
    const haltedSnap = await adapter.captureSnapshot('BTCUSDT', { asOfMs: nowMs + 10 });
    expect(haltedSnap.snapshot.spotTradeBlock).toBe('HALTED');
    expect(haltedSnap.snapshot.futuresTradeBlock).toBe('HALTED');
  });

  it('integrates directly with the CEX SimFeed market pipeline (Spot + Futures)', async () => {
    const h = createTestHarness();
    const spotSpecs = simSpecs(
      'spot',
      h.exchangeConfig.allSymbols().map((s) => ({
        symbol: s.row.symbol,
        tick: s.row.tickSize,
        step: s.row.stepSize,
      })),
    );
    const futSpecs = simSpecs(
      'futures',
      h.futuresConfig.all().map((c) => ({
        symbol: c.row.symbol,
        tick: c.row.tickSize,
        step: c.row.stepSize,
      })),
    );

    const spotSim = new SimFeed(h.market, spotSpecs, {
      now: h.getClockMs,
      tickMs: 10_000,
    });
    const futSim = new SimFeed(h.futuresMarket, futSpecs, {
      onMark: (sym, m) => h.marks.ingest(sym, m, h.getClockMs()),
      now: h.getClockMs,
      tickMs: 10_000,
    });

    const simCandles = new CandleService({} as Db, null, {
      storedFallback: false,
      history: (s, i, l, end) => spotSim.history(s, i, l, end),
    });

    spotSim.start();
    futSim.start();
    try {
      const adapter = new CexMarketDataAdapter({
        exchangeConfig: h.exchangeConfig,
        market: h.market,
        candles: simCandles,
        futures: {
          config: h.futuresConfig,
          market: h.futuresMarket,
          marks: h.marks,
        },
        now: h.getClockMs,
      });

      const orchestrator = new CryptoTradingAgentsOrchestrator();
      const { captured, report } = await adapter.analyzeSymbol('BTCUSDT', orchestrator, {
        interval: '1h',
        candleLimit: 60,
      });

      expect(captured.snapshot.spotDataStatus).toBe('LIVE');
      expect(captured.snapshot.futuresDataStatus).toBe('LIVE');
      expect(captured.snapshot.spot.closedCandles.length).toBeGreaterThanOrEqual(50);
      expect(captured.snapshot.spot.closedCandles.every((c) => c.closed)).toBe(true);
      expect(captured.provenance.counts.unclosedCandlesFiltered).toBeGreaterThanOrEqual(1);
      expect(report.advisoryProposal.liveExecutionEnabled).toBe(false);
    } finally {
      spotSim.stop();
      futSim.stop();
    }
  });
});
