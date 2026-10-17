import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  type TaxCategory,
  type TaxSummary,
  type TaxWithholding,
  type TaxProfile,
  exportUrl,
} from '@cex/contracts';
import { getApiClient } from '../services/api.ts';
import { formatApiError } from '../services/errors.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { Button, formatDecimal, Table, TableHead, TableRow, TableCell, TableBody, useToast } from '@cex/ui';
import { Download, RefreshCw, AlertTriangle, Info, Calendar, FileText, ShieldAlert, Filter } from 'lucide-react';

export interface AccountTaxPageProps {
  onNavigate?: (path: string) => void;
}

export const AccountTaxPage: React.FC<AccountTaxPageProps> = ({ onNavigate }) => {
  const { isAuthenticated } = useAuth();
  const { success, error: toastError } = useToast();
  const api = getApiClient();

  // Current Vietnam Year (UTC+7)
  const currentVietnamYear = useMemo(() => {
    return new Date(Date.now() + 7 * 3600_000).getUTCFullYear();
  }, []);

  const [selectedYear, setSelectedYear] = useState<number>(currentVietnamYear);
  const [profile, setProfile] = useState<TaxProfile | null>(null);
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [withholdings, setWithholdings] = useState<TaxWithholding[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingCategory, setUpdatingCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter & Pagination (M-05)
  const [filterSymbol, setFilterSymbol] = useState<string>('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Year range in Vietnam time (UTC+7) converted to UTC ISO (M-05)
  const yearRange = useMemo(() => {
    const from = `${selectedYear - 1}-12-31T17:00:00.000Z`;
    const to = `${selectedYear}-12-31T16:59:59.999Z`;
    return { from, to };
  }, [selectedYear]);

  // Fetch Withholdings list (M-05)
  const fetchWithholdings = useCallback(async (cursor?: string) => {
    try {
      const q: { limit: number; from: string; to: string; symbol?: string; cursor?: string } = {
        limit: 50,
        from: yearRange.from,
        to: yearRange.to,
      };
      if (filterSymbol.trim()) q.symbol = filterSymbol.trim();
      if (cursor) q.cursor = cursor;
      const res = await api.taxWithholdings({ query: q });
      if (cursor) {
        setWithholdings((prev) => [...prev, ...(res.items || [])]);
      } else {
        setWithholdings(res.items || []);
      }
      setNextCursor(res.nextCursor || null);
    } catch {
      if (!cursor) setWithholdings([]);
    }
  }, [api, filterSymbol, yearRange]);

  // Fetch all user tax data
  const loadTaxData = useCallback(async (year: number) => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const [profRes, sumRes] = await Promise.all([
        api.taxProfile(),
        api.taxSummary({ query: { year } }),
      ]);
      setProfile(profRes);
      setSummary(sumRes);
      await fetchWithholdings();
    } catch (err: unknown) {
      setError(formatApiError(err, 'Không thể tải dữ liệu thuế. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  }, [api, isAuthenticated, fetchWithholdings]);

  useEffect(() => {
    loadTaxData(selectedYear);
  }, [loadTaxData, selectedYear]);

  const loadMoreWithholdings = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await fetchWithholdings(nextCursor);
    setLoadingMore(false);
  };

  // Handle taxpayer category update
  const handleCategoryChange = async (newCategory: TaxCategory) => {
    setUpdatingCategory(true);
    try {
      const updated = await api.taxUpdateProfile({ body: { category: newCategory } });
      setProfile(updated);
      window.dispatchEvent(new CustomEvent('cex:tax-profile-updated'));
      success('Đã cập nhật phân loại người nộp thuế thành công.');
      await loadTaxData(selectedYear);
    } catch (err: unknown) {
      toastError(formatApiError(err, 'Không thể cập nhật phân loại.'));
    } finally {
      setUpdatingCategory(false);
    }
  };

  const csvDownloadUrl = useMemo(() => {
    return exportUrl('taxExport', {
      from: yearRange.from,
      to: yearRange.to,
      symbol: filterSymbol.trim() || undefined,
    });
  }, [yearRange, filterSymbol]);

  if (!isAuthenticated) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center" data-testid="account-tax-page">
        <div className="max-w-md mx-auto p-8 rounded-xl bg-[var(--color-bg-surface,#181a20)] border border-[var(--color-border,#242731)]">
          <ShieldAlert className="w-12 h-12 mx-auto text-amber-400 mb-4" />
          <h2 className="text-lg font-bold text-[var(--color-text,#e5e7eb)] mb-2">Yêu cầu đăng nhập</h2>
          <p className="text-xs text-[var(--color-text-muted,#6b7280)] mb-6">
            Vui lòng đăng nhập để xem thông tin khấu trừ thuế và báo cáo thuế của bạn.
          </p>
          <Button variant="primary" fullWidth onClick={() => onNavigate?.('/login')}>
            Đăng nhập ngay
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col gap-6" data-testid="account-tax-page">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--color-border,#242731)]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text,#e5e7eb)]">
              Thuế giao dịch (Việt Nam)
            </h1>
            <span
              data-testid="tax-test-label"
              className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-amber-500/20 text-amber-400 border border-amber-500/30"
            >
              Thử nghiệm
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-muted,#6b7280)] mt-1">
            Theo dõi các khoản thuế đã được sàn khấu trừ tại nguồn và thông tin phục vụ kê khai thuế.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadTaxData(selectedYear)}
            loading={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Làm mới
          </Button>

          <a
            href={csvDownloadUrl}
            download={`tax-withholdings-${selectedYear}.csv`}
            data-testid="tax-export-csv"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--color-accent,#6366f1)] hover:bg-[var(--color-accent-hover,#4f46e5)] text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Xuất bảng kê CSV
          </a>
        </div>
      </div>

      {/* Experimental Sandbox Notice */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 space-y-1.5">
        <div className="flex items-center gap-2 font-semibold text-amber-300">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Sàn thử nghiệm (Sandbox) — Bất biến nghiệp vụ Module T</span>
        </div>
        <p className="text-amber-200/80 leading-relaxed text-[11px]">
          Mọi số liệu khấu trừ thuế tại đây chỉ mang tính chất <strong>thử nghiệm và mô phỏng</strong>. Hệ thống không sử dụng tên/số hiệu của biểu mẫu cơ quan thuế và tuyệt đối không thu thập CCCD/MST. Cá nhân không phải quyết toán năm đối với khoản thuế 0,1% này.
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => loadTaxData(selectedYear)}>
            Thử lại
          </Button>
        </div>
      )}

      {/* Taxpayer Category Selector Card */}
      <div className="p-5 rounded-xl bg-[var(--color-bg-secondary,#16181d)] border border-[var(--color-border,#242731)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--color-text,#e5e7eb)]">
                Phân loại người nộp thuế
              </h2>
              {profile?.updatedAt && (
                <span className="text-[10px] text-[var(--color-text-muted,#6b7280)] font-mono">
                  (Cập nhật: {new Date(profile.updatedAt).toLocaleDateString('vi-VN')})
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--color-text-muted,#6b7280)]">
              Chính sách thuế áp dụng phụ thuộc vào tư cách người dùng. Sàn chỉ trích thuế đối với Cá nhân và Tổ chức nước ngoài.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              data-testid="tax-category-select"
              value={profile?.category || 'INDIVIDUAL'}
              disabled={updatingCategory || loading}
              onChange={(e) => handleCategoryChange(e.target.value as TaxCategory)}
              className="bg-[var(--color-bg-surface,#181a20)] border border-[var(--color-border,#242731)] rounded-lg px-3 py-2 text-xs text-[var(--color-text,#e5e7eb)] outline-none focus:border-[var(--color-accent,#6366f1)] min-w-[260px]"
            >
              <option value="INDIVIDUAL">
                Cá nhân cư trú (Trích 0,1% giá trị bán)
              </option>
              <option value="FOREIGN_ORG">
                Tổ chức nước ngoài (Trích 0,1% giá trị bán)
              </option>
              <option value="DOMESTIC_ORG">
                Tổ chức Việt Nam (Miễn trích — Tự kê khai 20%)
              </option>
            </select>
          </div>
        </div>

        {profile?.category === 'DOMESTIC_ORG' && (
          <div className="mt-4 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
            ℹ️ <strong>Lưu ý Tổ chức Việt Nam:</strong> Các lệnh BÁN của bạn sẽ không bị khấu trừ thuế tại nguồn. Doanh nghiệp tự kê khai và nộp thuế TNDN (20% trên lợi nhuận). Bảng thống kê bên dưới cung cấp thông tin doanh số và lợi nhuận để hỗ trợ quyết toán.
          </div>
        )}
      </div>

      {/* Year Totals Cards (M-06, M-07) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Tax Year Card */}
        <div className="p-5 rounded-xl bg-[var(--color-bg-secondary,#16181d)] border border-[var(--color-border,#242731)] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-[var(--color-text-muted,#6b7280)]">
              Tổng quan thuế năm
            </span>

            {/* Year Selector */}
            <select
              data-testid="tax-year-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-[var(--color-bg-surface,#181a20)] border border-[var(--color-border,#242731)] rounded px-2.5 py-1 text-xs text-[var(--color-text,#e5e7eb)] font-mono outline-none focus:border-[var(--color-accent,#6366f1)]"
            >
              {[currentVietnamYear, currentVietnamYear - 1, currentVietnamYear - 2].map((y) => (
                <option key={y} value={y}>
                  Năm {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-[11px] text-[var(--color-text-muted,#6b7280)] mb-1">
              Tổng thuế đã khấu trừ (năm {selectedYear})
            </div>
            <div className="flex items-baseline gap-2">
              <span
                data-testid="tax-year-total"
                data-value={summary?.totals?.taxAmount ?? ''}
                className="text-2xl font-bold font-mono text-amber-400"
              >
                {summary?.totals?.taxAmount ? formatDecimal(summary.totals.taxAmount, { decimals: 8 }) : '—'}
              </span>
              <span className="text-xs text-[var(--color-text-muted,#6b7280)] font-medium">USDT</span>
            </div>

            {/* Total VND & Missing rate note (M-07) */}
            <div className="mt-2 text-xs text-[var(--color-text-muted,#6b7280)]" data-testid="tax-year-total-vnd">
              <span>Quy đổi VND: </span>
              {summary?.totals?.taxVnd ? (
                <span className="font-mono font-semibold text-[var(--color-text,#e5e7eb)]">
                  {formatDecimal(summary.totals.taxVnd, { decimals: 0 })} ₫
                </span>
              ) : (
                <span>
                  —{' '}
                  {(summary?.totals?.vndMissingCount ?? 0) > 0 && (
                    <span className="text-amber-400" data-testid="tax-vnd-missing">
                      ({summary?.totals?.vndMissingCount} bản ghi chưa có tỷ giá)
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--color-border,#242731)] text-[11px] text-[var(--color-text-muted,#6b7280)] flex justify-between">
            <span>Số lần khấu trừ:</span>
            <span className="font-mono text-[var(--color-text,#e5e7eb)]">
              {summary?.totals ? summary.totals.withholdingCount : '—'}
            </span>
          </div>
        </div>

        {/* Total Gross Sold */}
        <div className="p-5 rounded-xl bg-[var(--color-bg-secondary,#16181d)] border border-[var(--color-border,#242731)] flex flex-col justify-between">
          <div className="text-xs font-medium text-[var(--color-text-muted,#6b7280)] mb-3">
            Tổng giá trị bán chịu thuế
          </div>
          <div>
            <div className="text-[11px] text-[var(--color-text-muted,#6b7280)] mb-1">
              Doanh số gộp (Gross Sales)
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-[var(--color-text,#e5e7eb)]">
                {summary?.totals?.withheldGrossQuote ? formatDecimal(summary.totals.withheldGrossQuote, { decimals: 2 }) : '—'}
              </span>
              <span className="text-xs text-[var(--color-text-muted,#6b7280)] font-medium">USDT</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--color-border,#242731)] text-[11px] text-[var(--color-text-muted,#6b7280)] flex justify-between">
            <span>Tổng bán (kể cả miễn thuế):</span>
            <span className="font-mono text-[var(--color-text,#e5e7eb)]">
              {summary?.totals?.sellGrossQuote ? `${formatDecimal(summary.totals.sellGrossQuote, { decimals: 2 })} USDT` : '—'}
            </span>
          </div>
        </div>

        {/* Domestic Org Self-declaration Stats */}
        <div className="p-5 rounded-xl bg-[var(--color-bg-secondary,#16181d)] border border-[var(--color-border,#242731)] flex flex-col justify-between">
          <div className="text-xs font-medium text-[var(--color-text-muted,#6b7280)] mb-3">
            Thống kê tự kê khai (Tổ chức)
          </div>
          <div>
            <div className="text-[11px] text-[var(--color-text-muted,#6b7280)] mb-1">
              Lợi nhuận đã chốt (Realized PnL)
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold font-mono ${summary?.totals?.realizedPnl && !summary.totals.realizedPnl.startsWith('-') && summary.totals.realizedPnl !== '0' ? 'text-[var(--color-buy,#34d399)]' : summary?.totals?.realizedPnl?.startsWith('-') ? 'text-[var(--color-sell,#f87171)]' : 'text-[var(--color-text,#e5e7eb)]'}`}>
                {summary?.totals?.realizedPnl ? formatDecimal(summary.totals.realizedPnl, { decimals: 2 }) : '—'}
              </span>
              <span className="text-xs text-[var(--color-text-muted,#6b7280)] font-medium">USDT</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--color-border,#242731)] text-[11px] text-[var(--color-text-muted,#6b7280)] flex justify-between">
            <span>Tổng phí bán:</span>
            <span className="font-mono text-[var(--color-text,#e5e7eb)]">
              {summary?.totals?.sellFees ? `${formatDecimal(summary.totals.sellFees, { decimals: 4 })} USDT` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* 12-Month Breakdown Table (M-06) */}
      <div className="rounded-xl bg-[var(--color-bg-secondary,#16181d)] border border-[var(--color-border,#242731)] overflow-hidden">
        <div className="p-4 border-b border-[var(--color-border,#242731)] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text,#e5e7eb)]">
              Bảng chi tiết 12 tháng (Năm {selectedYear})
            </h2>
            <p className="text-[11px] text-[var(--color-text-muted,#6b7280)] mt-0.5">
              Phân bổ số liệu thuế và doanh số từng tháng theo giờ Việt Nam (UTC+7).
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow className="border-b border-[var(--color-border,#242731)] bg-[var(--color-bg-base,#0e1015)]">
                <TableCell className="text-xs font-medium text-[var(--color-text-muted,#6b7280)]">Kỳ tháng</TableCell>
                <TableCell className="text-xs font-medium text-right text-[var(--color-text-muted,#6b7280)]">Lệnh trích thuế</TableCell>
                <TableCell className="text-xs font-medium text-right text-[var(--color-text-muted,#6b7280)]">Doanh số gộp (USDT)</TableCell>
                <TableCell className="text-xs font-medium text-right text-[var(--color-text-muted,#6b7280)]">Thuế đã trích (USDT)</TableCell>
                <TableCell className="text-xs font-medium text-right text-[var(--color-text-muted,#6b7280)]">Quy đổi VND</TableCell>
                <TableCell className="text-xs font-medium text-right text-[var(--color-text-muted,#6b7280)]">Lợi nhuận đã chốt</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {summary?.months && summary.months.length > 0 ? (
                summary.months.map((m) => (
                  <TableRow
                    key={m.month}
                    data-testid="tax-month-row"
                    data-month={m.month}
                    className="border-b border-[var(--color-border,#242731)]/50 hover:bg-[var(--color-bg-base,#0e1015)] transition-colors text-xs"
                  >
                    <TableCell className="font-mono font-medium text-[var(--color-text,#e5e7eb)]">
                      {m.month}
                    </TableCell>
                    <TableCell className="font-mono text-right text-[var(--color-text-muted,#6b7280)]">
                      {m.withholdingCount}
                    </TableCell>
                    <TableCell className="font-mono text-right text-[var(--color-text,#e5e7eb)]">
                      {formatDecimal(m.withheldGrossQuote, { decimals: 2 })}
                    </TableCell>
                    <TableCell className="font-mono text-right font-medium text-amber-400">
                      {formatDecimal(m.taxAmount, { decimals: 8 })}
                    </TableCell>
                    <TableCell className="font-mono text-right text-[var(--color-text-muted,#6b7280)]">
                      {m.taxVnd ? `${formatDecimal(m.taxVnd, { decimals: 0 })} ₫` : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-right text-[var(--color-text-muted,#6b7280)]">
                      {formatDecimal(m.realizedPnl, { decimals: 2 })}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-[var(--color-text-muted,#6b7280)] font-sans">
                    {loading ? 'Đang tải dữ liệu 12 tháng...' : 'Chưa có dữ liệu kỳ'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Withholdings List (M-05) */}
      <div className="rounded-xl bg-[var(--color-bg-secondary,#16181d)] border border-[var(--color-border,#242731)] overflow-hidden">
        <div className="p-4 border-b border-[var(--color-border,#242731)] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text,#e5e7eb)] flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              Danh sách các khoản khấu trừ thuế
            </h2>
            <p className="text-[11px] text-[var(--color-text-muted,#6b7280)] mt-0.5">
              Chi tiết từng lần khấu trừ theo từng lệnh khớp (Fill) bán Spot trong năm {selectedYear}.
            </p>
          </div>

          {/* Symbol Filter (M-05) */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              data-testid="tax-symbol-filter"
              value={filterSymbol}
              onChange={(e) => setFilterSymbol(e.target.value)}
              placeholder="Lọc cặp (vd BTCUSDT)..."
              className="bg-[var(--color-bg-surface,#181a20)] border border-[var(--color-border,#242731)] rounded px-2.5 py-1 text-xs text-[var(--color-text,#e5e7eb)] font-mono outline-none focus:border-[var(--color-accent,#6366f1)] w-40"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fetchWithholdings()}
              loading={loading}
              className="flex items-center gap-1"
            >
              <Filter className="w-3 h-3" />
              Lọc
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs text-[var(--color-text-muted,#6b7280)] flex flex-col items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
            <span>Đang tải danh sách khấu trừ...</span>
          </div>
        ) : withholdings.length === 0 ? (
          <div className="py-16 text-center text-xs text-[var(--color-text-muted,#6b7280)] flex flex-col items-center gap-2">
            <Info className="w-6 h-6 text-neutral-500" />
            <span>Chưa có khoản thuế nào bị khấu trừ.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow className="border-b border-[var(--color-border,#242731)] bg-[var(--color-bg-base,#0e1015)]">
                  <TableCell className="text-xs font-medium text-[var(--color-text-muted,#6b7280)]">Thời gian (UTC+7)</TableCell>
                  <TableCell className="text-xs font-medium text-[var(--color-text-muted,#6b7280)]">Cặp GD</TableCell>
                  <TableCell className="text-xs font-medium text-right text-[var(--color-text-muted,#6b7280)]">Số lượng bán</TableCell>
                  <TableCell className="text-xs font-medium text-right text-[var(--color-text-muted,#6b7280)]">Giá khớp</TableCell>
                  <TableCell className="text-xs font-medium text-right text-[var(--color-text-muted,#6b7280)]">Giá trị gộp</TableCell>
                  <TableCell className="text-xs font-medium text-right text-[var(--color-text-muted,#6b7280)]">Thuế khấu trừ</TableCell>
                  <TableCell className="text-xs font-medium text-right text-[var(--color-text-muted,#6b7280)]">Quy đổi VND</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {withholdings.map((row) => (
                  <TableRow
                    key={row.id}
                    data-testid="tax-withholding-row"
                    data-trade-id={row.tradeId}
                    className="border-b border-[var(--color-border,#242731)]/50 hover:bg-[var(--color-bg-base,#0e1015)] transition-colors text-xs"
                  >
                    <TableCell className="font-mono text-[var(--color-text-muted,#6b7280)]">
                      {new Date(row.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                    </TableCell>
                    <TableCell className="font-semibold text-[var(--color-text,#e5e7eb)]">
                      {row.symbol}
                    </TableCell>
                    <TableCell className="font-mono text-right text-[var(--color-text,#e5e7eb)]">
                      {formatDecimal(row.quantity, { decimals: 6 })}
                    </TableCell>
                    <TableCell className="font-mono text-right text-[var(--color-text,#e5e7eb)]">
                      {formatDecimal(row.price, { decimals: 2 })}
                    </TableCell>
                    <TableCell className="font-mono text-right text-[var(--color-text,#e5e7eb)]">
                      {formatDecimal(row.grossQuote, { decimals: 2 })} {row.asset}
                    </TableCell>
                    <TableCell className="font-mono text-right font-medium text-amber-400">
                      {formatDecimal(row.taxAmount, { decimals: 8 })} {row.asset}
                    </TableCell>
                    <TableCell className="font-mono text-right text-[var(--color-text-muted,#6b7280)]">
                      {row.taxVnd ? `${formatDecimal(row.taxVnd, { decimals: 0 })} ₫` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Load More Button (M-05) */}
            {nextCursor && (
              <div className="p-4 border-t border-[var(--color-border,#242731)] text-center">
                <button
                  type="button"
                  data-testid="tax-withholding-more"
                  onClick={loadMoreWithholdings}
                  disabled={loadingMore}
                  className="px-4 py-2 rounded-lg bg-[var(--color-bg-surface,#181a20)] text-xs text-[var(--color-text,#e5e7eb)] hover:bg-[var(--color-bg-surface,#181a20)]/80 transition-colors"
                >
                  {loadingMore ? 'Đang tải...' : 'Xem thêm'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
