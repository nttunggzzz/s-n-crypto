import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Me } from '@cex/contracts';
import { ApiError } from '@cex/contracts';
import { getApiClient } from '../services/api.ts';
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
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Me | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const api = getApiClient();

  const refreshUser = async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
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
