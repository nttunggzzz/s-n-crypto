import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatApiError } from '../services/errors';
import { appLinks, type AdminFuturesSymbol } from '@cex/contracts';
import { dec } from '@cex/core';
import { ExternalLink, Edit2, X, Sliders } from 'lucide-react';

export const FuturesSymbolsPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const [symbols, setSymbols] = useState<AdminFuturesSymbol[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Edit modal
  const [selectedSym, setSelectedSym] = useState<AdminFuturesSymbol | null>(null);
  const [editEnabled, setEditEnabled] = useState(true);
  const [editMaxLeverage, setEditMaxLeverage] = useState(20);
  const [editMmr, setEditMmr] = useState('');
  const [reason, setReason] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const api = getApiClient();
  const exchangeOrigin = import.meta.env.VITE_EXCHANGE_ORIGIN;
  const canConfigure = hasPerm('exchange.configure');

  const loadSymbols = () => {
    setIsLoading(true);
    setLoadError(null);
    api.adminFuturesSymbols()
      .then((res) => setSymbols(res.items))
      .catch((e: any) => setLoadError(formatApiError(e, 'Không thể tải danh sách hợp đồng Futures.')))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadSymbols();
  }, []);

  const handleOpenEdit = (sym: AdminFuturesSymbol) => {
    setSelectedSym(sym);
    setEditEnabled(sym.adminEnabled);
    setEditMaxLeverage(sym.maxLeverage);
    setEditMmr(sym.maintenanceMarginRate);
    setReason('');
    setModalError(null);
  };

  const handleCloseEdit = () => {
    setSelectedSym(null);
    setModalError(null);
    setReason('');
  };

  const hasEnabledChanged = selectedSym ? editEnabled !== selectedSym.adminEnabled : false;
  const hasLeverageChanged = selectedSym ? editMaxLeverage !== selectedSym.maxLeverage : false;
  let hasMmrChanged = false;
  let mmrInvalid = false;
  if (selectedSym) {
    try {
      const dMmr = dec(editMmr.trim());
      if (dMmr.lt(dec('0.001')) || dMmr.gt(dec('0.1'))) {
        mmrInvalid = true;
      } else if (!dMmr.eq(dec(selectedSym.maintenanceMarginRate))) {
        hasMmrChanged = true;
      }
    } catch {
      mmrInvalid = true;
    }
  }

  const hasChanges = hasEnabledChanged || hasLeverageChanged || hasMmrChanged;
  const canSubmit = hasChanges && !mmrInvalid && reason.trim().length >= 5 && !isSubmitting;

  const handleConfirmEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSym || !canSubmit) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      const body: any = { reason: reason.trim() };
      if (hasEnabledChanged) body.enabled = editEnabled;
      if (hasLeverageChanged) body.maxLeverage = editMaxLeverage;
      if (hasMmrChanged) body.maintenanceMarginRate = editMmr.trim();

      await api.adminUpdateFuturesSymbol({
        params: { symbol: selectedSym.symbol },
        body,
      });
      handleCloseEdit();
      loadSymbols();
    } catch (e) {
      setModalError(formatApiError(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = symbols.filter((s) => s.symbol.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">Quản lý hợp đồng Futures</h1>
        <p className="text-sm text-[var(--text-2,#a1a1aa)] mt-1">
          Kiểm soát đòn bẩy tối đa, tỷ lệ ký quỹ duy trì MMR, số vị thế và trạng thái giao dịch
        </p>
      </div>

      <div className="max-w-md">
        <input
          type="text"
          placeholder="Tìm kiếm hợp đồng Futures (BTCUSDT, ETHUSDT)..."
          className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3.5 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow-lg">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase">
            <tr>
              <th className="px-5 py-3">Hợp đồng</th>
              <th className="px-5 py-3">Đòn bẩy tối đa</th>
              <th className="px-5 py-3">Ký quỹ duy trì (MMR)</th>
              <th className="px-5 py-3">Vị thế đang mở</th>
              <th className="px-5 py-3">Lệnh đang mở</th>
              <th className="px-5 py-3">Trạng thái</th>
              {canConfigure && <th className="px-5 py-3 text-right">Thao tác</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line,#1d1e21)]">
            {filtered.map((s) => (
              <tr key={s.symbol} className="hover:bg-[var(--line,#1d1e21)]/15">
                <td className="px-5 py-3 font-bold font-mono">
                  <a
                    href={appLinks.exchange.futures(s.symbol, exchangeOrigin)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent,#818cf8)] hover:underline inline-flex items-center gap-1.5"
                  >
                    {s.symbol} <ExternalLink size={12} />
                  </a>
                </td>
                <td className="px-5 py-3 font-mono font-semibold">{s.maxLeverage}x</td>
                <td className="px-5 py-3 font-mono text-xs text-[var(--text-2,#a1a1aa)]">
                  {dec(s.maintenanceMarginRate).mul(100).toString()}%
                </td>
                <td className="px-5 py-3 font-mono">{s.openPositions}</td>
                <td className="px-5 py-3 font-mono">{s.openOrders}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                    s.adminEnabled ? 'bg-[var(--up,#1fc27a)]/15 text-[var(--up,#1fc27a)]' : 'bg-[var(--down,#f2475f)]/15 text-[var(--down,#f2475f)]'
                  }`}>
                    {s.adminEnabled ? 'Đang mở' : 'Đã đóng'}
                  </span>
                </td>
                {canConfigure && (
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleOpenEdit(s)}
                      className="px-3 py-1 rounded bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-xs font-medium border border-[var(--line,#1d1e21)] text-[var(--text,#f4f4f5)] inline-flex items-center gap-1"
                    >
                      <Edit2 size={12} />
                      <span>Cấu hình</span>
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {loadError && symbols.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center">
                  <div data-testid="list-error" className="flex flex-col items-center justify-center gap-3">
                    <p className="text-sm text-[var(--down,#f2475f)]">{loadError}</p>
                    <button
                      type="button"
                      onClick={() => loadSymbols()}
                      className="px-3.5 py-1.5 rounded-lg bg-[var(--accent,#818cf8)] text-white text-xs font-semibold hover:brightness-110 transition-all"
                    >
                      Thử lại
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {!isLoading && !loadError && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-[var(--text-3,#63636b)]">
                  Không tìm thấy hợp đồng nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit futures modal */}
      {selectedSym && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line,#1d1e21)] pb-3">
              <h3 className="text-lg font-bold text-[var(--text,#f4f4f5)] flex items-center gap-2">
                <Sliders size={18} className="text-[var(--accent,#818cf8)]" />
                <span>Cấu hình hợp đồng Futures {selectedSym.symbol}</span>
              </h3>
              <button onClick={handleCloseEdit} className="text-[var(--text-3,#63636b)] hover:text-white">
                <X size={18} />
              </button>
            </div>

            {modalError && (
              <div
                data-testid="futures-symbol-error"
                className="p-3 rounded-lg bg-[var(--down,#f2475f)]/15 border border-[var(--down,#f2475f)]/30 text-xs text-[var(--down,#f2475f)] leading-relaxed"
              >
                {modalError}
              </div>
            )}

            {/* Old vs New comparison */}
            <div className="p-3 bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg text-xs space-y-2">
              <div className="font-semibold text-[var(--text-3,#63636b)] uppercase tracking-wider text-[10px]">
                So sánh thay đổi (Cũ → Mới):
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-2,#a1a1aa)]">Trạng thái:</span>
                <span className="font-mono">
                  {selectedSym.adminEnabled ? 'Đang mở' : 'Đã đóng'} →{' '}
                  <strong className={editEnabled ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}>
                    {editEnabled ? 'Đang mở' : 'Đã đóng'}
                  </strong>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-2,#a1a1aa)]">Đòn bẩy tối đa:</span>
                <span className="font-mono">
                  {selectedSym.maxLeverage}x → <strong className="text-[var(--accent,#818cf8)]">{editMaxLeverage}x</strong>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-2,#a1a1aa)]">Ký quỹ duy trì (MMR):</span>
                <span className="font-mono">
                  {dec(selectedSym.maintenanceMarginRate).mul(100).toString()}% →{' '}
                  <strong className={mmrInvalid ? 'text-[var(--down,#f2475f)]' : 'text-[var(--accent,#818cf8)]'}>
                    {!mmrInvalid && editMmr.trim() ? `${dec(editMmr.trim()).mul(100).toString()}%` : 'Không hợp lệ'}
                  </strong>
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmEdit} className="space-y-4">
              {/* Enabled toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)]">
                <div>
                  <div className="text-xs font-semibold text-[var(--text,#f4f4f5)]">Bật giao dịch hợp đồng</div>
                  <div className="text-[11px] text-[var(--text-2,#a1a1aa)]">Cho phép đặt lệnh và mở vị thế mới</div>
                </div>
                <input
                  type="checkbox"
                  checked={editEnabled}
                  onChange={(e) => setEditEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--line,#1d1e21)] text-[var(--accent,#818cf8)] focus:ring-[var(--accent,#818cf8)] bg-[var(--bg,#000000)]"
                />
              </div>

              {/* Max Leverage */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                  Đòn bẩy tối đa (1x - 20x)
                </label>
                <select
                  value={editMaxLeverage}
                  onChange={(e) => setEditMaxLeverage(Number(e.target.value))}
                  className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
                >
                  {[1, 2, 3, 5, 10, 15, 20].map((lev) => (
                    <option key={lev} value={lev}>{lev}x</option>
                  ))}
                </select>
              </div>

              {/* MMR */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                  Tỷ lệ ký quỹ duy trì MMR (0.001 - 0.1)
                </label>
                <input
                  type="text"
                  value={editMmr}
                  onChange={(e) => setEditMmr(e.target.value)}
                  placeholder="0.005"
                  className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] font-mono outline-none focus:border-[var(--accent,#818cf8)]"
                />
                {mmrInvalid && (
                  <p className="text-[11px] text-[var(--down,#f2475f)]">MMR phải là số thập phân từ 0.001 đến 0.1</p>
                )}
              </div>

              {/* Reason */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                  Lý do thay đổi (bắt buộc audit, tối thiểu 5 ký tự)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Nhập lý do thay đổi cấu hình hợp đồng..."
                  rows={2}
                  className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-[var(--line,#1d1e21)]">
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  className="px-4 py-2 rounded-lg border border-[var(--line,#1d1e21)] text-xs text-[var(--text-2,#a1a1aa)] hover:bg-[var(--line,#1d1e21)] transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="px-4 py-2 rounded-lg bg-[var(--accent,#818cf8)] hover:brightness-110 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang lưu...' : 'Lưu cấu hình'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
