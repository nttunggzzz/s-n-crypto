import React, { useState, useEffect } from 'react';
import { Star, Settings2, BarChart2, Bell } from 'lucide-react';
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
  SymbolBadge,
  StaleBadge,
  BottomSheet,
  Button,
  Tabs,
  formatDecimal,
} from '@cex/ui';
import { dec, floorToStep } from '@cex/core';

export interface TradePageProps {
  symbolParam?: string;
  onNavigate: (path: string) => void;
}

export const TradePage: React.FC<TradePageProps> = ({ symbolParam, onNavigate }) => {
  const {
    symbols,
    activeSymbol,
    activeSymbolInfo,
    activeTicker,
    setActiveSymbol,
    tradingHalted,
  } = useMarket();

  const [selectedPrice, setSelectedPrice] = useState<string>('');
  const [mobileTab, setMobileTab] = useState<'chart' | 'orderbook' | 'trades' | 'orders'>('chart');
  const [mobileOrderSheetOpen, setMobileOrderSheetOpen] = useState(false);
  const [orderRefreshTrigger, setOrderRefreshTrigger] = useState(0);
  const [alertModalOpen, setAlertModalOpen] = useState(false);

  // Sync route param with activeSymbol
  useEffect(() => {
    if (symbolParam && symbolParam !== activeSymbol) {
      const exists = symbols.some((s) => s.symbol === symbolParam);
      if (exists) {
        setActiveSymbol(symbolParam);
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
            <button className="text-[var(--text-3,#63636b)] hover:text-[var(--accent,#818cf8)] transition-colors">
              <Star size={18} />
            </button>
            <div className="relative group">
              <div className="flex items-center gap-2 cursor-pointer py-1">
                <span className="text-xl font-bold font-sans tracking-tight">
                  {activeSymbolInfo?.baseAsset}<span className="text-[var(--text-3,#63636b)]">/{activeSymbolInfo?.quoteAsset}</span>
                </span>
                <span className="text-[10px] text-[var(--text-2,#a1a1aa)] bg-[var(--panel-2,#141416)] px-1 py-0.5 rounded">10x</span>
                <span className="text-[10px] text-[var(--text-3,#63636b)] ml-1">▼</span>
              </div>

              {/* Quick Switch Dropdown */}
              <div className="hidden group-hover:block absolute left-0 top-full mt-0 w-[300px] bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,10px)] shadow-2xl py-2 z-50 max-h-80 overflow-y-auto">
                <div className="px-3 pb-2 border-b border-[var(--line,#1d1e21)] mb-2 flex items-center gap-2 text-xs">
                  <span className="text-[var(--text,#f4f4f5)] font-bold">USDT</span>
                  <span className="text-[var(--text-3,#63636b)]">USDC</span>
                  <span className="text-[var(--text-3,#63636b)]">Crypto</span>
                </div>
                {symbols.map((s) => (
                  <button
                    key={s.symbol}
                    onClick={() => {
                      if (s.enabled) {
                        setActiveSymbol(s.symbol);
                        onNavigate(`/trade/${s.symbol}`);
                      }
                    }}
                    disabled={!s.enabled}
                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between cursor-pointer hover:bg-[var(--line,#1d1e21)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      s.symbol === activeSymbol ? 'bg-[var(--line,#1d1e21)]' : ''
                    }`}
                  >
                    <span className="font-semibold">{s.symbol.replace('USDT', '')} <span className="text-[var(--text-3,#63636b)] font-normal">/USDT</span></span>
                    {!s.enabled && <span className="text-[9px] text-[var(--text-3,#63636b)]">Tắt</span>}
                  </button>
                ))}
              </div>
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
              <span className="text-[11px] text-[var(--text-2,#a1a1aa)] font-mono">
                ${activeTicker?.lastPrice ? formatDecimal(activeTicker.lastPrice, { decimals: 2 }) : '0.00'}
              </span>
            </div>
          </div>
          
          <div className="flex flex-col items-end md:items-start md:ml-2">
             <span className="text-[10px] text-[var(--text-3,#63636b)]">Thay đổi 24h</span>
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
            >
              <Bell size={13} className="text-[var(--accent,#818cf8)]" /> Cảnh báo
            </button>

            <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm,4px)] bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] text-[11px] text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)] transition-colors">
              <Settings2 size={14} /> Chuyên nghiệp
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

      {/* DESKTOP TRADING WORKSPACE (>= 1024px) */}
      <div className="hidden lg:flex flex-col gap-1 px-1 py-1 flex-1 max-w-[1920px] mx-auto w-full">
        {/* Top Section */}
        <div className="flex flex-1 gap-1 h-[600px] min-h-[500px]">
          {/* Sidebar: Market List (xl only) */}
          <div className="hidden xl:flex w-[280px] flex-col bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,10px)] overflow-hidden">
            <div className="px-3 py-2 border-b border-[var(--line,#1d1e21)] font-semibold text-[var(--text,#f4f4f5)] text-sm">
              Thị trường
            </div>
            <div className="p-3 text-[11px] text-[var(--text-3,#63636b)] text-center mt-10">
              Danh sách cặp giao dịch (Đang cập nhật)
            </div>
          </div>

          {/* Center: Chart */}
          <div className="flex-1 flex flex-col min-w-[400px]">
            <CandlestickChart symbol={activeSymbol} />
          </div>

          {/* Middle Right: Orderbook & Trades */}
          <div className="w-[300px] flex flex-col shrink-0 bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,10px)] overflow-hidden">
            {/* We'll turn this into tabs later according to spec, for now stack them or use 60/40 split */}
            <div className="flex-1 min-h-[300px] border-b border-[var(--line,#1d1e21)] overflow-hidden">
              <Orderbook
                symbol={activeSymbol}
                onSelectPrice={handlePriceSelected}
              />
            </div>
            <div className="h-[220px] overflow-hidden">
              <MarketTrades symbol={activeSymbol} />
            </div>
          </div>

          {/* Far Right: Order Form */}
          <div className="w-[320px] shrink-0">
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

      {/* MOBILE / TABLET WORKSPACE (< 1024px) */}
      <div className="lg:hidden flex flex-col flex-1 p-2">
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
        <div className="flex-1">
          {mobileTab === 'chart' && <CandlestickChart symbol={activeSymbol} />}
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
        <div className="fixed bottom-12 left-0 right-0 p-3 bg-[var(--color-bg-surface,#111319)]/95 backdrop-blur-md border-t border-[var(--color-border-subtle,#1e212b)] flex items-center gap-3 z-30">
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
    </div>
  );
};
