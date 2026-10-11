import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { AdminUserDetail } from '@cex/contracts';

interface AdjustModalState {
  open: boolean;
  asset: string;
  amount: string;
}

export const UserDetailPage: React.FC<{ userId: string; onNavigate: (path: string) => void }> = ({ userId, onNavigate }) => {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const { hasPerm } = useAuth();
  const api = getApiClient();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'LOCK' | 'UNLOCK' | 'RESET'>('LOCK');
  const [adjustModal, setAdjustModal] = useState<AdjustModalState>({ open: false, asset: 'USDT', amount: '' });

  const loadUser = () => {
    api.adminGetUser({ params: { userId } }).then(setDetail).catch(() => {});
  };

  useEffect(() => {
    loadUser();
  }, [userId]);

  if (!detail) return <div className="p-6 text-[var(--text-2,#a1a1aa)]">Đang tải...</div>;

  const u = detail.user;
  const isLocked = u.status === 'locked';

  const handleConfirm = async (reason: string) => {
    try {
      if (confirmAction === 'LOCK') {
        await api.adminLockUser({ params: { userId }, body: { reason } });
      } else if (confirmAction === 'UNLOCK') {
        await api.adminUnlockUser({ params: { userId }, body: { reason } });
      } else if (confirmAction === 'RESET') {
        await api.adminResetAccount({ params: { userId }, body: { reason, confirm: 'RESET' } });
      }
      loadUser();
    } catch (e) {
      console.error(e);
    } finally {
      setConfirmOpen(false);
    }
  };

  const handleAdjustConfirm = async (reason: string) => {
    try {
      await api.adminAdjustBalance({
        params: { userId },
        body: { asset: adjustModal.asset, amount: adjustModal.amount, reason },
      });
      setAdjustModal({ open: false, asset: 'USDT', amount: '' });
      loadUser();
    } catch (e) {
      console.error(e);
    }
  };

  // Compute preview of balance adjustment
  const currentBalance = detail.balances.find((b) => b.asset === adjustModal.asset);
  const currentAvailable = currentBalance ? parseFloat(currentBalance.available) : 0;
  const adjustAmt = parseFloat(adjustModal.amount) || 0;
  const afterBalance = (currentAvailable + adjustAmt).toFixed(8).replace(/\.?0+$/, '');

  return (
    <div className="p-6">
      <button
        onClick={() => onNavigate('/admin/users')}
        className="text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)] mb-4 flex items-center gap-1 text-sm"
      >
        ← Quay lại
      </button>

      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{u.email}</h1>
          <div className="text-[var(--text-2,#a1a1aa)] mt-1 text-sm">
            UID: {u.uid} · Tên: {u.name} · Vai trò: {u.role}
          </div>
          <div
            className="mt-2 text-sm font-medium"
            data-testid="admin-user-status"
            data-status={isLocked ? 'locked' : 'active'}
          >
            Trạng thái:{' '}
            <span className={isLocked ? 'text-[var(--down,#f2475f)]' : 'text-[var(--up,#1fc27a)]'}>
              {isLocked ? 'Đã khóa' : 'Hoạt động'}
            </span>
          </div>
          {u.isBot && (
            <div className="mt-1 text-xs text-[var(--text-3,#63636b)]">Tài khoản Bot (chỉ xem)</div>
          )}
        </div>

        {!u.isBot && (
          <div className="flex gap-2 flex-wrap">
            {hasPerm('balances.adjust') && (
              <button
                data-testid="admin-adjust-open"
                onClick={() => setAdjustModal({ open: true, asset: 'USDT', amount: '' })}
                className="px-3 py-1.5 rounded border border-[var(--line,#1d1e21)] text-[var(--text,#f4f4f5)] text-sm hover:bg-[var(--panel-2,#141416)]"
              >
                Điều chỉnh số dư
              </button>
            )}

            {hasPerm('users.lock') && (
              isLocked ? (
                <button
                  data-testid="admin-unlock-open"
                  onClick={() => { setConfirmAction('UNLOCK'); setConfirmOpen(true); }}
                  className="px-3 py-1.5 rounded bg-[var(--up,#1fc27a)]/10 border border-[var(--up,#1fc27a)]/30 text-[var(--up,#1fc27a)] text-sm hover:bg-[var(--up,#1fc27a)]/20"
                >
                  Mở khóa
                </button>
              ) : (
                <button
                  data-testid="admin-lock-open"
                  onClick={() => { setConfirmAction('LOCK'); setConfirmOpen(true); }}
                  className="px-3 py-1.5 rounded bg-[var(--down,#f2475f)]/10 border border-[var(--down,#f2475f)]/30 text-[var(--down,#f2475f)] text-sm hover:bg-[var(--down,#f2475f)]/20"
                >
                  Khóa tài khoản
                </button>
              )
            )}

            {hasPerm('accounts.reset') && (
              <button
                onClick={() => { setConfirmAction('RESET'); setConfirmOpen(true); }}
                className="px-3 py-1.5 rounded bg-[var(--down,#f2475f)]/10 border border-[var(--down,#f2475f)]/30 text-[var(--down,#f2475f)] text-sm hover:bg-[var(--down,#f2475f)]/20"
              >
                Reset tài khoản
              </button>
            )}
          </div>
        )}
      </div>

      {/* Balances */}
      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-[var(--line,#1d1e21)] font-medium text-sm">
          Số dư tài khoản · Tổng: {detail.totalValueUsdt} USDT
        </div>
        <table className="w-full text-sm text-left">
          <thead className="bg-[var(--line,#1d1e21)]/40">
            <tr>
              <th className="px-4 py-2 text-[var(--text-2,#a1a1aa)]">Tài sản</th>
              <th className="px-4 py-2 text-[var(--text-2,#a1a1aa)]">Khả dụng</th>
              <th className="px-4 py-2 text-[var(--text-2,#a1a1aa)]">Đã khóa</th>
            </tr>
          </thead>
          <tbody>
            {detail.balances.map((b) => (
              <tr key={b.asset} className="border-t border-[var(--line,#1d1e21)]">
                <td className="px-4 py-2 font-medium">{b.asset}</td>
                <td className="px-4 py-2 font-mono">{b.available}</td>
                <td className="px-4 py-2 font-mono text-[var(--text-2,#a1a1aa)]">{b.locked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Adjust Balance Modal */}
      {adjustModal.open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-lg w-full max-w-md p-6 flex flex-col gap-4">
            <h2 className="text-lg font-bold">Điều chỉnh số dư</h2>
            <p className="text-[var(--text-2,#a1a1aa)] text-sm">
              Nhập số dương để cộng, số âm để trừ. Hành động sẽ được ghi nhật ký.
            </p>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--text-2,#a1a1aa)]">Tài sản</label>
              <select
                data-testid="adjust-asset"
                value={adjustModal.asset}
                onChange={(e) => setAdjustModal((m) => ({ ...m, asset: e.target.value }))}
                className="bg-[var(--bg,#000)] border border-[var(--line,#1d1e21)] rounded px-3 py-2 text-[var(--text,#f4f4f5)] outline-none"
              >
                {detail.balances.length > 0
                  ? detail.balances.map((b) => <option key={b.asset} value={b.asset}>{b.asset}</option>)
                  : <option value="USDT">USDT</option>
                }
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--text-2,#a1a1aa)]">Số tiền (có dấu)</label>
              <input
                data-testid="adjust-amount"
                type="number"
                value={adjustModal.amount}
                onChange={(e) => setAdjustModal((m) => ({ ...m, amount: e.target.value }))}
                placeholder="500 hoặc -100"
                className="bg-[var(--bg,#000)] border border-[var(--line,#1d1e21)] rounded px-3 py-2 text-[var(--text,#f4f4f5)] outline-none"
              />
            </div>
            {adjustModal.amount && (
              <div
                data-testid="adjust-preview"
                className="text-sm bg-[var(--panel-2,#141416)] rounded p-3 font-mono"
              >
                {currentAvailable.toFixed(2)} → {afterBalance} {adjustModal.asset}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--text-2,#a1a1aa)]">Lý do (tối thiểu 5 ký tự)</label>
              <AdjustReasonForm
                asset={adjustModal.asset}
                amount={adjustModal.amount}
                onConfirm={handleAdjustConfirm}
                onCancel={() => setAdjustModal({ open: false, asset: 'USDT', amount: '' })}
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        title={
          confirmAction === 'LOCK' ? 'Khóa tài khoản' :
          confirmAction === 'UNLOCK' ? 'Mở khóa tài khoản' :
          'Reset tài khoản'
        }
        consequenceText={
          confirmAction === 'LOCK'
            ? 'Người dùng sẽ bị đăng xuất khỏi mọi thiết bị và không thể đăng nhập lại cho đến khi được mở khóa.'
            : confirmAction === 'UNLOCK'
            ? 'Người dùng sẽ có thể đăng nhập lại.'
            : 'Tất cả số dư, lệnh, bots sẽ bị xóa. Không thể hoàn tác.'
        }
        requirePhrase={confirmAction === 'RESET' ? 'RESET' : undefined}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

// Inline form to avoid prop drilling through ConfirmDialog for adjust
const AdjustReasonForm: React.FC<{
  asset: string;
  amount: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}> = ({ onConfirm, onCancel }) => {
  const [reason, setReason] = useState('');
  const isValid = reason.trim().length >= 5;

  return (
    <>
      <textarea
        data-testid="confirm-reason"
        className="w-full bg-[var(--bg,#000)] border border-[var(--line,#1d1e21)] rounded p-2 text-[var(--text,#f4f4f5)] resize-none h-20 outline-none focus:border-[var(--accent,#818cf8)]"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Nhập lý do..."
      />
      <div className="flex justify-end gap-3 mt-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded border border-[var(--line,#1d1e21)] text-sm text-[var(--text-2,#a1a1aa)] hover:bg-[var(--panel-2,#141416)]"
        >
          Hủy
        </button>
        <button
          data-testid="confirm-submit"
          onClick={() => isValid && onConfirm(reason)}
          disabled={!isValid}
          className="px-3 py-1.5 rounded bg-[var(--accent,#818cf8)] text-white text-sm disabled:opacity-40 hover:brightness-110"
        >
          Xác nhận
        </button>
      </div>
    </>
  );
};
