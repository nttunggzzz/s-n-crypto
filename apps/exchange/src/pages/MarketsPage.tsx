import React, { useState, useEffect } from 'react';
import { useMarket } from '../context/MarketContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { getApiClient } from '../services/api.ts';
import type { Announcement, AssetTag, FuturesTicker, Sparkline, FuturesSymbolInfo } from '@cex/contracts';
import { ASSET_TAG_LABELS } from '@cex/contracts';
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

import { Star, Bell, X } from 'lucide-react';

export interface MarketsPageProps {
  onNavigate: (path: string) => void;
}

const SparklineSvg: React.FC<{ points?: string[]; isPositive?: boolean }> = ({ points, isPositive = true }) => {
  if (!points || points.length < 2) return <span className="text-[var(--text-3,#63636b)] text-xs">—</span>;
  const nums = points.map(Number);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const width = 80;
  const height = 24;
  const coords = nums.map((val, idx) => {
    const x = (idx / (nums.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const strokeColor = isPositive ? 'var(--up, #1fc27a)' : 'var(--down, #f2475f)';
  return (
    <svg width={width} height={height} className="overflow-visible inline-block">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords}
      />
    </svg>
  );
};

export const MarketsPage: React.FC<MarketsPageProps> = ({ onNavigate }) => {
  const { symbols, tickers, exchangeInfo, isLoading, error, refreshMarketData, setActiveSymbol } = useMarket();
  const { isAuthenticated } = useAuth();
  const api = getApiClient();

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'futures' | 'favorites'>('all');
  const [selectedTag, setSelectedTag] = useState<AssetTag | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);

  // B2: Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('cex_dismissed_announcements') || '[]');
    } catch {
      return [];
    }
  });

  // B3: Sparklines & Futures Tickers
  const [sparklinesMap, setSparklinesMap] = useState<Record<string, Sparkline>>({});
  const [futuresTickersList, setFuturesTickersList] = useState<FuturesTicker[]>([]);
  const [futuresContracts, setFuturesContracts] = useState<FuturesSymbolInfo[]>([]);

  useEffect(() => {
    if (isAuthenticated) {
      api.getPreferences()
        .then((pref) => {
          if (Array.isArray(pref.favorites)) {
            setFavorites(pref.favorites);
          }
        })
        .catch(() => {});
    } else {
      try {
        const stored = localStorage.getItem('cex_favorites');
        if (stored) setFavorites(JSON.parse(stored));
      } catch {}
    }

    // Load announcements (B2)
    api.announcements()
      .then((res) => setAnnouncements(res.items))
      .catch(() => {});

    // Load sparklines (B3)
    api.sparklines({ query: { range: '24h' } })
      .then((res) => {
        const map: Record<string, Sparkline> = {};
        res.items.forEach((s) => {
          map[s.symbol] = s;
        });
        setSparklinesMap(map);
      })
      .catch(() => {});

    // Load futures contracts & tickers (B3)
    Promise.all([
      api.futuresTickers().catch(() => ({ items: [] })),
      api.futuresExchangeInfo().catch(() => ({ symbols: [] })),
    ]).then(([tRes, exRes]) => {
      setFuturesTickersList(tRes.items);
      setFuturesContracts(exRes.symbols);
    }).catch(() => {});
  }, [isAuthenticated, api]);

  const dismissAnnouncement = (id: string) => {
    const next = [...dismissedAnnouncements, id];
    setDismissedAnnouncements(next);
    localStorage.setItem('cex_dismissed_announcements', JSON.stringify(next));
  };

  const filteredSymbols = symbols.filter((s) => {
    const q = search.trim().toUpperCase();
    if (q && !(s.symbol.includes(q) || s.baseAsset.includes(q))) return false;
    
    if (activeTab === 'favorites') return favorites.includes(s.symbol);
    
    if (selectedTag) {
      const asset = exchangeInfo?.assets?.find((a) => a.asset === s.baseAsset);
      if (!asset || !asset.tags.includes(selectedTag)) return false;
    }
    return true;
  });

  const filteredFutures = futuresContracts.filter((c) => {
    const q = search.trim().toUpperCase();
    if (q && !(c.symbol.includes(q) || c.underlyingAsset.includes(q))) return false;
    return true;
  });

  const handleSelectSymbol = (symbol: string, enabled: boolean) => {
    if (!enabled) return;
    setActiveSymbol(symbol);
    onNavigate(`/trade/${symbol}`);
  };

  const toggleFavorite = (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol].slice(0, 30);
      
      if (isAuthenticated) {
        api.updatePreferences({ body: { favorites: next } }).catch(() => {});
      } else {
        localStorage.setItem('cex_favorites', JSON.stringify(next));
      }
      return next;
    });
  };

  const activeAnnouncements = announcements.filter(
    (a) => !dismissedAnnouncements.includes(a.id)
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20 md:pb-6 space-y-6">
      {/* B2: Active Announcements Banner */}
      {activeAnnouncements.length > 0 && (
        <div className="space-y-2">
          {activeAnnouncements.map((ann) => (
            <div
              key={ann.id}
              className={`p-3 rounded-lg border flex items-center justify-between text-xs transition-colors ${
                ann.level === 'MAINTENANCE'
                  ? 'bg-[var(--down,#f2475f)]/10 border-[var(--down,#f2475f)]/30 text-[var(--down,#f2475f)]'
                  : ann.level === 'IMPORTANT'
                  ? 'bg-[var(--warn,#f59e0b)]/10 border-[var(--warn,#f59e0b)]/30 text-[var(--warn,#f59e0b)]'
                  : 'bg-[var(--accent,#818cf8)]/10 border-[var(--accent,#818cf8)]/30 text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Bell size={16} className="shrink-0" />
                <div>
                  <span className="font-bold mr-2">[{ann.title}]</span>
                  <span>{ann.body}</span>
                </div>
              </div>
              <button
                onClick={() => dismissAnnouncement(ann.id)}
                className="p-1 hover:bg-white/10 rounded cursor-pointer ml-3 shrink-0"
                title="Đóng thông báo"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Title & Tabs */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)] mb-4">
          Thị trường
        </h1>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--line,#1d1e21)]">
          <div className="flex gap-6">
            <button
              onClick={() => { setActiveTab('all'); setSelectedTag(null); }}
              className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'all'
                  ? 'border-[var(--accent,#818cf8)] text-[var(--text,#f4f4f5)]'
                  : 'border-transparent text-[var(--text-3,#63636b)] hover:text-[var(--text-2,#a1a1aa)]'
              }`}
            >
              Tất cả cặp Spot
            </button>
            <button
              onClick={() => { setActiveTab('futures'); setSelectedTag(null); }}
              className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'futures'
                  ? 'border-[var(--accent,#818cf8)] text-[var(--text,#f4f4f5)]'
                  : 'border-transparent text-[var(--text-3,#63636b)] hover:text-[var(--text-2,#a1a1aa)]'
              }`}
            >
              Hợp đồng Futures
            </button>
            <button
              onClick={() => { setActiveTab('favorites'); setSelectedTag(null); }}
              className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'favorites'
                  ? 'border-[var(--accent,#818cf8)] text-[var(--text,#f4f4f5)]'
                  : 'border-transparent text-[var(--text-3,#63636b)] hover:text-[var(--text-2,#a1a1aa)]'
              }`}
            >
              Yêu thích ({favorites.length})
            </button>
          </div>

          <div className="relative w-full sm:w-64 pb-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm coin, hợp đồng"
              className="w-full bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-md,8px)] pl-9 pr-3 py-1.5 text-xs text-[var(--text,#f4f4f5)] placeholder-[var(--text-3,#63636b)] focus:outline-none focus:border-[var(--accent,#818cf8)]"
            />
            <SearchIcon
              size={14}
              className="absolute left-3 top-2.5 text-[var(--text-3,#63636b)]"
            />
          </div>
        </div>

        {/* A3: Sector Tag Chips for Spot */}
        {activeTab === 'all' && (
          <div className="flex items-center gap-2 pt-3 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors shrink-0 ${
                selectedTag === null
                  ? 'bg-[var(--accent,#818cf8)] text-black font-semibold'
                  : 'bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)] hover:text-white'
              }`}
            >
              Tất cả
            </button>
            {(Object.entries(ASSET_TAG_LABELS) as [AssetTag, { vi: string; en: string }][]).map(([tagKey, label]) => {
              const isSelected = selectedTag === tagKey;
              return (
                <button
                  key={tagKey}
                  onClick={() => setSelectedTag(isSelected ? null : tagKey)}
                  className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors shrink-0 ${
                    isSelected
                      ? 'bg-[var(--accent,#818cf8)] text-black font-semibold'
                      : 'bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)] hover:text-white'
                  }`}
                >
                  {label.vi}
                </button>
              );
            })}
          </div>
        )}
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
      ) : activeTab === 'futures' ? (
        /* Futures Contracts Table (B3) */
        filteredFutures.length === 0 ? (
          <EmptyState
            title="Không tìm thấy hợp đồng"
            description={`Không có hợp đồng Futures nào phù hợp với "${search}"`}
          />
        ) : (
          <div className="bg-[var(--panel,#0a0a0b)] rounded-[var(--radius-lg,12px)] overflow-hidden">
            <Table>
              <TableHeader className="border-y border-[var(--line,#1d1e21)] bg-transparent">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] text-[var(--text-3,#63636b)] font-medium">Hợp đồng</TableHead>
                  <TableHead className="text-right text-[11px] text-[var(--text-3,#63636b)] font-medium">Giá gần nhất</TableHead>
                  <TableHead className="text-right text-[11px] text-[var(--text-3,#63636b)] font-medium">Biến động 24h</TableHead>
                  <TableHead className="text-right text-[11px] text-[var(--text-3,#63636b)] font-medium">Funding Rate</TableHead>
                  <TableHead className="text-right hidden sm:table-cell text-[11px] text-[var(--text-3,#63636b)] font-medium">Đòn bẩy tối đa</TableHead>
                  <TableHead className="text-center hidden md:table-cell text-[11px] text-[var(--text-3,#63636b)] font-medium">Biểu đồ 24h</TableHead>
                  <TableHead className="text-center text-[11px] text-[var(--text-3,#63636b)] font-medium">Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFutures.map((contract) => {
                  const ft = futuresTickersList.find((t) => t.symbol === contract.symbol);
                  const isEnabled = contract.enabled;
                  const isPos = !ft?.priceChangePercent?.startsWith('-');
                  return (
                    <TableRow
                      key={contract.symbol}
                      onClick={() => onNavigate(`/futures/${contract.symbol}`)}
                      className={`cursor-pointer transition-colors ${
                        !isEnabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[var(--panel-2,#141416)] border-b border-[var(--line,#1d1e21)]'
                      }`}
                    >
                      <TableCell className="py-4 font-bold text-white">
                        <div className="flex items-center gap-2">
                          <span>{contract.symbol}</span>
                          <span className="text-[10px] text-[var(--accent,#818cf8)] bg-[var(--accent,#818cf8)]/10 px-1.5 py-0.5 rounded font-mono">
                            {contract.multiplier}× {contract.underlyingAsset}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium text-white">
                        {ft?.lastPrice ? formatDecimal(ft.lastPrice) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${isPos ? 'text-[var(--up,#1fc27a)] bg-[var(--up,#1fc27a)]/10' : 'text-[var(--down,#f2475f)] bg-[var(--down,#f2475f)]/10'}`}>
                          {ft?.priceChangePercent ? `${isPos ? '+' : ''}${ft.priceChangePercent}%` : '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-[var(--warn,#f59e0b)] font-semibold text-xs">
                        {ft?.fundingRate ? `${(parseFloat(ft.fundingRate) * 100).toFixed(4)}%` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs hidden sm:table-cell text-white">
                        {contract.maxLeverage}×
                      </TableCell>
                      <TableCell className="text-center hidden md:table-cell">
                        <SparklineSvg points={sparklinesMap[contract.symbol]?.points} isPositive={isPos} />
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="success" size="sm" className="bg-[var(--up,#1fc27a)]/10 text-[var(--up,#1fc27a)] border-none">
                          Hoạt động
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )
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
                <TableHead className="text-center hidden lg:table-cell text-[11px] text-[var(--text-3,#63636b)] font-medium">Biểu đồ 24h</TableHead>
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
                const isPos = !ticker?.priceChangePercent?.startsWith('-');

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

                    {/* Sparkline (B3) */}
                    <TableCell className="text-center hidden lg:table-cell">
                      <SparklineSvg points={sparklinesMap[item.symbol]?.points} isPositive={isPos} />
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
