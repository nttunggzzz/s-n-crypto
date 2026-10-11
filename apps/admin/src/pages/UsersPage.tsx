import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import type { AdminUserSummary } from '@cex/contracts';

export const UsersPage: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [query, setQuery] = useState('');
  const api = getApiClient();

  useEffect(() => {
    const timer = setTimeout(() => {
      api.adminListUsers({ query: { q: query || undefined, limit: 50 } }).then((res) => {
        setUsers(res.items);
      }).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Quản lý người dùng</h1>
      
      <div className="mb-6">
        <input
          type="text"
          data-testid="admin-user-search"
          placeholder="Tìm theo email, UID, ID..."
          className="w-full max-w-md bg-[var(--bg,#000)] border border-[var(--line,#1d1e21)] rounded px-3 py-2 text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--line,#1d1e21)]/50">
            <tr>
              <th className="px-4 py-3 font-medium text-[var(--text-2,#a1a1aa)]">UID</th>
              <th className="px-4 py-3 font-medium text-[var(--text-2,#a1a1aa)]">Email</th>
              <th className="px-4 py-3 font-medium text-[var(--text-2,#a1a1aa)]">Tên</th>
              <th className="px-4 py-3 font-medium text-[var(--text-2,#a1a1aa)]">Vai trò</th>
              <th className="px-4 py-3 font-medium text-[var(--text-2,#a1a1aa)]">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                data-testid="admin-user-row"
                className="border-t border-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/30 cursor-pointer"
                onClick={() => onNavigate(`/admin/users/${u.id}`)}
              >
                <td className="px-4 py-3 font-mono">{u.uid}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3">{u.role}</td>
                <td className="px-4 py-3">
                  {u.status === 'locked'
                    ? <span className="text-[var(--down,#f2475f)]">Bị khóa</span>
                    : <span className="text-[var(--up,#1fc27a)]">Hoạt động</span>
                  }
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-2,#a1a1aa)]">Không tìm thấy người dùng nào</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
