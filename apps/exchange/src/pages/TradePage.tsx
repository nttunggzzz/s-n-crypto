import React, { useState, useEffect } from 'react';
import { useMarket } from '../context/MarketContext.tsx';
import { CandlestickChart } from '../components/trading/CandlestickChart.tsx';
import { Orderbook } from '../components/trading/Orderbook.tsx';
import { MarketTrades } from '../components/trading/MarketTrades.tsx';
import { OrderForm } from '../components/trading/OrderForm.tsx';
import { UserOrdersTabs } from '../components/trading/UserOrdersTabs.tsx';
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
    setSelectedPrice(price);
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
      <div className="bg-[var(--color-bg-surface,#111319)] border-b border-[var(--color-border-subtle,#1e212b)] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Symbol selector & Price */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Symbol Dropdown */}
          <div className="relative group">
            <div className="flex items-center gap-2 cursor-pointer bg-[var(--color-bg-elevated,#1b1e27)] px-2.5 py-1.5 rounded-[var(--radius-md,8px)] border border-[var(--color-border-subtle,#1e212b)] hover:border-[#3d4352] transition-colors">
              <SymbolBadge
                symbol={activeSymbol}
                baseAsset={activeSymbolInfo?.baseAsset}
                quoteAsset={activeSymbolInfo?.quoteAsset}
              />
              <span className="text-[10px] text-[var(--color-text-muted,#6b7280)]">▼</span>
            </div>

            {/* Quick Switch Dropdown */}
            <div className="hidden group-hover:block absolute left-0 top-full mt-1 w-44 bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-default,#272a33)] rounded-[var(--radius-md,8px)] shadow-2xl py-1 z-50 max-h-60 overflow-y-auto">
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
                  className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between cursor-pointer hover:bg-[var(--color-bg-elevated,#1b1e27)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    s.symbol === activeSymbol ? 'text-[var(--color-accent-primary,#818cf8)] font-bold' : ''
                  }`}
                >
                  <span>{s.symbol}</span>
                  {!s.enabled && <span className="text-[9px] text-[var(--color-text-muted,#6b7280)]">Tắt</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Current Price */}
          <div className="flex items-baseline gap-2">
            <span className="text-base sm:text-lg font-bold font-mono">
              {isUnavailable ? (
                <span className="text-[var(--color-text-muted,#6b7280)]">—</span>
              ) : (
                <PriceText
                  price={activeTicker?.lastPrice}
                  tickSize={activeSymbolInfo?.tickSize}
                  colored
                />
              )}
            </span>
            <PercentChange
              percent={activeTicker?.priceChangePercent}
              asBadge
            />
          </div>

          {/* Stale Badge if any */}
          <StaleBadge status={activeTicker?.status} />
        </div>

        {/* 24h Metrics */}
        <div className="hidden md:flex items-center gap-6 font-mono text-[11px] tabular-nums text-[var(--color-text-secondary,#9ca3af)]">
          <div>
            <div className="text-[9px] text-[var(--color-text-muted,#6b7280)] uppercase font-sans">Giá cao 24h</div>
            <div className="text-[var(--color-text-primary,#f3f4f6)]">
              {isUnavailable ? '—' : formatDecimal(activeTicker?.highPrice, { decimals: activeSymbolInfo?.pricePrecision })}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-[var(--color-text-muted,#6b7280)] uppercase font-sans">Giá thấp 24h</div>
            <div className="text-[var(--color-text-primary,#f3f4f6)]">
              {isUnavailable ? '—' : formatDecimal(activeTicker?.lowPrice, { decimals: activeSymbolInfo?.pricePrecision })}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-[var(--color-text-muted,#6b7280)] uppercase font-sans">KL 24h (USDT)</div>
            <div className="text-[var(--color-text-primary,#f3f4f6)]">
              {isUnavailable ? '—' : formatDecimal(activeTicker?.quoteVolume, { decimals: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* DESKTOP TRADING WORKSPACE (>= 1024px) */}
      <div className="hidden lg:grid grid-cols-12 gap-2 p-2 flex-1 max-w-[1920px] mx-auto w-full">
        {/* Left Column (8 cols): Chart + Orders tabs */}
        <div className="col-span-9 xl:col-span-9 flex flex-col gap-2">
          {/* Candlestick Chart */}
          <CandlestickChart symbol={activeSymbol} />

          {/* Orders tabs at bottom */}
          <UserOrdersTabs
            symbol={activeSymbol}
            refreshTrigger={orderRefreshTrigger}
          />
        </div>

        {/* Right Column (3 cols): Orderbook + Trades + Order Form */}
        <div className="col-span-3 xl:col-span-3 flex flex-col gap-2">
          {/* Order Form */}
          <OrderForm
            symbol={activeSymbol}
            selectedPrice={selectedPrice}
            onOrderPlaced={handleOrderPlaced}
            onNavigateToLogin={() => onNavigate('/login')}
          />

          {/* Sổ lệnh (Orderbook) */}
          <div className="h-[340px]">
            <Orderbook
              symbol={activeSymbol}
              onSelectPrice={handlePriceSelected}
            />
          </div>

          {/* Giao dịch gần đây */}
          <div className="h-[220px]">
            <MarketTrades symbol={activeSymbol} />
          </div>
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
