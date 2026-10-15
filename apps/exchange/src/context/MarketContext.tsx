import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ExchangeInfo, SymbolInfo, Ticker, MarketStatus, ExchangeStatus, TradeBlock } from '@cex/contracts';
import { createTickerStore, type TickerStore, type RealtimeClient, type RealtimeStatus, spotTradeBlock } from '@cex/contracts';
import { getApiClient, getRealtimeClient } from '../services/api.ts';

interface MarketContextType {
  exchangeInfo: ExchangeInfo | null;
  symbols: SymbolInfo[];
  tickers: Record<string, Ticker>;
  tickerStore: TickerStore<Ticker> | null;
  activeSymbol: string;
  activeSymbolInfo: SymbolInfo | null;
  activeTicker: Ticker | null;
  connectionStatus: RealtimeStatus;
  marketStatus: MarketStatus | null;
  exchangeStatus: ExchangeStatus | null;
  tradingHalted: boolean;
  disabledSymbols: string[];
  activeTradeBlock: TradeBlock | null;
  isLoading: boolean;
  error: string | null;
  setActiveSymbol: (symbol: string) => void;
  refreshMarketData: () => Promise<void>;
  realtimeClient: RealtimeClient | null;
  isSymbolDisabled: (symbol: string) => boolean;
}

const MarketContext = createContext<MarketContextType | null>(null);

export const MarketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [exchangeInfo, setExchangeInfo] = useState<ExchangeInfo | null>(null);
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const [tickerStore, setTickerStore] = useState<TickerStore<Ticker> | null>(null);
  const [activeSymbol, setActiveSymbolState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/\/trade\/([A-Z0-9]+)/i);
      if (match && match[1]) return match[1].toUpperCase();
      const saved = localStorage.getItem('cex_active_symbol');
      if (saved) return saved;
    }
    return 'BTCUSDT';
  });
  const [connectionStatus, setConnectionStatus] = useState<RealtimeStatus>('connecting');
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [exchangeStatus, setExchangeStatus] = useState<ExchangeStatus | null>(null);
  const [tradingHalted, setTradingHalted] = useState<boolean>(false);
  const [disabledSymbols, setDisabledSymbols] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeClient, setRealtimeClient] = useState<RealtimeClient | null>(null);

  const tickerStoreRef = useRef<TickerStore<Ticker> | null>(null);
  const api = getApiClient();

  const setActiveSymbol = useCallback((symbol: string) => {
    setActiveSymbolState(symbol);
    try {
      localStorage.setItem('cex_active_symbol', symbol);
    } catch {}
  }, []);

  const refreshMarketData = useCallback(async () => {
    try {
      setError(null);
      const [infoRes, tickersRes] = await Promise.all([
        api.exchangeInfo(),
        api.tickers(),
      ]);

      setExchangeInfo(infoRes);
      setSymbols(infoRes.symbols);
      setTradingHalted(infoRes.tradingHalted);

      const dis = infoRes.symbols.filter((s) => !s.enabled).map((s) => s.symbol);
      setDisabledSymbols(dis);
      setExchangeStatus({
        tradingHalted: infoRes.tradingHalted,
        disabledSymbols: dis,
        taxMode: infoRes.taxMode,
        taxRate: infoRes.taxRate,
        taxVndRate: infoRes.taxVndRate,
        updatedAt: infoRes.serverTime,
      });

      const tickerMap: Record<string, Ticker> = {};
      tickersRes.items.forEach((t) => {
        tickerMap[t.symbol] = t;
      });
      setTickers(tickerMap);

      if (tickerStoreRef.current) {
        tickerStoreRef.current.seed(tickersRes.items);
      }
    } catch {
      setError('Không thể tải dữ liệu thị trường.');
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  // Initial fetch
  useEffect(() => {
    refreshMarketData();
  }, [refreshMarketData]);

  // Initialize Realtime WebSocket and single tickers channel store
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    let storeInstance: TickerStore<Ticker> | null = null;
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      const rtClient = getRealtimeClient();
      setRealtimeClient(rtClient);

      // Track connection status
      unsubs.push(rtClient.onStatus((status) => setConnectionStatus(status)));

      // Create unified TickerStore subscribed to single 'tickers' channel (REVIEW-03 A1)
      storeInstance = createTickerStore(rtClient, 'spot');
      tickerStoreRef.current = storeInstance;
      setTickerStore(storeInstance);

      // Update local tickers map throttled (max once per 500ms) to avoid 50 renders/sec
      unsubs.push(
        storeInstance.subscribe(() => {
          if (!throttleTimer) {
            throttleTimer = setTimeout(() => {
              throttleTimer = null;
              if (storeInstance) {
                const map: Record<string, Ticker> = {};
                for (const t of storeInstance.all()) {
                  map[t.symbol] = t;
                }
                setTickers(map);
              }
            }, 500);
          }
        })
      );

      // Track exchange:status for halts / disabled symbols realtime (REVIEW-03 A6)
      unsubs.push(
        rtClient.subscribe('exchange:status', (status: ExchangeStatus) => {
          setExchangeStatus(status);
          setTradingHalted(status.tradingHalted);
          setDisabledSymbols(status.disabledSymbols || []);
        })
      );

      // Subscribe to market:status
      unsubs.push(
        rtClient.subscribe('market:status', (data) => {
          setMarketStatus(data);
        })
      );
    } catch {
      setConnectionStatus('closed');
    }

    return () => {
      if (throttleTimer) clearTimeout(throttleTimer);
      unsubs.forEach((unsub) => unsub());
      if (storeInstance) {
        storeInstance.close();
      }
    };
  }, []);

  const isSymbolDisabled = useCallback(
    (sym: string) => {
      if (disabledSymbols.includes(sym)) return true;
      const s = symbols.find((x) => x.symbol === sym);
      return s ? !s.enabled : false;
    },
    [disabledSymbols, symbols]
  );

  const activeSymbolInfo = useMemo(() => symbols.find((s) => s.symbol === activeSymbol) || null, [symbols, activeSymbol]);
  const activeTicker = tickers[activeSymbol] || null;
  const activeTradeBlock = useMemo(() => spotTradeBlock(activeSymbol, exchangeStatus, activeTicker), [activeSymbol, exchangeStatus, activeTicker]);

  const value = useMemo(
    () => ({
      exchangeInfo,
      symbols,
      tickers,
      tickerStore,
      activeSymbol,
      activeSymbolInfo,
      activeTicker,
      connectionStatus,
      marketStatus,
      exchangeStatus,
      tradingHalted,
      disabledSymbols,
      activeTradeBlock,
      isLoading,
      error,
      setActiveSymbol,
      refreshMarketData,
      realtimeClient,
      isSymbolDisabled,
    }),
    [
      exchangeInfo,
      symbols,
      tickers,
      tickerStore,
      activeSymbol,
      activeSymbolInfo,
      activeTicker,
      connectionStatus,
      marketStatus,
      exchangeStatus,
      tradingHalted,
      disabledSymbols,
      activeTradeBlock,
      isLoading,
      error,
      setActiveSymbol,
      refreshMarketData,
      realtimeClient,
      isSymbolDisabled,
    ]
  );

  return (
    <MarketContext.Provider value={value}>
      {children}
    </MarketContext.Provider>
  );
};

export const useMarket = (): MarketContextType => {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error('useMarket must be used within MarketProvider');
  return ctx;
};

export function useTicker(symbol: string): Ticker | undefined {
  const { tickerStore } = useMarket();
  return useSyncExternalStore(
    (cb) => (tickerStore ? tickerStore.subscribe(cb, symbol) : () => {}),
    () => (tickerStore ? tickerStore.get(symbol) : undefined)
  );
}

export function useAllTickers(): readonly Ticker[] {
  const { tickerStore } = useMarket();
  return useSyncExternalStore(
    (cb) => (tickerStore ? tickerStore.subscribe(cb) : () => {}),
    () => (tickerStore ? tickerStore.all() : [])
  );
}
