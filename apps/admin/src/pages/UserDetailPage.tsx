import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '@cex/ui';

export const UserDetailPage: React.FC<{ userId: string; onNavigate: (path: string) => void }> = ({ userId, onNavigate }) => {
  const [user, setUser] = useState<any>(null);
  const { hasPerm } = useAuth();
  const api = getApiClient();

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'LOCK' | 'UNLOCK' | 'RESET' | null>(null);

  useEffect(() => {
    api.adminGetUser(userId).then(setUser).catch(() => {});
  }, [userId]);

  if (!user) return <div className="p-6">Đang tải...</div>;

  const isLocked = !!user.lockedAt;

  const handleActionClick = (action: 'LOCK' | 'UNLOCK' | 'RESET') => {
    setConfirmAction(action);
    setIsConfirmOpen(true);
  };

  const handleConfirm = async (reason: string) => {
    try {
      if (confirmAction === 'LOCK') await api.adminLockUser(userId, { reason });
      if (confirmAction === 'UNLOCK') await api.adminUnlockUser(userId, { reason });
      if (confirmAction === 'RESET') await api.adminResetUser(userId, { reason });
      
      const refreshed = await api.adminGetUser(userId);
      setUser(refreshed);
    } catch {} finally {
      setIsConfirmOpen(false);
    }
  };

  return (
    <div className="p-6">
      <button onClick={() => onNavigate('/admin/users')} className="text-text-2 hover:text-text mb-4">← Quay lại</button>
      
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{user.email}</h1>
          <div className="text-text-2 mt-1">UID: {user.uid} • Vai trò: {user.role}</div>
          <div className="mt-2" data-testid="admin-user-status" data-status={isLocked ? 'locked' : 'active'}>
            Trạng thái: <span className={isLocked ? 'text-down font-bold' : 'text-up font-bold'}>{isLocked ? 'Đã khóa' : 'Hoạt động'}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {hasPerm('balances.adjust') && (
            <Button data-testid="admin-adjust-open" variant="secondary" onClick={() => {}}>
              Điều chỉnh số dư
            </Button>
          )}
          
          {hasPerm('users.lock') && (
            isLocked ? (
              <Button data-testid="admin-unlock-open" variant="primary" onClick={() => handleActionClick('UNLOCK')}>Mở khóa</Button>
            ) : (
              <Button data-testid="admin-lock-open" variant="danger" onClick={() => handleActionClick('LOCK')}>Khóa tài khoản</Button>
            )
          )}

          {hasPerm('accounts.reset') && (
            <Button variant="danger" onClick={() => handleActionClick('RESET')}>Reset tài khoản</Button>
          )}
        </div>
      </div>

      <div className="border-b border-line flex gap-6 mb-6">
        <button className="py-2 border-b-2 border-accent text-accent font-medium">Số dư</button>
        <button className="py-2 text-text-2 hover:text-text">Lịch sử Lệnh</button>
        <button className="py-2 text-text-2 hover:text-text">Bots / Futures</button>
        <button className="py-2 text-text-2 hover:text-text">Đăng nhập</button>
      </div>

      {/* Adjust Modal implementation omitted for brevity, normally handled via dialog */}
      
      <ConfirmDialog
        isOpen={isConfirmOpen}
        title={
          confirmAction === 'LOCK' ? 'Khóa tài khoản' :
          confirmAction === 'UNLOCK' ? 'Mở khóa tài khoản' :
          'Reset tài khoản'
        }
        consequenceText="Hành động này sẽ được ghi lại trong nhật ký quản trị."
        requirePhrase={confirmAction === 'RESET' ? 'RESET' : undefined}
        onConfirm={handleConfirm}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </div>
  );
};
