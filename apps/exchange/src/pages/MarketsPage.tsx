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

import { Star, Bell, X, Sparkles, TrendingUp, Zap, ArrowRight, Activity } from 'lucide-react';

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
  const { user, isAuthenticated } = useAuth();
  const api = getApiClient();

  const btcTicker = tickers['BTCUSDT'] || null;
  const ethTicker = tickers['ETHUSDT'] || null;
  const topGainer = React.useMemo(() => {
    const list = Object.values(tickers);
    if (list.length === 0) return null;
    return [...list].sort((a, b) => parseFloat(b.priceChangePercent || '0') - parseFloat(a.priceChangePercent || '0'))[0] || null;
  }, [tickers]);

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
  }, [isAuthenticated, api]);

  // Load futures contracts & tickers lazily when futures tab is opened (B3)
  useEffect(() => {
    if (activeTab === 'futures' && futuresContracts.length === 0) {
      Promise.all([
        api.futuresTickers().catch(() => ({ items: [] })),
        api.futuresExchangeInfo().catch(() => ({ symbols: [] })),
      ]).then(([tRes, exRes]) => {
        setFuturesTickersList(tRes.items);
        setFuturesContracts(exRes.symbols);
      }).catch(() => {});
    }
  }, [activeTab, futuresContracts.length, api]);

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
      {/* User Welcome & Hero Section */}
      {isAuthenticated ? (
        <div className="relative overflow-hidden rounded-2xl border border-[var(--line,#1d1e21)] bg-gradient-to-r from-[var(--panel,#0a0a0b)] via-[var(--panel-2,#141416)] to-[var(--panel,#0a0a0b)] p-6 shadow-md transition-all">
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 rounded-full bg-[var(--accent,#818cf8)]/10 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent,#818cf8)]/15 border border-[var(--accent,#818cf8)]/30 text-[var(--accent,#818cf8)] text-xs font-semibold">
                <Sparkles size={13} className="animate-spin" style={{ animationDuration: '6s' }} />
                Nền tảng giao dịch chuyên nghiệp v2.0
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                Chào mừng trở lại, <span className="text-[var(--accent,#818cf8)]">{user?.name}</span> 👋
              </h2>
              <p className="text-xs text-[var(--text-2,#a1a1aa)] max-w-xl leading-relaxed">
                Tối ưu hóa chiến lược danh mục với công cụ giao dịch đa tầng: Spot, Futures đòn bẩy 50x và hệ thống Bot tự động.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => onNavigate('/trade/BTCUSDT')}
                className="px-4 py-2 rounded-xl bg-[var(--accent,#818cf8)] text-white text-xs font-bold hover:bg-[var(--accent,#818cf8)]/90 transition-all shadow-md shadow-[var(--accent,#818cf8)]/20 flex items-center gap-1.5 cursor-pointer hover:scale-105 duration-200"
              >
                <TrendingUp size={14} /> Giao dịch Spot
              </button>
              <button
                onClick={() => onNavigate('/futures/BTCUSDT')}
                className="px-4 py-2 rounded-xl bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] text-white text-xs font-semibold hover:border-[var(--accent,#818cf8)]/50 transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105 duration-200"
              >
                <Zap size={14} className="text-yellow-400" /> Futures
              </button>
              <button
                onClick={() => onNavigate('/bots')}
                className="px-4 py-2 rounded-xl bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] text-white text-xs font-semibold hover:border-[var(--accent,#818cf8)]/50 transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105 duration-200"
              >
                Bot tự động
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-[var(--line,#1d1e21)] bg-gradient-to-r from-[var(--panel,#0a0a0b)] via-[var(--panel-2,#141416)] to-[var(--panel,#0a0a0b)] p-6 sm:p-8 shadow-xl">
          <div className="absolute top-0 right-0 -mt-16 -mr-16 w-96 h-96 rounded-full bg-[var(--accent,#818cf8)]/15 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent,#818cf8)]/15 border border-[var(--accent,#818cf8)]/30 text-[var(--accent,#818cf8)] text-xs font-semibold">
                <Sparkles size={13} className="animate-spin" style={{ animationDuration: '6s' }} />
                Sàn giao dịch mô phỏng thế hệ mới
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
                Giao dịch tài sản số chuẩn quốc tế, <br className="hidden sm:inline" />
                <span className="bg-gradient-to-r from-[var(--accent,#818cf8)] via-indigo-300 to-purple-400 bg-clip-text text-transparent">Khớp lệnh siêu tốc &amp; Bền vững</span>
              </h2>
              <p className="text-xs sm:text-sm text-[var(--text-2,#a1a1aa)] max-w-xl leading-relaxed">
                Trải nghiệm toàn diện nền tảng CEX hiện đại: Spot, Futures USDT-M đòn bẩy 50x, Bot lưới và Mua định kỳ DCA với luồng dữ liệu thời gian thực.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => onNavigate('/register')}
                className="px-5 py-2.5 rounded-xl bg-[var(--accent,#818cf8)] text-white text-xs font-bold hover:bg-[var(--accent,#818cf8)]/90 transition-all shadow-lg shadow-[var(--accent,#818cf8)]/25 flex items-center gap-2 cursor-pointer hover:scale-105 duration-200"
              >
                Đăng ký tài khoản <ArrowRight size={14} />
              </button>
              <button
                onClick={() => onNavigate('/login')}
                className="px-5 py-2.5 rounded-xl bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] text-white text-xs font-semibold hover:border-white/30 transition-all cursor-pointer hover:scale-105 duration-200"
              >
                Đăng nhập
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Market Highlights Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: BTC/USDT */}
        <div
          onClick={() => onNavigate('/trade/BTCUSDT')}
          className="p-4 rounded-xl border border-[var(--line,#1d1e21)] bg-[var(--panel,#0a0a0b)] hover:border-[var(--accent,#818cf8)]/50 hover:-translate-y-1 transition-all duration-300 cursor-pointer shadow-sm relative group overflow-hidden"
        >
          <div className="flex items-center justify-between text-xs mb-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm">BTC / USDT</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--panel-2,#141416)] text-[var(--text-3,#63636b)] border border-[var(--line,#1d1e21)] font-mono">Dẫn đầu</span>
            </div>
            <SparklineSvg points={sparklinesMap['BTCUSDT']?.points} isPositive={parseFloat(btcTicker?.priceChangePercent || '0') >= 0} />
          </div>
          <div className="flex items-baseline justify-between mt-3 font-mono">
            <span className="text-base font-bold text-white">
              {btcTicker && btcTicker.lastPrice ? formatDecimal(btcTicker.lastPrice) : '84.320,00'}
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${parseFloat(btcTicker?.priceChangePercent || '0') >= 0 ? 'text-[var(--up,#1fc27a)] bg-[var(--up,#1fc27a)]/10' : 'text-[var(--down,#f2475f)] bg-[var(--down,#f2475f)]/10'}`}>
              {parseFloat(btcTicker?.priceChangePercent || '0') >= 0 ? '+' : ''}{btcTicker && btcTicker.priceChangePercent ? parseFloat(btcTicker.priceChangePercent).toFixed(2) : '+1.45'}%
            </span>
          </div>
        </div>

        {/* Card 2: Top Gainer */}
        <div
          onClick={() => topGainer && onNavigate(`/trade/${topGainer.symbol}`)}
          className="p-4 rounded-xl border border-[var(--line,#1d1e21)] bg-[var(--panel,#0a0a0b)] hover:border-[var(--accent,#818cf8)]/50 hover:-translate-y-1 transition-all duration-300 cursor-pointer shadow-sm relative group overflow-hidden"
        >
          <div className="flex items-center justify-between text-xs mb-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm">{topGainer?.symbol || 'ETH / USDT'}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--up,#1fc27a)]/10 text-[var(--up,#1fc27a)] border border-[var(--up,#1fc27a)]/20 font-mono">Tăng mạnh</span>
            </div>
            <SparklineSvg points={topGainer ? sparklinesMap[topGainer.symbol]?.points : undefined} isPositive={true} />
          </div>
          <div className="flex items-baseline justify-between mt-3 font-mono">
            <span className="text-base font-bold text-white">
              {topGainer && topGainer.lastPrice ? formatDecimal(topGainer.lastPrice) : '—'}
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded text-[var(--up,#1fc27a)] bg-[var(--up,#1fc27a)]/10">
              +{topGainer && topGainer.priceChangePercent ? parseFloat(topGainer.priceChangePercent).toFixed(2) : '0.00'}%
            </span>
          </div>
        </div>

        {/* Card 3: Futures Highlight */}
        <div
          onClick={() => onNavigate('/futures/BTCUSDT')}
          className="p-4 rounded-xl border border-[var(--line,#1d1e21)] bg-[var(--panel,#0a0a0b)] hover:border-[var(--accent,#818cf8)]/50 hover:-translate-y-1 transition-all duration-300 cursor-pointer shadow-sm relative group overflow-hidden"
        >
          <div className="flex items-center justify-between text-xs mb-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm">Futures BTC-PERP</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent,#818cf8)]/10 text-[var(--accent,#818cf8)] border border-[var(--accent,#818cf8)]/20 font-mono">50×</span>
            </div>
            <span className="text-[10px] text-[var(--text-3,#63636b)] font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--up,#1fc27a)] animate-pulse" /> Live
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-3 font-mono">
            <span className="text-xs text-[var(--text-3,#63636b)]">
              Funding: <span className="text-[var(--up,#1fc27a)] font-bold">0,0100%</span>
            </span>
            <span className="text-xs font-semibold text-[var(--accent,#818cf8)] flex items-center gap-1">
              Khám phá <ArrowRight size={12} />
            </span>
          </div>
        </div>
      </div>
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
