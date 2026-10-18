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
import { formatApiError } from '../services/errors';
import { useAuth } from '../context/AuthContext';
import { Button, formatDecimal, formatPrice } from '@cex/ui';
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
  Filter,
} from 'lucide-react';

export const TaxManagementPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const api = getApiClient();
  const canRead = hasPerm('tax.read');
  const canManage = hasPerm('tax.manage');

  // Vietnam default current month (UTC+7): YYYY-MM
  const defaultVietnamPeriod = useMemo(() => {
    return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
  }, []);

  // Settings State (M-04)
  const [loadedSettings, setLoadedSettings] = useState<TaxSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [taxMode, setTaxMode] = useState<TaxMode | ''>('');
  const [taxRate, setTaxRate] = useState<string>('');
  const [taxVndRate, setTaxVndRate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [dirty, setDirty] = useState<{ taxMode: boolean; taxRate: boolean; taxVndRate: boolean }>({
    taxMode: false,
    taxRate: false,
    taxVndRate: false,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ taxRate?: string; symbols?: string[]; general?: string }>({});

  // Summary State (M-07, M-09)
  const [period, setPeriod] = useState<string>(defaultVietnamPeriod);
  const [summary, setSummary] = useState<AdminTaxSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Withholdings State (M-08, AD-22)
  const [withholdings, setWithholdings] = useState<AdminTaxWithholding[]>([]);
  const [withholdingsLoading, setWithholdingsLoading] = useState(true);
  const [withholdingsError, setWithholdingsError] = useState<string | null>(null);
  const [filterUser, setFilterUser] = useState<string>('');
  const [filterSymbol, setFilterSymbol] = useState<string>('');
  const [appliedUser, setAppliedUser] = useState<string>('');
  const [appliedSymbol, setAppliedSymbol] = useState<string>('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [symbolTickSizes, setSymbolTickSizes] = useState<Record<string, string>>({});

  useEffect(() => {
    api.exchangeInfo()
      .then((info) => {
        const map: Record<string, string> = {};
        info.symbols.forEach((s) => {
          map[s.symbol] = s.tickSize;
        });
        setSymbolTickSizes(map);
      })
      .catch(() => {});
  }, [api]);

  // Fetch Tax Settings (M-04)
  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const s = await api.adminTaxSettings();
      setLoadedSettings(s);
      setDirty((prev) => {
        if (!prev.taxMode) setTaxMode(s.taxMode);
        if (!prev.taxRate) setTaxRate(s.taxRate);
        if (!prev.taxVndRate) setTaxVndRate(s.taxVndRate || '');
        return prev;
      });
    } catch (err) {
      setLoadedSettings(null);
      setSettingsError(formatApiError(err, 'Không thể tải cấu hình thuế từ máy chủ.'));
    } finally {
      setSettingsLoading(false);
    }
  }, [api]);

  // Fetch Period Summary (M-09)
  const fetchSummary = useCallback(async (p: string) => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await api.adminTaxSummary({ query: { period: p } });
      setSummary(res);
    } catch (err) {
      setSummary(null);
      setSummaryError(formatApiError(err, 'Không thể tải tổng hợp kỳ thuế.'));
    } finally {
      setSummaryLoading(false);
    }
  }, [api]);

  // Fetch Withholding List (M-08, AD-22)
  const executeFetchWithholdings = useCallback(
    async (userQuery: string, symbolQuery: string, cursor?: string) => {
      setWithholdingsLoading(true);
      setWithholdingsError(null);
      try {
        let resolvedUserId: string | undefined = undefined;
        const cleanUser = userQuery.trim();
        if (cleanUser) {
          // If input is UID (all digits), resolve to UUID via adminListUsers
          if (/^\d+$/.test(cleanUser)) {
            const list = await api.adminListUsers({ query: { q: cleanUser, limit: 1 } });
            const matchedUser = list.items.find((u) => u.uid === cleanUser || u.id === cleanUser);
            if (matchedUser) {
              resolvedUserId = matchedUser.id;
            } else {
              // UID does not exist -> return empty withholdings list immediately
              if (!cursor) setWithholdings([]);
              setNextCursor(null);
              setWithholdingsLoading(false);
              return;
            }
          } else {
            resolvedUserId = cleanUser;
          }
        }

        const q: { limit: number; userId?: string; symbol?: string; cursor?: string; from?: string; to?: string } = { limit: 50 };
        if (resolvedUserId) q.userId = resolvedUserId;
        if (symbolQuery.trim()) q.symbol = symbolQuery.trim();

        // Always preserve period (from & to) regardless of cursor
        if (summary?.from && summary?.to) {
          q.from = summary.from;
          q.to = summary.to;
        }
        if (cursor) {
          q.cursor = cursor;
        }

        const res = await api.adminTaxWithholdings({ query: q });
        if (cursor) {
          setWithholdings((prev) => [...prev, ...(res.items || [])]);
        } else {
          setWithholdings(res.items || []);
        }
        setNextCursor(res.nextCursor || null);
      } catch (err) {
        if (!cursor) setWithholdings([]);
        setWithholdingsError(formatApiError(err, 'Không thể tải danh sách khấu trừ thuế.'));
      } finally {
        setWithholdingsLoading(false);
      }
    },
    [api, summary?.from, summary?.to]
  );

  const handleApplyFilter = () => {
    setAppliedUser(filterUser);
    setAppliedSymbol(filterSymbol);
    executeFetchWithholdings(filterUser, filterSymbol);
  };

  const handleLoadMore = () => {
    if (nextCursor && !withholdingsLoading) {
      executeFetchWithholdings(appliedUser, appliedSymbol, nextCursor);
    }
  };

  useEffect(() => {
    if (canRead) {
      fetchSettings();
    }
  }, [canRead, fetchSettings]);

  useEffect(() => {
    if (canRead) {
      fetchSummary(period);
    }
  }, [canRead, fetchSummary, period]);

  // Load withholdings when period / summary range is ready or changed
  useEffect(() => {
    if (canRead) {
      executeFetchWithholdings(appliedUser, appliedSymbol);
    }
  }, [canRead, summary?.from, summary?.to, executeFetchWithholdings]);

  // Save Settings Handler (M-04)
  const handleSaveSettings = async () => {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5 || settingsLoading || !!settingsError || !loadedSettings) return;

    setSavingSettings(true);
    setFieldErrors({});
    setSaveSuccess(false);

    try {
      const payload: {
        reason: string;
        taxMode?: TaxMode;
        taxRate?: string;
        taxVndRate?: string | null;
      } = {
        reason: trimmedReason,
      };

      if (dirty.taxMode && taxMode) {
        payload.taxMode = taxMode;
      } else if (loadedSettings && taxMode && taxMode !== loadedSettings.taxMode) {
        payload.taxMode = taxMode;
      }

      if (dirty.taxRate && taxRate.trim()) {
        payload.taxRate = taxRate.trim();
      } else if (loadedSettings && taxRate.trim() && taxRate.trim() !== loadedSettings.taxRate) {
        payload.taxRate = taxRate.trim();
      }

      if (dirty.taxVndRate) {
        payload.taxVndRate = taxVndRate.trim() === '' ? null : taxVndRate.trim();
      } else if (loadedSettings && (taxVndRate.trim() || null) !== loadedSettings.taxVndRate) {
        payload.taxVndRate = taxVndRate.trim() === '' ? null : taxVndRate.trim();
      }

      if (payload.taxMode === undefined && payload.taxRate === undefined && payload.taxVndRate === undefined) {
        setFieldErrors({ general: 'Chưa có thay đổi nào trong cấu hình để lưu.' });
        setSavingSettings(false);
        return;
      }

      const updated = await api.adminUpdateTaxSettings({ body: payload });
      setLoadedSettings(updated);
      setDirty({ taxMode: false, taxRate: false, taxVndRate: false });
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
    return exportUrl('adminTaxExport', {
      userId: filterUser.trim() || undefined,
      symbol: filterSymbol.trim() || undefined,
      from: summary?.from,
      to: summary?.to,
    });
  }, [filterUser, filterSymbol, summary?.from, summary?.to]);

  if (!canRead) {
    return (
      <div className="p-8 text-center text-[var(--text-2,#a1a1aa)]" data-testid="admin-tax-forbidden">
        <h2 className="text-xl font-bold mb-2 text-[var(--text,#f4f4f5)]">Không có quyền truy cập</h2>
        <p>Bạn không có quyền tax.read để xem thông tin quản trị thuế.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="admin-tax-page">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--line,#1d1e21)]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-[var(--text,#f4f4f5)] flex items-center gap-2">
              <Receipt className="text-indigo-400" size={22} />
              Quản trị Thuế Tiền Mã Hóa (Module T)
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
              executeFetchWithholdings(appliedUser, appliedSymbol);
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

          {/* Settings Error Alert (M-04) */}
          {settingsError && (
            <div
              data-testid="admin-tax-settings-error"
              className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-400 shrink-0" />
                <span>{settingsError}</span>
              </div>
              <Button variant="secondary" size="sm" onClick={fetchSettings}>
                Thử lại
              </Button>
            </div>
          )}

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
                disabled={settingsLoading || !!settingsError}
                onChange={(e) => {
                  setDirty((prev) => ({ ...prev, taxMode: true }));
                  setTaxMode(e.target.value as TaxMode);
                }}
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-[var(--text,#f4f4f5)] outline-none focus:border-indigo-500 disabled:opacity-50"
              >
                <option value="" hidden>— Đang tải —</option>
                <option value="OFF">OFF (Tắt khấu trừ thuế)</option>
                <option value="WITHHOLD">WITHHOLD (Khấu trừ thuế 0,1% lệnh bán Spot)</option>
              </select>
              <span className="text-[11px] text-[var(--text-3,#71717a)] mt-1 block">
                Khi tắt (OFF), form bán Spot sẽ không hiển thị khối thuế. Khi bật (WITHHOLD), lệnh bán Spot sẽ tự động bị trích thuế (mô phỏng, không nộp cho cơ quan nào).
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
                disabled={settingsLoading || !!settingsError}
                onChange={(e) => {
                  setDirty((prev) => ({ ...prev, taxRate: true }));
                  setTaxRate(e.target.value);
                }}
                placeholder="0.001"
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 font-mono text-[var(--text,#f4f4f5)] outline-none focus:border-indigo-500 disabled:opacity-50"
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
                disabled={settingsLoading || !!settingsError}
                onChange={(e) => {
                  setDirty((prev) => ({ ...prev, taxVndRate: true }));
                  setTaxVndRate(e.target.value);
                }}
                placeholder="Để trống để xóa tỷ giá (null)"
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 font-mono text-[var(--text,#f4f4f5)] outline-none focus:border-indigo-500 disabled:opacity-50"
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
                disabled={settingsLoading || !!settingsError}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Nhập lý do thay đổi để ghi nhật ký audit (tối thiểu 5 ký tự)..."
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-[var(--text,#f4f4f5)] outline-none focus:border-indigo-500 disabled:opacity-50"
              />
              <span className="text-[11px] text-[var(--text-3,#71717a)] mt-1 block">
                Hành động sẽ được ghi nhận vào nhật ký kiểm toán với mã TAX_SETTINGS_UPDATE.
              </span>
            </div>

            {/* Save Button Guarded by tax.manage permission (M-04) */}
            {canManage && (
              <div className="pt-2">
                <Button
                  data-testid="admin-tax-save"
                  variant="primary"
                  loading={savingSettings}
                  disabled={
                    savingSettings ||
                    settingsLoading ||
                    !!settingsError ||
                    !loadedSettings ||
                    reason.trim().length < 5
                  }
                  onClick={handleSaveSettings}
                  className="w-full font-medium"
                >
                  Lưu cài đặt thuế
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Period Summary & Totals (5 cols) (M-07, M-09) */}
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

            {/* Summary Error (M-09) */}
            {summaryError && (
              <div
                data-testid="admin-tax-summary-error"
                className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center justify-between mb-4"
              >
                <span>{summaryError}</span>
                <Button variant="secondary" size="sm" onClick={() => fetchSummary(period)}>
                  Thử lại
                </Button>
              </div>
            )}

            {summaryLoading && !summaryError && (
              <div className="p-8 text-center text-xs text-[var(--text-3,#71717a)]">
                Đang tải dữ liệu tổng hợp kỳ...
              </div>
            )}

            {/* Period Total (M-07) */}
            {summary && !summaryLoading && (
              <div className="p-4 rounded-xl bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)]">
                <span className="text-[11px] text-[var(--text-3,#71717a)] block mb-1">
                  Tổng thuế khấu trừ trong kỳ ({period})
                </span>
                <div className="flex items-baseline gap-2">
                  <span
                    data-testid="admin-tax-total"
                    data-value={summary.totals.taxAmount}
                    className="text-2xl font-bold font-mono text-amber-400"
                  >
                    {formatDecimal(summary.totals.taxAmount, { decimals: 8 })}
                  </span>
                  <span className="text-xs text-[var(--text-3,#71717a)] font-medium">USDT</span>
                </div>

                {/* Total VND & Missing rate note (M-07) */}
                <div className="mt-2 text-xs text-[var(--text-2,#a1a1aa)]" data-testid="admin-tax-total-vnd">
                  <span>Quy đổi VND: </span>
                  {summary.totals.taxVnd ? (
                    <span className="font-mono font-semibold text-[var(--text,#f4f4f5)]">
                      {formatDecimal(summary.totals.taxVnd, { decimals: 0 })} ₫
                    </span>
                  ) : (
                    <span>
                      —{' '}
                      {summary.totals.vndMissingCount > 0 && (
                        <span className="text-amber-400" data-testid="tax-vnd-missing">
                          ({summary.totals.vndMissingCount} bản ghi chưa có tỷ giá)
                        </span>
                      )}
                    </span>
                  )}
                </div>

                <div className="mt-3 pt-2 border-t border-[var(--line,#1d1e21)] text-[11px] text-[var(--text-3,#71717a)] flex justify-between">
                  <span>Số người nộp thuế:</span>
                  <span className="font-mono text-[var(--text,#f4f4f5)]">{summary.totals.userCount}</span>
                </div>
                <div className="text-[11px] text-[var(--text-3,#71717a)] flex justify-between mt-1">
                  <span>Số lượt khấu trừ:</span>
                  <span className="font-mono text-[var(--text,#f4f4f5)]">{summary.totals.withholdingCount}</span>
                </div>
                <div className="text-[11px] text-[var(--text-3,#71717a)] flex justify-between mt-1">
                  <span>Tổng giá trị bán gộp:</span>
                  <span className="font-mono text-[var(--text,#f4f4f5)]">
                    {formatDecimal(summary.totals.withheldGrossQuote, { decimals: 2 })} USDT
                  </span>
                </div>
              </div>
            )}

            {/* Breakdown by Category */}
            {summary && !summaryLoading && (
              <div className="mt-4">
                <span className="text-xs font-semibold text-[var(--text-2,#a1a1aa)] block mb-2">
                  Theo phân loại đối tượng
                </span>
                <div className="space-y-1.5 text-xs">
                  {summary.byCategory.map((cat) => (
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
                  ))}
                </div>
              </div>
            )}
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
                    {summaryLoading ? 'Đang tải dữ liệu...' : `Không có cặp giao dịch nào phát sinh thuế trong kỳ ${period}.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Withholdings Detail Table (M-08) */}
      <div className="rounded-xl bg-[var(--panel,#141416)] border border-[var(--line,#1d1e21)] overflow-hidden">
        <div className="p-4 border-b border-[var(--line,#1d1e21)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold text-sm text-[var(--text,#f4f4f5)]">
            <TableIcon size={16} className="text-indigo-400" />
            Nhật ký khấu trừ toàn hệ thống
          </div>

          {/* Filters (M-08, AD-22) */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              data-testid="admin-tax-filter-user"
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyFilter()}
              placeholder="Lọc User ID hoặc UID..."
              className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded px-2.5 py-1 text-xs text-[var(--text,#f4f4f5)] font-mono outline-none focus:border-indigo-500 w-44"
            />
            <input
              type="text"
              data-testid="admin-tax-filter-symbol"
              value={filterSymbol}
              onChange={(e) => setFilterSymbol(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyFilter()}
              placeholder="Lọc Cặp (vd BTCUSDT)..."
              className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded px-2.5 py-1 text-xs text-[var(--text,#f4f4f5)] font-mono outline-none focus:border-indigo-500 w-36"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleApplyFilter}
              loading={withholdingsLoading}
              className="flex items-center gap-1"
            >
              <Filter size={12} />
              Lọc
            </Button>
          </div>
        </div>

        {withholdingsError && (
          <div className="p-4 bg-red-500/10 border-b border-red-500/30 text-xs text-red-300 flex items-center justify-between">
            <span>{withholdingsError}</span>
            <Button variant="secondary" size="sm" onClick={() => executeFetchWithholdings(appliedUser, appliedSymbol)}>
              Thử lại
            </Button>
          </div>
        )}

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
                  <tr
                    key={w.id}
                    data-testid="admin-tax-withholding-row"
                    data-trade-id={w.tradeId}
                    className="hover:bg-[var(--bg,#000000)] transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-[var(--text-3,#71717a)]">
                      {new Date(w.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                    </td>
                    <td className="px-4 py-3 font-mono text-indigo-400 text-[11px]">
                      <a href={`/admin/users/${w.userId}`} className="hover:underline">
                        {w.userId.slice(0, 8)}...
                      </a>
                    </td>
                    <td className="px-4 py-3 font-semibold text-[var(--text,#f4f4f5)]">
                      {w.symbol}
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-[var(--text,#f4f4f5)]">
                      {formatDecimal(w.quantity, { decimals: 6 })}
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-[var(--text,#f4f4f5)]">
                      {formatPrice(w.price, symbolTickSizes[w.symbol])}
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
                    {withholdingsLoading ? 'Đang tải danh sách khấu trừ...' : 'Chưa có bản ghi khấu trừ nào trên hệ thống.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Load More Button (M-08, AD-22) */}
        {nextCursor && (
          <div className="p-4 border-t border-[var(--line,#1d1e21)] text-center">
            <button
              type="button"
              data-testid="admin-tax-more"
              onClick={handleLoadMore}
              disabled={withholdingsLoading}
              className="px-4 py-2 rounded-lg bg-[var(--line,#1d1e21)] text-xs text-[var(--text,#f4f4f5)] hover:bg-[var(--line,#1d1e21)]/80 transition-colors"
            >
              {withholdingsLoading ? 'Đang tải...' : 'Xem thêm bản ghi'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
