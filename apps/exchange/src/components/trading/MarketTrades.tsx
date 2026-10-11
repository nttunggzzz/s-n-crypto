import React, { useState, useEffect } from 'react';
import type { MarketTrade } from '@cex/contracts';
import { getApiClient } from '../../services/api.ts';
import { useMarket } from '../../context/MarketContext.tsx';
import { Skeleton, formatDecimal } from '@cex/ui';

export interface MarketTradesProps {
  symbol: string;
  marketType?: 'spot' | 'futures';
}

export const MarketTrades: React.FC<MarketTradesProps> = ({ symbol, marketType = 'spot' }) => {
  const [trades, setTrades] = useState<MarketTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const api = getApiClient();
  const { realtimeClient, activeSymbolInfo } = useMarket();

  useEffect(() => {
    let active = true;
    async function fetchTrades() {
      setLoading(true);
      try {
        const res = marketType === 'futures'
          ? await api.futuresMarketTrades({ params: { symbol }, query: { limit: 25 } })
          : await api.marketTrades({ params: { symbol }, query: { limit: 25 } });
        if (active) {
          const seen = new Set<number | string>();
          const deduped: MarketTrade[] = [];
          for (const item of res.items) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              deduped.push(item);
            }
          }
          setTrades(deduped);
        }
      } catch {
        if (active) setTrades([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchTrades();
    return () => {
      active = false;
    };
  }, [api, symbol, marketType]);

  useEffect(() => {
    if (!realtimeClient) return;
    const channel = marketType === 'futures' ? `futures:trades:${symbol}` : `trades:${symbol}`;
    const unsub = realtimeClient.subscribe(channel, (data: unknown) => {
      const newTrade = data as MarketTrade;
      if (!newTrade || !newTrade.id) return;
      setTrades((prev) => {
        if (prev.some((t) => t.id === newTrade.id)) return prev;
        return [newTrade, ...prev.slice(0, 24)];
      });
    });
    return () => unsub();
  }, [realtimeClient, symbol, marketType]);

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-subtle,#1e212b)] rounded-[var(--radius-lg,12px)] overflow-hidden text-xs">
      <div className="px-3 py-2 border-b border-[var(--color-border-subtle,#1e212b)] font-semibold text-[var(--color-text-secondary,#9ca3af)] flex items-center justify-between">
        <span>Giao dịch gần đây</span>
        <span className="text-[10px] text-[var(--color-text-muted,#6b7280)]">Khớp lệnh realtime</span>
      </div>

      <div className="grid grid-cols-3 px-3 py-1 text-[10px] text-[var(--color-text-muted,#6b7280)] font-medium border-b border-[var(--color-border-subtle,#1e212b)]">
        <span>Giá ({activeSymbolInfo?.quoteAsset || 'USDT'})</span>
        <span className="text-right">Khối lượng</span>
        <span className="text-right">Thời gian</span>
      </div>

      {loading && trades.length === 0 ? (
        <div className="p-3 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} height={16} className="w-full" />
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto font-mono tabular-nums py-1">
          {trades.map((tr) => {
            const timeStr = new Date(tr.time).toLocaleTimeString('vi-VN', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            // isBuyerMaker = true means sell order filled maker, display in red; false is buy order filled, green
            const colorClass = tr.isBuyerMaker
              ? 'text-[var(--color-sell,#f87171)]'
              : 'text-[var(--color-buy,#22c55e)]';

            return (
              <div
                key={tr.id}
                className="grid grid-cols-3 px-3 py-0.5 text-[11px] hover:bg-[var(--color-bg-elevated,#1b1e27)]/50 transition-all duration-150 animate-[fadeIn_150ms_ease-out]"
              >
                <span className={colorClass}>
                  {formatDecimal(tr.price, { decimals: activeSymbolInfo?.pricePrecision })}
                </span>
                <span className="text-right text-[var(--color-text-secondary,#9ca3af)]">
                  {formatDecimal(tr.qty, { decimals: 4 })}
                </span>
                <span className="text-right text-[var(--color-text-muted,#6b7280)] text-[10px]">
                  {timeStr}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
