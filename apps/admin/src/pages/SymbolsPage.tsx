import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatApiError } from '../services/errors';
import { appLinks, type AdminSymbol } from '@cex/contracts';
import { PlusCircle, Search, ExternalLink, Power } from 'lucide-react';

export const SymbolsPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const [symbols, setSymbols] = useState<AdminSymbol[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Edit symbol dialog
  const [targetSymbol, setTargetSymbol] = useState<AdminSymbol | null>(null);
  const [newEnabled, setNewEnabled] = useState(false);
  const [cancelOpenOrders, setCancelOpenOrders] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const api = getApiClient();
  const exchangeOrigin = import.meta.env.VITE_EXCHANGE_ORIGIN;
  const canConfigure = hasPerm('exchange.configure');

  const loadSymbols = () => {
    setIsLoading(true);
    api.adminListSymbols()
      .then((res) => setSymbols(res.items))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadSymbols();
  }, []);

  const handleToggleClick = (sym: AdminSymbol) => {
    setTargetSymbol(sym);
    setNewEnabled(!sym.adminEnabled);
    setCancelOpenOrders(sym.adminEnabled); // Default cancel orders if we are disabling it
    setConfirmError(null);
    setConfirmOpen(true);
  };

  const handleConfirmToggle = async (reason: string) => {
    if (!targetSymbol) return;
    setIsSubmitting(true);
    setConfirmError(null);
    try {
      await api.adminUpdateSymbol({
        params: { symbol: targetSymbol.symbol },
        body: {
          enabled: newEnabled,
          cancelOpenOrders: newEnabled ? false : cancelOpenOrders,
          reason,
        },
      });
      setConfirmOpen(false);
      setConfirmError(null);
      loadSymbols();
    } catch (e) {
      setConfirmError(formatApiError(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredSymbols = symbols.filter(
    (s) =>
      s.symbol.toLowerCase().includes(query.toLowerCase()) ||
      s.baseAsset.toLowerCase().includes(query.toLowerCase()) ||
      s.quoteAsset.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">Quản lý cặp giao dịch Spot</h1>
          <p className="text-sm text-[var(--text-2,#a1a1aa)] mt-1">
            Bật/tắt trạng thái niêm yết và giao dịch của các cặp tài sản trên thị trường Spot
          </p>
        </div>

        {/* Mục 3 CHỜ BACKEND: Nút Thêm coin */}
        <button
          disabled
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--line,#1d1e21)]/40 border border-[var(--line,#1d1e21)] text-xs text-[var(--text-3,#63636b)] cursor-not-allowed"
          title="Chờ backend hỗ trợ API chọn từ Binance để niêm yết coin mới"
        >
          <PlusCircle size={14} />
          <span>Thêm coin</span>
          <span className="text-[10px] px-1 py-0.2 bg-[var(--line,#1d1e21)] rounded text-[var(--text-3,#63636b)]">Sắp có</span>
        </button>
      </div>

      {/* Search */}
      <div className="max-w-md">
        <input
          type="text"
          placeholder="Tìm theo mã cặp hoặc coin (BTC, ETH, USDT)..."
          className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3.5 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow-lg">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase">
            <tr>
              <th className="px-5 py-3">Cặp giao dịch</th>
              <th className="px-5 py-3">Nguồn Binance</th>
              <th className="px-5 py-3">Lệnh đang mở</th>
              <th className="px-5 py-3">Độ bước giá</th>
              <th className="px-5 py-3">Khối lượng tối thiểu</th>
              <th className="px-5 py-3">Trạng thái Admin</th>
              {canConfigure && <th className="px-5 py-3 text-right">Thao tác</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line,#1d1e21)]">
            {filteredSymbols.map((s) => (
              <tr key={s.symbol} className="hover:bg-[var(--line,#1d1e21)]/15">
                <td className="px-5 py-3 font-bold font-mono">
                  <a
                    href={appLinks.exchange.trade(s.symbol, exchangeOrigin)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent,#818cf8)] hover:underline inline-flex items-center gap-1.5"
                  >
                    {s.symbol} <ExternalLink size={12} />
                  </a>
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    s.sourceStatus === 'TRADING' ? 'text-[var(--up,#1fc27a)] bg-[var(--up,#1fc27a)]/10' : 'text-amber-400 bg-amber-950/40'
                  }`}>
                    {s.sourceStatus}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono">{s.openOrders}</td>
                <td className="px-5 py-3 font-mono text-xs text-[var(--text-2,#a1a1aa)]">{s.tickSize}</td>
                <td className="px-5 py-3 font-mono text-xs text-[var(--text-2,#a1a1aa)]">{s.minQty} {s.baseAsset}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                    s.adminEnabled
                      ? 'bg-[var(--up,#1fc27a)]/15 text-[var(--up,#1fc27a)]'
                      : 'bg-[var(--down,#f2475f)]/15 text-[var(--down,#f2475f)]'
                  }`}>
                    {s.adminEnabled ? 'Đang mở' : 'Đã đóng'}
                  </span>
                </td>
                {canConfigure && (
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleToggleClick(s)}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors border ${
                        s.adminEnabled
                          ? 'bg-[var(--down,#f2475f)]/10 text-[var(--down,#f2475f)] border-[var(--down,#f2475f)]/30 hover:bg-[var(--down,#f2475f)]/20'
                          : 'bg-[var(--up,#1fc27a)]/10 text-[var(--up,#1fc27a)] border-[var(--up,#1fc27a)]/30 hover:bg-[var(--up,#1fc27a)]/20'
                      }`}
                    >
                      {s.adminEnabled ? 'Tắt cặp' : 'Bật cặp'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!isLoading && filteredSymbols.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-[var(--text-3,#63636b)]">
                  Không tìm thấy cặp giao dịch nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={newEnabled ? `Bật giao dịch cặp ${targetSymbol?.symbol}` : `Tắt giao dịch cặp ${targetSymbol?.symbol}`}
        consequenceText={
          newEnabled
            ? `Cặp ${targetSymbol?.symbol} sẽ mở lại cho người dùng đặt lệnh.`
            : `Cặp ${targetSymbol?.symbol} sẽ bị đóng giao dịch ngay lập tức.${
                cancelOpenOrders ? ' Tất cả các lệnh đang mở trên cặp này sẽ bị hủy tự động.' : ''
              }`
        }
        onConfirm={handleConfirmToggle}
        onCancel={() => { setConfirmOpen(false); setConfirmError(null); }}
        isSubmitting={isSubmitting}
        error={confirmError}
      />
    </div>
  );
};
