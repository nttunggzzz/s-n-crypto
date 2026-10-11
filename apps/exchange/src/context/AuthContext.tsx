import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Me } from '@cex/contracts';
import { ApiError } from '@cex/contracts';
import { getApiClient, getRealtimeClient } from '../services/api.ts';
import { getErrorMessage } from '../services/errors.ts';

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  captchaToken?: string;
}

export type LoginResult =
  | { success: true }
  | { success: false; twoFactorRequired: true; challengeToken: string; expiresAt: string }
  | { success: false; error: string };

interface AuthContextType {
  user: Me | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginInput) => Promise<LoginResult>;
  loginTwoFactor: (challengeToken: string, code: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterInput) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  resendVerification: () => Promise<{ success: boolean; error?: string }>;
  refreshUser: () => Promise<void>;
  sessionEnded: boolean;
  sessionEndedMessage: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Me | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [sessionEndedMessage, setSessionEndedMessage] = useState<string | null>(null);

  const api = getApiClient();

  const reconnectRt = () => {
    try {
      const rt = getRealtimeClient();
      rt.reconnect();
    } catch {
      // ignore
    }
  };

  const applyThemeAndColor = (theme?: string, upColor?: string) => {
    let resolvedTheme = theme;
    if (!resolvedTheme || resolvedTheme === 'system') {
      resolvedTheme = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.setAttribute('data-color-reversed', upColor === 'RED' ? 'true' : 'false');
  };

  const syncPreferences = async () => {
    try {
      const pref = await api.getPreferences();
      applyThemeAndColor(pref.theme, pref.upColor);
    } catch {
      const savedTheme = localStorage.getItem('cex_theme') || 'dark';
      const savedReversed = localStorage.getItem('cex_color_reversed') === 'true';
      applyThemeAndColor(savedTheme, savedReversed ? 'RED' : 'GREEN');
    }
  };

  const refreshUser = async () => {
    try {
      const me = await api.me();
      setUser(me);
      await syncPreferences();
    } catch {
      setUser(null);
      syncPreferences();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
    syncPreferences();

    let unsubError: (() => void) | undefined;
    let unsubClose: (() => void) | undefined;
    try {
      const rt = getRealtimeClient();
      unsubError = rt.onError((err) => {
        if (err.channel === 'user' && err.code === 'UNAUTHENTICATED') {
          api.me().then(
            (me) => setUser(me),
            (e) => {
              setUser(null);
              if (e instanceof ApiError && e.status === 401) {
                setSessionEnded(true);
                setSessionEndedMessage('Phiên đăng nhập đã kết thúc');
                window.location.href = '/login';
              } else {
                rt.reconnect();
              }
            }
          );
        }
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rtAny = rt as any;
      if (typeof rtAny.onClose === 'function') {
        // @ts-ignore – onClose is not in the public RealtimeClient type but is implemented
        unsubClose = rtAny.onClose((ev: CloseEvent) => {
          if (ev?.code === 4401) {
            setUser(null);
            setSessionEnded(true);
            setSessionEndedMessage('Phiên đăng nhập đã kết thúc');
            window.location.href = '/login';
          }
        });
      }
    } catch {}

    return () => {
      unsubError?.();
      unsubClose?.();
    };
  }, []);

  const login = async (data: LoginInput): Promise<LoginResult> => {
    try {
      const res = await api.login({ body: data });
      if ('twoFactorRequired' in res && res.twoFactorRequired) {
        return {
          success: false,
          twoFactorRequired: true,
          challengeToken: res.challengeToken,
          expiresAt: res.expiresAt,
        };
      }
      if ('user' in res) {
        setUser(res.user);
        await reconnectRt();
        return { success: true };
      }
      return { success: false, error: 'Đăng nhập không thành công.' };
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'RATE_LIMITED' && err.details && 'retryAfterSeconds' in err.details) {
          return {
            success: false,
            error: `Bạn đang thao tác quá nhanh. Thử lại sau ${err.details.retryAfterSeconds} giây.`,
          };
        }
        return { success: false, error: getErrorMessage(err.code) };
      }
      return { success: false, error: 'Đăng nhập không thành công.' };
    }
  };

  const loginTwoFactor = async (challengeToken: string, code: string) => {
    try {
      const res = await api.loginTwoFactor({ body: { challengeToken, code } });
      setUser(res.user);
      await reconnectRt();
      return { success: true };
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        return { success: false, error: getErrorMessage(err.code) };
      }
      return { success: false, error: 'Mã xác thực 2FA không chính xác hoặc đã hết hạn.' };
    }
  };

  const register = async (data: RegisterInput) => {
    try {
      const res = await api.register({ body: data });
      setUser(res.user);
      await reconnectRt();
      return { success: true };
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        return { success: false, error: getErrorMessage(err.code) };
      }
      return { success: false, error: 'Đăng ký tài khoản không thành công.' };
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore logout errors
    } finally {
      setUser(null);
      await reconnectRt();
    }
  };

  const resendVerification = async () => {
    try {
      await api.resendVerification();
      return { success: true };
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        return { success: false, error: getErrorMessage(err.code) };
      }
      return { success: false, error: 'Không thể gửi lại email xác minh.' };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        loginTwoFactor,
        register,
        logout,
        resendVerification,
        refreshUser,
        sessionEnded,
        sessionEndedMessage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
