import React, { createContext, useContext, useEffect, useState } from 'react';
import { getApiClient, getRealtimeClient } from '../services/api';
import type { ExchangeStatus } from '@cex/contracts';

interface MarketContextType {
  tradingHalted: boolean;
  refreshHaltState: () => Promise<void>;
}

const MarketContext = createContext<MarketContextType | null>(null);

export const MarketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tradingHalted, setTradingHalted] = useState(false);
  const api = getApiClient();

  const refreshHaltState = async () => {
    try {
      const settings = await api.adminGetSettings();
      setTradingHalted(settings.tradingHalted);
    } catch {}
  };

  useEffect(() => {
    refreshHaltState();

    const rt = getRealtimeClient();
    const unsub = rt.subscribe('exchange:status', (data: ExchangeStatus) => {
      setTradingHalted(data.tradingHalted);
    });

    return () => unsub();
  }, []);

  return <MarketContext.Provider value={{ tradingHalted, refreshHaltState }}>{children}</MarketContext.Provider>;
};

export const useMarket = () => {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error('useMarket must be used within MarketProvider');
  return ctx;
};
