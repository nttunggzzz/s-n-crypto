import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Depth } from '@cex/contracts';
import { dec, floorToStep, ceilToStep, ZERO, Dec } from '@cex/core';
import { getApiClient } from '../../services/api.ts';
import { useMarket } from '../../context/MarketContext.tsx';
import { PriceText, Skeleton, formatDecimal, formatPrice, formatAmount } from '@cex/ui';

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
  const [latestTrade, setLatestTrade] = useState<{ price: string; isBuyerMaker: boolean } | null>(null);
  const [flashingKeys, setFlashingKeys] = useState<Set<string>>(new Set());
  const prevQtyMapRef = useRef<Map<string, string>>(new Map());
  
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
    if (!realtimeClient || groupMode > 1) return;
    const channel = marketType === 'futures' ? `futures:depth:${symbol}` : `depth:${symbol}`;
    const unsub = realtimeClient.subscribe(channel, (data: unknown) => {
      setDepth(data as Depth);
    });
    return () => unsub();
  }, [realtimeClient, symbol, groupMode, marketType]);

  // Subscribe to latest trades for mid-bar execution price
  useEffect(() => {
    if (!realtimeClient) return;
    const channel = marketType === 'futures' ? `futures:trades:${symbol}` : `trades:${symbol}`;
    const unsub = realtimeClient.subscribe(channel, (data: unknown) => {
      const t = data as { price?: string; isBuyerMaker?: boolean };
      if (t?.price) {
        setLatestTrade({ price: t.price, isBuyerMaker: !!t.isBuyerMaker });
      }
    });
    return () => unsub();
  }, [realtimeClient, symbol, marketType]);

  // Track depth quantity changes and flash affected rows for 250ms
  useEffect(() => {
    if (!depth) return;
    const newFlashing = new Set<string>();
    const prevMap = prevQtyMapRef.current;
    const nextMap = new Map<string, string>();

    [...depth.asks, ...depth.bids].forEach(([p, q]) => {
      nextMap.set(p, q);
      const prev = prevMap.get(p);
      if (prev !== undefined && prev !== q) {
        newFlashing.add(p);
      }
    });

    prevQtyMapRef.current = nextMap;

    if (newFlashing.size > 0) {
      setFlashingKeys(newFlashing);
      const timer = setTimeout(() => {
        setFlashingKeys(new Set());
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [depth]);

  const spreadInfo = useMemo(() => {
    if (!depth || !depth.asks.length || !depth.bids.length) return null;
    const bestAsk = depth.asks[0]?.[0];
    const bestBid = depth.bids[0]?.[0];
    if (!bestAsk || !bestBid) return null;
    try {
      const askD = dec(bestAsk);
      const bidD = dec(bestBid);
      const spread = askD.minus(bidD);
      if (spread.lt(ZERO)) return null;
      const spreadPct = spread.div(askD).mul(100).toString();
      return {
        spread: spread.toString(),
        spreadPct,
      };
    } catch {
      return null;
    }
  }, [depth]);

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
           <button
             onClick={() => setViewMode('all')}
             aria-label="Hiện cả lệnh mua và bán"
             className={`w-5 h-5 flex flex-col items-center justify-center gap-[1px] rounded ${viewMode==='all' ? 'bg-[var(--line,#1d1e21)]' : ''}`}
           >
             <div className="w-3 h-1 bg-[var(--down,#f2475f)] opacity-70"></div>
             <div className="w-3 h-1 bg-[var(--up,#1fc27a)] opacity-70"></div>
           </button>
           <button
             onClick={() => setViewMode('buy')}
             aria-label="Chỉ hiện lệnh mua"
             className={`w-5 h-5 flex flex-col items-center justify-center gap-[1px] rounded ${viewMode==='buy' ? 'bg-[var(--line,#1d1e21)]' : ''}`}
           >
             <div className="w-3 h-1 bg-[var(--up,#1fc27a)] opacity-70"></div>
             <div className="w-3 h-1 bg-[var(--up,#1fc27a)] opacity-70"></div>
           </button>
           <button
             onClick={() => setViewMode('sell')}
             aria-label="Chỉ hiện lệnh bán"
             className={`w-5 h-5 flex flex-col items-center justify-center gap-[1px] rounded ${viewMode==='sell' ? 'bg-[var(--line,#1d1e21)]' : ''}`}
           >
             <div className="w-3 h-1 bg-[var(--down,#f2475f)] opacity-70"></div>
             <div className="w-3 h-1 bg-[var(--down,#f2475f)] opacity-70"></div>
           </button>
        </div>
        
        <button
          onClick={toggleGroupMode}
          aria-label="Đổi độ làm tròn bước giá"
          className="text-[10px] bg-[var(--panel-2,#141416)] px-1.5 py-0.5 rounded border border-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)] transition-colors"
        >
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
              {asksWithBars.map((item) => (
                <div
                  key={`ask-${item.price}`}
                  onClick={() => {
                    const tick = activeSymbolInfo?.tickSize;
                    const p = tick ? floorToStep(dec(item.price), dec(tick)).toString() : item.price;
                    onSelectPrice(p);
                  }}
                  className="relative grid grid-cols-2 px-3 h-[19px] min-h-[19px] items-center cursor-pointer hover:bg-[var(--panel-2,#141416)] text-[11.5px]"
                  title={`Tổng ${formatAmount(item.total.toString(), activeSymbolInfo?.stepSize)} ${activeSymbolInfo?.baseAsset} | ~${formatDecimal(dec(item.total.toString()).mul(dec(item.price)).toString(), { decimals: 2 })} USDT`}
                >
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-[var(--down,#f2475f)] opacity-15 pointer-events-none transition-[width] duration-200 ease-out"
                    style={{ width: `${item.pct}%` }}
                  />
                  <span className={`${getPriceColor('sell')} relative z-10`}>
                    {formatPrice(item.price, activeSymbolInfo?.tickSize)}
                  </span>
                  <span className={`text-right text-[var(--text,#f4f4f5)] relative z-10 transition-colors duration-250 rounded px-0.5 ${flashingKeys.has(item.price) ? 'text-amber-300 font-bold bg-amber-400/20' : ''}`}>
                    {formatAmount(item.qty, activeSymbolInfo?.stepSize)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Center Mid-Bar */}
          <div className="py-1 px-3 flex items-center justify-between shrink-0 border-y border-[var(--line,#1d1e21)]/60 bg-[var(--panel-2,#141416)]/40 my-0.5">
            <div className="flex items-center gap-1.5 font-bold text-sm">
              <span className={latestTrade ? (latestTrade.isBuyerMaker ? 'text-[var(--down,#f2475f)]' : 'text-[var(--up,#1fc27a)]') : ''}>
                {latestTrade ? (
                  formatPrice(latestTrade.price, activeSymbolInfo?.tickSize)
                ) : (
                  <PriceText
                    price={activeTicker?.lastPrice}
                    tickSize={activeSymbolInfo?.tickSize}
                    colored
                  />
                )}
              </span>
              {latestTrade && (
                <span className={`text-xs ${latestTrade.isBuyerMaker ? 'text-[var(--down,#f2475f)]' : 'text-[var(--up,#1fc27a)]'}`}>
                  {latestTrade.isBuyerMaker ? '↓' : '↑'}
                </span>
              )}
            </div>
            {spreadInfo && (
              <div className="text-[10px] text-[var(--text-3,#63636b)] font-mono" title="Chênh lệch giá mua bán tốt nhất">
                Spread {formatPrice(spreadInfo.spread, activeSymbolInfo?.tickSize)} ({formatDecimal(spreadInfo.spreadPct, { decimals: 2 })}%)
              </div>
            )}
          </div>

          {viewMode !== 'sell' && (
            <div className={`flex flex-col gap-[1px] justify-start ${viewMode==='all' ? 'h-[45%]' : 'h-[90%]'} overflow-hidden`}>
              {bidsWithBars.map((item) => (
                <div
                  key={`bid-${item.price}`}
                  onClick={() => {
                    const tick = activeSymbolInfo?.tickSize;
                    const p = tick ? floorToStep(dec(item.price), dec(tick)).toString() : item.price;
                    onSelectPrice(p);
                  }}
                  className="relative grid grid-cols-2 px-3 h-[19px] min-h-[19px] items-center cursor-pointer hover:bg-[var(--panel-2,#141416)] text-[11.5px]"
                  title={`Tổng ${formatAmount(item.total.toString(), activeSymbolInfo?.stepSize)} ${activeSymbolInfo?.baseAsset} | ~${formatDecimal(dec(item.total.toString()).mul(dec(item.price)).toString(), { decimals: 2 })} USDT`}
                >
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-[var(--up,#1fc27a)] opacity-15 pointer-events-none transition-[width] duration-200 ease-out"
                    style={{ width: `${item.pct}%` }}
                  />
                  <span className={`${getPriceColor('buy')} relative z-10`}>
                    {formatPrice(item.price, activeSymbolInfo?.tickSize)}
                  </span>
                  <span className={`text-right text-[var(--text,#f4f4f5)] relative z-10 transition-colors duration-250 rounded px-0.5 ${flashingKeys.has(item.price) ? 'text-amber-300 font-bold bg-amber-400/20' : ''}`}>
                    {formatAmount(item.qty, activeSymbolInfo?.stepSize)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Ratio Bar */}
          <div className="mx-3 mt-1 h-1 flex rounded-full overflow-hidden shrink-0" title={`Mua ${formatDecimal(ratioBid.toString(), { decimals: 1 })}% | Bán ${formatDecimal(ratioAsk.toString(), { decimals: 1 })}%`}>
            <div className="bg-[var(--up,#1fc27a)] h-full" style={{ width: `${ratioBid}%` }}></div>
            <div className="bg-[var(--down,#f2475f)] h-full" style={{ width: `${ratioAsk}%` }}></div>
          </div>
        </div>
      )}
    </div>
  );
};
