import React, { useState, useEffect, useMemo } from 'react';
import type { Portfolio, PortfolioHistory, PortfolioRange } from '@cex/contracts';
import { getApiClient } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  Card,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
  Badge,
  Skeleton,
  EmptyState,
  formatDecimal,
} from '@cex/ui';
import { PieChart, TrendingUp, TrendingDown, DollarSign, AlertCircle, RefreshCw } from 'lucide-react';

export interface PortfolioPageProps {
  onNavigate: (path: string) => void;
}

export const PortfolioPage: React.FC<PortfolioPageProps> = ({ onNavigate }) => {
  const { isAuthenticated } = useAuth();
  const api = getApiClient();

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [history, setHistory] = useState<PortfolioHistory | null>(null);
  const [range, setRange] = useState<PortfolioRange>('7d');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPortfolioData = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.portfolio();
      setPortfolio(data);
    } catch {
      setError('Không thể tải dữ liệu danh mục đầu tư.');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistoryData = async (r: PortfolioRange) => {
    if (!isAuthenticated) return;
    setHistoryLoading(true);
    try {
      const h = await api.portfolioHistory({ query: { range: r } });
      setHistory(h);
    } catch {
      // Ignore
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchPortfolioData();
      fetchHistoryData(range);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchHistoryData(range);
    }
  }, [range]);

  // Color generator for allocation slices
  const COLORS = ['#818CF8', '#1FC27A', '#F59E0B', '#67E8F9', '#EC4899', '#A855F7', '#3B82F6', '#10B981'];

  // SVG Chart path calculation with DISCONTINUOUS null points
  const chartPathData = useMemo(() => {
    if (!history || !history.points || history.points.length === 0) return null;

    const points = history.points;
    const validValues = points
      .map((p) => (p.totalValueUsdt !== null ? parseFloat(p.totalValueUsdt) : null))
      .filter((v): v is number => v !== null);

    if (validValues.length === 0) return null;

    const minVal = Math.min(...validValues) * 0.98;
    const maxVal = Math.max(...validValues) * 1.02 || 1;
    const rangeVal = maxVal - minVal || 1;

    const width = 600;
    const height = 180;
    const stepX = width / Math.max(1, points.length - 1);

    // Segment lines into continuous pieces
    const segments: Array<Array<{ x: number; y: number }>> = [];
    let currentSegment: Array<{ x: number; y: number }> = [];

    points.forEach((p, idx) => {
      if (p.totalValueUsdt !== null) {
        const val = parseFloat(p.totalValueUsdt);
        const x = idx * stepX;
        const y = height - ((val - minVal) / rangeVal) * (height - 20) - 10;
        currentSegment.push({ x, y });
      } else {
        if (currentSegment.length > 0) {
          segments.push(currentSegment);
          currentSegment = [];
        }
      }
    });

    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    return { segments, minVal, maxVal, width, height };
  }, [history]);

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <EmptyState
          title="Yêu cầu đăng nhập"
          description="Vui lòng đăng nhập để theo dõi danh mục đầu tư và thống kê tài sản."
          action={
            <Button variant="primary" onClick={() => onNavigate('/login')}>
              Đăng nhập ngay
            </Button>
          }
        />
      </div>
    );
  }

  const unpnl = portfolio?.totalUnrealizedPnl;
  const isUnpnlPos = unpnl && parseFloat(unpnl) > 0;
  const isUnpnlNeg = unpnl && parseFloat(unpnl) < 0;

  const repnl = portfolio?.totalRealizedPnl;
  const isRepnlPos = repnl && parseFloat(repnl) > 0;
  const isRepnlNeg = repnl && parseFloat(repnl) < 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20 md:pb-6 space-y-6">
      {/* Title & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">
            Danh mục đầu tư
          </h1>
          <p className="text-xs text-[var(--text-3,#63636b)] mt-1">
            Theo dõi giá vốn, lãi/lỗ đã chốt, chưa chốt và tỷ lệ phân bổ tài sản thời gian thực
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            fetchPortfolioData();
            fetchHistoryData(range);
          }}
          loading={loading}
          className="self-start sm:self-auto flex items-center gap-1.5"
        >
          <RefreshCw size={14} />
          <span>Làm mới</span>
        </Button>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Value */}
        <Card variant="surface" className="p-4 bg-[var(--panel,#0a0a0b)] border-[var(--line,#1d1e21)]">
          <div className="text-xs text-[var(--text-3,#63636b)] flex items-center justify-between">
            <span>Tổng giá trị tài sản</span>
            <DollarSign size={16} className="text-[var(--accent,#818cf8)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--text,#f4f4f5)] mt-2">
            {loading ? <Skeleton height={28} width={120} /> : `${formatDecimal(portfolio?.totalValueUsdt || '0.00', { decimals: 2 })} USDT`}
          </div>
          <div className="text-[10px] text-[var(--text-3,#63636b)] mt-1">
            Tính theo giá thị trường thời gian thực
          </div>
        </Card>

        {/* Unrealized PnL */}
        <Card variant="surface" className="p-4 bg-[var(--panel,#0a0a0b)] border-[var(--line,#1d1e21)]">
          <div className="text-xs text-[var(--text-3,#63636b)] flex items-center justify-between">
            <span>Lãi / Lỗ chưa chốt (Unrealized)</span>
            {isUnpnlPos ? <TrendingUp size={16} className="text-[var(--up,#1fc27a)]" /> : <TrendingDown size={16} className="text-[var(--down,#f2475f)]" />}
          </div>
          <div className={`text-2xl font-bold font-mono mt-2 ${isUnpnlPos ? 'text-[var(--up,#1fc27a)]' : isUnpnlNeg ? 'text-[var(--down,#f2475f)]' : 'text-white'}`}>
            {loading ? (
              <Skeleton height={28} width={120} />
            ) : unpnl === null ? (
              <span className="text-[var(--text-3,#63636b)] font-normal">—</span>
            ) : (
              `${isUnpnlPos ? '+' : ''}${formatDecimal(unpnl, { decimals: 2 })} USDT`
            )}
          </div>
          <div className="text-[10px] text-[var(--text-3,#63636b)] mt-1">
            Dựa trên các vị thế coin đang nắm giữ
          </div>
        </Card>

        {/* Realized PnL */}
        <Card variant="surface" className="p-4 bg-[var(--panel,#0a0a0b)] border-[var(--line,#1d1e21)]">
          <div className="text-xs text-[var(--text-3,#63636b)] flex items-center justify-between">
            <span>Lãi / Lỗ đã chốt (Realized)</span>
            <PieChart size={16} className="text-[var(--accent,#818cf8)]" />
          </div>
          <div className={`text-2xl font-bold font-mono mt-2 ${isRepnlPos ? 'text-[var(--up,#1fc27a)]' : isRepnlNeg ? 'text-[var(--down,#f2475f)]' : 'text-white'}`}>
            {loading ? (
              <Skeleton height={28} width={120} />
            ) : (
              `${isRepnlPos ? '+' : ''}${formatDecimal(portfolio?.totalRealizedPnl || '0.00', { decimals: 2 })} USDT`
            )}
          </div>
          <div className="text-[10px] text-[var(--text-3,#63636b)] mt-1">
            Tổng lợi nhuận từ các lệnh bán đã khớp
          </div>
        </Card>

        {/* Fees Paid */}
        <Card variant="surface" className="p-4 bg-[var(--panel,#0a0a0b)] border-[var(--line,#1d1e21)]">
          <div className="text-xs text-[var(--text-3,#63636b)] flex items-center justify-between">
            <span>Tổng phí đã trả</span>
            <span className="text-[10px] text-[var(--text-3,#63636b)] font-mono">USDT</span>
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--text-2,#a1a1aa)] mt-2">
            {loading ? <Skeleton height={28} width={100} /> : `${formatDecimal(portfolio?.totalFeesUsdt || '0.00', { decimals: 2 })}`}
          </div>
          <div className="text-[10px] text-[var(--text-3,#63636b)] mt-1">
            Quy đổi theo tỷ giá lúc khớp lệnh
          </div>
        </Card>
      </div>

      {/* Chart & Allocation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Asset History Chart */}
        <div className="lg:col-span-2 bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,12px)] p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-[var(--text,#f4f4f5)]">Biến động giá trị tài sản</h3>
              <p className="text-[11px] text-[var(--text-3,#63636b)]">Ghi nhận theo snapshot định kỳ máy chủ (Khoảng trống: lúc đó chưa có giá)</p>
            </div>

            <div className="flex items-center gap-1 bg-[var(--panel-2,#141416)] p-1 rounded border border-[var(--line,#1d1e21)]">
              {(['24h', '7d', '30d', '90d', 'all'] as PortfolioRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                    range === r ? 'bg-[var(--accent,#818cf8)] text-black' : 'text-[var(--text-3,#63636b)] hover:text-white'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* SVG Area Chart */}
          <div className="w-full h-48 flex items-center justify-center relative">
            {historyLoading ? (
              <Skeleton height={180} className="w-full" />
            ) : !chartPathData ? (
              <div className="text-center text-xs text-[var(--text-3,#63636b)] py-12">
                Chưa có dữ liệu (số liệu bắt đầu được ghi từ khi tài khoản hoạt động)
              </div>
            ) : (
              <svg
                viewBox={`0 0 ${chartPathData.width} ${chartPathData.height}`}
                className="w-full h-full overflow-visible"
              >
                {/* Horizontal reference grid lines */}
                <line x1="0" y1="20" x2={chartPathData.width} y2="20" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                <line x1="0" y1={chartPathData.height / 2} x2={chartPathData.width} y2={chartPathData.height / 2} stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                <line x1="0" y1={chartPathData.height - 20} x2={chartPathData.width} y2={chartPathData.height - 20} stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />

                {/* Discontinuous line segments */}
                {chartPathData.segments.map((seg, sIdx) => {
                  const dPath = seg.map((pt, pIdx) => `${pIdx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
                  return (
                    <g key={sIdx}>
                      <path
                        d={dPath}
                        fill="none"
                        stroke="var(--accent, #818cf8)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Dots on points */}
                      {seg.map((pt, pIdx) => (
                        <circle
                          key={pIdx}
                          cx={pt.x}
                          cy={pt.y}
                          r="3"
                          fill="var(--accent, #818cf8)"
                          stroke="#0a0a0b"
                          strokeWidth="1.5"
                        />
                      ))}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>

        {/* Right 1 Col: Asset Allocation Breakdown */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,12px)] p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--text,#f4f4f5)] mb-1">Phân bổ tài sản</h3>
            <p className="text-[11px] text-[var(--text-3,#63636b)] mb-4">Tỷ lệ theo tổng giá trị các vị thế có giá</p>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} height={32} className="w-full" />
                ))}
              </div>
            ) : !portfolio || portfolio.positions.length === 0 ? (
              <div className="text-center text-xs text-[var(--text-3,#63636b)] py-8">
                Chưa có tài sản trong danh mục
              </div>
            ) : (
              <div className="space-y-3">
                {portfolio.positions
                  .filter((p) => p.allocationPercent !== null)
                  .sort((a, b) => parseFloat(b.allocationPercent || '0') - parseFloat(a.allocationPercent || '0'))
                  .map((pos, idx) => {
                    const color = COLORS[idx % COLORS.length];
                    const pct = parseFloat(pos.allocationPercent || '0');
                    return (
                      <div key={pos.asset} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                            <span className="font-bold text-white">{pos.asset}</span>
                          </div>
                          <span className="font-mono font-semibold text-white">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-[var(--panel-2,#141416)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {portfolio?.unpricedAssets && portfolio.unpricedAssets.length > 0 && (
            <div className="mt-4 p-2.5 rounded bg-[var(--line,#1d1e21)]/40 border border-[var(--line,#1d1e21)] text-[10px] text-[var(--text-3,#63636b)] flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0 text-[var(--warn,#f5b544)]" />
              <span>Chưa có giá định danh: {portfolio.unpricedAssets.join(', ')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Positions Detail Table */}
      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,12px)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--line,#1d1e21)] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--text,#f4f4f5)]">Chi tiết các vị thế nắm giữ</h3>
          <span className="text-xs text-[var(--text-3,#63636b)]">
            Cập nhật lúc: {portfolio?.asOf ? new Date(portfolio.asOf).toLocaleTimeString('vi-VN') : '—'}
          </span>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height={42} className="w-full" />
            ))}
          </div>
        ) : !portfolio || portfolio.positions.length === 0 ? (
          <EmptyState
            title="Danh mục trống"
            description="Bạn hiện chưa sở hữu đồng coin nào. Hãy bắt đầu giao dịch tại thị trường Spot."
            action={
              <Button variant="primary" onClick={() => onNavigate('/markets')}>
                Khám phá thị trường
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader className="bg-transparent border-b border-[var(--line,#1d1e21)]">
              <TableRow className="hover:bg-transparent">
                <TableHead>Tài sản</TableHead>
                <TableHead className="text-right">Khối lượng</TableHead>
                <TableHead className="text-right">Giá vốn TB (USDT)</TableHead>
                <TableHead className="text-right">Giá hiện tại</TableHead>
                <TableHead className="text-right">Tổng giá trị</TableHead>
                <TableHead className="text-right">Lãi/Lỗ chưa chốt</TableHead>
                <TableHead className="text-right">Lãi/Lỗ đã chốt</TableHead>
                <TableHead className="text-right">Tỷ lệ</TableHead>
                <TableHead className="text-center">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portfolio.positions.map((pos) => {
                const unpnlVal = pos.unrealizedPnl;
                const unpnlPct = pos.unrealizedPnlPercent;
                const isPos = unpnlVal && parseFloat(unpnlVal) > 0;
                const isNeg = unpnlVal && parseFloat(unpnlVal) < 0;

                return (
                  <TableRow key={pos.asset} className="border-b border-[var(--line,#1d1e21)]">
                    <TableCell className="font-bold text-white py-3.5">
                      <div className="flex items-center gap-2">
                        <span>{pos.asset}</span>
                        {pos.marketPrice === null && pos.asset !== 'USDT' && (
                          <Badge variant="outline" size="sm" className="text-[10px] text-[var(--warn,#f5b544)] border-[var(--warn,#f5b544)]/40">
                            Không có giá
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-right font-mono font-medium text-white">
                      {formatDecimal(pos.quantity)}
                    </TableCell>

                    <TableCell className="text-right font-mono text-[var(--text-2,#a1a1aa)]">
                      {pos.avgCost ? formatDecimal(pos.avgCost) : '—'}
                    </TableCell>

                    <TableCell className="text-right font-mono text-[var(--text-2,#a1a1aa)]">
                      {pos.marketPrice ? formatDecimal(pos.marketPrice) : '—'}
                    </TableCell>

                    <TableCell className="text-right font-mono font-semibold text-white">
                      {pos.marketValue ? `${formatDecimal(pos.marketValue, { decimals: 2 })} USDT` : '—'}
                    </TableCell>

                    <TableCell className="text-right font-mono font-medium">
                      {unpnlVal === null ? (
                        <span className="text-[var(--text-3,#63636b)]">—</span>
                      ) : (
                        <div className={isPos ? 'text-[var(--up,#1fc27a)]' : isNeg ? 'text-[var(--down,#f2475f)]' : 'text-white'}>
                          <div>{isPos ? `+${formatDecimal(unpnlVal, { decimals: 2 })}` : formatDecimal(unpnlVal, { decimals: 2 })}</div>
                          {unpnlPct && <div className="text-[10px]">{isPos ? `+${formatDecimal(unpnlPct, { decimals: 2 })}%` : `${formatDecimal(unpnlPct, { decimals: 2 })}%`}</div>}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-right font-mono text-xs">
                      {pos.realizedPnl ? `${formatDecimal(pos.realizedPnl, { decimals: 2 })} USDT` : '0.00 USDT'}
                    </TableCell>

                    <TableCell className="text-right font-mono font-bold text-[var(--accent,#818cf8)]">
                      {pos.allocationPercent ? `${parseFloat(pos.allocationPercent).toFixed(1)}%` : '—'}
                    </TableCell>

                    <TableCell className="text-center">
                      {pos.asset !== 'USDT' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onNavigate(`/trade/${pos.asset}USDT`)}
                          className="text-[var(--accent,#818cf8)] hover:underline text-xs"
                        >
                          Giao dịch
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};
