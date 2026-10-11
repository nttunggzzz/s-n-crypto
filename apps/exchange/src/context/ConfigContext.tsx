import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { PublicConfig } from '@cex/contracts';
import { getApiClient } from '../services/api.ts';

interface ConfigContextType {
  publicConfig: PublicConfig | null;
  isLoading: boolean;
  refreshConfig: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType>({
  publicConfig: null,
  isLoading: true,
  refreshConfig: async () => {},
});

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const api = getApiClient();

  const refreshConfig = useCallback(async () => {
    try {
      const cfg = await api.publicConfig();
      setPublicConfig(cfg);
    } catch {
      // Sensible defaults if network is momentarily unavailable
      setPublicConfig({
        registration: 'INVITE_ONLY',
        captchaSiteKey: null,
        emailVerificationRequired: false,
        marketFeed: 'binance',
      });
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refreshConfig();
  }, [refreshConfig]);

  return (
    <ConfigContext.Provider value={{ publicConfig, isLoading, refreshConfig }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = (): ConfigContextType => useContext(ConfigContext);
