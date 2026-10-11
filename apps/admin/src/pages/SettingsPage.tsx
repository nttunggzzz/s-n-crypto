import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { ExchangeSettings } from '@cex/contracts';
import { Settings, Save, AlertCircle, ToggleLeft } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const [settings, setSettings] = useState<ExchangeSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states (% representation for fees)
  const [spotFeePercent, setSpotFeePercent] = useState('');
  const [futuresMakerPercent, setFuturesMakerPercent] = useState('');
  const [futuresTakerPercent, setFuturesTakerPercent] = useState('');
  const [futuresLiqPercent, setFuturesLiqPercent] = useState('');
  const [faucetAmount, setFaucetAmount] = useState('');
  const [faucetCooldownHours, setFaucetCooldownHours] = useState('');
  const [faucetLifetimeCap, setFaucetLifetimeCap] = useState('');
  const [staleThresholdMs, setStaleThresholdMs] = useState('');

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const api = getApiClient();

  const loadSettings = () => {
    setIsLoading(true);
    api.adminGetSettings()
      .then((s) => {
        setSettings(s);
        // Convert fee rates to percentage (e.g. 0.001 -> 0.1)
        setSpotFeePercent((parseFloat(s.feeRate) * 100).toString());
        setFuturesMakerPercent((parseFloat(s.futures.makerFee) * 100).toString());
        setFuturesTakerPercent((parseFloat(s.futures.takerFee) * 100).toString());
        setFuturesLiqPercent((parseFloat(s.futures.liquidationFee) * 100).toString());
        setFaucetAmount(s.faucet.amount);
        setFaucetCooldownHours(s.faucet.cooldownHours.toString());
        setFaucetLifetimeCap(s.faucet.lifetimeCap);
        setStaleThresholdMs(s.staleThresholdMs.toString());
      })
      .catch((e) => setErrorMsg(e?.message || 'Không thể tải cấu hình sàn'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSaveClick = (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmOpen(true);
  };

  const handleConfirmSave = async (reason: string) => {
    if (!settings) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const body: any = { reason };

      // Calculate changes
      const newSpotFee = (parseFloat(spotFeePercent) / 100).toFixed(6).replace(/\.?0+$/, '');
      if (newSpotFee !== settings.feeRate) body.feeRate = newSpotFee;

      const newMaker = (parseFloat(futuresMakerPercent) / 100).toFixed(6).replace(/\.?0+$/, '');
      if (newMaker !== settings.futures.makerFee) body.futuresMakerFee = newMaker;

      const newTaker = (parseFloat(futuresTakerPercent) / 100).toFixed(6).replace(/\.?0+$/, '');
      if (newTaker !== settings.futures.takerFee) body.futuresTakerFee = newTaker;

      const newLiq = (parseFloat(futuresLiqPercent) / 100).toFixed(6).replace(/\.?0+$/, '');
      if (newLiq !== settings.futures.liquidationFee) body.futuresLiquidationFee = newLiq;

      if (faucetAmount !== settings.faucet.amount) body.faucetAmount = faucetAmount;
      if (parseInt(faucetCooldownHours, 10) !== settings.faucet.cooldownHours) {
        body.faucetCooldownHours = parseInt(faucetCooldownHours, 10);
      }
      if (faucetLifetimeCap !== settings.faucet.lifetimeCap) body.faucetLifetimeCap = faucetLifetimeCap;
      if (parseInt(staleThresholdMs, 10) !== settings.staleThresholdMs) {
        body.staleThresholdMs = parseInt(staleThresholdMs, 10);
      }

      await api.adminUpdateSettings({ body });
      setSuccessMsg('Đã cập nhật cấu hình sàn giao dịch thành công!');
      setConfirmOpen(false);
      loadSettings();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Lỗi khi cập nhật cấu hình.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-[var(--text-2,#a1a1aa)]">Đang tải cấu hình sàn...</div>;
  }

  const canConfigure = hasPerm('exchange.configure');

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">Cấu hình thông số sàn</h1>
          <p className="text-sm text-[var(--text-2,#a1a1aa)] mt-1">
            Điều chỉnh biểu phí, định mức vòi nạp thử nghiệm Faucet và kiểm soát độ trễ dữ liệu
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-[var(--up,#1fc27a)]/10 border border-[var(--up,#1fc27a)]/20 text-sm text-[var(--up,#1fc27a)] flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="font-bold">×</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-[var(--down,#f2475f)]/10 border border-[var(--down,#f2475f)]/20 text-sm text-[var(--down,#f2475f)] flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-bold">×</button>
        </div>
      )}

      <form onSubmit={handleSaveClick} className="space-y-6">
        {/* Phí giao dịch Spot */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-5 shadow">
          <h2 className="text-base font-bold text-[var(--text,#f4f4f5)] mb-4">Biểu phí giao dịch Spot</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase block mb-1.5">
                Phí giao dịch Spot (%)
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                max="1"
                disabled={!canConfigure}
                value={spotFeePercent}
                onChange={(e) => setSpotFeePercent(e.target.value)}
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono disabled:opacity-50"
              />
              <span className="text-[11px] text-[var(--text-3,#63636b)] mt-1 block">Ví dụ: 0.1% tương ứng 0.001</span>
            </div>
          </div>
        </div>

        {/* Phí giao dịch Futures */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-5 shadow">
          <h2 className="text-base font-bold text-[var(--text,#f4f4f5)] mb-4">Biểu phí hợp đồng Futures</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase block mb-1.5">
                Phí Maker (%)
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                max="1"
                disabled={!canConfigure}
                value={futuresMakerPercent}
                onChange={(e) => setFuturesMakerPercent(e.target.value)}
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase block mb-1.5">
                Phí Taker (%)
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                max="1"
                disabled={!canConfigure}
                value={futuresTakerPercent}
                onChange={(e) => setFuturesTakerPercent(e.target.value)}
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase block mb-1.5">
                Phí Thanh lý (%)
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                max="5"
                disabled={!canConfigure}
                value={futuresLiqPercent}
                onChange={(e) => setFuturesLiqPercent(e.target.value)}
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* Nạp tiền ảo Faucet */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-5 shadow">
          <h2 className="text-base font-bold text-[var(--text,#f4f4f5)] mb-4">Định mức Faucet (Nạp thử nghiệm)</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase block mb-1.5">
                Số tiền mỗi lần nhận (USDT)
              </label>
              <input
                type="number"
                disabled={!canConfigure}
                value={faucetAmount}
                onChange={(e) => setFaucetAmount(e.target.value)}
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase block mb-1.5">
                Thời gian chờ (Giờ)
              </label>
              <input
                type="number"
                min="0"
                disabled={!canConfigure}
                value={faucetCooldownHours}
                onChange={(e) => setFaucetCooldownHours(e.target.value)}
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase block mb-1.5">
                Hạn mức tối đa trọn đời (USDT)
              </label>
              <input
                type="number"
                disabled={!canConfigure}
                value={faucetLifetimeCap}
                onChange={(e) => setFaucetLifetimeCap(e.target.value)}
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* Ngưỡng giá cũ */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-5 shadow">
          <h2 className="text-base font-bold text-[var(--text,#f4f4f5)] mb-4">Độ trễ dữ liệu thị trường</h2>
          <div className="max-w-md">
            <label className="text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase block mb-1.5">
              Ngưỡng giá cũ / mất kết nối (mili-giây)
            </label>
            <input
              type="number"
              min="2000"
              max="120000"
              disabled={!canConfigure}
              value={staleThresholdMs}
              onChange={(e) => setStaleThresholdMs(e.target.value)}
              className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono disabled:opacity-50"
            />
            <span className="text-[11px] text-[var(--text-3,#63636b)] mt-1 block">Từ 2.000 ms đến 120.000 ms</span>
          </div>
        </div>

        {/* Mục 3 CHỜ BACKEND: Công tắc tính năng */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-5 shadow opacity-70">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-[var(--text,#f4f4f5)] flex items-center gap-2">
              <ToggleLeft size={18} className="text-[var(--text-3,#63636b)]" />
              <span>Công tắc tính năng toàn sàn</span>
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--line,#1d1e21)] text-[var(--text-3,#63636b)] font-semibold">
              Sắp có
            </span>
          </div>
          <p className="text-xs text-[var(--text-3,#63636b)] mb-4">
            Tính năng bật/tắt toàn sàn cho Hợp đồng Futures, Trading Bots, Vòi nạp Faucet đang chờ backend hoàn thiện API.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] flex items-center justify-between opacity-50">
              <span className="text-xs font-medium text-[var(--text-2,#a1a1aa)]">Giao dịch Futures</span>
              <span className="text-xs font-semibold text-[var(--up,#1fc27a)]">Đang mở</span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] flex items-center justify-between opacity-50">
              <span className="text-xs font-medium text-[var(--text-2,#a1a1aa)]">Trading Bots</span>
              <span className="text-xs font-semibold text-[var(--up,#1fc27a)]">Đang mở</span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] flex items-center justify-between opacity-50">
              <span className="text-xs font-medium text-[var(--text-2,#a1a1aa)]">Faucet Nạp ảo</span>
              <span className="text-xs font-semibold text-[var(--up,#1fc27a)]">Đang mở</span>
            </div>
          </div>
        </div>

        {canConfigure && (
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg bg-[var(--accent,#818cf8)] text-white text-sm font-semibold hover:brightness-110 flex items-center gap-2 shadow-lg transition-all"
            >
              <Save size={16} />
              <span>Lưu thay đổi cấu hình</span>
            </button>
          </div>
        )}
      </form>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Xác nhận cập nhật thông số sàn"
        consequenceText="Các thay đổi thông số biểu phí và hạn mức sẽ có hiệu lực ngay lập tức với toàn bộ người dùng."
        onConfirm={handleConfirmSave}
        onCancel={() => setConfirmOpen(false)}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};
