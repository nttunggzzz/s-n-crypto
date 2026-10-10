import React, { useState, useEffect } from 'react';
import type { SessionInfo, AvatarId } from '@cex/contracts';
import { ApiError } from '@cex/contracts';
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
  useToast,
  EmptyState,
} from '@cex/ui';

import { User, Shield, Settings, Copy, Check } from 'lucide-react';

export interface SettingsPageProps {
  onNavigate: (path: string) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onNavigate }) => {
  const { user, isAuthenticated, logout, refreshUser } = useAuth();
  const { success, error: toastError } = useToast();
  const api = getApiClient();

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'preferences'>('profile');

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
  const [defaultInterval, setDefaultInterval] = useState<string>('15m');
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
      const savedTheme = (localStorage.getItem('cex_theme') as any) || 'dark';
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);

      const savedReversed = localStorage.getItem('cex_color_reversed') === 'true';
      setColorReversed(savedReversed);
      document.documentElement.setAttribute('data-color-reversed', savedReversed ? 'true' : 'false');
    }
  }, [isAuthenticated, api]);

  const handleUpdatePref = async (patch: any) => {
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

  const handleChangeInterval = (val: string) => {
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
            <h2 className="text-lg font-bold text-[var(--text,#f4f4f5)] pb-2 border-b border-[var(--line,#1d1e21)]">Bảo mật tài khoản</h2>
            
            {/* 2FA */}
            <div>
               <h3 className="text-sm font-bold text-[var(--text,#f4f4f5)] mb-4">Xác thực hai yếu tố (2FA)</h3>
               <div className="flex items-center justify-between p-4 rounded-[var(--radius-lg,12px)] border border-[var(--line,#1d1e21)] bg-[var(--panel,#0a0a0b)]">
                 <div>
                   <div className="text-sm font-semibold text-[var(--text,#f4f4f5)] flex items-center gap-2">
                     Google Authenticator
                     <Badge variant="warning" size="sm">Chưa bật</Badge>
                   </div>
                   <div className="text-xs text-[var(--text-3,#63636b)] mt-1">Bảo vệ tài khoản của bạn bằng mã từ ứng dụng Authenticator</div>
                 </div>
                 <Button variant="primary" size="sm">Bật ngay</Button>
               </div>
            </div>

            {/* Change Password */}
            <div>
               <h3 className="text-sm font-bold text-[var(--text,#f4f4f5)] mb-4">Đổi mật khẩu</h3>
               <form onSubmit={handleChangePassword} className="space-y-4 max-w-md bg-[var(--panel,#0a0a0b)] p-5 rounded-[var(--radius-lg,12px)] border border-[var(--line,#1d1e21)]">
                 <Input label="Mật khẩu hiện tại" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
                 <Input label="Mật khẩu mới" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                 <Input label="Xác nhận mật khẩu" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
                 <Button type="submit" variant="secondary" fullWidth loading={changingPassword}>Cập nhật</Button>
               </form>
            </div>

            {/* Sessions */}
            <div>
               <div className="flex items-center justify-between mb-4">
                 <h3 className="text-sm font-bold text-[var(--text,#f4f4f5)]">Quản lý thiết bị</h3>
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
          </div>
        )}

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
                  {['1m', '5m', '15m', '1h', '4h', '1d'].map((iv) => (
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
