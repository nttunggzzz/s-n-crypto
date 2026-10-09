import React from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useMarket } from '../context/MarketContext.tsx';
import { Button, Badge, WifiOffIcon, UserIcon, LogOutIcon } from '@cex/ui';

export interface HeaderProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentPath, onNavigate }) => {
  const { user, isAuthenticated, logout, resendVerification } = useAuth();
  const { connectionStatus, activeSymbol, activeTicker } = useMarket();

  const handleResend = async () => {
    const res = await resendVerification();
    if (res.success) {
      alert('Đã gửi lại email xác minh. Vui lòng kiểm tra hộp thư của bạn (hoặc console log server nếu đang chạy local)!');
    } else {
      alert(res.error || 'Không thể gửi lại email xác minh.');
    }
  };

  const navItems = [
    { label: 'Thị trường', path: '/markets' },
    { label: 'Giao dịch', path: `/trade/${activeSymbol}` },
    { label: 'Ví', path: '/wallet' },
    { label: 'Cài đặt', path: '/settings' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-[var(--color-bg-base,#08090c)]/90 backdrop-blur-md border-b border-[var(--color-border-subtle,#1e212b)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-6">
          <div
            onClick={() => onNavigate(`/trade/${activeSymbol}`)}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-[var(--radius-md,8px)] bg-gradient-to-tr from-[#818cf8] to-[#67e8f9] flex items-center justify-center font-black text-black text-lg shadow-[0_0_15px_rgba(129,140,248,0.35)]">
              C
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm tracking-wider text-[var(--color-text-primary,#f3f4f6)] group-hover:text-white transition-colors">
                CEX<span className="text-[var(--color-accent-secondary,#67e8f9)]">.SPOT</span>
              </span>
              <span className="text-[9px] uppercase tracking-widest text-[var(--color-text-muted,#6b7280)] font-semibold">
                Simulated
              </span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive =
                item.path === currentPath ||
                (item.path.startsWith('/trade') && currentPath.startsWith('/trade'));
              return (
                <button
                  key={item.path}
                  onClick={() => onNavigate(item.path)}
                  className={`px-3 py-1.5 rounded-[var(--radius-md,8px)] text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[var(--color-bg-elevated,#1b1e27)] text-[var(--color-text-primary,#f3f4f6)]'
                      : 'text-[var(--color-text-secondary,#9ca3af)] hover:text-white hover:bg-[var(--color-bg-surface,#111319)]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
            {import.meta.env.DEV && (
              <button
                onClick={() => onNavigate('/__ui')}
                className={`px-2.5 py-1 rounded-[var(--radius-sm,4px)] text-[11px] font-mono transition-all cursor-pointer ${
                  currentPath === '/__ui'
                    ? 'bg-[var(--color-accent-primary,#818cf8)] text-white'
                    : 'text-[var(--color-text-muted,#6b7280)] hover:text-[var(--color-accent-secondary,#67e8f9)]'
                }`}
              >
                UI Kit
              </button>
            )}
          </nav>
        </div>

        {/* Right tools / User */}
        <div className="flex items-center gap-3">
          {/* Connection Status indicator */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--color-text-muted,#6b7280)]">
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'open'
                  ? 'bg-[var(--color-buy,#22c55e)] shadow-[0_0_6px_#22c55e]'
                  : connectionStatus === 'connecting'
                  ? 'bg-[var(--color-warning,#fbbf24)] animate-ping'
                  : 'bg-[var(--color-sell,#f87171)] animate-pulse'
              }`}
            />
            <span className="text-[11px] font-mono">
              {connectionStatus === 'open'
                ? 'REALTIME'
                : connectionStatus === 'connecting'
                ? 'KẾT NỐI...'
                : 'MẤT KẾT NỐI'}
            </span>
          </div>

          {/* User authentication states */}
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate('/settings')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-md,8px)] bg-[var(--color-bg-elevated,#1b1e27)] text-xs text-[var(--color-text-primary,#f3f4f6)] hover:bg-[#272b38] border border-[var(--color-border-subtle,#1e212b)] cursor-pointer"
              >
                <UserIcon size={14} className="text-[var(--color-accent-secondary,#67e8f9)]" />
                <span className="max-w-[120px] truncate">{user?.name || user?.email}</span>
                {user && !user.emailVerified && (
                  <Badge variant="warning" size="sm">Chưa xác minh</Badge>
                )}
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                title="Đăng xuất"
                className="p-1.5 text-[var(--color-text-muted,#6b7280)] hover:text-white"
              >
                <LogOutIcon size={16} />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('/login')}
              >
                Đăng nhập
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => onNavigate('/register')}
              >
                Đăng ký
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Unverified Email Warning Bar */}
      {user && !user.emailVerified && (
        <div className="bg-[var(--color-warning-bg,rgba(251,191,36,0.12))] border-t border-[var(--color-warning,#fbbf24)]/20 py-1.5 px-4 text-xs text-[var(--color-warning,#fbbf24)] flex items-center justify-between">
          <span>
            Tài khoản của bạn chưa xác minh email. Một số tính năng (nạp tiền, đặt lệnh) sẽ bị tạm khóa.
          </span>
          <button
            onClick={handleResend}
            className="underline hover:brightness-125 font-semibold ml-2 cursor-pointer shrink-0"
          >
            Gửi lại link xác minh
          </button>
        </div>
      )}

      {/* Realtime Disconnected Global Banner */}
      {connectionStatus === 'closed' && (
        <div className="bg-[var(--color-sell-bg,rgba(248,113,113,0.12))] border-t border-[var(--color-sell,#f87171)]/30 py-1.5 px-4 text-xs text-[var(--color-sell,#f87171)] flex items-center justify-center gap-2">
          <WifiOffIcon size={14} className="animate-pulse shrink-0" />
          <span>Mất kết nối với máy chủ realtime. Hệ thống đang tự động kết nối lại...</span>
        </div>
      )}
    </header>
  );
};
