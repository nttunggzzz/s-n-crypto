/**
 * Refreshes src/modules/market/sim/snapshot.json — the pair rules (tick/step/min/max) and reference prices
 * the simulated market feed (MARKET_FEED=sim) starts from. Real Binance rules, so the sim trades exactly
 * like the live exchange; only prices are synthetic. Run: npm run sim:snapshot -w @cex/server
 */
import { writeFileSync } from 'node:fs';
import { loadConfig } from '../src/config.ts';

interface Filter {
  filterType: string;
  tickSize?: string;
  stepSize?: string;
  minQty?: string;
  maxQty?: string;
  minNotional?: string;
  notional?: string;
}
interface Sym {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  contractType?: string;
  filters: Filter[];
}

const cfg = loadConfig();
const get = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
};
const strip = (s: string) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);

const spotInfo = await get<{ symbols: Sym[] }>(`${cfg.BINANCE_REST_URL}/api/v3/exchangeInfo?symbols=${encodeURIComponent(JSON.stringify(cfg.symbols))}`);
const spotPrices = new Map((await get<{ symbol: string; price: string }[]>(`${cfg.BINANCE_REST_URL}/api/v3/ticker/price`)).map((p) => [p.symbol, p.price]));
const spot = cfg.symbols.map((symbol, sortOrder) => {
  const s = spotInfo.symbols.find((x) => x.symbol === symbol);
  if (!s) throw new Error(`${symbol} not on Binance spot`);
  const f = (t: string) => s.filters.find((x) => x.filterType === t)!;
  const lot = f('LOT_SIZE');
  const notional = s.filters.find((x) => x.filterType === 'NOTIONAL') ?? f('MIN_NOTIONAL');
  return {
    symbol,
    baseAsset: s.baseAsset,
    quoteAsset: s.quoteAsset,
    tickSize: strip(f('PRICE_FILTER').tickSize!),
    stepSize: strip(lot.stepSize!),
    minQty: strip(lot.minQty!),
    maxQty: strip(lot.maxQty!),
    minNotional: strip(notional.minNotional!),
    sortOrder,
    price: strip(spotPrices.get(symbol)!),
  };
});

const futInfo = await get<{ symbols: Sym[] }>(`${cfg.BINANCE_FUTURES_REST_URL}/fapi/v1/exchangeInfo`);
const marks = new Map((await get<{ symbol: string; markPrice: string }[]>(`${cfg.BINANCE_FUTURES_REST_URL}/fapi/v1/premiumIndex`)).map((m) => [m.symbol, m.markPrice]));
const perps = new Map(futInfo.symbols.filter((s) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT').map((s) => [s.symbol, s]));
const futures = spot.flatMap((sp, sortOrder) => {
  const base = sp.baseAsset;
  const s = perps.get(`${base}USDT`) ?? perps.get(`1000${base}USDT`);
  if (!s) return [];
  const f = (t: string) => s.filters.find((x) => x.filterType === t)!;
  const lot = f('LOT_SIZE');
  return [
    {
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      underlyingAsset: base,
      multiplier: s.baseAsset.startsWith('1000') && s.baseAsset !== base ? 1000 : 1,
      tickSize: strip(f('PRICE_FILTER').tickSize!),
      stepSize: strip(lot.stepSize!),
      minQty: strip(lot.minQty!),
      maxQty: strip(lot.maxQty!),
      minNotional: strip(f('MIN_NOTIONAL').notional!),
      sortOrder,
      price: strip(marks.get(s.symbol)!),
    },
  ];
});

const out = new URL('../src/modules/market/sim/snapshot.json', import.meta.url);
writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), spot, futures }, null, 1) + '\n');
console.log(`snapshot: ${spot.length} spot pairs, ${futures.length} futures contracts → ${out.pathname}`);
