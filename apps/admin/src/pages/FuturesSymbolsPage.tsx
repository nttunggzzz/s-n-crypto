import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { appLinks, type AdminFuturesSymbol } from '@cex/contracts';
import { ExternalLink, Edit2, ShieldAlert } from 'lucide-react';

export const FuturesSymbolsPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const [symbols, setSymbols] = useState<AdminFuturesSymbol[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Edit modal
  const [selectedSym, setSelectedSym] = useState<AdminFuturesSymbol | null>(null);
  const [editEnabled, setEditEnabled] = useState(true);
  const [editMaxLeverage, setEditMaxLeverage] = useState(20);
  const [editMmr, setEditMmr] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const api = getApiClient();
  const exchangeOrigin = import.meta.env.VITE_EXCHANGE_ORIGIN;
  const canConfigure = hasPerm('exchange.configure');

  const loadSymbols = () => {
    setIsLoading(true);
    api.adminFuturesSymbols()
      .then((res) => setSymbols(res.items))
      .catch(() => {})
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
    setConfirmOpen(true);
  };

  const handleConfirmEdit = async (reason: string) => {
    if (!selectedSym) return;
    setIsSubmitting(true);
    try {
      const body: any = { reason };
      if (editEnabled !== selectedSym.adminEnabled) body.enabled = editEnabled;
      if (editMaxLeverage !== selectedSym.maxLeverage) body.maxLeverage = editMaxLeverage;
      if (editMmr !== selectedSym.maintenanceMarginRate) body.maintenanceMarginRate = editMmr;

      await api.adminUpdateFuturesSymbol({
        params: { symbol: selectedSym.symbol },
        body,
      });
      setConfirmOpen(false);
      loadSymbols();
    } catch (e) {
      console.error(e);
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
                <td className="px-5 py-3 font-mono text-xs text-[var(--text-2,#a1a1aa)]">{(parseFloat(s.maintenanceMarginRate) * 100).toFixed(2)}%</td>
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
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-[var(--text-3,#63636b)]">
                  Không tìm thấy hợp đồng nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit futures modal */}
      {selectedSym && (
        <ConfirmDialog
          isOpen={confirmOpen}
          title={`Cấu hình hợp đồng Futures ${selectedSym.symbol}`}
          consequenceText={`Thay đổi đòn bẩy và ký quỹ duy trì sẽ ảnh hưởng đến các lệnh đặt mới trên hợp đồng ${selectedSym.symbol}.`}
          onConfirm={handleConfirmEdit}
          onCancel={() => setConfirmOpen(false)}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
};
