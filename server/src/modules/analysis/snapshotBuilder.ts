// Adapted from TauricResearch/TradingAgents v0.6.0 (commit 1394a3f72aa4393e1a98f51b382434c4b4c2d972, Apache-2.0):
// tradingagents/dataflows/date_window.py, tradingagents/dataflows/vendors/yahoo/snapshot.py, tradingagents/portfolio.py.
// Modified (ported to TypeScript, crypto 24/7 epoch-ms clamp, Dec math). See THIRD_PARTY_NOTICES.md.
import { createHash } from 'node:crypto';
import { dec, roundDown, toFixedStr } from '@cex/core';
import {
  CryptoMarketSnapshot,
  type CandleInterval,
  type DataStatus,
  type SnapshotActivePosition,
  type SnapshotBookLevel,
  type SnapshotCandle,
  type SnapshotDerivativesState,
  type SnapshotHeadline,
  type SnapshotOnChainAndMacro,
  type SnapshotPortfolioContext,
  type SnapshotPublicTrade,
  type SnapshotSymbolRules,
} from '@cex/contracts';

export interface RawCandleInput {
  openTime: number;
  closeTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  quoteVolume?: string;
  closed: boolean;
}

export interface BuildCryptoMarketSnapshotInput {
  snapshotId?: string;
  symbol: string;
  interval: CandleInterval;
  /** Point-in-time cutoff epoch ms (prevents look-ahead bias, adapted from upstream `date_window.py`). */
  asOfMs: number;
  maxAllowedStalenessMs?: number;
  spotDataStatus: DataStatus;
  futuresDataStatus?: DataStatus;
  spotTradeBlock?: string | null;
  futuresTradeBlock?: string | null;
  rules: SnapshotSymbolRules;
  spot: {
    lastPrice: string | null;
    bestBid: string | null;
    bestAsk: string | null;
    priceChangePct24h?: string | null;
    quoteVolume24h?: string | null;
    tickerUpdatedAtMs?: number | null;
    bookUpdatedAtMs?: number | null;
    bids: SnapshotBookLevel[];
    asks: SnapshotBookLevel[];
    /** True when `bids`/`asks` were synthesised (historical simulation), not observed from a feed. Default false. */
    orderBookSynthetic?: boolean;
    recentTrades: SnapshotPublicTrade[];
    candles: RawCandleInput[];
  };
  derivatives?: {
    status: DataStatus;
    markPrice: string | null;
    indexPrice: string | null;
    lastFundingRate: string | null;
    nextFundingTime: number | null;
    openInterestSeries: string[];
    maxLeverage?: number;
    maintenanceMarginRate?: string;
    takerFeeRate?: string;
    updatedAtMs?: number | null;
  } | null;
  onChainAndMacro?: {
    status: DataStatus;
    observedAtMs?: number | null;
    marketCapUsd?: string | null;
    realizedCapUsd?: string | null;
    dailyTxVolumeUsd?: string | null;
    exchangeDepositsUsd?: string | null;
    exchangeWithdrawalsUsd?: string | null;
    smartBuysUsd?: string | null;
    smartSellsUsd?: string | null;
    circulatingSupply?: string | null;
    dailyVolumeTokens?: string | null;
    btcTrendScore?: string | null;
    altBreadthScore?: string | null;
    btcDominanceScore?: string | null;
    perpFundingScore?: string | null;
    drawdownVolScore?: string | null;
    momentumThrustScore?: string | null;
    headlines?: SnapshotHeadline[];
  } | null;
  portfolio?: {
    provided: boolean;
    equityUsdt?: string;
    availableUsdt?: string;
    currentDrawdownPct?: string;
    dailyLossPct?: string;
    weeklyLossPct?: string;
    consecutiveLosses?: number;
    activePositions?: SnapshotActivePosition[];
  };
}

/** Computes a deterministic SHA-256 hex digest of an object with sorted keys. */
export function computeDeterministicHash(payload: unknown): string {
  const canonical = JSON.stringify(payload, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Builds a validated, point-in-time `CryptoMarketSnapshot`.
 *
 * Adapted from upstream `TauricResearch/TradingAgents`:
 * - `snapshot.py` (#830): Verifies and freezes authoritative numbers so LLM narratives cannot confabulate prices.
 * - `date_window.py` (#1251): Clamps all candles, trades, and headlines to `<= asOfMs` to prevent look-ahead bias.
 * - `portfolio.py`: 3-state portfolio context (`NOT_PROVIDED` | `FLAT` | `ACTIVE_POSITIONS`) + SHA-256 fingerprint.
 */
export function buildCryptoMarketSnapshot(input: BuildCryptoMarketSnapshotInput): {
  snapshot: CryptoMarketSnapshot;
  snapshotHash: string;
} {
  const asOfMs = Math.trunc(input.asOfMs);
  const asOf = new Date(asOfMs).toISOString();
  const maxAllowedStalenessMs = input.maxAllowedStalenessMs ?? 15_000;
  const warnings: string[] = [];

  let unclosedCandlesFiltered = 0;
  let lookaheadItemsFiltered = 0;

  // 1. Filter candles: ONLY closed candles (`closed === true`) with `closeTime <= asOfMs`
  const closedCandles: SnapshotCandle[] = [];
  for (const c of input.spot.candles) {
    if (!c.closed) {
      unclosedCandlesFiltered++;
      continue;
    }
    if (c.closeTime > asOfMs || c.openTime > asOfMs) {
      lookaheadItemsFiltered++;
      continue;
    }
    const quoteVolume =
      c.quoteVolume !== undefined
        ? c.quoteVolume
        : toFixedStr(
            roundDown(
              dec(c.high).add(dec(c.low)).add(dec(c.close)).div(3).mul(dec(c.volume)),
              8,
            ),
          );
    closedCandles.push({
      openTime: c.openTime,
      closeTime: c.closeTime,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      quoteVolume,
      closed: true,
    });
  }
  closedCandles.sort((a, b) => a.openTime - b.openTime);

  // 2. Filter public trades: ONLY trades with `time <= asOfMs`
  const recentTrades: SnapshotPublicTrade[] = [];
  for (const t of input.spot.recentTrades) {
    if (t.time > asOfMs) {
      lookaheadItemsFiltered++;
      continue;
    }
    recentTrades.push(t);
  }

  // 3. Filter headlines: ONLY headlines with `publishedAt <= asOfMs`
  let onChainAndMacro: SnapshotOnChainAndMacro | null = null;
  if (input.onChainAndMacro) {
    const rawHeadlines = input.onChainAndMacro.headlines ?? [];
    const safeHeadlines: SnapshotHeadline[] = [];
    for (const h of rawHeadlines) {
      const pubMs = Date.parse(h.publishedAt);
      if (Number.isFinite(pubMs) && pubMs > asOfMs) {
        lookaheadItemsFiltered++;
        continue;
      }
      safeHeadlines.push(h);
    }

    const obsMs = input.onChainAndMacro.observedAtMs ?? null;
    // Fail closed: without an observation time the block cannot be checked against asOfMs, so it is withheld too.
    if (obsMs === null || obsMs > asOfMs) {
      if (obsMs === null) {
        warnings.push('On-chain/macro snapshot has no observedAt; withheld because it cannot be checked against asOfMs.');
      } else {
        lookaheadItemsFiltered++;
        warnings.push(`On-chain/macro snapshot timestamp (${obsMs}) is after asOfMs (${asOfMs}); withheld to prevent look-ahead bias.`);
      }
      onChainAndMacro = {
        status: 'UNAVAILABLE',
        observedAt: null,
        marketCapUsd: null,
        realizedCapUsd: null,
        dailyTxVolumeUsd: null,
        exchangeDepositsUsd: null,
        exchangeWithdrawalsUsd: null,
        smartBuysUsd: null,
        smartSellsUsd: null,
        circulatingSupply: null,
        dailyVolumeTokens: null,
        btcTrendScore: null,
        altBreadthScore: null,
        btcDominanceScore: null,
        perpFundingScore: null,
        drawdownVolScore: null,
        momentumThrustScore: null,
        headlines: [],
      };
    } else {
      onChainAndMacro = {
        status: input.onChainAndMacro.status,
        observedAt: new Date(obsMs).toISOString(),
        marketCapUsd: input.onChainAndMacro.marketCapUsd ?? null,
        realizedCapUsd: input.onChainAndMacro.realizedCapUsd ?? null,
        dailyTxVolumeUsd: input.onChainAndMacro.dailyTxVolumeUsd ?? null,
        exchangeDepositsUsd: input.onChainAndMacro.exchangeDepositsUsd ?? null,
        exchangeWithdrawalsUsd: input.onChainAndMacro.exchangeWithdrawalsUsd ?? null,
        smartBuysUsd: input.onChainAndMacro.smartBuysUsd ?? null,
        smartSellsUsd: input.onChainAndMacro.smartSellsUsd ?? null,
        circulatingSupply: input.onChainAndMacro.circulatingSupply ?? null,
        dailyVolumeTokens: input.onChainAndMacro.dailyVolumeTokens ?? null,
        btcTrendScore: input.onChainAndMacro.btcTrendScore ?? null,
        altBreadthScore: input.onChainAndMacro.altBreadthScore ?? null,
        btcDominanceScore: input.onChainAndMacro.btcDominanceScore ?? null,
        perpFundingScore: input.onChainAndMacro.perpFundingScore ?? null,
        drawdownVolScore: input.onChainAndMacro.drawdownVolScore ?? null,
        momentumThrustScore: input.onChainAndMacro.momentumThrustScore ?? null,
        headlines: safeHeadlines,
      };
    }
  }

  if (lookaheadItemsFiltered > 0) {
    warnings.push(`Filtered ${lookaheadItemsFiltered} look-ahead data item(s) with timestamp > asOfMs (${asOf}).`);
  }
  if (unclosedCandlesFiltered > 0) {
    warnings.push(`Filtered ${unclosedCandlesFiltered} unclosed in-progress candle(s) to preserve closed-bar determinism.`);
  }

  // 4. Compute timestamp alignment & staleness lag
  const lags: number[] = [];
  let hasFutureFeedTimestamp = false;
  if (input.spot.tickerUpdatedAtMs !== undefined && input.spot.tickerUpdatedAtMs !== null) {
    if (input.spot.tickerUpdatedAtMs > asOfMs) {
      hasFutureFeedTimestamp = true;
      lookaheadItemsFiltered++;
      warnings.push(`Ticker updatedAt (${input.spot.tickerUpdatedAtMs}) exceeds asOfMs (${asOfMs}); flagged as future-dated.`);
    } else {
      lags.push(Math.max(0, asOfMs - input.spot.tickerUpdatedAtMs));
    }
  }
  if (input.spot.bookUpdatedAtMs !== undefined && input.spot.bookUpdatedAtMs !== null) {
    if (input.spot.bookUpdatedAtMs > asOfMs) {
      hasFutureFeedTimestamp = true;
      lookaheadItemsFiltered++;
      warnings.push(`Orderbook updatedAt (${input.spot.bookUpdatedAtMs}) exceeds asOfMs (${asOfMs}); flagged as future-dated.`);
    } else {
      lags.push(Math.max(0, asOfMs - input.spot.bookUpdatedAtMs));
    }
  }
  if (input.derivatives?.updatedAtMs !== undefined && input.derivatives?.updatedAtMs !== null) {
    if (input.derivatives.updatedAtMs > asOfMs) {
      hasFutureFeedTimestamp = true;
      lookaheadItemsFiltered++;
      warnings.push(`Derivatives updatedAt (${input.derivatives.updatedAtMs}) exceeds asOfMs (${asOfMs}); flagged as future-dated.`);
    } else {
      lags.push(Math.max(0, asOfMs - input.derivatives.updatedAtMs));
    }
  }

  const observedMaxLagMs = lags.length > 0 ? Math.max(...lags) : 0;
  let effectiveSpotStatus: DataStatus = input.spotDataStatus;
  if (effectiveSpotStatus === 'LIVE' && observedMaxLagMs > maxAllowedStalenessMs) {
    effectiveSpotStatus = 'STALE';
    warnings.push(`Observed market feed lag (${observedMaxLagMs}ms) exceeds maxAllowedStalenessMs (${maxAllowedStalenessMs}ms); downgraded to STALE.`);
  }
  if (hasFutureFeedTimestamp && effectiveSpotStatus === 'LIVE') {
    effectiveSpotStatus = 'STALE';
    warnings.push('Feed timestamp is future-dated (> asOfMs); downgraded to STALE to prevent look-ahead leakage.');
  }

  const aligned =
    effectiveSpotStatus === 'LIVE' &&
    !hasFutureFeedTimestamp &&
    observedMaxLagMs <= maxAllowedStalenessMs;

  // 5. Derivatives state
  let futuresStatus: DataStatus = input.futuresDataStatus ?? input.derivatives?.status ?? 'UNAVAILABLE';
  if (
    futuresStatus === 'LIVE' &&
    input.derivatives?.updatedAtMs !== undefined &&
    input.derivatives?.updatedAtMs !== null
  ) {
    if (input.derivatives.updatedAtMs > asOfMs) {
      futuresStatus = 'STALE';
    } else if (asOfMs - input.derivatives.updatedAtMs > maxAllowedStalenessMs) {
      futuresStatus = 'STALE';
    }
  }
  const derivatives: SnapshotDerivativesState | null = input.derivatives
    ? {
        status: futuresStatus,
        markPrice: input.derivatives.markPrice,
        indexPrice: input.derivatives.indexPrice,
        lastFundingRate: input.derivatives.lastFundingRate,
        nextFundingTime:
          input.derivatives.nextFundingTime !== null ? new Date(input.derivatives.nextFundingTime).toISOString() : null,
        openInterestSeries: input.derivatives.openInterestSeries,
        // Contract parameters come from the futures config; when the caller has none they stay null (no guessed defaults).
        maxLeverage: input.derivatives.maxLeverage ?? null,
        maintenanceMarginRate: input.derivatives.maintenanceMarginRate ?? null,
        takerFeeRate: input.derivatives.takerFeeRate ?? null,
        updatedAt:
          input.derivatives.updatedAtMs !== undefined && input.derivatives.updatedAtMs !== null
            ? new Date(input.derivatives.updatedAtMs).toISOString()
            : null,
      }
    : null;

  // 6. Portfolio context & SHA-256 fingerprint (upstream `portfolio.py`).
  // "Not provided" is not a flat, zero-drawdown account: every figure the caller did not give stays null.
  const provided = input.portfolio?.provided === true ? input.portfolio : null;
  const activePositions = provided?.activePositions ?? [];
  const portfolioStatus: SnapshotPortfolioContext['status'] = !provided
    ? 'NOT_PROVIDED'
    : activePositions.length === 0
      ? 'FLAT'
      : 'ACTIVE_POSITIONS';
  const equityUsdt = provided?.equityUsdt ?? null;
  const availableUsdt = provided?.availableUsdt ?? null;
  const currentDrawdownPct = provided?.currentDrawdownPct ?? null;
  const dailyLossPct = provided?.dailyLossPct ?? null;
  const weeklyLossPct = provided?.weeklyLossPct ?? null;
  const consecutiveLosses = provided?.consecutiveLosses ?? null;

  const portfolioPayloadForHash = {
    status: portfolioStatus,
    equityUsdt,
    availableUsdt,
    currentDrawdownPct,
    dailyLossPct,
    weeklyLossPct,
    consecutiveLosses,
    activePositions,
  };
  const fingerprint = computeDeterministicHash(portfolioPayloadForHash).slice(0, 32);

  const portfolio: SnapshotPortfolioContext = {
    ...portfolioPayloadForHash,
    fingerprint,
  };

  const rawSnapshot = {
    snapshotId: input.snapshotId ?? `snap-${input.symbol.toLowerCase()}-${asOfMs}`,
    symbol: input.symbol,
    interval: input.interval,
    asOf,
    asOfMs,
    spotDataStatus: effectiveSpotStatus,
    futuresDataStatus: futuresStatus,
    spotTradeBlock: input.spotTradeBlock ?? null,
    futuresTradeBlock: input.futuresTradeBlock ?? null,
    rules: input.rules,
    spot: {
      lastPrice: input.spot.lastPrice,
      bestBid: input.spot.bestBid,
      bestAsk: input.spot.bestAsk,
      priceChangePct24h: input.spot.priceChangePct24h ?? null,
      quoteVolume24h: input.spot.quoteVolume24h ?? null,
      tickerUpdatedAt:
        input.spot.tickerUpdatedAtMs !== undefined && input.spot.tickerUpdatedAtMs !== null
          ? new Date(input.spot.tickerUpdatedAtMs).toISOString()
          : null,
      bookUpdatedAt:
        input.spot.bookUpdatedAtMs !== undefined && input.spot.bookUpdatedAtMs !== null
          ? new Date(input.spot.bookUpdatedAtMs).toISOString()
          : null,
      bids: input.spot.bids,
      asks: input.spot.asks,
      orderBookSynthetic: input.spot.orderBookSynthetic ?? false,
      recentTrades,
      closedCandles,
    },
    derivatives,
    onChainAndMacro,
    portfolio,
    timestampAlignment: {
      aligned,
      asOf,
      asOfMs,
      maxAllowedStalenessMs,
      observedMaxLagMs,
      unclosedCandlesFiltered,
      lookaheadItemsFiltered,
      warnings,
    },
  };

  const snapshot = CryptoMarketSnapshot.parse(rawSnapshot);
  const snapshotHash = computeDeterministicHash(snapshot).slice(0, 32);
  return { snapshot, snapshotHash };
}
