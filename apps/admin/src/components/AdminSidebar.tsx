import React from 'react';
import { useAuth } from '../context/AuthContext';
import type { Permission } from '@cex/contracts';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  CandlestickChart,
  TrendingUp,
  Coins,
  Settings,
  Bell,
  KeyRound,
  FileText,
  Scale,
} from 'lucide-react';

interface SidebarItem {
  label: string;
  path: string;
  permission: Permission;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const MENU_ITEMS: SidebarItem[] = [
  { label: 'Tổng quan', path: '/admin', permission: 'exchange.read', icon: LayoutDashboard },
  { label: 'Người dùng', path: '/admin/users', permission: 'users.read', icon: Users },
  { label: 'Nhân sự', path: '/admin/roles', permission: 'users.roles', icon: ShieldCheck },
  { label: 'Cặp Spot', path: '/admin/symbols', permission: 'exchange.read', icon: CandlestickChart },
  { label: 'Hợp đồng Futures', path: '/admin/futures', permission: 'exchange.read', icon: TrendingUp },
  { label: 'Thông tin coin', path: '/admin/assets', permission: 'exchange.read', icon: Coins },
  { label: 'Cấu hình sàn', path: '/admin/settings', permission: 'exchange.read', icon: Settings },
  { label: 'Thông báo', path: '/admin/announcements', permission: 'exchange.read', icon: Bell },
  { label: 'Mã mời', path: '/admin/invites', permission: 'users.invite', icon: KeyRound },
  { label: 'Nhật ký quản trị', path: '/admin/audit-logs', permission: 'audit.read', icon: FileText },
  { label: 'Đối soát sổ cái', path: '/admin/reconciliation', permission: 'reconciliation.read', icon: Scale },
];

export const AdminSidebar: React.FC<{ currentPath: string; onNavigate: (p: string) => void }> = ({ currentPath, onNavigate }) => {
  const { hasPerm } = useAuth();

  const visibleItems = MENU_ITEMS.filter((item) => hasPerm(item.permission));

  return (
    <aside className="w-64 border-r border-[var(--line,#1d1e21)] bg-[var(--panel,#0a0a0b)] flex-shrink-0 py-4 flex flex-col gap-1 overflow-y-auto h-full">
      <div className="px-4 pb-2 mb-2 border-b border-[var(--line,#1d1e21)]/60">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3,#63636b)]">Menu Điều Khiển</span>
      </div>
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentPath === item.path || (item.path !== '/admin' && currentPath.startsWith(item.path));
        return (
          <button
            key={item.path}
            onClick={() => onNavigate(item.path)}
            className={`text-left px-3.5 py-2 mx-2 rounded-lg flex items-center gap-3 transition-colors text-sm ${
              isActive
                ? 'bg-[var(--accent,#818cf8)]/10 text-[var(--accent,#818cf8)] font-semibold border border-[var(--accent,#818cf8)]/20'
                : 'text-[var(--text-2,#a1a1aa)] hover:bg-[var(--line,#1d1e21)]/60 hover:text-[var(--text,#f4f4f5)]'
            }`}
          >
            <Icon size={16} className={isActive ? 'text-[var(--accent,#818cf8)]' : 'text-[var(--text-3,#63636b)]'} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </aside>
  );
};
