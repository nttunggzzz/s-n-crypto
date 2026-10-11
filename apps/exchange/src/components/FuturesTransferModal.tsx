import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api.ts';
import { ApiError } from '@cex/contracts';
import { getErrorMessage } from '../services/errors.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { Modal, Button, DecimalInput, useToast, formatDecimal } from '@cex/ui';
import { ArrowLeftRight } from 'lucide-react';
import { dec, roundDown } from '@cex/core';

export interface FuturesTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTransferred?: () => void;
}

export const FuturesTransferModal: React.FC<FuturesTransferModalProps> = ({
  isOpen,
  onClose,
  onTransferred,
}) => {
  const { isAuthenticated } = useAuth();
  const { success, error: toastError } = useToast();
  const api = getApiClient();

  const [direction, setDirection] = useState<'SPOT_TO_FUTURES' | 'FUTURES_TO_SPOT'>('SPOT_TO_FUTURES');
  const [amount, setAmount] = useState('');
  const [spotBalance, setSpotBalance] = useState('0');
  const [futuresBalance, setFuturesBalance] = useState('0');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  // Fetch both balances
  const fetchBalances = async () => {
    if (!isAuthenticated) return;
    setFetching(true);
    try {
      const [spot, fut] = await Promise.all([
        api.balances(),
        api.futuresAccount().catch(() => null),
      ]);
      const usdtSpot = spot.items.find((b) => b.asset === 'USDT')?.available || '0';
      setSpotBalance(usdtSpot);
      setFuturesBalance(fut?.available || '0');
    } catch {}
    finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      if (isAuthenticated) {
        fetchBalances();
      }
    }
  }, [isOpen]);

  const maxAvailable = direction === 'SPOT_TO_FUTURES' ? spotBalance : futuresBalance;

  const handleSwapDirection = () => {
    setDirection((d) => (d === 'SPOT_TO_FUTURES' ? 'FUTURES_TO_SPOT' : 'SPOT_TO_FUTURES'));
    setAmount('');
  };

  const handleMaxClick = () => {
    try {
      const val = dec(maxAvailable);
      if (val.gt(0)) {
        setAmount(roundDown(val, 2).toString());
      }
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;

    setLoading(true);
    try {
      await api.futuresTransfer({
        body: {
          direction,
          amount,
        },
      });
      success(
        direction === 'SPOT_TO_FUTURES'
          ? `Đã chuyển ${amount} USDT vào Ví Futures!`
          : `Đã rút ${amount} USDT về Ví Spot!`
      );
      onTransferred?.();
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError(getErrorMessage(err.code));
      } else {
        toastError('Không thể thực hiện chuyển tiền.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Chuyển tiền giữa các ví"
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4 text-xs">
        {/* Source -> Destination Boxes */}
        <div className="flex flex-col gap-2 p-3 rounded-[var(--radius-md,8px)] bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] relative">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[var(--text-3,#63636b)]">Từ:</span>
            <span className="font-bold text-white">
              {direction === 'SPOT_TO_FUTURES' ? 'Ví Giao ngay (Spot)' : 'Ví Hợp đồng (Futures)'}
            </span>
          </div>

          <div className="flex items-center justify-center my-0.5">
            <button
              type="button"
              onClick={handleSwapDirection}
              className="p-1.5 rounded-full bg-[var(--line,#1d1e21)] hover:bg-[var(--accent,#818cf8)] text-white hover:text-black transition-colors cursor-pointer"
              title="Đổi chiều chuyển tiền"
              aria-label="Đổi chiều chuyển tiền"
            >
              <ArrowLeftRight size={14} />
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[var(--text-3,#63636b)]">Đến:</span>
            <span className="font-bold text-white">
              {direction === 'SPOT_TO_FUTURES' ? 'Ví Hợp đồng (Futures)' : 'Ví Giao ngay (Spot)'}
            </span>
          </div>
        </div>

        {/* Available balance indicator */}
        <div className="flex items-center justify-between text-[11px] text-[var(--text-2,#a1a1aa)]">
          <span>Số dư khả dụng:</span>
          <span className="font-mono text-white font-semibold">
            {fetching ? '...' : `${formatDecimal(maxAvailable, { decimals: 2 })} USDT`}
          </span>
        </div>

        {/* Amount Input with MAX button */}
        <div className="relative">
          <DecimalInput
            data-testid="transfer-amount"
            label="Số tiền chuyển"
            value={amount}
            onValueChange={setAmount}
            maxDecimals={2}
            unit="USDT"
            placeholder="0.00"
          />
          <button
            type="button"
            onClick={handleMaxClick}
            className="absolute right-14 top-7 text-[10px] font-bold text-[var(--accent,#818cf8)] hover:underline cursor-pointer"
          >
            Tối đa
          </button>
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-[var(--line,#1d1e21)]">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button
            data-testid="transfer-submit"
            type="submit"
            variant="primary"
            loading={loading}
            disabled={!amount || parseFloat(amount) <= 0}
          >
            Xác nhận
          </Button>
        </div>
      </form>
    </Modal>
  );
};
