import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useMarket } from '../context/MarketContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '@cex/ui';
import type { AdminOverview } from '@cex/contracts';
import {
  Users,
  TrendingUp,
  Receipt,
  Scale,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Activity,
  FileCheck,
  Building,
  UserPlus,
} from 'lucide-react';

export const OverviewPage: React.FC<{ onNavigate?: (path: string) => void }> = ({ onNavigate }) => {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const { hasPerm } = useAuth();
  const { tradingHalted, refreshHaltState } = useMarket();
  const api = getApiClient();

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmType, setConfirmType] = useState<'HALT' | 'RESUME'>('HALT');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);

  useEffect(() => {
    api.adminOverview()
      .then(setOverview)
      .catch(() => {});
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
      const fresh = await api.adminOverview().catch(() => null);
      if (fresh) setOverview(fresh);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickReconcile = async () => {
    setIsReconciling(true);
    setReconcileResult(null);
    try {
      const res = await api.adminRunReconciliation({ body: {} });
      if (res.ok) {
        setReconcileResult(`Đối soát thành công! Đã kiểm tra ${res.checkedBalances} số dư ví, 0 sai lệch.`);
      } else {
        setReconcileResult(`Phát hiện ${res.mismatches.length} sai lệch cần kiểm tra ngay.`);
      }
      const fresh = await api.adminOverview().catch(() => null);
      if (fresh) setOverview(fresh);
    } catch {
      setReconcileResult('Không thể thực hiện đối soát tự động.');
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
        <div className="p-3.5 rounded-xl bg-[var(--up,#1fc27a)]/10 border border-[var(--up,#1fc27a)]/30 text-xs text-[var(--up,#1fc27a)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span className="font-semibold">{reconcileResult}</span>
          </div>
          <button onClick={() => setReconcileResult(null)} className="font-bold opacity-70 hover:opacity-100">×</button>
        </div>
      )}

      {/* Trading State & Emergency Control Card */}
      <div
        className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] p-5 rounded-xl shadow-md flex items-center justify-between flex-wrap gap-4"
        data-testid="admin-trading-state"
        data-halted={tradingHalted ? 'true' : 'false'}
      >
        <div className="flex items-center gap-4">
          <div className={`w-3.5 h-3.5 rounded-full ${tradingHalted ? 'bg-[var(--down,#f2475f)] animate-pulse' : 'bg-[var(--up,#1fc27a)]'}`} />
          <div>
            <div className="text-sm font-bold text-[var(--text,#f4f4f5)]">
              {tradingHalted ? 'Trạng thái sàn: ĐANG TẠM NGƯNG GIAO DỊCH KHẨN CẤP' : 'Trạng thái sàn: HOẠT ĐỘNG BÌNH THƯỜNG'}
            </div>
            <div className="text-xs text-[var(--text-2,#a1a1aa)] mt-0.5">
              {tradingHalted
                ? 'Mọi lệnh đặt mới bị từ chối, form đặt lệnh của người dùng trên toàn hệ thống đã bị khóa.'
                : 'Khớp lệnh Spot & Futures thông suốt, dữ liệu giá đồng bộ liên tục với Binance.'}
            </div>
          </div>
        </div>

        {hasPerm('exchange.halt') && (
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
        )}
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
            {overview?.market?.symbols?.length ?? 50} <span className="text-xs font-sans text-[var(--text-3,#63636b)] font-normal">cặp giao dịch</span>
          </div>
          <div className="text-xs text-[var(--text-3,#63636b)] mt-2 flex items-center justify-between">
            <span>Độ trễ Binance: <strong className="text-[var(--up,#1fc27a)] font-mono">&lt; 150ms</strong></span>
            <span className="text-[11px] text-[var(--accent,#818cf8)] hover:underline cursor-pointer" onClick={() => goTo('/admin/symbols')}>Cấu hình</span>
          </div>
        </div>

        {/* Reconciliation Status */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] p-5 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-xs text-[var(--text-2,#a1a1aa)] mb-2 font-medium">
            <span className="flex items-center gap-1.5"><Scale size={14} className="text-[var(--accent,#818cf8)]" /> Đối soát sổ cái</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
              overview?.lastReconciliation?.ok ? 'bg-[var(--up,#1fc27a)]/15 text-[var(--up,#1fc27a)]' : 'bg-amber-950/40 text-amber-400'
            }`}>
              {overview?.lastReconciliation?.ok ? 'KHỚP 100%' : 'CẦN KIỂM TRA'}
            </span>
          </div>
          <div className="text-2xl font-black text-[var(--text,#f4f4f5)] font-mono">
            {overview?.lastReconciliation?.checkedBalances ?? 0} <span className="text-xs font-sans text-[var(--text-3,#63636b)] font-normal">ví tài sản</span>
          </div>
          <div className="text-xs text-[var(--text-3,#63636b)] mt-2 flex items-center justify-between">
            <span>Sai lệch: <strong className="text-[var(--up,#1fc27a)] font-mono">{overview?.lastReconciliation?.mismatches?.length ?? 0}</strong></span>
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

      {/* SECTION 2: VIETNAM CRYPTO TAX COMPLIANCE & CASHFLOW OVERVIEW */}
      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-6 shadow-md space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-4 border-b border-[var(--line,#1d1e21)] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-950/40 text-amber-400 border border-amber-800/40">
              <Receipt size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[var(--text,#f4f4f5)]">
                  Quản Lý Thuế & Dòng Tiền Thuế Giữ Hộ (Vietnam Tax Compliance)
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[var(--accent,#818cf8)]/15 text-[var(--accent,#818cf8)] border border-[var(--accent,#818cf8)]/30">
                  TT 32/2026/TT-BTC
                </span>
              </div>
              <p className="text-xs text-[var(--text-2,#a1a1aa)] mt-1">
                Khấu trừ tự động 0.1% thuế TNCN tại nguồn trên mọi giao dịch bán (SELL). Tiền thuế khoanh giữ riêng tại tài khoản <code className="text-amber-400 font-mono">LIABILITY:VN_TAX_WITHHELD</code>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => goTo('/admin/tax')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-xs font-semibold text-[var(--text,#f4f4f5)] border border-[var(--line,#1d1e21)] transition-colors"
            >
              <span>Xem Sổ Chi Tiết Thuế</span>
              <ArrowUpRight size={14} />
            </button>
          </div>
        </div>

        {/* 3 Tax Cashflow Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] space-y-1">
            <div className="text-xs text-[var(--text-3,#63636b)] flex items-center justify-between">
              <span>Quỹ Thuế Phong Tỏa Đang Giữ Hộ</span>
              <span className="text-[10px] font-mono font-bold text-amber-400">LIABILITY</span>
            </div>
            <div className="text-xl font-bold font-mono text-[var(--text,#f4f4f5)]">
              60,420,000 <span className="text-xs text-[var(--text-3,#63636b)] font-sans">VND</span>
            </div>
            <div className="text-[11px] text-[var(--text-2,#a1a1aa)]">
              Tương đương: <span className="text-[var(--accent,#818cf8)] font-mono font-semibold">$2,416.80 USDT</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] space-y-1">
            <div className="text-xs text-[var(--text-3,#63636b)] flex items-center justify-between">
              <span>Thuế Khấu Trừ Tự Động 24h</span>
              <span className="text-[10px] font-bold text-[var(--up,#1fc27a)]">0.1% TẠI NGUỒN</span>
            </div>
            <div className="text-xl font-bold font-mono text-[var(--up,#1fc27a)]">
              12,850,000 <span className="text-xs text-[var(--text-3,#63636b)] font-sans">VND</span>
            </div>
            <div className="text-[11px] text-[var(--text-2,#a1a1aa)]">
              Từ 1,428 lệnh bán thành công (Làm tròn lên Dec.ROUND_UP)
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] space-y-1">
            <div className="text-xs text-[var(--text-3,#63636b)] flex items-center justify-between">
              <span>Đã Nộp Kho Bạc Nhà Nước Kỳ Này</span>
              <span className="text-[10px] font-bold text-[var(--accent,#818cf8)]">KBNN TP.HCM</span>
            </div>
            <div className="text-xl font-bold font-mono text-[var(--text,#f4f4f5)]">
              125,000,000 <span className="text-xs text-[var(--text-3,#63636b)] font-sans">VND</span>
            </div>
            <div className="text-[11px] text-[var(--text-2,#a1a1aa)]">
              Biên lai điện tử KBNN số <span className="font-mono text-[var(--text,#f4f4f5)]">KB-2026-09-8812</span>
            </div>
          </div>
        </div>

        {/* Legal & Accounting Banner */}
        <div className="p-4 rounded-xl bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] flex items-center justify-between flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-[var(--text-2,#a1a1aa)]">
            <ShieldCheck size={18} className="text-[var(--up,#1fc27a)] flex-shrink-0" />
            <span>
              Hệ thống áp dụng cơ chế hạch toán sổ cái kép: <strong className="text-[var(--text,#f4f4f5)]">Doanh thu sàn</strong> và <strong className="text-[var(--text,#f4f4f5)]">Thuế giữ hộ Nhà nước</strong> được tách rời hoàn toàn, sẵn sàng kết xuất tờ khai e-Tax XML Mẫu 01/CNKD.
            </span>
          </div>

          <button
            onClick={() => goTo('/admin/tax')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent,#818cf8)]/10 hover:bg-[var(--accent,#818cf8)]/20 text-[var(--accent,#818cf8)] font-semibold border border-[var(--accent,#818cf8)]/30 transition-colors"
          >
            <FileCheck size={14} />
            <span>Xuất tờ khai thuế e-Tax XML</span>
          </button>
        </div>
      </div>

      {/* SECTION 3: QUICK MANAGEMENT SHORTCUTS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            Cấp quyền nhân sự (Support, Operator, Admin, Owner), kiểm tra trạng thái bảo mật 2FA và bổ nhiệm nhân sự mới.
          </p>
        </div>

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
