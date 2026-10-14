import { dec, stepDecimals } from '@cex/core';
import { CryptoMarketSnapshot, type FuturesSymbolInfo } from '@cex/contracts';
import type { Db } from '../../db/client.ts';
import type { ExchangeConfig, LoadedSymbol, SymbolRow } from '../exchange/exchangeConfig.ts';
import type { FuturesConfig, FuturesSymbolRow, LoadedContract } from '../futures/config.ts';
import { FuturesMarkService } from '../futures/markData.ts';
import { BinanceStream } from '../market/binance.ts';
import { CandleService } from '../market/candleService.ts';
import { binanceDepthFetcher, DepthSnapshots } from '../market/depthSnapshots.ts';
import { MarketDataService } from '../market/marketData.ts';
import { SimFeed, simSpecs } from '../market/sim/feed.ts';
import { CexMarketDataAdapter } from './cexMarketAdapter.ts';
import { CryptoTradingAgentsOrchestrator } from './orchestrator.ts';

function createSmokeCatalog() {
  const makeSpot = (
    symbol: string,
    baseAsset: string,
    tickSize: string,
    stepSize: string,
  ): LoadedSymbol => {
    const row: SymbolRow = {
      symbol,
      baseAsset,
      quoteAsset: 'USDT',
      tickSize,
      stepSize,
      minQty: stepSize,
      maxQty: '1000000.00000000',
      minNotional: '10.00000000',
      enabled: true,
      sourceStatus: 'TRADING',
      sortOrder: 0,
      updatedAt: new Date(),
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
  };

  const makeFut = (
    symbol: string,
    baseAsset: string,
    underlyingAsset: string,
    multiplier: number,
    tickSize: string,
    stepSize: string,
  ): LoadedContract => {
    const row: FuturesSymbolRow = {
      symbol,
      baseAsset,
      quoteAsset: 'USDT',
      underlyingAsset,
      multiplier,
      tickSize,
      stepSize,
      minQty: stepSize,
      maxQty: '1000000.00000000',
      minNotional: '5.00000000',
      maxLeverage: 20,
      maintenanceMarginRate: underlyingAsset === 'PEPE' ? '0.00500000' : '0.00400000',
      enabled: true,
      sourceStatus: 'TRADING',
      sortOrder: 0,
      updatedAt: new Date(),
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
  };

  const spotSymbols = [
    makeSpot('BTCUSDT', 'BTC', '0.01000000', '0.00001000'),
    makeSpot('ETHUSDT', 'ETH', '0.01000000', '0.00010000'),
    makeSpot('PEPEUSDT', 'PEPE', '0.00000001', '1.00000000'),
  ];
  const futuresContracts = [
    makeFut('BTCUSDT', 'BTC', 'BTC', 1, '0.10000000', '0.00100000'),
    makeFut('ETHUSDT', 'ETH', 'ETH', 1, '0.01000000', '0.00100000'),
    makeFut('1000PEPEUSDT', '1000PEPE', 'PEPE', 1000, '0.00001000', '1.00000000'),
  ];

  const exchangeConfig = {
    allSymbols: () => spotSymbols,
    findSymbol: (sym: string) => spotSymbols.find((s) => s.row.symbol === sym),
    feeRate: dec('0.0010'),
    makerFeeRate: dec('0.0010'),
    tradingHalted: false,
    settings: {
      staleThresholdMs: 15_000,
      futuresMakerFee: '0.0002',
      futuresTakerFee: '0.0004',
      futuresLiquidationFee: '0.0050',
    },
    exchangeStatus: () => ({
      tradingHalted: false,
      disabledSymbols: [],
      taxMode: 'OFF',
      taxRate: '0.001',
      taxVndRate: null,
      updatedAt: new Date().toISOString(),
    }),
  } as unknown as ExchangeConfig;

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

  return { exchangeConfig, futuresConfig, spotSymbols, futuresContracts };
}

async function runSimPipelineSmoke() {
  const { exchangeConfig, futuresConfig, spotSymbols, futuresContracts } = createSmokeCatalog();
  const market = new MarketDataService(
    spotSymbols.map((s) => s.row.symbol),
    () => 15_000,
  );
  const futuresMarket = new MarketDataService(
    futuresContracts.map((c) => c.row.symbol),
    () => 15_000,
  );
  const marks = new FuturesMarkService(() => 15_000);

  const spotSpecs = simSpecs(
    'spot',
    spotSymbols.map((s) => ({
      symbol: s.row.symbol,
      tick: s.row.tickSize,
      step: s.row.stepSize,
    })),
  );
  const futSpecs = simSpecs(
    'futures',
    futuresContracts.map((c) => ({
      symbol: c.row.symbol,
      tick: c.row.tickSize,
      step: c.row.stepSize,
    })),
  );

  const spotSim = new SimFeed(market, spotSpecs, { tickMs: 5_000 });
  const futSim = new SimFeed(futuresMarket, futSpecs, {
    onMark: (sym, m) => marks.ingest(sym, m),
    tickMs: 5_000,
  });
  const candles = new CandleService({} as Db, null, {
    storedFallback: false,
    history: (s, i, l, end) => spotSim.history(s, i, l, end),
  });

  spotSim.start();
  futSim.start();
  try {
    const adapter = new CexMarketDataAdapter(
      {
        exchangeConfig,
        market,
        candles,
        futures: { config: futuresConfig, market: futuresMarket, marks },
      },
      { allowedSymbols: ['BTCUSDT', 'ETHUSDT', 'PEPEUSDT'] },
    );
    const orchestrator = new CryptoTradingAgentsOrchestrator();
    const results = [];
    for (const symbol of ['BTCUSDT', 'ETHUSDT', 'PEPEUSDT']) {
      const { captured, report } = await adapter.analyzeSymbol(symbol, orchestrator, {
        interval: '1h',
        candleLimit: 60,
      });
      const schemaValid = CryptoMarketSnapshot.safeParse(captured.snapshot).success;
      results.push({
        source: 'CEX_SIM_FEED_PIPELINE',
        symbol: captured.snapshot.symbol,
        futuresSymbol: captured.provenance.futuresSymbol,
        futuresMultiplier: captured.provenance.futuresMultiplier,
        asOf: captured.snapshot.asOf,
        spotDataStatus: captured.snapshot.spotDataStatus,
        futuresDataStatus: captured.snapshot.futuresDataStatus,
        observedMaxLagMs: captured.snapshot.timestampAlignment.observedMaxLagMs,
        aligned: captured.snapshot.timestampAlignment.aligned,
        schemaValid,
        fields: captured.provenance.fields,
        counts: captured.provenance.counts,
        spotLastPrice: captured.snapshot.spot.lastPrice,
        futuresMarkPrice: captured.snapshot.derivatives?.markPrice ?? null,
        fundingRate: captured.snapshot.derivatives?.lastFundingRate ?? null,
        rating: report.rating,
        confidence: report.confidence,
        uncertaintyScore: report.uncertaintyScore,
        debateConsensusTilt: report.debate.consensusTilt,
        riskApproved: report.riskReview.approved,
        liveExecutionEnabled: report.advisoryProposal.liveExecutionEnabled,
        degradedDepartments: report.audit.degradedDepartments,
        warnings: captured.provenance.warnings,
      });
    }
    return results;
  } finally {
    spotSim.stop();
    futSim.stop();
  }
}

async function runBinanceLivePipelineSmoke() {
  const { exchangeConfig, futuresConfig } = createSmokeCatalog();
  const targetSpots = ['BTCUSDT', 'ETHUSDT'];
  const targetFuts = ['BTCUSDT', 'ETHUSDT'];

  const market = new MarketDataService(targetSpots, () => 15_000);
  const futuresMarket = new MarketDataService(targetFuts, () => 15_000);
  const marks = new FuturesMarkService(() => 15_000);
  const candles = new CandleService({} as Db, 'https://api.binance.com', {
    path: '/api/v3/klines',
    storedFallback: false,
  });
  const depthSnapshots = new DepthSnapshots(binanceDepthFetcher('https://api.binance.com'));

  const connectionEvents: string[] = [];
  market.on('status', () => connectionEvents.push(`spot:${market.connection}`));
  futuresMarket.on('status', () => connectionEvents.push(`futures:${futuresMarket.connection}`));

  const spotStream = new BinanceStream(
    'wss://stream.binance.com:9443',
    market,
    targetSpots,
    { kind: 'spot', db: null },
  );
  const futStream = new BinanceStream(
    'wss://fstream.binance.com',
    futuresMarket,
    targetFuts,
    {
      kind: 'futures',
      db: null,
      onMark: (sym, m) => marks.ingest(sym, m),
    },
  );

  spotStream.start();
  futStream.start();

  try {
    // Wait up to 4.5s for live WS depth + ticker + markPrice frames to arrive for both BTCUSDT and ETHUSDT
    const deadline = Date.now() + 4_500;
    while (Date.now() < deadline) {
      const btcReady =
        market.getStatus('BTCUSDT') === 'LIVE' &&
        market.getTicker('BTCUSDT').updatedAt !== null &&
        marks.status('BTCUSDT') === 'LIVE';
      const ethReady =
        market.getStatus('ETHUSDT') === 'LIVE' &&
        market.getTicker('ETHUSDT').updatedAt !== null &&
        marks.status('ETHUSDT') === 'LIVE';
      if (btcReady && ethReady) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    const adapter = new CexMarketDataAdapter(
      {
        exchangeConfig,
        market,
        candles,
        depthSnapshots,
        futures: { config: futuresConfig, market: futuresMarket, marks },
      },
      { allowedSymbols: ['BTCUSDT', 'ETHUSDT'], useDeepDepthSnapshots: true },
    );

    const orchestrator = new CryptoTradingAgentsOrchestrator();
    const results = [];
    for (const symbol of ['BTCUSDT', 'ETHUSDT']) {
      const { captured, report } = await adapter.analyzeSymbol(symbol, orchestrator, {
        interval: '1h',
        candleLimit: 60,
        useDeepDepth: true,
      });
      const schemaValid = CryptoMarketSnapshot.safeParse(captured.snapshot).success;
      results.push({
        source: 'BINANCE_PUBLIC_LIVE_WS_AND_REST',
        symbol: captured.snapshot.symbol,
        asOf: captured.snapshot.asOf,
        spotFeedConnection: captured.provenance.spotFeedConnection,
        futuresFeedConnection: captured.provenance.futuresFeedConnection,
        spotDataStatus: captured.snapshot.spotDataStatus,
        futuresDataStatus: captured.snapshot.futuresDataStatus,
        observedMaxLagMs: captured.snapshot.timestampAlignment.observedMaxLagMs,
        aligned: captured.snapshot.timestampAlignment.aligned,
        schemaValid,
        fields: captured.provenance.fields,
        counts: captured.provenance.counts,
        unavailableFieldReasons: captured.provenance.unavailableFieldReasons,
        spotLastPrice: captured.snapshot.spot.lastPrice,
        spotBestBid: captured.snapshot.spot.bestBid,
        spotBestAsk: captured.snapshot.spot.bestAsk,
        futuresMarkPrice: captured.snapshot.derivatives?.markPrice ?? null,
        futuresIndexPrice: captured.snapshot.derivatives?.indexPrice ?? null,
        fundingRate: captured.snapshot.derivatives?.lastFundingRate ?? null,
        rating: report.rating,
        confidence: report.confidence,
        uncertaintyScore: report.uncertaintyScore,
        departmentRatings: report.departmentFindings.map((d) => ({
          department: d.department,
          status: d.status,
          stance: d.stance,
          score: d.score,
          confidence: d.confidence,
        })),
        debateConsensusTilt: report.debate.consensusTilt,
        riskApproved: report.riskReview.approved,
        liveExecutionEnabled: report.advisoryProposal.liveExecutionEnabled,
        degradedDepartments: report.audit.degradedDepartments,
        warnings: captured.provenance.warnings,
        connectionEventsAtCapture: [...connectionEvents],
      });
    }
    return { status: 'COMPLETED', results };
  } catch (err) {
    return {
      status: 'ERROR',
      error: err instanceof Error ? err.message : String(err),
      connectionEvents,
    };
  } finally {
    spotStream.stop();
    futStream.stop();
  }
}

async function main() {
  const simResults = await runSimPipelineSmoke();
  const liveResults = await runBinanceLivePipelineSmoke();
  process.stdout.write(
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        simPipelineSmoke: simResults,
        binanceLivePipelineSmoke: liveResults,
      },
      null,
      2,
    ) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Smoke test failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
