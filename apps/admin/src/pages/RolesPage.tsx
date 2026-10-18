import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatApiError } from '../services/errors';
import type { AdminUserSummary, Role } from '@cex/contracts';
import { Shield, ShieldAlert, UserCheck, UserPlus, ShieldCheck, X } from 'lucide-react';

export const RolesPage: React.FC = () => {
  const { user: currentUser, hasPerm } = useAuth();
  const [staffUsers, setStaffUsers] = useState<AdminUserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Change role state (2 steps)
  const [targetUser, setTargetUser] = useState<AdminUserSummary | null>(null);
  const [newRole, setNewRole] = useState<Role>('support');
  const [roleStep, setRoleStep] = useState<1 | 2>(1);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const api = getApiClient();
  const isOwner = currentUser?.role === 'owner' || hasPerm('users.roles');

  const loadStaffUsers = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const fetchAllUsersForRole = async (role: Role) => {
        let items: AdminUserSummary[] = [];
        let cursor: string | null = null;
        while (true) {
          const res = await api.adminListUsers({ query: { role, cursor: cursor || undefined, limit: 50 } });
          items = [...items, ...res.items];
          if (!res.nextCursor || res.items.length === 0) break;
          cursor = res.nextCursor;
        }
        return items;
      };

      const [supportItems, adminItems, ownerItems] = await Promise.all([
        fetchAllUsersForRole('support'),
        fetchAllUsersForRole('admin'),
        fetchAllUsersForRole('owner'),
      ]);

      const all = [...ownerItems, ...adminItems, ...supportItems];
      // deduplicate
      const map = new Map<string, AdminUserSummary>();
      all.forEach((u) => map.set(u.id, u));
      setStaffUsers(Array.from(map.values()));
    } catch (e: any) {
      setLoadError(formatApiError(e, 'Không thể tải danh sách nhân sự.'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStaffUsers();
  }, []);

  const handleOpenChangeRole = (u: AdminUserSummary) => {
    setTargetUser(u);
    setNewRole(u.role);
    setRoleStep(1);
    setRoleError(null);
  };

  const handleCloseRoleModal = () => {
    setTargetUser(null);
    setRoleStep(1);
    setRoleError(null);
  };

  const handleConfirmRole = async (reason: string) => {
    if (!targetUser) return;
    setIsSubmitting(true);
    setRoleError(null);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await api.adminSetRole({
        params: { userId: targetUser.id },
        body: { role: newRole, reason },
      });
      setSuccessMsg(`Đã cập nhật vai trò của ${targetUser.email} thành ${newRole.toUpperCase()} thành công.`);
      handleCloseRoleModal();
      loadStaffUsers();
    } catch (err: any) {
      setRoleError(formatApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">Nhân sự & Phân quyền</h1>
          <p className="text-sm text-[var(--text-2,#a1a1aa)] mt-1">
            Danh sách nhân sự quản trị sàn, kiểm tra bảo mật 2FA và phân quyền vai trò (Owner only) (đã tải {staffUsers.length} nhân sự)
          </p>
        </div>

        {/* Mục 3 CHỜ BACKEND: Nút Tạo tài khoản nhân sự */}
        <button
          disabled
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--line,#1d1e21)]/40 border border-[var(--line,#1d1e21)] text-xs text-[var(--text-3,#63636b)] cursor-not-allowed"
          title="Chờ backend hỗ trợ API tạo tài khoản nhân sự trực tiếp"
        >
          <UserPlus size={14} />
          <span>Tạo tài khoản nhân sự</span>
          <span className="text-[10px] px-1 py-0.2 bg-[var(--line,#1d1e21)] rounded text-[var(--text-3,#63636b)]">Sắp có</span>
        </button>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-[var(--up,#1fc27a)]/10 border border-[var(--up,#1fc27a)]/20 text-sm text-[var(--up,#1fc27a)] flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="font-bold">×</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-[var(--down,#f2475f)]/10 border border-[var(--down,#f2475f)]/20 text-sm text-[var(--down,#f2475f)] flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-bold">×</button>
        </div>
      )}

      {/* Role explanation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-4">
          <div className="font-bold text-sm text-blue-400 mb-1">Support (Hỗ trợ)</div>
          <p className="text-[var(--text-2,#a1a1aa)]">
            Chỉ xem thông tin khách hàng, lệnh, sổ cái, lịch sử đăng nhập. Không có quyền sửa đổi dữ liệu.
          </p>
        </div>
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-4">
          <div className="font-bold text-sm text-indigo-400 mb-1">Admin (Quản trị viên)</div>
          <p className="text-[var(--text-2,#a1a1aa)]">
            Cộng/trừ số dư, khóa/mở khóa khách, dừng sàn, cấu hình biểu phí, duyệt thông báo và mã mời.
          </p>
        </div>
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-4">
          <div className="font-bold text-sm text-purple-400 mb-1">Owner (Chủ sở hữu)</div>
          <p className="text-[var(--text-2,#a1a1aa)]">
            Toàn quyền quản trị cao nhất, được phép thay đổi vai trò phân quyền nhân sự khác.
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow-lg">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase">
            <tr>
              <th className="px-5 py-3">UID</th>
              <th className="px-5 py-3">Email nhân viên</th>
              <th className="px-5 py-3">Tên hiển thị</th>
              <th className="px-5 py-3">Vai trò</th>
              <th className="px-5 py-3">Bảo mật 2FA (Bắt buộc)</th>
              <th className="px-5 py-3">Trạng thái</th>
              {isOwner && <th className="px-5 py-3 text-right">Phân quyền</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line,#1d1e21)]">
            {staffUsers.map((u) => {
              const isSelf = currentUser?.id === u.id;
              return (
                <tr key={u.id} className="hover:bg-[var(--line,#1d1e21)]/15">
                  <td className="px-5 py-3 font-mono font-medium text-[var(--accent,#818cf8)]">{u.uid}</td>
                  <td className="px-5 py-3 font-medium text-[var(--text,#f4f4f5)]">
                    {u.email} {isSelf && <span className="text-xs text-[var(--text-3,#63636b)]">(Bạn)</span>}
                  </td>
                  <td className="px-5 py-3 text-[var(--text-2,#a1a1aa)]">{u.name || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold uppercase ${
                      u.role === 'owner' ? 'bg-purple-950/60 text-purple-400 border border-purple-800/40' :
                      u.role === 'admin' ? 'bg-indigo-950/60 text-indigo-400 border border-indigo-800/40' :
                      'bg-blue-950/60 text-blue-400 border border-blue-800/40'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {u.twoFactorEnabled ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--up,#1fc27a)] font-medium">
                        <ShieldCheck size={14} />
                        Đã bật 2FA
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--down,#f2475f)] font-bold">
                        <ShieldAlert size={14} />
                        Chưa bật 2FA (Không thể vào Admin)
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs text-[var(--up,#1fc27a)] font-medium">Hoạt động</span>
                  </td>
                  {isOwner && (
                    <td className="px-5 py-3 text-right">
                      {!isSelf ? (
                        <button
                          onClick={() => handleOpenChangeRole(u)}
                          className="px-3 py-1 rounded bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-xs font-medium border border-[var(--line,#1d1e21)] text-[var(--text,#f4f4f5)] transition-colors"
                        >
                          Đổi vai trò
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--text-3,#63636b)]">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {loadError && staffUsers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center">
                  <div data-testid="list-error" className="flex flex-col items-center justify-center gap-3">
                    <p className="text-sm text-[var(--down,#f2475f)]">{loadError}</p>
                    <button
                      type="button"
                      onClick={() => loadStaffUsers()}
                      className="px-3.5 py-1.5 rounded-lg bg-[var(--accent,#818cf8)] text-white text-xs font-semibold hover:brightness-110 transition-all"
                    >
                      Thử lại
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {!isLoading && !loadError && staffUsers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-[var(--text-3,#63636b)]">
                  Chưa có tài khoản nhân sự nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Step 1: Modal chọn vai trò */}
      {targetUser && roleStep === 1 && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl w-full max-w-md p-6 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line,#1d1e21)] pb-3">
              <h2 className="text-lg font-bold text-[var(--text,#f4f4f5)]">Thay đổi vai trò nhân sự</h2>
              <button onClick={handleCloseRoleModal} className="text-[var(--text-3,#63636b)] hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-3 bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg text-xs space-y-1">
              <div>Thành viên: <strong className="text-white">{targetUser.email}</strong></div>
              <div>UID: <span className="font-mono text-[var(--accent,#818cf8)]">{targetUser.uid}</span></div>
              <div>Vai trò hiện tại: <strong className="uppercase text-amber-400">{targetUser.role}</strong></div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">Chọn vai trò mới</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as Role)}
                className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
              >
                <option value="support">Support — Chỉ xem dữ liệu</option>
                <option value="admin">Admin — Quản trị thao tác sàn</option>
                <option value="owner">Owner — Toàn quyền chủ sở hữu</option>
                <option value="user">User — Giáng cấp về khách thường</option>
              </select>
              {newRole === targetUser.role && (
                <span className="text-[11px] text-amber-400">Vui lòng chọn vai trò mới khác với vai trò hiện tại ({targetUser.role.toUpperCase()})</span>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-[var(--line,#1d1e21)]">
              <button
                type="button"
                onClick={handleCloseRoleModal}
                className="px-4 py-2 rounded-lg border border-[var(--line,#1d1e21)] text-xs text-[var(--text-2,#a1a1aa)] hover:bg-[var(--line,#1d1e21)] transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={newRole === targetUser.role}
                onClick={() => setRoleStep(2)}
                className="px-4 py-2 rounded-lg bg-[var(--accent,#818cf8)] hover:brightness-110 text-white text-xs font-bold transition-all disabled:opacity-50"
              >
                Tiếp tục
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Modal xác nhận với lý do */}
      {targetUser && roleStep === 2 && (
        <ConfirmDialog
          isOpen={true}
          title={`Xác nhận đổi vai trò của ${targetUser.email}`}
          consequenceText={`Vai trò của nhân viên sẽ chuyển từ ${targetUser.role.toUpperCase()} sang ${newRole.toUpperCase()}. Có hiệu lực ngay lập tức.`}
          onConfirm={handleConfirmRole}
          onCancel={() => setRoleStep(1)}
          isSubmitting={isSubmitting}
          error={roleError}
        />
      )}
    </div>
  );
};
