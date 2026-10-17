import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext.tsx';
import { useMarket } from '../context/MarketContext';
import { BrandLogo, Badge, useToast, formatDecimal } from '@cex/ui';
import { canOpenAdmin, appLinks } from '@cex/contracts';
import { getApiClient } from '../services/api.ts';
import { NotificationCenter } from './NotificationCenter.tsx';
import { AvatarIcon } from './AvatarIcon.tsx';
import { 
  Search, Moon, Sun, ChevronDown, 
  Wallet, History, CreditCard, Settings, Shield, LogOut, Copy, LayoutPanelLeft, User, X,
  Bot, BarChart2, LayoutDashboard, Receipt
} from 'lucide-react';

export interface HeaderProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentPath, onNavigate }) => {
  const { user, isAuthenticated, logout, resendVerification } = useAuth();
  const { publicConfig } = useConfig();
  const { connectionStatus, activeSymbol } = useMarket();
  const { success, error: toastError } = useToast();
  const [hideBanner, setHideBanner] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('cex:hide-email-banner') === 'true';
    }
    return false;
  });
  const [totalEstimatedUsdt, setTotalEstimatedUsdt] = useState<string | null>(null);
  const api = getApiClient();

  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>(() => {
    if (typeof document !== 'undefined') {
      const docTheme = document.documentElement.getAttribute('data-theme');
      if (docTheme === 'light' || docTheme === 'dark') return docTheme;
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cex_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const t = document.documentElement.getAttribute('data-theme');
      if (t === 'light' || t === 'dark') setCurrentTheme(t);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const handleToggleTheme = () => {
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setCurrentTheme(nextTheme);
    localStorage.setItem('cex_theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    if (isAuthenticated) {
      api.updatePreferences({ body: { theme: nextTheme } }).catch(() => {});
    }
    success(`Đã chuyển sang giao diện ${nextTheme === 'dark' ? 'Tối' : 'Sáng'}.`);
  };

  useEffect(() => {
    if (user?.emailVerified) {
      sessionStorage.removeItem('cex:hide-email-banner');
    }
  }, [user?.emailVerified]);

  const handleResend = async () => {
    const res = await resendVerification();
    if (res.success) {
      success('Đã gửi lại email xác minh.');
    } else {
      toastError(res.error || 'Không thể gửi lại email xác minh.');
    }
  };

  const fetchTotalAsset = useCallback(async () => {
    if (!isAuthenticated) {
      setTotalEstimatedUsdt(null);
      return;
    }
    try {
      const res = await api.portfolio();
      setTotalEstimatedUsdt(res.totalValueUsdt);
    } catch {
      setTotalEstimatedUsdt(null);
    }
  }, [isAuthenticated, api]);

  useEffect(() => {
    fetchTotalAsset();
    window.addEventListener('cex:balance-refresh', fetchTotalAsset);
    return () => {
      window.removeEventListener('cex:balance-refresh', fetchTotalAsset);
    };
  }, [fetchTotalAsset]);

  const copyUid = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full h-[56px] bg-[var(--panel)] border-b border-[var(--line)] flex flex-col justify-center">
        <div className="px-4 h-full flex items-center justify-between">
          {/* Brand & Left Menu */}
          <div className="flex items-center gap-6 h-full">
            <div 
              onClick={() => onNavigate('/')}
              className="cursor-pointer"
            >
              <BrandLogo size={24} />
            </div>

            <nav className="hidden md:flex items-center gap-1 h-full">
              {/* Thị trường */}
              <button
                onClick={() => onNavigate('/markets')}
                className={`h-full px-3 text-[13px] font-medium transition-colors ${
                  currentPath === '/markets'
                    ? 'text-[var(--text,#f4f4f5)]'
                    : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
                }`}
              >
                Thị trường
              </button>

              {/* Giao dịch Dropdown */}
              <div className="relative group h-full flex items-center">
                <button
                  onClick={() => onNavigate(`/trade/${activeSymbol || 'BTC-USDT'}`)}
                  className={`h-full px-3 flex items-center gap-1 text-[13px] font-medium transition-colors ${
                    currentPath.startsWith('/trade')
                      ? 'text-[var(--text,#f4f4f5)]'
                      : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
                  }`}
                >
                  Giao dịch <ChevronDown size={14} className="text-[var(--text-3,#63636b)] group-hover:text-[var(--text-2,#a1a1aa)] transition-colors" />
                </button>
                <div className="absolute top-full left-0 mt-0 w-48 py-1 bg-[var(--panel)] border border-[var(--line)] rounded-[var(--radius-lg,10px)] shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <div 
                    onClick={() => onNavigate(`/trade/${activeSymbol || 'BTC-USDT'}`)}
                    className="px-4 py-2 hover:bg-[var(--panel-2)] cursor-pointer"
                  >
                    <div className="text-[13px] text-[var(--text,#f4f4f5)] font-medium">Giao dịch Spot</div>
                    <div className="text-[11px] text-[var(--text-3,#63636b)]">Giao dịch tiền mã hóa cơ sở</div>
                  </div>
                  <div 
                    onClick={() => onNavigate(`/futures/${activeSymbol || 'BTCUSDT'}`)}
                    className="px-4 py-2 hover:bg-[var(--panel-2)] cursor-pointer"
                  >
                    <div className="text-[13px] text-[var(--text,#f4f4f5)] font-medium flex items-center gap-1.5">
                      <span>Futures</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--accent,#818cf8)]/10 text-[var(--accent,#818cf8)] font-bold">Mô phỏng</span>
                    </div>
                    <div className="text-[11px] text-[var(--text-3,#63636b)]">Hợp đồng vĩnh cửu USDT-M (≤ 20×)</div>
                  </div>
                  <div 
                    onClick={() => onNavigate('/bots')}
                    className="px-4 py-2 hover:bg-[var(--panel-2)] cursor-pointer"
                  >
                    <div className="text-[13px] text-[var(--text,#f4f4f5)] font-medium flex items-center gap-1.5">
                      <span>Bot giao dịch</span>
                    </div>
                    <div className="text-[11px] text-[var(--text-3,#63636b)]">Bot lưới Spot & Mua định kỳ (DCA)</div>
                  </div>
                </div>
              </div>

              {/* Tài sản */}
              <button
                onClick={() => onNavigate('/assets')}
                className={`h-full px-3 text-[13px] font-medium transition-colors ${
                  currentPath === '/assets'
                    ? 'text-[var(--text,#f4f4f5)]'
                    : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
                }`}
              >
                Tài sản
              </button>

              {/* Danh mục */}
              <button
                onClick={() => onNavigate('/portfolio')}
                className={`h-full px-3 text-[13px] font-medium transition-colors ${
                  currentPath === '/portfolio'
                    ? 'text-[var(--text,#f4f4f5)]'
                    : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
                }`}
              >
                Danh mục
              </button>
            </nav>
          </div>

          {/* Right Tools */}
          <div className="flex items-center gap-1.5 h-full">
            {/* Search / Command Palette Toggle */}
            <button 
              onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
              aria-label="Tìm kiếm"
              className="hidden lg:flex items-center gap-2 h-8 px-2.5 rounded-full bg-[var(--panel-2)] hover:bg-[var(--line)] border border-[var(--line)] text-[var(--text-2,#a1a1aa)] transition-colors mr-2"
            >
              <Search size={14} />
              <span className="text-[11px]">Tìm kiếm coin, chức năng</span>
              <kbd className="ml-2 font-mono text-[9px] px-1.5 py-0.5 bg-[var(--bg)] rounded border border-[var(--line)] text-[var(--text-3,#63636b)]">Ctrl+K</kbd>
            </button>
            <button 
              onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
              aria-label="Tìm kiếm"
              className="lg:hidden p-2 text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]"
            >
              <Search size={18} />
            </button>

            {/* Notifications */}
            <NotificationCenter onNavigate={onNavigate} />

            {/* Auth specific menus */}
            {isAuthenticated ? (
              <>
                {canOpenAdmin(user) && (
                  <a
                    href={appLinks.admin.home(import.meta.env.VITE_ADMIN_ORIGIN)}
                    data-testid="nav-admin"
                    className="p-2 text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]"
                    title="Quản trị"
                    aria-label="Quản trị"
                  >
                    <LayoutDashboard size={18} />
                  </a>
                )}
                {/* Assets Dropdown */}
                <div className="relative group h-full flex items-center">
                  <button 
                    onClick={() => onNavigate('/assets')}
                    aria-label="Ví tài sản"
                    className="p-2 text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]"
                  >
                    <Wallet size={18} />
                  </button>
                  <div className="absolute top-full right-0 mt-0 w-56 py-1 bg-[var(--panel)] border border-[var(--line)] rounded-[var(--radius-lg,10px)] shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <div className="px-4 py-3 border-b border-[var(--line)]">
                      <div className="text-[11px] text-[var(--text-3,#63636b)] mb-1">Tổng tài sản ước tính</div>
                      <div className="text-base font-bold text-[var(--text,#f4f4f5)] font-mono">
                        {totalEstimatedUsdt !== null ? `${formatDecimal(totalEstimatedUsdt, { decimals: 2 })} ` : '— '}
                        <span className="text-[11px] font-sans text-[var(--text-2,#a1a1aa)] font-normal">USDT</span>
                      </div>
                    </div>
                    <div onClick={() => onNavigate('/assets')} className="px-4 py-2.5 hover:bg-[var(--panel-2)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center gap-2">
                      <Wallet size={16} className="text-[var(--text-2,#a1a1aa)]" />
                      Tổng quan tài sản
                    </div>
                    <div onClick={() => onNavigate('/assets')} className="px-4 py-2.5 hover:bg-[var(--panel-2)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center gap-2">
                      <CreditCard size={16} className="text-[var(--text-2,#a1a1aa)]" />
                      Nạp ảo (Faucet)
                    </div>
                    <div onClick={() => onNavigate('/assets')} className="px-4 py-2.5 hover:bg-[var(--panel-2)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center gap-2">
                      <History size={16} className="text-[var(--text-2,#a1a1aa)]" />
                      Lịch sử giao dịch
                    </div>
                  </div>
                </div>

                {/* Avatar / Account Dropdown */}
                <div className="relative group h-full flex items-center ml-1">
                  <button 
                    onClick={() => onNavigate('/settings')}
                    className="flex items-center cursor-pointer"
                    aria-label="Tài khoản người dùng"
                  >
                    <AvatarIcon avatarId={user?.avatar} size={28} fallbackText={user?.name || user?.email || 'U'} />
                  </button>
                  
                  <div className="absolute top-full right-0 mt-0 w-64 py-1 bg-[var(--panel)] border border-[var(--line)] rounded-[var(--radius-lg,10px)] shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <div className="px-4 py-3 border-b border-[var(--line)] flex flex-col gap-1">
                      <div className="text-[13px] text-[var(--text,#f4f4f5)] font-medium truncate">{user?.name || user?.email}</div>
                      <div className="text-[11px] text-[var(--text-3,#63636b)] flex items-center gap-1.5 font-mono">
                        UID: {user?.uid || '—'}
                        <button onClick={copyUid} className="hover:text-[var(--text,#f4f4f5)] cursor-pointer" title="Sao chép UID" aria-label="Sao chép UID">
                          <Copy size={12} />
                        </button>
                      </div>
                      {publicConfig?.emailVerificationRequired && !user?.emailVerified && (
                        <div className="mt-1">
                          <Badge variant="warning" size="sm">Chưa xác minh</Badge>
                        </div>
                      )}
                    </div>
                    
                    <div className="py-1 border-b border-[var(--line)]">
                      {canOpenAdmin(user) && (
                        <a href={appLinks.admin.home(import.meta.env.VITE_ADMIN_ORIGIN)} className="px-4 py-2 hover:bg-[var(--panel-2)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center gap-2">
                          <LayoutDashboard size={16} className="text-[var(--text-2,#a1a1aa)]" />
                          Quản trị
                        </a>
                      )}
                      <div onClick={() => onNavigate('/settings')} className="px-4 py-2 hover:bg-[var(--panel-2)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center gap-2">
                        <User size={16} className="text-[var(--text-2,#a1a1aa)]" />
                        Hồ sơ
                      </div>
                      <div onClick={() => onNavigate('/settings')} className="px-4 py-2 hover:bg-[var(--panel-2)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center gap-2">
                        <Shield size={16} className="text-[var(--text-2,#a1a1aa)]" />
                        Bảo mật
                      </div>
                      <div onClick={() => onNavigate('/assets/analysis')} className="px-4 py-2 hover:bg-[var(--panel-2)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center gap-2">
                        <BarChart2 size={16} className="text-[var(--text-2,#a1a1aa)]" />
                        Phân tích lãi lỗ
                      </div>
                      <div onClick={() => onNavigate('/bots')} className="px-4 py-2 hover:bg-[var(--panel-2)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center gap-2">
                        <Bot size={16} className="text-[var(--text-2,#a1a1aa)]" />
                        Bot của tôi
                      </div>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => onNavigate('/account/tax')}
                        className="w-full text-left px-4 py-2 hover:bg-[var(--panel-2)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Receipt size={16} className="text-[var(--text-2,#a1a1aa)]" />
                          Thuế (Việt Nam)
                        </div>
                        <span className="text-[9px] uppercase font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                          Thử nghiệm
                        </span>
                      </button>
                      <div onClick={() => onNavigate('/settings')} className="px-4 py-2 hover:bg-[var(--panel-2)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center gap-2">
                        <Settings size={16} className="text-[var(--text-2,#a1a1aa)]" />
                        Cài đặt chung
                      </div>
                    </div>
                    
                    <div className="py-1">
                      <div onClick={logout} className="px-4 py-2 hover:bg-[var(--panel-2)] cursor-pointer text-[13px] text-[var(--down,#f2475f)] flex items-center gap-2">
                        <LogOut size={16} />
                        Đăng xuất
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 ml-2">
                <button
                  onClick={() => onNavigate('/login')}
                  className="px-4 py-1.5 rounded-full text-[13px] font-semibold text-[var(--text,#f4f4f5)] border border-[var(--line)] hover:bg-[var(--panel-2)] transition-colors"
                >
                  Đăng nhập
                </button>
                <button
                  onClick={() => onNavigate('/register')}
                  className="px-4 py-1.5 rounded-full text-[13px] font-semibold bg-[var(--text)] text-[var(--bg)] hover:opacity-90 transition-colors"
                >
                  Đăng ký
                </button>
              </div>
            )}

            {/* Dev Tools & Theme (Minimal) */}
            <div className="hidden sm:flex items-center gap-1 border-l border-[var(--line)] ml-2 pl-2">
              <button
                onClick={handleToggleTheme}
                data-testid="header-theme-toggle"
                className="p-1.5 text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)] transition-colors cursor-pointer"
                title={currentTheme === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
                aria-label="Đổi giao diện sáng/tối"
              >
                {currentTheme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
              {import.meta.env.DEV && (
                <button 
                  onClick={() => onNavigate('/__ui')}
                  className="p-1.5 text-[var(--text-2,#a1a1aa)] hover:text-[var(--accent,#818cf8)]"
                  title="Bộ giao diện (chỉ môi trường dev)"
                  aria-label="UI Kit"
                >
                  <LayoutPanelLeft size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Banner Area (32px tall) */}
      {!hideBanner && (
        <>
          {connectionStatus === 'closed' && (
            <div className="h-8 bg-[var(--down,#f2475f)]/10 border-b border-[var(--down,#f2475f)]/20 px-4 text-[11px] text-[var(--down,#f2475f)] flex items-center justify-center font-medium">
              Mất kết nối với máy chủ realtime. Hệ thống đang tự động kết nối lại...
            </div>
          )}
          
          {publicConfig?.emailVerificationRequired && user && !user.emailVerified && (
            <div className="h-8 bg-[var(--warn,#f5b544)]/10 border-b border-[var(--warn,#f5b544)]/20 px-4 text-[11px] text-[var(--warn,#f5b544)] flex items-center justify-between font-medium">
              <span>Tài khoản chưa xác minh email. Một số tính năng sẽ bị giới hạn.</span>
              <div className="flex items-center gap-3">
                <button onClick={handleResend} className="underline hover:brightness-125">Gửi lại link</button>
                <button onClick={() => setHideBanner(true)} aria-label="Đóng thông báo"><X size={14} className="opacity-70 hover:opacity-100" /></button>
              </div>
            </div>
          )}
        </>
      )}
      {hideBanner && connectionStatus === 'closed' && (
        <div className="h-8 bg-[var(--down,#f2475f)]/10 border-b border-[var(--down,#f2475f)]/20 px-4 text-[11px] text-[var(--down,#f2475f)] flex items-center justify-center font-medium">
          Mất kết nối với máy chủ realtime. Hệ thống đang tự động kết nối lại...
        </div>
      )}
    </>
  );
};
