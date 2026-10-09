import React, { useState, useEffect, useMemo } from 'react';
import type { Depth } from '@cex/contracts';
import { getApiClient } from '../../services/api.ts';
import { useMarket } from '../../context/MarketContext.tsx';
import { PriceText, Skeleton, formatDecimal } from '@cex/ui';

export interface OrderbookProps {
  symbol: string;
  onSelectPrice: (price: string) => void;
}

export const Orderbook: React.FC<OrderbookProps> = ({ symbol, onSelectPrice }) => {
  const [depth, setDepth] = useState<Depth | null>(null);
  const [loading, setLoading] = useState(true);
  const api = getApiClient();
  const { realtimeClient, activeTicker, activeSymbolInfo } = useMarket();

  useEffect(() => {
    let active = true;
    async function fetchDepth() {
      setLoading(true);
      try {
        const res = await api.depth({ params: { symbol }, query: { limit: 20 } });
        if (active) setDepth(res);
      } catch {
        if (active) setDepth(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchDepth();
    return () => {
      active = false;
    };
  }, [api, symbol]);

  useEffect(() => {
    if (!realtimeClient) return;
    const unsub = realtimeClient.subscribe(`depth:${symbol}`, (data: Depth) => {
      setDepth(data);
    });
    return () => unsub();
  }, [realtimeClient, symbol]);

  // Compute depth volume totals for the background depth bars
  const { asksWithBars, bidsWithBars } = useMemo(() => {
    if (!depth) return { asksWithBars: [], bidsWithBars: [] };

    // Asks: top 12 levels, reversed so lowest ask is at bottom
    const asks = [...depth.asks].slice(0, 12).reverse();
    const bids = [...depth.bids].slice(0, 12);

    let maxVol = 0.0001;
    let runningAskVol = 0;
    const asksProcessed = asks.map(([p, q]) => {
      runningAskVol += parseFloat(q);
      if (runningAskVol > maxVol) maxVol = runningAskVol;
      return { price: p, qty: q, total: runningAskVol };
    });

    let runningBidVol = 0;
    const bidsProcessed = bids.map(([p, q]) => {
      runningBidVol += parseFloat(q);
      if (runningBidVol > maxVol) maxVol = runningBidVol;
      return { price: p, qty: q, total: runningBidVol };
    });

    return {
      asksWithBars: asksProcessed.map((a) => ({ ...a, pct: Math.min(100, (a.total / maxVol) * 100) })),
      bidsWithBars: bidsProcessed.map((b) => ({ ...b, pct: Math.min(100, (b.total / maxVol) * 100) })),
    };
  }, [depth]);

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-subtle,#1e212b)] rounded-[var(--radius-lg,12px)] overflow-hidden text-xs">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-subtle,#1e212b)] font-semibold text-[var(--color-text-secondary,#9ca3af)] flex items-center justify-between">
        <span>Sổ lệnh</span>
        <span className="text-[10px] text-[var(--color-text-muted,#6b7280)]">Top 20</span>
      </div>

      {/* Column labels */}
      <div className="grid grid-cols-2 px-3 py-1 text-[10px] text-[var(--color-text-muted,#6b7280)] font-medium border-b border-[var(--color-border-subtle,#1e212b)]">
        <span>Giá ({activeSymbolInfo?.quoteAsset || 'USDT'})</span>
        <span className="text-right">Khối lượng ({activeSymbolInfo?.baseAsset || 'COIN'})</span>
      </div>

      {loading && !depth ? (
        <div className="p-3 space-y-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} height={16} className="w-full" />
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between py-1 font-mono tabular-nums overflow-y-auto">
          {/* Asks (Sell orders - red) */}
          <div className="flex flex-col gap-0.5">
            {asksWithBars.map((item, idx) => (
              <div
                key={`ask-${idx}`}
                onClick={() => onSelectPrice(item.price)}
                className="relative grid grid-cols-2 px-3 py-0.5 cursor-pointer hover:bg-[var(--color-bg-elevated,#1b1e27)] transition-colors text-[11px]"
              >
                <div
                  className="absolute right-0 top-0 bottom-0 bg-[var(--color-sell-bg,rgba(248,113,113,0.12))] pointer-events-none"
                  style={{ width: `${item.pct}%` }}
                />
                <span className="text-[var(--color-sell,#f87171)] relative z-10">
                  {formatDecimal(item.price, { decimals: activeSymbolInfo?.pricePrecision })}
                </span>
                <span className="text-right text-[var(--color-text-secondary,#9ca3af)] relative z-10">
                  {formatDecimal(item.qty, { decimals: 4 })}
                </span>
              </div>
            ))}
          </div>

          {/* Current Market Price Mid-Bar */}
          <div className="my-1.5 py-1.5 px-3 bg-[var(--color-bg-elevated,#1b1e27)]/50 border-y border-[var(--color-border-subtle,#1e212b)] flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-sm">
              <PriceText
                price={activeTicker?.lastPrice}
                tickSize={activeSymbolInfo?.tickSize}
                colored
              />
            </div>
            <span className="text-[10px] text-[var(--color-text-muted,#6b7280)] font-sans">
              Giá gần nhất
            </span>
          </div>

          {/* Bids (Buy orders - green) */}
          <div className="flex flex-col gap-0.5">
            {bidsWithBars.map((item, idx) => (
              <div
                key={`bid-${idx}`}
                onClick={() => onSelectPrice(item.price)}
                className="relative grid grid-cols-2 px-3 py-0.5 cursor-pointer hover:bg-[var(--color-bg-elevated,#1b1e27)] transition-colors text-[11px]"
              >
                <div
                  className="absolute right-0 top-0 bottom-0 bg-[var(--color-buy-bg,rgba(34,197,94,0.12))] pointer-events-none"
                  style={{ width: `${item.pct}%` }}
                />
                <span className="text-[var(--color-buy,#22c55e)] relative z-10">
                  {formatDecimal(item.price, { decimals: activeSymbolInfo?.pricePrecision })}
                </span>
                <span className="text-right text-[var(--color-text-secondary,#9ca3af)] relative z-10">
                  {formatDecimal(item.qty, { decimals: 4 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
