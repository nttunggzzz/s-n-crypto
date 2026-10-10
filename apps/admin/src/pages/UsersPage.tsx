import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { Input, Table } from '@cex/ui';

export const UsersPage: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const api = getApiClient();

  useEffect(() => {
    const timer = setTimeout(() => {
      api.adminSearchUsers({ q: query, limit: 50 }).then((res) => {
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
          className="w-full max-w-md bg-bg border border-line rounded px-3 py-2 text-text outline-none focus:border-accent"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="bg-panel border border-line rounded overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-line/50">
            <tr>
              <th className="px-4 py-3 font-medium text-text-2">UID</th>
              <th className="px-4 py-3 font-medium text-text-2">Email</th>
              <th className="px-4 py-3 font-medium text-text-2">Tên</th>
              <th className="px-4 py-3 font-medium text-text-2">Vai trò</th>
              <th className="px-4 py-3 font-medium text-text-2">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr 
                key={u.id} 
                data-testid="admin-user-row" 
                className="border-t border-line hover:bg-line/30 cursor-pointer"
                onClick={() => onNavigate(`/admin/users/${u.id}`)}
              >
                <td className="px-4 py-3 font-mono">{u.uid}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3">{u.role}</td>
                <td className="px-4 py-3">
                  {u.lockedAt ? <span className="text-down">Bị khóa</span> : <span className="text-up">Hoạt động</span>}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-2">Không tìm thấy người dùng nào</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
