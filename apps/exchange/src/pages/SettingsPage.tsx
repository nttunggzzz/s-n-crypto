import React, { useState, useEffect, useMemo } from 'react';
import type { SessionInfo, AvatarId, SecurityOverview, LoginEvent, Preferences, CandleInterval } from '@cex/contracts';
import { ApiError } from '@cex/contracts';

type UpdatePreferencesInput = Partial<Preferences>;
import { getApiClient } from '../services/api.ts';
import { getErrorMessage } from '../services/errors.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { AvatarIcon, AVATAR_LIST } from '../components/AvatarIcon.tsx';
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
  Modal,
  useToast,
  EmptyState,
} from '@cex/ui';

import { User, Shield, Settings, Copy, Check, ShieldCheck, Lock, Key, AlertTriangle, ShieldAlert } from 'lucide-react';

export interface SettingsPageProps {
  onNavigate: (path: string) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onNavigate }) => {
  const { user, isAuthenticated, logout, refreshUser } = useAuth();
  const { success, error: toastError } = useToast();
  const api = getApiClient();

  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialTab = searchParams.get('tab') === 'security'
    ? 'security'
    : searchParams.get('tab') === 'preferences'
    ? 'preferences'
    : 'profile';

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'preferences'>(initialTab);

  // Profile states
  const [nameInput, setNameInput] = useState(user?.name || '');
  const [updatingName, setUpdatingName] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [updatingAvatar, setUpdatingAvatar] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

  useEffect(() => {
    if (user?.name) {
      setNameInput(user.name);
    }
  }, [user?.name]);

  // Security Overview states
  const [secOverview, setSecOverview] = useState<SecurityOverview | null>(null);
  const [loginEvents, setLoginEvents] = useState<LoginEvent[]>([]);
  const [loadingSec, setLoadingSec] = useState(false);

  // Anti-phishing modal
  const [antiPhishingModalOpen, setAntiPhishingModalOpen] = useState(false);
  const [antiCodeInput, setAntiCodeInput] = useState('');
  const [antiPasswordInput, setAntiPasswordInput] = useState('');
  const [anti2faInput, setAnti2faInput] = useState('');
  const [savingAntiPhishing, setSavingAntiPhishing] = useState(false);

  // 2FA modal
  const [twoFactorModalOpen, setTwoFactorModalOpen] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState<'SETUP' | 'RECOVERY' | 'DISABLE'>('SETUP');
  const [twoFactorSetupData, setTwoFactorSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [twoFactorRecoveryCodes, setTwoFactorRecoveryCodes] = useState<string[]>([]);
  const [twoFactorCodeInput, setTwoFactorCodeInput] = useState('');
  const [twoFactorPasswordInput, setTwoFactorPasswordInput] = useState('');
  const [processingTwoFactor, setProcessingTwoFactor] = useState(false);

  // Regenerate Recovery Codes states (B5)
  const [regenerateModalOpen, setRegenerateModalOpen] = useState(false);
  const [regenerateCodeInput, setRegenerateCodeInput] = useState('');
  const [regeneratingCodes, setRegeneratingCodes] = useState(false);
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);

  const fetchSecurityData = async () => {
    if (!isAuthenticated) return;
    setLoadingSec(true);
    try {
      const [sec, logs] = await Promise.all([
        api.securityOverview(),
        api.loginHistory({ query: { limit: 20 } }),
      ]);
      setSecOverview(sec);
      setLoginEvents(logs.items);
    } catch {} finally {
      setLoadingSec(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchSecurityData();
    }
  }, [isAuthenticated]);

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
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('dark');
  const [colorReversed, setColorReversed] = useState(false);
  const [confirmOrders, setConfirmOrders] = useState(true);
  const [defaultInterval, setDefaultInterval] = useState<CandleInterval>('15m');
  const [locale, setLocale] = useState<'vi' | 'en'>('vi');

  useEffect(() => {
    if (isAuthenticated) {
      api.getPreferences()
        .then((pref) => {
          setTheme(pref.theme);
          setColorReversed(pref.upColor === 'RED');
          setConfirmOrders(pref.confirmOrders);
          setDefaultInterval(pref.defaultInterval);
          setLocale(pref.locale);

          document.documentElement.setAttribute('data-theme', pref.theme === 'light' ? 'light' : 'dark');
          document.documentElement.setAttribute('data-color-reversed', pref.upColor === 'RED' ? 'true' : 'false');
        })
        .catch(() => {});
    } else {
      const rawTheme = localStorage.getItem('cex_theme');
      const savedTheme: 'system' | 'light' | 'dark' =
        rawTheme === 'light' || rawTheme === 'system' || rawTheme === 'dark' ? rawTheme : 'dark';
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);

      const savedReversed = localStorage.getItem('cex_color_reversed') === 'true';
      setColorReversed(savedReversed);
      document.documentElement.setAttribute('data-color-reversed', savedReversed ? 'true' : 'false');
    }
  }, [isAuthenticated, api]);

  const handleUpdatePref = async (patch: UpdatePreferencesInput) => {
    if (isAuthenticated) {
      try {
        await api.updatePreferences({ body: patch });
      } catch {}
    }
  };

  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('cex_theme', next);
    document.documentElement.setAttribute('data-theme', next);
    handleUpdatePref({ theme: next });
    success(`Đã chuyển sang giao diện ${next === 'dark' ? 'Tối' : 'Sáng'}.`);
  };

  const handleToggleColorReverse = () => {
    const next = !colorReversed;
    setColorReversed(next);
    localStorage.setItem('cex_color_reversed', next ? 'true' : 'false');
    document.documentElement.setAttribute('data-color-reversed', next ? 'true' : 'false');
    handleUpdatePref({ upColor: next ? 'RED' : 'GREEN' });
    success(`Đã ${next ? 'bật' : 'tắt'} chế độ đảo màu tăng/giảm.`);
  };

  const handleToggleConfirmOrders = () => {
    const next = !confirmOrders;
    setConfirmOrders(next);
    handleUpdatePref({ confirmOrders: next });
    success(`Đã ${next ? 'bật' : 'tắt'} hộp xác nhận đặt lệnh.`);
  };

  const handleChangeInterval = (val: CandleInterval) => {
    setDefaultInterval(val);
    handleUpdatePref({ defaultInterval: val });
    success(`Đã lưu khung thời gian nến mặc định: ${val}.`);
  };

  const fetchSessions = async () => {
    if (!isAuthenticated) return;
    setLoadingSessions(true);
    try {
      const res = await api.listSessions();
      setSessions(res.items);
    } catch {
      // Ignore
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [isAuthenticated]);

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
      success('Đổi mật khẩu thành công!');
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
          description="Vui lòng đăng nhập để xem thông tin tài khoản."
          action={
            <Button variant="primary" onClick={() => onNavigate('/login')}>
              Đăng nhập
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-20 w-full flex flex-col md:flex-row gap-8">
      {/* Sidebar */}
      <aside className="w-full md:w-64 shrink-0 flex flex-col gap-2">
        <h1 className="text-xl font-bold text-[var(--text,#f4f4f5)] mb-4">Cài đặt</h1>
        
        <button 
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md,8px)] transition-colors text-sm font-semibold ${activeTab === 'profile' ? 'bg-[var(--panel-2,#141416)] text-[var(--text,#f4f4f5)]' : 'text-[var(--text-3,#63636b)] hover:text-[var(--text-2,#a1a1aa)] hover:bg-[var(--panel-2,#141416)]/50'}`}
        >
          <User size={18} /> Hồ sơ & Tài khoản
        </button>
        <button 
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md,8px)] transition-colors text-sm font-semibold ${activeTab === 'security' ? 'bg-[var(--panel-2,#141416)] text-[var(--text,#f4f4f5)]' : 'text-[var(--text-3,#63636b)] hover:text-[var(--text-2,#a1a1aa)] hover:bg-[var(--panel-2,#141416)]/50'}`}
        >
          <Shield size={18} /> Bảo mật & Phiên
        </button>
        <button 
          onClick={() => setActiveTab('preferences')}
          className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md,8px)] transition-colors text-sm font-semibold ${activeTab === 'preferences' ? 'bg-[var(--panel-2,#141416)] text-[var(--text,#f4f4f5)]' : 'text-[var(--text-3,#63636b)] hover:text-[var(--text-2,#a1a1aa)] hover:bg-[var(--panel-2,#141416)]/50'}`}
        >
          <Settings size={18} /> Tùy chọn hiển thị
        </button>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {activeTab === 'profile' && (
          <div className="space-y-6 max-w-2xl">
            <h2 className="text-lg font-bold text-[var(--text,#f4f4f5)] mb-6 pb-2 border-b border-[var(--line,#1d1e21)]">Hồ sơ cá nhân</h2>
            
            {/* Avatar & Display Name */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-8 p-4 rounded-[var(--radius-lg,12px)] bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)]">
              <div className="relative">
                <AvatarIcon
                  avatarId={user?.avatar}
                  size={72}
                  fallbackText={user?.name || user?.email || 'U'}
                />
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-[var(--text,#f4f4f5)]">{user?.name || 'Chưa đặt tên'}</span>
                  {user?.avatar && (
                    <Badge variant="info" size="sm">
                      {AVATAR_LIST.find((a) => a.id === user.avatar)?.name || user.avatar}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setAvatarPickerOpen(!avatarPickerOpen)}
                  >
                    {avatarPickerOpen ? 'Đóng bộ chọn' : 'Đổi ảnh đại diện'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Avatar Picker Grid */}
            {avatarPickerOpen && (
              <div className="p-4 rounded-[var(--radius-lg,12px)] bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-2,#a1a1aa)]">
                    Chọn biểu tượng đại diện (12 nhân vật biểu trưng crypto)
                  </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {AVATAR_LIST.map((av) => {
                    const isSelected = user?.avatar === av.id;
                    return (
                      <button
                        key={av.id}
                        type="button"
                        disabled={updatingAvatar}
                        onClick={async () => {
                          setUpdatingAvatar(true);
                          try {
                            await api.updateProfile({ body: { avatar: av.id } });
                            await refreshUser();
                            success(`Đã đổi avatar thành "${av.name}"`);
                            setAvatarPickerOpen(false);
                          } catch {
                            toastError('Không thể cập nhật ảnh đại diện.');
                          } finally {
                            setUpdatingAvatar(false);
                          }
                        }}
                        className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[var(--accent,#818cf8)] bg-[var(--accent,#818cf8)]/10 shadow-sm'
                            : 'border-[var(--line,#1d1e21)] hover:border-[var(--text-3,#63636b)] hover:bg-[var(--panel,#0a0a0b)]'
                        }`}
                      >
                        <AvatarIcon avatarId={av.id} size={44} />
                        <span className="text-[11px] text-[var(--text-2,#a1a1aa)] font-medium text-center line-clamp-1">
                          {av.name.split(' ')[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Account Details Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-[var(--panel,#0a0a0b)] p-5 rounded-[var(--radius-lg,12px)] border border-[var(--line,#1d1e21)]">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-2,#a1a1aa)] mb-1">Email đăng nhập</label>
                <div className="text-sm font-medium text-[var(--text,#f4f4f5)] flex items-center gap-2">
                  <span>{user?.email}</span>
                  {user?.emailVerified && (
                    <Badge variant="success" size="sm">Đã xác minh</Badge>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-2,#a1a1aa)] mb-1">UID Tài khoản</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-bold text-[var(--text,#f4f4f5)]">{user?.uid || '—'}</span>
                  {user?.uid && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(user.uid);
                        setCopiedUid(true);
                        success('Đã sao chép UID!');
                        setTimeout(() => setCopiedUid(false), 2000);
                      }}
                      className="p-1 rounded hover:bg-[var(--panel-2,#141416)] text-[var(--text-3,#63636b)] hover:text-white transition-colors"
                      title="Sao chép UID"
                    >
                      {copiedUid ? <Check size={14} className="text-[var(--up,#1fc27a)]" /> : <Copy size={14} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Display Name Edit */}
              <div className="sm:col-span-2 pt-2 border-t border-[var(--line,#1d1e21)]">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!nameInput.trim()) return;
                    setUpdatingName(true);
                    try {
                      await api.updateProfile({ body: { name: nameInput.trim() } });
                      await refreshUser();
                      success('Đã cập nhật tên hiển thị!');
                    } catch {
                      toastError('Không thể cập nhật tên hiển thị.');
                    } finally {
                      setUpdatingName(false);
                    }
                  }}
                  className="flex flex-col sm:flex-row items-end gap-3"
                >
                  <div className="flex-1 w-full">
                    <Input
                      label="Tên hiển thị"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Nhập tên hiển thị..."
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="secondary"
                    loading={updatingName}
                    disabled={nameInput.trim() === user?.name}
                    className="shrink-0"
                  >
                    Lưu tên
                  </Button>
                </form>
              </div>
            </div>

            {/* Social / Telegram */}
            <div className="pt-6 border-t border-[var(--line,#1d1e21)]">
              <h3 className="text-sm font-bold text-[var(--text,#f4f4f5)] mb-4">Liên kết mạng xã hội</h3>
              <div className="flex items-center justify-between p-4 rounded-[var(--radius-lg,12px)] border border-[var(--line,#1d1e21)] bg-[var(--panel,#0a0a0b)]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#2AABEE]/20 text-[#2AABEE] rounded-full flex items-center justify-center font-bold">T</div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--text,#f4f4f5)]">Telegram</div>
                    <div className="text-xs text-[var(--text-3,#63636b)]">Nhận thông báo biến động và lệnh khớp qua Telegram</div>
                  </div>
                </div>
                <Badge variant="secondary" size="sm">Sắp có</Badge>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-8 max-w-3xl">
            <h2 className="text-lg font-bold text-[var(--text,#f4f4f5)] pb-2 border-b border-[var(--line,#1d1e21)]">
              Bảo mật tài khoản
            </h2>

            {/* Security Level Progress Bar */}
            <div className="p-5 rounded-[var(--radius-lg,12px)] border border-[var(--line,#1d1e21)] bg-[var(--panel,#0a0a0b)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={20} className={secOverview?.twoFactorEnabled ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--warn,#f5b544)]'} />
                  <span className="font-bold text-sm text-[var(--text,#f4f4f5)]">Mức độ bảo mật</span>
                </div>
                <Badge
                  variant={
                    (user?.emailVerified ? 1 : 0) + (secOverview?.twoFactorEnabled ? 1 : 0) + (secOverview?.antiPhishingCode ? 1 : 0) >= 3
                      ? 'success'
                      : (user?.emailVerified ? 1 : 0) + (secOverview?.twoFactorEnabled ? 1 : 0) + (secOverview?.antiPhishingCode ? 1 : 0) >= 2
                      ? 'warning'
                      : 'error'
                  }
                  size="sm"
                >
                  {(user?.emailVerified ? 1 : 0) + (secOverview?.twoFactorEnabled ? 1 : 0) + (secOverview?.antiPhishingCode ? 1 : 0) >= 3
                    ? 'Cao'
                    : (user?.emailVerified ? 1 : 0) + (secOverview?.twoFactorEnabled ? 1 : 0) + (secOverview?.antiPhishingCode ? 1 : 0) >= 2
                    ? 'Trung bình'
                    : 'Thấp'}
                </Badge>
              </div>

              {/* Progress Bar 3 segments */}
              <div className="grid grid-cols-3 gap-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    user?.emailVerified ? 'bg-[var(--up,#1fc27a)]' : 'bg-[var(--line,#1d1e21)]'
                  }`}
                  title="Email đã xác minh"
                />
                <div
                  className={`h-2 rounded-full transition-all ${
                    secOverview?.twoFactorEnabled ? 'bg-[var(--up,#1fc27a)]' : 'bg-[var(--line,#1d1e21)]'
                  }`}
                  title="Xác thực 2FA"
                />
                <div
                  className={`h-2 rounded-full transition-all ${
                    secOverview?.antiPhishingCode ? 'bg-[var(--up,#1fc27a)]' : 'bg-[var(--line,#1d1e21)]'
                  }`}
                  title="Mã chống lừa đảo"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-[var(--text-3,#63636b)] pt-1">
                <span>Email: {user?.emailVerified ? '✓ Đã xác minh' : '✗ Chưa'}</span>
                <span>2FA: {secOverview?.twoFactorEnabled ? '✓ Đã bật' : '✗ Chưa'}</span>
                <span>Anti-phishing: {secOverview?.antiPhishingCode ? '✓ Đã đặt' : '✗ Chưa'}</span>
              </div>
            </div>

            {/* 2FA Card */}
            <div>
              <h3 className="text-sm font-bold text-[var(--text,#f4f4f5)] mb-3">Xác thực hai yếu tố (2FA)</h3>
              <div className="flex items-center justify-between p-4 rounded-[var(--radius-lg,12px)] border border-[var(--line,#1d1e21)] bg-[var(--panel,#0a0a0b)]">
                <div>
                  <div className="text-sm font-semibold text-[var(--text,#f4f4f5)] flex items-center gap-2">
                    Google Authenticator
                    <Badge variant={secOverview?.twoFactorEnabled ? 'success' : 'warning'} size="sm">
                      {secOverview?.twoFactorEnabled ? 'Đã bật' : 'Chưa bật'}
                    </Badge>
                  </div>
                  <div className="text-xs text-[var(--text-3,#63636b)] mt-1">
                    Bảo vệ tài khoản bằng mã TOTP 6 số từ Google Authenticator hoặc Authy
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {secOverview?.twoFactorEnabled && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRegenerateCodeInput('');
                        setNewRecoveryCodes(null);
                        setCopiedCodes(false);
                        setRegenerateModalOpen(true);
                      }}
                    >
                      Tạo lại mã khôi phục
                    </Button>
                  )}
                  <Button
                    variant={secOverview?.twoFactorEnabled ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={() => {
                      if (secOverview?.twoFactorEnabled) {
                        setTwoFactorStep('DISABLE');
                        setTwoFactorPasswordInput('');
                        setTwoFactorCodeInput('');
                        setTwoFactorModalOpen(true);
                      } else {
                        setTwoFactorStep('SETUP');
                        setTwoFactorPasswordInput('');
                        setTwoFactorCodeInput('');
                        setTwoFactorSetupData(null);
                        setTwoFactorModalOpen(true);
                      }
                    }}
                  >
                    {secOverview?.twoFactorEnabled ? 'Tắt 2FA' : 'Bật ngay'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Anti-phishing Code Card */}
            <div>
              <h3 className="text-sm font-bold text-[var(--text,#f4f4f5)] mb-3">Mã chống lừa đảo (Anti-Phishing)</h3>
              <div className="flex items-center justify-between p-4 rounded-[var(--radius-lg,12px)] border border-[var(--line,#1d1e21)] bg-[var(--panel,#0a0a0b)]">
                <div>
                  <div className="text-sm font-semibold text-[var(--text,#f4f4f5)] flex items-center gap-2">
                    Mã chống lừa đảo
                    <Badge variant={secOverview?.antiPhishingCode ? 'success' : 'secondary'} size="sm">
                      {secOverview?.antiPhishingCode ? `Đang dùng: ${secOverview.antiPhishingCode}` : 'Chưa đặt'}
                    </Badge>
                  </div>
                  <div className="text-xs text-[var(--text-3,#63636b)] mt-1 max-w-xl">
                    Mã này xuất hiện ở đầu mọi email thật từ sàn. Email không có mã = giả mạo.
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAntiCodeInput('');
                    setAntiPasswordInput('');
                    setAnti2faInput('');
                    setAntiPhishingModalOpen(true);
                  }}
                >
                  {secOverview?.antiPhishingCode ? 'Thay đổi' : 'Cài đặt'}
                </Button>
              </div>
            </div>

            {/* Change Password Card */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[var(--text,#f4f4f5)]">Đổi mật khẩu</h3>
                <span className="text-xs text-[var(--text-3,#63636b)]">
                  Đổi lần cuối: {secOverview?.passwordChangedAt ? new Date(secOverview.passwordChangedAt).toLocaleString('vi-VN') : 'Chưa đổi'}
                </span>
              </div>
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-md bg-[var(--panel,#0a0a0b)] p-5 rounded-[var(--radius-lg,12px)] border border-[var(--line,#1d1e21)]">
                <Input label="Mật khẩu hiện tại" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
                <Input label="Mật khẩu mới" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                <Input label="Xác nhận mật khẩu" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
                <Button type="submit" variant="secondary" fullWidth loading={changingPassword}>Cập nhật mật khẩu</Button>
              </form>
            </div>

            {/* Sessions Management */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[var(--text,#f4f4f5)]">
                  Phiên đăng nhập ({sessions.length})
                </h3>
                <Button variant="ghost" size="sm" onClick={fetchSessions}>Làm mới</Button>
              </div>
              
              <div className="border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,12px)] overflow-hidden bg-[var(--panel,#0a0a0b)]">
                <Table>
                  <TableHeader className="bg-transparent border-b border-[var(--line,#1d1e21)]">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs">Thiết bị</TableHead>
                      <TableHead className="text-xs">IP</TableHead>
                      <TableHead className="text-xs">Đăng nhập lúc</TableHead>
                      <TableHead className="text-right text-xs">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((sess) => (
                      <TableRow key={sess.id} className="border-b border-[var(--line,#1d1e21)]">
                        <TableCell className="font-semibold text-xs flex items-center gap-2 text-[var(--text,#f4f4f5)]">
                          <span>{sess.userAgent || 'Trình duyệt web'}</span>
                          {sess.current && <Badge variant="success" size="sm" className="bg-[var(--up,#1fc27a)]/10 text-[var(--up,#1fc27a)] border-none">Phiên này</Badge>}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-[var(--text-3,#63636b)]">{sess.ip || '127.0.0.1'}</TableCell>
                        <TableCell className="text-xs text-[var(--text-3,#63636b)]">{new Date(sess.createdAt).toLocaleString('vi-VN')}</TableCell>
                        <TableCell className="text-right">
                          {sess.current ? (
                            <Button variant="ghost" size="sm" onClick={logout} className="text-xs text-[var(--text-3,#63636b)] hover:text-[var(--text,#f4f4f5)]">Đăng xuất</Button>
                          ) : (
                            <Button variant="ghost" size="sm" loading={revokingId === sess.id} onClick={() => handleRevokeSession(sess.id)} className="text-xs text-[var(--down,#f2475f)]">Thu hồi</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Login History */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[var(--text,#f4f4f5)]">
                  Lịch sử đăng nhập ({loginEvents.length} lần gần nhất)
                </h3>
                <Button variant="ghost" size="sm" onClick={fetchSecurityData}>Làm mới</Button>
              </div>

              <div className="border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,12px)] overflow-hidden bg-[var(--panel,#0a0a0b)]">
                <Table>
                  <TableHeader className="bg-transparent border-b border-[var(--line,#1d1e21)]">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs">Thời gian</TableHead>
                      <TableHead className="text-xs">Thiết bị</TableHead>
                      <TableHead className="text-xs">IP</TableHead>
                      <TableHead className="text-right text-xs">Kết quả</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loginEvents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-6 text-xs text-[var(--text-3,#63636b)]">
                          Chưa có lịch sử đăng nhập nào.
                        </TableCell>
                      </TableRow>
                    ) : (
                      loginEvents.map((evt) => {
                        const isSuccess = evt.result === 'OK';
                        return (
                          <TableRow
                            key={evt.id}
                            className={`border-b border-[var(--line,#1d1e21)] ${
                              !isSuccess ? 'bg-[var(--down,#f2475f)]/5' : ''
                            }`}
                          >
                            <TableCell className="text-xs font-mono text-[var(--text-3,#63636b)]">
                              {new Date(evt.at).toLocaleString('vi-VN')}
                            </TableCell>
                            <TableCell className="text-xs font-medium text-[var(--text,#f4f4f5)] flex items-center gap-2">
                              <span>{evt.device || 'Trình duyệt web'}</span>
                              {evt.newDevice && (
                                <Badge variant="warning" size="sm" className="bg-[var(--warn,#f5b544)]/10 text-[var(--warn,#f5b544)] border-none">
                                  Thiết bị mới
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-[var(--text-3,#63636b)]">
                              {evt.ip || '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              {evt.result === 'OK' ? (
                                <Badge variant="success" size="sm">Thành công</Badge>
                              ) : evt.result === 'BAD_PASSWORD' ? (
                                <Badge variant="error" size="sm">Sai mật khẩu</Badge>
                              ) : evt.result === 'BAD_2FA' ? (
                                <Badge variant="error" size="sm">Sai mã 2FA</Badge>
                              ) : (
                                <Badge variant="error" size="sm">Tạm khóa</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Anti-phishing Code */}
        <Modal
          isOpen={antiPhishingModalOpen}
          onClose={() => setAntiPhishingModalOpen(false)}
          title={secOverview?.antiPhishingCode ? 'Thay đổi mã chống lừa đảo' : 'Cài đặt mã chống lừa đảo'}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!antiPasswordInput) return;
              setSavingAntiPhishing(true);
              try {
                await api.setAntiPhishingCode({
                  body: {
                    code: antiCodeInput.trim() ? antiCodeInput.trim() : null,
                    currentPassword: antiPasswordInput,
                    twoFactorCode: anti2faInput.trim() ? anti2faInput.trim() : undefined,
                  },
                });
                success(antiCodeInput.trim() ? 'Đã cài đặt mã chống lừa đảo thành công!' : 'Đã xóa mã chống lừa đảo.');
                setAntiPhishingModalOpen(false);
                setAntiCodeInput('');
                setAntiPasswordInput('');
                setAnti2faInput('');
                fetchSecurityData();
              } catch (err: unknown) {
                if (err instanceof ApiError) {
                  toastError(getErrorMessage(err.code));
                } else {
                  toastError('Không thể cập nhật mã chống lừa đảo.');
                }
              } finally {
                setSavingAntiPhishing(false);
              }
            }}
            className="space-y-4 text-xs"
          >
            <p className="text-[var(--text-2,#a1a1aa)] leading-relaxed">
              Mã chống lừa đảo (4–20 ký tự chữ hoặc số) sẽ xuất hiện ở đầu mọi email thật gửi từ sàn để giúp bạn phân biệt với email giả mạo.
            </p>

            <div>
              <Input
                label="Mã chống lừa đảo mới (Để trống nếu muốn xóa)"
                value={antiCodeInput}
                onChange={(e) => setAntiCodeInput(e.target.value)}
                placeholder="VD: Safu2026"
              />
            </div>

            <div>
              <Input
                label="Mật khẩu tài khoản (Bắt buộc)"
                type="password"
                value={antiPasswordInput}
                onChange={(e) => setAntiPasswordInput(e.target.value)}
                required
              />
            </div>

            {secOverview?.twoFactorEnabled && (
              <div>
                <Input
                  label="Mã xác thực 2FA (6 chữ số)"
                  value={anti2faInput}
                  onChange={(e) => setAnti2faInput(e.target.value)}
                  placeholder="000000"
                  required
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setAntiPhishingModalOpen(false)}>
                Hủy bỏ
              </Button>
              <Button type="submit" variant="primary" loading={savingAntiPhishing}>
                Lưu mã
              </Button>
            </div>
          </form>
        </Modal>

        {/* Modal: 2FA Setup & Disable */}
        <Modal
          isOpen={twoFactorModalOpen}
          onClose={() => setTwoFactorModalOpen(false)}
          title={twoFactorStep === 'DISABLE' ? 'Tắt xác thực 2FA' : 'Kích hoạt xác thực 2FA'}
        >
          {twoFactorStep === 'DISABLE' ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!twoFactorPasswordInput || !twoFactorCodeInput) return;
                setProcessingTwoFactor(true);
                try {
                  await api.disableTwoFactor({
                    body: {
                      currentPassword: twoFactorPasswordInput,
                      code: twoFactorCodeInput.trim(),
                    },
                  });
                  success('Đã tắt 2FA thành công.');
                  setTwoFactorModalOpen(false);
                  fetchSecurityData();
                  refreshUser();
                } catch (err: unknown) {
                  if (err instanceof ApiError) {
                    toastError(getErrorMessage(err.code));
                  } else {
                    toastError('Không thể tắt 2FA.');
                  }
                } finally {
                  setProcessingTwoFactor(false);
                }
              }}
              className="space-y-4 text-xs"
            >
              <p className="text-[var(--text-2,#a1a1aa)]">
                Vui lòng nhập mật khẩu tài khoản và mã 2FA từ ứng dụng để xác nhận tắt bảo mật 2 bước.
              </p>
              <Input
                label="Mật khẩu hiện tại"
                type="password"
                value={twoFactorPasswordInput}
                onChange={(e) => setTwoFactorPasswordInput(e.target.value)}
                required
              />
              <Input
                label="Mã 2FA (6 số)"
                value={twoFactorCodeInput}
                onChange={(e) => setTwoFactorCodeInput(e.target.value)}
                placeholder="000000"
                required
              />
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={() => setTwoFactorModalOpen(false)}>
                  Hủy
                </Button>
                <Button type="submit" variant="primary" loading={processingTwoFactor}>
                  Xác nhận tắt 2FA
                </Button>
              </div>
            </form>
          ) : twoFactorStep === 'RECOVERY' ? (
            <div className="space-y-4 text-xs">
              <p className="text-[var(--text-2,#a1a1aa)]">
                Lưu lại 10 mã khôi phục bên dưới ở nơi an toàn. Mỗi mã chỉ sử dụng được 1 lần khi bạn mất thiết bị 2FA.
              </p>
              <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] font-mono text-center">
                {twoFactorRecoveryCodes.map((code, idx) => (
                  <div key={idx} className="p-1 rounded bg-[var(--panel,#0a0a0b)] text-white">
                    {code}
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-2">
                <Button variant="primary" onClick={() => setTwoFactorModalOpen(false)}>
                  Tôi đã lưu các mã này
                </Button>
              </div>
            </div>
          ) : !twoFactorSetupData ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!twoFactorPasswordInput) return;
                setProcessingTwoFactor(true);
                try {
                  const res = await api.setupTwoFactor({ body: { currentPassword: twoFactorPasswordInput } });
                  setTwoFactorSetupData(res);
                } catch (err: unknown) {
                  if (err instanceof ApiError) {
                    toastError(getErrorMessage(err.code));
                  } else {
                    toastError('Mật khẩu không chính xác.');
                  }
                } finally {
                  setProcessingTwoFactor(false);
                }
              }}
              className="space-y-4 text-xs"
            >
              <p className="text-[var(--text-2,#a1a1aa)]">
                Nhập mật khẩu tài khoản để nhận khóa bí mật thiết lập 2FA.
              </p>
              <Input
                label="Mật khẩu tài khoản"
                type="password"
                value={twoFactorPasswordInput}
                onChange={(e) => setTwoFactorPasswordInput(e.target.value)}
                required
              />
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={() => setTwoFactorModalOpen(false)}>
                  Hủy
                </Button>
                <Button type="submit" variant="primary" loading={processingTwoFactor}>
                  Tiếp tục
                </Button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!twoFactorCodeInput) return;
                setProcessingTwoFactor(true);
                try {
                  const res = await api.enableTwoFactor({ body: { code: twoFactorCodeInput.trim() } });
                  setTwoFactorRecoveryCodes(res.recoveryCodes);
                  setTwoFactorStep('RECOVERY');
                  success('Đã kích hoạt 2FA thành công!');
                  fetchSecurityData();
                  refreshUser();
                } catch (err: unknown) {
                  if (err instanceof ApiError) {
                    toastError(getErrorMessage(err.code));
                  } else {
                    toastError('Mã xác thực không hợp lệ.');
                  }
                } finally {
                  setProcessingTwoFactor(false);
                }
              }}
              className="space-y-4 text-xs"
            >
              <p className="text-[var(--text-2,#a1a1aa)]">
                Nhập khóa bí mật này vào ứng dụng Authenticator (Google Authenticator / Authy):
              </p>
              <div className="p-3 rounded-lg bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] font-mono text-center font-bold text-sm text-[var(--accent,#818cf8)] select-all">
                {twoFactorSetupData.secret}
              </div>
              <Input
                label="Mã xác thực 6 số từ ứng dụng"
                value={twoFactorCodeInput}
                onChange={(e) => setTwoFactorCodeInput(e.target.value)}
                placeholder="000000"
                required
              />
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={() => setTwoFactorModalOpen(false)}>
                  Hủy
                </Button>
                <Button type="submit" variant="primary" loading={processingTwoFactor}>
                  Kích hoạt 2FA
                </Button>
              </div>
            </form>
          )}
        </Modal>

        {/* Regenerate Recovery Codes Modal (B5) */}
        <Modal
          isOpen={regenerateModalOpen}
          onClose={() => {
            setRegenerateModalOpen(false);
            setNewRecoveryCodes(null);
          }}
          title="Tạo lại mã khôi phục 2FA"
        >
          {newRecoveryCodes ? (
            <div className="space-y-4 text-xs">
              <p className="text-[var(--text-2,#a1a1aa)] leading-relaxed">
                Các mã khôi phục cũ đã bị hủy. Vui lòng lưu lại danh sách 10 mã khôi phục mới dưới đây:
              </p>
              <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] font-mono text-center">
                {newRecoveryCodes.map((code, idx) => (
                  <div key={idx} className="p-1.5 rounded bg-[var(--panel,#0a0a0b)] text-white text-xs select-all">
                    {code}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(newRecoveryCodes.join('\n'));
                      setCopiedCodes(true);
                      setTimeout(() => setCopiedCodes(false), 2000);
                    }}
                  >
                    {copiedCodes ? <Check size={14} className="mr-1 text-[var(--up,#1fc27a)]" /> : <Copy size={14} className="mr-1" />}
                    {copiedCodes ? 'Đã chép' : 'Sao chép tất cả'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const blob = new Blob([newRecoveryCodes.join('\n')], { type: 'text/plain;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `recovery-codes-${Date.now()}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Tải về (.txt)
                  </Button>
                </div>
                <Button
                  variant="primary"
                  onClick={() => {
                    setRegenerateModalOpen(false);
                    setNewRecoveryCodes(null);
                  }}
                >
                  Tôi đã lưu các mã này
                </Button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!regenerateCodeInput) return;
                setRegeneratingCodes(true);
                try {
                  const res = await api.regenerateRecoveryCodes({ body: { code: regenerateCodeInput.trim() } });
                  setNewRecoveryCodes(res.recoveryCodes);
                  success('Đã tạo lại mã khôi phục mới thành công!');
                } catch (err: unknown) {
                  if (err instanceof ApiError) {
                    toastError(getErrorMessage(err.code));
                  } else {
                    toastError('Không thể tạo lại mã khôi phục.');
                  }
                } finally {
                  setRegeneratingCodes(false);
                }
              }}
              className="space-y-4 text-xs"
            >
              <p className="text-[var(--text-2,#a1a1aa)]">
                Nhập mã xác thực 2FA từ ứng dụng Google Authenticator để tạo lại bộ mã khôi phục mới.
              </p>
              <Input
                label="Mã xác thực 2FA (6 chữ số)"
                value={regenerateCodeInput}
                onChange={(e) => setRegenerateCodeInput(e.target.value)}
                placeholder="000000"
                required
              />
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={() => setRegenerateModalOpen(false)}>
                  Hủy
                </Button>
                <Button type="submit" variant="primary" loading={regeneratingCodes}>
                  Tạo mã mới
                </Button>
              </div>
            </form>
          )}
        </Modal>

        {activeTab === 'preferences' && (
          <div className="space-y-6 max-w-2xl">
            <h2 className="text-lg font-bold text-[var(--text,#f4f4f5)] mb-6 pb-2 border-b border-[var(--line,#1d1e21)]">Tùy chọn hiển thị</h2>
            
            <div className="flex flex-col gap-4">
              {/* Theme mode */}
              <div className="flex items-center justify-between p-4 rounded-[var(--radius-lg,12px)] border border-[var(--line,#1d1e21)] bg-[var(--panel,#0a0a0b)]">
                <div>
                  <div className="font-semibold text-sm text-[var(--text,#f4f4f5)]">Chế độ sáng tối</div>
                  <div className="text-xs text-[var(--text-3,#63636b)] mt-1">Đang dùng: {theme === 'dark' ? 'Obsidian Black (Tối)' : 'Sáng'}</div>
                </div>
                <Button variant="secondary" size="sm" onClick={handleToggleTheme}>
                  Đổi sang {theme === 'dark' ? 'Sáng' : 'Tối'}
                </Button>
              </div>

              {/* Color reverse */}
              <div className="flex items-center justify-between p-4 rounded-[var(--radius-lg,12px)] border border-[var(--line,#1d1e21)] bg-[var(--panel,#0a0a0b)]">
                <div>
                  <div className="font-semibold text-sm text-[var(--text,#f4f4f5)]">Đảo màu Tăng/Giảm</div>
                  <div className="text-xs text-[var(--text-3,#63636b)] mt-1">
                    {colorReversed ? 'Đang bật: Đỏ = Tăng/Mua, Xanh = Giảm/Bán' : 'Mặc định: Xanh = Tăng/Mua, Đỏ = Giảm/Bán'}
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={handleToggleColorReverse}>
                  {colorReversed ? 'Tắt' : 'Bật'}
                </Button>
              </div>

              {/* Order Confirmation Dialog */}
              <div className="flex items-center justify-between p-4 rounded-[var(--radius-lg,12px)] border border-[var(--line,#1d1e21)] bg-[var(--panel,#0a0a0b)]">
                <div>
                  <div className="font-semibold text-sm text-[var(--text,#f4f4f5)]">Hộp xác nhận trước khi đặt lệnh</div>
                  <div className="text-xs text-[var(--text-3,#63636b)] mt-1">
                    {confirmOrders ? 'Đang bật: Hiển thị tóm tắt lệnh trước khi gửi' : 'Đang tắt: Gửi lệnh ngay khi nhấn nút'}
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={handleToggleConfirmOrders}>
                  {confirmOrders ? 'Tắt xác nhận' : 'Bật xác nhận'}
                </Button>
              </div>

              {/* Default Candle Interval */}
              <div className="flex items-center justify-between p-4 rounded-[var(--radius-lg,12px)] border border-[var(--line,#1d1e21)] bg-[var(--panel,#0a0a0b)]">
                <div>
                  <div className="font-semibold text-sm text-[var(--text,#f4f4f5)]">Khung thời gian nến mặc định</div>
                  <div className="text-xs text-[var(--text-3,#63636b)] mt-1">Khung nến tự động hiển thị khi vào trang giao dịch</div>
                </div>
                <div className="flex items-center gap-1 bg-[var(--panel-2,#141416)] p-1 rounded border border-[var(--line,#1d1e21)]">
                  {(['1m', '5m', '15m', '1h', '4h', '1d'] as CandleInterval[]).map((iv) => (
                    <button
                      key={iv}
                      onClick={() => handleChangeInterval(iv)}
                      className={`px-2 py-0.5 rounded text-xs font-semibold cursor-pointer transition-colors ${
                        defaultInterval === iv ? 'bg-[var(--accent,#818cf8)] text-black' : 'text-[var(--text-3,#63636b)] hover:text-white'
                      }`}
                    >
                      {iv}
                    </button>
                  ))}
                </div>
              </div>

              {/* Locale */}
              <div className="flex items-center justify-between p-4 rounded-[var(--radius-lg,12px)] border border-[var(--line,#1d1e21)] bg-[var(--panel,#0a0a0b)]">
                <div>
                  <div className="font-semibold text-sm text-[var(--text,#f4f4f5)]">Ngôn ngữ giao diện</div>
                  <div className="text-xs text-[var(--text-3,#63636b)] mt-1">Tiếng Việt (vi-VN)</div>
                </div>
                <Badge variant="secondary" size="sm">Tiếng Việt</Badge>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
