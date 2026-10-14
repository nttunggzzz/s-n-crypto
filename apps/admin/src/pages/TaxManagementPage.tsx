import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  type TaxMode,
  type TaxSettings,
  type AdminTaxSummary,
  type AdminTaxWithholding,
  exportUrl,
  ApiError,
} from '@cex/contracts';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button, formatDecimal } from '@cex/ui';
import {
  Receipt,
  Download,
  RefreshCw,
  AlertTriangle,
  Info,
  Calendar,
  Layers,
  Settings2,
  Table as TableIcon,
  CheckCircle2,
} from 'lucide-react';

export const TaxManagementPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const api = getApiClient();
  const canManage = hasPerm('tax.manage');

  // Vietnam default current month (UTC+7): YYYY-MM
  const defaultVietnamPeriod = useMemo(() => {
    return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
  }, []);

  // Settings State
  const [taxMode, setTaxMode] = useState<TaxMode>('OFF');
  const [taxRate, setTaxRate] = useState<string>('0.001');
  const [taxVndRate, setTaxVndRate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ taxRate?: string; symbols?: string[]; general?: string }>({});

  // Summary State
  const [period, setPeriod] = useState<string>(defaultVietnamPeriod);
  const [summary, setSummary] = useState<AdminTaxSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Withholdings State
  const [withholdings, setWithholdings] = useState<AdminTaxWithholding[]>([]);
  const [withholdingsLoading, setWithholdingsLoading] = useState(true);

  // Fetch Tax Settings
  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const s = await api.adminTaxSettings();
      setTaxMode(s.taxMode);
      setTaxRate(s.taxRate);
      setTaxVndRate(s.taxVndRate || '');
    } catch {
      // Ignore or set error
    } finally {
      setSettingsLoading(false);
    }
  }, [api]);

  // Fetch Period Summary
  const fetchSummary = useCallback(async (p: string) => {
    setSummaryLoading(true);
    try {
      const res = await api.adminTaxSummary({ query: { period: p } });
      setSummary(res);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [api]);

  // Fetch Withholding List
  const fetchWithholdings = useCallback(async () => {
    setWithholdingsLoading(true);
    try {
      const res = await api.adminTaxWithholdings({ query: { limit: 100 } });
      setWithholdings(res.items || []);
    } catch {
      setWithholdings([]);
    } finally {
      setWithholdingsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchSettings();
    fetchWithholdings();
  }, [fetchSettings, fetchWithholdings]);

  useEffect(() => {
    fetchSummary(period);
  }, [fetchSummary, period]);

  // Save Settings Handler
  const handleSaveSettings = async () => {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5) return;

    setSavingSettings(true);
    setFieldErrors({});
    setSaveSuccess(false);

    try {
      const payload: {
        taxMode: TaxMode;
        taxRate: string;
        taxVndRate: string | null;
        reason: string;
      } = {
        taxMode,
        taxRate,
        taxVndRate: taxVndRate.trim() === '' ? null : taxVndRate.trim(),
        reason: trimmedReason,
      };

      const updated = await api.adminUpdateTaxSettings({ body: payload });
      setTaxMode(updated.taxMode);
      setTaxRate(updated.taxRate);
      setTaxVndRate(updated.taxVndRate || '');
      setReason('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);

      // Refresh summary
      await fetchSummary(period);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        const details = err.details as { field?: string; symbols?: string[]; message?: string } | undefined;
        if (details?.field === 'taxRate') {
          setFieldErrors({ taxRate: 'Tỷ lệ thuế phải nằm trong khoảng từ > 0 đến tối đa 0,01 (1%).' });
        } else if (details?.symbols && Array.isArray(details.symbols)) {
          setFieldErrors({
            symbols: details.symbols,
            general: `Không thể bật khấu trừ thuế vì các cặp sau chưa định giá bằng USDT: ${details.symbols.join(', ')}`,
          });
        } else {
          setFieldErrors({ general: err.message || 'Dữ liệu thiết lập thuế không hợp lệ.' });
        }
      } else if (err instanceof Error) {
        setFieldErrors({ general: err.message });
      } else {
        setFieldErrors({ general: 'Không thể cập nhật cấu hình thuế.' });
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const csvDownloadUrl = useMemo(() => {
    return exportUrl('adminTaxExport', {});
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="admin-tax-page">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--line,#1d1e21)]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-[var(--text,#f4f4f5)] flex items-center gap-2">
              <Receipt className="text-indigo-400" size={22} />
              Quản lý Thuế Crypto (Việt Nam)
            </h1>
            <span
              data-testid="tax-test-label"
              className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-amber-500/20 text-amber-400 border border-amber-500/30"
            >
              Thử nghiệm
            </span>
          </div>
          <p className="text-xs text-[var(--text-3,#71717a)] mt-1">
            Cấu hình khấu trừ thuế tự động theo TT 32/2026/TT-BTC, theo dõi tổng hợp kỳ và xuất bảng kê đối soát.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              fetchSettings();
              fetchSummary(period);
              fetchWithholdings();
            }}
            loading={settingsLoading || summaryLoading || withholdingsLoading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw size={14} />
            Làm mới
          </Button>

          <a
            href={csvDownloadUrl}
            download="admin-tax-statement.csv"
            data-testid="admin-tax-export-csv"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--color-accent,#6366f1)] hover:bg-[var(--color-accent-hover,#4f46e5)] text-white transition-colors"
          >
            <Download size={14} />
            Tải bảng kê CSV
          </a>
        </div>
      </div>

      {/* Experimental Sandbox & Grid Bot Warning */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 space-y-1.5">
        <div className="flex items-center gap-2 font-semibold text-amber-300">
          <Info size={16} className="text-amber-400 shrink-0" />
          <span>Sàn thử nghiệm (Sandbox) — Bất biến nghiệp vụ Module T</span>
        </div>
        <p className="text-amber-200/80 leading-relaxed text-[11px]">
          Mọi màn hình thuộc tính năng thuế đều mang nhãn <strong>“thử nghiệm”</strong>. Hệ thống không sử dụng tên/số hiệu của biểu mẫu nhà nước và tuyệt đối không thu thập CCCD/MST.
        </p>
        <p className="text-amber-300/90 font-medium text-[11px]">
          ⚠️ Cảnh báo bot giao dịch: Bot lưới tạo khi thuế tắt có thể lỗ ở các vòng hẹp.
        </p>
      </div>

      {/* Grid: Settings Form & Summary Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tax Configuration Form (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-xl bg-[var(--panel,#141416)] border border-[var(--line,#1d1e21)] space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--line,#1d1e21)] pb-3">
            <div className="flex items-center gap-2 font-semibold text-sm text-[var(--text,#f4f4f5)]">
              <Settings2 size={16} className="text-indigo-400" />
              Thiết lập chính sách thuế
            </div>
            {saveSuccess && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <CheckCircle2 size={14} />
                Đã lưu cấu hình thành công
              </div>
            )}
          </div>

          {fieldErrors.general && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-400 shrink-0" />
              <span>{fieldErrors.general}</span>
            </div>
          )}

          <div className="space-y-4 text-xs">
            {/* Mode Select */}
            <div>
              <label className="block text-[var(--text-2,#a1a1aa)] mb-1 font-medium">
                Chế độ khấu trừ (taxMode)
              </label>
              <select
                data-testid="admin-tax-mode"
                value={taxMode}
                onChange={(e) => setTaxMode(e.target.value as TaxMode)}
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-[var(--text,#f4f4f5)] outline-none focus:border-indigo-500"
              >
                <option value="OFF">OFF (Tắt khấu trừ thuế)</option>
                <option value="WITHHOLD">WITHHOLD (Khấu trừ thuế 0,1% lệnh bán Spot)</option>
              </select>
              <span className="text-[11px] text-[var(--text-3,#71717a)] mt-1 block">
                Khi tắt (OFF), form bán Spot sẽ không hiển thị khối thuế. Khi bật (WITHHOLD), lệnh bán Spot sẽ tự động trích nộp.
              </span>
            </div>

            {/* Tax Rate Input */}
            <div>
              <label className="block text-[var(--text-2,#a1a1aa)] mb-1 font-medium">
                Tỷ lệ thuế suất (taxRate)
              </label>
              <input
                type="text"
                data-testid="admin-tax-rate"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                placeholder="0.001"
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 font-mono text-[var(--text,#f4f4f5)] outline-none focus:border-indigo-500"
              />
              {fieldErrors.taxRate ? (
                <span className="text-[11px] text-red-400 mt-1 block">{fieldErrors.taxRate}</span>
              ) : (
                <span className="text-[11px] text-[var(--text-3,#71717a)] mt-1 block">
                  Tỷ lệ từ &gt; 0 đến tối đa 0,01 (0.001 tương đương 0,1%).
                </span>
              )}
            </div>

            {/* VND Reference Rate Input */}
            <div>
              <label className="block text-[var(--text-2,#a1a1aa)] mb-1 font-medium">
                Tỷ giá tham chiếu VND / USDT (taxVndRate)
              </label>
              <input
                type="text"
                data-testid="admin-tax-vnd-rate"
                value={taxVndRate}
                onChange={(e) => setTaxVndRate(e.target.value)}
                placeholder="Để trống để xóa tỷ giá (null)"
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 font-mono text-[var(--text,#f4f4f5)] outline-none focus:border-indigo-500"
              />
              <span className="text-[11px] text-[var(--text-3,#71717a)] mt-1 block">
                Để trống và lưu = xóa tỷ giá (server lưu null). Khi xóa tỷ giá, các trường VND sẽ hiển thị "—".
              </span>
            </div>

            {/* Audit Reason Input */}
            <div>
              <label className="block text-[var(--text-2,#a1a1aa)] mb-1 font-medium">
                Lý do thay đổi cấu hình (admin-tax-reason) <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                data-testid="admin-tax-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Nhập lý do thay đổi để ghi nhật ký audit (tối thiểu 5 ký tự)..."
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-[var(--text,#f4f4f5)] outline-none focus:border-indigo-500"
              />
              <span className="text-[11px] text-[var(--text-3,#71717a)] mt-1 block">
                Hành động sẽ được ghi nhận vào nhật ký kiểm toán với mã TAX_SETTINGS_UPDATE.
              </span>
            </div>

            {/* Save Button Guarded by tax.manage permission */}
            {canManage && (
              <div className="pt-2">
                <Button
                  data-testid="admin-tax-save"
                  variant="primary"
                  loading={savingSettings}
                  disabled={savingSettings || reason.trim().length < 5}
                  onClick={handleSaveSettings}
                  className="w-full font-medium"
                >
                  Lưu cài đặt thuế
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Period Summary & Totals (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-xl bg-[var(--panel,#141416)] border border-[var(--line,#1d1e21)] flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-[var(--line,#1d1e21)] pb-3 mb-4">
              <div className="flex items-center gap-2 font-semibold text-sm text-[var(--text,#f4f4f5)]">
                <Calendar size={16} className="text-indigo-400" />
                Tổng hợp kỳ thuế
              </div>

              {/* Period Selector */}
              <input
                type="text"
                data-testid="admin-tax-period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="YYYY-MM"
                className="w-28 bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded px-2.5 py-1 text-xs text-[var(--text,#f4f4f5)] font-mono text-center outline-none focus:border-indigo-500"
              />
            </div>

            {/* Period Total */}
            <div className="p-4 rounded-xl bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)]">
              <span className="text-[11px] text-[var(--text-3,#71717a)] block mb-1">
                Tổng thuế khấu trừ trong kỳ ({period})
              </span>
              <div className="flex items-baseline gap-2">
                <span
                  data-testid="admin-tax-total"
                  data-value={summary?.totals?.taxAmount || '0'}
                  className="text-2xl font-bold font-mono text-amber-400"
                >
                  {formatDecimal(summary?.totals?.taxAmount || '0', { decimals: 8 })}
                </span>
                <span className="text-xs text-[var(--text-3,#71717a)] font-medium">USDT</span>
              </div>
              <div className="mt-2 pt-2 border-t border-[var(--line,#1d1e21)] text-[11px] text-[var(--text-3,#71717a)] flex justify-between">
                <span>Số người nộp thuế:</span>
                <span className="font-mono text-[var(--text,#f4f4f5)]">{summary?.totals?.userCount ?? 0}</span>
              </div>
              <div className="text-[11px] text-[var(--text-3,#71717a)] flex justify-between mt-1">
                <span>Số lượt khấu trừ:</span>
                <span className="font-mono text-[var(--text,#f4f4f5)]">{summary?.totals?.withholdingCount ?? 0}</span>
              </div>
              <div className="text-[11px] text-[var(--text-3,#71717a)] flex justify-between mt-1">
                <span>Tổng giá trị bán gộp:</span>
                <span className="font-mono text-[var(--text,#f4f4f5)]">
                  {formatDecimal(summary?.totals?.withheldGrossQuote || '0', { decimals: 2 })} USDT
                </span>
              </div>
            </div>

            {/* Breakdown by Category */}
            <div className="mt-4">
              <span className="text-xs font-semibold text-[var(--text-2,#a1a1aa)] block mb-2">
                Theo phân loại đối tượng
              </span>
              <div className="space-y-1.5 text-xs">
                {summary?.byCategory?.map((cat) => (
                  <div
                    key={cat.category}
                    className="p-2.5 rounded-lg bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium text-[var(--text,#f4f4f5)]">
                        {cat.category === 'INDIVIDUAL'
                          ? 'Cá nhân (INDIVIDUAL)'
                          : cat.category === 'FOREIGN_ORG'
                          ? 'Tổ chức nước ngoài (FOREIGN_ORG)'
                          : 'Tổ chức trong nước (DOMESTIC_ORG)'}
                      </div>
                      <div className="text-[10px] text-[var(--text-3,#71717a)]">
                        {cat.userCount} người dùng • {cat.withholdingCount} lượt trích
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-medium text-amber-400">
                        {formatDecimal(cat.taxAmount, { decimals: 8 })} USDT
                      </div>
                      <div className="text-[10px] text-[var(--text-3,#71717a)]">
                        {cat.taxVnd ? `${formatDecimal(cat.taxVnd, { decimals: 0 })} ₫` : '—'}
                      </div>
                    </div>
                  </div>
                )) || (
                  <div className="text-xs text-[var(--text-3,#71717a)] text-center py-4">Chưa có dữ liệu kỳ</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown By Symbol Table */}
      <div className="rounded-xl bg-[var(--panel,#141416)] border border-[var(--line,#1d1e21)] overflow-hidden">
        <div className="p-4 border-b border-[var(--line,#1d1e21)] flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm text-[var(--text,#f4f4f5)]">
            <Layers size={16} className="text-indigo-400" />
            Khấu trừ thuế theo từng cặp giao dịch ({period})
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[var(--bg,#000000)] text-[var(--text-3,#71717a)] border-b border-[var(--line,#1d1e21)]">
              <tr>
                <th className="px-4 py-3 font-medium">Cặp giao dịch</th>
                <th className="px-4 py-3 font-medium text-right">Số người dùng</th>
                <th className="px-4 py-3 font-medium text-right">Số lượt trích</th>
                <th className="px-4 py-3 font-medium text-right">Doanh số gộp (USDT)</th>
                <th className="px-4 py-3 font-medium text-right">Thuế khấu trừ (USDT)</th>
                <th className="px-4 py-3 font-medium text-right">Quy đổi VND</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line,#1d1e21)]/60">
              {summary?.bySymbol && summary.bySymbol.length > 0 ? (
                summary.bySymbol.map((row) => (
                  <tr
                    key={row.symbol}
                    data-testid="admin-tax-by-symbol-row"
                    data-symbol={row.symbol}
                    className="hover:bg-[var(--bg,#000000)] transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-[var(--text,#f4f4f5)]">
                      {row.symbol}
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-[var(--text-3,#71717a)]">
                      {row.userCount}
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-[var(--text-3,#71717a)]">
                      {row.withholdingCount}
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-[var(--text,#f4f4f5)]">
                      {formatDecimal(row.withheldGrossQuote, { decimals: 2 })}
                    </td>
                    <td className="px-4 py-3 font-mono text-right font-medium text-amber-400">
                      {formatDecimal(row.taxAmount, { decimals: 8 })}
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-[var(--text-3,#71717a)]">
                      {row.taxVnd ? `${formatDecimal(row.taxVnd, { decimals: 0 })} ₫` : '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-3,#71717a)]">
                    Không có cặp giao dịch nào phát sinh thuế trong kỳ {period}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Withholdings Detail Table */}
      <div className="rounded-xl bg-[var(--panel,#141416)] border border-[var(--line,#1d1e21)] overflow-hidden">
        <div className="p-4 border-b border-[var(--line,#1d1e21)] flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm text-[var(--text,#f4f4f5)]">
            <TableIcon size={16} className="text-indigo-400" />
            Nhật ký khấu trừ toàn hệ thống
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[var(--bg,#000000)] text-[var(--text-3,#71717a)] border-b border-[var(--line,#1d1e21)]">
              <tr>
                <th className="px-4 py-3 font-medium">Thời gian</th>
                <th className="px-4 py-3 font-medium">User ID</th>
                <th className="px-4 py-3 font-medium">Cặp GD</th>
                <th className="px-4 py-3 font-medium text-right">Khối lượng bán</th>
                <th className="px-4 py-3 font-medium text-right">Giá khớp</th>
                <th className="px-4 py-3 font-medium text-right">Giá trị gộp</th>
                <th className="px-4 py-3 font-medium text-right">Thuế khấu trừ</th>
                <th className="px-4 py-3 font-medium text-right">Quy đổi VND</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line,#1d1e21)]/60">
              {withholdings.length > 0 ? (
                withholdings.map((w) => (
                  <tr key={w.id} className="hover:bg-[var(--bg,#000000)] transition-colors">
                    <td className="px-4 py-3 font-mono text-[var(--text-3,#71717a)]">
                      {new Date(w.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                    </td>
                    <td className="px-4 py-3 font-mono text-indigo-400 text-[11px]">
                      {w.userId.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3 font-semibold text-[var(--text,#f4f4f5)]">
                      {w.symbol}
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-[var(--text,#f4f4f5)]">
                      {formatDecimal(w.quantity, { decimals: 6 })}
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-[var(--text,#f4f4f5)]">
                      {formatDecimal(w.price, { decimals: 2 })}
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-[var(--text,#f4f4f5)]">
                      {formatDecimal(w.grossQuote, { decimals: 2 })} {w.asset}
                    </td>
                    <td className="px-4 py-3 font-mono text-right font-medium text-amber-400">
                      {formatDecimal(w.taxAmount, { decimals: 8 })} {w.asset}
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-[var(--text-3,#71717a)]">
                      {w.taxVnd ? `${formatDecimal(w.taxVnd, { decimals: 0 })} ₫` : '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-3,#71717a)]">
                    Chưa có bản ghi khấu trừ nào trên hệ thống.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
