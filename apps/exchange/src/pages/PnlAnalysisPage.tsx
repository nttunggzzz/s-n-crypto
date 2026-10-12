import React, { useState, useEffect, useMemo } from 'react';
import type { PnlAnalysis, PnlRange, PnlBySymbol } from '@cex/contracts';
import { getApiClient } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  Card,
  Button,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Skeleton,
  EmptyState,
  formatDecimal,
} from '@cex/ui';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  HelpCircle,
  BarChart2,
  ChevronLeft,
} from 'lucide-react';

export interface PnlAnalysisPageProps {
  onNavigate: (path: string) => void;
}

export const PnlAnalysisPage: React.FC<PnlAnalysisPageProps> = ({ onNavigate }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const api = getApiClient();

  const [range, setRange] = useState<PnlRange>('30d');
  const [data, setData] = useState<PnlAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'symbol' | 'realized' | 'trades' | 'wins'>('realized');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    setLoading(true);

    api.pnlAnalysis({ query: { range } })
      .then((res) => {
        if (active) setData(res);
      })
      .catch(() => {
        if (active) setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, isAuthenticated, range]);

  const ranges: { id: PnlRange; label: string }[] = [
    { id: '7d', label: '7 ngày' },
    { id: '30d', label: '30 ngày' },
    { id: '90d', label: '90 ngày' },
    { id: 'all', label: 'Tất cả' },
  ];

  const sortedBySymbol = useMemo(() => {
    if (!data?.bySymbol) return [];
    return [...data.bySymbol].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'symbol') {
        cmp = a.symbol.localeCompare(b.symbol);
      } else if (sortBy === 'realized') {
        cmp = parseFloat(a.realized) - parseFloat(b.realized);
      } else if (sortBy === 'trades') {
        cmp = a.trades - b.trades;
      } else if (sortBy === 'wins') {
        cmp = a.wins - b.wins;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [data?.bySymbol, sortBy, sortAsc]);

  const toggleSort = (field: 'symbol' | 'realized' | 'trades' | 'wins') => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6 animate-pulse">
        <div className="h-44 bg-[var(--panel,#0a0a0b)] rounded-[var(--radius-lg,12px)] border border-[var(--line,#1d1e21)]" />
        <div className="h-72 bg-[var(--panel,#0a0a0b)] rounded-[var(--radius-lg,12px)] border border-[var(--line,#1d1e21)]" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <EmptyState
          title="Yêu cầu đăng nhập"
          description="Vui lòng đăng nhập để xem báo cáo phân tích lãi lỗ chi tiết."
          action={
            <Button variant="primary" onClick={() => onNavigate('/login')}>
              Đăng nhập
            </Button>
          }
        />
      </div>
    );
  }

  const isPositive = (val: string | null | undefined) => {
    if (!val) return false;
    return parseFloat(val) > 0;
  };

  const isNegative = (val: string | null | undefined) => {
    if (!val) return false;
    return parseFloat(val) < 0;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20 w-full space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--line,#1d1e21)]">
        <div>
          <button
            onClick={() => onNavigate('/assets')}
            className="flex items-center gap-1.5 text-xs text-[var(--text-3,#63636b)] hover:text-white transition-colors mb-2 cursor-pointer"
          >
            <ChevronLeft size={14} /> Quay lại Tài sản
          </button>
          <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)] flex items-center gap-2">
            Phân tích lãi lỗ
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--panel-2,#141416)] text-[var(--text-2,#a1a1aa)] font-normal border border-[var(--line,#1d1e21)]">
              Đã chốt
            </span>
          </h1>
          <p className="text-xs text-[var(--text-3,#63636b)] mt-1">
            Chỉ tính lãi lỗ đã chốt từ Spot và Futures; vị thế đang mở xem tại mục Tài sản.
          </p>
        </div>

        {/* Range Selector */}
        <div className="flex items-center gap-1 bg-[var(--panel-2,#141416)] p-1 rounded-lg border border-[var(--line,#1d1e21)] self-start sm:self-auto">
          {ranges.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                range === r.id
                  ? 'bg-[var(--accent,#818cf8)] text-black font-bold shadow-sm'
                  : 'text-[var(--text-2,#a1a1aa)] hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={100} className="w-full rounded-xl" />
          ))}
        </div>
      ) : !data || (data.trades.count === 0 && parseFloat(data.totalRealized) === 0) ? (
        <EmptyState
          title="Chưa có dữ liệu giao dịch đã chốt"
          description="Bạn chưa có lệnh chốt lời/cắt lỗ nào trong khoảng thời gian đã chọn."
          action={
            <Button variant="primary" onClick={() => onNavigate('/trade/BTC-USDT')}>
              Giao dịch ngay
            </Button>
          }
        />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* 1. Tổng Lãi lỗ đã chốt */}
            <div className="p-4 rounded-xl bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] flex flex-col justify-between">
              <span className="text-xs font-medium text-[var(--text-2,#a1a1aa)]">Tổng lãi lỗ đã chốt</span>
              <div className="my-2">
                <span
                  className={`text-2xl font-bold font-mono ${
                    isPositive(data.totalRealized)
                      ? 'text-[var(--up,#1fc27a)]'
                      : isNegative(data.totalRealized)
                      ? 'text-[var(--down,#f2475f)]'
                      : 'text-[var(--text,#f4f4f5)]'
                  }`}
                >
                  {isPositive(data.totalRealized) ? '+' : ''}
                  {formatDecimal(data.totalRealized, { decimals: 2 })} USDT
                </span>
              </div>
              <div className="text-[11px] text-[var(--text-3,#63636b)] flex justify-between">
                <span>Spot: {formatDecimal(data.spotRealized, { decimals: 2 })}</span>
                <span>Futures: {formatDecimal(data.futuresRealized, { decimals: 2 })}</span>
              </div>
            </div>

            {/* 2. Tỷ lệ thắng */}
            <div className="p-4 rounded-xl bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] flex flex-col justify-between">
              <span className="text-xs font-medium text-[var(--text-2,#a1a1aa)]">Tỷ lệ thắng</span>
              <div className="my-2">
                <span className="text-2xl font-bold font-mono text-[var(--text,#f4f4f5)]">
                  {data.trades.winRate !== null
                    ? `${(parseFloat(data.trades.winRate) * 100).toFixed(1)}%`
                    : '—'}
                </span>
              </div>
              <div className="text-[11px] text-[var(--text-3,#63636b)]">
                {data.trades.wins} thắng / {data.trades.losses} thua ({data.trades.count} lệnh)
              </div>
            </div>

            {/* 3. Profit Factor */}
            <div className="p-4 rounded-xl bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] flex flex-col justify-between">
              <span className="text-xs font-medium text-[var(--text-2,#a1a1aa)]">Hệ số lợi nhuận (PF)</span>
              <div className="my-2">
                <span className="text-2xl font-bold font-mono text-[var(--text,#f4f4f5)]">
                  {data.trades.profitFactor ? parseFloat(data.trades.profitFactor).toFixed(2) : '—'}
                </span>
              </div>
              <div className="text-[11px] text-[var(--text-3,#63636b)]">
                Tổng lãi ÷ |Tổng lỗ|
              </div>
            </div>

            {/* 4. Sụt giảm tối đa */}
            <div className="p-4 rounded-xl bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] flex flex-col justify-between">
              <span className="text-xs font-medium text-[var(--text-2,#a1a1aa)]">Sụt giảm tối đa (MDD)</span>
              <div className="my-2">
                <span className="text-2xl font-bold font-mono text-[var(--down,#f2475f)]">
                  {data.maxDrawdown !== null
                    ? `-${(parseFloat(data.maxDrawdown) * 100).toFixed(1)}%`
                    : '—'}
                </span>
              </div>
              <div className="text-[11px] text-[var(--text-3,#63636b)]">
                Từ đỉnh tài sản Spot
              </div>
            </div>

            {/* 5. Phí & Funding */}
            <div className="p-4 rounded-xl bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] flex flex-col justify-between">
              <span className="text-xs font-medium text-[var(--text-2,#a1a1aa)]">Phí & Funding</span>
              <div className="my-2 font-mono text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-[var(--text-3,#63636b)]">Phí Futures:</span>
                  <span className="text-[var(--down,#f2475f)]">
                    -{formatDecimal(data.futuresFees, { decimals: 2 })} USDT
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-3,#63636b)]">Funding:</span>
                  <span className={isPositive(data.futuresFunding) ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--text,#f4f4f5)]'}>
                    {isPositive(data.futuresFunding) ? '+' : ''}
                    {formatDecimal(data.futuresFunding, { decimals: 2 })} USDT
                  </span>
                </div>
              </div>
              <div className="text-[11px] text-[var(--text-3,#63636b)]">
                Đã tính trong PnL Futures
              </div>
            </div>
          </div>

          {/* Daily PnL Chart & Heatmap Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Daily Bar Chart */}
            <div className="lg:col-span-2 p-5 rounded-xl bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--text,#f4f4f5)] flex items-center gap-2">
                  <BarChart2 size={16} className="text-[var(--accent,#818cf8)]" />
                  Biểu đồ lãi lỗ theo ngày
                </h3>
                <span className="text-xs text-[var(--text-3,#63636b)]">GMT+7</span>
              </div>

              {/* Bar visualization */}
              <div className="h-64 flex items-end gap-1.5 pt-6 pb-2 border-b border-[var(--line,#1d1e21)] overflow-x-auto">
                {data.daily.map((d) => {
                  const val = parseFloat(d.total);
                  const isUp = val >= 0;
                  // Normalize height up to 100px relative
                  const maxAbs = Math.max(
                    ...data.daily.map((item) => Math.abs(parseFloat(item.total))),
                    1
                  );
                  const barHeight = Math.max(4, Math.round((Math.abs(val) / maxAbs) * 160));

                  return (
                    <div
                      key={d.date}
                      className="flex-1 min-w-[14px] flex flex-col items-center justify-end h-full group relative"
                    >
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] p-2 rounded text-[10px] whitespace-nowrap z-30 shadow-xl pointer-events-none">
                        <span className="font-bold text-white">{d.date}</span>
                        <span className={val >= 0 ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}>
                          Lãi/lỗ: {val >= 0 ? '+' : ''}{formatDecimal(d.total, { decimals: 2 })} USDT
                        </span>
                        <span className="text-[var(--text-3,#63636b)]">
                          Cộng dồn: {formatDecimal(d.cumulative, { decimals: 2 })} USDT
                        </span>
                      </div>

                      {/* The Bar */}
                      <div
                        style={{ height: `${barHeight}px` }}
                        className={`w-full rounded-t-sm transition-all ${
                          val > 0
                            ? 'bg-[var(--up,#1fc27a)] opacity-85 hover:opacity-100'
                            : val < 0
                            ? 'bg-[var(--down,#f2475f)] opacity-85 hover:opacity-100'
                            : 'bg-[var(--text-3,#63636b)]/20'
                        }`}
                      />
                      <span className="text-[9px] text-[var(--text-3,#63636b)] font-mono mt-2 truncate w-full text-center">
                        {d.date.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* OKX Style Calendar Heatmap */}
            <div className="p-5 rounded-xl bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--text,#f4f4f5)] flex items-center gap-2">
                  <Calendar size={16} className="text-[var(--accent,#818cf8)]" />
                  Lịch PnL
                </h3>
              </div>

              <div className="grid grid-cols-7 gap-1.5 text-center">
                {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((w) => (
                  <span key={w} className="text-[10px] text-[var(--text-3,#63636b)] font-semibold py-1">
                    {w}
                  </span>
                ))}

                {data.daily.map((d) => {
                  const val = parseFloat(d.total);
                  let bgClass = 'bg-[var(--panel-2,#141416)] text-[var(--text-3,#63636b)]';
                  if (val > 100) bgClass = 'bg-[var(--up,#1fc27a)] text-black font-bold';
                  else if (val > 0) bgClass = 'bg-[var(--up,#1fc27a)]/40 text-white font-medium';
                  else if (val < -100) bgClass = 'bg-[var(--down,#f2475f)] text-white font-bold';
                  else if (val < 0) bgClass = 'bg-[var(--down,#f2475f)]/40 text-white font-medium';

                  return (
                    <div
                      key={d.date}
                      className={`h-9 rounded flex flex-col items-center justify-center p-1 cursor-pointer transition-transform hover:scale-105 relative group ${bgClass}`}
                    >
                      <span className="text-[10px] leading-none">{d.date.slice(8)}</span>
                      {val !== 0 && (
                        <span className="text-[8px] font-mono leading-tight mt-0.5 truncate max-w-full">
                          {val > 0 ? '+' : ''}{Math.round(val)}
                        </span>
                      )}

                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-1.5 hidden group-hover:flex flex-col bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] p-2 rounded text-[10px] whitespace-nowrap z-30 shadow-2xl pointer-events-none">
                        <span className="font-bold text-white">{d.date}</span>
                        <span className={val >= 0 ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}>
                          {val >= 0 ? '+' : ''}{formatDecimal(d.total, { decimals: 2 })} USDT
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[10px] text-[var(--text-3,#63636b)] pt-2 border-t border-[var(--line,#1d1e21)]">
                <span>Lỗ nhiều</span>
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded bg-[var(--down,#f2475f)]" />
                  <div className="w-2.5 h-2.5 rounded bg-[var(--down,#f2475f)]/40" />
                  <div className="w-2.5 h-2.5 rounded bg-[var(--panel-2,#141416)]" />
                  <div className="w-2.5 h-2.5 rounded bg-[var(--up,#1fc27a)]/40" />
                  <div className="w-2.5 h-2.5 rounded bg-[var(--up,#1fc27a)]" />
                </div>
                <span>Lãi nhiều</span>
              </div>
            </div>
          </div>

          {/* Table By Symbol */}
          <div className="rounded-xl border border-[var(--line,#1d1e21)] overflow-hidden bg-[var(--panel,#0a0a0b)]">
            <div className="px-5 py-4 border-b border-[var(--line,#1d1e21)] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text,#f4f4f5)]">
                Hiệu suất theo cặp ({sortedBySymbol.length} cặp)
              </h3>
            </div>

            <Table>
              <TableHeader className="bg-[var(--panel-2,#141416)]/40 border-b border-[var(--line,#1d1e21)]">
                <TableRow>
                  <TableHead className="text-xs">Thị trường</TableHead>
                  <TableHead className="text-xs cursor-pointer select-none" onClick={() => toggleSort('symbol')}>
                    Cặp {sortBy === 'symbol' && (sortAsc ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="text-right text-xs cursor-pointer select-none" onClick={() => toggleSort('realized')}>
                    Lãi/Lỗ đã chốt {sortBy === 'realized' && (sortAsc ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="text-right text-xs cursor-pointer select-none" onClick={() => toggleSort('trades')}>
                    Số lệnh {sortBy === 'trades' && (sortAsc ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="text-right text-xs cursor-pointer select-none" onClick={() => toggleSort('wins')}>
                    Lệnh thắng {sortBy === 'wins' && (sortAsc ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="text-right text-xs">Tỷ lệ thắng</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedBySymbol.map((item, idx) => {
                  const pnlNum = parseFloat(item.realized);
                  const winRate = item.trades > 0 ? (item.wins / item.trades) * 100 : 0;

                  return (
                    <TableRow key={`${item.market}-${item.symbol}-${idx}`} className="border-b border-[var(--line,#1d1e21)]/60">
                      <TableCell>
                        <Badge variant={item.market === 'SPOT' ? 'secondary' : 'info'} size="sm">
                          {item.market}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-bold text-xs text-[var(--text,#f4f4f5)]">
                        {item.symbol}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-xs font-semibold ${
                          pnlNum > 0
                            ? 'text-[var(--up,#1fc27a)]'
                            : pnlNum < 0
                            ? 'text-[var(--down,#f2475f)]'
                            : 'text-[var(--text-3,#63636b)]'
                        }`}
                      >
                        {pnlNum > 0 ? '+' : ''}{formatDecimal(item.realized, { decimals: 2 })} USDT
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-[var(--text-2,#a1a1aa)]">
                        {item.trades}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-[var(--text-2,#a1a1aa)]">
                        {item.wins}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-[var(--text,#f4f4f5)]">
                        {winRate.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
};
