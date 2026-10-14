import { EventEmitter } from 'node:events';
import { asc, eq } from 'drizzle-orm';
import { dec, stepDecimals, type Dec, type SymbolRules, AMOUNT_SCALE } from '@cex/core';
import type { AssetInfo, AssetTag, ExchangeStatus, SymbolInfo, TaxMode, TaxSettings } from '@cex/contracts';
import { assets, exchangeSettings, symbols } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import { logger } from '../../logger.ts';
import type { Alerter } from '../../ops/alerts.ts';

export type SymbolRow = typeof symbols.$inferSelect;
export type SettingsRow = typeof exchangeSettings.$inferSelect;

export interface TaxSettingsState {
  mode: TaxMode;
  rate: Dec;
  vndRate: Dec | null;
  vndRateUpdatedAt: Date | null;
  updatedAt: Date;
}

/** Wait before retry number `attempt` (0-based) of a stuck cache reload: 1 s, 2 s, 4 s ... capped at 30 s. */
export function reloadBackoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000);
}

export interface ExchangeConfigOptions {
  /** Operator alerts: one when the cache gets stuck on old values, one when it recovers. Omitted in tests that do not care. */
  alerter?: Pick<Alerter, 'send'>;
  /** Delay before background retry `attempt` (0-based). Default `reloadBackoffMs`; tests shorten it. */
  retryDelayMs?: (attempt: number) => number;
}

export interface LoadedSymbol {
  row: SymbolRow;
  rules: SymbolRules;
  tick: Dec;
  step: Dec;
}

/**
 * Cached exchange settings + symbol rules + coin info. Single server instance, so the cache is
 * refreshed by calling reload() after any admin change; `changed` fires after every reload.
 */
export class ExchangeConfig extends EventEmitter<{ changed: [] }> {
  private settingsRow!: SettingsRow;
  private symbolMap = new Map<string, LoadedSymbol>();
  private assetMap = new Map<string, AssetInfo>();
  private lastStatusKey = '';
  private statusChangedAt = new Date();

  /** True while a reload after a committed change failed and the cache may still hold OLD settings (tax, fee, halt ...). */
  private staleSince: Date | null = null;
  private retryTimer: NodeJS.Timeout | undefined;
  private retryAttempt = 0;
  private stopped = false;

  constructor(
    private readonly db: Db,
    private readonly opts: ExchangeConfigOptions = {},
  ) {
    super();
  }

  /** The cache could not be refreshed after a committed change and a background retry is running. */
  get stale(): boolean {
    return this.staleSince !== null;
  }

  /** Stops the background retry (server shutdown). */
  stop(): void {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  /** Tail of the reload chain: reloads run one after another, so an older read can never overwrite a newer one. */
  private reloading: Promise<unknown> = Promise.resolve();

  reload(): Promise<void> {
    const run = this.reloading
      .then(
        () => this.load(),
        () => this.load(),
      )
      .then(() => this.markFresh());
    this.reloading = run.catch(() => undefined);
    return run;
  }

  /**
   * Reload after a transaction that already COMMITTED (admin changes). The request must not fail because the cache refresh
   * failed: log, retry once, and if it still fails mark the cache `stale`, alert the operator once and keep retrying in the
   * background (1 s, 2 s, 4 s ... up to 30 s) until a reload works - never throw. Until then the cache holds the OLD values
   * (for tax that means the old rate/mode decides the next fills), so the stuck state must be loud and must heal itself.
   */
  async reloadAfterCommit(): Promise<void> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await this.reload();
        return;
      } catch (err) {
        logger.error({ err, attempt }, 'exchange config reload after commit failed');
      }
    }
    this.markStale();
  }

  private markStale(): void {
    if (this.stopped) return;
    if (this.staleSince === null) {
      this.staleSince = new Date();
      this.retryAttempt = 0;
      logger.error('exchange config cache is STALE: retrying in the background');
      void this.opts.alerter?.send(
        'config-stale',
        'critical',
        'Cache cài đặt sàn (thuế, phí, dừng giao dịch) KẸT giá trị cũ: lưu DB đã xong nhưng nạp lại thất bại 2 lần. Server đang tự thử lại (1 s, 2 s, 4 s ... tối đa 30 s).',
        true,
      );
    }
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer) return;
    const delay = (this.opts.retryDelayMs ?? reloadBackoffMs)(this.retryAttempt);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.reload().then(
        () => undefined, // reload() itself cleared the stale flag
        (err) => {
          logger.error({ err, attempt: this.retryAttempt + 1 }, 'exchange config background reload failed');
          this.retryAttempt++;
          if (this.staleSince !== null) this.scheduleRetry();
        },
      );
    }, delay);
    this.retryTimer.unref();
  }

  /** A load just succeeded (from any path): the cache is current again. */
  private markFresh(): void {
    if (this.staleSince === null) return;
    const since = this.staleSince;
    this.staleSince = null;
    this.retryAttempt = 0;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    logger.warn({ staleForMs: Date.now() - since.getTime() }, 'exchange config cache recovered');
    void this.opts.alerter?.send('config-stale', 'info', 'Cache cài đặt sàn đã nạp lại được: giá trị mới đang áp dụng.', true);
  }

  private async load(): Promise<void> {
    const [s] = await this.db.select().from(exchangeSettings).where(eq(exchangeSettings.id, 1));
    if (!s) throw new Error('exchange_settings row missing — run migrations');
    this.settingsRow = s;
    const rows = await this.db.select().from(symbols).orderBy(asc(symbols.sortOrder), asc(symbols.symbol));
    const map = new Map<string, LoadedSymbol>();
    for (const row of rows) {
      const rules: SymbolRules = {
        symbol: row.symbol,
        baseAsset: row.baseAsset,
        quoteAsset: row.quoteAsset,
        tickSize: row.tickSize,
        stepSize: row.stepSize,
        minQty: row.minQty,
        maxQty: row.maxQty,
        minNotional: row.minNotional,
      };
      map.set(row.symbol, { row, rules, tick: dec(row.tickSize), step: dec(row.stepSize) });
    }
    this.symbolMap = map;
    const assetRows = await this.db.select().from(assets);
    this.assetMap = new Map(assetRows.map((a) => [a.asset, { asset: a.asset, name: a.name, tags: a.tags as AssetTag[], description: a.description }]));
    const key = this.statusKey();
    if (key !== this.lastStatusKey) {
      this.lastStatusKey = key;
      this.statusChangedAt = new Date();
    }
    this.emit('changed');
  }

  get settings(): SettingsRow {
    return this.settingsRow;
  }

  get feeRate(): Dec {
    return dec(this.settingsRow.feeRate);
  }

  get tradingHalted(): boolean {
    return this.settingsRow.tradingHalted;
  }

  /**
   * Vietnam tax settings in force (module T §3.1), cached like feeRate and refreshed by reload() after the admin's
   * transaction commits. settleFills reads them at the fill (a fill in the same instant as a change may still use
   * the previous value, exactly like feeRate).
   */
  get tax(): TaxSettingsState {
    const s = this.settingsRow;
    return {
      mode: s.taxMode,
      rate: dec(s.taxRate),
      vndRate: s.taxVndRate === null ? null : dec(s.taxVndRate),
      vndRateUpdatedAt: s.taxVndRateUpdatedAt,
      updatedAt: s.taxUpdatedAt,
    };
  }

  /** Contract `TaxSettings` (admin) — the same values exchangeInfo publishes. */
  taxSettings(): TaxSettings {
    const t = this.tax;
    return {
      taxMode: t.mode,
      taxRate: t.rate.toFixed(),
      taxVndRate: t.vndRate === null ? null : t.vndRate.toFixed(),
      taxVndRateUpdatedAt: t.vndRateUpdatedAt?.toISOString() ?? null,
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  allSymbols(): LoadedSymbol[] {
    return [...this.symbolMap.values()];
  }

  findSymbol(symbol: string): LoadedSymbol | undefined {
    return this.symbolMap.get(symbol);
  }

  /** Throws unless new orders on this symbol are allowed right now. */
  requireTradable(symbol: string): LoadedSymbol {
    if (this.tradingHalted) throw new AppError('TRADING_HALTED', 'Trading is halted by the operator');
    const s = this.symbolMap.get(symbol);
    if (!s) throw new AppError('NOT_FOUND', `Unknown symbol ${symbol}`);
    if (!s.row.enabled || s.row.sourceStatus !== 'TRADING' || !isExactPair(s)) {
      throw new AppError('SYMBOL_DISABLED', `${symbol} is not tradable`);
    }
    return s;
  }

  /** Coin info for every asset used by the listed pairs (base and quote), in symbol order. */
  assetInfos(): AssetInfo[] {
    const seen = new Set<string>();
    for (const s of this.symbolMap.values()) seen.add(s.row.baseAsset).add(s.row.quoteAsset);
    return [...seen].map((asset) => this.assetInfo(asset));
  }

  assetInfo(asset: string): AssetInfo {
    return this.assetMap.get(asset) ?? { asset, name: null, tags: [], description: null };
  }

  /** True when the asset is used by a listed pair or has stored info. */
  knowsAsset(asset: string): boolean {
    return this.assetMap.has(asset) || this.allSymbols().some((s) => s.row.baseAsset === asset || s.row.quoteAsset === asset);
  }

  exchangeStatus(): ExchangeStatus {
    const t = this.tax;
    return {
      tradingHalted: this.tradingHalted,
      disabledSymbols: this.disabledSymbols(),
      taxMode: t.mode,
      taxRate: t.rate.toFixed(),
      taxVndRate: t.vndRate === null ? null : t.vndRate.toFixed(),
      updatedAt: this.statusChangedAt.toISOString(),
    };
  }

  /** Changes only when the halt switch, the set of disabled pairs or the tax mode / rate / VND rate changes. */
  statusKey(): string {
    const t = this.tax;
    return JSON.stringify([this.tradingHalted, this.disabledSymbols(), t.mode, t.rate.toFixed(), t.vndRate === null ? null : t.vndRate.toFixed()]);
  }

  private disabledSymbols(): string[] {
    return this.allSymbols()
      .filter((s) => !this.toSymbolInfo(s).enabled)
      .map((s) => s.row.symbol);
  }

  toSymbolInfo(s: LoadedSymbol): SymbolInfo {
    return {
      symbol: s.row.symbol,
      baseAsset: s.row.baseAsset,
      quoteAsset: s.row.quoteAsset,
      tickSize: s.tick.toFixed(),
      stepSize: s.step.toFixed(),
      minQty: dec(s.row.minQty).toFixed(),
      maxQty: dec(s.row.maxQty).toFixed(),
      minNotional: dec(s.row.minNotional).toFixed(),
      pricePrecision: stepDecimals(s.row.tickSize),
      quantityPrecision: stepDecimals(s.row.stepSize),
      enabled: s.row.enabled && s.row.sourceStatus === 'TRADING' && isExactPair(s),
    };
  }
}

/**
 * price * quantity must be exact at 8 decimals so that locks and costs never need rounding.
 * True for all pairs we list (e.g. BTCUSDT tick 0.01 × step 0.00001 → 7 decimals).
 */
export function isExactPair(s: Pick<LoadedSymbol, 'tick' | 'step'>): boolean {
  return s.tick.decimalPlaces() + s.step.decimalPlaces() <= AMOUNT_SCALE;
}
