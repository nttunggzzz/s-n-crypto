import React from 'react';
import { useMarket } from '../context/MarketContext.tsx';
import { BarChart2Icon, TrendingUpIcon, WalletIcon, UserIcon } from '@cex/ui';

export interface BottomNavProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentPath, onNavigate }) => {
  const { activeSymbol } = useMarket();

  const navItems = [
    { label: 'Thị trường', path: '/markets', icon: <BarChart2Icon size={20} /> },
    { label: 'Giao dịch', path: `/trade/${activeSymbol}`, icon: <TrendingUpIcon size={20} /> },
    { label: 'Tài sản', path: '/assets', icon: <WalletIcon size={20} /> },
    { label: 'Tài khoản', path: '/settings', icon: <UserIcon size={20} /> },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-bg-surface,#111319)]/95 backdrop-blur-lg border-t border-[var(--color-border-subtle,#1e212b)] px-2 py-1 flex items-center justify-around shadow-[0_-4px_12px_rgba(0,0,0,0.4)] h-[calc(54px+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)]">
      {navItems.map((item) => {
        const isActive =
          item.path === currentPath ||
          (item.path.startsWith('/trade') && currentPath.startsWith('/trade'));
        return (
          <button
            key={item.path}
            onClick={() => onNavigate(item.path)}
            aria-label={item.label}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-[var(--radius-md,8px)] transition-all cursor-pointer ${
              isActive
                ? 'text-[var(--color-accent-primary,#818cf8)] font-semibold'
                : 'text-[var(--color-text-muted,#6b7280)] hover:text-[var(--color-text-primary,#f3f4f6)]'
            }`}
          >
            <div className={isActive ? 'drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]' : ''}>
              {item.icon}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
