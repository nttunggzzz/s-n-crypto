import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ExchangeInfo, SymbolInfo, Ticker, MarketStatus } from '@cex/contracts';
import type { RealtimeClient, RealtimeStatus } from '@cex/contracts';
import { getApiClient, getRealtimeClient } from '../services/api.ts';

interface MarketContextType {
  exchangeInfo: ExchangeInfo | null;
  symbols: SymbolInfo[];
  tickers: Record<string, Ticker>;
  activeSymbol: string;
  activeSymbolInfo: SymbolInfo | null;
  activeTicker: Ticker | null;
  connectionStatus: RealtimeStatus;
  marketStatus: MarketStatus | null;
  tradingHalted: boolean;
  isLoading: boolean;
  error: string | null;
  setActiveSymbol: (symbol: string) => void;
  refreshMarketData: () => Promise<void>;
  realtimeClient: RealtimeClient | null;
}

const MarketContext = createContext<MarketContextType | null>(null);

export const MarketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [exchangeInfo, setExchangeInfo] = useState<ExchangeInfo | null>(null);
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const [activeSymbol, setActiveSymbolState] = useState<string>('BTCUSDT');
  const [connectionStatus, setConnectionStatus] = useState<RealtimeStatus>('connecting');
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeClient, setRealtimeClient] = useState<RealtimeClient | null>(null);

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

      const tickerMap: Record<string, Ticker> = {};
      tickersRes.items.forEach((t) => {
        tickerMap[t.symbol] = t;
      });
      setTickers(tickerMap);
    } catch {
      setError('Không thể tải dữ liệu thị trường.');
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  // Initial fetch
  useEffect(() => {
    const savedSymbol = localStorage.getItem('cex_active_symbol');
    if (savedSymbol) {
      setActiveSymbolState(savedSymbol);
    }
    refreshMarketData();
  }, [refreshMarketData]);

  // Initialize Realtime WebSocket and subscriptions
  useEffect(() => {
    let unsubs: (() => void)[] = [];
    let rt: RealtimeClient | null = null;

    async function initRealtime() {
      try {
        rt = await getRealtimeClient();
        setRealtimeClient(rt);

        // Track connection status
        unsubs.push(rt.onStatus((status) => setConnectionStatus(status)));

        // Subscribe to market:status
        unsubs.push(
          rt.subscribe('market:status', (data) => {
            setMarketStatus(data);
          })
        );

        // Subscribe to ticker for all known symbols
        const currentSymbols = symbols.length > 0 ? symbols.map((s) => s.symbol) : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'SUIUSDT'];
        currentSymbols.forEach((sym) => {
          unsubs.push(
            rt!.subscribe(`ticker:${sym}`, (data) => {
              setTickers((prev) => ({
                ...prev,
                [sym]: data,
              }));
            })
          );
        });
      } catch {
        setConnectionStatus('closed');
      }
    }

    initRealtime();

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [symbols]);

  const activeSymbolInfo = symbols.find((s) => s.symbol === activeSymbol) || null;
  const activeTicker = tickers[activeSymbol] || null;

  const tradingHalted = exchangeInfo?.tradingHalted || false;

  return (
    <MarketContext.Provider
      value={{
        exchangeInfo,
        symbols,
        tickers,
        activeSymbol,
        activeSymbolInfo,
        activeTicker,
        connectionStatus,
        marketStatus,
        tradingHalted,
        isLoading,
        error,
        setActiveSymbol,
        refreshMarketData,
        realtimeClient,
      }}
    >
      {children}
    </MarketContext.Provider>
  );
};

export const useMarket = (): MarketContextType => {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error('useMarket must be used within MarketProvider');
  return ctx;
};
