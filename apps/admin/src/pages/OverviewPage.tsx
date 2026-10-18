import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useMarket } from '../context/MarketContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatApiError } from '../services/errors';
import { Button } from '@cex/ui';
import type { AdminOverview } from '@cex/contracts';
import {
  Users,
  TrendingUp,
  Scale,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Activity,
  Building,
  UserPlus,
} from 'lucide-react';

export const OverviewPage: React.FC<{ onNavigate?: (path: string) => void }> = ({ onNavigate }) => {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { hasPerm } = useAuth();
  const { tradingHalted, refreshHaltState } = useMarket();
  const api = getApiClient();

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmType, setConfirmType] = useState<'HALT' | 'RESUME'>('HALT');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);
  const [reconcileHasMismatch, setReconcileHasMismatch] = useState(false);

  const loadOverview = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await api.adminOverview();
      setOverview(data);
    } catch (e: any) {
      setLoadError(formatApiError(e, 'Không thể tải thông tin bảng điều khiển'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const handleOpenHalt = () => {
    setConfirmError(null);
    setConfirmType('HALT');
    setIsConfirmOpen(true);
  };

  const handleOpenResume = () => {
    setConfirmError(null);
    setConfirmType('RESUME');
    setIsConfirmOpen(true);
  };

  const handleConfirm = async (reason: string) => {
    setIsSubmitting(true);
    setConfirmError(null);
    try {
      if (confirmType === 'HALT') {
        await api.adminHaltTrading({ body: { reason, confirm: 'HALT' } });
      } else {
        await api.adminResumeTrading({ body: { reason, confirm: 'RESUME' } });
      }
      await refreshHaltState();
      setIsConfirmOpen(false);
      setConfirmError(null);
      const fresh = await api.adminOverview().catch(() => null);
      if (fresh) setOverview(fresh);
    } catch (e) {
      setConfirmError(formatApiError(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickReconcile = async () => {
    setIsReconciling(true);
    setReconcileResult(null);
    setReconcileHasMismatch(false);
    try {
      const res = await api.adminRunReconciliation({ body: {} });
      if (res.ok && (res.mismatches?.length ?? 0) === 0) {
        setReconcileHasMismatch(false);
        setReconcileResult(`Đối soát thành công! Đã kiểm tra ${res.checkedBalances} số dư ví, 0 sai lệch.`);
      } else {
        setReconcileHasMismatch(true);
        setReconcileResult(`Phát hiện ${res.mismatches.length} sai lệch cần kiểm tra ngay.`);
      }
      const fresh = await api.adminOverview().catch(() => null);
      if (fresh) setOverview(fresh);
    } catch (e: any) {
      setReconcileHasMismatch(true);
      setReconcileResult(formatApiError(e, 'Không thể thực hiện đối soát tự động.'));
    } finally {
      setIsReconciling(false);
      setTimeout(() => setReconcileResult(null), 6000);
    }
  };

  const goTo = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  if (loadError && !overview) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="admin-overview">
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-[var(--line,#1d1e21)] pb-5">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">Bảng Điều Khiển Quản Trị</h1>
            <p className="text-sm text-[var(--text-2,#a1a1aa)] mt-1">
              Trung tâm kiểm soát hệ thống, dòng tiền giao dịch, an toàn sổ cái và tuân thủ nghĩa vụ thuế
            </p>
          </div>
        </div>

        <div
          data-testid="list-error"
          className="p-12 text-center bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-2xl flex flex-col items-center justify-center"
        >
          <div className="w-12 h-12 mb-4 rounded-full bg-[var(--down,#f6465d)]/10 flex items-center justify-center text-[var(--down,#f6465d)]">
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-lg font-semibold text-[var(--text,#f4f4f5)] mb-2">Không thể tải dữ liệu</h2>
          <p className="text-sm text-[var(--text-2,#a1a1aa)] mb-6 max-w-md">{loadError}</p>
          <button
            onClick={loadOverview}
            disabled={isLoading}
            className="px-4 py-2 bg-[var(--accent,#818cf8)] text-white text-sm font-medium rounded-lg hover:bg-[var(--accent,#818cf8)]/90 disabled:opacity-50 transition-colors"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  const marketSymbols = overview?.market?.symbols ?? [];
  const liveCount = marketSymbols.filter((s) => s.status === 'LIVE').length;
  const staleCount = marketSymbols.filter((s) => s.status === 'STALE').length;
  const unavailCount = marketSymbols.filter((s) => s.status === 'UNAVAILABLE').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="admin-overview">
      {/* Top Header & Server Info */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-[var(--line,#1d1e21)] pb-5">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">Bảng Điều Khiển Quản Trị</h1>
          <p className="text-sm text-[var(--text-2,#a1a1aa)] mt-1">
            Trung tâm kiểm soát hệ thống, dòng tiền giao dịch, an toàn sổ cái và tuân thủ nghĩa vụ thuế
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] px-3 py-1.5 rounded-lg text-xs font-mono text-[var(--text-2,#a1a1aa)]">
            <Clock size={13} className="text-[var(--accent,#818cf8)]" />
            <span>Server Time: {overview?.serverTime ? new Date(overview.serverTime).toLocaleTimeString('vi-VN') : '--:--:--'}</span>
          </div>
          
          <button
            onClick={() => goTo('/admin/users')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent,#818cf8)] hover:brightness-110 text-xs font-bold text-white transition-all shadow-sm"
          >
            <UserPlus size={14} />
            <span>Thêm / Quản lý người dùng</span>
          </button>
        </div>
      </div>

      {reconcileResult && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between ${
            reconcileHasMismatch
              ? 'bg-[var(--down,#f2475f)]/15 border border-[var(--down,#f2475f)]/30 text-[var(--down,#f2475f)]'
              : 'bg-[var(--up,#1fc27a)]/10 border border-[var(--up,#1fc27a)]/30 text-[var(--up,#1fc27a)]'
          }`}
        >
          <div className="flex items-center gap-2">
            {reconcileHasMismatch ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span className="font-semibold">{reconcileResult}</span>
          </div>
          <button onClick={() => setReconcileResult(null)} className="font-bold opacity-70 hover:opacity-100">×</button>
        </div>
      )}

      {/* Trading State & Emergency Control Card */}
      <div
        className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] p-5 rounded-xl shadow-md flex items-center justify-between flex-wrap gap-4"
        data-testid="admin-trading-state"
        data-halted={tradingHalted === null ? 'unknown' : (tradingHalted ? 'true' : 'false')}
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-3.5 h-3.5 rounded-full ${
              tradingHalted === null
                ? 'bg-[var(--text-3,#63636b)]'
                : tradingHalted
                ? 'bg-[var(--down,#f2475f)] animate-pulse'
                : 'bg-[var(--up,#1fc27a)]'
            }`}
          />
          <div>
            <div className="text-sm font-bold text-[var(--text,#f4f4f5)]">
              {tradingHalted === null
                ? 'Trạng thái sàn: Không xác định'
                : tradingHalted
                ? 'Trạng thái sàn: ĐANG TẠM NGƯNG GIAO DỊCH KHẨN CẤP'
                : 'Trạng thái sàn: HOẠT ĐỘNG BÌNH THƯỜNG'}
            </div>
            <div className="text-xs text-[var(--text-2,#a1a1aa)] mt-0.5">
              {tradingHalted === null
                ? 'Không thể tải hoặc kết nối trạng thái dừng sàn. Vui lòng thử lại.'
                : tradingHalted
                ? 'Mọi lệnh đặt mới bị từ chối, form đặt lệnh của người dùng trên toàn hệ thống đã bị khóa.'
                : 'Khớp lệnh Spot & Futures thông suốt, dữ liệu giá đồng bộ liên tục với Binance.'}
            </div>
          </div>
        </div>

        <div>
          {tradingHalted === null ? (
            <Button size="sm" variant="outline" onClick={() => refreshHaltState()}>
              Thử lại
            </Button>
          ) : (
            hasPerm('exchange.halt') && (
              <div>
                {tradingHalted ? (
                  <Button data-testid="admin-resume-open" variant="primary" size="sm" onClick={handleOpenResume}>
                    Mở lại giao dịch sàn
                  </Button>
                ) : (
                  <Button data-testid="admin-halt-open" variant="danger" size="sm" onClick={handleOpenHalt}>
                    Tạm ngưng khẩn cấp
                  </Button>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* SECTION 1: Core System & User Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] p-5 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-xs text-[var(--text-2,#a1a1aa)] mb-2 font-medium">
            <span className="flex items-center gap-1.5"><Users size={14} className="text-[var(--accent,#818cf8)]" /> Tổng người dùng</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--line,#1d1e21)] text-[var(--text-3,#63636b)] font-mono">
              +{overview?.users?.newLast24h ?? 0} mới 24h
            </span>
          </div>
          <div className="text-2xl font-black text-[var(--text,#f4f4f5)] font-mono">{overview?.users?.total ?? '-'}</div>
          <div className="text-xs text-[var(--text-3,#63636b)] mt-2 flex items-center justify-between">
            <span>Đã khóa: <strong className="text-[var(--down,#f2475f)] font-mono">{overview?.users?.locked ?? 0}</strong></span>
            <span>Nhân sự: <strong className="text-[var(--accent,#818cf8)] font-mono">{overview?.users?.staff ?? 0}</strong></span>
          </div>
        </div>

        {/* Open Orders */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] p-5 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-xs text-[var(--text-2,#a1a1aa)] mb-2 font-medium">
            <span className="flex items-center gap-1.5"><TrendingUp size={14} className="text-[var(--up,#1fc27a)]" /> Lệnh đang mở</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--line,#1d1e21)] text-[var(--text-3,#63636b)] font-mono">
              +{overview?.orders?.placedLast24h ?? 0} đặt 24h
            </span>
          </div>
          <div className="text-2xl font-black text-[var(--text,#f4f4f5)] font-mono">{overview?.orders?.open ?? '-'}</div>
          <div className="text-xs text-[var(--text-3,#63636b)] mt-2">
            Khớp trong 24h: <strong className="text-[var(--text,#f4f4f5)] font-mono">{overview?.trades?.last24h ?? '-'} giao dịch</strong>
          </div>
        </div>

        {/* Market Feed Health */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] p-5 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-xs text-[var(--text-2,#a1a1aa)] mb-2 font-medium">
            <span className="flex items-center gap-1.5"><Activity size={14} className="text-amber-400" /> Nguồn giá thị trường</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
              overview?.market?.connection === 'CONNECTED' ? 'bg-[var(--up,#1fc27a)]/15 text-[var(--up,#1fc27a)]' : 'bg-amber-950/40 text-amber-400'
            }`}>
              {overview?.market?.connection ?? 'BINANCE FEED'}
            </span>
          </div>
          <div className="text-2xl font-black text-[var(--text,#f4f4f5)] font-mono">
            {overview ? marketSymbols.length : '—'} <span className="text-xs font-sans text-[var(--text-3,#63636b)] font-normal">cặp giao dịch</span>
          </div>
          <div className="text-xs text-[var(--text-3,#63636b)] mt-2 flex items-center justify-between">
            <span
              data-testid="admin-market-health"
              data-live={liveCount}
              data-stale={staleCount}
              data-unavailable={unavailCount}
            >
              {overview ? `${liveCount} LIVE · ${staleCount} STALE · ${unavailCount} UNAVAILABLE` : '—'}
            </span>
            <span className="text-[11px] text-[var(--accent,#818cf8)] hover:underline cursor-pointer" onClick={() => goTo('/admin/symbols')}>Cấu hình</span>
          </div>
        </div>

        {/* Reconciliation Status */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] p-5 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-xs text-[var(--text-2,#a1a1aa)] mb-2 font-medium">
            <span className="flex items-center gap-1.5"><Scale size={14} className="text-[var(--accent,#818cf8)]" /> Đối soát sổ cái</span>
            {overview?.lastReconciliation ? (
              overview.lastReconciliation.ok && (overview.lastReconciliation.mismatches?.length ?? 0) === 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-[var(--up,#1fc27a)]/15 text-[var(--up,#1fc27a)]">
                  KHỚP 100%
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-[var(--down,#f2475f)]/15 text-[var(--down,#f2475f)]">
                  CÓ SAI LỆCH
                </span>
              )
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-[var(--line,#1d1e21)] text-[var(--text-3,#63636b)]">
                CHƯA CHẠY
              </span>
            )}
          </div>
          <div className="text-2xl font-black text-[var(--text,#f4f4f5)] font-mono">
            {overview?.lastReconciliation ? (
              <>
                {overview.lastReconciliation.checkedBalances} <span className="text-xs font-sans text-[var(--text-3,#63636b)] font-normal">ví tài sản</span>
              </>
            ) : (
              <span className="text-base text-[var(--text-3,#63636b)] font-sans font-normal">Chưa chạy đối soát</span>
            )}
          </div>
          <div className="text-xs text-[var(--text-3,#63636b)] mt-2 flex items-center justify-between">
            <span>
              Sai lệch:{' '}
              {overview?.lastReconciliation ? (
                (overview.lastReconciliation.mismatches?.length ?? 0) > 0 ? (
                  <strong className="text-[var(--down,#f2475f)] font-mono">
                    {overview.lastReconciliation.mismatches.length}
                  </strong>
                ) : (
                  <strong className="text-[var(--up,#1fc27a)] font-mono">0</strong>
                )
              ) : (
                <span className="text-[var(--text-3,#63636b)] font-mono">—</span>
              )}
            </span>
            {hasPerm('reconciliation.run') && (
              <button
                disabled={isReconciling}
                onClick={handleQuickReconcile}
                className="text-[11px] text-[var(--accent,#818cf8)] hover:underline font-semibold disabled:opacity-50"
              >
                {isReconciling ? 'Đang chạy...' : 'Chạy đối soát'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: QUICK MANAGEMENT SHORTCUTS */}
      {(hasPerm('users.read') || hasPerm('users.roles') || hasPerm('exchange.read')) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {hasPerm('users.read') && (
            <div
              onClick={() => goTo('/admin/users')}
              className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] hover:border-[var(--accent,#818cf8)]/40 p-5 rounded-xl cursor-pointer transition-all group shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-blue-950/40 text-blue-400">
                  <Users size={18} />
                </div>
                <ArrowUpRight size={16} className="text-[var(--text-3,#63636b)] group-hover:text-[var(--accent,#818cf8)] transition-colors" />
              </div>
              <div className="text-base font-bold text-[var(--text,#f4f4f5)]">Quản lý Thành viên</div>
              <p className="text-xs text-[var(--text-2,#a1a1aa)] mt-1">
                Tra cứu theo UID, thêm thành viên mới, khóa tài khoản nghi gian lận, điều chỉnh số dư và vô hiệu hóa tài khoản.
              </p>
            </div>
          )}

          {hasPerm('users.roles') && (
            <div
              onClick={() => goTo('/admin/roles')}
              className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] hover:border-[var(--accent,#818cf8)]/40 p-5 rounded-xl cursor-pointer transition-all group shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-purple-950/40 text-purple-400">
                  <ShieldCheck size={18} />
                </div>
                <ArrowUpRight size={16} className="text-[var(--text-3,#63636b)] group-hover:text-[var(--accent,#818cf8)] transition-colors" />
              </div>
              <div className="text-base font-bold text-[var(--text,#f4f4f5)]">Phân quyền & Vai trò</div>
              <p className="text-xs text-[var(--text-2,#a1a1aa)] mt-1">
                Cấp quyền nhân sự (Support, Admin, Owner), kiểm tra trạng thái bảo mật 2FA và bổ nhiệm nhân sự mới.
              </p>
            </div>
          )}

          {hasPerm('exchange.read') && (
            <div
              onClick={() => goTo('/admin/settings')}
              className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] hover:border-[var(--accent,#818cf8)]/40 p-5 rounded-xl cursor-pointer transition-all group shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-amber-950/40 text-amber-400">
                  <Building size={18} />
                </div>
                <ArrowUpRight size={16} className="text-[var(--text-3,#63636b)] group-hover:text-[var(--accent,#818cf8)] transition-colors" />
              </div>
              <div className="text-base font-bold text-[var(--text,#f4f4f5)]">Thông số Sàn & Faucet</div>
              <p className="text-xs text-[var(--text-2,#a1a1aa)] mt-1">
                Cấu hình tỷ lệ phí Spot, Maker/Taker Futures, hạn mức Faucet nạp tiền thử nghiệm và ngưỡng cảnh báo trễ giá.
              </p>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title={confirmType === 'HALT' ? 'Tạm ngưng giao dịch' : 'Mở lại giao dịch'}
        consequenceText={confirmType === 'HALT' ? 'Tất cả hoạt động giao dịch sẽ bị dừng lập tức.' : 'Hệ thống giao dịch sẽ hoạt động trở lại.'}
        requirePhrase={confirmType}
        onConfirm={handleConfirm}
        onCancel={() => { setIsConfirmOpen(false); setConfirmError(null); }}
        isSubmitting={isSubmitting}
        error={confirmError}
      />
    </div>
  );
};
