/**
 * Framework-free helpers for the UI — the parts that were easy to get wrong (REVIEW-03).
 * Each one works with React's `useSyncExternalStore` where it holds state (subscribe + snapshot getter).
 */
import type { ExchangeStatus, SymbolInfo, Ticker } from './market.ts';
import type { FuturesSymbolInfo, FuturesTicker, MarkPrice } from './futures.ts';
import type { RealtimeClient } from './realtimeClient.ts';

// ───────────────────────────── live prices of every pair

export interface TickerStore<T extends { symbol: string; updatedAt: string | null }> {
  /** Latest ticker of one pair (same object until that pair changes). */
  get(symbol: string): T | undefined;
  /** Every pair known so far — the same array until something changes (safe as a React snapshot). */
  all(): readonly T[];
  /** `cb` runs when `symbol` changes, or when any pair changes if `symbol` is omitted. Returns unsubscribe. */
  subscribe(cb: () => void, symbol?: string): () => void;
  /** Fills in REST data (`tickers()` / `futuresTickers()`); never replaces a newer realtime value. */
  seed(items: readonly T[]): void;
  /** Stops listening to the realtime channel. */
  close(): void;
}

/**
 * One subscription to `tickers` (or `futures:tickers`) for the whole app, instead of one `ticker:<SYMBOL>`
 * channel per pair. Components read their own pair, so a price change re-renders only what shows it:
 *
 *   const t = useSyncExternalStore((cb) => store.subscribe(cb, symbol), () => store.get(symbol));
 */
export function createTickerStore(rt: RealtimeClient, market?: 'spot'): TickerStore<Ticker>;
export function createTickerStore(rt: RealtimeClient, market: 'futures'): TickerStore<FuturesTicker>;
export function createTickerStore(rt: RealtimeClient, market: 'spot' | 'futures' = 'spot'): TickerStore<Ticker> | TickerStore<FuturesTicker> {
  const byId = new Map<string, Ticker>();
  const anyListeners = new Set<() => void>();
  const pairListeners = new Map<string, Set<() => void>>();
  let snapshot: Ticker[] | null = null;

  /** REST data may arrive after the socket's: keep whichever is newer. */
  const seedWins = (next: Ticker, prev: Ticker | undefined) =>
    !prev || prev.updatedAt === null || (next.updatedAt !== null && Date.parse(next.updatedAt) > Date.parse(prev.updatedAt));

  const apply = (items: readonly Ticker[], seeding: boolean) => {
    const changed: string[] = [];
    for (const t of items) {
      if (seeding && !seedWins(t, byId.get(t.symbol))) continue;
      byId.set(t.symbol, t);
      changed.push(t.symbol);
    }
    if (changed.length === 0) return;
    snapshot = null;
    for (const s of changed) pairListeners.get(s)?.forEach((cb) => cb());
    anyListeners.forEach((cb) => cb());
  };

  const channel = market === 'futures' ? 'futures:tickers' : 'tickers';
  const off = rt.subscribe(channel, (batch: { items: Ticker[] }) => apply(batch.items, false));

  const store: TickerStore<Ticker> = {
    get: (symbol) => byId.get(symbol),
    all: () => (snapshot ??= [...byId.values()]),
    subscribe(cb, symbol) {
      if (symbol === undefined) {
        anyListeners.add(cb);
        return () => anyListeners.delete(cb);
      }
      let set = pairListeners.get(symbol);
      if (!set) pairListeners.set(symbol, (set = new Set()));
      set.add(cb);
      return () => {
        set.delete(cb);
        if (set.size === 0) pairListeners.delete(symbol);
      };
    },
    seed: (items) => apply(items, true),
    close: () => off(),
  };
  return store as TickerStore<Ticker> | TickerStore<FuturesTicker>;
}

// ───────────────────────────── spot pair ↔ futures contract

type SpotRef = Pick<SymbolInfo, 'symbol' | 'baseAsset'>;
type ContractRef = Pick<FuturesSymbolInfo, 'symbol' | 'underlyingAsset'>;

/**
 * The futures contract to open for a URL / spot symbol: a contract symbol stays as is; a spot pair maps by
 * coin (PEPEUSDT → 1000PEPEUSDT, because the contract trades 1000 PEPE per unit). Null when there is none.
 */
export function resolveFuturesSymbol(requested: string, contracts: readonly ContractRef[], spotPairs: readonly SpotRef[]): string | null {
  const wanted = requested.toUpperCase();
  if (contracts.some((c) => c.symbol === wanted)) return wanted;
  const spot = spotPairs.find((s) => s.symbol === wanted);
  return (spot && contracts.find((c) => c.underlyingAsset === spot.baseAsset)?.symbol) ?? null;
}

/** The spot pair of the same coin as a futures contract (1000PEPEUSDT → PEPEUSDT), or null. */
export function spotSymbolFor(contract: string, contracts: readonly ContractRef[], spotPairs: readonly SpotRef[]): string | null {
  const c = contracts.find((x) => x.symbol === contract.toUpperCase());
  return (c && spotPairs.find((s) => s.baseAsset === c.underlyingAsset)?.symbol) ?? null;
}

// ───────────────────────────── time

/** "HH:MM:SS" left until `target` (ISO time), "00:00:00" once it has passed, null without a target. */
export function countdown(target: string | null | undefined, now: number = Date.now()): string | null {
  if (!target) return null;
  const ms = Date.parse(target);
  if (Number.isNaN(ms)) return null;
  const s = Math.max(0, Math.floor((ms - now) / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

// ───────────────────────────── can the user trade right now?

/** Why new orders are refused right now (the server refuses them too), or null when trading is open. */
export type TradeBlock = 'HALTED' | 'PAIR_DISABLED' | 'PRICE_STALE';

/** Spot: halted exchange, a pair turned off (`exchange:status`), or no live price (`ticker.status`). */
export function spotTradeBlock(symbol: string, status: ExchangeStatus | null | undefined, ticker: Pick<Ticker, 'status'> | null | undefined): TradeBlock | null {
  if (status?.tradingHalted) return 'HALTED';
  if (status?.disabledSymbols.includes(symbol)) return 'PAIR_DISABLED';
  if (!ticker || ticker.status !== 'LIVE') return 'PRICE_STALE';
  return null;
}

/** Futures: halted exchange, contract turned off, or the mark price is not live (no fills, no liquidations). */
export function futuresTradeBlock(
  status: Pick<ExchangeStatus, 'tradingHalted'> | null | undefined,
  contract: Pick<FuturesSymbolInfo, 'enabled'> | null | undefined,
  mark: Pick<MarkPrice, 'status'> | null | undefined,
): TradeBlock | null {
  if (status?.tradingHalted) return 'HALTED';
  if (contract && !contract.enabled) return 'PAIR_DISABLED';
  if (!mark || mark.status !== 'LIVE') return 'PRICE_STALE';
  return null;
}

/** Vietnamese label for a TradeBlock (banner / disabled button tooltip). */
export const TRADE_BLOCK_LABELS: Record<TradeBlock, string> = {
  HALTED: 'Sàn đang tạm dừng giao dịch',
  PAIR_DISABLED: 'Cặp này đang tạm ngưng giao dịch',
  PRICE_STALE: 'Giá đang tạm gián đoạn — chưa nhận lệnh',
};

// ───────────────────────────── "load more" lists (nextCursor)

export interface PagerState<T> {
  items: readonly T[];
  hasMore: boolean;
  loading: boolean;
  error: unknown;
}

export interface Pager<T> {
  /** Current state — a new object after every change (safe as a React snapshot). */
  state(): PagerState<T>;
  subscribe(cb: () => void): () => void;
  /** Loads the next page; does nothing while a page is loading or when there is no more. */
  loadMore(): Promise<void>;
  /** Back to empty (e.g. filters changed); a page still loading is ignored. Call loadMore() again. */
  reset(): void;
}

/**
 * Cursor pagination for every list endpoint with `nextCursor` (history, ledger, login history…):
 *
 *   const pager = createPager((cursor) => api.orderHistory({ query: { symbol, cursor, limit: 50 } }));
 *   await pager.loadMore();   // first page; again on "Xem thêm" while state().hasMore
 */
export function createPager<T>(fetchPage: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor: string | null }>): Pager<T> {
  let st: PagerState<T> = { items: [], hasMore: true, loading: false, error: null };
  let cursor: string | undefined;
  let generation = 0;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<PagerState<T>>) => {
    st = { ...st, ...patch };
    listeners.forEach((cb) => cb());
  };
  return {
    state: () => st,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async loadMore() {
      if (st.loading || !st.hasMore) return;
      const gen = generation;
      set({ loading: true, error: null });
      try {
        const page = await fetchPage(cursor);
        if (gen !== generation) return;
        cursor = page.nextCursor ?? undefined;
        set({ items: [...st.items, ...page.items], hasMore: page.nextCursor !== null, loading: false });
      } catch (error) {
        if (gen === generation) set({ loading: false, error });
      }
    },
    reset() {
      generation++;
      cursor = undefined;
      set({ items: [], hasMore: true, loading: false, error: null });
    },
  };
}

// ───────────────────────────── files

interface DownloadDocument {
  createElement(tag: 'a'): { href: string; download: string; style: { display: string }; click(): void; remove(): void };
  body: { appendChild(el: unknown): unknown };
}

/**
 * Saves text as a download in the browser — e.g. the CSV from `api.exportLedger()` (already has the BOM
 * Excel needs for Vietnamese): `saveTextFile(await api.exportLedger({ query }), 'so-cai.csv')`.
 */
export function saveTextFile(text: string, filename: string, type = 'text/csv;charset=utf-8'): void {
  // typed structurally: the server also compiles this package, without the DOM library
  const doc = (globalThis as { document?: DownloadDocument }).document;
  if (!doc) throw new Error('saveTextFile needs a browser');
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
