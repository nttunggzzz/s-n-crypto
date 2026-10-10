import React, { createContext, useContext, useEffect, useState } from 'react';
import { getApiClient, getRealtimeClient } from '../services/api';

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
      const state = await api.getTradingState();
      setTradingHalted(state.halted);
    } catch {}
  };

  useEffect(() => {
    refreshHaltState();
    
    const rt = getRealtimeClient();
    const unsub = rt.subscribe('system', (data: any) => {
      if (data.type === 'trading_halted') setTradingHalted(true);
      if (data.type === 'trading_resumed') setTradingHalted(false);
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
