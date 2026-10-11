import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Star, Settings2, Bell, Search } from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery.ts';
import { useMarket } from '../context/MarketContext.tsx';
import { CandlestickChart } from '../components/trading/CandlestickChart.tsx';
import { Orderbook } from '../components/trading/Orderbook.tsx';
import { MarketTrades } from '../components/trading/MarketTrades.tsx';
import { OrderForm } from '../components/trading/OrderForm.tsx';
import { UserOrdersTabs } from '../components/trading/UserOrdersTabs.tsx';
import { PriceAlertModal } from '../components/PriceAlertModal.tsx';
import {
  PriceText,
  PercentChange,
  StaleBadge,
  BottomSheet,
  Button,
  Tabs,
  formatDecimal,
} from '@cex/ui';
import { dec, floorToStep } from '@cex/core';
import { TRADE_BLOCK_LABELS } from '@cex/contracts';

export interface TradePageProps {
  symbolParam?: string;
  onNavigate: (path: string) => void;
}

export const TradePage: React.FC<TradePageProps> = ({ symbolParam, onNavigate }) => {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const {
    symbols,
    tickers,
    activeSymbol,
    activeSymbolInfo,
    activeTicker,
    setActiveSymbol,
    activeTradeBlock,
  } = useMarket();

  const [selectedPrice, setSelectedPrice] = useState<string>('');
  const [mobileTab, setMobileTab] = useState<'chart' | 'orderbook' | 'trades' | 'orders'>('chart');
  const [mobileOrderSheetOpen, setMobileOrderSheetOpen] = useState(false);
  const [orderRefreshTrigger, setOrderRefreshTrigger] = useState(0);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [marketSearch, setMarketSearch] = useState('');

  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('cex_favorites');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [pairSwitcherOpen, setPairSwitcherOpen] = useState(false);
  const [pairSearch, setPairSearch] = useState('');
  const pairSwitcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pairSwitcherOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pairSwitcherRef.current && !pairSwitcherRef.current.contains(e.target as Node)) {
        setPairSwitcherOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPairSwitcherOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [pairSwitcherOpen]);

  const toggleFavorite = (sym: string) => {
    setFavorites((prev) => {
      const next = prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym];
      try {
        localStorage.setItem('cex_favorites', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const isFavorite = favorites.includes(activeSymbol);

  const switcherFilteredSymbols = useMemo(() => {
    if (!pairSearch) return symbols;
    const q = pairSearch.toUpperCase();
    return symbols.filter((s) => s.symbol.includes(q) || s.baseAsset.includes(q));
  }, [symbols, pairSearch]);

  const filteredSymbols = useMemo(() => {
    return symbols.filter((s) => {
      if (!marketSearch) return true;
      const q = marketSearch.toUpperCase();
      return s.symbol.includes(q) || s.baseAsset.includes(q);
    });
  }, [symbols, marketSearch]);

  // Sync route param with activeSymbol
  useEffect(() => {
    if (symbolParam && symbolParam.toUpperCase() !== activeSymbol) {
      const target = symbolParam.toUpperCase();
      const exists = symbols.some((s) => s.symbol === target);
      if (exists) {
        setActiveSymbol(target);
      }
    }
  }, [symbolParam, activeSymbol, symbols, setActiveSymbol]);

  const handlePriceSelected = (price: string) => {
    if (activeSymbolInfo?.tickSize) {
      try {
        setSelectedPrice(floorToStep(dec(price), dec(activeSymbolInfo.tickSize)).toString());
      } catch {
        setSelectedPrice(price);
      }
    } else {
      setSelectedPrice(price);
    }
  };

  const handleOrderPlaced = () => {
    setOrderRefreshTrigger((prev) => prev + 1);
    setMobileOrderSheetOpen(false);
  };

  const isUnavailable = activeTicker?.status === 'UNAVAILABLE';

  const mobileTabs = [
    { id: 'chart', label: 'Biểu đồ' },
    { id: 'orderbook', label: 'Sổ lệnh' },
    { id: 'trades', label: 'Khớp lệnh' },
    { id: 'orders', label: 'Lệnh của tôi' },
  ];

  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)] pb-20 md:pb-6">
      {/* Trading Header Bar */}
      {/* Trading Header Bar (Ticker) */}
      <div className="bg-[var(--panel,#0a0a0b)] border-b border-[var(--line,#1d1e21)] px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4 flex-wrap w-full md:w-auto">
          {/* Symbol & Star */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => toggleFavorite(activeSymbol)}
              className={`p-1 transition-colors cursor-pointer ${
                isFavorite ? 'text-amber-400' : 'text-[var(--text-3,#63636b)] hover:text-amber-400'
              }`}
              title={isFavorite ? 'Xóa khỏi danh sách ưa thích' : 'Thêm vào danh sách ưa thích'}
              aria-label={isFavorite ? 'Xóa khỏi danh sách ưa thích' : 'Thêm vào danh sách ưa thích'}
            >
              <Star size={18} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
            <div className="relative" ref={pairSwitcherRef}>
              <button
                type="button"
                onClick={() => setPairSwitcherOpen((p) => !p)}
                className="flex items-center gap-2 cursor-pointer py-1 px-1.5 rounded-md hover:bg-white/5 transition-colors"
                aria-expanded={pairSwitcherOpen}
                aria-label="Chọn cặp giao dịch"
              >
                <span className="text-xl font-bold font-sans tracking-tight">
                  {activeSymbolInfo?.baseAsset}<span className="text-[var(--text-3,#63636b)]">/{activeSymbolInfo?.quoteAsset}</span>
                </span>
                <span className={`text-[10px] text-[var(--text-3,#63636b)] ml-1 transition-transform duration-200 ${pairSwitcherOpen ? 'rotate-180' : ''}`}>▼</span>
              </button>

              {/* Quick Switch Popover */}
              {pairSwitcherOpen && (
                <div className="absolute left-0 top-full mt-1 w-[320px] bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,10px)] shadow-2xl py-2 z-50 overflow-hidden">
                  <div className="px-3 pb-2 border-b border-[var(--line,#1d1e21)]">
                    <div className="flex items-center gap-2 bg-[var(--panel,#0a0a0b)] px-2.5 py-1.5 rounded-lg border border-[var(--line,#1d1e21)]">
                      <Search size={14} className="text-[var(--text-3,#63636b)]" />
                      <input
                        type="text"
                        placeholder="Tìm cặp spot (BTC, ETH...)"
                        value={pairSearch}
                        onChange={(e) => setPairSearch(e.target.value)}
                        autoFocus
                        className="bg-transparent text-xs text-[var(--text,#f4f4f5)] focus:outline-none w-full"
                      />
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-[var(--line,#1d1e21)]/30">
                    {switcherFilteredSymbols.map((s) => {
                      const t = tickers[s.symbol];
                      const isFav = favorites.includes(s.symbol);
                      return (
                        <div
                          key={s.symbol}
                          onClick={() => {
                            if (s.enabled) {
                              setActiveSymbol(s.symbol);
                              onNavigate(`/trade/${s.symbol}`);
                              setPairSwitcherOpen(false);
                            }
                          }}
                          className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors ${
                            !s.enabled ? 'opacity-40 cursor-not-allowed' : ''
                          } ${s.symbol === activeSymbol ? 'bg-[var(--accent,#818cf8)]/10 text-[var(--accent,#818cf8)]' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              role="button"
                              aria-label={isFav ? `Xóa ${s.symbol} khỏi danh sách ưa thích` : `Thêm ${s.symbol} vào danh sách ưa thích`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavorite(s.symbol);
                              }}
                              className={`cursor-pointer ${isFav ? 'text-amber-400' : 'text-zinc-600 hover:text-amber-400'}`}
                            >
                              <Star size={13} fill={isFav ? 'currentColor' : 'none'} />
                            </span>
                            <span className="font-semibold">{s.baseAsset} <span className="text-[var(--text-3,#63636b)] font-normal">/{s.quoteAsset}</span></span>
                          </div>
                          {t && (
                            <div className="text-right font-mono tabular-nums">
                              <div className="font-semibold">{formatDecimal(t.lastPrice)}</div>
                              <div className="text-[10px] font-semibold">
                                <PercentChange percent={t.priceChangePercent} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Current Price */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className={`text-lg font-bold font-mono ${!activeTicker || activeTicker.priceChangePercent?.startsWith('-') ? 'text-[var(--down,#f2475f)]' : 'text-[var(--up,#1fc27a)]'}`}>
                {isUnavailable ? (
                  <span className="text-[var(--text-3,#63636b)]">—</span>
                ) : (
                  <PriceText
                    price={activeTicker?.lastPrice}
                    tickSize={activeSymbolInfo?.tickSize}
                  />
                )}
              </span>
              {activeSymbolInfo?.quoteAsset !== 'USDT' && activeTicker?.lastPrice && (
                <span className="text-[11px] text-[var(--text-2,#a1a1aa)] font-mono">
                  ≈ {formatDecimal(activeTicker.lastPrice, { decimals: activeSymbolInfo?.pricePrecision ?? 8 })} {activeSymbolInfo?.quoteAsset}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex flex-col items-end md:items-start md:ml-2">
             <span className="text-[10px] text-[var(--text-3,#63636b)] cursor-help" title="Thay đổi trong 24 giờ cuốn chiếu (giống Binance)">Thay đổi 24h</span>
             <span className="font-mono text-xs font-semibold">
               <PercentChange percent={activeTicker?.priceChangePercent} />
             </span>
          </div>

          {/* 24h Metrics */}
          <div className="hidden lg:flex items-center gap-6 ml-4 font-mono text-[11px] tabular-nums text-[var(--text-2,#a1a1aa)]">
            <div className="flex flex-col">
              <div className="text-[10px] text-[var(--text-3,#63636b)] font-sans">Giá cao 24h</div>
              <div className="text-[var(--text,#f4f4f5)] font-semibold mt-0.5">
                {isUnavailable ? '—' : formatDecimal(activeTicker?.highPrice, { decimals: activeSymbolInfo?.pricePrecision })}
              </div>
            </div>
            <div className="flex flex-col">
              <div className="text-[10px] text-[var(--text-3,#63636b)] font-sans">Giá thấp 24h</div>
              <div className="text-[var(--text,#f4f4f5)] font-semibold mt-0.5">
                {isUnavailable ? '—' : formatDecimal(activeTicker?.lowPrice, { decimals: activeSymbolInfo?.pricePrecision })}
              </div>
            </div>
            <div className="flex flex-col">
              <div className="text-[10px] text-[var(--text-3,#63636b)] font-sans">KL 24h({activeSymbolInfo?.baseAsset})</div>
              <div className="text-[var(--text,#f4f4f5)] font-semibold mt-0.5">
                {isUnavailable ? '—' : formatDecimal(activeTicker?.volume, { decimals: 2 })}
              </div>
            </div>
            <div className="flex flex-col">
              <div className="text-[10px] text-[var(--text-3,#63636b)] font-sans">KL 24h(USDT)</div>
              <div className="text-[var(--text,#f4f4f5)] font-semibold mt-0.5">
                {isUnavailable ? '—' : formatDecimal(activeTicker?.quoteVolume, { decimals: 2 })}
              </div>
            </div>
          </div>
          
          <div className="hidden md:flex ml-auto items-center gap-2">
            <StaleBadge status={activeTicker?.status} />
            
            <button
              onClick={() => setAlertModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm,4px)] bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] text-[11px] text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)] transition-colors cursor-pointer"
              title="Đặt cảnh báo giá"
              aria-label="Đặt cảnh báo giá"
            >
              <Bell size={13} className="text-[var(--accent,#818cf8)]" /> Cảnh báo
            </button>

            <button
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm,4px)] bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] text-[11px] text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)] transition-colors cursor-default"
              title="Đang ở chế độ Pro Trader tiêu chuẩn"
              aria-label="Chế độ Pro"
            >
              <Settings2 size={14} className="text-[var(--accent,#818cf8)]" /> Chế độ Pro
            </button>
          </div>
        </div>
      </div>

      <PriceAlertModal
        isOpen={alertModalOpen}
        onClose={() => setAlertModalOpen(false)}
        defaultSymbol={activeSymbol}
        defaultPrice={activeTicker?.lastPrice || undefined}
      />

      {activeTradeBlock && (
        <div data-testid="trade-block-reason" className="bg-[var(--down,#f2475f)]/10 text-[var(--down,#f2475f)] px-4 py-2 text-sm text-center border-b border-[var(--down,#f2475f)]/20 font-medium">
          {TRADE_BLOCK_LABELS[activeTradeBlock] || 'Giao dịch tạm thời bị khóa'}
        </div>
      )}

      {/* DESKTOP TRADING WORKSPACE (>= 1024px) */}
      {isDesktop ? (
        <div className="flex flex-col gap-1 px-1 py-1 flex-1 max-w-[1920px] mx-auto w-full">
        {/* Top Section */}
        <div className="flex flex-none gap-1 h-[clamp(520px,calc(100vh-18rem),720px)] min-h-0">
          {/* Sidebar: Market List (xl only) */}
          <div className="hidden xl:flex w-[260px] flex-col bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,10px)] overflow-hidden shrink-0 min-h-0">
            <div className="p-2.5 border-b border-[var(--line,#1d1e21)] flex items-center justify-between">
              <span className="font-semibold text-[var(--text,#f4f4f5)] text-xs">Thị trường</span>
              <span className="text-[10px] text-[var(--text-3,#63636b)]">{filteredSymbols.length} cặp</span>
            </div>
            <div className="p-2 border-b border-[var(--line,#1d1e21)]">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3,#63636b)] pointer-events-none" />
                <input
                  type="text"
                  placeholder="Tìm cặp..."
                  value={marketSearch}
                  onChange={(e) => setMarketSearch(e.target.value)}
                  className="w-full bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-sm,4px)] pl-7 pr-2 py-1 text-xs text-[var(--text,#f4f4f5)] placeholder-[var(--text-3,#63636b)] focus:outline-none focus:border-[var(--accent,#818cf8)]"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-[var(--line,#1d1e21)]/30">
              {filteredSymbols.map((s) => {
                const tick = tickers[s.symbol];
                const isSelected = s.symbol === activeSymbol;
                return (
                  <button
                    key={s.symbol}
                    aria-label={`Giao dịch cặp ${s.symbol}`}
                    onClick={() => {
                      if (s.enabled) {
                        setActiveSymbol(s.symbol);
                        onNavigate(`/trade/${s.symbol}`);
                      }
                    }}
                    disabled={!s.enabled}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected ? 'bg-[var(--line,#1d1e21)]' : 'hover:bg-[var(--panel-2,#141416)]'
                    } ${!s.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <div>
                      <div className="font-semibold text-xs text-[var(--text,#f4f4f5)]">
                        {s.baseAsset}<span className="text-[10px] text-[var(--text-3,#63636b)] font-normal">/{s.quoteAsset}</span>
                      </div>
                      <div className="text-[10px] text-[var(--text-3,#63636b)]">
                        {tick?.volume ? `Vol: ${formatDecimal(tick.volume, { decimals: 0 })}` : '—'}
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-xs text-[var(--text,#f4f4f5)] font-semibold">
                        {tick?.lastPrice ? formatDecimal(tick.lastPrice, { decimals: s.pricePrecision ?? 2 }) : '—'}
                      </div>
                      <div className="text-[10px] font-semibold">
                        <PercentChange percent={tick?.priceChangePercent} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Center: Chart */}
          <div className="flex-1 flex flex-col min-w-[400px] min-h-0">
            <CandlestickChart symbol={activeSymbol} />
          </div>

          {/* Middle Right: Orderbook & Trades */}
          <div className="w-[300px] flex flex-col shrink-0 min-h-0 bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,10px)] overflow-hidden">
            <div className="flex-1 min-h-0 border-b border-[var(--line,#1d1e21)] overflow-hidden">
              <Orderbook
                symbol={activeSymbol}
                onSelectPrice={handlePriceSelected}
              />
            </div>
            <div className="h-[220px] shrink-0 min-h-0 overflow-hidden">
              <MarketTrades symbol={activeSymbol} />
            </div>
          </div>

          {/* Far Right: Order Form */}
          <div className="w-[320px] shrink-0 min-h-0 overflow-y-auto max-h-full">
            <OrderForm
              symbol={activeSymbol}
              selectedPrice={selectedPrice}
              onOrderPlaced={handleOrderPlaced}
              onNavigateToLogin={() => onNavigate('/login')}
            />
          </div>
        </div>

        {/* Bottom Section: Orders */}
        <div className="mt-1">
          <UserOrdersTabs
            symbol={activeSymbol}
            refreshTrigger={orderRefreshTrigger}
          />
        </div>
      </div>
      ) : (
      /* MOBILE / TABLET WORKSPACE (< 1024px) */
      <div className="flex flex-col flex-1 p-2">
        {/* Mobile View Switcher Tabs */}
        <div className="mb-2 bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-subtle,#1e212b)] rounded-[var(--radius-md,8px)] p-1">
          <Tabs
            tabs={mobileTabs}
            activeId={mobileTab}
            onChange={(id) => setMobileTab(id as 'chart' | 'orderbook' | 'trades' | 'orders')}
            variant="segmented"
            size="sm"
          />
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-[460px]">
          {mobileTab === 'chart' && (
            <div className="h-[460px]">
              <CandlestickChart symbol={activeSymbol} />
            </div>
          )}
          {mobileTab === 'orderbook' && (
            <div className="h-[420px]">
              <Orderbook
                symbol={activeSymbol}
                onSelectPrice={handlePriceSelected}
              />
            </div>
          )}
          {mobileTab === 'trades' && (
            <div className="h-[420px]">
              <MarketTrades symbol={activeSymbol} />
            </div>
          )}
          {mobileTab === 'orders' && (
            <UserOrdersTabs
              symbol={activeSymbol}
              refreshTrigger={orderRefreshTrigger}
            />
          )}
        </div>

        {/* Mobile Sticky Action Bar */}
        <div className="fixed bottom-[calc(54px+env(safe-area-inset-bottom,0px))] left-0 right-0 p-3 bg-[var(--color-bg-surface,#111319)]/95 backdrop-blur-md border-t border-[var(--color-border-subtle,#1e212b)] flex items-center gap-3 z-30">
          <Button
            variant="buy"
            fullWidth
            onClick={() => setMobileOrderSheetOpen(true)}
            className="py-2.5 font-bold text-sm"
          >
            MUA {activeSymbolInfo?.baseAsset}
          </Button>
          <Button
            variant="sell"
            fullWidth
            onClick={() => setMobileOrderSheetOpen(true)}
            className="py-2.5 font-bold text-sm"
          >
            BÁN {activeSymbolInfo?.baseAsset}
          </Button>
        </div>

        {/* Mobile Order Form BottomSheet */}
        <BottomSheet
          isOpen={mobileOrderSheetOpen}
          onClose={() => setMobileOrderSheetOpen(false)}
          title={`Đặt lệnh ${activeSymbol}`}
        >
          <OrderForm
            symbol={activeSymbol}
            selectedPrice={selectedPrice}
            onOrderPlaced={handleOrderPlaced}
            onNavigateToLogin={() => {
              setMobileOrderSheetOpen(false);
              onNavigate('/login');
            }}
          />
        </BottomSheet>
      </div>
      )}
    </div>
  );
};
