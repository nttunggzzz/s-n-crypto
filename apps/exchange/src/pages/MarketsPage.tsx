import React, { useState } from 'react';
import { useMarket } from '../context/MarketContext.tsx';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  PriceText,
  PercentChange,
  SymbolBadge,
  StaleBadge,
  Badge,
  SearchIcon,
  Skeleton,
  EmptyState,
  ErrorState,
  formatDecimal,
} from '@cex/ui';

export interface MarketsPageProps {
  onNavigate: (path: string) => void;
}

export const MarketsPage: React.FC<MarketsPageProps> = ({ onNavigate }) => {
  const { symbols, tickers, isLoading, error, refreshMarketData, setActiveSymbol } = useMarket();
  const [search, setSearch] = useState('');

  const filteredSymbols = symbols.filter((s) => {
    const q = search.trim().toUpperCase();
    if (!q) return true;
    return s.symbol.includes(q) || s.baseAsset.includes(q);
  });

  const handleSelectSymbol = (symbol: string, enabled: boolean) => {
    if (!enabled) return;
    setActiveSymbol(symbol);
    onNavigate(`/trade/${symbol}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20 md:pb-6">
      {/* Title & Search bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text-primary,#f3f4f6)]">
            Thị trường Spot
          </h1>
          <p className="text-xs text-[var(--color-text-secondary,#9ca3af)] mt-1">
            Theo dõi 10 cặp tiền điện tử với dữ liệu giá khớp thời gian thực
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm coin (BTC, ETH...)"
            className="w-full bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-default,#272a33)] rounded-[var(--radius-md,8px)] pl-9 pr-3 py-1.5 text-xs text-[var(--color-text-primary,#f3f4f6)] placeholder-[var(--color-text-muted,#6b7280)] focus:outline-none focus:border-[var(--color-border-focus,#818cf8)]"
          />
          <SearchIcon
            size={14}
            className="absolute left-3 top-2.5 text-[var(--color-text-muted,#6b7280)]"
          />
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} height={48} className="w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Không thể tải thị trường"
          message={error}
          onRetry={refreshMarketData}
        />
      ) : filteredSymbols.length === 0 ? (
        <EmptyState
          title="Không tìm thấy cặp giao dịch"
          description={`Không có kết quả nào phù hợp với từ khóa "${search}"`}
        />
      ) : (
        <div className="bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-subtle,#1e212b)] rounded-[var(--radius-lg,12px)] overflow-hidden shadow-xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cặp giao dịch</TableHead>
                <TableHead className="text-right">Giá gần nhất</TableHead>
                <TableHead className="text-right">Biến động 24h</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Giá cao nhất</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Giá thấp nhất</TableHead>
                <TableHead className="text-right hidden md:table-cell">Khối lượng 24h (USDT)</TableHead>
                <TableHead className="text-center">Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSymbols.map((item) => {
                const ticker = tickers[item.symbol];
                const isUnavailable = ticker?.status === 'UNAVAILABLE';
                const isStale = ticker?.status === 'STALE';
                const isEnabled = item.enabled;

                return (
                  <TableRow
                    key={item.symbol}
                    onClick={() => handleSelectSymbol(item.symbol, isEnabled)}
                    className={`cursor-pointer ${
                      !isEnabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[var(--color-bg-elevated,#1b1e27)]/80'
                    }`}
                  >
                    {/* Symbol */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <SymbolBadge
                          symbol={item.symbol}
                          baseAsset={item.baseAsset}
                          quoteAsset={item.quoteAsset}
                        />
                        {!isEnabled && (
                          <Badge variant="outline" size="sm">
                            Tạm ngưng
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Last Price */}
                    <TableCell className="text-right font-medium">
                      {isUnavailable ? (
                        <span className="tabular-nums text-[var(--color-text-muted,#6b7280)]">—</span>
                      ) : (
                        <PriceText
                          price={ticker?.lastPrice}
                          tickSize={item.tickSize}
                          colored
                          flash={isEnabled}
                        />
                      )}
                    </TableCell>

                    {/* 24h Change */}
                    <TableCell className="text-right">
                      {isUnavailable ? (
                        <span className="tabular-nums text-[var(--color-text-muted,#6b7280)]">—</span>
                      ) : (
                        <PercentChange
                          percent={ticker?.priceChangePercent}
                          asBadge
                        />
                      )}
                    </TableCell>

                    {/* 24h High */}
                    <TableCell className="text-right tabular-nums text-xs hidden sm:table-cell text-[var(--color-text-secondary,#9ca3af)]">
                      {isUnavailable ? '—' : formatDecimal(ticker?.highPrice, { decimals: item.pricePrecision, locale: 'vi' })}
                    </TableCell>

                    {/* 24h Low */}
                    <TableCell className="text-right tabular-nums text-xs hidden sm:table-cell text-[var(--color-text-secondary,#9ca3af)]">
                      {isUnavailable ? '—' : formatDecimal(ticker?.lowPrice, { decimals: item.pricePrecision, locale: 'vi' })}
                    </TableCell>

                    {/* Quote Volume */}
                    <TableCell className="text-right tabular-nums text-xs hidden md:table-cell text-[var(--color-text-secondary,#9ca3af)] font-mono">
                      {isUnavailable ? '—' : formatDecimal(ticker?.quoteVolume, { decimals: 2, locale: 'vi' })}
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell className="text-center">
                      {!isEnabled ? (
                        <span className="text-xs text-[var(--color-text-muted,#6b7280)]">Đã tắt</span>
                      ) : isUnavailable || isStale ? (
                        <StaleBadge status={ticker?.status} />
                      ) : (
                        <Badge variant="success" size="sm">
                          Hoạt động
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
