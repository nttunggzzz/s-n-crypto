import React, { useState, useEffect, useCallback } from 'react';
import type { PriceAlert } from '@cex/contracts';
import { ApiError } from '@cex/contracts';

export type PriceAlertCondition = 'ABOVE' | 'BELOW';
import { getApiClient } from '../services/api.ts';
import { getErrorMessage } from '../services/errors.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useMarket } from '../context/MarketContext.tsx';
import {
  Modal,
  Button,
  DecimalInput,
  Badge,
  useToast,
  formatDecimal,
  EmptyState,
  Skeleton,
} from '@cex/ui';
import { Bell, Trash2, ArrowUpRight, ArrowDownRight, Plus } from 'lucide-react';

export interface PriceAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSymbol?: string;
  defaultPrice?: string;
}

export const PriceAlertModal: React.FC<PriceAlertModalProps> = ({
  isOpen,
  onClose,
  defaultSymbol,
  defaultPrice,
}) => {
  const { isAuthenticated } = useAuth();
  const { symbols, activeTicker } = useMarket();
  const { success, error: toastError } = useToast();
  const api = getApiClient();

  const [symbol, setSymbol] = useState(defaultSymbol || 'BTCUSDT');
  const [condition, setCondition] = useState<PriceAlertCondition>('ABOVE');
  const [targetPrice, setTargetPrice] = useState(defaultPrice || '');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (defaultSymbol) setSymbol(defaultSymbol);
    if (defaultPrice) setTargetPrice(defaultPrice);
  }, [defaultSymbol, defaultPrice]);

  const fetchAlerts = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await api.listAlerts();
      setAlerts(res.items);
    } catch {}
    finally {
      setLoading(false);
    }
  }, [api, isAuthenticated]);

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      fetchAlerts();
    }
  }, [isOpen, fetchAlerts, isAuthenticated]);

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPrice) return;

    setSubmitting(true);
    try {
      const newAlert = await api.createAlert({
        body: {
          symbol,
          condition,
          targetPrice,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      success(`Tạo cảnh báo giá ${symbol} thành công!`);
      setAlerts((prev) => [newAlert, ...prev]);
      setTargetPrice('');
      setNote('');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'INVALID_PRICE') {
          toastError('Mức giá này đã được thị trường chạm tới hoặc không hợp lệ.');
        } else if (err.code === 'LIMIT_EXCEEDED') {
          toastError('Bạn đã đạt giới hạn tối đa 50 cảnh báo giá.');
        } else {
          toastError(getErrorMessage(err.code));
        }
      } else {
        toastError('Không thể tạo cảnh báo giá.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    setDeletingId(alertId);
    try {
      await api.deleteAlert({ params: { alertId } });
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      success('Đã xóa cảnh báo giá.');
    } catch {
      toastError('Không thể xóa cảnh báo này.');
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-[var(--accent,#818cf8)]" />
          <span>Cảnh báo giá thời gian thực</span>
        </div>
      }
      maxWidth="lg"
    >
      <div className="p-5 flex flex-col md:flex-row gap-6 max-h-[80vh] overflow-y-auto text-xs">
        {/* Left: Create Form */}
        <div className="w-full md:w-1/2 flex flex-col gap-4 border-b md:border-b-0 md:border-r border-[var(--line,#1d1e21)] pb-6 md:pb-0 md:pr-6">
          <h4 className="font-bold text-sm text-[var(--text,#f4f4f5)]">Tạo cảnh báo mới</h4>

          <form onSubmit={handleCreateAlert} className="flex flex-col gap-3">
            {/* Symbol Select */}
            <div>
              <label className="text-[11px] text-[var(--text-3,#63636b)] mb-1 block">Cặp giao dịch</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-md,8px)] px-3 py-2 text-white font-semibold"
              >
                {symbols.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.symbol} ({s.baseAsset}/{s.quoteAsset})
                  </option>
                ))}
              </select>
            </div>

            {/* Condition: Above / Below */}
            <div>
              <label className="text-[11px] text-[var(--text-3,#63636b)] mb-1 block">Điều kiện kích hoạt</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCondition('ABOVE')}
                  className={`py-2 px-3 rounded-[var(--radius-md,8px)] border flex items-center justify-center gap-1.5 font-bold transition-colors cursor-pointer ${
                    condition === 'ABOVE'
                      ? 'bg-[var(--up,#1fc27a)]/10 border-[var(--up,#1fc27a)] text-[var(--up,#1fc27a)]'
                      : 'border-[var(--line,#1d1e21)] text-[var(--text-3,#63636b)] hover:text-white'
                  }`}
                >
                  <ArrowUpRight size={14} />
                  <span>Giá tăng lên &ge;</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCondition('BELOW')}
                  className={`py-2 px-3 rounded-[var(--radius-md,8px)] border flex items-center justify-center gap-1.5 font-bold transition-colors cursor-pointer ${
                    condition === 'BELOW'
                      ? 'bg-[var(--down,#f2475f)]/10 border-[var(--down,#f2475f)] text-[var(--down,#f2475f)]'
                      : 'border-[var(--line,#1d1e21)] text-[var(--text-3,#63636b)] hover:text-white'
                  }`}
                >
                  <ArrowDownRight size={14} />
                  <span>Giá giảm xuống &le;</span>
                </button>
              </div>
            </div>

            {/* Target Price */}
            <DecimalInput
              label="Mức giá mục tiêu"
              value={targetPrice}
              onValueChange={setTargetPrice}
              unit="USDT"
              placeholder={activeTicker?.lastPrice || '0.00'}
            />

            {/* Note */}
            <div>
              <label className="text-[11px] text-[var(--text-3,#63636b)] mb-1 block">Ghi chú (Tùy chọn, tối đa 140 ký tự)</label>
              <input
                type="text"
                maxLength={140}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: Chốt lời một phần..."
                className="w-full bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-md,8px)] px-3 py-2 text-white"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              fullWidth
              className="mt-2 flex items-center justify-center gap-1.5"
            >
              <Plus size={16} />
              <span>Tạo cảnh báo</span>
            </Button>
          </form>
        </div>

        {/* Right: Existing Alerts List */}
        <div className="w-full md:w-1/2 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm text-[var(--text,#f4f4f5)]">Danh sách cảnh báo</h4>
            <span className="text-[11px] text-[var(--text-3,#63636b)]">{alerts.length} / 50</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[380px]">
            {loading && alerts.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} height={52} className="w-full" />
                ))}
              </div>
            ) : alerts.length === 0 ? (
              <div className="py-12 text-center text-[var(--text-3,#63636b)]">
                Bạn chưa thiết lập cảnh báo giá nào.
              </div>
            ) : (
              alerts.map((alt) => {
                const isAbove = alt.condition === 'ABOVE';
                const isTriggered = alt.status === 'TRIGGERED';
                return (
                  <div
                    key={alt.id}
                    className="p-3 rounded-[var(--radius-md,8px)] border border-[var(--line,#1d1e21)] bg-[var(--panel-2,#141416)] flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{alt.symbol}</span>
                        <Badge
                          variant={isTriggered ? 'secondary' : isAbove ? 'success' : 'warning'}
                          size="sm"
                          className="text-[10px]"
                        >
                          {isAbove ? '≥' : '≤'} {formatDecimal(alt.targetPrice)} USDT
                        </Badge>
                        {isTriggered && (
                          <Badge variant="outline" size="sm" className="text-[10px] text-[var(--text-3,#63636b)] border-[var(--line,#1d1e21)]">
                            Đã kích hoạt
                          </Badge>
                        )}
                      </div>
                      {alt.note && (
                        <p className="text-[11px] text-[var(--text-3,#63636b)] mt-1 truncate max-w-[200px]">
                          {alt.note}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => handleDeleteAlert(alt.id)}
                      disabled={deletingId === alt.id}
                      className="text-[var(--text-3,#63636b)] hover:text-[var(--down,#f2475f)] p-1.5 rounded hover:bg-[var(--line,#1d1e21)] cursor-pointer transition-colors"
                      title="Xóa cảnh báo"
                      aria-label="Xóa cảnh báo"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
