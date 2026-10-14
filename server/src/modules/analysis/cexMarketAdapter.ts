import { dec, roundDown, toFixedStr } from '@cex/core';
import {
  resolveFuturesSymbol,
  spotSymbolFor,
  spotTradeBlock,
  futuresTradeBlock,
  type Candle,
  type CandleInterval,
  type CryptoMarketAnalysisReport,
  type CryptoMarketSnapshot,
  type DataStatus,
  type SnapshotBookLevel,
  type SnapshotPublicTrade,
  type SnapshotSymbolRules,
} from '@cex/contracts';
import { AppError } from '../../lib/errors.ts';
import type { ExchangeConfig, LoadedSymbol } from '../exchange/exchangeConfig.ts';
import type { Futures } from '../futures/index.ts';
import type { LoadedContract } from '../futures/config.ts';
import type { CandleService } from '../market/candleService.ts';
import { mergeDeepDepth, type DepthSnapshots } from '../market/depthSnapshots.ts';
import type { Connection, MarketDataService } from '../market/marketData.ts';
import {
  buildCryptoMarketSnapshot,
  type BuildCryptoMarketSnapshotInput,
  type RawCandleInput,
} from './snapshotBuilder.ts';
import type { CryptoTradingAgentsOrchestrator } from './orchestrator.ts';

export type MarketFieldAvailability = 'AVAILABLE' | 'STALE' | 'UNAVAILABLE' | 'WITHHELD_LOOKAHEAD' | 'WITHHELD_INVALID';

export interface MarketSnapshotProvenance {
  requestedSymbol: string;
  spotSymbol: string;
  futuresSymbol: string | null;
  futuresMultiplier: number;
  interval: CandleInterval;
  asOfMs: number;
  asOf: string;
  spotFeedConnection: Connection;
  futuresFeedConnection: Connection | 'UNCONFIGURED';
  fields: {
    closedCandles: MarketFieldAvailability;
    ticker: MarketFieldAvailability;
    orderBookDepth: MarketFieldAvailability;
    recentTrades: MarketFieldAvailability;
    futuresMarkPrice: MarketFieldAvailability;
    futuresIndexPrice: MarketFieldAvailability;
    fundingRate: MarketFieldAvailability;
    openInterest: MarketFieldAvailability;
    onChainAndMacro: MarketFieldAvailability;
  };
  counts: {
    rawCandlesFetched: number;
    closedCandlesRetained: number;
    unclosedCandlesFiltered: number;
    futureCandlesFiltered: number;
    corruptCandlesFiltered: number;
    bidsRetained: number;
    asksRetained: number;
    invalidBookLevelsFiltered: number;
    crossedBookDetected: boolean;
    rawTradesFetched: number;
    tradesRetained: number;
    futureTradesFiltered: number;
    invalidTradesFiltered: number;
  };
  unavailableFieldReasons: Record<string, string>;
  warnings: string[];
}

export interface CexMarketDataSources {
  exchangeConfig: ExchangeConfig;
  market: MarketDataService;
  candles: CandleService;
  depthSnapshots?: DepthSnapshots | null;
  futures?: Pick<Futures, 'config' | 'market' | 'marks'> | null;
  now?: () => number;
}

export interface CexMarketAdapterOptions {
  /** Explicit allowlist of symbols (e.g. ['BTCUSDT', 'ETHUSDT']). If omitted, all listed ExchangeConfig symbols are allowed. */
  allowedSymbols?: readonly string[];
  defaultInterval?: CandleInterval;
  defaultCandleLimit?: number;
  defaultDepthLimit?: number;
  defaultTradesLimit?: number;
  /** Whether to merge deep 1000-level cached depth from DepthSnapshots when available (default: false to avoid network calls unless cached/requested). */
  useDeepDepthSnapshots?: boolean;
  /** Downgrade LIVE status to STALE when MarketDataService.connection !== 'CONNECTED' (default: true). */
  enforceConnectionState?: boolean;
}

export interface CaptureMarketSnapshotOptions {
  interval?: CandleInterval;
  asOfMs?: number;
  candleLimit?: number;
  depthLimit?: number;
  tradesLimit?: number;
  useDeepDepth?: boolean;
  portfolio?: BuildCryptoMarketSnapshotInput['portfolio'];
}

export interface CapturedMarketSnapshotResult {
  snapshot: CryptoMarketSnapshot;
  snapshotHash: string;
  provenance: MarketSnapshotProvenance;
}

function isValidDecimal(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  if (!/^-?\d+(\.\d+)?$/.test(value)) return false;
  try {
    const d = dec(value);
    return d.isFinite() && !d.isNaN();
  } catch {
    return false;
  }
}

function isPositiveDecimal(value: string | null | undefined): value is string {
  if (!isValidDecimal(value)) return false;
  return dec(value).gt(0);
}

function isNonNegativeDecimal(value: string | null | undefined): value is string {
  if (!isValidDecimal(value)) return false;
  return dec(value).gte(0);
}

/**
 * Read-only adapter connecting the existing CEX MarketDataService, CandleService, DepthSnapshots,
 * and FuturesMarkService to the 7-department Crypto Multi-Agent Market Analysis subsystem.
 *
 * Guarantees:
 * - Strictly read-only: never modifies orders, balances, withdrawals, or market state.
 * - Reuses existing CEX singleton services; never opens duplicate WebSocket connections.
 * - Point-in-time (`asOfMs`) clamp: withholds future-dated ticker/book/mark/trade/candle observations.
 * - Closed-bar enforcement: strips forming (`closed: false`) candles from both REST/DB history and WS state.
 * - Distinguishes `null` (`UNAVAILABLE`) from `'0'` (e.g. `'0'` 24h price change or `'0.00000000'` funding rate).
 * - Multiplier normalization: scales `1000PEPEUSDT` (multiplier 1000) mark/index prices to per-1-unit Spot scale.
 * - Honest gap reporting: explicitly marks `openInterest` and `onChainAndMacro` as `UNAVAILABLE` with documented reasons.
 */
export class CexMarketDataAdapter {
  private readonly allowedSymbols: Set<string> | null;
  private readonly defaultInterval: CandleInterval;
  private readonly defaultCandleLimit: number;
  private readonly defaultDepthLimit: number;
  private readonly defaultTradesLimit: number;
  private readonly useDeepDepthSnapshots: boolean;
  private readonly enforceConnectionState: boolean;
  private readonly inflightSnapshots = new Map<string, Promise<CapturedMarketSnapshotResult>>();

  constructor(
    private readonly sources: CexMarketDataSources,
    options: CexMarketAdapterOptions = {},
  ) {
    this.allowedSymbols = options.allowedSymbols
      ? new Set(options.allowedSymbols.map((s) => s.trim().toUpperCase()))
      : null;
    this.defaultInterval = options.defaultInterval ?? '1h';
    this.defaultCandleLimit = options.defaultCandleLimit ?? 100;
    this.defaultDepthLimit = options.defaultDepthLimit ?? 50;
    this.defaultTradesLimit = options.defaultTradesLimit ?? 100;
    this.useDeepDepthSnapshots = options.useDeepDepthSnapshots ?? false;
    this.enforceConnectionState = options.enforceConnectionState ?? true;
  }

  /** Resolves a requested symbol (e.g. 'btcusdt', 'PEPEUSDT', or '1000PEPEUSDT') to its Spot & Futures definitions. */
  resolveSymbols(rawSymbol: string): {
    requestedSymbol: string;
    spotLoaded: LoadedSymbol;
    futuresContract: LoadedContract | null;
  } {
    const requestedSymbol = rawSymbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,20}$/.test(requestedSymbol)) {
      throw new AppError('VALIDATION_ERROR', `Invalid symbol format: "${rawSymbol}"`);
    }

    const spotAllRows = this.sources.exchangeConfig.allSymbols().map((s) => s.row);
    const futuresAllContracts = this.sources.futures?.config.all() ?? [];
    const futuresAllRows = futuresAllContracts.map((c) => c.row);

    let spotLoaded = this.sources.exchangeConfig.findSymbol(requestedSymbol);
    if (!spotLoaded && futuresAllRows.length > 0) {
      const mappedSpot = spotSymbolFor(requestedSymbol, futuresAllRows, spotAllRows);
      if (mappedSpot) {
        spotLoaded = this.sources.exchangeConfig.findSymbol(mappedSpot);
      }
    }

    if (!spotLoaded) {
      throw new AppError('NOT_FOUND', `Unknown symbol "${requestedSymbol}" in ExchangeConfig`);
    }

    if (
      this.allowedSymbols &&
      !this.allowedSymbols.has(requestedSymbol) &&
      !this.allowedSymbols.has(spotLoaded.row.symbol)
    ) {
      throw new AppError(
        'SYMBOL_DISABLED',
        `Symbol "${requestedSymbol}" is not in the configured analysis allowlist`,
      );
    }

    let futuresContract: LoadedContract | null = null;
    if (this.sources.futures) {
      const resolvedFutSymbol = resolveFuturesSymbol(
        spotLoaded.row.symbol,
        futuresAllRows,
        spotAllRows,
      );
      if (resolvedFutSymbol) {
        futuresContract = this.sources.futures.config.find(resolvedFutSymbol) ?? null;
      }
    }

    return {
      requestedSymbol,
      spotLoaded,
      futuresContract,
    };
  }

  /**
   * Captures a validated, point-in-time `CryptoMarketSnapshot` from the CEX market services.
   * Deduplicates concurrent identical requests (`spotSymbol + interval + asOfMs`).
   */
  async captureSnapshot(
    rawSymbol: string,
    opts: CaptureMarketSnapshotOptions = {},
  ): Promise<CapturedMarketSnapshotResult> {
    const { requestedSymbol, spotLoaded, futuresContract } = this.resolveSymbols(rawSymbol);
    const spotSymbol = spotLoaded.row.symbol;
    const interval = opts.interval ?? this.defaultInterval;
    const nowFn = this.sources.now ?? Date.now;
    const asOfMs = Math.trunc(opts.asOfMs ?? nowFn());
    const inflightKey = `${spotSymbol}:${interval}:${asOfMs}:${opts.candleLimit ?? this.defaultCandleLimit}:${opts.depthLimit ?? this.defaultDepthLimit}`;

    const existing = this.inflightSnapshots.get(inflightKey);
    if (existing && !opts.portfolio) {
      return existing;
    }

    const task = this.captureSnapshotInternal({
      requestedSymbol,
      spotLoaded,
      futuresContract,
      interval,
      asOfMs,
      opts,
    });

    if (!opts.portfolio) {
      this.inflightSnapshots.set(inflightKey, task);
      void task.finally(() => {
        if (this.inflightSnapshots.get(inflightKey) === task) {
          this.inflightSnapshots.delete(inflightKey);
        }
      });
    }

    return task;
  }

  /**
   * Convenience method to capture a snapshot from real CEX services and run the 7-department orchestrator.
   */
  async analyzeSymbol(
    rawSymbol: string,
    orchestrator: CryptoTradingAgentsOrchestrator,
    opts: CaptureMarketSnapshotOptions = {},
  ): Promise<{
    captured: CapturedMarketSnapshotResult;
    report: CryptoMarketAnalysisReport;
  }> {
    const captured = await this.captureSnapshot(rawSymbol, opts);
    const report = await orchestrator.analyzeSnapshot(captured.snapshot);
    return { captured, report };
  }

  private async captureSnapshotInternal(params: {
    requestedSymbol: string;
    spotLoaded: LoadedSymbol;
    futuresContract: LoadedContract | null;
    interval: CandleInterval;
    asOfMs: number;
    opts: CaptureMarketSnapshotOptions;
  }): Promise<CapturedMarketSnapshotResult> {
    const { requestedSymbol, spotLoaded, futuresContract, interval, asOfMs, opts } = params;
    const spotSymbol = spotLoaded.row.symbol;
    const futuresSymbol = futuresContract?.row.symbol ?? null;
    const futuresMultiplier = futuresContract?.row.multiplier ?? 1;
    const staleThresholdMs = this.sources.exchangeConfig.settings.staleThresholdMs;
    const warnings: string[] = [];
    const unavailableFieldReasons: Record<string, string> = {};

    // 1. Symbol rules & Exchange status
    const exchangeStatus = this.sources.exchangeConfig.exchangeStatus();
    const rules: SnapshotSymbolRules = {
      symbol: spotSymbol,
      baseAsset: spotLoaded.row.baseAsset,
      quoteAsset: spotLoaded.row.quoteAsset,
      tickSize: spotLoaded.tick.toFixed(),
      stepSize: spotLoaded.step.toFixed(),
      minQty: dec(spotLoaded.row.minQty).toFixed(),
      maxQty: dec(spotLoaded.row.maxQty).toFixed(),
      minNotional: dec(spotLoaded.row.minNotional).toFixed(),
      feeRate: this.sources.exchangeConfig.feeRate.toFixed(),
    };

    // 2. Read Spot MarketDataService state
    const spotConnection = this.sources.market.connection;
    let rawSpotStatus: DataStatus = this.sources.market.getStatus(spotSymbol);
    if (this.enforceConnectionState && spotConnection !== 'CONNECTED' && rawSpotStatus === 'LIVE') {
      rawSpotStatus = 'STALE';
      warnings.push(
        `Spot MarketDataService connection is ${spotConnection}; downgraded LIVE status to STALE.`,
      );
    }

    const rawTicker = this.sources.market.getTicker(spotSymbol);
    const depthLimit = opts.depthLimit ?? this.defaultDepthLimit;
    let rawDepth = this.sources.market.getDepth(spotSymbol, depthLimit);
    if ((opts.useDeepDepth ?? this.useDeepDepthSnapshots) && this.sources.depthSnapshots) {
      const deep = await this.sources.depthSnapshots.get(spotSymbol, depthLimit);
      rawDepth = mergeDeepDepth(rawDepth, deep, depthLimit);
    }

    if (rawTicker.symbol !== spotSymbol) {
      throw new AppError(
        'INTERNAL_ERROR',
        `Ticker symbol mismatch: expected ${spotSymbol}, got ${rawTicker.symbol}`,
      );
    }
    if (rawDepth.symbol !== spotSymbol) {
      throw new AppError(
        'INTERNAL_ERROR',
        `Depth symbol mismatch: expected ${spotSymbol}, got ${rawDepth.symbol}`,
      );
    }

    // 3. Process Order Book Depth (validate decimals, monotonic ordering, crossed book, and asOfMs boundary)
    const bookUpdatedAtMs =
      rawDepth.updatedAt !== null ? Date.parse(rawDepth.updatedAt) : null;
    const validBookUpdatedAtMs =
      bookUpdatedAtMs !== null && Number.isFinite(bookUpdatedAtMs) ? bookUpdatedAtMs : null;

    let orderBookAvailability: MarketFieldAvailability = 'UNAVAILABLE';
    let invalidBookLevelsFiltered = 0;
    let crossedBookDetected = false;
    let sanitizedBids: SnapshotBookLevel[] = [];
    let sanitizedAsks: SnapshotBookLevel[] = [];

    if (validBookUpdatedAtMs === null || (rawDepth.bids.length === 0 && rawDepth.asks.length === 0)) {
      orderBookAvailability = 'UNAVAILABLE';
      unavailableFieldReasons.orderBookDepth =
        'No order-book depth snapshot has been ingested into MarketDataService for this symbol.';
    } else if (validBookUpdatedAtMs > asOfMs) {
      orderBookAvailability = 'WITHHELD_LOOKAHEAD';
      unavailableFieldReasons.orderBookDepth = `Order-book depth timestamp (${validBookUpdatedAtMs}) is after asOfMs (${asOfMs}); withheld to prevent look-ahead leakage.`;
      warnings.push(unavailableFieldReasons.orderBookDepth);
    } else {
      // Sanitize bids (strictly descending price, positive price & qty)
      for (const [price, qty] of rawDepth.bids) {
        if (!isPositiveDecimal(price) || !isPositiveDecimal(qty)) {
          invalidBookLevelsFiltered++;
          continue;
        }
        if (sanitizedBids.length > 0) {
          const prevPrice = dec(sanitizedBids[sanitizedBids.length - 1]!.price);
          if (dec(price).gte(prevPrice)) {
            invalidBookLevelsFiltered++;
            continue;
          }
        }
        sanitizedBids.push({ price: dec(price).toFixed(), qty: dec(qty).toFixed() });
      }

      // Sanitize asks (strictly ascending price, positive price & qty)
      for (const [price, qty] of rawDepth.asks) {
        if (!isPositiveDecimal(price) || !isPositiveDecimal(qty)) {
          invalidBookLevelsFiltered++;
          continue;
        }
        if (sanitizedAsks.length > 0) {
          const prevPrice = dec(sanitizedAsks[sanitizedAsks.length - 1]!.price);
          if (dec(price).lte(prevPrice)) {
            invalidBookLevelsFiltered++;
            continue;
          }
        }
        sanitizedAsks.push({ price: dec(price).toFixed(), qty: dec(qty).toFixed() });
      }

      if (invalidBookLevelsFiltered > 0) {
        warnings.push(
          `Filtered ${invalidBookLevelsFiltered} invalid or out-of-order depth level(s) for ${spotSymbol}.`,
        );
      }

      if (sanitizedBids.length > 0 && sanitizedAsks.length > 0) {
        const bestBidDec = dec(sanitizedBids[0]!.price);
        const bestAskDec = dec(sanitizedAsks[0]!.price);
        if (bestBidDec.gte(bestAskDec)) {
          crossedBookDetected = true;
          sanitizedBids = [];
          sanitizedAsks = [];
          orderBookAvailability = 'WITHHELD_INVALID';
          unavailableFieldReasons.orderBookDepth = `Crossed order book detected for ${spotSymbol}: bestBid (${bestBidDec.toFixed()}) >= bestAsk (${bestAskDec.toFixed()}).`;
          warnings.push(unavailableFieldReasons.orderBookDepth);
          if (rawSpotStatus === 'LIVE') {
            rawSpotStatus = 'STALE';
          }
        }
      }

      if (!crossedBookDetected) {
        if (sanitizedBids.length === 0 && sanitizedAsks.length === 0) {
          orderBookAvailability = 'WITHHELD_INVALID';
          unavailableFieldReasons.orderBookDepth =
            'All order-book depth levels were invalid and filtered out.';
        } else {
          const bookLagMs = Math.max(0, asOfMs - validBookUpdatedAtMs);
          orderBookAvailability =
            rawSpotStatus === 'LIVE' && bookLagMs <= staleThresholdMs ? 'AVAILABLE' : 'STALE';
        }
      }
    }

    const bestBid = sanitizedBids[0]?.price ?? null;
    const bestAsk = sanitizedAsks[0]?.price ?? null;

    // 4. Process 24h Ticker (distinguish null/uningested from real '0' values, check asOfMs boundary)
    const tickerUpdatedAtMs =
      rawTicker.updatedAt !== null ? Date.parse(rawTicker.updatedAt) : null;
    const validTickerUpdatedAtMs =
      tickerUpdatedAtMs !== null && Number.isFinite(tickerUpdatedAtMs) ? tickerUpdatedAtMs : null;

    let tickerAvailability: MarketFieldAvailability;
    let lastPrice: string | null = null;
    let priceChangePct24h: string | null = null;
    let quoteVolume24h: string | null = null;

    if (validTickerUpdatedAtMs === null) {
      // MarketDataService.getTicker synthesizes '0' when no ticker was ever ingested (updatedAt === null)
      tickerAvailability = 'UNAVAILABLE';
      unavailableFieldReasons.ticker =
        'No 24h ticker event has been ingested into MarketDataService (updatedAt is null).';
    } else if (validTickerUpdatedAtMs > asOfMs) {
      tickerAvailability = 'WITHHELD_LOOKAHEAD';
      unavailableFieldReasons.ticker = `24h ticker timestamp (${validTickerUpdatedAtMs}) is after asOfMs (${asOfMs}); withheld to prevent look-ahead leakage.`;
      warnings.push(unavailableFieldReasons.ticker);
    } else if (!isPositiveDecimal(rawTicker.lastPrice)) {
      tickerAvailability = 'WITHHELD_INVALID';
      unavailableFieldReasons.ticker = `Ticker lastPrice ("${rawTicker.lastPrice}") is not a positive decimal.`;
      warnings.push(unavailableFieldReasons.ticker);
    } else {
      lastPrice = dec(rawTicker.lastPrice).toFixed();
      // Preserve valid '0' values for 24h price change and quote volume!
      priceChangePct24h = isValidDecimal(rawTicker.priceChangePercent)
        ? dec(rawTicker.priceChangePercent).toFixed()
        : null;
      quoteVolume24h = isNonNegativeDecimal(rawTicker.quoteVolume)
        ? dec(rawTicker.quoteVolume).toFixed()
        : null;
      const tickerLagMs = Math.max(0, asOfMs - validTickerUpdatedAtMs);
      tickerAvailability =
        rawSpotStatus === 'LIVE' && tickerLagMs <= staleThresholdMs ? 'AVAILABLE' : 'STALE';
    }

    // 5. Process Recent Public Trades
    const rawTrades = this.sources.market.getTrades(
      spotSymbol,
      opts.tradesLimit ?? this.defaultTradesLimit,
    );
    const sanitizedTrades: SnapshotPublicTrade[] = [];
    let futureTradesFiltered = 0;
    let invalidTradesFiltered = 0;

    for (const t of rawTrades) {
      if (!Number.isFinite(t.time) || t.time < 0) {
        invalidTradesFiltered++;
        continue;
      }
      if (!isPositiveDecimal(t.price) || !isPositiveDecimal(t.qty)) {
        invalidTradesFiltered++;
        continue;
      }
      if (t.time > asOfMs) {
        futureTradesFiltered++;
      }
      const priceFixed = dec(t.price).toFixed();
      const qtyFixed = dec(t.qty).toFixed();
      const quoteQty = toFixedStr(roundDown(dec(priceFixed).mul(dec(qtyFixed)), 8));
      sanitizedTrades.push({
        id: String(t.id),
        price: priceFixed,
        qty: qtyFixed,
        quoteQty,
        time: Math.trunc(t.time),
        isBuyerMaker: Boolean(t.isBuyerMaker),
      });
    }
    sanitizedTrades.sort((a, b) => a.time - b.time);

    if (invalidTradesFiltered > 0) {
      warnings.push(`Filtered ${invalidTradesFiltered} invalid public trade record(s) for ${spotSymbol}.`);
    }

    const retainedTradesCount = sanitizedTrades.filter((t) => t.time <= asOfMs).length;
    const recentTradesAvailability: MarketFieldAvailability =
      retainedTradesCount > 0
        ? rawSpotStatus === 'LIVE'
          ? 'AVAILABLE'
          : 'STALE'
        : futureTradesFiltered > 0
          ? 'WITHHELD_LOOKAHEAD'
          : 'UNAVAILABLE';
    if (recentTradesAvailability === 'UNAVAILABLE') {
      unavailableFieldReasons.recentTrades =
        'No public trades <= asOfMs are present in MarketDataService.';
    }

    // 6. Process Candles (CandleService + optional in-memory forming candle from MarketDataService)
    const candleLimit = opts.candleLimit ?? this.defaultCandleLimit;
    let fetchedCandles: Candle[] = [];
    try {
      fetchedCandles = await this.sources.candles.get(spotSymbol, interval, candleLimit, asOfMs);
    } catch (err) {
      warnings.push(
        `CandleService.get(${spotSymbol}, ${interval}) threw an error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const formingCandle = this.sources.market.getFormingCandle(spotSymbol, interval);
    const combinedRawCandles: Candle[] = [...fetchedCandles];
    if (
      formingCandle &&
      !combinedRawCandles.some((c) => c.openTime === formingCandle.openTime)
    ) {
      combinedRawCandles.push(formingCandle);
    }

    let corruptCandlesFiltered = 0;
    let unclosedCandlesCount = 0;
    let futureCandlesCount = 0;
    const dedupedCandlesByOpenTime = new Map<number, RawCandleInput>();

    for (const c of combinedRawCandles) {
      if (
        !Number.isFinite(c.openTime) ||
        !Number.isFinite(c.closeTime) ||
        c.openTime < 0 ||
        c.closeTime < c.openTime ||
        !isPositiveDecimal(c.open) ||
        !isPositiveDecimal(c.high) ||
        !isPositiveDecimal(c.low) ||
        !isPositiveDecimal(c.close) ||
        !isNonNegativeDecimal(c.volume)
      ) {
        corruptCandlesFiltered++;
        continue;
      }

      const openDec = dec(c.open);
      const highDec = dec(c.high);
      const lowDec = dec(c.low);
      const closeDec = dec(c.close);

      // Verify OHLC consistency: high >= max(open, close, low) and low <= min(open, close, high)
      if (
        highDec.lt(openDec) ||
        highDec.lt(closeDec) ||
        highDec.lt(lowDec) ||
        lowDec.gt(openDec) ||
        lowDec.gt(closeDec)
      ) {
        corruptCandlesFiltered++;
        continue;
      }

      if (!c.closed) {
        unclosedCandlesCount++;
      } else if (c.closeTime > asOfMs || c.openTime > asOfMs) {
        futureCandlesCount++;
      }

      dedupedCandlesByOpenTime.set(Math.trunc(c.openTime), {
        openTime: Math.trunc(c.openTime),
        closeTime: Math.trunc(c.closeTime),
        open: openDec.toFixed(),
        high: highDec.toFixed(),
        low: lowDec.toFixed(),
        close: closeDec.toFixed(),
        volume: dec(c.volume).toFixed(),
        closed: Boolean(c.closed),
      });
    }

    if (corruptCandlesFiltered > 0) {
      warnings.push(
        `Filtered ${corruptCandlesFiltered} corrupt/inconsistent OHLCV candle(s) for ${spotSymbol}.`,
      );
    }

    const sanitizedCandleInputs = [...dedupedCandlesByOpenTime.values()].sort(
      (a, b) => a.openTime - b.openTime,
    );

    // 7. Process Derivatives (FuturesMarkService + FuturesConfig)
    const futuresFeedConnection: Connection | 'UNCONFIGURED' = this.sources.futures
      ? this.sources.futures.market.connection
      : 'UNCONFIGURED';

    let derivativesInput: BuildCryptoMarketSnapshotInput['derivatives'] = null;
    let futuresStatus: DataStatus = 'UNAVAILABLE';
    let futuresMarkAvailability: MarketFieldAvailability = 'UNAVAILABLE';
    let futuresIndexAvailability: MarketFieldAvailability = 'UNAVAILABLE';
    let fundingRateAvailability: MarketFieldAvailability = 'UNAVAILABLE';
    let resolvedFuturesTradeBlock: string | null = null;

    // Open interest and on-chain/macro are not ingested by the current CEX services; document honestly
    const openInterestAvailability: MarketFieldAvailability = 'UNAVAILABLE';
    unavailableFieldReasons.openInterest =
      'Existing CEX market services (BinanceStream / FuturesMarkService) only subscribe to @markPrice@1s and do not ingest Binance open interest (/fapi/v1/openInterestHist).';

    const onChainAndMacroAvailability: MarketFieldAvailability = 'UNAVAILABLE';
    unavailableFieldReasons.onChainAndMacro =
      'Existing CEX services do not ingest external on-chain, tokenomics, CoinGecko regime, or news feeds.';

    if (!this.sources.futures || !futuresContract) {
      unavailableFieldReasons.futuresMarkPrice = !this.sources.futures
        ? 'Futures subsystem is not configured on this CEX instance.'
        : `No USDT perpetual futures contract is mapped for spot symbol ${spotSymbol}.`;
      unavailableFieldReasons.futuresIndexPrice = unavailableFieldReasons.futuresMarkPrice;
      unavailableFieldReasons.fundingRate = unavailableFieldReasons.futuresMarkPrice;
    } else {
      const contractSymbol = futuresContract.row.symbol;
      const rawMark = this.sources.futures.marks.get(contractSymbol);
      if (rawMark.symbol !== contractSymbol) {
        throw new AppError(
          'INTERNAL_ERROR',
          `Futures mark symbol mismatch: expected ${contractSymbol}, got ${rawMark.symbol}`,
        );
      }

      const markUpdatedAtMs =
        rawMark.updatedAt !== null ? Date.parse(rawMark.updatedAt) : null;
      const validMarkUpdatedAtMs =
        markUpdatedAtMs !== null && Number.isFinite(markUpdatedAtMs) ? markUpdatedAtMs : null;

      futuresStatus = rawMark.status;
      if (
        this.enforceConnectionState &&
        futuresFeedConnection !== 'CONNECTED' &&
        futuresStatus === 'LIVE'
      ) {
        futuresStatus = 'STALE';
        warnings.push(
          `Futures MarketDataService connection is ${futuresFeedConnection}; downgraded LIVE mark status to STALE.`,
        );
      }

      if (validMarkUpdatedAtMs === null || rawMark.status === 'UNAVAILABLE') {
        futuresStatus = 'UNAVAILABLE';
        unavailableFieldReasons.futuresMarkPrice = `No markPrice@1s update has been ingested into FuturesMarkService for ${contractSymbol}.`;
        unavailableFieldReasons.futuresIndexPrice = unavailableFieldReasons.futuresMarkPrice;
        unavailableFieldReasons.fundingRate = unavailableFieldReasons.futuresMarkPrice;
        derivativesInput = {
          status: 'UNAVAILABLE',
          markPrice: null,
          indexPrice: null,
          lastFundingRate: null,
          nextFundingTime: null,
          openInterestSeries: [],
          maxLeverage: futuresContract.row.maxLeverage,
          maintenanceMarginRate: futuresContract.mmr.toFixed(),
          takerFeeRate: this.sources.futures.config.fees.taker.toFixed(),
          updatedAtMs: null,
        };
      } else if (validMarkUpdatedAtMs > asOfMs) {
        futuresStatus = 'STALE';
        futuresMarkAvailability = 'WITHHELD_LOOKAHEAD';
        futuresIndexAvailability = 'WITHHELD_LOOKAHEAD';
        fundingRateAvailability = 'WITHHELD_LOOKAHEAD';
        unavailableFieldReasons.futuresMarkPrice = `Futures markPrice timestamp (${validMarkUpdatedAtMs}) is after asOfMs (${asOfMs}); withheld to prevent look-ahead leakage.`;
        unavailableFieldReasons.futuresIndexPrice = unavailableFieldReasons.futuresMarkPrice;
        unavailableFieldReasons.fundingRate = unavailableFieldReasons.futuresMarkPrice;
        warnings.push(unavailableFieldReasons.futuresMarkPrice);
        derivativesInput = {
          status: 'STALE',
          markPrice: null,
          indexPrice: null,
          lastFundingRate: null,
          nextFundingTime: null,
          openInterestSeries: [],
          maxLeverage: futuresContract.row.maxLeverage,
          maintenanceMarginRate: futuresContract.mmr.toFixed(),
          takerFeeRate: this.sources.futures.config.fees.taker.toFixed(),
          updatedAtMs: validMarkUpdatedAtMs,
        };
      } else {
        const markLagMs = Math.max(0, asOfMs - validMarkUpdatedAtMs);
        if (futuresStatus === 'LIVE' && markLagMs > staleThresholdMs) {
          futuresStatus = 'STALE';
        }
        const fieldStage: MarketFieldAvailability =
          futuresStatus === 'LIVE' ? 'AVAILABLE' : 'STALE';

        const multDec = dec(String(futuresMultiplier));
        let normalizedMarkPrice: string | null = null;
        if (isPositiveDecimal(rawMark.markPrice)) {
          normalizedMarkPrice =
            futuresMultiplier > 1
              ? dec(rawMark.markPrice).div(multDec).toFixed()
              : dec(rawMark.markPrice).toFixed();
          futuresMarkAvailability = fieldStage;
        } else {
          futuresMarkAvailability = 'WITHHELD_INVALID';
          unavailableFieldReasons.futuresMarkPrice = `Invalid futures markPrice ("${String(rawMark.markPrice)}").`;
        }

        let normalizedIndexPrice: string | null = null;
        if (isPositiveDecimal(rawMark.indexPrice)) {
          normalizedIndexPrice =
            futuresMultiplier > 1
              ? dec(rawMark.indexPrice).div(multDec).toFixed()
              : dec(rawMark.indexPrice).toFixed();
          futuresIndexAvailability = fieldStage;
        } else {
          futuresIndexAvailability = 'WITHHELD_INVALID';
          unavailableFieldReasons.futuresIndexPrice = `Invalid futures indexPrice ("${String(rawMark.indexPrice)}").`;
        }

        // Preserve '0' / '0.00000000' funding rate!
        let normalizedFundingRate: string | null = null;
        if (isValidDecimal(rawMark.fundingRate)) {
          normalizedFundingRate = dec(rawMark.fundingRate).toFixed();
          fundingRateAvailability = fieldStage;
        } else {
          fundingRateAvailability = 'UNAVAILABLE';
          unavailableFieldReasons.fundingRate = 'Funding rate is null or non-decimal.';
        }

        const parsedNextFunding =
          rawMark.nextFundingTime !== null ? Date.parse(rawMark.nextFundingTime) : NaN;
        const nextFundingTime =
          Number.isFinite(parsedNextFunding) && parsedNextFunding > 0
            ? Math.trunc(parsedNextFunding)
            : null;

        if (futuresMultiplier > 1 && (normalizedMarkPrice || normalizedIndexPrice)) {
          warnings.push(
            `Normalized ${contractSymbol} futures prices by contract multiplier (1/${futuresMultiplier}) to match per-unit ${spotSymbol} Spot scale.`,
          );
        }

        derivativesInput = {
          status: futuresStatus,
          markPrice: normalizedMarkPrice,
          indexPrice: normalizedIndexPrice,
          lastFundingRate: normalizedFundingRate,
          nextFundingTime,
          openInterestSeries: [],
          maxLeverage: futuresContract.row.maxLeverage,
          maintenanceMarginRate: futuresContract.mmr.toFixed(),
          takerFeeRate: this.sources.futures.config.fees.taker.toFixed(),
          updatedAtMs: validMarkUpdatedAtMs,
        };
      }

      const contractInfo = this.sources.futures.config.toInfo(futuresContract);
      resolvedFuturesTradeBlock = futuresTradeBlock(exchangeStatus, contractInfo, {
        status: futuresStatus,
      });
    }

    // 8. Build snapshot via buildCryptoMarketSnapshot
    const effectiveSpotStatusForBlock: DataStatus =
      orderBookAvailability === 'AVAILABLE' || tickerAvailability === 'AVAILABLE'
        ? rawSpotStatus
        : rawSpotStatus === 'LIVE'
          ? 'STALE'
          : rawSpotStatus;
    const resolvedSpotTradeBlock = spotTradeBlock(spotSymbol, exchangeStatus, {
      status: effectiveSpotStatusForBlock,
    });

    const { snapshot, snapshotHash } = buildCryptoMarketSnapshot({
      symbol: spotSymbol,
      interval,
      asOfMs,
      maxAllowedStalenessMs: staleThresholdMs,
      spotDataStatus: effectiveSpotStatusForBlock,
      futuresDataStatus: futuresStatus,
      spotTradeBlock: resolvedSpotTradeBlock,
      futuresTradeBlock: resolvedFuturesTradeBlock,
      rules,
      spot: {
        lastPrice,
        bestBid,
        bestAsk,
        priceChangePct24h,
        quoteVolume24h,
        tickerUpdatedAtMs: validTickerUpdatedAtMs,
        bookUpdatedAtMs: validBookUpdatedAtMs,
        bids: sanitizedBids,
        asks: sanitizedAsks,
        recentTrades: sanitizedTrades,
        candles: sanitizedCandleInputs,
      },
      derivatives: derivativesInput,
      onChainAndMacro: null,
      portfolio: opts.portfolio ?? { provided: false },
    });

    const closedCandlesRetained = snapshot.spot.closedCandles.length;
    const closedCandlesAvailability: MarketFieldAvailability =
      closedCandlesRetained > 0
        ? 'AVAILABLE'
        : futureCandlesCount > 0
          ? 'WITHHELD_LOOKAHEAD'
          : 'UNAVAILABLE';
    if (closedCandlesAvailability === 'UNAVAILABLE') {
      unavailableFieldReasons.closedCandles = `No closed ${interval} candles <= asOfMs were returned by CandleService for ${spotSymbol}.`;
    }

    const mergedWarnings = [
      ...warnings,
      ...snapshot.timestampAlignment.warnings.filter((w) => !warnings.includes(w)),
    ];

    const provenance: MarketSnapshotProvenance = {
      requestedSymbol,
      spotSymbol,
      futuresSymbol,
      futuresMultiplier,
      interval,
      asOfMs,
      asOf: snapshot.asOf,
      spotFeedConnection: spotConnection,
      futuresFeedConnection,
      fields: {
        closedCandles: closedCandlesAvailability,
        ticker: tickerAvailability,
        orderBookDepth: orderBookAvailability,
        recentTrades: recentTradesAvailability,
        futuresMarkPrice: futuresMarkAvailability,
        futuresIndexPrice: futuresIndexAvailability,
        fundingRate: fundingRateAvailability,
        openInterest: openInterestAvailability,
        onChainAndMacro: onChainAndMacroAvailability,
      },
      counts: {
        rawCandlesFetched: combinedRawCandles.length,
        closedCandlesRetained,
        unclosedCandlesFiltered: unclosedCandlesCount,
        futureCandlesFiltered: futureCandlesCount,
        corruptCandlesFiltered,
        bidsRetained: sanitizedBids.length,
        asksRetained: sanitizedAsks.length,
        invalidBookLevelsFiltered,
        crossedBookDetected,
        rawTradesFetched: rawTrades.length,
        tradesRetained: snapshot.spot.recentTrades.length,
        futureTradesFiltered,
        invalidTradesFiltered,
      },
      unavailableFieldReasons,
      warnings: mergedWarnings,
    };

    return {
      snapshot,
      snapshotHash,
      provenance,
    };
  }
}
