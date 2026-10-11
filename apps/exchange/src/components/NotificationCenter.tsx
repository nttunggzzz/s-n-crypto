import React, { useState, useEffect, useCallback } from 'react';
import type { Notification } from '@cex/contracts';
import { getApiClient } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useMarket } from '../context/MarketContext.tsx';
import { Button, Badge, Skeleton, useToast } from '@cex/ui';
import { Bell, CheckCheck, CheckCircle, AlertTriangle, AlertCircle, Clock, ExternalLink } from 'lucide-react';

export interface NotificationCenterProps {
  onNavigate?: (path: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ onNavigate }) => {
  const { isAuthenticated } = useAuth();
  const { realtimeClient } = useMarket();
  const { success, info: toastInfo } = useToast();
  const api = getApiClient();

  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);

  // Load unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await api.unreadNotifications();
      setUnreadCount(res.unread);
    } catch {}
  }, [api, isAuthenticated]);

  // Load notifications list
  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await api.listNotifications({
        query: { unreadOnly: filterUnread ? 'true' : 'false', limit: 30 },
      });
      setNotifications(res.items);
    } catch {}
    finally {
      setLoading(false);
    }
  }, [api, isAuthenticated, filterUnread]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchUnreadCount();
    }
  }, [fetchUnreadCount, isAuthenticated]);

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications, isAuthenticated]);

  // Format message text and icon according to notification type
  const renderNotificationContent = (notif: Notification) => {
    switch (notif.type) {
      case 'ORDER_FILLED':
        return {
          icon: <CheckCircle size={16} className="text-[var(--up,#1fc27a)]" />,
          title: `Khớp lệnh ${notif.symbol}`,
          desc: `Lệnh ${notif.side === 'BUY' ? 'Mua' : 'Bán'} ${notif.orderType} đã khớp ${notif.executedQty} với giá TB ${notif.avgPrice} USDT.`,
          link: `/trade/${notif.symbol}`,
        };
      case 'ORDER_EXPIRED':
        return {
          icon: <Clock size={16} className="text-[var(--warn,#f5b544)]" />,
          title: `Lệnh ${notif.symbol} hết hạn`,
          desc: `Phần còn lại của lệnh đã hết hạn (${notif.reason}). Đã khớp: ${notif.executedQty}.`,
          link: `/trade/${notif.symbol}`,
        };
      case 'STOP_TRIGGERED':
        return {
          icon: <AlertTriangle size={16} className="text-[var(--accent,#818cf8)]" />,
          title: `Kích hoạt Stop ${notif.symbol}`,
          desc: `Giá thị trường đạt ${notif.lastPrice} USDT, kích hoạt mức stop ${notif.stopPrice}.`,
          link: `/trade/${notif.symbol}`,
        };
      case 'TPSL_PLACED':
        return {
          icon: <CheckCheck size={16} className="text-[var(--up,#1fc27a)]" />,
          title: `Đã đặt TP/SL ${notif.symbol}`,
          desc: `Đã tự động đặt lệnh chốt lời/cắt lỗ cho khối lượng ${notif.quantity} ${notif.symbol}.`,
          link: `/trade/${notif.symbol}`,
        };
      case 'TPSL_SKIPPED':
        return {
          icon: <AlertCircle size={16} className="text-[var(--down,#f2475f)]" />,
          title: `Bỏ qua TP/SL ${notif.symbol}`,
          desc: `Không thể tạo lệnh TP/SL: ${notif.reason}`,
          link: `/trade/${notif.symbol}`,
        };
      case 'PRICE_ALERT':
        return {
          icon: <Bell size={16} className="text-[var(--accent,#818cf8)]" />,
          title: `Cảnh báo giá ${notif.symbol}`,
          desc: `Giá hiện tại ${notif.lastPrice} USDT đã ${notif.condition === 'ABOVE' ? 'vượt trên' : 'xuống dưới'} mức mục tiêu ${notif.targetPrice} USDT.`,
          link: `/trade/${notif.symbol}`,
        };
      case 'FUTURES_ORDER_FILLED':
        return {
          icon: <CheckCircle size={16} className="text-[var(--up,#1fc27a)]" />,
          title: `Khớp lệnh Futures ${notif.symbol}`,
          desc: `Lệnh ${notif.side === 'BUY' ? 'Mua' : 'Bán'} đã khớp ${notif.executedQty} với giá TB ${notif.avgPrice} USDT.`,
          link: `/futures/${notif.symbol}`,
        };
      case 'POSITION_TPSL':
        return {
          icon: <CheckCheck size={16} className="text-[var(--up,#1fc27a)]" />,
          title: `TP/SL vị thế ${notif.symbol}`,
          desc: `${notif.reason === 'TAKE_PROFIT' ? 'Chốt lời' : 'Cắt lỗ'} đã khớp ở ${notif.price}, lãi lỗ ${Number(notif.realizedPnl) >= 0 ? '+' : ''}${notif.realizedPnl} USDT.`,
          link: `/futures/${notif.symbol}`,
        };
      case 'POSITION_LIQUIDATED':
        return {
          icon: <AlertCircle size={16} className="text-[var(--down,#f2475f)]" />,
          title: `Thanh lý vị thế ${notif.symbol}`,
          desc: `Vị thế ${notif.side} ${notif.quantity} ${notif.symbol} đã bị thanh lý ở ${notif.markPrice} — mất ${notif.lostMargin} USDT ký quỹ.`,
          link: `/futures/${notif.symbol}`,
        };
      case 'NEW_DEVICE_LOGIN':
        return {
          icon: <AlertTriangle size={16} className="text-[var(--warn,#f5b544)]" />,
          title: `Đăng nhập thiết bị mới`,
          desc: `Đăng nhập từ thiết bị mới: ${notif.device || 'Trình duyệt'} (IP ${notif.ip || 'chưa rõ'}). Không phải bạn? Đổi mật khẩu ngay.`,
          link: `/settings`,
        };
      case 'DCA_EXECUTED':
        return {
          icon: <CheckCircle size={16} className="text-[var(--up,#1fc27a)]" />,
          title: `Mua định kỳ ${notif.symbol}`,
          desc: `Mua định kỳ: đã mua ${notif.baseBought} giá ${notif.price} (${notif.quoteSpent} USDT).`,
          link: `/bots?tab=dca`,
        };
      case 'DCA_SKIPPED':
        return {
          icon: <AlertCircle size={16} className="text-[var(--warn,#f5b544)]" />,
          title: `Bỏ qua mua định kỳ ${notif.symbol}`,
          desc: `Mua định kỳ ${notif.symbol} bị bỏ qua: ${notif.reason === 'INSUFFICIENT_BALANCE' ? 'Không đủ USDT' : notif.reason}.`,
          link: `/bots?tab=dca`,
        };
      case 'GRID_BOT_STOPPED':
        return {
          icon: <AlertCircle size={16} className="text-[var(--accent,#818cf8)]" />,
          title: `Bot lưới ${notif.symbol} đã dừng`,
          desc: `Bot lưới ${notif.symbol} đã dừng (${notif.reason}), lãi lưới +${notif.gridProfit} USDT.`,
          link: `/bots?tab=grid`,
        };
      default:
        return {
          icon: <Bell size={16} className="text-[var(--text-3,#63636b)]" />,
          title: 'Thông báo hệ thống',
          desc: 'Bạn có thông báo mới.',
          link: undefined,
        };
    }
  };

  // Realtime subscription
  useEffect(() => {
    if (!realtimeClient || !isAuthenticated) return;

    const unsub = realtimeClient.subscribe('user', (event: unknown) => {
      const ev = event as { kind: string; notification?: Notification };
      if (ev.kind === 'notification' && ev.notification) {
        const notif = ev.notification;
        setUnreadCount((c) => c + 1);
        setNotifications((prev) => [notif, ...prev]);

        const content = renderNotificationContent(notif);
        toastInfo(`${content.title}: ${content.desc}`);
      }
    });

    return () => unsub();
  }, [realtimeClient, isAuthenticated]);

  // Mark all read
  const handleMarkAllRead = async () => {
    try {
      await api.markNotificationsRead({ body: { all: true } });
      setUnreadCount(0);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: new Date().toISOString() }))
      );
      success('Đã đánh dấu tất cả thông báo là đã đọc.');
    } catch {}
  };

  // Mark single read
  const handleMarkSingleRead = async (id: string) => {
    try {
      await api.markNotificationsRead({ body: { ids: [id] } });
      setUnreadCount((c) => Math.max(0, c - 1));
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
    } catch {}
  };

  if (!isAuthenticated) return null;

  return (
    <div className="relative">
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)] relative transition-colors cursor-pointer"
        title="Thông báo"
        aria-label="Thông báo"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--up,#1fc27a)] text-black text-[9px] font-bold flex items-center justify-center border border-[var(--bg,#000000)]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <>
          {/* Overlay to close */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,12px)] shadow-[0_20px_40px_rgba(0,0,0,0.8)] z-50 overflow-hidden flex flex-col max-h-[500px]">
            {/* Header */}
            <div className="px-4 py-3 border-b border-[var(--line,#1d1e21)] flex items-center justify-between bg-[var(--panel-2,#141416)]/50">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-[var(--text,#f4f4f5)]">Thông báo</span>
                {unreadCount > 0 && (
                  <Badge variant="success" size="sm" className="bg-[var(--up,#1fc27a)]/10 text-[var(--up,#1fc27a)] border-none">
                    {unreadCount} mới
                  </Badge>
                )}
              </div>

              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[11px] text-[var(--accent,#818cf8)] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck size={13} />
                  <span>Đã đọc tất cả</span>
                </button>
              )}
            </div>

            {/* Filter tab */}
            <div className="px-4 py-1.5 border-b border-[var(--line,#1d1e21)] flex items-center gap-3 text-xs bg-[var(--panel,#0a0a0b)]">
              <button
                onClick={() => setFilterUnread(false)}
                className={`pb-1 border-b-2 font-semibold transition-colors cursor-pointer ${
                  !filterUnread ? 'border-[var(--accent,#818cf8)] text-white' : 'border-transparent text-[var(--text-3,#63636b)]'
                }`}
              >
                Tất cả
              </button>
              <button
                onClick={() => setFilterUnread(true)}
                className={`pb-1 border-b-2 font-semibold transition-colors cursor-pointer ${
                  filterUnread ? 'border-[var(--accent,#818cf8)] text-white' : 'border-transparent text-[var(--text-3,#63636b)]'
                }`}
              >
                Chưa đọc
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-[var(--line,#1d1e21)]/60">
              {loading && notifications.length === 0 ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} height={48} className="w-full" />
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--text-3,#63636b)]">
                  Không có thông báo nào.
                </div>
              ) : (
                notifications.map((notif) => {
                  const content = renderNotificationContent(notif);
                  const isUnread = notif.readAt === null;

                  return (
                    <div
                      key={notif.id}
                      onClick={() => {
                        if (isUnread) handleMarkSingleRead(notif.id);
                        if (content.link && onNavigate) {
                          onNavigate(content.link);
                          setIsOpen(false);
                        }
                      }}
                      className={`p-3.5 hover:bg-[var(--panel-2,#141416)] transition-colors cursor-pointer flex gap-3 ${
                        isUnread ? 'bg-[var(--accent,#818cf8)]/5' : ''
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">{content.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-semibold ${isUnread ? 'text-white' : 'text-[var(--text-2,#a1a1aa)]'}`}>
                            {content.title}
                          </span>
                          <span className="text-[10px] text-[var(--text-3,#63636b)] font-mono shrink-0">
                            {new Date(notif.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-3,#63636b)] mt-1 leading-relaxed">
                          {content.desc}
                        </p>
                      </div>
                      {isUnread && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent,#818cf8)] shrink-0 self-center" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
