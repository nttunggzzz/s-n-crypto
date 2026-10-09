import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { getApiClient } from '../services/api.ts';
import { Button, Input, Card, CheckIcon, AlertCircleIcon } from '@cex/ui';

export interface AuthPageProps {
  onNavigate: (path: string) => void;
}

export const LoginPage: React.FC<AuthPageProps> = ({ onNavigate }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError('Vui lòng điền đầy đủ email và mật khẩu.');
      return;
    }
    setLoading(true);
    const res = await login({ email, password });
    setLoading(false);
    if (res.success) {
      onNavigate('/trade/BTCUSDT');
    } else {
      setError(res.error || 'Đăng nhập không thành công.');
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <Card variant="surface" className="max-w-md w-full border-[var(--color-border-default,#272a33)]">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-[var(--color-text-primary,#f3f4f6)] mb-2">
            Đăng nhập sàn CEX Spot
          </h2>
          <p className="text-xs text-[var(--color-text-secondary,#9ca3af)]">
            Trải nghiệm giao dịch mô phỏng thời gian thực
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-[var(--radius-md,8px)] bg-[var(--color-sell-bg,rgba(248,113,113,0.12))] border border-[var(--color-sell,#f87171)]/20 text-xs text-[var(--color-sell,#f87171)] flex items-center gap-2">
            <AlertCircleIcon size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Địa chỉ Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
          />

          <Input
            label="Mật khẩu"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onNavigate('/forgot-password')}
              className="text-xs text-[var(--color-accent-primary,#818cf8)] hover:underline cursor-pointer"
            >
              Quên mật khẩu?
            </button>
          </div>

          <Button type="submit" variant="primary" loading={loading} fullWidth className="mt-2">
            Đăng nhập
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t border-[var(--color-border-subtle,#1e212b)] text-center text-xs text-[var(--color-text-secondary,#9ca3af)]">
          Chưa có tài khoản?{' '}
          <button
            onClick={() => onNavigate('/register')}
            className="text-[var(--color-accent-primary,#818cf8)] font-semibold hover:underline cursor-pointer"
          >
            Đăng ký tài khoản mới
          </button>
        </div>
      </Card>
    </div>
  );
};

export const RegisterPage: React.FC<AuthPageProps> = ({ onNavigate }) => {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password || !displayName) {
      setError('Vui lòng điền đầy đủ các trường thông tin.');
      return;
    }
    if (password.length < 8) {
      setError('Mật khẩu phải chứa ít nhất 8 ký tự.');
      return;
    }

    setLoading(true);
    const res = await register({ email, name: displayName, password });
    setLoading(false);
    if (res.success) {
      onNavigate('/trade/BTCUSDT');
    } else {
      setError(res.error || 'Đăng ký tài khoản không thành công.');
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <Card variant="surface" className="max-w-md w-full border-[var(--color-border-default,#272a33)]">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-[var(--color-text-primary,#f3f4f6)] mb-2">
            Tạo tài khoản giao dịch
          </h2>
          <p className="text-xs text-[var(--color-text-secondary,#9ca3af)]">
            Nhận ngay 10.000 USDT thử nghiệm sau khi xác minh email
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-[var(--radius-md,8px)] bg-[var(--color-sell-bg,rgba(248,113,113,0.12))] border border-[var(--color-sell,#f87171)]/20 text-xs text-[var(--color-sell,#f87171)] flex items-center gap-2">
            <AlertCircleIcon size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Địa chỉ Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="trader@example.com"
            required
          />

          <Input
            label="Tên hiển thị"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Satoshi Nakamoto"
            required
          />

          <Input
            label="Mật khẩu (tối thiểu 8 ký tự)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          <Button type="submit" variant="primary" loading={loading} fullWidth className="mt-2">
            Đăng ký tài khoản
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t border-[var(--color-border-subtle,#1e212b)] text-center text-xs text-[var(--color-text-secondary,#9ca3af)]">
          Đã có tài khoản?{' '}
          <button
            onClick={() => onNavigate('/login')}
            className="text-[var(--color-accent-primary,#818cf8)] font-semibold hover:underline cursor-pointer"
          >
            Đăng nhập ngay
          </button>
        </div>
      </Card>
    </div>
  );
};

export const ForgotPasswordPage: React.FC<AuthPageProps> = ({ onNavigate }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const api = getApiClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await api.forgotPassword({ body: { email } });
    } catch {
      // Intentionally ignore error to prevent email enumeration
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <Card variant="surface" className="max-w-md w-full border-[var(--color-border-default,#272a33)]">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-[var(--color-text-primary,#f3f4f6)] mb-2">
            Khôi phục mật khẩu
          </h2>
          <p className="text-xs text-[var(--color-text-secondary,#9ca3af)]">
            Nhập email của bạn để nhận liên kết đặt lại mật khẩu
          </p>
        </div>

        {submitted ? (
          <div className="p-4 rounded-[var(--radius-md,8px)] bg-[var(--color-buy-bg,rgba(34,197,94,0.12))] border border-[var(--color-buy,#22c55e)]/20 text-center">
            <div className="w-10 h-10 rounded-full bg-[var(--color-buy,#22c55e)]/20 text-[var(--color-buy,#22c55e)] mx-auto flex items-center justify-center mb-2">
              <CheckIcon size={20} />
            </div>
            <p className="text-xs text-[var(--color-text-primary,#f3f4f6)] leading-relaxed">
              Nếu địa chỉ email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu đến hòm thư của bạn. Vui lòng kiểm tra email!
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('/login')}
              className="mt-4"
            >
              Quay lại đăng nhập
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Địa chỉ Email đã đăng ký"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trader@example.com"
              required
            />

            <Button type="submit" variant="primary" loading={loading} fullWidth>
              Gửi yêu cầu
            </Button>

            <button
              type="button"
              onClick={() => onNavigate('/login')}
              className="text-xs text-[var(--color-text-secondary,#9ca3af)] hover:text-white text-center cursor-pointer"
            >
              Hủy và quay lại đăng nhập
            </button>
          </form>
        )}
      </Card>
    </div>
  );
};

export const ResetPasswordPage: React.FC<AuthPageProps> = ({ onNavigate }) => {
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const api = getApiClient();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const t = urlParams.get('token');
    if (t) setToken(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError('Mã token đặt lại mật khẩu không hợp lệ hoặc thiếu.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword({ body: { token, newPassword } });
      setSuccess(true);
    } catch {
      setError('Mã đặt lại mật khẩu đã hết hạn hoặc không hợp lệ.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <Card variant="surface" className="max-w-md w-full border-[var(--color-border-default,#272a33)]">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-[var(--color-text-primary,#f3f4f6)] mb-2">
            Đặt lại mật khẩu mới
          </h2>
        </div>

        {success ? (
          <div className="p-4 rounded-[var(--radius-md,8px)] bg-[var(--color-buy-bg,rgba(34,197,94,0.12))] border border-[var(--color-buy,#22c55e)]/20 text-center">
            <p className="text-xs text-[var(--color-text-primary,#f3f4f6)] mb-4">
              Mật khẩu của bạn đã được cập nhật thành công!
            </p>
            <Button variant="primary" size="sm" onClick={() => onNavigate('/login')}>
              Đăng nhập với mật khẩu mới
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="p-3 rounded-[var(--radius-md,8px)] bg-[var(--color-sell-bg,rgba(248,113,113,0.12))] text-xs text-[var(--color-sell,#f87171)]">
                {error}
              </div>
            )}

            <Input
              label="Mã Token xác nhận"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Nhập mã token từ email"
              required
            />

            <Input
              label="Mật khẩu mới (tối thiểu 8 ký tự)"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              required
            />

            <Button type="submit" variant="primary" loading={loading} fullWidth>
              Lưu mật khẩu mới
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
};

export const VerifyEmailPage: React.FC<AuthPageProps> = ({ onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'success' | 'error' | 'pending'>('pending');
  const { refreshUser } = useAuth();
  const api = getApiClient();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
      setStatus('error');
      setLoading(false);
      return;
    }

    async function verify() {
      try {
        await api.verifyEmail({ body: { token: token! } });
        setStatus('success');
        await refreshUser();
      } catch {
        setStatus('error');
      } finally {
        setLoading(false);
      }
    }

    verify();
  }, [api, refreshUser]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <Card variant="surface" className="max-w-md w-full border-[var(--color-border-default,#272a33)] text-center p-6">
        {loading ? (
          <div className="py-8">
            <h3 className="text-base font-semibold mb-2">Đang xác minh địa chỉ email...</h3>
            <p className="text-xs text-[var(--color-text-secondary,#9ca3af)]">Vui lòng chờ giây lát</p>
          </div>
        ) : status === 'success' ? (
          <div className="py-4">
            <div className="w-12 h-12 rounded-full bg-[var(--color-buy,#22c55e)]/20 text-[var(--color-buy,#22c55e)] mx-auto flex items-center justify-center mb-4">
              <CheckIcon size={24} />
            </div>
            <h3 className="text-lg font-bold text-[var(--color-text-primary,#f3f4f6)] mb-2">
              Xác minh email thành công!
            </h3>
            <p className="text-xs text-[var(--color-text-secondary,#9ca3af)] mb-6">
              Tài khoản của bạn đã được kích hoạt đầy đủ quyền giao dịch và nạp tiền Faucet.
            </p>
            <Button variant="primary" onClick={() => onNavigate('/wallet')}>
              Đến trang Ví nạp tiền
            </Button>
          </div>
        ) : (
          <div className="py-4">
            <div className="w-12 h-12 rounded-full bg-[var(--color-sell,#f87171)]/20 text-[var(--color-sell,#f87171)] mx-auto flex items-center justify-center mb-4">
              <AlertCircleIcon size={24} />
            </div>
            <h3 className="text-lg font-bold text-[var(--color-text-primary,#f3f4f6)] mb-2">
              Xác minh thất bại
            </h3>
            <p className="text-xs text-[var(--color-text-secondary,#9ca3af)] mb-6">
              Mã xác minh không hợp lệ hoặc đã hết hạn sử dụng.
            </p>
            <Button variant="outline" onClick={() => onNavigate('/login')}>
              Về trang đăng nhập
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};
