import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useMarket } from '../context/MarketContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '@cex/ui';

export const OverviewPage: React.FC = () => {
  const [overview, setOverview] = useState<any>(null);
  const { hasPerm } = useAuth();
  const { tradingHalted, refreshHaltState } = useMarket();
  const api = getApiClient();

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmType, setConfirmType] = useState<'HALT' | 'RESUME'>('HALT');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    api.adminOverview().then(setOverview).catch(() => {});
  }, []);

  const handleOpenHalt = () => {
    setConfirmType('HALT');
    setIsConfirmOpen(true);
  };

  const handleOpenResume = () => {
    setConfirmType('RESUME');
    setIsConfirmOpen(true);
  };

  const handleConfirm = async (reason: string) => {
    setIsSubmitting(true);
    try {
      if (confirmType === 'HALT') {
        await api.adminHaltTrading({ body: { reason, confirm: 'HALT' } });
      } else {
        await api.adminResumeTrading({ body: { reason, confirm: 'RESUME' } });
      }
      await refreshHaltState();
      setIsConfirmOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6" data-testid="admin-overview">
      <h1 className="text-2xl font-bold mb-6">Tổng quan</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-panel border border-line p-4 rounded">
          <div className="text-text-2 text-sm mb-1">Tổng người dùng</div>
          <div className="text-2xl font-bold">{overview?.users?.total ?? '-'}</div>
        </div>
        <div className="bg-panel border border-line p-4 rounded">
          <div className="text-text-2 text-sm mb-1">Lệnh đang mở</div>
          <div className="text-2xl font-bold">{overview?.orders?.open ?? '-'}</div>
        </div>
        <div className="bg-panel border border-line p-4 rounded">
          <div className="text-text-2 text-sm mb-1">Giao dịch 24h</div>
          <div className="text-2xl font-bold">{overview?.trades?.last24h ?? '-'}</div>
        </div>
      </div>

      <div className="bg-panel border border-line p-6 rounded" data-testid="admin-trading-state" data-halted={tradingHalted ? 'true' : 'false'}>
        <h2 className="text-lg font-bold mb-4">Trạng thái giao dịch</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${tradingHalted ? 'bg-down' : 'bg-up'}`} />
            <span className="font-medium">{tradingHalted ? 'Đang tạm ngưng' : 'Hoạt động bình thường'}</span>
          </div>

          {hasPerm('exchange.halt') && (
            <div className="ml-auto">
              {tradingHalted ? (
                <Button data-testid="admin-resume-open" variant="primary" onClick={handleOpenResume}>
                  Mở lại giao dịch
                </Button>
              ) : (
                <Button data-testid="admin-halt-open" variant="danger" onClick={handleOpenHalt}>
                  Tạm ngưng giao dịch
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title={confirmType === 'HALT' ? 'Tạm ngưng giao dịch' : 'Mở lại giao dịch'}
        consequenceText={confirmType === 'HALT' ? 'Tất cả hoạt động giao dịch sẽ bị dừng lập tức.' : 'Hệ thống giao dịch sẽ hoạt động trở lại.'}
        requirePhrase={confirmType}
        onConfirm={handleConfirm}
        onCancel={() => setIsConfirmOpen(false)}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};
