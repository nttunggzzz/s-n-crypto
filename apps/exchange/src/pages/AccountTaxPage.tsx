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
import { Button, Card, formatDecimal, Table, TableHead, TableRow, TableCell, TableBody, useToast } from '@cex/ui';
import { Download, RefreshCw, AlertTriangle, Info, Calendar, FileText, CheckCircle2, ShieldAlert } from 'lucide-react';

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

  // Fetch all user tax data
  const loadTaxData = useCallback(async (year: number) => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const [profRes, sumRes, withRes] = await Promise.all([
        api.taxProfile(),
        api.taxSummary({ query: { year } }),
        api.taxWithholdings({ query: { limit: 100 } }),
      ]);
      setProfile(profRes);
      setSummary(sumRes);
      setWithholdings(withRes.items || []);
    } catch (err: unknown) {
      setError(formatApiError(err, 'Không thể tải dữ liệu thuế. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  }, [api, isAuthenticated]);

  useEffect(() => {
    loadTaxData(selectedYear);
  }, [loadTaxData, selectedYear]);

  // Handle taxpayer category update
  const handleCategoryChange = async (newCategory: TaxCategory) => {
    setUpdatingCategory(true);
    try {
      const updated = await api.taxUpdateProfile({ body: { category: newCategory } });
      setProfile(updated);
      success('Đã cập nhật phân loại người nộp thuế thành công.');
      // Refresh summary and withholdings
      await loadTaxData(selectedYear);
    } catch (err: unknown) {
      toastError(formatApiError(err, 'Không thể cập nhật phân loại.'));
    } finally {
      setUpdatingCategory(false);
    }
  };

  const csvDownloadUrl = useMemo(() => {
    return exportUrl('taxExport', {});
  }, []);

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
            Theo dõi và đối soát các khoản thuế thu nhập đã được sàn khấu trừ tự động theo Thông tư 32/2026/TT-BTC.
          </p>
        </div>

        {/* Action Controls */}
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
            download="tax-withholdings.csv"
            data-testid="tax-export-csv"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm,4px)] bg-[var(--color-accent,#6366f1)] hover:bg-[var(--color-accent-hover,#4f46e5)] text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Tải CSV
          </a>
        </div>
      </div>

      {/* Experimental Disclaimer Notice */}
      <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1">
          <div className="font-semibold text-amber-300">
            Thông báo môi trường thử nghiệm (Sandbox)
          </div>
          <p className="text-amber-200/80 leading-relaxed">
            Hệ thống khấu trừ thuế tự động trên tiền ảo thử nghiệm để mô phỏng quy trình theo quy định của TT 32/2026/TT-BTC.
            Các dữ liệu này <strong>không phải chứng từ thuế chính thức</strong> và không phát sinh nghĩa vụ pháp lý với cơ quan nhà nước.
          </p>
          <div className="text-[11px] text-amber-300/70 mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span>• Cá nhân không phải quyết toán năm khoản thuế 0,1% này.</span>
            <span>• Giao dịch Futures: chưa có quy định thuế, không khấu trừ.</span>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span>{error}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => loadTaxData(selectedYear)}>
            Thử lại
          </Button>
        </div>
      )}

      {/* Taxpayer Category Selector */}
      <div className="p-5 rounded-xl bg-[var(--color-bg-secondary,#16181d)] border border-[var(--color-border,#242731)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="max-w-xl">
          <div className="text-sm font-semibold text-[var(--color-text,#e5e7eb)] flex items-center gap-2">
            Phân loại người nộp thuế
            {updatingCategory && <span className="text-xs text-indigo-400 animate-pulse">Đang cập nhật...</span>}
          </div>
          <p className="text-xs text-[var(--color-text-muted,#6b7280)] mt-1">
            Chọn tư cách chủ tài khoản. Tổ chức trong nước tự kê khai và quyết toán thuế TNDN (20% trên lợi nhuận), sàn không tự động trích 0,1%.
          </p>
        </div>

        <div className="w-full md:w-80">
          <select
            data-testid="tax-category-select"
            value={profile?.category || 'INDIVIDUAL'}
            disabled={updatingCategory || loading}
            onChange={(e) => handleCategoryChange(e.target.value as TaxCategory)}
            className="w-full bg-[var(--color-bg-base,#0e1015)] border border-[var(--color-border,#242731)] rounded-lg px-3 py-2 text-xs text-[var(--color-text,#e5e7eb)] focus:border-indigo-500 outline-none"
          >
            <option value="INDIVIDUAL">Cá nhân (Khấu trừ 0,1% doanh số bán)</option>
            <option value="FOREIGN_ORG">Tổ chức nước ngoài (Khấu trừ 0,1% doanh số bán)</option>
            <option value="DOMESTIC_ORG">Tổ chức trong nước (Tự kê khai 20% lợi nhuận)</option>
          </select>
        </div>
      </div>

      {/* Year Overview Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Year Select & Total */}
        <div className="p-5 rounded-xl bg-[var(--color-bg-secondary,#16181d)] border border-[var(--color-border,#242731)] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-[var(--color-text-muted,#6b7280)] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Năm tính thuế
            </span>
            <select
              data-testid="tax-year-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-[var(--color-bg-base,#0e1015)] border border-[var(--color-border,#242731)] rounded px-2.5 py-1 text-xs text-[var(--color-text,#e5e7eb)] outline-none"
            >
              {[currentVietnamYear - 2, currentVietnamYear - 1, currentVietnamYear, currentVietnamYear + 1].map((y) => (
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
                data-value={summary?.totals?.taxAmount || '0'}
                className="text-2xl font-bold font-mono text-amber-400"
              >
                {formatDecimal(summary?.totals?.taxAmount || '0', { decimals: 8 })}
              </span>
              <span className="text-xs text-[var(--color-text-muted,#6b7280)] font-medium">USDT</span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--color-border,#242731)] text-[11px] text-[var(--color-text-muted,#6b7280)] flex justify-between">
            <span>Số lần khấu trừ:</span>
            <span className="font-mono text-[var(--color-text,#e5e7eb)]">{summary?.totals?.withholdingCount ?? 0}</span>
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
                {formatDecimal(summary?.totals?.withheldGrossQuote || '0', { decimals: 2 })}
              </span>
              <span className="text-xs text-[var(--color-text-muted,#6b7280)] font-medium">USDT</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--color-border,#242731)] text-[11px] text-[var(--color-text-muted,#6b7280)] flex justify-between">
            <span>Tổng bán (kể cả miễn thuế):</span>
            <span className="font-mono text-[var(--color-text,#e5e7eb)]">
              {formatDecimal(summary?.totals?.sellGrossQuote || '0', { decimals: 2 })} USDT
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
                {formatDecimal(summary?.totals?.realizedPnl || '0', { decimals: 2 })}
              </span>
              <span className="text-xs text-[var(--color-text-muted,#6b7280)] font-medium">USDT</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--color-border,#242731)] text-[11px] text-[var(--color-text-muted,#6b7280)] flex justify-between">
            <span>Tổng phí bán:</span>
            <span className="font-mono text-[var(--color-text,#e5e7eb)]">
              {formatDecimal(summary?.totals?.sellFees || '0', { decimals: 4 })} USDT
            </span>
          </div>
        </div>
      </div>

      {/* 12-Month Breakdown Table */}
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
                summary.months.map((m) => {
                  return (
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
                  );
                })
              ) : (
                // Fallback 12 empty rows if summary not loaded yet
                Array.from({ length: 12 }, (_, i) => {
                  const mm = String(i + 1).padStart(2, '0');
                  const monthStr = `${selectedYear}-${mm}`;
                  return (
                    <TableRow
                      key={monthStr}
                      data-testid="tax-month-row"
                      data-month={monthStr}
                      className="border-b border-[var(--color-border,#242731)]/50 text-xs"
                    >
                      <TableCell className="font-mono text-[var(--color-text-muted,#6b7280)]">{monthStr}</TableCell>
                      <TableCell className="text-right text-[var(--color-text-muted,#6b7280)]">0</TableCell>
                      <TableCell className="text-right text-[var(--color-text-muted,#6b7280)]">0,00</TableCell>
                      <TableCell className="text-right text-[var(--color-text-muted,#6b7280)]">0,00000000</TableCell>
                      <TableCell className="text-right text-[var(--color-text-muted,#6b7280)]">—</TableCell>
                      <TableCell className="text-right text-[var(--color-text-muted,#6b7280)]">0,00</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Withholdings List */}
      <div className="rounded-xl bg-[var(--color-bg-secondary,#16181d)] border border-[var(--color-border,#242731)] overflow-hidden">
        <div className="p-4 border-b border-[var(--color-border,#242731)] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text,#e5e7eb)] flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              Danh sách các khoản khấu trừ thuế
            </h2>
            <p className="text-[11px] text-[var(--color-text-muted,#6b7280)] mt-0.5">
              Chi tiết từng lần khấu trừ theo từng lệnh khớp (Fill) bán Spot.
            </p>
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
          </div>
        )}
      </div>
    </div>
  );
};
