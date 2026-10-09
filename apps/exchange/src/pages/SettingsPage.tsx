import React, { useState, useEffect } from 'react';
import type { SessionInfo } from '@cex/contracts';
import { ApiError } from '@cex/contracts';
import { getApiClient } from '../services/api.ts';
import { getErrorMessage } from '../services/errors.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  Card,
  Input,
  Button,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  useToast,
  EmptyState,
} from '@cex/ui';

export interface SettingsPageProps {
  onNavigate: (path: string) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onNavigate }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const { success, error: toastError } = useToast();
  const api = getApiClient();

  // Change password states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Preference states
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [colorReversed, setColorReversed] = useState(false);

  useEffect(() => {
    // Read saved preferences
    const savedTheme = localStorage.getItem('cex_theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }

    const savedReversed = localStorage.getItem('cex_color_reversed') === 'true';
    setColorReversed(savedReversed);
    document.documentElement.setAttribute('data-color-reversed', savedReversed ? 'true' : 'false');
  }, []);

  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('cex_theme', next);
    document.documentElement.setAttribute('data-theme', next);
    success(`Đã chuyển sang giao diện ${next === 'dark' ? 'Tối (Obsidian Black)' : 'Sáng'}.`);
  };

  const handleToggleColorReverse = () => {
    const next = !colorReversed;
    setColorReversed(next);
    localStorage.setItem('cex_color_reversed', next ? 'true' : 'false');
    document.documentElement.setAttribute('data-color-reversed', next ? 'true' : 'false');
    success(`Đã ${next ? 'bật' : 'tắt'} chế độ đảo màu tăng/giảm.`);
  };

  // Fetch active sessions
  const fetchSessions = async () => {
    if (!isAuthenticated) return;
    setLoadingSessions(true);
    try {
      const res = await api.listSessions();
      setSessions(res.items);
    } catch {
      // Ignore session errors
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [isAuthenticated]);

  // Handle change password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;

    if (newPassword.length < 8) {
      toastError('Mật khẩu mới phải có tối thiểu 8 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toastError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setChangingPassword(true);
    try {
      await api.changePassword({ body: { currentPassword, newPassword } });
      success('Đổi mật khẩu thành công! Các phiên đăng nhập trên thiết bị khác đã được đăng xuất an toàn.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      fetchSessions();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError(getErrorMessage(err.code));
      } else {
        toastError('Không thể đổi mật khẩu.');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  // Handle revoke session
  const handleRevokeSession = async (sessionId: string) => {
    setRevokingId(sessionId);
    try {
      await api.revokeSession({ params: { sessionId } });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      success('Đã đăng xuất thiết bị thành công.');
    } catch {
      toastError('Không thể thu hồi phiên này.');
    } finally {
      setRevokingId(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <EmptyState
          title="Yêu cầu đăng nhập"
          description="Vui lòng đăng nhập để xem thông tin tài khoản và quản lý phiên làm việc."
          action={
            <Button variant="primary" onClick={() => onNavigate('/login')}>
              Đăng nhập ngay
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-20 md:pb-8 space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text-primary,#f3f4f6)]">
        Cài đặt tài khoản & Phiên đăng nhập
      </h1>

      {/* Profile Overview Card */}
      <Card variant="surface" className="p-6">
        <h3 className="text-sm font-bold text-[var(--color-text-primary,#f3f4f6)] mb-4">
          Thông tin cá nhân
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-[var(--color-text-muted,#6b7280)]">Tên hiển thị:</span>
            <div className="font-semibold text-sm text-[var(--color-text-primary,#f3f4f6)] mt-0.5">
              {user?.name || 'Chưa đặt tên'}
            </div>
          </div>
          <div>
            <span className="text-[var(--color-text-muted,#6b7280)]">Địa chỉ Email:</span>
            <div className="font-semibold text-sm text-[var(--color-text-primary,#f3f4f6)] mt-0.5 flex items-center gap-2">
              <span>{user?.email}</span>
              {user?.emailVerified ? (
                <Badge variant="success" size="sm">Đã xác minh</Badge>
              ) : (
                <Badge variant="warning" size="sm">Chưa xác minh</Badge>
              )}
            </div>
          </div>
          <div>
            <span className="text-[var(--color-text-muted,#6b7280)]">Vai trò hệ thống:</span>
            <div className="font-semibold text-sm text-[var(--color-text-primary,#f3f4f6)] mt-0.5">
              {user?.role?.toUpperCase() || 'USER'}
            </div>
          </div>
          <div>
            <span className="text-[var(--color-text-muted,#6b7280)]">Mã tài khoản ID:</span>
            <div className="font-mono text-xs text-[var(--color-text-secondary,#9ca3af)] mt-0.5">
              {user?.id}
            </div>
          </div>
        </div>
      </Card>

      {/* Preferences & Appearance Card */}
      <Card variant="surface" className="p-6">
        <h3 className="text-sm font-bold text-[var(--color-text-primary,#f3f4f6)] mb-4">
          Tùy chọn hiển thị & Giao diện
        </h3>
        <div className="space-y-4 text-xs">
          {/* Theme switcher */}
          <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border-subtle,#1e212b)]">
            <div>
              <div className="font-semibold text-[var(--color-text-primary,#f3f4f6)]">
                Chế độ màu giao diện
              </div>
              <div className="text-[var(--color-text-muted,#6b7280)] mt-0.5">
                Hiện tại: {theme === 'dark' ? 'Obsidian Black (Tối)' : 'Light (Sáng)'}
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={handleToggleTheme}>
              Đổi sang {theme === 'dark' ? 'Sáng' : 'Tối'}
            </Button>
          </div>

          {/* Color reverse */}
          <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border-subtle,#1e212b)]">
            <div>
              <div className="font-semibold text-[var(--color-text-primary,#f3f4f6)]">
                Đảo ngược màu sắc Tăng / Giảm
              </div>
              <div className="text-[var(--color-text-muted,#6b7280)] mt-0.5">
                {colorReversed
                  ? 'Đang bật: Đỏ = Tăng/Mua, Xanh = Giảm/Bán'
                  : 'Mặc định: Xanh = Tăng/Mua, Đỏ = Giảm/Bán'}
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={handleToggleColorReverse}>
              {colorReversed ? 'Về mặc định' : 'Đảo màu'}
            </Button>
          </div>

          {/* Language */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-[var(--color-text-primary,#f3f4f6)]">
                Ngôn ngữ giao diện
              </div>
              <div className="text-[var(--color-text-muted,#6b7280)] mt-0.5">
                Tiếng Việt (mặc định)
              </div>
            </div>
            <Badge variant="secondary" size="sm">Tiếng Việt (vi-VN)</Badge>
          </div>
        </div>
      </Card>

      {/* Change Password Card */}
      <Card variant="surface" className="p-6">
        <h3 className="text-sm font-bold text-[var(--color-text-primary,#f3f4f6)] mb-4">
          Đổi mật khẩu bảo mật
        </h3>
        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <Input
            label="Mật khẩu hiện tại"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
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

          <Input
            label="Xác nhận mật khẩu mới"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          <Button type="submit" variant="primary" size="md" loading={changingPassword}>
            Cập nhật mật khẩu
          </Button>
        </form>
      </Card>

      {/* Active Sessions Card */}
      <Card variant="surface" className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-[var(--color-text-primary,#f3f4f6)]">
              Danh sách phiên đăng nhập & Thiết bị
            </h3>
            <p className="text-xs text-[var(--color-text-secondary,#9ca3af)] mt-0.5">
              Quản lý các thiết bị và trình duyệt đang duy trì phiên hoạt động
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchSessions}>
            Làm mới
          </Button>
        </div>

        {sessions.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted,#6b7280)] py-4">
            Đang tải thông tin phiên đăng nhập...
          </p>
        ) : (
          <div className="border border-[var(--color-border-subtle,#1e212b)] rounded-[var(--radius-md,8px)] overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thiết bị / Trình duyệt</TableHead>
                  <TableHead>Địa chỉ IP</TableHead>
                  <TableHead>Đăng nhập lúc</TableHead>
                  <TableHead>Hoạt động gần nhất</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((sess) => (
                  <TableRow key={sess.id}>
                    <TableCell className="font-semibold text-xs flex items-center gap-2">
                      <span>{sess.userAgent || 'Trình duyệt web'}</span>
                      {sess.current && (
                        <Badge variant="success" size="sm">Phiên này</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[var(--color-text-secondary,#9ca3af)]">
                      {sess.ip || '127.0.0.1'}
                    </TableCell>
                    <TableCell className="text-xs text-[var(--color-text-muted,#6b7280)]">
                      {new Date(sess.createdAt).toLocaleString('vi-VN')}
                    </TableCell>
                    <TableCell className="text-xs text-[var(--color-text-muted,#6b7280)]">
                      {new Date(sess.lastSeenAt).toLocaleString('vi-VN')}
                    </TableCell>
                    <TableCell className="text-right">
                      {sess.current ? (
                        <Button variant="ghost" size="sm" onClick={logout} className="text-xs">
                          Đăng xuất
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={revokingId === sess.id}
                          onClick={() => handleRevokeSession(sess.id)}
                          className="text-xs text-[var(--color-sell,#f87171)]"
                        >
                          Thu hồi
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
};
