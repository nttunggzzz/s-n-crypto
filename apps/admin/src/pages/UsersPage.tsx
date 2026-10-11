import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import type { AdminUserSummary, Role } from '@cex/contracts';
import { Copy, Check, UserPlus, AlertTriangle } from 'lucide-react';

export const UsersPage: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'locked' | ''>('');
  const [copiedUid, setCopiedUid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const api = getApiClient();

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      api.adminListUsers({
        query: {
          q: query.trim() || undefined,
          role: roleFilter || undefined,
          status: statusFilter || undefined,
          limit: 50,
        },
      })
        .then((res) => {
          setUsers(res.items);
        })
        .catch(() => {})
        .finally(() => {
          setIsLoading(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, roleFilter, statusFilter]);

  const copyToClipboard = (e: React.MouseEvent, uid: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(uid);
    setCopiedUid(uid);
    setTimeout(() => setCopiedUid(null), 2000);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">Quản lý người dùng</h1>
          <p className="text-sm text-[var(--text-2,#a1a1aa)] mt-1">
            Tra cứu, kiểm soát trạng thái và số dư của tài khoản người dùng sàn
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Mục 3 CHỜ BACKEND: chừa chỗ nút Tạo tài khoản */}
          <button
            disabled
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--line,#1d1e21)]/40 border border-[var(--line,#1d1e21)] text-xs text-[var(--text-3,#63636b)] cursor-not-allowed"
            title="Chờ backend hỗ trợ API tạo tài khoản từ web admin"
          >
            <UserPlus size={14} />
            <span>Tạo tài khoản</span>
            <span className="text-[10px] px-1 py-0.2 bg-[var(--line,#1d1e21)] rounded text-[var(--text-3,#63636b)]">Sắp có</span>
          </button>
        </div>
      </div>

      {/* Tabs navigation including Mục 3 CHỜ BACKEND */}
      <div className="flex border-b border-[var(--line,#1d1e21)] mb-6 gap-6">
        <button className="pb-3 border-b-2 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)] font-semibold text-sm">
          Danh sách tài khoản
        </button>
        <button
          disabled
          className="pb-3 text-sm text-[var(--text-3,#63636b)] cursor-not-allowed flex items-center gap-1.5"
          title="Chờ backend hỗ trợ API cảnh báo gian lận tự động"
        >
          <AlertTriangle size={14} />
          <span>Cảnh báo gian lận</span>
          <span className="text-[10px] px-1 py-0.5 bg-[var(--line,#1d1e21)] rounded text-[var(--text-3,#63636b)]">Sắp có</span>
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
          <option value="support">Support</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
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
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line,#1d1e21)]">
            {users.map((u) => (
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
                  {u.status === 'locked' ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-[var(--down,#f2475f)]/10 text-[var(--down,#f2475f)] border border-[var(--down,#f2475f)]/20 font-medium">
                      Bị khóa
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-[var(--up,#1fc27a)]/10 text-[var(--up,#1fc27a)] border border-[var(--up,#1fc27a)]/20 font-medium">
                      Hoạt động
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-[var(--text-3,#63636b)]">
                  Không tìm thấy người dùng nào phù hợp với bộ lọc
                </td>
              </tr>
            )}
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-[var(--text-2,#a1a1aa)]">
                  Đang tải danh sách người dùng...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
