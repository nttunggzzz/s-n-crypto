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

import { Star } from 'lucide-react';

export interface MarketsPageProps {
  onNavigate: (path: string) => void;
}

export const MarketsPage: React.FC<MarketsPageProps> = ({ onNavigate }) => {
  const { symbols, tickers, isLoading, error, refreshMarketData, setActiveSymbol } = useMarket();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'favorites' | 'all' | 'new'>('all');
  const [favorites, setFavorites] = useState<string[]>([]);

  const filteredSymbols = symbols.filter((s) => {
    const q = search.trim().toUpperCase();
    if (q && !(s.symbol.includes(q) || s.baseAsset.includes(q))) return false;
    
    if (activeTab === 'favorites') return favorites.includes(s.symbol);
    if (activeTab === 'new') return s.baseAsset === 'SOL' || s.baseAsset === 'DOGE'; // mock condition
    return true;
  });

  const handleSelectSymbol = (symbol: string, enabled: boolean) => {
    if (!enabled) return;
    setActiveSymbol(symbol);
    onNavigate(`/trade/${symbol}`);
  };

  const toggleFavorite = (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation();
    setFavorites(prev => 
      prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20 md:pb-6">
      {/* Title & Tabs */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)] mb-4">
          Thị trường
        </h1>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--line,#1d1e21)]">
          <div className="flex gap-6">
             <button onClick={() => setActiveTab('favorites')} className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${activeTab==='favorites' ? 'border-[var(--accent,#818cf8)] text-[var(--text,#f4f4f5)]' : 'border-transparent text-[var(--text-3,#63636b)] hover:text-[var(--text-2,#a1a1aa)]'}`}>
                Yêu thích
             </button>
             <button onClick={() => setActiveTab('all')} className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${activeTab==='all' ? 'border-[var(--accent,#818cf8)] text-[var(--text,#f4f4f5)]' : 'border-transparent text-[var(--text-3,#63636b)] hover:text-[var(--text-2,#a1a1aa)]'}`}>
                Tất cả cặp giao dịch
             </button>
             <button onClick={() => setActiveTab('new')} className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${activeTab==='new' ? 'border-[var(--accent,#818cf8)] text-[var(--text,#f4f4f5)]' : 'border-transparent text-[var(--text-3,#63636b)] hover:text-[var(--text-2,#a1a1aa)]'}`}>
                Mới niêm yết
             </button>
          </div>

          <div className="relative w-full sm:w-64 pb-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm coin"
              className="w-full bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-md,8px)] pl-9 pr-3 py-1.5 text-xs text-[var(--text,#f4f4f5)] placeholder-[var(--text-3,#63636b)] focus:outline-none focus:border-[var(--accent,#818cf8)]"
            />
            <SearchIcon
              size={14}
              className="absolute left-3 top-2.5 text-[var(--text-3,#63636b)]"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} height={48} className="w-full bg-[var(--panel,#0a0a0b)]" />
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
          description={activeTab === 'favorites' ? 'Bạn chưa thêm cặp giao dịch nào vào danh sách yêu thích.' : `Không có kết quả nào phù hợp với từ khóa "${search}"`}
        />
      ) : (
        <div className="bg-[var(--panel,#0a0a0b)] rounded-[var(--radius-lg,12px)] overflow-hidden">
          <Table>
            <TableHeader className="border-y border-[var(--line,#1d1e21)] bg-transparent">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 px-2"></TableHead>
                <TableHead className="text-[11px] text-[var(--text-3,#63636b)] font-medium">Cặp giao dịch</TableHead>
                <TableHead className="text-right text-[11px] text-[var(--text-3,#63636b)] font-medium">Giá gần nhất</TableHead>
                <TableHead className="text-right text-[11px] text-[var(--text-3,#63636b)] font-medium">Biến động 24h</TableHead>
                <TableHead className="text-right hidden sm:table-cell text-[11px] text-[var(--text-3,#63636b)] font-medium">Giá cao nhất</TableHead>
                <TableHead className="text-right hidden sm:table-cell text-[11px] text-[var(--text-3,#63636b)] font-medium">Giá thấp nhất</TableHead>
                <TableHead className="text-right hidden md:table-cell text-[11px] text-[var(--text-3,#63636b)] font-medium">KL 24h</TableHead>
                <TableHead className="text-center text-[11px] text-[var(--text-3,#63636b)] font-medium">Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSymbols.map((item) => {
                const ticker = tickers[item.symbol];
                const isUnavailable = ticker?.status === 'UNAVAILABLE';
                const isStale = ticker?.status === 'STALE';
                const isEnabled = item.enabled;
                const isFav = favorites.includes(item.symbol);

                return (
                  <TableRow
                    key={item.symbol}
                    onClick={() => handleSelectSymbol(item.symbol, isEnabled)}
                    className={`cursor-pointer transition-colors ${
                      !isEnabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[var(--panel-2,#141416)] border-b border-[var(--line,#1d1e21)]'
                    }`}
                  >
                    <TableCell className="w-10 px-2">
                       <button onClick={(e) => toggleFavorite(e, item.symbol)} className="text-[var(--text-3,#63636b)] hover:text-[var(--accent,#818cf8)]">
                         <Star size={16} fill={isFav ? 'currentColor' : 'none'} className={isFav ? 'text-[var(--accent,#818cf8)]' : ''} />
                       </button>
                    </TableCell>
                    {/* Symbol */}
                    <TableCell className="py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text,#f4f4f5)]">{item.baseAsset}</span>
                        <span className="text-xs text-[var(--text-3,#63636b)]">/{item.quoteAsset}</span>
                        {!isEnabled && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] border border-[var(--line,#1d1e21)] text-[var(--text-3,#63636b)]">
                            Tạm ngưng
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Last Price */}
                    <TableCell className="text-right font-medium">
                      {isUnavailable ? (
                        <span className="tabular-nums text-[var(--text-3,#63636b)]">—</span>
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
                        <span className="tabular-nums text-[var(--text-3,#63636b)]">—</span>
                      ) : (
                        <PercentChange
                          percent={ticker?.priceChangePercent}
                          asBadge
                        />
                      )}
                    </TableCell>

                    {/* 24h High */}
                    <TableCell className="text-right tabular-nums text-xs hidden sm:table-cell text-[var(--text-2,#a1a1aa)]">
                      {isUnavailable ? '—' : formatDecimal(ticker?.highPrice, { decimals: item.pricePrecision, locale: 'vi' })}
                    </TableCell>

                    {/* 24h Low */}
                    <TableCell className="text-right tabular-nums text-xs hidden sm:table-cell text-[var(--text-2,#a1a1aa)]">
                      {isUnavailable ? '—' : formatDecimal(ticker?.lowPrice, { decimals: item.pricePrecision, locale: 'vi' })}
                    </TableCell>

                    {/* Quote Volume */}
                    <TableCell className="text-right tabular-nums text-xs hidden md:table-cell text-[var(--text-2,#a1a1aa)] font-mono">
                      {isUnavailable ? '—' : formatDecimal(ticker?.quoteVolume, { decimals: 2, locale: 'vi' })}
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell className="text-center">
                      {!isEnabled ? (
                        <span className="text-xs text-[var(--text-3,#63636b)]">Đã tắt</span>
                      ) : isUnavailable || isStale ? (
                        <StaleBadge status={ticker?.status} />
                      ) : (
                        <Badge variant="success" size="sm" className="bg-[var(--up,#1fc27a)]/10 text-[var(--up,#1fc27a)] border-none">
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
