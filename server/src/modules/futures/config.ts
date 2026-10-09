import { asc, sql } from 'drizzle-orm';
import { MAX_LEVERAGE, type FuturesFees, type FuturesSymbolInfo } from '@cex/contracts';
import { AMOUNT_SCALE, dec, stepDecimals, type Dec, type SymbolRules } from '@cex/core';
import { futuresSymbols } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import { logger } from '../../logger.ts';
import type { ExchangeConfig } from '../exchange/exchangeConfig.ts';

export type FuturesSymbolRow = typeof futuresSymbols.$inferSelect;

export interface LoadedContract {
  row: FuturesSymbolRow;
  rules: SymbolRules;
  tick: Dec;
  step: Dec;
  mmr: Dec;
}

/**
 * Cached futures contract rules (+ fees from the exchange settings row).
 * reload() after any admin change, like ExchangeConfig.
 */
export class FuturesConfig {
  private map = new Map<string, LoadedContract>();

  constructor(
    private readonly db: Db,
    readonly exchange: ExchangeConfig,
  ) {}

  async reload(): Promise<void> {
    const rows = await this.db.select().from(futuresSymbols).orderBy(asc(futuresSymbols.sortOrder), asc(futuresSymbols.symbol));
    this.map = new Map(
      rows.map((row) => [
        row.symbol,
        {
          row,
          rules: { symbol: row.symbol, baseAsset: row.baseAsset, quoteAsset: row.quoteAsset, tickSize: row.tickSize, stepSize: row.stepSize, minQty: row.minQty, maxQty: row.maxQty, minNotional: row.minNotional },
          tick: dec(row.tickSize),
          step: dec(row.stepSize),
          mmr: dec(row.maintenanceMarginRate),
        },
      ]),
    );
  }

  all(): LoadedContract[] {
    return [...this.map.values()];
  }

  find(symbol: string): LoadedContract | undefined {
    return this.map.get(symbol);
  }

  get(symbol: string): LoadedContract {
    const c = this.map.get(symbol);
    if (!c) throw new AppError('NOT_FOUND', `Unknown futures symbol ${symbol}`);
    return c;
  }

  get fees(): { maker: Dec; taker: Dec; liquidation: Dec } {
    const s = this.exchange.settings;
    return { maker: dec(s.futuresMakerFee), taker: dec(s.futuresTakerFee), liquidation: dec(s.futuresLiquidationFee) };
  }

  feesInfo(): FuturesFees {
    const f = this.fees;
    return { makerFee: f.maker.toFixed(), takerFee: f.taker.toFixed(), liquidationFee: f.liquidation.toFixed() };
  }

  isEnabled(c: LoadedContract): boolean {
    return c.row.enabled && c.row.sourceStatus === 'TRADING' && isExactContract(c);
  }

  /** Throws unless new orders on this contract are allowed right now (halt is shared with spot). */
  requireTradable(symbol: string): LoadedContract {
    if (this.exchange.tradingHalted) throw new AppError('TRADING_HALTED', 'Trading is halted by the operator');
    const c = this.get(symbol);
    if (!this.isEnabled(c)) throw new AppError('SYMBOL_DISABLED', `${symbol} is not tradable`);
    return c;
  }

  toInfo(c: LoadedContract): FuturesSymbolInfo {
    return {
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
      maxLeverage: Math.min(c.row.maxLeverage, MAX_LEVERAGE),
      maintenanceMarginRate: c.mmr.toFixed(),
      enabled: this.isEnabled(c),
    };
  }
}

/** Same rule as spot: price × quantity exact at 8 dp, so margins and PnL never need extra rounding. */
export function isExactContract(c: Pick<LoadedContract, 'tick' | 'step'>): boolean {
  return c.tick.decimalPlaces() + c.step.decimalPlaces() <= AMOUNT_SCALE;
}

interface BinanceFuturesSymbol {
  symbol: string;
  status: string;
  contractType: string;
  baseAsset: string;
  quoteAsset: string;
  filters: { filterType: string; tickSize?: string; stepSize?: string; minQty?: string; maxQty?: string; notional?: string }[];
}

/** Default maintenance margin rate: majors 0.4 %, everything else 0.5 % (admin can change it). */
export const defaultMmr = (underlying: string) => (underlying === 'BTC' || underlying === 'ETH' ? '0.004' : '0.005');

/**
 * Upserts a USDT perpetual for every listed spot coin (BTC → BTCUSDT, PEPE → 1000PEPEUSDT).
 * Rules come from Binance; admin fields (enabled, maxLeverage, maintenance margin rate) are only set on insert.
 */
export async function syncFuturesFromBinance(db: Db, restUrl: string, spotBases: string[]): Promise<number> {
  const res = await fetch(`${restUrl}/fapi/v1/exchangeInfo`);
  if (!res.ok) throw new Error(`futures exchangeInfo HTTP ${res.status}`);
  const data = (await res.json()) as { symbols: BinanceFuturesSymbol[] };
  const perps = new Map(data.symbols.filter((s) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT').map((s) => [s.symbol, s]));
  let n = 0;
  const missing: string[] = [];
  for (const [i, base] of spotBases.entries()) {
    const s = perps.get(`${base}USDT`) ?? perps.get(`1000${base}USDT`);
    if (!s) {
      missing.push(base);
      continue;
    }
    const f = (t: string) => s.filters.find((x) => x.filterType === t);
    const price = f('PRICE_FILTER');
    const lot = f('LOT_SIZE');
    const notional = f('MIN_NOTIONAL');
    if (!price?.tickSize || !lot?.stepSize || !lot.minQty || !lot.maxQty || !notional?.notional) {
      logger.warn({ symbol: s.symbol }, 'futures exchangeInfo missing filters; skipped');
      continue;
    }
    const rules = {
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      underlyingAsset: base,
      multiplier: s.baseAsset.startsWith('1000') && s.baseAsset !== base ? 1000 : 1,
      tickSize: price.tickSize,
      stepSize: lot.stepSize,
      minQty: lot.minQty,
      maxQty: lot.maxQty,
      minNotional: notional.notional,
      sourceStatus: s.status,
      sortOrder: i,
    };
    await db
      .insert(futuresSymbols)
      .values({ symbol: s.symbol, ...rules, maintenanceMarginRate: defaultMmr(base) })
      .onConflictDoUpdate({ target: futuresSymbols.symbol, set: { ...rules, updatedAt: sql`now()` } });
    n++;
  }
  if (missing.length) logger.warn({ missing }, 'no USDT perpetual on Binance for these coins');
  return n;
}
