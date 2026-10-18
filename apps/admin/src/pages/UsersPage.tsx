import React, { useState, useEffect, useCallback } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { AdminUserSummary, Role, CreatedInvite } from '@cex/contracts';
import {
  Copy,
  Check,
  UserPlus,
  AlertTriangle,
  Lock,
  Unlock,
  Shield,
  ArrowRight,
  UserCheck,
  X,
  RefreshCw,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatApiError } from '../services/errors';

export const UsersPage: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const { hasPerm, user: currentUser } = useAuth();
  const api = getApiClient();

  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'locked' | ''>('');
  const [copiedUid, setCopiedUid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Modal Thêm thành viên
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<Role>('user');
  const [inviteUses, setInviteUses] = useState('1');
  const [inviteNote, setInviteNote] = useState('');
  const [createdInvite, setCreatedInvite] = useState<CreatedInvite | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Quick Action Dialogs
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [actionType, setActionType] = useState<'LOCK' | 'UNLOCK' | 'CHANGE_ROLE' | null>(null);
  const [newRole, setNewRole] = useState<Role>('user');
  const [roleReason, setRoleReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const fetchUsers = useCallback((cursor?: string) => {
    if (cursor) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setLoadError(null);
    api.adminListUsers({
      query: {
        q: query.trim() || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        cursor,
        limit: 50,
      },
    })
      .then((res) => {
        if (cursor) {
          setUsers((prev) => [...prev, ...res.items]);
        } else {
          setUsers(res.items);
        }
        setNextCursor(res.nextCursor);
      })
      .catch((e: any) => {
        setLoadError(formatApiError(e, 'Không thể tải danh sách người dùng.'));
      })
      .finally(() => {
        setIsLoading(false);
        setIsLoadingMore(false);
      });
  }, [api, query, roleFilter, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => fetchUsers(), 250);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  const copyToClipboard = (e: React.MouseEvent, uid: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(uid);
    setCopiedUid(uid);
    setTimeout(() => setCopiedUid(null), 2000);
  };

  const handleCreateInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingInvite(true);
    setInviteError(null);
    try {
      const res = await api.adminCreateInvite({
        body: {
          note: inviteNote.trim() ? `[Vai trò: ${inviteRole}] ${inviteNote.trim()}` : `Mời thành viên vai trò ${inviteRole}`,
          maxUses: parseInt(inviteUses, 10) || 1,
        },
      });
      setCreatedInvite(res);
      setInviteNote('');
    } catch (err: any) {
      setInviteError(formatApiError(err, 'Không thể tạo mã mời.'));
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const copyCreatedInvite = () => {
    if (!createdInvite) return;
    navigator.clipboard.writeText(createdInvite.code);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  const handleOpenLock = (e: React.MouseEvent, u: AdminUserSummary) => {
    e.stopPropagation();
    setSelectedUser(u);
    setActionError(null);
    setActionType('LOCK');
  };

  const handleOpenUnlock = (e: React.MouseEvent, u: AdminUserSummary) => {
    e.stopPropagation();
    setSelectedUser(u);
    setActionError(null);
    setActionType('UNLOCK');
  };

  const handleOpenChangeRole = (e: React.MouseEvent, u: AdminUserSummary) => {
    e.stopPropagation();
    setSelectedUser(u);
    setNewRole(u.role);
    setRoleReason('');
    setActionError(null);
    setActionType('CHANGE_ROLE');
  };

  const handleConfirmLockOrUnlock = async (reason: string) => {
    if (!selectedUser) return;
    setIsSubmittingAction(true);
    setActionError(null);
    try {
      if (actionType === 'LOCK') {
        await api.adminLockUser({ params: { userId: selectedUser.id }, body: { reason } });
        setActionSuccessMsg(`Đã khóa thành công tài khoản ${selectedUser.email}`);
      } else if (actionType === 'UNLOCK') {
        await api.adminUnlockUser({ params: { userId: selectedUser.id }, body: { reason } });
        setActionSuccessMsg(`Đã mở khóa thành công tài khoản ${selectedUser.email}`);
      }
      setActionType(null);
      setSelectedUser(null);
      setActionError(null);
      fetchUsers();
    } catch (err: any) {
      setActionError(formatApiError(err));
    } finally {
      setIsSubmittingAction(false);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    }
  };

  const handleConfirmRoleSubmit = async () => {
    if (!selectedUser || !roleReason || roleReason.trim().length < 5) return;
    setIsSubmittingAction(true);
    setActionError(null);
    try {
      await api.adminSetRole({
        params: { userId: selectedUser.id },
        body: { role: newRole, reason: roleReason.trim() },
      });
      setActionSuccessMsg(`Đã cập nhật vai trò của ${selectedUser.email} thành ${newRole.toUpperCase()}`);
      setActionType(null);
      setSelectedUser(null);
      setActionError(null);
      fetchUsers();
    } catch (err: any) {
      setActionError(formatApiError(err));
    } finally {
      setIsSubmittingAction(false);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4 border-b border-[var(--line,#1d1e21)] pb-5">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">Quản lý Thành viên & Người dùng</h1>
          <p className="text-sm text-[var(--text-2,#a1a1aa)] mt-1">
            Tra cứu, thêm mới, kiểm soát trạng thái khóa/mở khóa và phân quyền vai trò cho thành viên sàn
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            data-testid="admin-add-user-open"
            onClick={() => setIsAddUserOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--accent,#818cf8)] hover:brightness-110 text-xs font-bold text-white shadow-md transition-all"
          >
            <UserPlus size={15} />
            <span>Thêm thành viên</span>
          </button>
        </div>
      </div>

      {actionSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-[var(--up,#1fc27a)]/10 border border-[var(--up,#1fc27a)]/30 text-xs text-[var(--up,#1fc27a)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check size={15} />
            <span className="font-semibold">{actionSuccessMsg}</span>
          </div>
          <button onClick={() => setActionSuccessMsg(null)} className="font-bold opacity-70 hover:opacity-100">×</button>
        </div>
      )}

      {/* Tabs navigation */}
      <div className="flex border-b border-[var(--line,#1d1e21)] mb-6 gap-6">
        <button className="pb-3 border-b-2 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)] font-semibold text-sm">
          Danh sách tài khoản (đã tải {users.length})
        </button>
        <button
          onClick={() => onNavigate('/admin/roles')}
          className="pb-3 text-sm text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)] font-semibold flex items-center gap-1.5 transition-colors"
        >
          <Shield size={14} />
          <span>Danh sách Nhân sự & 2FA</span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex-1 min-w-[280px] max-w-md">
          <input
            type="text"
            data-testid="admin-user-search"
            placeholder="Tìm theo UID 8 số, email hoặc ID..."
            className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3.5 py-2 text-sm text-[var(--text,#f4f4f5)] placeholder-[var(--text-3,#63636b)] outline-none focus:border-[var(--accent,#818cf8)]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as Role | '')}
          className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text-2,#a1a1aa)] outline-none focus:border-[var(--accent,#818cf8)]"
        >
          <option value="">Tất cả vai trò</option>
          <option value="user">User (Khách)</option>
          <option value="support">Support (Hỗ trợ)</option>
          <option value="operator">Operator (Vận hành)</option>
          <option value="admin">Admin (Quản trị)</option>
          <option value="owner">Owner (Chủ sàn)</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'active' | 'locked' | '')}
          className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text-2,#a1a1aa)] outline-none focus:border-[var(--accent,#818cf8)]"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="locked">Bị khóa</option>
        </select>

        <button
          onClick={() => fetchUsers()}
          className="p-2 rounded-lg bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)] hover:bg-[var(--line,#1d1e21)] transition-colors"
          title="Tải lại danh sách"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Users table */}
      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow-lg">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)]">
            <tr>
              <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase tracking-wider">UID</th>
              <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase tracking-wider">Email</th>
              <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase tracking-wider">Tên hiển thị</th>
              <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase tracking-wider">Vai trò</th>
              <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase tracking-wider">2FA</th>
              <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase tracking-wider">Trạng thái</th>
              <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase tracking-wider text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line,#1d1e21)]">
            {users.map((u) => {
              const isLocked = u.status === 'locked';
              const isSelf = currentUser?.id === u.id;
              const isProtected = u.isBot || isSelf;

              return (
                <tr
                  key={u.id}
                  data-testid="admin-user-row"
                  className="hover:bg-[var(--line,#1d1e21)]/20 cursor-pointer transition-colors"
                  onClick={() => onNavigate(`/admin/users/${u.uid}`)}
                >
                  <td className="px-4 py-3 font-mono text-[var(--accent,#818cf8)] font-medium">
                    <div className="flex items-center gap-1.5">
                      <span>{u.uid}</span>
                      <button
                        onClick={(e) => copyToClipboard(e, u.uid)}
                        className="p-1 rounded hover:bg-[var(--line,#1d1e21)] text-[var(--text-3,#63636b)] hover:text-[var(--text,#f4f4f5)]"
                        title="Sao chép UID"
                      >
                        {copiedUid === u.uid ? <Check size={12} className="text-[var(--up,#1fc27a)]" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-[var(--text,#f4f4f5)]">{u.email}</td>
                  <td className="px-4 py-3 text-[var(--text-2,#a1a1aa)]">{u.name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium uppercase ${
                      u.role === 'owner' ? 'bg-purple-950/60 text-purple-400 border border-purple-800/40' :
                      u.role === 'admin' ? 'bg-indigo-950/60 text-indigo-400 border border-indigo-800/40' :
                      u.role === 'support' ? 'bg-blue-950/60 text-blue-400 border border-blue-800/40' :
                      'bg-[var(--line,#1d1e21)]/60 text-[var(--text-2,#a1a1aa)]'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.twoFactorEnabled ? (
                      <span className="text-xs text-[var(--up,#1fc27a)] font-medium">Bật</span>
                    ) : (
                      <span className="text-xs text-[var(--text-3,#63636b)]">Tắt</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isLocked ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-[var(--down,#f2475f)]/10 text-[var(--down,#f2475f)] border border-[var(--down,#f2475f)]/20 font-medium">
                        Bị khóa
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-[var(--up,#1fc27a)]/10 text-[var(--up,#1fc27a)] border border-[var(--up,#1fc27a)]/20 font-medium">
                        Hoạt động
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {/* Change Role Button */}
                      {hasPerm('users.roles') && !u.isBot && (
                        <button
                          onClick={(e) => handleOpenChangeRole(e, u)}
                          className="p-1.5 rounded-lg bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)] hover:text-[var(--accent,#818cf8)] hover:border-[var(--accent,#818cf8)]/40 transition-colors"
                          title="Đổi vai trò thành viên"
                        >
                          <Shield size={14} />
                        </button>
                      )}

                      {/* Lock / Unlock Button */}
                      {hasPerm('users.lock') && !isProtected && (
                        isLocked ? (
                          <button
                            onClick={(e) => handleOpenUnlock(e, u)}
                            className="p-1.5 rounded-lg bg-[var(--up,#1fc27a)]/10 border border-[var(--up,#1fc27a)]/30 text-[var(--up,#1fc27a)] hover:bg-[var(--up,#1fc27a)]/20 transition-colors"
                            title="Mở khóa tài khoản"
                          >
                            <Unlock size={14} />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => handleOpenLock(e, u)}
                            className="p-1.5 rounded-lg bg-[var(--down,#f2475f)]/10 border border-[var(--down,#f2475f)]/30 text-[var(--down,#f2475f)] hover:bg-[var(--down,#f2475f)]/20 transition-colors"
                            title="Khóa tài khoản nghi gian lận"
                          >
                            <Lock size={14} />
                          </button>
                        )
                      )}

                      {/* Detail navigation arrow */}
                      <button
                        onClick={() => onNavigate(`/admin/users/${u.uid}`)}
                        className="p-1.5 rounded-lg bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)] transition-colors"
                        title="Xem chi tiết"
                      >
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {loadError && users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div data-testid="list-error" className="flex flex-col items-center justify-center gap-3">
                    <p className="text-sm text-[var(--down,#f2475f)]">{loadError}</p>
                    <button
                      type="button"
                      onClick={() => fetchUsers()}
                      className="px-3.5 py-1.5 rounded-lg bg-[var(--accent,#818cf8)] text-white text-xs font-semibold hover:brightness-110 transition-all"
                    >
                      Thử lại
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {!isLoading && !loadError && users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[var(--text-3,#63636b)]">
                  Không tìm thấy người dùng nào phù hợp với bộ lọc
                </td>
              </tr>
            )}
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[var(--text-2,#a1a1aa)]">
                  Đang tải danh sách người dùng...
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {nextCursor && (
          <div className="p-4 border-t border-[var(--line,#1d1e21)] flex justify-center">
            <button
              onClick={() => fetchUsers(nextCursor)}
              disabled={isLoadingMore}
              data-testid="list-more"
              className="px-4 py-2 rounded-lg bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-xs font-semibold text-[var(--text,#f4f4f5)] transition-colors disabled:opacity-50"
            >
              {isLoadingMore ? 'Đang tải...' : 'Xem thêm'}
            </button>
          </div>
        )}
      </div>

      {/* MODAL: Thêm thành viên */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line,#1d1e21)] pb-3">
              <h3 className="text-lg font-bold text-[var(--text,#f4f4f5)] flex items-center gap-2">
                <UserPlus size={18} className="text-[var(--accent,#818cf8)]" />
                <span>Tạo Mã Mời Thành Viên</span>
              </h3>
              <button onClick={() => { setIsAddUserOpen(false); setCreatedInvite(null); }} className="text-[var(--text-3,#63636b)] hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {createdInvite ? (
                <div className="p-4 rounded-xl bg-[var(--up,#1fc27a)]/10 border border-[var(--up,#1fc27a)]/30 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--up,#1fc27a)]">
                    <Check size={16} />
                    <span>Đã tạo mã mời thành công!</span>
                  </div>

                  <div className="p-3 bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg flex items-center justify-between">
                    <span className="font-mono text-base font-bold text-[var(--accent,#818cf8)] tracking-wider">
                      {createdInvite.code}
                    </span>
                    <button
                      onClick={copyCreatedInvite}
                      className="px-3 py-1.5 rounded bg-[var(--accent,#818cf8)] hover:brightness-110 text-white text-xs font-bold transition-all flex items-center gap-1"
                    >
                      {copiedInvite ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedInvite ? 'Đã chép' : 'Sao chép'}</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-[var(--text-2,#a1a1aa)] leading-relaxed">
                    Mã này chỉ hiển thị một lần. Hãy gửi mã này cho thành viên để họ nhập khi đăng ký tài khoản tại web sàn.
                  </p>

                  <button
                    onClick={() => setCreatedInvite(null)}
                    className="w-full py-2 rounded-lg bg-[var(--line,#1d1e21)] text-xs text-[var(--text-2,#a1a1aa)] hover:text-white transition-colors"
                  >
                    Tạo mã mời khác
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCreateInviteSubmit} className="space-y-4">
                  {inviteError && (
                    <div className="p-3 rounded-lg bg-[var(--down,#f2475f)]/10 border border-[var(--down,#f2475f)]/30 text-xs text-[var(--down,#f2475f)]">
                      {inviteError}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                      Vai trò dự kiến của thành viên
                    </label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as Role)}
                      className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
                    >
                      <option value="user">User (Khách giao dịch bình thường)</option>
                      <option value="support">Support (Nhân viên chăm sóc khách hàng)</option>
                      <option value="operator">Operator (Vận hành viên sàn)</option>
                      <option value="admin">Admin (Quản trị viên)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                        Số lượt dùng tối đa
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={inviteUses}
                        onChange={(e) => setInviteUses(e.target.value)}
                        className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                        Ghi chú / Mục đích
                      </label>
                      <input
                        type="text"
                        placeholder="Ví dụ: Cấp cho đối tác..."
                        value={inviteNote}
                        onChange={(e) => setInviteNote(e.target.value)}
                        className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-2 border-t border-[var(--line,#1d1e21)]">
                    <button
                      type="button"
                      onClick={() => setIsAddUserOpen(false)}
                      className="px-4 py-2 rounded-lg border border-[var(--line,#1d1e21)] text-xs text-[var(--text-2,#a1a1aa)] hover:bg-[var(--line,#1d1e21)] transition-colors"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={isCreatingInvite}
                      className="px-4 py-2 rounded-lg bg-[var(--accent,#818cf8)] hover:brightness-110 text-white text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {isCreatingInvite ? 'Đang tạo...' : 'Tạo mã mời'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Đổi vai trò thành viên */}
      {actionType === 'CHANGE_ROLE' && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-[var(--text,#f4f4f5)] flex items-center gap-2">
              <Shield size={18} className="text-[var(--accent,#818cf8)]" />
              <span>Thay Đổi Vai Trò Thành Viên</span>
            </h3>

            {actionError && (
              <div
                data-testid="confirm-error"
                className="p-3 rounded-lg bg-[var(--down,#f2475f)]/15 border border-[var(--down,#f2475f)]/30 text-xs text-[var(--down,#f2475f)] leading-relaxed"
              >
                {actionError}
              </div>
            )}

            <div className="p-3 bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg text-xs space-y-1">
              <div>Thành viên: <strong className="text-[var(--text,#f4f4f5)]">{selectedUser.email}</strong></div>
              <div>UID: <span className="font-mono text-[var(--accent,#818cf8)]">{selectedUser.uid}</span></div>
              <div>Vai trò hiện tại: <span className="font-bold uppercase text-amber-400">{selectedUser.role}</span></div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                Chọn vai trò mới
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as Role)}
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-semibold"
              >
                <option value="user">User (Khách giao dịch bình thường)</option>
                <option value="support">Support (Nhân viên hỗ trợ, chỉ xem)</option>
                <option value="admin">Admin (Quản trị viên toàn quyền)</option>
                <option value="owner">Owner (Chủ sở hữu sàn)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                Lý do thay đổi <span className="text-[var(--down,#f2475f)]">*</span> (≥ 5 ký tự)
              </label>
              <textarea
                data-testid="confirm-reason"
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] resize-none h-20 outline-none focus:border-[var(--accent,#818cf8)]"
                value={roleReason}
                onChange={(e) => setRoleReason(e.target.value)}
                placeholder="Ví dụ: Bổ nhiệm làm hỗ trợ viên ca trực..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-[var(--line,#1d1e21)]">
              <button
                type="button"
                onClick={() => { setActionType(null); setSelectedUser(null); setActionError(null); }}
                className="px-4 py-2 rounded-lg border border-[var(--line,#1d1e21)] text-xs text-[var(--text-2,#a1a1aa)] hover:bg-[var(--line,#1d1e21)] transition-colors"
                disabled={isSubmittingAction}
              >
                Hủy
              </button>
              <button
                data-testid="confirm-submit"
                type="button"
                onClick={handleConfirmRoleSubmit}
                disabled={!roleReason || roleReason.trim().length < 5 || isSubmittingAction}
                className="px-4 py-2 rounded-lg bg-[var(--accent,#818cf8)] hover:brightness-110 text-white text-xs font-bold transition-all disabled:opacity-40"
              >
                {isSubmittingAction ? 'Đang cập nhật...' : 'Xác nhận đổi vai trò'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog for Quick Lock / Unlock */}
      <ConfirmDialog
        isOpen={actionType === 'LOCK' || actionType === 'UNLOCK'}
        title={actionType === 'LOCK' ? 'Khóa tài khoản thành viên' : 'Mở khóa tài khoản thành viên'}
        consequenceText={
          actionType === 'LOCK'
            ? `Tài khoản ${selectedUser?.email} sẽ bị ngắt kết nối WebSocket và đăng xuất lập tức khỏi mọi thiết bị. Lệnh đang mở vẫn được giữ nguyên cho tới khi xử lý.`
            : `Tài khoản ${selectedUser?.email} sẽ được phép đăng nhập lại vào hệ thống và giao dịch bình thường.`
        }
        onConfirm={handleConfirmLockOrUnlock}
        onCancel={() => { setActionType(null); setSelectedUser(null); setActionError(null); }}
        isSubmitting={isSubmittingAction}
        error={actionError}
      />
    </div>
  );
};
