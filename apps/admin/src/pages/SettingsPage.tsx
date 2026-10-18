import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatApiError } from '../services/errors';
import type { ExchangeSettings } from '@cex/contracts';
import { dec } from '@cex/core';
import { Settings, Save, AlertCircle } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const [settings, setSettings] = useState<ExchangeSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [changesSummary, setChangesSummary] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
        // Convert fee rates to percentage precisely using dec (e.g. 0.00035 -> 0.035)
        setSpotFeePercent(dec(s.feeRate).mul(100).toString());
        setFuturesMakerPercent(dec(s.futures.makerFee).mul(100).toString());
        setFuturesTakerPercent(dec(s.futures.takerFee).mul(100).toString());
        setFuturesLiqPercent(dec(s.futures.liquidationFee).mul(100).toString());
        setFaucetAmount(s.faucet.amount);
        setFaucetCooldownHours(s.faucet.cooldownHours.toString());
        setFaucetLifetimeCap(s.faucet.lifetimeCap);
        setStaleThresholdMs(s.staleThresholdMs.toString());
        setFieldErrors({});
      })
      .catch((e) => setErrorMsg(formatApiError(e, 'Không thể tải cấu hình sàn')))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const validateForm = () => {
    if (!settings) return null;
    const errors: Record<string, string> = {};
    const diffs: string[] = [];
    const body: any = {};

    // Validate spotFeePercent
    const sFee = spotFeePercent.trim();
    if (!sFee) {
      errors.spotFee = 'Phí Spot không được để trống';
    } else if (!/^\d+(\.\d+)?$/.test(sFee)) {
      errors.spotFee = 'Phí Spot phải là số hợp lệ';
    } else {
      const d = dec(sFee);
      if (d.lt(0) || d.gt(1)) {
        errors.spotFee = 'Phí Spot phải từ 0% đến 1% (tương ứng 0 đến 0.01)';
      } else {
        const newFeeRate = d.div(100).toString();
        if (newFeeRate !== settings.feeRate) {
          body.feeRate = newFeeRate;
          diffs.push(`Phí Spot: ${dec(settings.feeRate).mul(100).toString()}% → ${sFee}%`);
        }
      }
    }

    // Validate futuresMakerPercent
    const fMaker = futuresMakerPercent.trim();
    if (!fMaker) {
      errors.futuresMaker = 'Phí Maker Futures không được để trống';
    } else if (!/^\d+(\.\d+)?$/.test(fMaker)) {
      errors.futuresMaker = 'Phí Maker Futures phải là số hợp lệ';
    } else {
      const d = dec(fMaker);
      if (d.lt(0) || d.gt(1)) {
        errors.futuresMaker = 'Phí Maker Futures phải từ 0% đến 1%';
      } else {
        const newMaker = d.div(100).toString();
        if (newMaker !== settings.futures.makerFee) {
          body.futuresMakerFee = newMaker;
          diffs.push(`Phí Maker Futures: ${dec(settings.futures.makerFee).mul(100).toString()}% → ${fMaker}%`);
        }
      }
    }

    // Validate futuresTakerPercent
    const fTaker = futuresTakerPercent.trim();
    if (!fTaker) {
      errors.futuresTaker = 'Phí Taker Futures không được để trống';
    } else if (!/^\d+(\.\d+)?$/.test(fTaker)) {
      errors.futuresTaker = 'Phí Taker Futures phải là số hợp lệ';
    } else {
      const d = dec(fTaker);
      if (d.lt(0) || d.gt(1)) {
        errors.futuresTaker = 'Phí Taker Futures phải từ 0% đến 1%';
      } else {
        const newTaker = d.div(100).toString();
        if (newTaker !== settings.futures.takerFee) {
          body.futuresTakerFee = newTaker;
          diffs.push(`Phí Taker Futures: ${dec(settings.futures.takerFee).mul(100).toString()}% → ${fTaker}%`);
        }
      }
    }

    // Validate futuresLiqPercent
    const fLiq = futuresLiqPercent.trim();
    if (!fLiq) {
      errors.futuresLiq = 'Phí Thanh lý không được để trống';
    } else if (!/^\d+(\.\d+)?$/.test(fLiq)) {
      errors.futuresLiq = 'Phí Thanh lý phải là số hợp lệ';
    } else {
      const d = dec(fLiq);
      if (d.lt(0) || d.gt(5)) {
        errors.futuresLiq = 'Phí Thanh lý phải từ 0% đến 5%';
      } else {
        const newLiq = d.div(100).toString();
        if (newLiq !== settings.futures.liquidationFee) {
          body.futuresLiquidationFee = newLiq;
          diffs.push(`Phí Thanh lý: ${dec(settings.futures.liquidationFee).mul(100).toString()}% → ${fLiq}%`);
        }
      }
    }

    // Faucet amount
    const fAmount = faucetAmount.trim();
    if (!fAmount || !/^\d+(\.\d+)?$/.test(fAmount) || dec(fAmount).lte(0)) {
      errors.faucetAmount = 'Số tiền Faucet phải là số lớn hơn 0';
    } else if (fAmount !== settings.faucet.amount) {
      body.faucetAmount = fAmount;
      diffs.push(`Số tiền Faucet: ${settings.faucet.amount} → ${fAmount} USDT`);
    }

    // Faucet cooldown
    const fCd = parseInt(faucetCooldownHours, 10);
    if (isNaN(fCd) || fCd < 0 || fCd > 24 * 30) {
      errors.faucetCooldown = 'Thời gian chờ phải từ 0 đến 720 giờ';
    } else if (fCd !== settings.faucet.cooldownHours) {
      body.faucetCooldownHours = fCd;
      diffs.push(`Thời gian chờ: ${settings.faucet.cooldownHours}h → ${fCd}h`);
    }

    // Faucet lifetime cap
    const fCap = faucetLifetimeCap.trim();
    if (!fCap || !/^\d+(\.\d+)?$/.test(fCap) || dec(fCap).lt(0)) {
      errors.faucetCap = 'Hạn mức trọn đời phải là số không âm';
    } else if (fCap !== settings.faucet.lifetimeCap) {
      body.faucetLifetimeCap = fCap;
      diffs.push(`Hạn mức trọn đời: ${settings.faucet.lifetimeCap} → ${fCap} USDT`);
    }

    // Stale threshold ms
    const staleMs = parseInt(staleThresholdMs, 10);
    if (isNaN(staleMs) || staleMs < 2000 || staleMs > 120000) {
      errors.staleMs = 'Ngưỡng trễ phải từ 2.000 ms đến 120.000 ms';
    } else if (staleMs !== settings.staleThresholdMs) {
      body.staleThresholdMs = staleMs;
      diffs.push(`Ngưỡng trễ: ${settings.staleThresholdMs}ms → ${staleMs}ms`);
    }

    return { errors, diffs, body };
  };

  const handleSaveClick = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setConfirmError(null);

    const res = validateForm();
    if (!res) return;
    setFieldErrors(res.errors);
    if (Object.keys(res.errors).length > 0) {
      return;
    }
    if (res.diffs.length === 0) {
      setErrorMsg('Bạn chưa thay đổi thông số nào so với cấu hình hiện tại.');
      return;
    }
    setChangesSummary(res.diffs.join('; '));
    setConfirmOpen(true);
  };

  const handleConfirmSave = async (reason: string) => {
    if (!settings) return;
    const res = validateForm();
    if (!res || Object.keys(res.errors).length > 0 || res.diffs.length === 0) return;

    setIsSubmitting(true);
    setConfirmError(null);

    try {
      const body: any = { ...res.body, reason };
      await api.adminUpdateSettings({ body });
      setSuccessMsg('Đã cập nhật cấu hình sàn giao dịch thành công!');
      setConfirmOpen(false);
      loadSettings();
    } catch (err: any) {
      setConfirmError(formatApiError(err, 'Lỗi khi cập nhật cấu hình.'));
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
            Thiết lập biểu phí Spot/Futures, vòi nạp Faucet và ngưỡng độ trễ dữ liệu thị trường
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
          <div className="flex items-center gap-2">
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
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
                type="text"
                disabled={!canConfigure}
                value={spotFeePercent}
                onChange={(e) => {
                  setSpotFeePercent(e.target.value);
                  setFieldErrors((prev) => { const n = { ...prev }; delete n.spotFee; return n; });
                }}
                className={`w-full bg-[var(--bg,#000000)] border ${fieldErrors.spotFee ? 'border-[var(--down,#f2475f)]' : 'border-[var(--line,#1d1e21)]'} rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono disabled:opacity-50`}
              />
              {fieldErrors.spotFee ? (
                <span className="text-[11px] text-[var(--down,#f2475f)] mt-1 block">{fieldErrors.spotFee}</span>
              ) : (
                <span className="text-[11px] text-[var(--text-3,#63636b)] mt-1 block">Ví dụ: 0.1% tương ứng 0.001</span>
              )}
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
                type="text"
                disabled={!canConfigure}
                value={futuresMakerPercent}
                onChange={(e) => {
                  setFuturesMakerPercent(e.target.value);
                  setFieldErrors((prev) => { const n = { ...prev }; delete n.futuresMaker; return n; });
                }}
                className={`w-full bg-[var(--bg,#000000)] border ${fieldErrors.futuresMaker ? 'border-[var(--down,#f2475f)]' : 'border-[var(--line,#1d1e21)]'} rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono disabled:opacity-50`}
              />
              {fieldErrors.futuresMaker && (
                <span className="text-[11px] text-[var(--down,#f2475f)] mt-1 block">{fieldErrors.futuresMaker}</span>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase block mb-1.5">
                Phí Taker (%)
              </label>
              <input
                type="text"
                disabled={!canConfigure}
                value={futuresTakerPercent}
                onChange={(e) => {
                  setFuturesTakerPercent(e.target.value);
                  setFieldErrors((prev) => { const n = { ...prev }; delete n.futuresTaker; return n; });
                }}
                className={`w-full bg-[var(--bg,#000000)] border ${fieldErrors.futuresTaker ? 'border-[var(--down,#f2475f)]' : 'border-[var(--line,#1d1e21)]'} rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono disabled:opacity-50`}
              />
              {fieldErrors.futuresTaker && (
                <span className="text-[11px] text-[var(--down,#f2475f)] mt-1 block">{fieldErrors.futuresTaker}</span>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase block mb-1.5">
                Phí Thanh lý (%)
              </label>
              <input
                type="text"
                disabled={!canConfigure}
                value={futuresLiqPercent}
                onChange={(e) => {
                  setFuturesLiqPercent(e.target.value);
                  setFieldErrors((prev) => { const n = { ...prev }; delete n.futuresLiq; return n; });
                }}
                className={`w-full bg-[var(--bg,#000000)] border ${fieldErrors.futuresLiq ? 'border-[var(--down,#f2475f)]' : 'border-[var(--line,#1d1e21)]'} rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono disabled:opacity-50`}
              />
              {fieldErrors.futuresLiq && (
                <span className="text-[11px] text-[var(--down,#f2475f)] mt-1 block">{fieldErrors.futuresLiq}</span>
              )}
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
                type="text"
                disabled={!canConfigure}
                value={faucetAmount}
                onChange={(e) => {
                  setFaucetAmount(e.target.value);
                  setFieldErrors((prev) => { const n = { ...prev }; delete n.faucetAmount; return n; });
                }}
                className={`w-full bg-[var(--bg,#000000)] border ${fieldErrors.faucetAmount ? 'border-[var(--down,#f2475f)]' : 'border-[var(--line,#1d1e21)]'} rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono disabled:opacity-50`}
              />
              {fieldErrors.faucetAmount && (
                <span className="text-[11px] text-[var(--down,#f2475f)] mt-1 block">{fieldErrors.faucetAmount}</span>
              )}
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
                onChange={(e) => {
                  setFaucetCooldownHours(e.target.value);
                  setFieldErrors((prev) => { const n = { ...prev }; delete n.faucetCooldown; return n; });
                }}
                className={`w-full bg-[var(--bg,#000000)] border ${fieldErrors.faucetCooldown ? 'border-[var(--down,#f2475f)]' : 'border-[var(--line,#1d1e21)]'} rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono disabled:opacity-50`}
              />
              {fieldErrors.faucetCooldown ? (
                <span className="text-[11px] text-[var(--down,#f2475f)] mt-1 block">{fieldErrors.faucetCooldown}</span>
              ) : (
                <span className="text-[11px] text-[var(--text-3,#63636b)] mt-1 block">
                  Đặt 0 để nạp liên tục khi thử nghiệm
                </span>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase block mb-1.5">
                Hạn mức tối đa trọn đời (USDT)
              </label>
              <input
                type="text"
                disabled={!canConfigure}
                value={faucetLifetimeCap}
                onChange={(e) => {
                  setFaucetLifetimeCap(e.target.value);
                  setFieldErrors((prev) => { const n = { ...prev }; delete n.faucetCap; return n; });
                }}
                className={`w-full bg-[var(--bg,#000000)] border ${fieldErrors.faucetCap ? 'border-[var(--down,#f2475f)]' : 'border-[var(--line,#1d1e21)]'} rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono disabled:opacity-50`}
              />
              {fieldErrors.faucetCap && (
                <span className="text-[11px] text-[var(--down,#f2475f)] mt-1 block">{fieldErrors.faucetCap}</span>
              )}
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
              onChange={(e) => {
                setStaleThresholdMs(e.target.value);
                setFieldErrors((prev) => { const n = { ...prev }; delete n.staleMs; return n; });
              }}
              className={`w-full bg-[var(--bg,#000000)] border ${fieldErrors.staleMs ? 'border-[var(--down,#f2475f)]' : 'border-[var(--line,#1d1e21)]'} rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono disabled:opacity-50`}
            />
            {fieldErrors.staleMs ? (
              <span className="text-[11px] text-[var(--down,#f2475f)] mt-1 block">{fieldErrors.staleMs}</span>
            ) : (
              <span className="text-[11px] text-[var(--text-3,#63636b)] mt-1 block">Từ 2.000 ms đến 120.000 ms</span>
            )}
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
        consequenceText={`Các thay đổi (${changesSummary}) sẽ có hiệu lực ngay lập tức với toàn bộ người dùng.`}
        onConfirm={handleConfirmSave}
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmError(null);
        }}
        isSubmitting={isSubmitting}
        error={confirmError}
      />
    </div>
  );
};
