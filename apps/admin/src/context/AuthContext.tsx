import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Me } from '@cex/contracts';
import { ApiError, canOpenAdmin, hasPermission, Permission, appLinks } from '@cex/contracts';
import { getApiClient, getRealtimeClient } from '../services/api.ts';

interface AuthContextType {
  user: Me | null;
  isLoading: boolean;
  hasPerm: (p: Permission) => boolean;
  staffTwoFactorRequired: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Me | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [staffTwoFactorRequired, setStaffTwoFactorRequired] = useState(true);
  const [twoFactorRequiredByApi, setTwoFactorRequiredByApi] = useState(false);

  const api = getApiClient();

  useEffect(() => {
    const handle2FaReq = () => {
      setTwoFactorRequiredByApi(true);
    };
    window.addEventListener('admin:two-factor-required', handle2FaReq);
    return () => window.removeEventListener('admin:two-factor-required', handle2FaReq);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [me, cfg] = await Promise.all([
          api.me(),
          api.publicConfig().catch(() => null),
        ]);
        if (mounted) {
          setUser(me);
          if (cfg && typeof cfg.staffTwoFactorRequired === 'boolean') {
            setStaffTwoFactorRequired(cfg.staffTwoFactorRequired);
          }
        }
      } catch (err: any) {
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = appLinks.exchange.login(window.location.pathname + window.location.search, import.meta.env.VITE_EXCHANGE_ORIGIN);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    load();

    let unsubError: (() => void) | undefined;
    let unsubClose: (() => void) | undefined;
    
    try {
      const rt = getRealtimeClient();
      unsubError = rt.onError((err) => {
        if (err.channel === 'user' && err.code === 'UNAUTHENTICATED') {
          api.me().catch((e) => {
            if (e instanceof ApiError && e.status === 401) {
              window.location.href = appLinks.exchange.login(window.location.pathname + window.location.search, import.meta.env.VITE_EXCHANGE_ORIGIN);
            } else {
              rt.reconnect();
            }
          });
        }
      });
      // @ts-ignore
      if (typeof rt.onClose === 'function') {
        // @ts-ignore
        unsubClose = rt.onClose((ev: any) => {
          if (ev.code === 4401) {
            window.location.href = appLinks.exchange.login(window.location.pathname + window.location.search, import.meta.env.VITE_EXCHANGE_ORIGIN);
          }
        });
      }
    } catch {}

    return () => {
      mounted = false;
      unsubError?.();
      unsubClose?.();
    };
  }, []);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-bg text-text">Đang tải...</div>;
  }

  if (user && !canOpenAdmin(user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text" data-testid="admin-no-access">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Tài khoản không có quyền quản trị</h1>
          <a href={appLinks.exchange.home(import.meta.env.VITE_EXCHANGE_ORIGIN)} className="text-accent hover:underline">
            Quay lại sàn
          </a>
        </div>
      </div>
    );
  }

  // Tài khoản quản trị bắt buộc phải bật xác thực hai bước (2FA) khi cờ staffTwoFactorRequired là true hoặc server trả TWO_FACTOR_REQUIRED
  if (user && ((staffTwoFactorRequired && !user.twoFactorEnabled) || twoFactorRequiredByApi)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text" data-testid="admin-2fa-required">
        <div className="bg-panel p-6 rounded-lg border border-line max-w-md text-center">
          <h2 className="text-xl font-bold mb-4">Cần thiết lập 2FA</h2>
          <p className="text-text-2 mb-4">Tài khoản quản trị bắt buộc phải bật xác thực hai bước (2FA).</p>
          <p className="text-xs text-text-3 mb-6">
            Vui lòng vào Cài đặt tài khoản trên sàn để bật xác thực hai bước (2FA), sau đó đăng nhập lại bằng 2FA trước khi tiếp tục truy cập trang Quản trị.
          </p>
          <a href={appLinks.exchange.home(import.meta.env.VITE_EXCHANGE_ORIGIN)} className="text-accent hover:underline font-semibold">
            Quay lại sàn để thiết lập 2FA
          </a>
        </div>
      </div>
    );
  }

  const hasPerm = (p: Permission) => {
    return user ? hasPermission(user.role, p) : false;
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, hasPerm, staffTwoFactorRequired }}>
      {!staffTwoFactorRequired && (
        <div
          data-testid="admin-no-2fa-notice"
          className="bg-amber-500/15 text-amber-300 text-xs py-1 px-4 text-center border-b border-amber-500/30 font-medium"
        >
          Máy chủ dev: admin không yêu cầu 2FA
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
