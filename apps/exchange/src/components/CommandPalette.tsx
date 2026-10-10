import React, { useState, useEffect } from 'react';
import { Command } from 'cmdk';
import { Search, Wallet, User, Monitor, LogOut, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useMarket } from '../context/MarketContext.tsx';

export interface CommandPaletteProps {
  onNavigate: (path: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ onNavigate }) => {
  const [open, setOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const { symbols } = useMarket();

  // Toggle the menu when ⌘K is pressed
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[10vh]">
      <Command.Dialog 
        open={open} 
        onOpenChange={setOpen}
        className="w-[90vw] max-w-[600px] bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-xl,16px)] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center px-4 py-3 border-b border-[var(--line,#1d1e21)]">
          <Search size={18} className="text-[var(--text-3,#63636b)] mr-3" />
          <Command.Input 
            autoFocus 
            placeholder="Tìm kiếm lệnh hoặc thị trường..." 
            className="w-full bg-transparent border-none text-[var(--text,#f4f4f5)] text-sm focus:outline-none placeholder-[var(--text-3,#63636b)] font-sans" 
          />
          <button onClick={() => setOpen(false)} className="text-[10px] text-[var(--text-3,#63636b)] bg-[var(--panel-2,#141416)] px-2 py-1 rounded border border-[var(--line,#1d1e21)]">ESC</button>
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-[var(--text-3,#63636b)]">
            Không tìm thấy kết quả.
          </Command.Empty>

          <Command.Group heading="Điều hướng" className="text-xs font-semibold text-[var(--text-3,#63636b)] px-2 py-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1">
            <Command.Item 
              onSelect={() => runCommand(() => onNavigate('/markets'))}
              className="flex items-center px-2 py-2 text-sm text-[var(--text,#f4f4f5)] rounded-md hover:bg-[var(--panel-2,#141416)] cursor-pointer aria-selected:bg-[var(--panel-2,#141416)] aria-selected:text-[var(--accent,#818cf8)] transition-colors"
            >
              <Monitor size={16} className="mr-2 opacity-70" /> Thị trường Spot
            </Command.Item>
            <Command.Item 
              onSelect={() => runCommand(() => onNavigate('/futures/BTCUSDT'))}
              className="flex items-center px-2 py-2 text-sm text-[var(--text,#f4f4f5)] rounded-md hover:bg-[var(--panel-2,#141416)] cursor-pointer aria-selected:bg-[var(--panel-2,#141416)] aria-selected:text-[var(--accent,#818cf8)] transition-colors"
            >
              <TrendingUp size={16} className="mr-2 opacity-70" /> Giao dịch Futures (≤ 20×)
            </Command.Item>
            {isAuthenticated && (
              <Command.Item 
                onSelect={() => runCommand(() => onNavigate('/assets'))}
                className="flex items-center px-2 py-2 text-sm text-[var(--text,#f4f4f5)] rounded-md hover:bg-[var(--panel-2,#141416)] cursor-pointer aria-selected:bg-[var(--panel-2,#141416)] transition-colors"
              >
                <Wallet size={16} className="mr-2 opacity-70" /> Tổng quan tài sản
              </Command.Item>
            )}
            {isAuthenticated && (
              <Command.Item 
                onSelect={() => runCommand(() => onNavigate('/portfolio'))}
                className="flex items-center px-2 py-2 text-sm text-[var(--text,#f4f4f5)] rounded-md hover:bg-[var(--panel-2,#141416)] cursor-pointer aria-selected:bg-[var(--panel-2,#141416)] transition-colors"
              >
                <Wallet size={16} className="mr-2 opacity-70" /> Danh mục đầu tư
              </Command.Item>
            )}
            {isAuthenticated && (
              <Command.Item 
                onSelect={() => runCommand(() => onNavigate('/settings'))}
                className="flex items-center px-2 py-2 text-sm text-[var(--text,#f4f4f5)] rounded-md hover:bg-[var(--panel-2,#141416)] cursor-pointer aria-selected:bg-[var(--panel-2,#141416)] transition-colors"
              >
                <User size={16} className="mr-2 opacity-70" /> Cài đặt tài khoản
              </Command.Item>
            )}
          </Command.Group>

          <Command.Separator className="h-[1px] bg-[var(--line,#1d1e21)] my-2 mx-2" />

          <Command.Group heading="Giao dịch" className="text-xs font-semibold text-[var(--text-3,#63636b)] px-2 py-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1">
            {symbols.map(s => (
              <Command.Item 
                key={s.symbol}
                onSelect={() => runCommand(() => onNavigate(`/trade/${s.symbol}`))}
                className="flex items-center px-2 py-2 text-sm text-[var(--text,#f4f4f5)] rounded-md hover:bg-[var(--panel-2,#141416)] cursor-pointer aria-selected:bg-[var(--panel-2,#141416)] transition-colors"
              >
                Giao dịch {s.symbol}
              </Command.Item>
            ))}
          </Command.Group>

          {isAuthenticated && (
            <>
              <Command.Separator className="h-[1px] bg-[var(--line,#1d1e21)] my-2 mx-2" />
              <Command.Group heading="Tài khoản" className="text-xs font-semibold text-[var(--text-3,#63636b)] px-2 py-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1">
                <Command.Item 
                  onSelect={() => runCommand(() => { logout(); onNavigate('/login'); })}
                  className="flex items-center px-2 py-2 text-sm text-[var(--down,#f2475f)] rounded-md hover:bg-[var(--panel-2,#141416)] cursor-pointer aria-selected:bg-[var(--panel-2,#141416)] transition-colors"
                >
                  <LogOut size={16} className="mr-2 opacity-70" /> Đăng xuất
                </Command.Item>
              </Command.Group>
            </>
          )}
        </Command.List>
      </Command.Dialog>
    </div>
  );
};
