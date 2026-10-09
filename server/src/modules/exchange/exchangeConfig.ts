import { asc, eq } from 'drizzle-orm';
import { dec, stepDecimals, type Dec, type SymbolRules, AMOUNT_SCALE } from '@cex/core';
import type { SymbolInfo } from '@cex/contracts';
import { exchangeSettings, symbols } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';

export type SymbolRow = typeof symbols.$inferSelect;
export type SettingsRow = typeof exchangeSettings.$inferSelect;

export interface LoadedSymbol {
  row: SymbolRow;
  rules: SymbolRules;
  tick: Dec;
  step: Dec;
}

/**
 * Cached exchange settings + symbol rules. Single server instance, so the cache is
 * refreshed by calling reload() after any admin change.
 */
export class ExchangeConfig {
  private settingsRow!: SettingsRow;
  private symbolMap = new Map<string, LoadedSymbol>();

  constructor(private readonly db: Db) {}

  async reload(): Promise<void> {
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
