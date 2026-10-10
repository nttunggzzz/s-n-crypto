import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMarket } from '../context/MarketContext';
import { Button, Badge, BrandLogo } from '@cex/ui';
import { NotificationCenter } from './NotificationCenter.tsx';
import { AvatarIcon } from './AvatarIcon.tsx';
import { 
  Search, Bell, Moon, Globe, ChevronDown, 
  Wallet, History, CreditCard, Settings, Shield, LogOut, Copy, X, LayoutPanelLeft, User,
  Bot, BarChart2
} from 'lucide-react';

export interface HeaderProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentPath, onNavigate }) => {
  const { user, isAuthenticated, logout, resendVerification } = useAuth();
  const { connectionStatus, activeSymbol } = useMarket();
  const [hideBanner, setHideBanner] = useState(false);

  const handleResend = async () => {
    const res = await resendVerification();
    if (res.success) {
      alert('Đã gửi lại email xác minh.');
    } else {
      alert(res.error || 'Không thể gửi lại email xác minh.');
    }
  };

  const copyUid = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full h-[56px] bg-[var(--bg,#000000)] border-b border-[var(--line,#1d1e21)] flex flex-col justify-center">
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
                <div className="absolute top-full left-0 mt-0 w-48 py-1 bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,10px)] shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <div 
                    onClick={() => onNavigate(`/trade/${activeSymbol || 'BTC-USDT'}`)}
                    className="px-4 py-2 hover:bg-[var(--panel-2,#141416)] cursor-pointer"
                  >
                    <div className="text-[13px] text-[var(--text,#f4f4f5)] font-medium">Giao dịch Spot</div>
                    <div className="text-[11px] text-[var(--text-3,#63636b)]">Giao dịch tiền mã hóa cơ sở</div>
                  </div>
                  <div 
                    onClick={() => onNavigate(`/futures/${activeSymbol || 'BTCUSDT'}`)}
                    className="px-4 py-2 hover:bg-[var(--panel-2,#141416)] cursor-pointer"
                  >
                    <div className="text-[13px] text-[var(--text,#f4f4f5)] font-medium flex items-center gap-1.5">
                      <span>Futures</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--accent,#818cf8)]/10 text-[var(--accent,#818cf8)] font-bold">Mô phỏng</span>
                    </div>
                    <div className="text-[11px] text-[var(--text-3,#63636b)]">Hợp đồng vĩnh cửu USDT-M (≤ 20×)</div>
                  </div>
                  <div 
                    onClick={() => onNavigate('/bots')}
                    className="px-4 py-2 hover:bg-[var(--panel-2,#141416)] cursor-pointer"
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

              {/* Tín hiệu */}
              <button
                className="h-full px-3 text-[13px] font-medium text-[var(--text-3,#63636b)] opacity-50 cursor-not-allowed flex items-center gap-1.5"
                title="Sắp có"
              >
                Tín hiệu <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)]">Sắp có</span>
              </button>
            </nav>
          </div>

          {/* Right Tools */}
          <div className="flex items-center gap-1.5 h-full">
            {/* Search / Command Palette Toggle */}
            <button 
              onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
              className="hidden lg:flex items-center gap-2 h-8 px-2.5 rounded-full bg-[var(--panel-2,#141416)] hover:bg-[var(--line,#1d1e21)] border border-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)] transition-colors mr-2"
            >
              <Search size={14} />
              <span className="text-[11px]">Tìm kiếm coin, chức năng</span>
              <kbd className="ml-2 font-mono text-[9px] px-1.5 py-0.5 bg-[var(--bg,#000000)] rounded border border-[var(--line,#1d1e21)] text-[var(--text-3,#63636b)]">Ctrl+K</kbd>
            </button>
            <button 
              onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
              className="lg:hidden p-2 text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]"
            >
              <Search size={18} />
            </button>

            {/* Notifications */}
            <NotificationCenter onNavigate={onNavigate} />

            {/* Auth specific menus */}
            {isAuthenticated ? (
              <>
                {/* Assets Dropdown */}
                <div className="relative group h-full flex items-center">
                  <button 
                    onClick={() => onNavigate('/assets')}
                    className="p-2 text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]"
                  >
                    <Wallet size={18} />
                  </button>
                  <div className="absolute top-full right-0 mt-0 w-56 py-1 bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,10px)] shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <div className="px-4 py-3 border-b border-[var(--line,#1d1e21)]">
                      <div className="text-[11px] text-[var(--text-3,#63636b)] mb-1">Tổng tài sản ước tính</div>
                      <div className="text-base font-bold text-[var(--text,#f4f4f5)] font-mono">10,000.00 <span className="text-[11px] font-sans text-[var(--text-2,#a1a1aa)] font-normal">USDT</span></div>
                    </div>
                    <div onClick={() => onNavigate('/assets')} className="px-4 py-2.5 hover:bg-[var(--panel-2,#141416)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center gap-2">
                      <Wallet size={16} className="text-[var(--text-2,#a1a1aa)]" />
                      Tổng quan tài sản
                    </div>
                    <div onClick={() => onNavigate('/assets')} className="px-4 py-2.5 hover:bg-[var(--panel-2,#141416)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center gap-2">
                      <CreditCard size={16} className="text-[var(--text-2,#a1a1aa)]" />
                      Nạp ảo (Faucet)
                    </div>
                    <div onClick={() => onNavigate('/assets')} className="px-4 py-2.5 hover:bg-[var(--panel-2,#141416)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center gap-2">
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
                  >
                    <AvatarIcon avatarId={user?.avatar} size={28} fallbackText={user?.name || user?.email || 'U'} />
                  </button>
                  
                  <div className="absolute top-full right-0 mt-0 w-64 py-1 bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,10px)] shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <div className="px-4 py-3 border-b border-[var(--line,#1d1e21)] flex flex-col gap-1">
                      <div className="text-[13px] text-[var(--text,#f4f4f5)] font-medium truncate">{user?.name || user?.email}</div>
                      <div className="text-[11px] text-[var(--text-3,#63636b)] flex items-center gap-1.5 font-mono">
                        UID: {user?.uid || '—'}
                        <button onClick={copyUid} className="hover:text-[var(--text,#f4f4f5)] cursor-pointer" title="Sao chép UID">
                          <Copy size={12} />
                        </button>
                      </div>
                      {!user?.emailVerified && (
                        <div className="mt-1">
                          <Badge variant="warning" size="sm">Chưa xác minh</Badge>
                        </div>
                      )}
                    </div>
                    
                    <div className="py-1 border-b border-[var(--line,#1d1e21)]">
                      <div onClick={() => onNavigate('/settings')} className="px-4 py-2 hover:bg-[var(--panel-2,#141416)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center gap-2">
                        <User size={16} className="text-[var(--text-2,#a1a1aa)]" />
                        Hồ sơ
                      </div>
                      <div onClick={() => onNavigate('/settings')} className="px-4 py-2 hover:bg-[var(--panel-2,#141416)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center gap-2">
                        <Shield size={16} className="text-[var(--text-2,#a1a1aa)]" />
                        Bảo mật (2FA)
                      </div>
                      <div onClick={() => onNavigate('/assets/analysis')} className="px-4 py-2 hover:bg-[var(--panel-2,#141416)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center gap-2">
                        <BarChart2 size={16} className="text-[var(--text-2,#a1a1aa)]" />
                        Phân tích lãi lỗ
                      </div>
                      <div onClick={() => onNavigate('/bots')} className="px-4 py-2 hover:bg-[var(--panel-2,#141416)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center gap-2">
                        <Bot size={16} className="text-[var(--text-2,#a1a1aa)]" />
                        Bot của tôi
                      </div>
                      <div onClick={() => onNavigate('/settings')} className="px-4 py-2 hover:bg-[var(--panel-2,#141416)] cursor-pointer text-[13px] text-[var(--text,#f4f4f5)] flex items-center gap-2">
                        <Settings size={16} className="text-[var(--text-2,#a1a1aa)]" />
                        Cài đặt chung
                      </div>
                    </div>
                    
                    <div className="py-1">
                      <div onClick={logout} className="px-4 py-2 hover:bg-[var(--panel-2,#141416)] cursor-pointer text-[13px] text-[var(--down,#f2475f)] flex items-center gap-2">
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
                  className="px-4 py-1.5 rounded-full text-[13px] font-semibold text-[var(--text,#f4f4f5)] border border-[var(--line,#1d1e21)] hover:bg-[var(--panel-2,#141416)] transition-colors"
                >
                  Đăng nhập
                </button>
                <button
                  onClick={() => onNavigate('/register')}
                  className="px-4 py-1.5 rounded-full text-[13px] font-semibold bg-[var(--text,#f4f4f5)] text-[var(--bg,#000000)] hover:bg-white transition-colors"
                >
                  Đăng ký
                </button>
              </div>
            )}

            {/* Dev Tools & Theme/Lang (Minimal) */}
            <div className="hidden sm:flex items-center gap-1 border-l border-[var(--line,#1d1e21)] ml-2 pl-2">
              <button className="p-1.5 text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]" title="Giao diện">
                <Moon size={16} />
              </button>
              <button className="p-1.5 text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]" title="Ngôn ngữ">
                <Globe size={16} />
              </button>
              {import.meta.env.DEV && (
                <button 
                  onClick={() => onNavigate('/__ui')}
                  className="p-1.5 text-[var(--text-2,#a1a1aa)] hover:text-[var(--accent,#818cf8)]" title="UI Kit"
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
          
          {user && !user.emailVerified && (
            <div className="h-8 bg-[var(--warn,#f5b544)]/10 border-b border-[var(--warn,#f5b544)]/20 px-4 text-[11px] text-[var(--warn,#f5b544)] flex items-center justify-between font-medium">
              <span>Tài khoản chưa xác minh email. Một số tính năng sẽ bị giới hạn.</span>
              <div className="flex items-center gap-3">
                <button onClick={handleResend} className="underline hover:brightness-125">Gửi lại link</button>
                <button onClick={() => setHideBanner(true)}><X size={14} className="opacity-70 hover:opacity-100" /></button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
};
