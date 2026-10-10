import React, { useState, useEffect, useMemo } from 'react';
import type { Depth } from '@cex/contracts';
import { dec, floorToStep, ceilToStep, ZERO, Dec } from '@cex/core';
import { getApiClient } from '../../services/api.ts';
import { useMarket } from '../../context/MarketContext.tsx';
import { PriceText, Skeleton, formatDecimal } from '@cex/ui';

export interface OrderbookProps {
  symbol: string;
  marketType?: 'spot' | 'futures';
  onSelectPrice: (price: string) => void;
}

const groupOrderbook = (
  items: [string, string][],
  tickSize: string,
  groupMultiplier: number,
  isAsk: boolean
) => {
  if (groupMultiplier === 1) return items;
  
  const step = dec(tickSize).mul(groupMultiplier);
  const grouped = new Map<string, Dec>();
  
  for (const [p, q] of items) {
    const price = dec(p);
    const qty = dec(q);
    
    // Asks: ceil, Bids: floor
    const groupedPrice = isAsk ? ceilToStep(price, step) : floorToStep(price, step);
    const key = groupedPrice.toString();
    
    const existingQty = grouped.get(key) || ZERO;
    grouped.set(key, existingQty.plus(qty));
  }
  
  const result: [string, string][] = Array.from(grouped.entries()).map(([p, q]) => [p, q.toString()]);
  
  if (isAsk) {
    result.sort((a, b) => dec(a[0]).cmp(dec(b[0])));
  } else {
    result.sort((a, b) => dec(b[0]).cmp(dec(a[0])));
  }
  
  return result;
};

export const Orderbook: React.FC<OrderbookProps> = ({ symbol, marketType = 'spot', onSelectPrice }) => {
  const [depth, setDepth] = useState<Depth | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'all' | 'buy' | 'sell'>('all');
  const [groupMode, setGroupMode] = useState<number>(1);
  
  const api = getApiClient();
  const { realtimeClient, activeTicker, activeSymbolInfo } = useMarket();

  // Polling for deep depth when grouped
  useEffect(() => {
    let active = true;
    let timer: number;
    async function fetchDepth() {
      try {
        const res = marketType === 'futures'
          ? await api.futuresDepth({ params: { symbol }, query: { limit: groupMode > 1 ? 200 : 20 } })
          : await api.depth({ params: { symbol }, query: { limit: groupMode > 1 ? 200 : 20 } });
        if (active) setDepth(res);
      } catch {
        if (active && !depth) setDepth(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchDepth();
    
    if (groupMode > 1) {
      timer = window.setInterval(fetchDepth, 2500);
    }
    
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [api, symbol, groupMode, marketType]);

  useEffect(() => {
    if (!realtimeClient || groupMode > 1) return; // if grouping, we use polling for now
    const channel = marketType === 'futures' ? `futures:depth:${symbol}` : `depth:${symbol}`;
    const unsub = realtimeClient.subscribe(channel, (data: unknown) => {
      setDepth(data as Depth);
    });
    return () => unsub();
  }, [realtimeClient, symbol, groupMode, marketType]);

  const { asksWithBars, bidsWithBars, ratioAsk = 50, ratioBid = 50 } = useMemo(() => {
    if (!depth) return { asksWithBars: [], bidsWithBars: [], ratioAsk: 50, ratioBid: 50 };
    const tickSize = activeSymbolInfo?.tickSize || '0.01';

    const asksGrouped = groupOrderbook(depth.asks, tickSize, groupMode, true);
    const bidsGrouped = groupOrderbook(depth.bids, tickSize, groupMode, false);

    let maxAskLen = viewMode === 'all' ? 12 : 24;
    let maxBidLen = viewMode === 'all' ? 12 : 24;
    
    if (viewMode === 'buy') maxAskLen = 0;
    if (viewMode === 'sell') maxBidLen = 0;

    const asks = asksGrouped.slice(0, maxAskLen).reverse();
    const bids = bidsGrouped.slice(0, maxBidLen);

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

    const totalAskVol = asksProcessed.reduce((acc, a) => acc + parseFloat(a.qty), 0);
    const totalBidVol = bidsProcessed.reduce((acc, a) => acc + parseFloat(a.qty), 0);
    const total = totalAskVol + totalBidVol || 1;
    const ratioAsk = (totalAskVol / total) * 100;
    const ratioBid = (totalBidVol / total) * 100;

    return {
      asksWithBars: asksProcessed.map((a) => ({ ...a, pct: Math.min(100, (a.total / maxVol) * 100) })),
      bidsWithBars: bidsProcessed.map((b) => ({ ...b, pct: Math.min(100, (b.total / maxVol) * 100) })),
      ratioAsk,
      ratioBid
    };
  }, [depth, activeSymbolInfo, viewMode, groupMode]);

  const toggleGroupMode = () => {
    const modes = [1, 10, 100];
    const idx = modes.indexOf(groupMode);
    setGroupMode(modes[(idx + 1) % modes.length] ?? 1);
  };

  const getPriceColor = (type: 'sell'|'buy') => {
      return type === 'sell' ? 'text-[var(--down,#f2475f)]' : 'text-[var(--up,#1fc27a)]';
  };

  return (
    <div className="flex flex-col h-full bg-[var(--panel,#0a0a0b)] border-x-0 border-[var(--line,#1d1e21)] overflow-hidden text-xs">
      {/* Header controls */}
      <div className="px-3 py-1.5 border-b border-[var(--line,#1d1e21)] flex items-center justify-between">
        <div className="flex items-center gap-1 bg-[var(--panel-2,#141416)] rounded border border-[var(--line,#1d1e21)] p-0.5">
           <button onClick={() => setViewMode('all')} className={`w-5 h-5 flex flex-col items-center justify-center gap-[1px] rounded ${viewMode==='all' ? 'bg-[var(--line,#1d1e21)]' : ''}`}>
             <div className="w-3 h-1 bg-[var(--down,#f2475f)] opacity-70"></div>
             <div className="w-3 h-1 bg-[var(--up,#1fc27a)] opacity-70"></div>
           </button>
           <button onClick={() => setViewMode('buy')} className={`w-5 h-5 flex flex-col items-center justify-center gap-[1px] rounded ${viewMode==='buy' ? 'bg-[var(--line,#1d1e21)]' : ''}`}>
             <div className="w-3 h-1 bg-[var(--up,#1fc27a)] opacity-70"></div>
             <div className="w-3 h-1 bg-[var(--up,#1fc27a)] opacity-70"></div>
           </button>
           <button onClick={() => setViewMode('sell')} className={`w-5 h-5 flex flex-col items-center justify-center gap-[1px] rounded ${viewMode==='sell' ? 'bg-[var(--line,#1d1e21)]' : ''}`}>
             <div className="w-3 h-1 bg-[var(--down,#f2475f)] opacity-70"></div>
             <div className="w-3 h-1 bg-[var(--down,#f2475f)] opacity-70"></div>
           </button>
        </div>
        
        <button onClick={toggleGroupMode} className="text-[10px] bg-[var(--panel-2,#141416)] px-1.5 py-0.5 rounded border border-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)] transition-colors">
          {activeSymbolInfo?.tickSize && dec(activeSymbolInfo.tickSize).mul(groupMode).toString()}
        </button>
      </div>

      <div className="grid grid-cols-2 px-3 py-1 text-[10px] text-[var(--text-3,#63636b)] font-medium">
        <span>Giá ({activeSymbolInfo?.quoteAsset || 'USDT'})</span>
        <span className="text-right">SL ({activeSymbolInfo?.baseAsset || 'COIN'})</span>
      </div>

      {loading && !depth ? (
        <div className="p-3 space-y-2">
          {Array.from({ length: viewMode === 'all' ? 24 : 24 }).map((_, i) => (
            <Skeleton key={i} height={16} className="w-full" />
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between py-1 font-mono tabular-nums overflow-hidden group">
          {viewMode !== 'buy' && (
            <div className={`flex flex-col gap-[1px] justify-end ${viewMode==='all' ? 'h-[45%]' : 'h-[90%]'} overflow-hidden`}>
              {asksWithBars.map((item, idx) => (
                <div
                  key={`ask-${idx}`}
                  onClick={() => {
                    const tick = activeSymbolInfo?.tickSize;
                    const p = tick ? floorToStep(dec(item.price), dec(tick)).toString() : item.price;
                    onSelectPrice(p);
                  }}
                  className="relative grid grid-cols-2 px-3 py-0.5 cursor-pointer hover:bg-[var(--panel-2,#141416)] text-[11.5px]"
                  title={`Tổng ${formatDecimal(item.total.toString(), {decimals:4})} ${activeSymbolInfo?.baseAsset} | ~${formatDecimal((item.total * parseFloat(item.price)).toString(), {decimals:2})} USDT`}
                >
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-[var(--down,#f2475f)] opacity-10 pointer-events-none"
                    style={{ width: `${item.pct}%` }}
                  />
                  <span className={`${getPriceColor('sell')} relative z-10`}>
                    {formatDecimal(item.price, { decimals: activeSymbolInfo?.pricePrecision })}
                  </span>
                  <span className="text-right text-[var(--text,#f4f4f5)] relative z-10">
                    {formatDecimal(item.qty, { decimals: 4 })}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Center Mid-Bar */}
          <div className="py-1 px-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5 font-bold text-base">
              <PriceText
                price={activeTicker?.lastPrice}
                tickSize={activeSymbolInfo?.tickSize}
                colored
              />
            </div>
          </div>

          {viewMode !== 'sell' && (
            <div className={`flex flex-col gap-[1px] justify-start ${viewMode==='all' ? 'h-[45%]' : 'h-[90%]'} overflow-hidden`}>
              {bidsWithBars.map((item, idx) => (
                <div
                  key={`bid-${idx}`}
                  onClick={() => {
                    const tick = activeSymbolInfo?.tickSize;
                    const p = tick ? floorToStep(dec(item.price), dec(tick)).toString() : item.price;
                    onSelectPrice(p);
                  }}
                  className="relative grid grid-cols-2 px-3 py-0.5 cursor-pointer hover:bg-[var(--panel-2,#141416)] text-[11.5px]"
                  title={`Tổng ${formatDecimal(item.total.toString(), {decimals:4})} ${activeSymbolInfo?.baseAsset} | ~${formatDecimal((item.total * parseFloat(item.price)).toString(), {decimals:2})} USDT`}
                >
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-[var(--up,#1fc27a)] opacity-10 pointer-events-none"
                    style={{ width: `${item.pct}%` }}
                  />
                  <span className={`${getPriceColor('buy')} relative z-10`}>
                    {formatDecimal(item.price, { decimals: activeSymbolInfo?.pricePrecision })}
                  </span>
                  <span className="text-right text-[var(--text,#f4f4f5)] relative z-10">
                    {formatDecimal(item.qty, { decimals: 4 })}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Ratio Bar */}
          <div className="mx-3 mt-1 h-1 flex rounded-full overflow-hidden shrink-0" title={`Mua ${ratioBid.toFixed(1)}% | Bán ${ratioAsk.toFixed(1)}%`}>
            <div className="bg-[var(--up,#1fc27a)] h-full" style={{ width: `${ratioBid}%` }}></div>
            <div className="bg-[var(--down,#f2475f)] h-full" style={{ width: `${ratioAsk}%` }}></div>
          </div>
        </div>
      )}
    </div>
  );
};
