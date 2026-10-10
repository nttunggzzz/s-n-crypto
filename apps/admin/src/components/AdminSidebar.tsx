import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Permission } from '@cex/contracts';

interface SidebarItem {
  label: string;
  path: string;
  permission: Permission;
}

const MENU_ITEMS: SidebarItem[] = [
  { label: 'Tổng quan', path: '/admin', permission: 'exchange.read' },
  { label: 'Người dùng', path: '/admin/users', permission: 'users.read' },
  { label: 'Cặp giao dịch', path: '/admin/symbols', permission: 'exchange.read' },
  { label: 'Hợp đồng Futures', path: '/admin/futures', permission: 'exchange.read' },
  { label: 'Thông tin coin', path: '/admin/assets', permission: 'exchange.read' },
  { label: 'Thông báo', path: '/admin/announcements', permission: 'exchange.read' },
  { label: 'Mã mời', path: '/admin/invites', permission: 'users.invite' },
  { label: 'Cấu hình sàn', path: '/admin/settings', permission: 'exchange.read' },
  { label: 'Nhật ký quản trị', path: '/admin/audit-logs', permission: 'audit.read' },
  { label: 'Đối soát', path: '/admin/reconciliation', permission: 'reconciliation.read' },
  { label: 'Vai trò', path: '/admin/roles', permission: 'users.roles' },
];

export const AdminSidebar: React.FC<{ currentPath: string; onNavigate: (p: string) => void }> = ({ currentPath, onNavigate }) => {
  const { hasPerm } = useAuth();
  
  const visibleItems = MENU_ITEMS.filter((item) => hasPerm(item.permission));

  return (
    <aside className="w-64 border-r border-line bg-panel flex-shrink-0 py-4 flex flex-col gap-1 overflow-y-auto h-full">
      {visibleItems.map((item) => {
        const isActive = currentPath === item.path || (item.path !== '/admin' && currentPath.startsWith(item.path));
        return (
          <button
            key={item.path}
            onClick={() => onNavigate(item.path)}
            className={`text-left px-4 py-2 mx-2 rounded hover:bg-line transition-colors ${isActive ? 'bg-line text-accent font-medium' : 'text-text-2'}`}
          >
            {item.label}
          </button>
        );
      })}
    </aside>
  );
};
