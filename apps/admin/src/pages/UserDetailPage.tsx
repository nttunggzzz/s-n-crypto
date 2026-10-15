import React, { useState, useEffect, useCallback } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  appLinks,
  type AdminUserDetail,
  type Order,
  type LedgerEntry,
  type FuturesPosition,
  type GridBot,
  type DcaPlan,
  type LoginEvent,
  type Role,
  type AdminTaxWithholding,
  exportUrl,
} from '@cex/contracts';
import { dec } from '@cex/core';
import { formatDecimal } from '@cex/ui';
import { Copy, Check, ExternalLink, ShieldAlert, ArrowDownUp, AlertCircle, Shield, Trash2, Radio, Receipt, UserX, X, Building, Download } from 'lucide-react';

interface UserDetailPageProps {
  userId: string;
  onNavigate: (path: string) => void;
}

export const UserDetailPage: React.FC<UserDetailPageProps> = ({ userId, onNavigate }) => {
  const { user: currentUser, hasPerm } = useAuth();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [actualId, setActualId] = useState<string>('');
  const [notFound, setNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'balances' | 'orders' | 'ledger' | 'futures' | 'bots' | 'logins' | 'tax'>('balances');
  const [copiedUid, setCopiedUid] = useState(false);

  // Evidence state
  const [recentLogins, setRecentLogins] = useState<LoginEvent[]>([]);
  const [recentLedger, setRecentLedger] = useState<LedgerEntry[]>([]);

  // Tab detailed data
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersType, setOrdersType] = useState<'true' | 'false'>('true');
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [positions, setPositions] = useState<FuturesPosition[]>([]);
  const [positionsType, setPositionsType] = useState<'true' | 'false'>('true');
  const [userBots, setUserBots] = useState<{ grid: GridBot[]; dca: DcaPlan[] }>({ grid: [], dca: [] });
  const [allLogins, setAllLogins] = useState<LoginEvent[]>([]);
  const [taxWithholdings, setTaxWithholdings] = useState<AdminTaxWithholding[]>([]);
  const [taxLoading, setTaxLoading] = useState(false);
  const [taxNextCursor, setTaxNextCursor] = useState<string | null>(null);

  // Role change modal state
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [targetRole, setTargetRole] = useState<Role>('user');
  const [roleReason, setRoleReason] = useState('');
  const [isSubmittingRole, setIsSubmittingRole] = useState(false);

  // Dialogs & Modals
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'LOCK' | 'UNLOCK' | 'RESET' | 'STOP_BOT' | 'CANCEL_DCA' | 'DEACTIVATE_USER' | null>(null);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // Adjust balance modal
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustAsset, setAdjustAsset] = useState('USDT');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [auditNotification, setAuditNotification] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const api = getApiClient();
  const exchangeOrigin = import.meta.env.VITE_EXCHANGE_ORIGIN;

  const loadUserData = useCallback(async () => {
    setNotFound(false);
    try {
      let targetId = userId;
      // If userId is all digits:
      if (/^\d+$/.test(userId)) {
        // Only accept exactly 8 digits as UID (P-02)
        if (!/^\d{8}$/.test(userId)) {
          setNotFound(true);
          setDetail(null);
          setActualId('');
          return;
        }

        const list = await api.adminListUsers({ query: { q: userId, limit: 1 } });
        if (list.items.length > 0 && list.items[0]?.uid === userId) {
          targetId = list.items[0]!.id;
        } else {
          setNotFound(true);
          setDetail(null);
          setActualId('');
          return;
        }
      }

      setActualId(targetId);

      const d = await api.adminGetUser({ params: { userId: targetId } });
      setDetail(d);

      // Fetch evidence: 5 recent logins and 5 recent ledger entries
      api.adminUserLoginHistory({ params: { userId: targetId }, query: { limit: 5 } })
        .then((r) => setRecentLogins(r.items))
        .catch(() => {});

      api.adminUserLedger({ params: { userId: targetId }, query: { limit: 5 } })
        .then((r) => setRecentLedger(r.items))
        .catch(() => {});
    } catch (e) {
      console.error(e);
      setNotFound(true);
      setDetail(null);
      setActualId('');
    } finally {
      setIsLoading(false);
    }
  }, [api, userId]);

  useEffect(() => {
    setDetail(null);
    setActualId('');
    setNotFound(false);
    setIsLoading(true);
    loadUserData();
  }, [loadUserData]);

  // Load tab-specific data when tab changes
  useEffect(() => {
    if (!actualId || notFound) return;

    if (activeTab === 'orders') {
      api.adminUserOrders({ params: { userId: actualId }, query: { open: ordersType, limit: 50 } })
        .then((r) => setOrders(r.items))
        .catch(() => {});
    } else if (activeTab === 'ledger') {
      api.adminUserLedger({ params: { userId: actualId }, query: { limit: 50 } })
        .then((r) => setLedgerEntries(r.items))
        .catch(() => {});
    } else if (activeTab === 'futures') {
      api.adminUserFuturesPositions({ params: { userId: actualId }, query: { open: positionsType, limit: 50 } })
        .then((r) => setPositions(r.items))
        .catch(() => {});
    } else if (activeTab === 'bots') {
      api.adminUserBots({ params: { userId: actualId } })
        .then((r) => setUserBots(r))
        .catch(() => {});
    } else if (activeTab === 'logins') {
      api.adminUserLoginHistory({ params: { userId: actualId }, query: { limit: 50 } })
        .then((r) => setAllLogins(r.items))
        .catch(() => {});
    } else if (activeTab === 'tax') {
      setTaxLoading(true);
      api.adminTaxWithholdings({ query: { userId: actualId, limit: 50 } })
        .then((r) => {
          setTaxWithholdings(r.items);
          setTaxNextCursor(r.nextCursor);
        })
        .catch(() => {
          setTaxWithholdings([]);
          setTaxNextCursor(null);
        })
        .finally(() => setTaxLoading(false));
    }
  }, [actualId, notFound, activeTab, ordersType, positionsType, api]);

  const loadMoreTax = async () => {
    if (!taxNextCursor || !actualId || notFound) return;
    try {
      const r = await api.adminTaxWithholdings({ query: { userId: actualId, cursor: taxNextCursor, limit: 50 } });
      setTaxWithholdings((prev) => [...prev, ...r.items]);
      setTaxNextCursor(r.nextCursor);
    } catch {}
  };

  if (notFound) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="admin-user-not-found">
        {/* Top breadcrumb */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => onNavigate('/admin/users')}
            className="text-sm text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)] flex items-center gap-1.5 transition-colors"
          >
            ← Quay lại danh sách người dùng
          </button>
        </div>

        <div className="p-12 text-center bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-2xl flex flex-col items-center justify-center">
          <div className="w-12 h-12 mb-4 rounded-full bg-[var(--down,#f6465d)]/10 flex items-center justify-center text-[var(--down,#f6465d)]">
            <UserX size={24} />
          </div>
          <h2 className="text-lg font-semibold text-[var(--text,#f4f4f5)] mb-2">Không tìm thấy người dùng</h2>
          <p className="text-sm text-[var(--text-2,#a1a1aa)] mb-6 max-w-md">
            Không tìm thấy thông tin người dùng với định danh &ldquo;{userId}&rdquo;. Vui lòng kiểm tra lại UID hoặc UUID.
          </p>
          <button
            onClick={() => onNavigate('/admin/users')}
            className="px-4 py-2 bg-[var(--accent,#818cf8)] text-white text-sm font-medium rounded-lg hover:bg-[var(--accent,#818cf8)]/90 transition-colors"
          >
            Quay lại danh sách người dùng
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !detail) {
    return <div className="p-8 text-center text-[var(--text-2,#a1a1aa)]">Đang tải thông tin chi tiết người dùng...</div>;
  }

  const u = detail.user;
  const isLocked = u.status === 'locked';
  const isSelf = currentUser?.id === u.id;
  const isProtected = u.isBot || isSelf;

  const copyUid = () => {
    navigator.clipboard.writeText(u.uid);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2000);
  };

  // Preview for balance adjustment (M-11)
  const currentAssetBal = detail.balances.find((b) => b.asset === adjustAsset);
  const currentAvailable = currentAssetBal?.available ?? '0';
  let calculatedAfter: string | null = null;
  if (adjustAmount && adjustAmount.trim() !== '') {
    try {
      calculatedAfter = dec(currentAvailable).add(dec(adjustAmount.trim())).toString();
    } catch {
      calculatedAfter = null;
    }
  }

  const handleAdjustSubmit = async () => {
    if (!adjustReason || adjustReason.trim().length < 5) return;
    setIsSubmitting(true);
    setAdjustError(null);
    try {
      const res = await api.adminAdjustBalance({
        params: { userId: detail.user.id },
        body: { asset: adjustAsset, amount: adjustAmount, reason: adjustReason },
      });
      setAuditNotification(`Đã điều chỉnh số dư thành công! Mã nhật ký: ${res.auditLogId}`);
      setAdjustOpen(false);
      setAdjustAmount('');
      setAdjustReason('');
      loadUserData();
    } catch (err: any) {
      if (err?.code === 'INSUFFICIENT_BALANCE') {
        setAdjustError(`Khách chỉ còn ${currentAvailable} ${adjustAsset} khả dụng. Không thể trừ quá số dư này.`);
      } else {
        setAdjustError(err?.message || 'Có lỗi xảy ra khi điều chỉnh số dư.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmAction = async (reason: string) => {
    setIsSubmitting(true);
    try {
      if (confirmAction === 'LOCK') {
        await api.adminLockUser({ params: { userId: detail.user.id }, body: { reason } });
      } else if (confirmAction === 'UNLOCK') {
        await api.adminUnlockUser({ params: { userId: detail.user.id }, body: { reason } });
      } else if (confirmAction === 'RESET') {
        await api.adminResetAccount({ params: { userId: detail.user.id }, body: { reason, confirm: 'RESET' } });
      } else if (confirmAction === 'DEACTIVATE_USER') {
        try {
          await api.adminResetAccount({ params: { userId: detail.user.id }, body: { reason: `Đặt lại số dư: ${reason}`, confirm: 'RESET' } });
        } catch (resetErr: unknown) {
          const msg = resetErr instanceof Error ? resetErr.message : 'Thao tác thất bại';
          setAuditNotification(`Lỗi đặt lại số dư: ${msg}`);
          setConfirmOpen(false);
          loadUserData();
          return;
        }

        try {
          await api.adminLockUser({ params: { userId: detail.user.id }, body: { reason: `Khóa tài khoản: ${reason}` } });
          setAuditNotification(`Đã đặt lại số dư và khóa tài khoản ${detail.user.email}`);
        } catch (lockErr: unknown) {
          const msg = lockErr instanceof Error ? lockErr.message : 'Lỗi khóa';
          setAuditNotification(`Đã đặt lại số dư nhưng khóa thất bại: ${msg}`);
        }
      } else if (confirmAction === 'STOP_BOT' && selectedBotId) {
        await api.adminStopGridBot({ params: { userId: detail.user.id, botId: selectedBotId }, body: { reason, sellBase: false } });
      } else if (confirmAction === 'CANCEL_DCA' && selectedPlanId) {
        await api.adminCancelDcaPlan({ params: { userId: detail.user.id, planId: selectedPlanId }, body: { reason } });
      }
      setConfirmOpen(false);
      loadUserData();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChangeSubmit = async () => {
    if (!detail || !roleReason || roleReason.trim().length < 5) return;
    setIsSubmittingRole(true);
    try {
      await api.adminSetRole({
        params: { userId: detail.user.id },
        body: { role: targetRole, reason: roleReason.trim() },
      });
      setAuditNotification(`Đã cập nhật vai trò của ${detail.user.email} thành ${targetRole.toUpperCase()}`);
      setRoleModalOpen(false);
      loadUserData();
    } catch (e: any) {
      setAuditNotification(`Lỗi: ${e?.message || 'Có lỗi xảy ra khi cập nhật vai trò'}`);
    } finally {
      setIsSubmittingRole(false);
    }
  };

  const handleToggleSignals = async () => {
    if (!detail) return;
    setIsSubmitting(true);
    try {
      const nextVal = !detail.user.signalsAccess;
      await api.adminSetSignalsAccess({
        params: { userId: detail.user.id },
        body: {
          enabled: nextVal,
          reason: nextVal ? 'Cấp quyền truy cập tín hiệu giao dịch' : 'Thu hồi quyền truy cập tín hiệu giao dịch',
        },
      });
      setAuditNotification(`Đã ${nextVal ? 'cấp' : 'thu hồi'} quyền tín hiệu giao dịch cho ${detail.user.email}`);
      loadUserData();
    } catch (e: any) {
      setAuditNotification(`Lỗi: ${e?.message || 'Lỗi khi cập nhật quyền tín hiệu'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onNavigate('/admin/users')}
          className="text-sm text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)] flex items-center gap-1.5 transition-colors"
        >
          ← Quay lại danh sách người dùng
        </button>

        {auditNotification && (
          <div className="px-3 py-1.5 rounded-lg bg-[var(--up,#1fc27a)]/10 border border-[var(--up,#1fc27a)]/30 text-xs text-[var(--up,#1fc27a)] flex items-center gap-2">
            <span>{auditNotification}</span>
            <button onClick={() => setAuditNotification(null)} className="font-bold ml-1">×</button>
          </div>
        )}
      </div>

      {/* User Header Profile */}
      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-6 shadow-lg">
        <div className="flex items-start justify-between flex-wrap gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">{u.email}</h1>
              <div
                data-testid="admin-user-status"
                data-status={u.status}
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                  isLocked
                    ? 'bg-[var(--down,#f2475f)]/15 text-[var(--down,#f2475f)] border border-[var(--down,#f2475f)]/30'
                    : 'bg-[var(--up,#1fc27a)]/15 text-[var(--up,#1fc27a)] border border-[var(--up,#1fc27a)]/30'
                }`}
              >
                {isLocked ? 'Đã khóa' : 'Hoạt động'}
              </div>
              {u.isBot && (
                <span className="text-xs px-2 py-0.5 rounded bg-amber-950/40 text-amber-400 border border-amber-800/40">
                  Bot hệ thống
                </span>
              )}
            </div>

            <div className="flex items-center gap-6 mt-3 text-sm text-[var(--text-2,#a1a1aa)] flex-wrap">
              <div className="flex items-center gap-1.5 font-mono">
                <span className="text-[var(--text-3,#63636b)]">UID:</span>
                <span className="text-[var(--text,#f4f4f5)] font-bold">{u.uid}</span>
                <button
                  onClick={copyUid}
                  className="p-1 rounded hover:bg-[var(--line,#1d1e21)] text-[var(--text-3,#63636b)] hover:text-[var(--text,#f4f4f5)]"
                  title="Sao chép UID"
                >
                  {copiedUid ? <Check size={12} className="text-[var(--up,#1fc27a)]" /> : <Copy size={12} />}
                </button>
              </div>
              <div><span className="text-[var(--text-3,#63636b)]">Tên:</span> {u.name || '—'}</div>
              <div><span className="text-[var(--text-3,#63636b)]">Vai trò:</span> <span className="font-semibold uppercase text-[var(--accent,#818cf8)]">{u.role}</span></div>
              <div><span className="text-[var(--text-3,#63636b)]">2FA:</span> {u.twoFactorEnabled ? <span className="text-[var(--up,#1fc27a)]">Đã bật</span> : 'Chưa bật'}</div>
              <div><span className="text-[var(--text-3,#63636b)]">Phiên hoạt động:</span> {detail.activeSessions}</div>
            </div>
          </div>

          {/* Action Buttons */}
          {!isProtected && (
            <div className="flex items-center gap-2.5 flex-wrap">
              {hasPerm('balances.adjust') && (
                <button
                  data-testid="admin-adjust-open"
                  onClick={() => setAdjustOpen(true)}
                  className="px-3.5 py-2 rounded-lg bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-sm font-medium text-[var(--text,#f4f4f5)] flex items-center gap-1.5 border border-[var(--line,#1d1e21)] transition-colors"
                >
                  <ArrowDownUp size={15} />
                  <span>Điều chỉnh số dư</span>
                </button>
              )}

              {hasPerm('users.roles') && !u.isBot && (
                <button
                  data-testid="admin-role-change-open"
                  onClick={() => { setRoleModalOpen(true); setTargetRole(u.role); setRoleReason(''); }}
                  className="px-3.5 py-2 rounded-lg bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-sm font-medium text-[var(--accent,#818cf8)] flex items-center gap-1.5 border border-[var(--accent,#818cf8)]/30 transition-colors"
                  title="Thay đổi vai trò nhân sự hoặc khách"
                >
                  <Shield size={15} />
                  <span>Đổi vai trò</span>
                </button>
              )}

              {hasPerm('users.signals') && !u.isBot && (
                <button
                  onClick={handleToggleSignals}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${
                    u.signalsAccess
                      ? 'bg-[var(--accent,#818cf8)]/10 text-[var(--accent,#818cf8)] border-[var(--accent,#818cf8)]/30'
                      : 'bg-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)] border-[var(--line,#1d1e21)]'
                  }`}
                  title="Bật/Tắt quyền truy cập bot tín hiệu"
                >
                  <Radio size={14} />
                  <span>Tín hiệu: {u.signalsAccess ? 'Bật' : 'Tắt'}</span>
                </button>
              )}

              {hasPerm('users.lock') && (
                isLocked ? (
                  <button
                    data-testid="admin-unlock-open"
                    onClick={() => { setConfirmAction('UNLOCK'); setConfirmOpen(true); }}
                    className="px-3.5 py-2 rounded-lg bg-[var(--up,#1fc27a)]/10 hover:bg-[var(--up,#1fc27a)]/20 text-sm font-medium text-[var(--up,#1fc27a)] border border-[var(--up,#1fc27a)]/30 transition-colors"
                  >
                    Mở khóa tài khoản
                  </button>
                ) : (
                  <button
                    data-testid="admin-lock-open"
                    onClick={() => { setConfirmAction('LOCK'); setConfirmOpen(true); }}
                    className="px-3.5 py-2 rounded-lg bg-[var(--down,#f2475f)]/10 hover:bg-[var(--down,#f2475f)]/20 text-sm font-medium text-[var(--down,#f2475f)] border border-[var(--down,#f2475f)]/30 transition-colors"
                  >
                    Khóa tài khoản
                  </button>
                )
              )}

              {hasPerm('accounts.reset') && (
                <button
                  onClick={() => { setConfirmAction('RESET'); setConfirmOpen(true); }}
                  className="px-3.5 py-2 rounded-lg bg-red-950/30 hover:bg-red-950/50 text-sm font-medium text-red-400 border border-red-800/40 transition-colors"
                >
                  Reset tài khoản
                </button>
              )}

              {hasPerm('users.lock') && hasPerm('accounts.reset') && (
                <button
                  data-testid="admin-delete-user-open"
                  onClick={() => { setConfirmAction('DEACTIVATE_USER'); setConfirmOpen(true); }}
                  className="px-3.5 py-2 rounded-lg bg-rose-950/40 hover:bg-rose-950/60 text-sm font-medium text-rose-400 border border-rose-800/40 transition-colors flex items-center gap-1.5"
                  title="Đặt lại mọi số dư về 0 và khóa tài khoản (có thể mở khóa lại sau)"
                >
                  <UserX size={15} />
                  <span>Đặt lại số dư và khóa</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Section 2.3: Bằng chứng gian lận ngay dưới nút khóa */}
        {!isProtected && hasPerm('users.lock') && (
          <div className="mt-6 pt-6 border-t border-[var(--line,#1d1e21)]">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert size={16} className="text-amber-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-2,#a1a1aa)]">
                Bằng chứng kiểm tra an toàn (5 lần đăng nhập & 5 dòng sổ cái gần nhất)
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 5 Logins */}
              <div className="bg-[var(--bg,#000000)]/60 rounded-lg p-3 border border-[var(--line,#1d1e21)] text-xs">
                <div className="font-semibold text-[var(--text-2,#a1a1aa)] mb-2">Đăng nhập gần nhất:</div>
                {recentLogins.length === 0 ? (
                  <div className="text-[var(--text-3,#63636b)]">Chưa có lịch sử đăng nhập</div>
                ) : (
                  <div className="space-y-1.5">
                    {recentLogins.map((lg) => (
                      <div key={lg.id} className="flex items-center justify-between font-mono">
                        <span className="text-[var(--text-3,#63636b)]">{new Date(lg.at).toLocaleString('vi-VN')}</span>
                        <span className="text-[var(--text-2,#a1a1aa)]">{lg.ip || '—'}</span>
                        <span className="truncate max-w-[120px] text-[var(--text-3,#63636b)]" title={lg.device || ''}>{lg.device || '—'}</span>
                        <span className={lg.success ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}>
                          {lg.result === 'OK' ? 'Thành công' : lg.result}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 5 Ledger */}
              <div className="bg-[var(--bg,#000000)]/60 rounded-lg p-3 border border-[var(--line,#1d1e21)] text-xs">
                <div className="font-semibold text-[var(--text-2,#a1a1aa)] mb-2">Biến động số dư gần nhất:</div>
                {recentLedger.length === 0 ? (
                  <div className="text-[var(--text-3,#63636b)]">Chưa có biến động số dư</div>
                ) : (
                  <div className="space-y-1.5">
                    {recentLedger.map((ld) => (
                      <div key={ld.id} className="flex items-center justify-between font-mono">
                        <span className="text-[var(--text-3,#63636b)]">{new Date(ld.createdAt).toLocaleTimeString('vi-VN')}</span>
                        <span className="font-semibold text-[var(--text,#f4f4f5)]">{ld.asset}</span>
                        <span className={dec(ld.deltaAvailable).gte(0) ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}>
                          {dec(ld.deltaAvailable).gt(0) ? `+${ld.deltaAvailable}` : ld.deltaAvailable}
                        </span>
                        <span className="text-[var(--text-3,#63636b)]">{ld.type}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--line,#1d1e21)] flex gap-6 text-sm">
        <button
          onClick={() => setActiveTab('balances')}
          className={`pb-3 font-semibold transition-colors ${activeTab === 'balances' ? 'border-b-2 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]' : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'}`}
        >
          Số dư & Ví
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`pb-3 font-semibold transition-colors ${activeTab === 'orders' ? 'border-b-2 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]' : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'}`}
        >
          Lệnh Spot ({detail.openOrders} mở)
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`pb-3 font-semibold transition-colors ${activeTab === 'ledger' ? 'border-b-2 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]' : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'}`}
        >
          Sổ cái biến động
        </button>
        <button
          onClick={() => setActiveTab('futures')}
          className={`pb-3 font-semibold transition-colors ${activeTab === 'futures' ? 'border-b-2 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]' : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'}`}
        >
          Vị thế Futures ({detail.futures.openPositions})
        </button>
        <button
          onClick={() => setActiveTab('bots')}
          className={`pb-3 font-semibold transition-colors ${activeTab === 'bots' ? 'border-b-2 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]' : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'}`}
        >
          Bot ({detail.bots.runningGrid}) & DCA ({detail.bots.activeDca})
        </button>
        <button
          onClick={() => setActiveTab('logins')}
          className={`pb-3 font-semibold transition-colors ${activeTab === 'logins' ? 'border-b-2 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]' : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'}`}
        >
          Lịch sử Đăng nhập
        </button>
        <button
          onClick={() => setActiveTab('tax')}
          className={`pb-3 font-semibold transition-colors flex items-center gap-1.5 ${activeTab === 'tax' ? 'border-b-2 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]' : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'}`}
        >
          <Receipt size={14} />
          <span>Hồ sơ Thuế (TT 32/2026)</span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'balances' && (
        <div className="space-y-6">
          {/* Spot Balances */}
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow">
            <div className="px-5 py-4 border-b border-[var(--line,#1d1e21)] flex items-center justify-between">
              <span className="font-bold text-sm text-[var(--text,#f4f4f5)]">Số dư Spot</span>
              <span className="text-sm font-mono text-[var(--text-2,#a1a1aa)]">
                Ước tính: <strong className="text-[var(--text,#f4f4f5)] font-bold">{detail.totalValueUsdt}</strong> USDT
              </span>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)]">
                <tr>
                  <th className="px-5 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase">Tài sản</th>
                  <th className="px-5 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase">Khả dụng</th>
                  <th className="px-5 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase">Đang khóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line,#1d1e21)]">
                {detail.balances.map((b) => (
                  <tr key={b.asset} className="hover:bg-[var(--line,#1d1e21)]/10">
                    <td className="px-5 py-3 font-bold text-[var(--text,#f4f4f5)]">{b.asset}</td>
                    <td className="px-5 py-3 font-mono text-[var(--text,#f4f4f5)]">{b.available}</td>
                    <td className="px-5 py-3 font-mono text-[var(--text-3,#63636b)]">{b.locked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Futures Wallet */}
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-5 shadow">
            <h3 className="font-bold text-sm text-[var(--text,#f4f4f5)] mb-4">Ví Hợp đồng Futures</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-mono">
              <div className="bg-[var(--bg,#000000)] p-3 rounded-lg border border-[var(--line,#1d1e21)]">
                <div className="text-xs text-[var(--text-3,#63636b)] mb-1">Số dư ví</div>
                <div className="font-bold text-[var(--text,#f4f4f5)]">{detail.futures.walletBalance} USDT</div>
              </div>
              <div className="bg-[var(--bg,#000000)] p-3 rounded-lg border border-[var(--line,#1d1e21)]">
                <div className="text-xs text-[var(--text-3,#63636b)] mb-1">Khả dụng</div>
                <div className="font-bold text-[var(--text,#f4f4f5)]">{detail.futures.available} USDT</div>
              </div>
              <div className="bg-[var(--bg,#000000)] p-3 rounded-lg border border-[var(--line,#1d1e21)]">
                <div className="text-xs text-[var(--text-3,#63636b)] mb-1">Ký quỹ vị thế</div>
                <div className="font-bold text-[var(--text,#f4f4f5)]">{detail.futures.positionMargin} USDT</div>
              </div>
              <div className="bg-[var(--bg,#000000)] p-3 rounded-lg border border-[var(--line,#1d1e21)]">
                <div className="text-xs text-[var(--text-3,#63636b)] mb-1">PnL chưa thực hiện</div>
                <div className={`font-bold ${dec(detail.futures.unrealizedPnl || '0').gte(0) ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}`}>
                  {detail.futures.unrealizedPnl || '0.00000000'} USDT
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow">
          <div className="p-4 border-b border-[var(--line,#1d1e21)] flex items-center gap-3">
            <button
              onClick={() => setOrdersType('true')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${ordersType === 'true' ? 'bg-[var(--accent,#818cf8)] text-white' : 'bg-[var(--bg,#000000)] text-[var(--text-2,#a1a1aa)]'}`}
            >
              Lệnh đang mở
            </button>
            <button
              onClick={() => setOrdersType('false')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${ordersType === 'false' ? 'bg-[var(--accent,#818cf8)] text-white' : 'bg-[var(--bg,#000000)] text-[var(--text-2,#a1a1aa)]'}`}
            >
              Lịch sử lệnh
            </button>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)]">
              <tr>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Mã lệnh</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Cặp</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Loại</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Phe</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Giá</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Khối lượng</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Khớp</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line,#1d1e21)] font-mono text-xs">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-[var(--line,#1d1e21)]/10">
                  <td className="px-4 py-3 text-[var(--text-3,#63636b)]">{o.id.slice(0, 8)}...</td>
                  <td className="px-4 py-3 font-bold">
                    <a
                      href={appLinks.exchange.trade(o.symbol, exchangeOrigin)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent,#818cf8)] hover:underline inline-flex items-center gap-1 font-sans"
                    >
                      {o.symbol} <ExternalLink size={10} />
                    </a>
                  </td>
                  <td className="px-4 py-3">{o.type}</td>
                  <td className={`px-4 py-3 font-bold ${o.side === 'BUY' ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}`}>{o.side}</td>
                  <td className="px-4 py-3">{o.price || 'Thị trường'}</td>
                  <td className="px-4 py-3">{o.quantity || o.quoteOrderQty}</td>
                  <td className="px-4 py-3">{o.executedQty}</td>
                  <td className="px-4 py-3 text-[var(--text-2,#a1a1aa)]">{o.status}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[var(--text-3,#63636b)]">Không có lệnh nào</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Ledger Tab */}
      {activeTab === 'ledger' && (
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)]">
              <tr>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Thời gian</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Tài sản</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Biến động khả dụng</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Số dư sau</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Loại</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line,#1d1e21)] font-mono text-xs">
              {ledgerEntries.map((l) => (
                <tr key={l.id} className="hover:bg-[var(--line,#1d1e21)]/10">
                  <td className="px-4 py-3 text-[var(--text-3,#63636b)]">{new Date(l.createdAt).toLocaleString('vi-VN')}</td>
                  <td className="px-4 py-3 font-bold text-[var(--text,#f4f4f5)]">{l.asset}</td>
                  <td className={`px-4 py-3 font-bold ${dec(l.deltaAvailable).gte(0) ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}`}>
                    {dec(l.deltaAvailable).gt(0) ? `+${l.deltaAvailable}` : l.deltaAvailable}
                  </td>
                  <td className="px-4 py-3">{l.availableAfter}</td>
                  <td className="px-4 py-3 text-[var(--text-2,#a1a1aa)]">{l.type}</td>
                </tr>
              ))}
              {ledgerEntries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[var(--text-3,#63636b)]">Chưa có giao dịch sổ cái</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Futures Positions Tab */}
      {activeTab === 'futures' && (
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow">
          <div className="p-4 border-b border-[var(--line,#1d1e21)] flex items-center gap-3">
            <button
              onClick={() => setPositionsType('true')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${positionsType === 'true' ? 'bg-[var(--accent,#818cf8)] text-white' : 'bg-[var(--bg,#000000)] text-[var(--text-2,#a1a1aa)]'}`}
            >
              Vị thế đang mở
            </button>
            <button
              onClick={() => setPositionsType('false')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${positionsType === 'false' ? 'bg-[var(--accent,#818cf8)] text-white' : 'bg-[var(--bg,#000000)] text-[var(--text-2,#a1a1aa)]'}`}
            >
              Lịch sử vị thế
            </button>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)]">
              <tr>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Hợp đồng</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Vị thế</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Khối lượng</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Giá vào</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Giá đánh dấu</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">PnL chưa chốt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line,#1d1e21)] font-mono text-xs">
              {positions.map((p) => (
                <tr key={p.id} className="hover:bg-[var(--line,#1d1e21)]/10">
                  <td className="px-4 py-3 font-bold">
                    <a
                      href={appLinks.exchange.futures(p.symbol, exchangeOrigin)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent,#818cf8)] hover:underline inline-flex items-center gap-1 font-sans"
                    >
                      {p.symbol} <ExternalLink size={10} />
                    </a>
                  </td>
                  <td className={`px-4 py-3 font-bold ${p.side === 'LONG' ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}`}>
                    {p.side} {p.leverage}x
                  </td>
                  <td className="px-4 py-3">{p.quantity}</td>
                  <td className="px-4 py-3">{p.entryPrice}</td>
                  <td className="px-4 py-3">{p.markPrice || '—'}</td>
                  <td className={`px-4 py-3 font-bold ${dec(p.unrealizedPnl || '0').gte(0) ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}`}>
                    {p.unrealizedPnl || '0.00000000'} USDT
                  </td>
                </tr>
              ))}
              {positions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[var(--text-3,#63636b)]">Không có vị thế nào</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Bots Tab */}
      {activeTab === 'bots' && (
        <div className="space-y-6">
          {/* Grid Bots */}
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow">
            <div className="px-4 py-3 border-b border-[var(--line,#1d1e21)] font-bold text-sm text-[var(--text,#f4f4f5)]">
              Grid Trading Bots
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs text-[var(--text-2,#a1a1aa)]">
                <tr>
                  <th className="px-4 py-3">ID Bot</th>
                  <th className="px-4 py-3">Cặp</th>
                  <th className="px-4 py-3">Biên độ giá</th>
                  <th className="px-4 py-3">Lưới</th>
                  <th className="px-4 py-3">Vốn đầu tư</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line,#1d1e21)] font-mono text-xs">
                {userBots.grid.map((b) => (
                  <tr key={b.id} className="hover:bg-[var(--line,#1d1e21)]/10">
                    <td className="px-4 py-3">{b.id}</td>
                    <td className="px-4 py-3 font-bold text-[var(--text,#f4f4f5)]">{b.symbol}</td>
                    <td className="px-4 py-3">{b.lowerPrice} - {b.upperPrice}</td>
                    <td className="px-4 py-3">{b.gridCount}</td>
                    <td className="px-4 py-3">{b.investment} USDT</td>
                    <td className="px-4 py-3 text-[var(--accent,#818cf8)]">{b.status}</td>
                    <td className="px-4 py-3 text-right font-sans">
                      {hasPerm('bots.manage') && b.status === 'RUNNING' && (
                        <button
                          onClick={() => { setSelectedBotId(b.id); setConfirmAction('STOP_BOT'); setConfirmOpen(true); }}
                          className="px-2.5 py-1 rounded bg-[var(--down,#f2475f)]/10 hover:bg-[var(--down,#f2475f)]/20 text-[var(--down,#f2475f)] text-xs border border-[var(--down,#f2475f)]/30"
                        >
                          Dừng bot
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {userBots.grid.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-3,#63636b)] font-sans">Người dùng chưa tạo Grid Bot nào</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* DCA Plans */}
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow">
            <div className="px-4 py-3 border-b border-[var(--line,#1d1e21)] font-bold text-sm text-[var(--text,#f4f4f5)]">
              Kế hoạch mua định kỳ (DCA)
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs text-[var(--text-2,#a1a1aa)]">
                <tr>
                  <th className="px-4 py-3">ID Kế hoạch</th>
                  <th className="px-4 py-3">Cặp mua</th>
                  <th className="px-4 py-3">Số tiền mỗi lần</th>
                  <th className="px-4 py-3">Chu kỳ</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line,#1d1e21)] font-mono text-xs">
                {userBots.dca.map((d) => (
                  <tr key={d.id} className="hover:bg-[var(--line,#1d1e21)]/10">
                    <td className="px-4 py-3">{d.id}</td>
                    <td className="px-4 py-3 font-bold text-[var(--text,#f4f4f5)]">{d.symbol}</td>
                    <td className="px-4 py-3">{d.quoteAmount} USDT</td>
                    <td className="px-4 py-3">{d.interval}</td>
                    <td className="px-4 py-3 text-[var(--accent,#818cf8)]">{d.status}</td>
                    <td className="px-4 py-3 text-right font-sans">
                      {hasPerm('bots.manage') && d.status === 'ACTIVE' && (
                        <button
                          onClick={() => { setSelectedPlanId(d.id); setConfirmAction('CANCEL_DCA'); setConfirmOpen(true); }}
                          className="px-2.5 py-1 rounded bg-[var(--down,#f2475f)]/10 hover:bg-[var(--down,#f2475f)]/20 text-[var(--down,#f2475f)] text-xs border border-[var(--down,#f2475f)]/30"
                        >
                          Hủy kế hoạch
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {userBots.dca.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-3,#63636b)] font-sans">Người dùng chưa tạo kế hoạch DCA nào</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Logins Tab */}
      {activeTab === 'logins' && (
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs text-[var(--text-2,#a1a1aa)]">
              <tr>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3">Địa chỉ IP</th>
                <th className="px-4 py-3">Thiết bị / Trình duyệt</th>
                <th className="px-4 py-3">Đặc điểm</th>
                <th className="px-4 py-3">Kết quả</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line,#1d1e21)] font-mono text-xs">
              {allLogins.map((lg) => (
                <tr key={lg.id} className="hover:bg-[var(--line,#1d1e21)]/10">
                  <td className="px-4 py-3 text-[var(--text-3,#63636b)]">{new Date(lg.at).toLocaleString('vi-VN')}</td>
                  <td className="px-4 py-3">{lg.ip || '—'}</td>
                  <td className="px-4 py-3 text-[var(--text-2,#a1a1aa)] max-w-xs truncate" title={lg.device || ''}>{lg.device || '—'}</td>
                  <td className="px-4 py-3">
                    {lg.newDevice && (
                      <span className="px-2 py-0.5 rounded bg-amber-950/40 text-amber-400 border border-amber-800/40 text-[10px] font-sans">
                        Thiết bị mới
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-3 font-semibold ${lg.success ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}`}>
                    {lg.result === 'OK' ? 'Thành công' : lg.result}
                  </td>
                </tr>
              ))}
              {allLogins.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[var(--text-3,#63636b)] font-sans">Chưa có dữ liệu đăng nhập</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tax Profile Tab */}
      {activeTab === 'tax' && (
        <div className="space-y-6">
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow">
            <div className="p-4 border-b border-[var(--line,#1d1e21)] flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[var(--text,#f4f4f5)]">Nhật ký khấu trừ thuế của khách</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Thử nghiệm
                  </span>
                </div>
                <p className="text-xs text-[var(--text-3,#63636b)] mt-0.5">
                  Ghi nhận tự động khi lệnh bán Spot khớp thành công (sàn thử nghiệm, không nộp cho cơ quan nào)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={actualId ? exportUrl('adminTaxExport', { userId: actualId }) : '#'}
                  download
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line,#1d1e21)] text-xs text-[var(--text,#f4f4f5)] hover:bg-[var(--line,#1d1e21)]/40 transition-colors"
                >
                  <Download size={14} />
                  <span>Xuất CSV</span>
                </a>
              </div>
            </div>

            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs text-[var(--text-2,#a1a1aa)]">
                <tr>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3">Cặp GD</th>
                  <th className="px-4 py-3">Giá trị bán gộp</th>
                  <th className="px-4 py-3">Thuế suất</th>
                  <th className="px-4 py-3">Thuế khấu trừ (USDT)</th>
                  <th className="px-4 py-3">Tỷ giá VND</th>
                  <th className="px-4 py-3">Thuế VND</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line,#1d1e21)] font-mono text-xs">
                {taxLoading && taxWithholdings.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-3,#63636b)] font-sans">
                      Đang tải dữ liệu khấu trừ thuế...
                    </td>
                  </tr>
                )}
                {!taxLoading && taxWithholdings.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-3,#63636b)] font-sans">
                      Chưa có bản ghi khấu trừ nào.
                    </td>
                  </tr>
                )}
                {taxWithholdings.map((wh) => (
                  <tr key={wh.id} className="hover:bg-[var(--line,#1d1e21)]/10" data-testid="admin-tax-withholding-row" data-trade-id={wh.tradeId}>
                    <td className="px-4 py-3 text-[var(--text-3,#63636b)]">
                      {new Date(wh.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                    </td>
                    <td className="px-4 py-3 font-semibold text-[var(--text,#f4f4f5)]">{wh.symbol}</td>
                    <td className="px-4 py-3">{formatDecimal(wh.grossQuote, { decimals: 4 })} USDT</td>
                    <td className="px-4 py-3 text-amber-400">{dec(wh.taxRate).mul(100).toString()}%</td>
                    <td className="px-4 py-3 font-bold text-amber-400">{formatDecimal(wh.taxAmount, { decimals: 8 })} USDT</td>
                    <td className="px-4 py-3 text-[var(--text-2,#a1a1aa)]">{wh.vndRate ? `${formatDecimal(wh.vndRate, { decimals: 0 })} ₫` : '—'}</td>
                    <td className="px-4 py-3 text-[var(--text-2,#a1a1aa)]">{wh.taxVnd ? `${formatDecimal(wh.taxVnd, { decimals: 0 })} ₫` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {taxNextCursor && (
              <div className="p-4 border-t border-[var(--line,#1d1e21)] text-center">
                <button
                  type="button"
                  onClick={loadMoreTax}
                  disabled={taxLoading}
                  className="px-4 py-2 rounded-lg bg-[var(--line,#1d1e21)] text-xs text-[var(--text,#f4f4f5)] hover:bg-[var(--line,#1d1e21)]/80 transition-colors"
                >
                  {taxLoading ? 'Đang tải...' : 'Xem thêm bản ghi'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Role Change Modal */}
      {roleModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl w-full max-w-md p-6 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="text-[var(--accent,#818cf8)]" size={20} />
                <h2 className="text-lg font-bold text-[var(--text,#f4f4f5)]">Thay đổi vai trò thành viên</h2>
              </div>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="text-[var(--text-3,#63636b)] hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-[var(--text-2,#a1a1aa)]">
              Thay đổi quyền truy cập của <span className="font-semibold text-white">{detail.user.email}</span>. Các thay đổi sẽ có hiệu lực ngay lập tức và được ghi vào nhật ký kiểm toán.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">Chọn vai trò mới</label>
              <div className="space-y-1.5">
                {[
                  { r: 'user' as Role, name: 'USER - Khách hàng thường', desc: 'Giao dịch spot, nạp rút tiền, không có quyền quản trị' },
                  { r: 'support' as Role, name: 'SUPPORT - Chăm sóc khách hàng', desc: 'Chỉ đọc thông tin tài khoản và hỗ trợ khách hàng' },
                  { r: 'admin' as Role, name: 'ADMIN - Quản trị viên sàn', desc: 'Toàn quyền cấu hình sàn, phân quyền nhân sự, điều chỉnh' },
                  { r: 'owner' as Role, name: 'OWNER - Chủ sở hữu tối cao', desc: 'Quyền cao nhất của sàn giao dịch' },
                ].map((item) => (
                  <label
                    key={item.r}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      targetRole === item.r
                        ? 'border-[var(--accent,#818cf8)] bg-[var(--accent,#818cf8)]/10 text-white'
                        : 'border-[var(--line,#1d1e21)] bg-[var(--bg,#000000)] text-[var(--text-2,#a1a1aa)] hover:border-[var(--text-3,#63636b)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="targetRole"
                      value={item.r}
                      checked={targetRole === item.r}
                      onChange={() => setTargetRole(item.r)}
                      className="mt-1 accent-[var(--accent,#818cf8)]"
                    />
                    <div>
                      <div className="text-xs font-bold text-[var(--text,#f4f4f5)]">{item.name}</div>
                      <div className="text-[11px] text-[var(--text-3,#63636b)] mt-0.5">{item.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                Lý do thay đổi <span className="text-[var(--down,#f2475f)]">*</span> (≥ 5 ký tự)
              </label>
              <textarea
                data-testid="role-change-reason"
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] resize-none h-20 outline-none focus:border-[var(--accent,#818cf8)]"
                value={roleReason}
                onChange={(e) => setRoleReason(e.target.value)}
                placeholder="Nhập lý do thay đổi vai trò (quyết định bổ nhiệm, luân chuyển nhân sự...)..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-[var(--line,#1d1e21)]">
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-[var(--line,#1d1e21)] text-sm text-[var(--text-2,#a1a1aa)] hover:bg-[var(--line,#1d1e21)]/40 transition-colors"
                disabled={isSubmittingRole}
              >
                Hủy
              </button>
              <button
                type="button"
                data-testid="role-change-submit"
                onClick={handleRoleChangeSubmit}
                disabled={!roleReason || roleReason.trim().length < 5 || isSubmittingRole}
                className="px-4 py-2 rounded-lg bg-[var(--accent,#818cf8)] text-white text-sm font-medium hover:brightness-110 disabled:opacity-40 transition-all"
              >
                {isSubmittingRole ? 'Đang lưu...' : 'Xác nhận thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Balance Modal */}
      {adjustOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl w-full max-w-md p-6 flex flex-col gap-4 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-[var(--text,#f4f4f5)]">Thêm / bớt tiền cho khách</h2>
              <p className="text-xs text-[var(--text-2,#a1a1aa)] mt-1">
                Nhập số dương để cộng tiền, số âm để trừ tiền (ví dụ: <code className="text-white">500</code> hoặc <code className="text-white">-250.5</code>).
              </p>
            </div>

            {adjustError && (
              <div className="p-3 rounded-lg bg-[var(--down,#f2475f)]/10 border border-[var(--down,#f2475f)]/20 text-xs text-[var(--down,#f2475f)] flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{adjustError}</span>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">Tài sản</label>
              <select
                data-testid="adjust-asset"
                value={adjustAsset}
                onChange={(e) => setAdjustAsset(e.target.value)}
                className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
              >
                {detail.balances.length > 0
                  ? detail.balances.map((b) => <option key={b.asset} value={b.asset}>{b.asset}</option>)
                  : <option value="USDT">USDT</option>
                }
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">Số tiền (có dấu)</label>
              <input
                data-testid="adjust-amount"
                type="number"
                step="any"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="500 hoặc -250.5"
                className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono"
              />
            </div>

            {adjustAmount && calculatedAfter && (
              <div
                data-testid="adjust-preview"
                className="p-3 rounded-lg bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] text-xs font-mono"
              >
                <div className="text-[var(--text-3,#63636b)] mb-1">Xem trước số dư:</div>
                <div className="text-[var(--text,#f4f4f5)] font-semibold">
                  {currentAvailable} → {calculatedAfter} {adjustAsset}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                Lý do thao tác <span className="text-[var(--down,#f2475f)]">*</span> (≥ 5 ký tự)
              </label>
              <textarea
                data-testid="confirm-reason"
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] resize-none h-20 outline-none focus:border-[var(--accent,#818cf8)]"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Nhập lý do điều chỉnh số dư..."
              />
            </div>

            <div className="flex justify-end gap-3 mt-2 pt-2 border-t border-[var(--line,#1d1e21)]">
              <button
                type="button"
                onClick={() => setAdjustOpen(false)}
                className="px-4 py-2 rounded-lg border border-[var(--line,#1d1e21)] text-sm text-[var(--text-2,#a1a1aa)] hover:bg-[var(--line,#1d1e21)]/40 transition-colors"
                disabled={isSubmitting}
              >
                Hủy
              </button>
              <button
                data-testid="confirm-submit"
                type="button"
                onClick={handleAdjustSubmit}
                disabled={!adjustAmount || !adjustReason || adjustReason.trim().length < 5 || isSubmitting}
                className="px-4 py-2 rounded-lg bg-[var(--accent,#818cf8)] text-white text-sm font-medium hover:brightness-110 disabled:opacity-40 transition-all"
              >
                {isSubmitting ? 'Đang xử lý...' : 'Xác nhận điều chỉnh'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmOpen}
        title={
          confirmAction === 'LOCK' ? 'Khóa tài khoản nghi gian lận' :
          confirmAction === 'UNLOCK' ? 'Mở khóa tài khoản' :
          confirmAction === 'RESET' ? 'Reset toàn bộ tài khoản' :
          confirmAction === 'STOP_BOT' ? 'Dừng Grid Trading Bot' :
          confirmAction === 'CANCEL_DCA' ? 'Hủy kế hoạch mua định kỳ' :
          confirmAction === 'DEACTIVATE_USER' ? 'Đặt lại số dư và khóa tài khoản' :
          'Xác nhận thao tác'
        }
        consequenceText={
          confirmAction === 'LOCK' ? 'Khóa = đăng xuất mọi thiết bị ngay; lệnh đang mở vẫn giữ; người dùng không đăng nhập lại được cho tới khi mở khóa.' :
          confirmAction === 'UNLOCK' ? 'Người dùng sẽ có thể đăng nhập lại vào web sàn và tiếp tục giao dịch bình thường.' :
          confirmAction === 'RESET' ? 'Hủy toàn bộ lệnh mở, đưa toàn bộ số dư về 0, xóa lịch sử faucet. Không thể hoàn tác!' :
          confirmAction === 'STOP_BOT' ? 'Hủy toàn bộ lệnh đang mở của bot này. Thao tác sẽ được ghi vào nhật ký.' :
          confirmAction === 'CANCEL_DCA' ? 'Hủy kế hoạch định kỳ này. Thao tác sẽ được ghi vào nhật ký.' :
          confirmAction === 'DEACTIVATE_USER' ? 'Tài khoản sẽ bị hủy toàn bộ lệnh mở, đưa toàn bộ số dư về 0 (ACCOUNT_RESET) và khóa tài khoản. Số dư không thể hoàn tác, nhưng tài khoản có thể mở khóa lại sau.' :
          'Hành động này sẽ được ghi nhận vào nhật ký quản trị của sàn.'
        }
        quickReasons={
          confirmAction === 'LOCK' ? [
            'Nhiều tài khoản cùng thiết bị',
            'Nạp tiền bất thường',
            'Nghi chiếm tài khoản',
            'Yêu cầu hỗ trợ từ khách hàng',
          ] : confirmAction === 'DEACTIVATE_USER' ? [
            'Khách hàng yêu cầu đóng tài khoản',
            'Vi phạm nghiêm trọng quy chế giao dịch & AML',
            'Tài khoản giả mạo / spam',
            'Xử lý vi phạm theo quy định nội bộ',
          ] : undefined
        }
        requirePhrase={
          confirmAction === 'RESET' ? 'RESET' :
          confirmAction === 'DEACTIVATE_USER' ? 'DEACTIVATE' : undefined
        }
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmOpen(false)}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};
