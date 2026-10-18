import React, { useState, useEffect, useCallback } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  appLinks,
  ApiError,
  type AdminUserDetail,
  type Order,
  type LedgerEntry,
  type FuturesPosition,
  type GridBot,
  type DcaPlan,
  type LoginEvent,
  type Role,
  type AdminTaxWithholding,
  type AuditLogEntry,
  type AuditAction,
  exportUrl,
} from '@cex/contracts';
import { formatApiError } from '../services/errors';
import { dec } from '@cex/core';
import { formatDecimal } from '@cex/ui';
import { Copy, Check, ExternalLink, ShieldAlert, ArrowDownUp, AlertCircle, Shield, Trash2, Radio, Receipt, UserX, X, Building, Download, FileText, Eye } from 'lucide-react';

const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  USER_LOCK: 'Khóa tài khoản',
  USER_UNLOCK: 'Mở khóa tài khoản',
  USER_SIGNALS_ACCESS: 'Quyền tín hiệu',
  USER_ROLE: 'Đổi vai trò',
  BALANCE_ADJUST: 'Điều chỉnh số dư',
  ACCOUNT_RESET: 'Đặt lại tài khoản',
  SETTINGS_UPDATE: 'Cấu hình sàn',
  TRADING_HALT: 'Dừng sàn khẩn cấp',
  TRADING_RESUME: 'Mở lại giao dịch',
  SYMBOL_UPDATE: 'Cấu hình cặp Spot',
  RECONCILIATION_RUN: 'Chạy đối soát',
  TWO_FACTOR_ENABLE: 'Bật 2FA',
  TWO_FACTOR_DISABLE: 'Tắt 2FA',
  ROLE_BOOTSTRAP: 'Khởi tạo vai trò',
  ASSET_UPDATE: 'Cấu hình tài sản/coin',
  ANNOUNCEMENT_CREATE: 'Tạo thông báo',
  ANNOUNCEMENT_UPDATE: 'Sửa thông báo',
  FUTURES_SYMBOL_UPDATE: 'Cấu hình Futures',
  GRID_BOT_STOP: 'Dừng Grid Bot',
  DCA_PLAN_CANCEL: 'Hủy kế hoạch DCA',
  INVITE_CREATE: 'Tạo mã mời',
  INVITE_REVOKE: 'Thu hồi mã mời',
  TAX_SETTINGS_UPDATE: 'Cấu hình thuế',
};

const CLOSE_REASON_LABELS: Record<string, string> = {
  USER: 'Người dùng đóng',
  TAKE_PROFIT: 'Chốt lời (TP)',
  STOP_LOSS: 'Cắt lỗ (SL)',
  LIQUIDATION: 'Thanh lý',
  ADMIN: 'Quản trị viên đóng',
};

const LEDGER_TYPE_LABELS: Record<string, string> = {
  FAUCET: 'Nhận Faucet',
  ORDER_LOCK: 'Khóa lệnh',
  ORDER_UNLOCK: 'Mở khóa lệnh',
  TRADE_DEBIT: 'Trừ khớp lệnh',
  TRADE_CREDIT: 'Cộng khớp lệnh',
  FEE: 'Phí giao dịch',
  ADMIN_ADJUST: 'Admin điều chỉnh',
  ACCOUNT_RESET: 'Đặt lại tài khoản',
  TAX_WITHHOLDING: 'Khấu trừ thuế',
  TRANSFER: 'Chuyển ví Spot/Futures',
  REALIZED_PNL: 'PnL đã chốt',
  FUNDING_FEE: 'Phí Funding',
  LIQUIDATION: 'Thanh lý vị thế',
  MARGIN_ADJUST: 'Điều chỉnh ký quỹ',
};

const REF_TYPE_LABELS: Record<string, string> = {
  ORDER: 'Lệnh Spot',
  TRADE: 'Khớp lệnh',
  FAUCET: 'Faucet',
  ADMIN: 'Quản trị',
  TRANSFER: 'Chuyển ví',
  FUTURES_ORDER: 'Lệnh Futures',
  FUTURES_POSITION: 'Vị thế Futures',
};

const ADJUST_AMOUNT_REGEX = /^-?\d+(\.\d{1,8})?$/;

interface UserDetailPageProps {
  userId: string;
  onNavigate: (path: string) => void;
}

export const UserDetailPage: React.FC<UserDetailPageProps> = ({ userId, onNavigate }) => {
  const { user: currentUser, hasPerm } = useAuth();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [actualId, setActualId] = useState<string>('');
  const [notFound, setNotFound] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'balances' | 'orders' | 'ledger' | 'futures' | 'bots' | 'logins' | 'tax' | 'audit'>('balances');
  const [copiedUid, setCopiedUid] = useState(false);

  // Evidence state
  const [recentLogins, setRecentLogins] = useState<LoginEvent[]>([]);
  const [recentLedger, setRecentLedger] = useState<LedgerEntry[]>([]);

  // Tab detailed data
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersType, setOrdersType] = useState<'true' | 'false'>('true');
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersNextCursor, setOrdersNextCursor] = useState<string | null>(null);
  const [ordersLoadingMore, setOrdersLoadingMore] = useState(false);
  const [ordersLoadMoreError, setOrdersLoadMoreError] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);

  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerNextCursor, setLedgerNextCursor] = useState<string | null>(null);
  const [ledgerLoadingMore, setLedgerLoadingMore] = useState(false);
  const [ledgerLoadMoreError, setLedgerLoadMoreError] = useState<string | null>(null);
  const [ledgerAsset, setLedgerAsset] = useState<string>('');
  const [ledgerHideLocks, setLedgerHideLocks] = useState<boolean>(true);
  const [ledgerFrom, setLedgerFrom] = useState<string>('');
  const [ledgerTo, setLedgerTo] = useState<string>('');
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const [positions, setPositions] = useState<FuturesPosition[]>([]);
  const [positionsType, setPositionsType] = useState<'true' | 'false'>('true');
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [positionsNextCursor, setPositionsNextCursor] = useState<string | null>(null);
  const [positionsLoadingMore, setPositionsLoadingMore] = useState(false);
  const [positionsLoadMoreError, setPositionsLoadMoreError] = useState<string | null>(null);

  const [userBots, setUserBots] = useState<{ grid: GridBot[]; dca: DcaPlan[] }>({ grid: [], dca: [] });
  const [botsLoading, setBotsLoading] = useState(false);
  const [botsError, setBotsError] = useState<string | null>(null);

  const [allLogins, setAllLogins] = useState<LoginEvent[]>([]);
  const [loginsLoading, setLoginsLoading] = useState(false);
  const [loginsError, setLoginsError] = useState<string | null>(null);
  const [loginsNextCursor, setLoginsNextCursor] = useState<string | null>(null);
  const [loginsLoadingMore, setLoginsLoadingMore] = useState(false);
  const [loginsLoadMoreError, setLoginsLoadMoreError] = useState<string | null>(null);

  const [taxWithholdings, setTaxWithholdings] = useState<AdminTaxWithholding[]>([]);
  const [taxLoading, setTaxLoading] = useState(false);
  const [taxError, setTaxError] = useState<string | null>(null);
  const [taxNextCursor, setTaxNextCursor] = useState<string | null>(null);
  const [taxLoadingMore, setTaxLoadingMore] = useState(false);
  const [taxLoadMoreError, setTaxLoadMoreError] = useState<string | null>(null);

  // User Audit Logs state (AD-23)
  const [userAuditLogs, setUserAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [auditLogsError, setAuditLogsError] = useState<string | null>(null);
  const [auditLogsNextCursor, setAuditLogsNextCursor] = useState<string | null>(null);
  const [auditLogsLoadingMore, setAuditLogsLoadingMore] = useState(false);
  const [auditLogsLoadMoreError, setAuditLogsLoadMoreError] = useState<string | null>(null);
  const [selectedAuditEntry, setSelectedAuditEntry] = useState<AuditLogEntry | null>(null);

  const [sellBase, setSellBase] = useState(false);

  // Role change modal state
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [targetRole, setTargetRole] = useState<Role>('user');
  const [roleReason, setRoleReason] = useState('');
  const [isSubmittingRole, setIsSubmittingRole] = useState(false);

  // Dialogs & Modals
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'LOCK' | 'UNLOCK' | 'RESET' | 'STOP_BOT' | 'CANCEL_DCA' | 'DEACTIVATE_USER' | 'TOGGLE_SIGNALS' | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // Adjust balance modal
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustAsset, setAdjustAsset] = useState('USDT');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [auditNotification, setAuditNotification] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [exchangeAssets, setExchangeAssets] = useState<string[]>([]);

  const api = getApiClient();
  const exchangeOrigin = import.meta.env.VITE_EXCHANGE_ORIGIN;

  useEffect(() => {
    api.exchangeInfo()
      .then((info) => {
        const assets = Array.from(new Set(info.assets.map((a) => a.asset)));
        if (assets.length > 0) setExchangeAssets(assets);
      })
      .catch(() => {});
  }, [api]);

  const loadUserData = useCallback(async () => {
    setIsLoading(true);
    setNotFound(false);
    setFetchError(null);
    try {
      let targetId = userId;
      // If userId is all digits:
      if (/^\d+$/.test(userId)) {
        // Only accept exactly 8 digits as UID (P-02)
        if (!/^\d{8}$/.test(userId)) {
          setNotFound(true);
          setFetchError(null);
          setDetail(null);
          setActualId('');
          return;
        }

        const list = await api.adminListUsers({ query: { q: userId, limit: 1 } });
        if (list.items.length > 0 && list.items[0]?.uid === userId) {
          targetId = list.items[0]!.id;
        } else {
          setNotFound(true);
          setFetchError(null);
          setDetail(null);
          setActualId('');
          return;
        }
      }

      setActualId(targetId);

      const d = await api.adminGetUser({ params: { userId: targetId } });
      setDetail(d);

      // Fetch evidence: 5 recent logins and 5 recent ledger entries
      api.adminUserLoginHistory({ params: { userId: targetId }, query: { limit: 5 } })
        .then((r) => setRecentLogins(r.items))
        .catch(() => {});

      api.adminUserLedger({ params: { userId: targetId }, query: { limit: 5 } })
        .then((r) => setRecentLedger(r.items))
        .catch(() => {});
    } catch (e: any) {
      console.error(e);
      const is404 = e?.status === 404 || e?.code === 'NOT_FOUND' || (e instanceof ApiError && e.status === 404);
      if (is404) {
        setNotFound(true);
        setFetchError(null);
      } else {
        setNotFound(false);
        setFetchError(formatApiError(e, 'Có lỗi xảy ra khi tải thông tin người dùng. Vui lòng thử lại.'));
      }
      setDetail(null);
      setActualId('');
    } finally {
      setIsLoading(false);
    }
  }, [api, userId]);

  useEffect(() => {
    setDetail(null);
    setActualId('');
    setNotFound(false);
    setFetchError(null);
    setIsLoading(true);
    loadUserData();
  }, [loadUserData]);

  const loadLedger = useCallback(async (isLoadMore = false, cursor?: string | null) => {
    if (!actualId || notFound) return;
    if (isLoadMore) {
      if (!cursor || ledgerLoadingMore) return;
      setLedgerLoadingMore(true);
    } else {
      setLedgerLoading(true);
      setLedgerError(null);
    }

    try {
      const query: Record<string, any> = {
        limit: 50,
        hideLocks: ledgerHideLocks ? 'true' : 'false',
      };
      if (ledgerAsset) query.asset = ledgerAsset;
      if (ledgerFrom) query.from = new Date(ledgerFrom).toISOString();
      if (ledgerTo) query.to = new Date(ledgerTo).toISOString();
      if (cursor) query.cursor = cursor;

      const r = await api.adminUserLedger({ params: { userId: actualId }, query });
      if (isLoadMore) {
        setLedgerEntries((prev) => [...prev, ...r.items]);
      } else {
        setLedgerEntries(r.items);
      }
      setLedgerNextCursor(r.nextCursor);
    } catch (err: any) {
      if (!isLoadMore) {
        setLedgerEntries([]);
        setLedgerNextCursor(null);
        setLedgerError(formatApiError(err, 'Có lỗi xảy ra khi tải sổ cái.'));
      } else {
        setLedgerLoadMoreError(formatApiError(err, 'Không tải thêm được sổ cái.'));
      }
    } finally {
      if (isLoadMore) {
        setLedgerLoadingMore(false);
      } else {
        setLedgerLoading(false);
      }
    }
  }, [actualId, notFound, ledgerAsset, ledgerHideLocks, ledgerFrom, ledgerTo, ledgerLoadingMore, api]);

  const loadUserAuditLogs = useCallback(
    async (isLoadMore = false, cursor?: string | null) => {
      if (!actualId || notFound) return;
      if (isLoadMore) {
        if (!cursor || auditLogsLoadingMore) return;
        setAuditLogsLoadingMore(true);
      } else {
        setAuditLogsLoading(true);
        setAuditLogsError(null);
      }

      try {
        const res = await api.adminAuditLogs({
          query: { targetId: actualId, limit: 50, cursor: cursor || undefined },
        });
        if (isLoadMore) {
          setUserAuditLogs((prev) => [...prev, ...res.items]);
        } else {
          setUserAuditLogs(res.items);
        }
        setAuditLogsNextCursor(res.nextCursor);
      } catch (err: any) {
        if (!isLoadMore) {
          setUserAuditLogs([]);
          setAuditLogsError(formatApiError(err, 'Không thể tải nhật ký thao tác của người dùng.'));
        } else {
          setAuditLogsLoadMoreError(formatApiError(err, 'Không tải thêm được nhật ký thao tác.'));
        }
      } finally {
        if (isLoadMore) {
          setAuditLogsLoadingMore(false);
        } else {
          setAuditLogsLoading(false);
        }
      }
    },
    [actualId, notFound, auditLogsLoadingMore, api]
  );

  const loadOrders = useCallback(async () => {
    if (!actualId || notFound) return;
    setOrdersLoading(true);
    setOrdersError(null);
    setOrdersLoadMoreError(null);
    try {
      const r = await api.adminUserOrders({ params: { userId: actualId }, query: { open: ordersType, limit: 50 } });
      setOrders(r.items);
      setOrdersNextCursor(r.nextCursor);
    } catch (err: any) {
      setOrdersError(formatApiError(err, 'Có lỗi xảy ra khi tải danh sách lệnh.'));
      setOrders([]);
      setOrdersNextCursor(null);
    } finally {
      setOrdersLoading(false);
    }
  }, [actualId, notFound, ordersType, api]);

  const loadPositions = useCallback(async () => {
    if (!actualId || notFound) return;
    setPositionsLoading(true);
    setPositionsError(null);
    setPositionsLoadMoreError(null);
    try {
      const r = await api.adminUserFuturesPositions({ params: { userId: actualId }, query: { open: positionsType, limit: 50 } });
      setPositions(r.items);
      setPositionsNextCursor(r.nextCursor);
    } catch (err: any) {
      setPositionsError(formatApiError(err, 'Có lỗi xảy ra khi tải danh sách vị thế.'));
      setPositions([]);
      setPositionsNextCursor(null);
    } finally {
      setPositionsLoading(false);
    }
  }, [actualId, notFound, positionsType, api]);

  const loadBots = useCallback(async () => {
    if (!actualId || notFound) return;
    setBotsLoading(true);
    setBotsError(null);
    try {
      const r = await api.adminUserBots({ params: { userId: actualId } });
      setUserBots(r);
    } catch (err: any) {
      setBotsError(formatApiError(err, 'Không tải được danh sách bot và DCA.'));
      setUserBots({ grid: [], dca: [] });
    } finally {
      setBotsLoading(false);
    }
  }, [actualId, notFound, api]);

  const loadLogins = useCallback(async () => {
    if (!actualId || notFound) return;
    setLoginsLoading(true);
    setLoginsError(null);
    setLoginsLoadMoreError(null);
    try {
      const r = await api.adminUserLoginHistory({ params: { userId: actualId }, query: { limit: 50 } });
      setAllLogins(r.items);
      setLoginsNextCursor(r.nextCursor);
    } catch (err: any) {
      setLoginsError(formatApiError(err, 'Có lỗi xảy ra khi tải lịch sử đăng nhập.'));
      setAllLogins([]);
      setLoginsNextCursor(null);
    } finally {
      setLoginsLoading(false);
    }
  }, [actualId, notFound, api]);

  const loadTax = useCallback(async () => {
    if (!actualId || notFound) return;
    setTaxLoading(true);
    setTaxError(null);
    setTaxLoadMoreError(null);
    try {
      const r = await api.adminTaxWithholdings({ query: { userId: actualId, limit: 50 } });
      setTaxWithholdings(r.items);
      setTaxNextCursor(r.nextCursor);
    } catch (err: any) {
      setTaxError(formatApiError(err, 'Có lỗi xảy ra khi tải hồ sơ thuế.'));
      setTaxWithholdings([]);
      setTaxNextCursor(null);
    } finally {
      setTaxLoading(false);
    }
  }, [actualId, notFound, api]);

  // Load tab-specific data when tab changes
  useEffect(() => {
    if (!actualId || notFound) return;

    if (activeTab === 'orders') {
      loadOrders();
    } else if (activeTab === 'ledger') {
      loadLedger(false);
    } else if (activeTab === 'futures') {
      loadPositions();
    } else if (activeTab === 'bots') {
      loadBots();
    } else if (activeTab === 'logins') {
      loadLogins();
    } else if (activeTab === 'tax') {
      loadTax();
    } else if (activeTab === 'audit') {
      loadUserAuditLogs(false);
    }
  }, [actualId, notFound, activeTab, loadOrders, loadLedger, loadPositions, loadBots, loadLogins, loadTax, loadUserAuditLogs]);

  const loadMoreOrders = async () => {
    if (!ordersNextCursor || !actualId || notFound || ordersLoadingMore) return;
    setOrdersLoadingMore(true);
    setOrdersLoadMoreError(null);
    try {
      const r = await api.adminUserOrders({ params: { userId: actualId }, query: { open: ordersType, cursor: ordersNextCursor, limit: 50 } });
      setOrders((prev) => [...prev, ...r.items]);
      setOrdersNextCursor(r.nextCursor);
    } catch (err: any) {
      setOrdersLoadMoreError(formatApiError(err, 'Không tải thêm được lệnh.'));
    } finally {
      setOrdersLoadingMore(false);
    }
  };

  const loadMoreLedger = async () => {
    if (!ledgerNextCursor || !actualId || notFound || ledgerLoadingMore) return;
    setLedgerLoadMoreError(null);
    loadLedger(true, ledgerNextCursor);
  };

  const loadMoreAuditLogs = async () => {
    if (!auditLogsNextCursor || !actualId || notFound || auditLogsLoadingMore) return;
    setAuditLogsLoadMoreError(null);
    loadUserAuditLogs(true, auditLogsNextCursor);
  };

  const loadMorePositions = async () => {
    if (!positionsNextCursor || !actualId || notFound || positionsLoadingMore) return;
    setPositionsLoadingMore(true);
    setPositionsLoadMoreError(null);
    try {
      const r = await api.adminUserFuturesPositions({ params: { userId: actualId }, query: { open: positionsType, cursor: positionsNextCursor, limit: 50 } });
      setPositions((prev) => [...prev, ...r.items]);
      setPositionsNextCursor(r.nextCursor);
    } catch (err: any) {
      setPositionsLoadMoreError(formatApiError(err, 'Không tải thêm được vị thế.'));
    } finally {
      setPositionsLoadingMore(false);
    }
  };

  const loadMoreLogins = async () => {
    if (!loginsNextCursor || !actualId || notFound || loginsLoadingMore) return;
    setLoginsLoadingMore(true);
    setLoginsLoadMoreError(null);
    try {
      const r = await api.adminUserLoginHistory({ params: { userId: actualId }, query: { cursor: loginsNextCursor, limit: 50 } });
      setAllLogins((prev) => [...prev, ...r.items]);
      setLoginsNextCursor(r.nextCursor);
    } catch (err: any) {
      setLoginsLoadMoreError(formatApiError(err, 'Không tải thêm được lịch sử đăng nhập.'));
    } finally {
      setLoginsLoadingMore(false);
    }
  };

  const loadMoreTax = async () => {
    if (!taxNextCursor || !actualId || notFound || taxLoadingMore) return;
    setTaxLoadingMore(true);
    setTaxLoadMoreError(null);
    try {
      const r = await api.adminTaxWithholdings({ query: { userId: actualId, cursor: taxNextCursor, limit: 50 } });
      setTaxWithholdings((prev) => [...prev, ...r.items]);
      setTaxNextCursor(r.nextCursor);
    } catch (err: any) {
      setTaxLoadMoreError(formatApiError(err, 'Không tải thêm được hồ sơ thuế.'));
    } finally {
      setTaxLoadingMore(false);
    }
  };

  if (notFound) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="admin-user-not-found">
        {/* Top breadcrumb */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => onNavigate('/admin/users')}
            className="text-sm text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)] flex items-center gap-1.5 transition-colors"
          >
            ← Quay lại danh sách người dùng
          </button>
        </div>

        <div className="p-12 text-center bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-2xl flex flex-col items-center justify-center">
          <div className="w-12 h-12 mb-4 rounded-full bg-[var(--down,#f6465d)]/10 flex items-center justify-center text-[var(--down,#f6465d)]">
            <UserX size={24} />
          </div>
          <h2 className="text-lg font-semibold text-[var(--text,#f4f4f5)] mb-2">Không tìm thấy người dùng</h2>
          <p className="text-sm text-[var(--text-2,#a1a1aa)] mb-6 max-w-md">
            Không tìm thấy thông tin người dùng với định danh &ldquo;{userId}&rdquo;. Vui lòng kiểm tra lại UID hoặc UUID.
          </p>
          <button
            onClick={() => onNavigate('/admin/users')}
            className="px-4 py-2 bg-[var(--accent,#818cf8)] text-white text-sm font-medium rounded-lg hover:bg-[var(--accent,#818cf8)]/90 transition-colors"
          >
            Quay lại danh sách người dùng
          </button>
        </div>
      </div>
    );
  }

  if (fetchError && !notFound) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="admin-user-error">
        {/* Top breadcrumb */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => onNavigate('/admin/users')}
            className="text-sm text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)] flex items-center gap-1.5 transition-colors"
          >
            ← Quay lại danh sách người dùng
          </button>
        </div>

        <div className="p-12 text-center bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-2xl flex flex-col items-center justify-center">
          <div className="w-12 h-12 mb-4 rounded-full bg-[var(--down,#f6465d)]/10 flex items-center justify-center text-[var(--down,#f6465d)]">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-lg font-semibold text-[var(--text,#f4f4f5)] mb-2">Có lỗi xảy ra</h2>
          <p className="text-sm text-[var(--text-2,#a1a1aa)] mb-6 max-w-md">
            {fetchError}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadUserData()}
              disabled={isLoading}
              data-testid="admin-user-retry"
              className="px-4 py-2 bg-[var(--accent,#818cf8)] text-white text-sm font-medium rounded-lg hover:bg-[var(--accent,#818cf8)]/90 disabled:opacity-50 transition-colors"
            >
              Thử lại
            </button>
            <button
              onClick={() => onNavigate('/admin/users')}
              className="px-4 py-2 bg-[var(--line,#1d1e21)] text-[var(--text,#f4f4f5)] text-sm font-medium rounded-lg hover:bg-[var(--line,#1d1e21)]/80 transition-colors"
            >
              Quay lại danh sách người dùng
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || !detail) {
    return <div className="p-8 text-center text-[var(--text-2,#a1a1aa)]">Đang tải thông tin chi tiết người dùng...</div>;
  }

  const u = detail.user;
  const isLocked = u.status === 'locked';
  const isSelf = currentUser?.id === u.id;
  const isProtected = u.isBot || isSelf;

  const copyUid = () => {
    navigator.clipboard.writeText(u.uid);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2000);
  };

  // Preview for balance adjustment (M-11)
  const currentAssetBal = detail.balances.find((b) => b.asset === adjustAsset);
  const currentAvailable = currentAssetBal?.available ?? '0';
  const isAdjustAmountFormatValid = !adjustAmount || ADJUST_AMOUNT_REGEX.test(adjustAmount.trim());
  const isAdjustAmountValid = Boolean(adjustAmount && ADJUST_AMOUNT_REGEX.test(adjustAmount.trim()) && !dec(adjustAmount.trim()).isZero());

  let calculatedAfter: string | null = null;
  if (isAdjustAmountValid) {
    try {
      calculatedAfter = dec(currentAvailable).add(dec(adjustAmount.trim())).toString();
    } catch {
      calculatedAfter = null;
    }
  }

  const handleAdjustSubmit = async () => {
    if (!adjustReason || adjustReason.trim().length < 5 || !isAdjustAmountValid) return;
    setIsSubmitting(true);
    setAdjustError(null);
    try {
      const res = await api.adminAdjustBalance({
        params: { userId: detail.user.id },
        body: { asset: adjustAsset, amount: adjustAmount.trim(), reason: adjustReason.trim() },
      });
      setAuditNotification(`Đã điều chỉnh số dư thành công! Mã nhật ký: ${res.auditLogId}`);
      setAdjustOpen(false);
      setAdjustAmount('');
      setAdjustReason('');
      loadUserData();
    } catch (err: any) {
      if (err?.code === 'INSUFFICIENT_BALANCE') {
        setAdjustError(`Khách chỉ còn ${currentAvailable} ${adjustAsset} khả dụng. Không thể trừ quá số dư này.`);
      } else {
        setAdjustError(err?.message || 'Có lỗi xảy ra khi điều chỉnh số dư.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmAction = async (reason: string) => {
    if (!detail) return;
    setIsSubmitting(true);
    setConfirmError(null);
    try {
      if (confirmAction === 'LOCK') {
        await api.adminLockUser({ params: { userId: detail.user.id }, body: { reason } });
      } else if (confirmAction === 'UNLOCK') {
        await api.adminUnlockUser({ params: { userId: detail.user.id }, body: { reason } });
      } else if (confirmAction === 'RESET') {
        await api.adminResetAccount({ params: { userId: detail.user.id }, body: { reason, confirm: 'RESET' } });
      } else if (confirmAction === 'DEACTIVATE_USER') {
        // Bước 1: Khóa tài khoản trước
        try {
          await api.adminLockUser({ params: { userId: detail.user.id }, body: { reason: `Khóa tài khoản: ${reason}` } });
        } catch (lockErr: unknown) {
          setConfirmError(`Bước 1 thất bại (Lỗi khóa tài khoản): ${formatApiError(lockErr)}`);
          return;
        }

        // Bước 2: Đặt lại số dư sau
        try {
          await api.adminResetAccount({ params: { userId: detail.user.id }, body: { reason: `Đặt lại số dư: ${reason}`, confirm: 'RESET' } });
          setAuditNotification(`Đã khóa tài khoản và đặt lại số dư của ${detail.user.email}`);
        } catch (resetErr: unknown) {
          setConfirmError(`Bước 1 thành công (Đã khóa tài khoản), nhưng Bước 2 thất bại (Lỗi đặt lại số dư): ${formatApiError(resetErr)}`);
          return;
        }
      } else if (confirmAction === 'STOP_BOT' && selectedBotId) {
        await api.adminStopGridBot({ params: { userId: detail.user.id, botId: selectedBotId }, body: { reason, sellBase } });
      } else if (confirmAction === 'CANCEL_DCA' && selectedPlanId) {
        await api.adminCancelDcaPlan({ params: { userId: detail.user.id, planId: selectedPlanId }, body: { reason } });
      } else if (confirmAction === 'TOGGLE_SIGNALS') {
        const nextVal = !detail.user.signalsAccess;
        await api.adminSetSignalsAccess({
          params: { userId: detail.user.id },
          body: {
            enabled: nextVal,
            reason,
          },
        });
        setAuditNotification(`Đã ${nextVal ? 'cấp' : 'thu hồi'} quyền tín hiệu giao dịch cho ${detail.user.email}`);
      }
      setConfirmOpen(false);
      setConfirmAction(null);
      setConfirmError(null);
      loadUserData();
    } catch (e) {
      setConfirmError(formatApiError(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChangeSubmit = async () => {
    if (!detail || !roleReason || roleReason.trim().length < 5) return;
    setIsSubmittingRole(true);
    try {
      await api.adminSetRole({
        params: { userId: detail.user.id },
        body: { role: targetRole, reason: roleReason.trim() },
      });
      setAuditNotification(`Đã cập nhật vai trò của ${detail.user.email} thành ${targetRole.toUpperCase()}`);
      setRoleModalOpen(false);
      loadUserData();
    } catch (e: any) {
      setAuditNotification(`Lỗi: ${formatApiError(e)}`);
    } finally {
      setIsSubmittingRole(false);
    }
  };

  const handleOpenToggleSignals = () => {
    setConfirmError(null);
    setConfirmAction('TOGGLE_SIGNALS');
    setConfirmOpen(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onNavigate('/admin/users')}
          className="text-sm text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)] flex items-center gap-1.5 transition-colors"
        >
          ← Quay lại danh sách người dùng
        </button>

        {auditNotification && (
          <div className="px-3 py-1.5 rounded-lg bg-[var(--up,#1fc27a)]/10 border border-[var(--up,#1fc27a)]/30 text-xs text-[var(--up,#1fc27a)] flex items-center gap-2">
            <span>{auditNotification}</span>
            <button onClick={() => setAuditNotification(null)} className="font-bold ml-1">×</button>
          </div>
        )}
      </div>

      {/* User Header Profile */}
      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-6 shadow-lg">
        <div className="flex items-start justify-between flex-wrap gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">{u.email}</h1>
              <div
                data-testid="admin-user-status"
                data-status={u.status}
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                  isLocked
                    ? 'bg-[var(--down,#f2475f)]/15 text-[var(--down,#f2475f)] border border-[var(--down,#f2475f)]/30'
                    : 'bg-[var(--up,#1fc27a)]/15 text-[var(--up,#1fc27a)] border border-[var(--up,#1fc27a)]/30'
                }`}
              >
                {isLocked ? 'Đã khóa' : 'Hoạt động'}
              </div>
              {u.isBot && (
                <span className="text-xs px-2 py-0.5 rounded bg-amber-950/40 text-amber-400 border border-amber-800/40">
                  Bot hệ thống
                </span>
              )}
            </div>

            <div className="flex items-center gap-6 mt-3 text-sm text-[var(--text-2,#a1a1aa)] flex-wrap">
              <div className="flex items-center gap-1.5 font-mono">
                <span className="text-[var(--text-3,#63636b)]">UID:</span>
                <span className="text-[var(--text,#f4f4f5)] font-bold">{u.uid}</span>
                <button
                  onClick={copyUid}
                  className="p-1 rounded hover:bg-[var(--line,#1d1e21)] text-[var(--text-3,#63636b)] hover:text-[var(--text,#f4f4f5)]"
                  title="Sao chép UID"
                >
                  {copiedUid ? <Check size={12} className="text-[var(--up,#1fc27a)]" /> : <Copy size={12} />}
                </button>
              </div>
              <div><span className="text-[var(--text-3,#63636b)]">Tên:</span> {u.name || '—'}</div>
              <div><span className="text-[var(--text-3,#63636b)]">Vai trò:</span> <span className="font-semibold uppercase text-[var(--accent,#818cf8)]">{u.role}</span></div>
              <div><span className="text-[var(--text-3,#63636b)]">2FA:</span> {u.twoFactorEnabled ? <span className="text-[var(--up,#1fc27a)]">Đã bật</span> : 'Chưa bật'}</div>
              <div><span className="text-[var(--text-3,#63636b)]">Phiên hoạt động:</span> {detail.activeSessions}</div>
            </div>
          </div>

          {/* Action Buttons */}
          {!isProtected && (
            <div className="flex items-center gap-2.5 flex-wrap">
              {hasPerm('balances.adjust') && (
                <button
                  data-testid="admin-adjust-open"
                  onClick={() => setAdjustOpen(true)}
                  className="px-3.5 py-2 rounded-lg bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-sm font-medium text-[var(--text,#f4f4f5)] flex items-center gap-1.5 border border-[var(--line,#1d1e21)] transition-colors"
                >
                  <ArrowDownUp size={15} />
                  <span>Điều chỉnh số dư</span>
                </button>
              )}

              {hasPerm('users.roles') && !u.isBot && (
                <button
                  data-testid="admin-role-change-open"
                  onClick={() => { setRoleModalOpen(true); setTargetRole(u.role); setRoleReason(''); }}
                  className="px-3.5 py-2 rounded-lg bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-sm font-medium text-[var(--accent,#818cf8)] flex items-center gap-1.5 border border-[var(--accent,#818cf8)]/30 transition-colors"
                  title="Thay đổi vai trò nhân sự hoặc khách"
                >
                  <Shield size={15} />
                  <span>Đổi vai trò</span>
                </button>
              )}

              {hasPerm('users.signals') && !u.isBot && (
                <button
                  onClick={handleOpenToggleSignals}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${
                    u.signalsAccess
                      ? 'bg-[var(--accent,#818cf8)]/10 text-[var(--accent,#818cf8)] border-[var(--accent,#818cf8)]/30'
                      : 'bg-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)] border-[var(--line,#1d1e21)]'
                  }`}
                  title="Bật/Tắt quyền truy cập bot tín hiệu"
                >
                  <Radio size={14} />
                  <span>Tín hiệu: {u.signalsAccess ? 'Bật' : 'Tắt'}</span>
                </button>
              )}

              {hasPerm('users.lock') && (
                isLocked ? (
                  <button
                    data-testid="admin-unlock-open"
                    onClick={() => { setConfirmAction('UNLOCK'); setConfirmOpen(true); }}
                    className="px-3.5 py-2 rounded-lg bg-[var(--up,#1fc27a)]/10 hover:bg-[var(--up,#1fc27a)]/20 text-sm font-medium text-[var(--up,#1fc27a)] border border-[var(--up,#1fc27a)]/30 transition-colors"
                  >
                    Mở khóa tài khoản
                  </button>
                ) : (
                  <button
                    data-testid="admin-lock-open"
                    onClick={() => { setConfirmAction('LOCK'); setConfirmOpen(true); }}
                    className="px-3.5 py-2 rounded-lg bg-[var(--down,#f2475f)]/10 hover:bg-[var(--down,#f2475f)]/20 text-sm font-medium text-[var(--down,#f2475f)] border border-[var(--down,#f2475f)]/30 transition-colors"
                  >
                    Khóa tài khoản
                  </button>
                )
              )}

              {hasPerm('accounts.reset') && (
                <button
                  onClick={() => { setConfirmAction('RESET'); setConfirmOpen(true); }}
                  className="px-3.5 py-2 rounded-lg bg-red-950/30 hover:bg-red-950/50 text-sm font-medium text-red-400 border border-red-800/40 transition-colors"
                >
                  Reset tài khoản
                </button>
              )}

              {hasPerm('users.lock') && hasPerm('accounts.reset') && (
                <button
                  data-testid="admin-delete-user-open"
                  onClick={() => { setConfirmAction('DEACTIVATE_USER'); setConfirmOpen(true); }}
                  className="px-3.5 py-2 rounded-lg bg-rose-950/40 hover:bg-rose-950/60 text-sm font-medium text-rose-400 border border-rose-800/40 transition-colors flex items-center gap-1.5"
                  title="Đặt lại mọi số dư về 0 và khóa tài khoản (có thể mở khóa lại sau)"
                >
                  <UserX size={15} />
                  <span>Đặt lại số dư và khóa</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Section 2.3: Bằng chứng gian lận ngay dưới nút khóa */}
        {!isProtected && hasPerm('users.lock') && (
          <div className="mt-6 pt-6 border-t border-[var(--line,#1d1e21)]">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert size={16} className="text-amber-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-2,#a1a1aa)]">
                Bằng chứng kiểm tra an toàn (5 lần đăng nhập & 5 dòng sổ cái gần nhất)
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 5 Logins */}
              <div className="bg-[var(--bg,#000000)]/60 rounded-lg p-3 border border-[var(--line,#1d1e21)] text-xs">
                <div className="font-semibold text-[var(--text-2,#a1a1aa)] mb-2">Đăng nhập gần nhất:</div>
                {recentLogins.length === 0 ? (
                  <div className="text-[var(--text-3,#63636b)]">Chưa có lịch sử đăng nhập</div>
                ) : (
                  <div className="space-y-1.5">
                    {recentLogins.map((lg) => (
                      <div key={lg.id} className="flex items-center justify-between font-mono">
                        <span className="text-[var(--text-3,#63636b)]">{new Date(lg.at).toLocaleString('vi-VN')}</span>
                        <span className="text-[var(--text-2,#a1a1aa)]">{lg.ip || '—'}</span>
                        <span className="truncate max-w-[120px] text-[var(--text-3,#63636b)]" title={lg.device || ''}>{lg.device || '—'}</span>
                        <span className={lg.success ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}>
                          {lg.result === 'OK' ? 'Thành công' : lg.result}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 5 Ledger */}
              <div className="bg-[var(--bg,#000000)]/60 rounded-lg p-3 border border-[var(--line,#1d1e21)] text-xs">
                <div className="font-semibold text-[var(--text-2,#a1a1aa)] mb-2">Biến động số dư gần nhất:</div>
                {recentLedger.length === 0 ? (
                  <div className="text-[var(--text-3,#63636b)]">Chưa có biến động số dư</div>
                ) : (
                  <div className="space-y-1.5">
                    {recentLedger.map((ld) => (
                      <div key={ld.id} className="flex items-center justify-between font-mono">
                        <span className="text-[var(--text-3,#63636b)]">{new Date(ld.createdAt).toLocaleTimeString('vi-VN')}</span>
                        <span className="font-semibold text-[var(--text,#f4f4f5)]">{ld.asset}</span>
                        <span className={dec(ld.deltaAvailable).gte(0) ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}>
                          {dec(ld.deltaAvailable).gt(0) ? `+${ld.deltaAvailable}` : ld.deltaAvailable}
                        </span>
                        <span className="text-[var(--text-3,#63636b)]">{ld.type}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* S-15 Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Tổng tài sản */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-[var(--text-3,#63636b)] uppercase tracking-wider mb-1">
              Tổng tài sản
            </div>
            <div className="text-xl font-bold font-mono text-[var(--text,#f4f4f5)]">
              {formatDecimal(detail.totalValueUsdt)} <span className="text-xs font-normal text-[var(--text-3,#63636b)]">USDT</span>
            </div>
          </div>
          {detail.unpricedAssets && detail.unpricedAssets.length > 0 && (
            <div data-testid="admin-unpriced-assets" className="text-xs text-amber-400 mt-2 font-medium">
              Chưa tính giá: {detail.unpricedAssets.join(', ')}
            </div>
          )}
        </div>

        {/* Card 2: Ví Futures */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-4 shadow-sm flex flex-col justify-between space-y-2">
          <div>
            <div className="text-xs font-semibold text-[var(--text-3,#63636b)] uppercase tracking-wider mb-1">
              Ví Futures
            </div>
            <div className="text-base font-bold font-mono text-[var(--text,#f4f4f5)] flex items-center justify-between">
              <span className="text-xs text-[var(--text-3,#63636b)] font-sans">Vốn ví (Equity):</span>
              <span>{detail.futures.equity !== null ? `${formatDecimal(detail.futures.equity)} USDT` : '—'}</span>
            </div>
          </div>
          <div className="text-xs font-mono space-y-1 text-[var(--text-2,#a1a1aa)] border-t border-[var(--line,#1d1e21)] pt-1.5">
            <div className="flex justify-between">
              <span className="text-[var(--text-3,#63636b)]">Số dư:</span>
              <span>{formatDecimal(detail.futures.walletBalance)} USDT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-3,#63636b)]">Ký quỹ (vị thế + lệnh):</span>
              <span>{formatDecimal(dec(detail.futures.positionMargin).add(detail.futures.orderMargin).toString())} USDT</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-3,#63636b)]">PnL chưa chốt:</span>
              <span
                data-testid="admin-futures-upnl"
                title={detail.futures.unrealizedPnl === null ? 'Chưa có giá đánh dấu' : undefined}
                className={
                  detail.futures.unrealizedPnl === null
                    ? 'text-[var(--text-3,#63636b)]'
                    : dec(detail.futures.unrealizedPnl).gte(0)
                    ? 'text-[var(--up,#1fc27a)]'
                    : 'text-[var(--down,#f2475f)]'
                }
              >
                {detail.futures.unrealizedPnl !== null ? `${formatDecimal(detail.futures.unrealizedPnl)} USDT` : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Khối lượng giao dịch */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-4 shadow-sm flex flex-col justify-between space-y-2">
          <div>
            <div className="text-xs font-semibold text-[var(--text-3,#63636b)] uppercase tracking-wider mb-1">
              Khối lượng giao dịch
            </div>
            <div className="text-base font-bold font-mono text-[var(--text,#f4f4f5)] flex items-center justify-between">
              <span className="text-xs text-[var(--text-3,#63636b)] font-sans">Hôm nay:</span>
              <span>
                <span data-testid="admin-user-volume-today" data-value={detail.trading.volume.today.total}>
                  {formatDecimal(detail.trading.volume.today.total)}
                </span>{' '}
                USDT
              </span>
            </div>
          </div>
          <div className="text-xs font-mono space-y-1 text-[var(--text-2,#a1a1aa)] border-t border-[var(--line,#1d1e21)] pt-1.5">
            <div className="flex justify-between">
              <span className="text-[var(--text-3,#63636b)]">7 ngày:</span>
              <span>{formatDecimal(detail.trading.volume.last7d.total)} USDT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-3,#63636b)]">30 ngày:</span>
              <span>{formatDecimal(detail.trading.volume.last30d.total)} USDT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-3,#63636b)]">Tháng trước:</span>
              <span>{formatDecimal(detail.trading.volume.previousMonth.total)} USDT</span>
            </div>
          </div>
        </div>

        {/* Card 4: Thuế */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-4 shadow-sm flex flex-col justify-between space-y-2">
          <div>
            <div className="text-xs font-semibold text-[var(--text-3,#63636b)] uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Thuế đã khấu trừ</span>
              <span className="text-[10px] text-[var(--text-3,#63636b)] font-sans">({detail.tax.category})</span>
            </div>
            <div className="text-base font-bold font-mono text-[var(--text,#f4f4f5)] flex items-center justify-between">
              <span className="text-xs text-[var(--text-3,#63636b)] font-sans">Tổng khấu trừ:</span>
              <span className="text-[var(--accent,#818cf8)] font-bold">
                <span data-testid="admin-user-tax-total" data-value={detail.tax.withheldTotal}>
                  {formatDecimal(detail.tax.withheldTotal)}
                </span>{' '}
                USDT
              </span>
            </div>
          </div>
          <div className="text-xs font-mono space-y-1 text-[var(--text-2,#a1a1aa)] border-t border-[var(--line,#1d1e21)] pt-1.5">
            <div className="flex justify-between">
              <span className="text-[var(--text-3,#63636b)]">Tháng này:</span>
              <span>{formatDecimal(detail.trading.tax.thisMonth.withheldAmount)} USDT ({detail.trading.tax.thisMonth.withheldCount} lần)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-3,#63636b)]">Tháng trước:</span>
              <span>{formatDecimal(detail.trading.tax.previousMonth.withheldAmount)} USDT ({detail.trading.tax.previousMonth.withheldCount} lần)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--line,#1d1e21)] flex gap-6 text-sm">
        <button
          onClick={() => setActiveTab('balances')}
          className={`pb-3 font-semibold transition-colors ${activeTab === 'balances' ? 'border-b-2 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]' : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'}`}
        >
          Số dư & Ví
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`pb-3 font-semibold transition-colors ${activeTab === 'orders' ? 'border-b-2 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]' : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'}`}
        >
          Lệnh Spot ({detail.openOrders} mở, đã tải {orders.length})
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`pb-3 font-semibold transition-colors ${activeTab === 'ledger' ? 'border-b-2 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]' : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'}`}
        >
          Sổ cái biến động (đã tải {ledgerEntries.length})
        </button>
        <button
          onClick={() => setActiveTab('futures')}
          className={`pb-3 font-semibold transition-colors ${activeTab === 'futures' ? 'border-b-2 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]' : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'}`}
        >
          Vị thế Futures ({detail.futures.openPositions} mở, đã tải {positions.length})
        </button>
        <button
          onClick={() => setActiveTab('bots')}
          className={`pb-3 font-semibold transition-colors ${activeTab === 'bots' ? 'border-b-2 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]' : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'}`}
        >
          Bot ({detail.bots.runningGrid}) & DCA ({detail.bots.activeDca})
        </button>
        <button
          onClick={() => setActiveTab('logins')}
          className={`pb-3 font-semibold transition-colors ${activeTab === 'logins' ? 'border-b-2 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]' : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'}`}
        >
          Lịch sử Đăng nhập (đã tải {allLogins.length})
        </button>
        <button
          onClick={() => setActiveTab('tax')}
          className={`pb-3 font-semibold transition-colors flex items-center gap-1.5 ${activeTab === 'tax' ? 'border-b-2 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]' : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'}`}
        >
          <Receipt size={14} />
          <span>Hồ sơ Thuế (TT 32/2026, đã tải {taxWithholdings.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 font-semibold transition-colors flex items-center gap-1.5 ${activeTab === 'audit' ? 'border-b-2 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]' : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'}`}
        >
          <FileText size={14} />
          <span>Nhật ký (đã tải {userAuditLogs.length})</span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'balances' && (
        <div className="space-y-6">
          {/* Spot Balances */}
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow">
            <div className="px-5 py-4 border-b border-[var(--line,#1d1e21)] flex items-center justify-between">
              <span className="font-bold text-sm text-[var(--text,#f4f4f5)]">Tài sản nắm giữ</span>
              <span className="text-sm font-mono text-[var(--text-2,#a1a1aa)]">
                Ước tính: <strong className="text-[var(--text,#f4f4f5)] font-bold">{formatDecimal(detail.totalValueUsdt)}</strong> USDT
              </span>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)]">
                <tr>
                  <th className="px-5 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase">Tài sản</th>
                  <th className="px-5 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase text-right">Khả dụng</th>
                  <th className="px-5 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase text-right">Đang khóa</th>
                  <th className="px-5 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase text-right">Tổng</th>
                  <th className="px-5 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase text-right">Giá trị (USDT)</th>
                  <th className="px-5 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase text-right">% Danh mục</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line,#1d1e21)]">
                {(() => {
                  const held = detail.balances.filter((b) => dec(b.total).gt(0));
                  const sorted = [...held].sort((a, b) => {
                    const valA = dec(a.valueUsdt ?? '-1');
                    const valB = dec(b.valueUsdt ?? '-1');
                    return valB.cmp(valA);
                  });
                  const totalUsdt = dec(detail.totalValueUsdt);

                  if (sorted.length === 0) {
                    return (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-[var(--text-3,#63636b)] font-sans">
                          Người dùng không có số dư khả dụng hoặc đang khóa nào
                        </td>
                      </tr>
                    );
                  }

                  return sorted.map((b) => {
                    let percentStr = '—';
                    const pctVal = b.valueUsdt !== null && totalUsdt.gt(0)
                      ? dec(b.valueUsdt).div(totalUsdt).mul(100).toFixed(2)
                      : null;
                    if (pctVal !== null) {
                      percentStr = `${pctVal}%`;
                    }

                    return (
                      <tr
                        key={b.asset}
                        data-testid="admin-holding-row"
                        data-asset={b.asset}
                        className="hover:bg-[var(--line,#1d1e21)]/10 font-mono"
                      >
                        <td className="px-5 py-3 font-bold text-[var(--text,#f4f4f5)] font-sans">{b.asset}</td>
                        <td className="px-5 py-3 text-right text-[var(--text,#f4f4f5)]">{formatDecimal(b.available)}</td>
                        <td className="px-5 py-3 text-right text-[var(--text-3,#63636b)]">{formatDecimal(b.locked)}</td>
                        <td className="px-5 py-3 text-right text-[var(--text,#f4f4f5)]">{formatDecimal(b.total)}</td>
                        <td className="px-5 py-3 text-right font-bold text-[var(--text,#f4f4f5)]">
                          <span
                            data-testid="admin-holding-value"
                            {...(b.valueUsdt !== null ? { 'data-value': b.valueUsdt } : {})}
                          >
                            {b.valueUsdt !== null ? `${formatDecimal(b.valueUsdt)} USDT` : '—'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-[var(--text-2,#a1a1aa)] font-semibold">
                          <span
                            data-testid="admin-holding-pct"
                            {...(pctVal !== null ? { 'data-value': pctVal } : {})}
                          >
                            {percentStr}
                          </span>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
              <tfoot className="bg-[var(--line,#1d1e21)]/40 font-bold border-t border-[var(--line,#1d1e21)] font-mono text-sm">
                <tr>
                  <td className="px-5 py-3 text-[var(--text,#f4f4f5)] font-sans">Tổng cộng</td>
                  <td className="px-5 py-3 text-right text-[var(--text-3,#63636b)]">—</td>
                  <td className="px-5 py-3 text-right text-[var(--text-3,#63636b)]">—</td>
                  <td className="px-5 py-3 text-right text-[var(--text-3,#63636b)]">—</td>
                  <td
                    data-testid="admin-holdings-total"
                    data-value={detail.totalValueUsdt}
                    className="px-5 py-3 text-right text-[var(--accent,#818cf8)]"
                  >
                    {formatDecimal(detail.totalValueUsdt)} USDT
                  </td>
                  <td className="px-5 py-3 text-right text-[var(--accent,#818cf8)]">
                    {dec(detail.totalValueUsdt).gt(0) ? '100.00%' : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Futures Wallet */}
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-5 shadow">
            <h3 className="font-bold text-sm text-[var(--text,#f4f4f5)] mb-4">Ví Hợp đồng Futures</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-mono">
              <div className="bg-[var(--bg,#000000)] p-3 rounded-lg border border-[var(--line,#1d1e21)]">
                <div className="text-xs text-[var(--text-3,#63636b)] mb-1">Số dư ví</div>
                <div className="font-bold text-[var(--text,#f4f4f5)]">{formatDecimal(detail.futures.walletBalance)} USDT</div>
              </div>
              <div className="bg-[var(--bg,#000000)] p-3 rounded-lg border border-[var(--line,#1d1e21)]">
                <div className="text-xs text-[var(--text-3,#63636b)] mb-1">Khả dụng</div>
                <div className="font-bold text-[var(--text,#f4f4f5)]">{formatDecimal(detail.futures.available)} USDT</div>
              </div>
              <div className="bg-[var(--bg,#000000)] p-3 rounded-lg border border-[var(--line,#1d1e21)]">
                <div className="text-xs text-[var(--text-3,#63636b)] mb-1">Ký quỹ vị thế</div>
                <div className="font-bold text-[var(--text,#f4f4f5)]">{formatDecimal(detail.futures.positionMargin)} USDT</div>
              </div>
              <div className="bg-[var(--bg,#000000)] p-3 rounded-lg border border-[var(--line,#1d1e21)]">
                <div className="text-xs text-[var(--text-3,#63636b)] mb-1">PnL chưa thực hiện</div>
                <div
                  data-testid="admin-futures-upnl"
                  className={`font-bold ${
                    detail.futures.unrealizedPnl === null
                      ? 'text-[var(--text-3,#63636b)]'
                      : dec(detail.futures.unrealizedPnl).gte(0)
                      ? 'text-[var(--up,#1fc27a)]'
                      : 'text-[var(--down,#f2475f)]'
                  }`}
                >
                  {detail.futures.unrealizedPnl !== null ? `${formatDecimal(detail.futures.unrealizedPnl)} USDT` : '—'}
                </div>
                {detail.futures.unrealizedPnl === null && (
                  <div className="text-[10px] text-[var(--text-3,#63636b)] mt-0.5">Chưa có giá đánh dấu</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow">
          <div className="p-4 border-b border-[var(--line,#1d1e21)] flex items-center gap-3">
            <button
              onClick={() => setOrdersType('true')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${ordersType === 'true' ? 'bg-[var(--accent,#818cf8)] text-white' : 'bg-[var(--bg,#000000)] text-[var(--text-2,#a1a1aa)]'}`}
            >
              Lệnh đang mở
            </button>
            <button
              onClick={() => setOrdersType('false')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${ordersType === 'false' ? 'bg-[var(--accent,#818cf8)] text-white' : 'bg-[var(--bg,#000000)] text-[var(--text-2,#a1a1aa)]'}`}
            >
              Lịch sử lệnh
            </button>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)]">
              <tr>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Mã lệnh</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Cặp</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Loại</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Phe</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Giá</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Khối lượng</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Khớp</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line,#1d1e21)] font-mono text-xs">
              {ordersLoading && orders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[var(--text-3,#63636b)]">
                    Đang tải danh sách lệnh...
                  </td>
                </tr>
              )}
              {!ordersLoading && ordersError && orders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center" data-testid="list-error">
                    <div className="text-[var(--down,#f2475f)] mb-2">{ordersError}</div>
                    <button
                      type="button"
                      onClick={loadOrders}
                      className="px-3 py-1.5 rounded-lg bg-[var(--line,#1d1e21)] text-xs text-[var(--text,#f4f4f5)] hover:bg-[var(--line,#1d1e21)]/80 cursor-pointer font-semibold"
                    >
                      Thử lại
                    </button>
                  </td>
                </tr>
              )}
              {!ordersLoading && !ordersError && orders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[var(--text-3,#63636b)]">
                    Không có lệnh nào
                  </td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-[var(--line,#1d1e21)]/10">
                  <td className="px-4 py-3 text-[var(--text-3,#63636b)] font-mono">
                    <div className="flex items-center gap-1.5">
                      <span title={o.id}>{o.id}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(o.id);
                          setCopiedOrderId(o.id);
                          setTimeout(() => setCopiedOrderId(null), 2000);
                        }}
                        className="p-1 hover:text-[var(--text,#f4f4f5)] text-[var(--text-3,#63636b)] transition-colors cursor-pointer"
                        title="Sao chép mã lệnh"
                      >
                        {copiedOrderId === o.id ? <Check size={12} className="text-[var(--up,#1fc27a)]" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-bold">
                    <a
                      href={appLinks.exchange.trade(o.symbol, exchangeOrigin)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent,#818cf8)] hover:underline inline-flex items-center gap-1 font-sans"
                    >
                      {o.symbol} <ExternalLink size={10} />
                    </a>
                  </td>
                  <td className="px-4 py-3">{o.type}</td>
                  <td className={`px-4 py-3 font-bold ${o.side === 'BUY' ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}`}>{o.side}</td>
                  <td className="px-4 py-3">{o.price || 'Thị trường'}</td>
                  <td className="px-4 py-3">{o.quantity || o.quoteOrderQty}</td>
                  <td className="px-4 py-3">{o.executedQty}</td>
                  <td className="px-4 py-3 text-[var(--text-2,#a1a1aa)]">{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ordersLoadMoreError && (
            <div className="p-3 bg-[var(--down,#f2475f)]/10 border-t border-[var(--line,#1d1e21)] flex items-center justify-between text-xs text-[var(--down,#f2475f)]">
              <span>{ordersLoadMoreError}</span>
              <button
                type="button"
                onClick={loadMoreOrders}
                className="px-2.5 py-1 rounded bg-[var(--line,#1d1e21)] text-[var(--text,#f4f4f5)] hover:bg-[var(--line,#1d1e21)]/80 cursor-pointer font-semibold"
              >
                Thử lại
              </button>
            </div>
          )}
          {ordersNextCursor && (
            <div className="p-4 border-t border-[var(--line,#1d1e21)] flex justify-center">
              <button
                type="button"
                onClick={loadMoreOrders}
                disabled={ordersLoadingMore}
                data-testid="list-more"
                className="px-4 py-2 rounded-lg bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-xs font-semibold text-[var(--text,#f4f4f5)] transition-colors disabled:opacity-50"
              >
                {ordersLoadingMore ? 'Đang tải...' : 'Xem thêm'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Ledger Tab */}
      {activeTab === 'ledger' && (
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow">
          {/* Filter Bar */}
          <div className="p-4 border-b border-[var(--line,#1d1e21)] flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-3,#63636b)]">Tài sản:</span>
              <select
                value={ledgerAsset}
                onChange={(e) => setLedgerAsset(e.target.value)}
                className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-2.5 py-1.5 text-[var(--text,#f4f4f5)] focus:outline-none focus:border-[var(--accent,#818cf8)]"
              >
                <option value="">Tất cả</option>
                {Array.from(new Set(detail?.balances.map((b) => b.asset) || ['USDT', 'BTC', 'ETH'])).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]">
                <input
                  type="checkbox"
                  checked={ledgerHideLocks}
                  onChange={(e) => setLedgerHideLocks(e.target.checked)}
                  className="rounded border-[var(--line,#1d1e21)] text-[var(--accent,#818cf8)] focus:ring-0"
                />
                <span>Ẩn khóa / mở khóa lệnh</span>
              </label>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-3,#63636b)]">Từ:</span>
              <input
                type="datetime-local"
                value={ledgerFrom}
                onChange={(e) => setLedgerFrom(e.target.value)}
                className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-2 py-1 text-[var(--text,#f4f4f5)] focus:outline-none focus:border-[var(--accent,#818cf8)]"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-3,#63636b)]">Đến:</span>
              <input
                type="datetime-local"
                value={ledgerTo}
                onChange={(e) => setLedgerTo(e.target.value)}
                className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-2 py-1 text-[var(--text,#f4f4f5)] focus:outline-none focus:border-[var(--accent,#818cf8)]"
              />
            </div>

            <button
              type="button"
              onClick={() => loadLedger(false)}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent,#818cf8)] hover:bg-[var(--accent,#818cf8)]/80 text-white font-semibold transition-colors"
            >
              Lọc
            </button>

            {(ledgerAsset || !ledgerHideLocks || ledgerFrom || ledgerTo) && (
              <button
                type="button"
                onClick={() => {
                  setLedgerAsset('');
                  setLedgerHideLocks(true);
                  setLedgerFrom('');
                  setLedgerTo('');
                }}
                className="px-3 py-1.5 rounded-lg bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-[var(--text-2,#a1a1aa)] transition-colors"
              >
                Đặt lại
              </button>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[900px]">
              <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)]">
                <tr>
                  <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Thời gian</th>
                  <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Ví</th>
                  <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Tài sản</th>
                  <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Loại biến động</th>
                  <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] text-right">Biến động khả dụng</th>
                  <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] text-right">Khả dụng sau</th>
                  <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] text-right">Biến động đóng băng</th>
                  <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] text-right">Đóng băng sau</th>
                  <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Tham chiếu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line,#1d1e21)] font-mono text-xs">
                {ledgerLoading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-[var(--text-3,#63636b)]">Đang tải sổ cái...</td>
                  </tr>
                )}
                {!ledgerLoading && ledgerError && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center" data-testid="list-error">
                      <div className="text-[var(--down,#f2475f)] mb-2">{ledgerError}</div>
                      <button
                        type="button"
                        onClick={() => loadLedger(false)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--line,#1d1e21)] text-xs text-[var(--text,#f4f4f5)] hover:bg-[var(--line,#1d1e21)]/80"
                      >
                        Thử lại
                      </button>
                    </td>
                  </tr>
                )}
                {!ledgerLoading && !ledgerError && ledgerEntries.map((l) => (
                  <tr key={l.id} className="hover:bg-[var(--line,#1d1e21)]/10">
                    <td className="px-4 py-3 text-[var(--text-3,#63636b)] whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-sans ${
                        l.account === 'FUTURES'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        {l.account}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-[var(--text,#f4f4f5)]">{l.asset}</td>
                    <td className="px-4 py-3 font-sans text-[var(--text-2,#a1a1aa)]">
                      {LEDGER_TYPE_LABELS[l.type] || l.type}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${
                      dec(l.deltaAvailable).gt(0)
                        ? 'text-[var(--up,#1fc27a)]'
                        : dec(l.deltaAvailable).lt(0)
                        ? 'text-[var(--down,#f2475f)]'
                        : 'text-[var(--text-3,#63636b)]'
                    }`}>
                      {dec(l.deltaAvailable).gt(0) ? `+${l.deltaAvailable}` : l.deltaAvailable}
                    </td>
                    <td className="px-4 py-3 text-right">{l.availableAfter}</td>
                    <td className={`px-4 py-3 text-right ${
                      dec(l.deltaLocked).gt(0)
                        ? 'text-amber-400'
                        : dec(l.deltaLocked).lt(0)
                        ? 'text-amber-300'
                        : 'text-[var(--text-3,#63636b)]'
                    }`}>
                      {dec(l.deltaLocked).gt(0) ? `+${l.deltaLocked}` : l.deltaLocked}
                    </td>
                    <td className="px-4 py-3 text-right">{l.lockedAfter}</td>
                    <td className="px-4 py-3 text-[var(--text-3,#63636b)] font-sans">
                      {l.refType ? (
                        <span>
                          <span className="text-[var(--text-2,#a1a1aa)]">{REF_TYPE_LABELS[l.refType] || l.refType}</span>
                          {l.refId && (
                            <span className="ml-1 text-[var(--text-3,#63636b)] font-mono text-[11px]" title={l.refId}>
                              ({l.refId.slice(0, 8)}...)
                            </span>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
                {!ledgerLoading && !ledgerError && ledgerEntries.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-[var(--text-3,#63636b)]">
                      Chưa có giao dịch sổ cái phù hợp
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {ledgerNextCursor && !ledgerLoading && !ledgerError && (
            <div className="p-4 border-t border-[var(--line,#1d1e21)] flex justify-center">
              <button
                type="button"
                onClick={loadMoreLedger}
                disabled={ledgerLoadingMore}
                data-testid="list-more"
                className="px-4 py-2 rounded-lg bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-xs font-semibold text-[var(--text,#f4f4f5)] transition-colors disabled:opacity-50"
              >
                {ledgerLoadingMore ? 'Đang tải...' : 'Xem thêm'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Futures Positions Tab */}
      {activeTab === 'futures' && (
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow">
          <div className="p-4 border-b border-[var(--line,#1d1e21)] flex items-center gap-3">
            <button
              onClick={() => setPositionsType('true')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${positionsType === 'true' ? 'bg-[var(--accent,#818cf8)] text-white' : 'bg-[var(--bg,#000000)] text-[var(--text-2,#a1a1aa)]'}`}
            >
              Vị thế đang mở
            </button>
            <button
              onClick={() => setPositionsType('false')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${positionsType === 'false' ? 'bg-[var(--accent,#818cf8)] text-white' : 'bg-[var(--bg,#000000)] text-[var(--text-2,#a1a1aa)]'}`}
            >
              Lịch sử vị thế
            </button>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)]">
              <tr>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Hợp đồng</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Vị thế</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Khối lượng</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Giá vào</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Giá đánh dấu</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Ký quỹ</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Giá thanh lý</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">PnL chưa chốt</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">PnL đã chốt</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Phí</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Funding</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)]">Lý do đóng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line,#1d1e21)] font-mono text-xs">
              {positionsLoading && positions.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-[var(--text-3,#63636b)]">
                    Đang tải danh sách vị thế...
                  </td>
                </tr>
              )}
              {!positionsLoading && positionsError && positions.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center" data-testid="list-error">
                    <div className="text-[var(--down,#f2475f)] mb-2">{positionsError}</div>
                    <button
                      type="button"
                      onClick={loadPositions}
                      className="px-3 py-1.5 rounded-lg bg-[var(--line,#1d1e21)] text-xs text-[var(--text,#f4f4f5)] hover:bg-[var(--line,#1d1e21)]/80 cursor-pointer font-semibold"
                    >
                      Thử lại
                    </button>
                  </td>
                </tr>
              )}
              {!positionsLoading && !positionsError && positions.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-[var(--text-3,#63636b)]">
                    Không có vị thế nào
                  </td>
                </tr>
              )}
              {positions.map((p) => (
                <tr key={p.id} className="hover:bg-[var(--line,#1d1e21)]/10">
                  <td className="px-4 py-3 font-bold">
                    <a
                      href={appLinks.exchange.futures(p.symbol, exchangeOrigin)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent,#818cf8)] hover:underline inline-flex items-center gap-1 font-sans"
                    >
                      {p.symbol} <ExternalLink size={10} />
                    </a>
                  </td>
                  <td className={`px-4 py-3 font-bold ${p.side === 'LONG' ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}`}>
                    {p.side} {p.leverage}x
                  </td>
                  <td className="px-4 py-3">{p.quantity}</td>
                  <td className="px-4 py-3">{p.entryPrice}</td>
                  <td className="px-4 py-3">{p.markPrice || '—'}</td>
                  <td className="px-4 py-3">{formatDecimal(p.margin)} USDT</td>
                  <td className="px-4 py-3">{p.liquidationPrice ? `${formatDecimal(p.liquidationPrice)}` : '—'}</td>
                  <td
                    data-testid="admin-futures-position-upnl"
                    className={`px-4 py-3 font-bold ${
                      p.unrealizedPnl === null
                        ? 'text-[var(--text-3,#63636b)]'
                        : dec(p.unrealizedPnl).gte(0)
                        ? 'text-[var(--up,#1fc27a)]'
                        : 'text-[var(--down,#f2475f)]'
                    }`}
                  >
                    {p.unrealizedPnl !== null ? `${formatDecimal(p.unrealizedPnl)} USDT` : '—'}
                  </td>
                  <td className={`px-4 py-3 font-bold ${dec(p.realizedPnl).gte(0) ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}`}>
                    {formatDecimal(p.realizedPnl)} USDT
                  </td>
                  <td className="px-4 py-3">{formatDecimal(p.fees)} USDT</td>
                  <td className="px-4 py-3">{formatDecimal(p.funding)} USDT</td>
                  <td className="px-4 py-3 font-sans text-[var(--text-2,#a1a1aa)]">
                    {p.closeReason ? (CLOSE_REASON_LABELS[p.closeReason] || p.closeReason) : (p.status === 'OPEN' ? 'Đang mở' : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {positionsLoadMoreError && (
            <div className="p-3 bg-[var(--down,#f2475f)]/10 border-t border-[var(--line,#1d1e21)] flex items-center justify-between text-xs text-[var(--down,#f2475f)]">
              <span>{positionsLoadMoreError}</span>
              <button
                type="button"
                onClick={loadMorePositions}
                className="px-2.5 py-1 rounded bg-[var(--line,#1d1e21)] text-[var(--text,#f4f4f5)] hover:bg-[var(--line,#1d1e21)]/80 cursor-pointer font-semibold"
              >
                Thử lại
              </button>
            </div>
          )}
          {positionsNextCursor && (
            <div className="p-4 border-t border-[var(--line,#1d1e21)] flex justify-center">
              <button
                type="button"
                onClick={loadMorePositions}
                disabled={positionsLoadingMore}
                data-testid="list-more"
                className="px-4 py-2 rounded-lg bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-xs font-semibold text-[var(--text,#f4f4f5)] transition-colors disabled:opacity-50"
              >
                {positionsLoadingMore ? 'Đang tải...' : 'Xem thêm'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bots Tab */}
      {activeTab === 'bots' && (
        <div className="space-y-6">
          {botsLoading && (
            <div className="p-12 text-center text-[var(--text-3,#63636b)]">Đang tải thông tin bot & DCA...</div>
          )}
          {!botsLoading && botsError && (
            <div data-testid="list-error" className="p-12 text-center bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl flex flex-col items-center justify-center gap-3">
              <p className="text-sm text-[var(--down,#f2475f)]">{botsError}</p>
              <button
                type="button"
                onClick={loadBots}
                className="px-4 py-2 rounded-lg bg-[var(--line,#1d1e21)] text-xs text-[var(--text,#f4f4f5)] hover:bg-[var(--line,#1d1e21)]/80 font-semibold cursor-pointer"
              >
                Thử lại
              </button>
            </div>
          )}
          {!botsLoading && !botsError && (
            <>
              {/* Grid Bots */}
              <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow">
                <div className="px-4 py-3 border-b border-[var(--line,#1d1e21)] font-bold text-sm text-[var(--text,#f4f4f5)]">
                  Grid Trading Bots
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs text-[var(--text-2,#a1a1aa)]">
                    <tr>
                      <th className="px-4 py-3">ID Bot</th>
                      <th className="px-4 py-3">Cặp</th>
                      <th className="px-4 py-3">Biên độ giá</th>
                      <th className="px-4 py-3">Lưới</th>
                      <th className="px-4 py-3">Vốn đầu tư</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line,#1d1e21)] font-mono text-xs">
                    {userBots.grid.map((b) => (
                      <tr key={b.id} className="hover:bg-[var(--line,#1d1e21)]/10">
                        <td className="px-4 py-3">{b.id}</td>
                        <td className="px-4 py-3 font-bold text-[var(--text,#f4f4f5)]">{b.symbol}</td>
                        <td className="px-4 py-3">{b.lowerPrice} - {b.upperPrice}</td>
                        <td className="px-4 py-3">{b.gridCount}</td>
                        <td className="px-4 py-3">{b.investment} USDT</td>
                        <td className="px-4 py-3 text-[var(--accent,#818cf8)]">{b.status}</td>
                        <td className="px-4 py-3 text-right font-sans">
                          {hasPerm('bots.manage') && b.status === 'RUNNING' && (
                            <button
                              onClick={() => { setSelectedBotId(b.id); setSellBase(false); setConfirmAction('STOP_BOT'); setConfirmOpen(true); }}
                              className="px-2.5 py-1 rounded bg-[var(--down,#f2475f)]/10 hover:bg-[var(--down,#f2475f)]/20 text-[var(--down,#f2475f)] text-xs border border-[var(--down,#f2475f)]/30 cursor-pointer"
                            >
                              Dừng bot
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {userBots.grid.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-3,#63636b)] font-sans">Người dùng chưa tạo Grid Bot nào</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* DCA Plans */}
              <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow">
                <div className="px-4 py-3 border-b border-[var(--line,#1d1e21)] font-bold text-sm text-[var(--text,#f4f4f5)]">
                  Kế hoạch mua định kỳ (DCA)
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs text-[var(--text-2,#a1a1aa)]">
                    <tr>
                      <th className="px-4 py-3">ID Kế hoạch</th>
                      <th className="px-4 py-3">Cặp mua</th>
                      <th className="px-4 py-3">Số tiền mỗi lần</th>
                      <th className="px-4 py-3">Chu kỳ</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line,#1d1e21)] font-mono text-xs">
                    {userBots.dca.map((d) => (
                      <tr key={d.id} className="hover:bg-[var(--line,#1d1e21)]/10">
                        <td className="px-4 py-3">{d.id}</td>
                        <td className="px-4 py-3 font-bold text-[var(--text,#f4f4f5)]">{d.symbol}</td>
                        <td className="px-4 py-3">{d.quoteAmount} USDT</td>
                        <td className="px-4 py-3">{d.interval}</td>
                        <td className="px-4 py-3 text-[var(--accent,#818cf8)]">{d.status}</td>
                        <td className="px-4 py-3 text-right font-sans">
                          {hasPerm('bots.manage') && (d.status === 'ACTIVE' || d.status === 'PAUSED') && (
                            <button
                              onClick={() => { setSelectedPlanId(d.id); setConfirmAction('CANCEL_DCA'); setConfirmOpen(true); }}
                              className="px-2.5 py-1 rounded bg-[var(--down,#f2475f)]/10 hover:bg-[var(--down,#f2475f)]/20 text-[var(--down,#f2475f)] text-xs border border-[var(--down,#f2475f)]/30 cursor-pointer"
                            >
                              Hủy kế hoạch
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {userBots.dca.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-3,#63636b)] font-sans">Người dùng chưa tạo kế hoạch DCA nào</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Logins Tab */}
      {activeTab === 'logins' && (
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs text-[var(--text-2,#a1a1aa)]">
              <tr>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3">Địa chỉ IP</th>
                <th className="px-4 py-3">Thiết bị / Trình duyệt</th>
                <th className="px-4 py-3">Đặc điểm</th>
                <th className="px-4 py-3">Kết quả</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line,#1d1e21)] font-mono text-xs">
              {loginsLoading && allLogins.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[var(--text-3,#63636b)] font-sans">
                    Đang tải lịch sử đăng nhập...
                  </td>
                </tr>
              )}
              {!loginsLoading && loginsError && allLogins.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center" data-testid="list-error">
                    <div className="text-[var(--down,#f2475f)] mb-2 font-sans">{loginsError}</div>
                    <button
                      type="button"
                      onClick={loadLogins}
                      className="px-3 py-1.5 rounded-lg bg-[var(--line,#1d1e21)] text-xs text-[var(--text,#f4f4f5)] hover:bg-[var(--line,#1d1e21)]/80 cursor-pointer font-semibold font-sans"
                    >
                      Thử lại
                    </button>
                  </td>
                </tr>
              )}
              {!loginsLoading && !loginsError && allLogins.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[var(--text-3,#63636b)] font-sans">Chưa có dữ liệu đăng nhập</td>
                </tr>
              )}
              {allLogins.map((lg) => (
                <tr key={lg.id} className="hover:bg-[var(--line,#1d1e21)]/10">
                  <td className="px-4 py-3 text-[var(--text-3,#63636b)]">{new Date(lg.at).toLocaleString('vi-VN')}</td>
                  <td className="px-4 py-3">{lg.ip || '—'}</td>
                  <td className="px-4 py-3 text-[var(--text-2,#a1a1aa)] max-w-xs truncate" title={lg.device || ''}>{lg.device || '—'}</td>
                  <td className="px-4 py-3">
                    {lg.newDevice && (
                      <span className="px-2 py-0.5 rounded bg-amber-950/40 text-amber-400 border border-amber-800/40 text-[10px] font-sans">
                        Thiết bị mới
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-3 font-semibold ${lg.success ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}`}>
                    {lg.result === 'OK' ? 'Thành công' : lg.result}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loginsLoadMoreError && (
            <div className="p-3 bg-[var(--down,#f2475f)]/10 border-t border-[var(--line,#1d1e21)] flex items-center justify-between text-xs text-[var(--down,#f2475f)]">
              <span>{loginsLoadMoreError}</span>
              <button
                type="button"
                onClick={loadMoreLogins}
                className="px-2.5 py-1 rounded bg-[var(--line,#1d1e21)] text-[var(--text,#f4f4f5)] hover:bg-[var(--line,#1d1e21)]/80 cursor-pointer font-semibold font-sans"
              >
                Thử lại
              </button>
            </div>
          )}
          {loginsNextCursor && (
            <div className="p-4 border-t border-[var(--line,#1d1e21)] flex justify-center">
              <button
                type="button"
                onClick={loadMoreLogins}
                disabled={loginsLoadingMore}
                data-testid="list-more"
                className="px-4 py-2 rounded-lg bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-xs font-semibold text-[var(--text,#f4f4f5)] transition-colors disabled:opacity-50"
              >
                {loginsLoadingMore ? 'Đang tải...' : 'Xem thêm'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tax Profile Tab */}
      {activeTab === 'tax' && (
        <div className="space-y-6">
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow">
            <div className="p-4 border-b border-[var(--line,#1d1e21)] flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[var(--text,#f4f4f5)]">Nhật ký khấu trừ thuế của khách</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Thử nghiệm
                  </span>
                </div>
                <p className="text-xs text-[var(--text-3,#63636b)] mt-0.5">
                  Ghi nhận tự động khi lệnh bán Spot khớp thành công (sàn thử nghiệm, không nộp cho cơ quan nào)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={actualId ? exportUrl('adminTaxExport', { userId: actualId }) : '#'}
                  download
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line,#1d1e21)] text-xs text-[var(--text,#f4f4f5)] hover:bg-[var(--line,#1d1e21)]/40 transition-colors"
                >
                  <Download size={14} />
                  <span>Xuất CSV</span>
                </a>
              </div>
            </div>

            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs text-[var(--text-2,#a1a1aa)]">
                <tr>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3">Cặp GD</th>
                  <th className="px-4 py-3">Giá trị bán gộp</th>
                  <th className="px-4 py-3">Thuế suất</th>
                  <th className="px-4 py-3">Thuế khấu trừ (USDT)</th>
                  <th className="px-4 py-3">Tỷ giá VND</th>
                  <th className="px-4 py-3">Thuế VND</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line,#1d1e21)] font-mono text-xs">
                {taxLoading && taxWithholdings.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-3,#63636b)] font-sans">
                      Đang tải dữ liệu khấu trừ thuế...
                    </td>
                  </tr>
                )}
                {!taxLoading && taxError && taxWithholdings.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center" data-testid="list-error">
                      <div className="text-[var(--down,#f2475f)] mb-2 font-sans">{taxError}</div>
                      <button
                        type="button"
                        onClick={loadTax}
                        className="px-3 py-1.5 rounded-lg bg-[var(--line,#1d1e21)] text-xs text-[var(--text,#f4f4f5)] hover:bg-[var(--line,#1d1e21)]/80 cursor-pointer font-semibold font-sans"
                      >
                        Thử lại
                      </button>
                    </td>
                  </tr>
                )}
                {!taxLoading && !taxError && taxWithholdings.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-3,#63636b)] font-sans">
                      Chưa có bản ghi khấu trừ nào.
                    </td>
                  </tr>
                )}
                {!taxLoading && !taxError && taxWithholdings.map((wh) => (
                  <tr key={wh.id} className="hover:bg-[var(--line,#1d1e21)]/10" data-testid="admin-tax-withholding-row" data-trade-id={wh.tradeId}>
                    <td className="px-4 py-3 text-[var(--text-3,#63636b)]">
                      {new Date(wh.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                    </td>
                    <td className="px-4 py-3 font-semibold text-[var(--text,#f4f4f5)]">{wh.symbol}</td>
                    <td className="px-4 py-3">{formatDecimal(wh.grossQuote, { decimals: 4 })} USDT</td>
                    <td className="px-4 py-3 text-amber-400">{dec(wh.taxRate).mul(100).toString()}%</td>
                    <td className="px-4 py-3 font-bold text-amber-400">{formatDecimal(wh.taxAmount, { decimals: 8 })} USDT</td>
                    <td className="px-4 py-3 text-[var(--text-2,#a1a1aa)]">{wh.vndRate ? `${formatDecimal(wh.vndRate, { decimals: 0 })} ₫` : '—'}</td>
                    <td className="px-4 py-3 text-[var(--text-2,#a1a1aa)]">{wh.taxVnd ? `${formatDecimal(wh.taxVnd, { decimals: 0 })} ₫` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {taxLoadMoreError && (
              <div className="p-3 bg-[var(--down,#f2475f)]/10 border-t border-[var(--line,#1d1e21)] flex items-center justify-between text-xs text-[var(--down,#f2475f)]">
                <span>{taxLoadMoreError}</span>
                <button
                  type="button"
                  onClick={loadMoreTax}
                  className="px-2.5 py-1 rounded bg-[var(--line,#1d1e21)] text-[var(--text,#f4f4f5)] hover:bg-[var(--line,#1d1e21)]/80 cursor-pointer font-semibold font-sans"
                >
                  Thử lại
                </button>
              </div>
            )}

            {taxNextCursor && !taxLoading && !taxError && (
              <div className="p-4 border-t border-[var(--line,#1d1e21)] flex justify-center">
                <button
                  type="button"
                  onClick={loadMoreTax}
                  disabled={taxLoadingMore}
                  data-testid="list-more"
                  className="px-4 py-2 rounded-lg bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-xs font-semibold text-[var(--text,#f4f4f5)] transition-colors disabled:opacity-50"
                >
                  {taxLoadingMore ? 'Đang tải...' : 'Xem thêm'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audit Logs Tab (AD-23) */}
      {activeTab === 'audit' && (
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow">
          <div className="p-4 border-b border-[var(--line,#1d1e21)] flex flex-wrap items-center justify-between gap-3">
            <div className="font-bold text-sm text-[var(--text,#f4f4f5)] flex items-center gap-2">
              <FileText size={16} className="text-[var(--accent,#818cf8)]" />
              <span>Nhật ký kiểm toán liên quan đến người dùng này</span>
            </div>
            <span className="text-xs text-[var(--text-3,#63636b)]">
              Ghi nhận các thao tác quản trị tác động lên tài khoản (khóa, mở khóa, đổi vai trò, chỉnh số dư...)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[800px]">
              <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase">
                <tr>
                  <th className="px-5 py-3">Thời gian</th>
                  <th className="px-5 py-3">Người thực hiện</th>
                  <th className="px-5 py-3">Hành động</th>
                  <th className="px-5 py-3">Lý do</th>
                  <th className="px-5 py-3">IP</th>
                  <th className="px-5 py-3 text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line,#1d1e21)] text-xs">
                {auditLogsLoading && userAuditLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-[var(--text-3,#63636b)] font-sans">
                      Đang tải nhật ký kiểm toán...
                    </td>
                  </tr>
                )}
                {!auditLogsLoading && auditLogsError && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center" data-testid="list-error">
                      <div className="text-[var(--down,#f2475f)] mb-2">{auditLogsError}</div>
                      <button
                        type="button"
                        onClick={() => loadUserAuditLogs(false)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--line,#1d1e21)] text-xs text-[var(--text,#f4f4f5)] hover:bg-[var(--line,#1d1e21)]/80"
                      >
                        Thử lại
                      </button>
                    </td>
                  </tr>
                )}
                {!auditLogsLoading && !auditLogsError && userAuditLogs.map((log) => (
                  <tr key={log.id} data-testid="user-audit-row" className="hover:bg-[var(--line,#1d1e21)]/15">
                    <td className="px-5 py-3 text-xs text-[var(--text-3,#63636b)] font-mono whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-5 py-3">
                      {log.actor ? (
                        <a
                          href={`/admin/users/${log.actor.id}`}
                          className="text-[var(--accent,#818cf8)] hover:underline font-medium"
                        >
                          {log.actor.email}
                        </a>
                      ) : (
                        <span className="text-[var(--text-3,#63636b)] font-sans">(Hệ thống)</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col">
                        <span className="font-mono font-semibold text-xs text-[var(--accent,#818cf8)]">
                          {log.action}
                        </span>
                        <span className="text-[11px] text-[var(--text-3,#63636b)]">
                          {AUDIT_ACTION_LABELS[log.action] || log.action}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[var(--text-2,#a1a1aa)] max-w-xs truncate" title={log.reason || ''}>
                      {log.reason || '—'}
                    </td>
                    <td className="px-5 py-3 font-mono text-[var(--text-3,#63636b)]">
                      {log.ip || '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => setSelectedAuditEntry(log)}
                        className="p-1.5 rounded hover:bg-[var(--line,#1d1e21)] text-[var(--text-3,#63636b)] hover:text-white transition-colors"
                        title="Xem thay đổi Before / After"
                      >
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!auditLogsLoading && !auditLogsError && userAuditLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-[var(--text-3,#63636b)] font-sans">
                      Chưa có bản ghi nhật ký quản trị nào liên quan đến người dùng này.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {auditLogsLoadMoreError && (
            <div className="p-3 bg-[var(--down,#f2475f)]/10 border-t border-[var(--line,#1d1e21)] flex items-center justify-between text-xs text-[var(--down,#f2475f)]">
              <span>{auditLogsLoadMoreError}</span>
              <button
                type="button"
                onClick={loadMoreAuditLogs}
                className="px-2.5 py-1 rounded bg-[var(--line,#1d1e21)] text-[var(--text,#f4f4f5)] hover:bg-[var(--line,#1d1e21)]/80 cursor-pointer font-semibold font-sans"
              >
                Thử lại
              </button>
            </div>
          )}

          {auditLogsNextCursor && !auditLogsLoading && !auditLogsError && (
            <div className="p-4 border-t border-[var(--line,#1d1e21)] flex justify-center">
              <button
                type="button"
                onClick={loadMoreAuditLogs}
                disabled={auditLogsLoadingMore}
                data-testid="list-more"
                className="px-4 py-2 rounded-lg bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-xs font-semibold text-[var(--text,#f4f4f5)] transition-colors disabled:opacity-50"
              >
                {auditLogsLoadingMore ? 'Đang tải...' : 'Xem thêm'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* User Audit Log Compare Modal */}
      {selectedAuditEntry && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl w-full max-w-2xl p-6 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line,#1d1e21)] pb-3">
              <div>
                <h2 className="text-base font-bold text-[var(--text,#f4f4f5)]">Chi tiết thao tác nhật ký</h2>
                <div className="text-xs text-[var(--text-3,#63636b)] mt-0.5">Mã ID: {selectedAuditEntry.id}</div>
              </div>
              <button onClick={() => setSelectedAuditEntry(null)} className="text-[var(--text-3,#63636b)] hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[var(--bg,#000000)] p-3 rounded-lg border border-[var(--line,#1d1e21)]">
              <div>
                <strong className="text-[var(--text-3,#63636b)]">Hành động:</strong>{' '}
                <span className="font-semibold text-[var(--accent,#818cf8)]">{selectedAuditEntry.action}</span> (
                {AUDIT_ACTION_LABELS[selectedAuditEntry.action] || selectedAuditEntry.action})
              </div>
              <div>
                <strong className="text-[var(--text-3,#63636b)]">Thời gian:</strong>{' '}
                {new Date(selectedAuditEntry.createdAt).toLocaleString('vi-VN')}
              </div>
              <div>
                <strong className="text-[var(--text-3,#63636b)]">Thực hiện bởi:</strong>{' '}
                {selectedAuditEntry.actor ? selectedAuditEntry.actor.email : 'Hệ thống'}
              </div>
              <div>
                <strong className="text-[var(--text-3,#63636b)]">Địa chỉ IP:</strong> {selectedAuditEntry.ip || '—'}
              </div>
              <div className="col-span-2">
                <strong className="text-[var(--text-3,#63636b)]">Lý do:</strong> {selectedAuditEntry.reason || '—'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold text-[var(--text-2,#a1a1aa)] mb-1 uppercase">Dữ liệu trước (Before)</div>
                <pre className="p-3 bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg text-xs font-mono text-amber-300/80 overflow-auto max-h-60">
                  {selectedAuditEntry.before ? JSON.stringify(selectedAuditEntry.before, null, 2) : 'null'}
                </pre>
              </div>
              <div>
                <div className="text-xs font-semibold text-[var(--text-2,#a1a1aa)] mb-1 uppercase">Dữ liệu sau (After)</div>
                <pre className="p-3 bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg text-xs font-mono text-[var(--up,#1fc27a)]/80 overflow-auto max-h-60">
                  {selectedAuditEntry.after ? JSON.stringify(selectedAuditEntry.after, null, 2) : 'null'}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--line,#1d1e21)]">
              <button
                onClick={() => setSelectedAuditEntry(null)}
                className="px-4 py-2 rounded-lg bg-[var(--line,#1d1e21)] text-xs font-semibold text-white hover:bg-[var(--line,#1d1e21)]/80"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Change Modal */}
      {roleModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl w-full max-w-md p-6 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="text-[var(--accent,#818cf8)]" size={20} />
                <h2 className="text-lg font-bold text-[var(--text,#f4f4f5)]">Thay đổi vai trò thành viên</h2>
              </div>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="text-[var(--text-3,#63636b)] hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-[var(--text-2,#a1a1aa)]">
              Thay đổi quyền truy cập của <span className="font-semibold text-white">{detail.user.email}</span>. Các thay đổi sẽ có hiệu lực ngay lập tức và được ghi vào nhật ký kiểm toán.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">Chọn vai trò mới</label>
              <div className="space-y-1.5">
                {[
                  { r: 'user' as Role, name: 'USER — Khách giao dịch', desc: 'Giao dịch Spot, Futures, Faucet; không có quyền quản trị' },
                  { r: 'support' as Role, name: 'SUPPORT — Chăm sóc khách hàng', desc: 'Chỉ đọc dữ liệu tài khoản, sàn, đối soát, thuế, tin tức' },
                  { r: 'admin' as Role, name: 'ADMIN — Quản trị viên', desc: 'Khóa/mở khóa, điều chỉnh số dư, bot, thuế, cấu hình sàn; không phân quyền nhân sự' },
                  { r: 'owner' as Role, name: 'OWNER — Chủ sở hữu', desc: 'Toàn quyền hệ thống, phân quyền vai trò nhân sự' },
                ].map((item) => (
                  <label
                    key={item.r}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      targetRole === item.r
                        ? 'border-[var(--accent,#818cf8)] bg-[var(--accent,#818cf8)]/10 text-white'
                        : 'border-[var(--line,#1d1e21)] bg-[var(--bg,#000000)] text-[var(--text-2,#a1a1aa)] hover:border-[var(--text-3,#63636b)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="targetRole"
                      value={item.r}
                      checked={targetRole === item.r}
                      onChange={() => setTargetRole(item.r)}
                      className="mt-1 accent-[var(--accent,#818cf8)]"
                    />
                    <div>
                      <div className="text-xs font-bold text-[var(--text,#f4f4f5)]">{item.name}</div>
                      <div className="text-[11px] text-[var(--text-3,#63636b)] mt-0.5">{item.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                Lý do thay đổi <span className="text-[var(--down,#f2475f)]">*</span> (≥ 5 ký tự)
              </label>
              <textarea
                data-testid="role-change-reason"
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] resize-none h-20 outline-none focus:border-[var(--accent,#818cf8)]"
                value={roleReason}
                onChange={(e) => setRoleReason(e.target.value)}
                placeholder="Nhập lý do thay đổi vai trò (quyết định bổ nhiệm, luân chuyển nhân sự...)..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-[var(--line,#1d1e21)]">
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-[var(--line,#1d1e21)] text-sm text-[var(--text-2,#a1a1aa)] hover:bg-[var(--line,#1d1e21)]/40 transition-colors"
                disabled={isSubmittingRole}
              >
                Hủy
              </button>
              <button
                type="button"
                data-testid="role-change-submit"
                onClick={handleRoleChangeSubmit}
                disabled={!roleReason || roleReason.trim().length < 5 || isSubmittingRole}
                className="px-4 py-2 rounded-lg bg-[var(--accent,#818cf8)] text-white text-sm font-medium hover:brightness-110 disabled:opacity-40 transition-all"
              >
                {isSubmittingRole ? 'Đang lưu...' : 'Xác nhận thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Balance Modal */}
      {adjustOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl w-full max-w-md p-6 flex flex-col gap-4 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-[var(--text,#f4f4f5)]">Thêm / bớt tiền cho khách</h2>
              <p className="text-xs text-[var(--text-2,#a1a1aa)] mt-1">
                Nhập số dương để cộng tiền, số âm để trừ tiền (ví dụ: <code className="text-white">500</code> hoặc <code className="text-white">-250.5</code>).
              </p>
            </div>

            {adjustError && (
              <div className="p-3 rounded-lg bg-[var(--down,#f2475f)]/10 border border-[var(--down,#f2475f)]/20 text-xs text-[var(--down,#f2475f)] flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{adjustError}</span>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">Tài sản</label>
              <select
                data-testid="adjust-asset"
                value={adjustAsset}
                onChange={(e) => setAdjustAsset(e.target.value)}
                className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
              >
                {Array.from(new Set([
                  ...(exchangeAssets.length > 0 ? exchangeAssets : ['USDT', 'BTC', 'ETH', 'SOL', 'BNB', 'DOGE', 'XRP', 'ADA']),
                  ...detail.balances.map((b) => b.asset),
                ])).map((asset) => (
                  <option key={asset} value={asset}>{asset}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">Số tiền (có dấu)</label>
              <input
                data-testid="adjust-amount"
                type="text"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="500 hoặc -250.5 (tối đa 8 chữ số lẻ)"
                className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] font-mono"
              />
              {adjustAmount && !ADJUST_AMOUNT_REGEX.test(adjustAmount.trim()) && (
                <div className="text-[11px] text-[var(--down,#f2475f)]">
                  Số tiền không hợp lệ. Vui lòng nhập số với tối đa 8 chữ số thập phân (không dùng ký tự khoa học 1e3).
                </div>
              )}
              {adjustAmount && ADJUST_AMOUNT_REGEX.test(adjustAmount.trim()) && dec(adjustAmount.trim()).isZero() && (
                <div className="text-[11px] text-[var(--down,#f2475f)]">
                  Số tiền điều chỉnh phải khác 0.
                </div>
              )}
            </div>

            {adjustAmount && calculatedAfter && (
              <div
                data-testid="adjust-preview"
                className="p-3 rounded-lg bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] text-xs font-mono"
              >
                <div className="text-[var(--text-3,#63636b)] mb-1">Xem trước số dư:</div>
                <div className="text-[var(--text,#f4f4f5)] font-semibold">
                  {currentAvailable} → {calculatedAfter} {adjustAsset}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                Lý do thao tác <span className="text-[var(--down,#f2475f)]">*</span> (≥ 5 ký tự)
              </label>
              <textarea
                data-testid="confirm-reason"
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] resize-none h-20 outline-none focus:border-[var(--accent,#818cf8)]"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Nhập lý do điều chỉnh số dư..."
              />
            </div>

            <div className="flex justify-end gap-3 mt-2 pt-2 border-t border-[var(--line,#1d1e21)]">
              <button
                type="button"
                onClick={() => setAdjustOpen(false)}
                className="px-4 py-2 rounded-lg border border-[var(--line,#1d1e21)] text-sm text-[var(--text-2,#a1a1aa)] hover:bg-[var(--line,#1d1e21)]/40 transition-colors"
                disabled={isSubmitting}
              >
                Hủy
              </button>
              <button
                data-testid="confirm-submit"
                type="button"
                onClick={handleAdjustSubmit}
                disabled={!isAdjustAmountValid || !adjustReason || adjustReason.trim().length < 5 || isSubmitting}
                className="px-4 py-2 rounded-lg bg-[var(--accent,#818cf8)] text-white text-sm font-medium hover:brightness-110 disabled:opacity-40 transition-all"
              >
                {isSubmitting ? 'Đang xử lý...' : 'Xác nhận điều chỉnh'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmOpen}
        title={
          confirmAction === 'LOCK' ? 'Khóa tài khoản nghi gian lận' :
          confirmAction === 'UNLOCK' ? 'Mở khóa tài khoản' :
          confirmAction === 'RESET' ? 'Reset toàn bộ tài khoản' :
          confirmAction === 'STOP_BOT' ? 'Dừng Grid Trading Bot' :
          confirmAction === 'CANCEL_DCA' ? 'Hủy kế hoạch mua định kỳ' :
          confirmAction === 'DEACTIVATE_USER' ? 'Đặt lại số dư và khóa tài khoản' :
          confirmAction === 'TOGGLE_SIGNALS' ? (detail?.user.signalsAccess ? 'Thu hồi quyền tín hiệu giao dịch' : 'Cấp quyền tín hiệu giao dịch') :
          'Xác nhận thao tác'
        }
        consequenceText={
          confirmAction === 'LOCK' ? 'Khóa = đăng xuất mọi thiết bị ngay; lệnh đang mở vẫn giữ; người dùng không đăng nhập lại được cho tới khi mở khóa.' :
          confirmAction === 'UNLOCK' ? 'Người dùng sẽ có thể đăng nhập lại vào web sàn và tiếp tục giao dịch bình thường.' :
          confirmAction === 'RESET' ? 'Hủy toàn bộ lệnh Spot & Futures, đóng mọi vị thế Futures, dừng bot/DCA, xóa giá vốn, xóa lịch sử Faucet và đưa toàn bộ số dư về 0 (ACCOUNT_RESET). Thao tác này không thể hoàn tác!' :
          confirmAction === 'STOP_BOT' ? 'Hủy toàn bộ lệnh đang mở của bot này. Thao tác sẽ được ghi vào nhật ký.' :
          confirmAction === 'CANCEL_DCA' ? 'Hủy kế hoạch định kỳ này. Thao tác sẽ được ghi vào nhật ký.' :
          confirmAction === 'DEACTIVATE_USER' ? 'Tài khoản sẽ bị khóa ngay lập tức (đăng xuất mọi thiết bị). Đồng thời hủy toàn bộ lệnh mở, đóng mọi vị thế Futures, dừng bot/DCA, xóa giá vốn, xóa lịch sử Faucet và đưa toàn bộ số dư về 0 (ACCOUNT_RESET). Số dư và vị thế không thể hoàn tác, nhưng tài khoản có thể mở khóa lại sau.' :
          confirmAction === 'TOGGLE_SIGNALS' ? `Người dùng sẽ ${detail?.user.signalsAccess ? 'mất' : 'được cấp'} quyền truy cập các bot và chiến lược tín hiệu trên sàn.` :
          'Hành động này sẽ được ghi nhận vào nhật ký quản trị của sàn.'
        }
        quickReasons={
          confirmAction === 'LOCK' ? [
            'Nhiều tài khoản cùng thiết bị',
            'Nạp tiền bất thường',
            'Nghi chiếm tài khoản',
            'Yêu cầu hỗ trợ từ khách hàng',
          ] : confirmAction === 'DEACTIVATE_USER' ? [
            'Khách hàng yêu cầu đóng tài khoản',
            'Vi phạm nghiêm trọng quy chế giao dịch & AML',
            'Tài khoản giả mạo / spam',
            'Xử lý vi phạm theo quy định nội bộ',
          ] : confirmAction === 'TOGGLE_SIGNALS' ? [
            'Đủ điều kiện đăng ký gói tín hiệu',
            'Nâng cấp quyền trải nghiệm tín hiệu',
            'Hết hạn quyền sử dụng bot tín hiệu',
            'Thu hồi theo yêu cầu của người dùng',
          ] : undefined
        }
        requirePhrase={
          confirmAction === 'RESET' ? 'RESET' :
          confirmAction === 'DEACTIVATE_USER' ? 'DEACTIVATE' : undefined
        }
        onConfirm={handleConfirmAction}
        onCancel={() => { setConfirmOpen(false); setConfirmAction(null); setConfirmError(null); setSellBase(false); }}
        isSubmitting={isSubmitting}
        error={confirmError}
      >
        {confirmAction === 'STOP_BOT' && (
          <label className="flex items-center gap-2 p-3 rounded-lg border border-[var(--line,#1d1e21)] bg-[var(--bg,#000000)] text-xs text-[var(--text,#f4f4f5)] cursor-pointer">
            <input
              type="checkbox"
              checked={sellBase}
              onChange={(e) => setSellBase(e.target.checked)}
              className="accent-[var(--accent,#818cf8)] rounded"
            />
            <span>Bán coin của bot theo giá thị trường (sellBase)</span>
          </label>
        )}
      </ConfirmDialog>
    </div>
  );
};
