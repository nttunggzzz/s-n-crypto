import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { PublicConfig } from '@cex/contracts';
import { getApiClient } from '../services/api.ts';

interface ConfigContextType {
  publicConfig: PublicConfig | null;
  isLoading: boolean;
  error: string | null;
  refreshConfig: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType>({
  publicConfig: null,
  isLoading: true,
  error: null,
  refreshConfig: async () => {},
});

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const api = getApiClient();
  const retryTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = React.useRef(0);

  const fetchConfig = useCallback(async (isRetry = false) => {
    if (!isRetry) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const cfg = await api.publicConfig();
      setPublicConfig(cfg);
      setError(null);
      retryCountRef.current = 0;
    } catch {
      // Keep null and schedule exponential backoff retry (1s, 3s, 10s)
      setPublicConfig(null);
      setError('Không thể kết nối lấy cấu hình hệ thống.');
      const delays = [1000, 3000, 10000];
      const nextDelay = delays[Math.min(retryCountRef.current, delays.length - 1)];
      retryCountRef.current += 1;
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = setTimeout(() => {
        fetchConfig(true);
      }, nextDelay);
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const refreshConfig = useCallback(async () => {
    retryCountRef.current = 0;
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    await fetchConfig(false);
  }, [fetchConfig]);

  useEffect(() => {
    fetchConfig();
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [fetchConfig]);

  return (
    <ConfigContext.Provider value={{ publicConfig, isLoading, error, refreshConfig }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = (): ConfigContextType => useContext(ConfigContext);
export const usePublicConfig = useConfig;
