import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Balances, Balance, FaucetStatus, LedgerEntry, FuturesAccount } from '@cex/contracts';
import { ApiError } from '@cex/contracts';
import { getApiClient } from '../services/api.ts';
import { getErrorMessage } from '../services/errors.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { useMarket } from '../context/MarketContext.tsx';
import {
  Card,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
  Badge,
  Skeleton,
  EmptyState,
  ErrorState,
  useToast,
  formatDecimal,
  formatAmount,
} from '@cex/ui';
import { ArrowLeftRight, TrendingUp, TrendingDown, ArrowUpRight, BarChart2, Download } from 'lucide-react';
import { FuturesTransferModal } from '../components/FuturesTransferModal.tsx';

export interface WalletPageProps {
  onNavigate: (path: string) => void;
}

export const WalletPage: React.FC<WalletPageProps> = ({ onNavigate }) => {
  const { isAuthenticated, user } = useAuth();
  const { publicConfig } = useConfig();
  const { realtimeClient } = useMarket();
  const { success, error: toastError } = useToast();
  const api = getApiClient();

  const isEmailVerificationRequired = publicConfig?.emailVerificationRequired ?? false;
  const isEmailUnverified = isEmailVerificationRequired && Boolean(user && !user.emailVerified);

  const [walletTab, setWalletTab] = useState<'spot' | 'futures'>('spot');

  // Spot State
  const [balances, setBalances] = useState<Balances | null>(null);
  const [faucetStatus, setFaucetStatus] = useState<FaucetStatus | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerFilterAsset, setLedgerFilterAsset] = useState<string>('ALL');
  const [showOrderLocks, setShowOrderLocks] = useState(false);

  // Futures State
  const [futuresAccount, setFuturesAccount] = useState<FuturesAccount | null>(null);
  const [futuresLedgerEntries, setFuturesLedgerEntries] = useState<LedgerEntry[]>([]);
  const [showFuturesOrderLocks, setShowFuturesOrderLocks] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [faucetClaiming, setFaucetClaiming] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch Balances, Faucet, and Futures info
  const fetchWalletData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [balRes, fctRes, ldgRes, futAccRes, futLdgRes] = await Promise.all([
        api.balances(),
        api.faucetStatus(),
        api.ledger({ query: { limit: 50 } }),
        api.futuresAccount().catch(() => null),
        api.futuresLedger({ query: { hideLocks: showFuturesOrderLocks ? 'false' : 'true', limit: 50 } }).catch(() => null),
      ]);
      setBalances(balRes);
      setFaucetStatus(fctRes);
      setLedgerEntries(ldgRes.items);
      if (futAccRes) setFuturesAccount(futAccRes);
      if (futLdgRes) setFuturesLedgerEntries(futLdgRes.items);
    } catch {
      // Handled in UI
    } finally {
      setLoading(false);
    }
  }, [api, isAuthenticated, showFuturesOrderLocks]);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  // Realtime balance listener: update specific asset and debounced refetch total
  useEffect(() => {
    if (!realtimeClient || !isAuthenticated) return;

    const unsub = realtimeClient.subscribe('user', (event: unknown) => {
      const ev = event as {
        kind: string;
        balance?: Balance;
        asset?: string;
        available?: string;
        locked?: string;
        account?: FuturesAccount;
      };

      const b = ev.balance || (ev.asset ? {
        asset: ev.asset,
        available: ev.available || '0',
        locked: ev.locked || '0',
        total: (parseFloat(ev.available || '0') + parseFloat(ev.locked || '0')).toString(),
        valueUsdt: ev.asset === 'USDT' ? ev.available || '0' : null,
      } : null);

      if (ev.kind === 'balance' && b) {
        // Update local item row immediately
        setBalances((prev) => {
          if (!prev) {
            return {
              items: [b],
              totalValueUsdt: b.asset === 'USDT' ? b.available : '0',
              unpricedAssets: [],
            };
          }
          const exists = prev.items.some((item) => item.asset === b.asset);
          const updated = exists
            ? prev.items.map((item) => {
                if (item.asset === b.asset) {
                  return {
                    ...item,
                    available: b.available,
                    locked: b.locked ?? item.locked,
                    total: b.total ?? item.total,
                    valueUsdt: b.valueUsdt ?? item.valueUsdt,
                  };
                }
                return item;
              })
            : [...prev.items, b];
          return { ...prev, items: updated };
        });

        // Debounce 1s refetch balances to get accurate totalValueUsdt from server
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(async () => {
          try {
            const fresh = await api.balances();
            setBalances(fresh);
          } catch {}
        }, 1000);
      } else if (ev.kind === 'futuresAccount' && ev.account) {
        setFuturesAccount(ev.account);
      }
    });

    return () => {
      unsub();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [realtimeClient, isAuthenticated, api]);

  // Live countdown timer for Faucet cooldown
  useEffect(() => {
    if (!faucetStatus?.nextAvailableAt) {
      setCountdown(null);
      return;
    }

    const interval = setInterval(() => {
      const target = new Date(faucetStatus.nextAvailableAt!).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((target - now) / 1000));

      if (diff <= 0) {
        setCountdown(null);
        clearInterval(interval);
      } else {
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
        setCountdown(`${pad(h)}:${pad(m)}:${pad(s)}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [faucetStatus?.nextAvailableAt]);

  // Claim Faucet
  const handleClaimFaucet = async () => {
    setFaucetClaiming(true);
    try {
      const res = await api.faucetClaim();
      success(`Đã nạp thành công ${formatDecimal(res.claimed)} USDT tiền ảo vào ví!`);
      await fetchWalletData();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError(getErrorMessage(err.code));
      } else {
        toastError('Không thể thực hiện nạp tiền thử nghiệm.');
      }
    } finally {
      setFaucetClaiming(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <EmptyState
          title="Yêu cầu đăng nhập"
          description="Vui lòng đăng nhập để xem số dư tài sản và sử dụng tính năng nạp tiền thử nghiệm."
          action={
            <Button variant="primary" onClick={() => onNavigate('/login')}>
              Đăng nhập ngay
            </Button>
          }
        />
      </div>
    );
  }

  // Filter spot ledger entries
  const filteredLedger = ledgerEntries.filter((entry) => {
    if (ledgerFilterAsset !== 'ALL' && entry.asset !== ledgerFilterAsset) return false;
    if (!showOrderLocks && (entry.type === 'ORDER_LOCK' || entry.type === 'ORDER_UNLOCK')) return false;
    return true;
  });

  const ledgerTypeLabels: Record<string, { label: string; variant: 'info' | 'success' | 'warning' | 'error' | 'default' }> = {
    FAUCET: { label: 'Nạp thử nghiệm', variant: 'success' },
    ORDER_LOCK: { label: 'Khóa đặt lệnh', variant: 'warning' },
    ORDER_UNLOCK: { label: 'Mở khóa hủy lệnh', variant: 'info' },
    TRADE_DEBIT: { label: 'Khấu trừ khớp lệnh', variant: 'error' },
    TRADE_CREDIT: { label: 'Nhận tiền khớp lệnh', variant: 'success' },
    FEE: { label: 'Phí giao dịch', variant: 'default' },
    ADMIN_ADJUST: { label: 'Quản trị điều chỉnh', variant: 'info' },
    ACCOUNT_RESET: { label: 'Đặt lại tài khoản', variant: 'error' },
  };

  const futuresLedgerTypeLabels: Record<string, { label: string; variant: 'info' | 'success' | 'warning' | 'error' | 'default' | 'secondary' }> = {
    TRANSFER: { label: 'Chuyển tiền', variant: 'info' },
    ORDER_LOCK: { label: 'Khóa ký quỹ', variant: 'warning' },
    ORDER_UNLOCK: { label: 'Mở ký quỹ', variant: 'info' },
    FEE: { label: 'Phí', variant: 'default' },
    REALIZED_PNL: { label: 'Lãi lỗ đã chốt', variant: 'success' },
    FUNDING_FEE: { label: 'Funding', variant: 'secondary' },
    LIQUIDATION: { label: 'Thanh lý', variant: 'error' },
    MARGIN_ADJUST: { label: 'Điều chỉnh ký quỹ', variant: 'warning' },
  };

  const isPnlPositive = futuresAccount?.unrealizedPnl && !futuresAccount.unrealizedPnl.startsWith('-') && futuresAccount.unrealizedPnl !== '0';
  const isPnlNegative = futuresAccount?.unrealizedPnl && futuresAccount.unrealizedPnl.startsWith('-');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20 md:pb-6 space-y-6">
      {/* Top Tab Bar: Spot | Futures */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle,#1e212b)] pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWalletTab('spot')}
            className={`px-4 py-2 text-sm font-semibold rounded-[var(--radius-md,6px)] transition-colors cursor-pointer ${
              walletTab === 'spot'
                ? 'bg-[var(--color-bg-elevated,#1b1e27)] text-[var(--color-text-primary,#f3f4f6)] border border-[var(--color-border-default,#272a33)]'
                : 'text-[var(--color-text-secondary,#9ca3af)] hover:text-[var(--color-text-primary,#f3f4f6)]'
            }`}
          >
            Ví Giao ngay (Spot)
          </button>
          <button
            type="button"
            onClick={() => setWalletTab('futures')}
            className={`px-4 py-2 text-sm font-semibold rounded-[var(--radius-md,6px)] transition-colors cursor-pointer flex items-center gap-1.5 ${
              walletTab === 'futures'
                ? 'bg-[var(--color-bg-elevated,#1b1e27)] text-[var(--color-text-primary,#f3f4f6)] border border-[var(--color-border-default,#272a33)]'
                : 'text-[var(--color-text-secondary,#9ca3af)] hover:text-[var(--color-text-primary,#f3f4f6)]'
            }`}
          >
            <span>Ví Hợp đồng (Futures)</span>
            <Badge variant="outline" size="sm" className="text-[10px] text-[var(--color-accent-primary,#818cf8)] border-[var(--color-accent-primary,#818cf8)]/40 font-bold">
              Mô phỏng
            </Badge>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/api/v1/export/ledger.csv"
            download="ledger.csv"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-[var(--radius-sm,4px)] bg-transparent text-[var(--color-text-secondary,#9ca3af)] border border-[var(--color-border-default,#272a33)] hover:bg-[var(--color-bg-surface,#111319)] hover:text-white transition-colors"
            title="Xuất lịch sử sổ cái ra file CSV"
          >
            <Download size={13} />
            <span>Xuất CSV</span>
          </a>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('/assets/analysis')}
            className="flex items-center gap-1.5 text-xs font-semibold"
          >
            <BarChart2 size={13} />
            <span>Phân tích</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setTransferModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeftRight size={13} />
            <span>Chuyển tiền</span>
          </Button>
        </div>
      </div>

      {walletTab === 'spot' ? (
        <>
          {/* Page Header & Total Assets Card */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Total Assets Overview */}
            <Card variant="surface" className="lg:col-span-2 flex flex-col justify-between p-6">
              <div>
                <span className="text-xs font-semibold text-[var(--color-text-secondary,#9ca3af)] uppercase tracking-wider">
                  Tổng giá trị tài sản Spot ước tính
                </span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl sm:text-4xl font-extrabold font-mono text-[var(--color-text-primary,#f3f4f6)] tabular-nums">
                    {balances ? formatDecimal(balances.totalValueUsdt, { decimals: 2 }) : '—'}
                  </span>
                  <span className="text-base font-semibold text-[var(--color-accent-secondary,#67e8f9)]">
                    USDT
                  </span>
                </div>

                {/* Unpriced assets notification */}
                {balances && balances.unpricedAssets && balances.unpricedAssets.length > 0 && (
                  <p className="text-xs text-[var(--color-warning,#fbbf24)] mt-2">
                    * Chưa tính: {balances.unpricedAssets.join(', ')} (do tạm thời không có nguồn giá thị trường)
                  </p>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle,#1e212b)] flex items-center justify-between text-xs text-[var(--color-text-muted,#6b7280)]">
                <span>Tài khoản: {user?.name || user?.email}</span>
                <span>Trạng thái: {user?.emailVerified ? 'Đã xác minh' : 'Chưa xác minh'}</span>
              </div>
            </Card>

            {/* Faucet Testnet Card */}
            <Card variant="surface" className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-sm text-[var(--color-text-primary,#f3f4f6)]">
                    Nạp tiền thử nghiệm (Faucet)
                  </h3>
                  <Badge variant="secondary" size="sm">Mô phỏng</Badge>
                </div>
                <p className="text-xs text-[var(--color-text-secondary,#9ca3af)] leading-relaxed mb-4">
                  Nhận {faucetStatus ? formatDecimal(faucetStatus.amount) : '10.000'} USDT ảo để trải nghiệm giao dịch thực tế.
                </p>

                {faucetStatus && (
                  <div className="space-y-1 mb-4 text-xs font-mono">
                    <div className="flex justify-between text-[var(--color-text-muted,#6b7280)]">
                      <span>Đã nạp:</span>
                      <span className="text-[var(--color-text-primary,#f3f4f6)]">
                        {formatDecimal(faucetStatus.totalClaimed)} / {formatDecimal(faucetStatus.lifetimeCap)} USDT
                      </span>
                    </div>
                    <div className="w-full bg-[var(--color-bg-base,#08090c)] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[var(--color-accent-primary,#818cf8)] h-full transition-all"
                        style={{
                          width: `${Math.min(100, (parseFloat(faucetStatus.totalClaimed) / (parseFloat(faucetStatus.lifetimeCap) || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <Button
                variant="primary"
                fullWidth
                loading={faucetClaiming}
                disabled={!faucetStatus?.canClaim || !!countdown || isEmailUnverified}
                onClick={handleClaimFaucet}
                className="py-2.5 font-bold"
              >
                {isEmailUnverified
                  ? 'Xác minh email để nạp tiền'
                  : countdown
                  ? `Thời gian chờ: ${countdown}`
                  : 'Nạp ngay 10.000 USDT'}
              </Button>
            </Card>
          </div>

          {/* Balances Table */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-[var(--color-text-primary,#f3f4f6)]">
              Danh sách số dư tài sản Spot
            </h2>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} height={48} className="w-full" />
                ))}
              </div>
            ) : !balances ? (
              <EmptyState title="Không có tài sản" description="Ví của bạn hiện đang trống." />
            ) : (
              <div className="bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-subtle,#1e212b)] rounded-[var(--radius-lg,12px)] overflow-hidden shadow-xl">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tài sản</TableHead>
                      <TableHead className="text-right">Khả dụng</TableHead>
                      <TableHead className="text-right">Đang khóa</TableHead>
                      <TableHead className="text-right">Tổng số lượng</TableHead>
                      <TableHead className="text-right">Quy đổi USDT</TableHead>
                      <TableHead className="text-center">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const items = [...balances.items];
                      if (!items.some(i => i.asset === 'USDT')) {
                        items.unshift({ asset: 'USDT', available: '0', locked: '0', total: '0', valueUsdt: '0' });
                      }
                      return items.map((b) => (
                        <TableRow key={b.asset}>
                          <TableCell className="font-bold flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[var(--color-bg-elevated,#1b1e27)] flex items-center justify-center text-xs font-black text-[var(--color-accent-secondary,#67e8f9)]">
                              {b.asset.slice(0, 3)}
                            </span>
                            <span>{b.asset}</span>
                          </TableCell>
                          <TableCell data-testid={`spot-available-${b.asset}`} className="text-right font-mono tabular-nums text-[var(--color-buy,#22c55e)]">
                            {formatAmount(b.available)}
                          </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-[var(--color-text-muted,#6b7280)]">
                          {formatAmount(b.locked)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-semibold">
                          {formatAmount(b.total)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-[var(--color-text-secondary,#9ca3af)]">
                          {b.valueUsdt === null ? '—' : formatDecimal(b.valueUsdt, { decimals: 2 })}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            {b.asset === 'USDT' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setTransferModalOpen(true)}
                                className="text-xs text-[var(--color-accent-primary,#818cf8)]"
                              >
                                Chuyển Futures
                              </Button>
                            )}
                            {b.asset !== 'USDT' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onNavigate(`/trade/${b.asset}USDT`)}
                                className="text-xs text-[var(--color-accent-primary,#818cf8)]"
                              >
                                Giao dịch
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      ));
                    })()}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Ledger History */}
          <div className="space-y-3 pt-4 border-t border-[var(--color-border-subtle,#1e212b)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-base font-bold text-[var(--color-text-primary,#f3f4f6)]">
                Lịch sử biến động tài sản Spot (Sổ cái)
              </h2>

              <div className="flex items-center gap-3 text-xs">
                {/* Filter by Asset */}
                <select
                  value={ledgerFilterAsset}
                  onChange={(e) => setLedgerFilterAsset(e.target.value)}
                  className="bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-default,#272a33)] rounded-[var(--radius-sm,4px)] px-2.5 py-1 text-xs text-[var(--color-text-primary,#f3f4f6)] focus:outline-none"
                >
                  <option value="ALL">Tất cả tài sản</option>
                  {balances?.items.map((b) => (
                    <option key={b.asset} value={b.asset}>{b.asset}</option>
                  ))}
                </select>

                {/* Toggle show Order Lock/Unlock */}
                <label className="flex items-center gap-1.5 cursor-pointer select-none text-[var(--color-text-secondary,#9ca3af)]">
                  <input
                    type="checkbox"
                    checked={showOrderLocks}
                    onChange={(e) => setShowOrderLocks(e.target.checked)}
                    className="rounded border-[var(--color-border-default,#272a33)] text-[var(--color-accent-primary,#818cf8)]"
                  />
                  <span>Hiện khóa/mở khóa lệnh</span>
                </label>

                {/* Export CSV */}
                <a
                  href={`/api/v1/export/ledger.csv?${new URLSearchParams({
                    ...(ledgerFilterAsset !== 'ALL' ? { asset: ledgerFilterAsset } : {}),
                    hideLocks: showOrderLocks ? 'false' : 'true',
                  }).toString()}`}
                  download="ledger.csv"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-[var(--radius-sm,4px)] bg-[var(--color-bg-elevated,#1b1e27)] text-[var(--color-text-primary,#f3f4f6)] border border-[var(--color-border-default,#272a33)] hover:bg-[var(--color-border-default,#272a33)] transition-colors cursor-pointer"
                  title="Xuất dữ liệu sổ cái ra file CSV"
                >
                  <Download size={13} />
                  <span>Xuất CSV</span>
                </a>
              </div>
            </div>

            {filteredLedger.length === 0 ? (
              <EmptyState
                title="Chưa có lịch sử biến động"
                description="Các giao dịch nạp tiền hoặc khớp lệnh sẽ xuất hiện tại đây."
              />
            ) : (
              <div className="bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-subtle,#1e212b)] rounded-[var(--radius-lg,12px)] overflow-hidden shadow-xl">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thời gian</TableHead>
                      <TableHead>Loại biến động</TableHead>
                      <TableHead>Tài sản</TableHead>
                      <TableHead className="text-right">Thay đổi</TableHead>
                      <TableHead className="text-right">Số dư sau GD</TableHead>
                      <TableHead className="hidden md:table-cell">Mã tham chiếu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLedger.map((row) => {
                      const conf = ledgerTypeLabels[row.type] || { label: row.type, variant: 'default' };
                      const isPositive = !row.deltaAvailable.startsWith('-');

                      return (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs text-[var(--color-text-muted,#6b7280)] font-mono">
                            {new Date(row.createdAt).toLocaleString('vi-VN', { hour12: false })}
                          </TableCell>
                          <TableCell>
                            <Badge variant={conf.variant} size="sm">
                              {conf.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-bold">{row.asset}</TableCell>
                          <TableCell className={`text-right font-mono tabular-nums font-semibold ${isPositive ? 'text-[var(--color-buy,#22c55e)]' : 'text-[var(--color-sell,#f87171)]'}`}>
                            {isPositive ? `+${formatAmount(row.deltaAvailable)}` : formatAmount(row.deltaAvailable)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-[var(--color-text-secondary,#9ca3af)]">
                            {formatAmount(row.availableAfter)}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-[var(--color-text-muted,#6b7280)] hidden md:table-cell">
                            {row.refId ? `${row.refType || 'REF'}: ${row.refId.slice(0, 12)}...` : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Futures Tab Content */
        <div className="space-y-6">
          {/* Futures Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Wallet Balance */}
            <Card variant="surface" className="p-4 flex flex-col justify-between">
              <span className="text-[11px] font-semibold text-[var(--color-text-secondary,#9ca3af)] uppercase tracking-wider">
                Số dư ví
              </span>
              <div className="mt-2">
                <div className="text-lg md:text-xl font-bold font-mono text-white tabular-nums">
                  {futuresAccount ? formatDecimal(futuresAccount.walletBalance, { decimals: 2 }) : '—'}
                </div>
                <div className="text-[10px] text-[var(--color-text-muted,#6b7280)]">USDT</div>
              </div>
            </Card>

            {/* Available */}
            <Card variant="surface" className="p-4 flex flex-col justify-between">
              <span className="text-[11px] font-semibold text-[var(--color-text-secondary,#9ca3af)] uppercase tracking-wider">
                Khả dụng
              </span>
              <div className="mt-2">
                <div className="text-lg md:text-xl font-bold font-mono text-[var(--color-buy,#22c55e)] tabular-nums">
                  {futuresAccount ? formatDecimal(futuresAccount.available, { decimals: 2 }) : '—'}
                </div>
                <div className="text-[10px] text-[var(--color-text-muted,#6b7280)]">USDT</div>
              </div>
            </Card>

            {/* Position Margin */}
            <Card variant="surface" className="p-4 flex flex-col justify-between">
              <span className="text-[11px] font-semibold text-[var(--color-text-secondary,#9ca3af)] uppercase tracking-wider">
                Ký quỹ vị thế
              </span>
              <div className="mt-2">
                <div className="text-lg md:text-xl font-bold font-mono text-white tabular-nums">
                  {futuresAccount ? formatDecimal(futuresAccount.positionMargin, { decimals: 2 }) : '—'}
                </div>
                <div className="text-[10px] text-[var(--color-text-muted,#6b7280)]">USDT</div>
              </div>
            </Card>

            {/* Order Margin */}
            <Card variant="surface" className="p-4 flex flex-col justify-between">
              <span className="text-[11px] font-semibold text-[var(--color-text-secondary,#9ca3af)] uppercase tracking-wider">
                Ký quỹ lệnh
              </span>
              <div className="mt-2">
                <div className="text-lg md:text-xl font-bold font-mono text-[var(--color-text-muted,#6b7280)] tabular-nums">
                  {futuresAccount ? formatDecimal(futuresAccount.orderMargin, { decimals: 2 }) : '—'}
                </div>
                <div className="text-[10px] text-[var(--color-text-muted,#6b7280)]">USDT</div>
              </div>
            </Card>

            {/* Unrealized PnL */}
            <Card variant="surface" className="p-4 flex flex-col justify-between">
              <span className="text-[11px] font-semibold text-[var(--color-text-secondary,#9ca3af)] uppercase tracking-wider">
                Lãi lỗ chưa chốt
              </span>
              <div className="mt-2">
                <div className={`text-lg md:text-xl font-bold font-mono tabular-nums ${
                  isPnlPositive ? 'text-[var(--color-buy,#22c55e)]' : isPnlNegative ? 'text-[var(--color-sell,#f87171)]' : 'text-white'
                }`}>
                  {!futuresAccount || futuresAccount.unrealizedPnl === null
                    ? '—'
                    : `${isPnlPositive ? '+' : ''}${formatDecimal(futuresAccount.unrealizedPnl, { decimals: 2 })}`}
                </div>
                <div className="text-[10px] text-[var(--color-text-muted,#6b7280)]">USDT</div>
              </div>
            </Card>

            {/* Equity */}
            <Card variant="surface" className="p-4 flex flex-col justify-between border-l-2 border-l-[var(--color-accent-primary,#818cf8)]">
              <span className="text-[11px] font-semibold text-[var(--color-accent-primary,#818cf8)] uppercase tracking-wider">
                Vốn chủ sở hữu
              </span>
              <div className="mt-2">
                <div className="text-lg md:text-xl font-bold font-mono text-white tabular-nums">
                  {!futuresAccount || futuresAccount.equity === null ? '—' : formatDecimal(futuresAccount.equity, { decimals: 2 })}
                </div>
                <div className="text-[10px] text-[var(--color-text-muted,#6b7280)]">USDT</div>
              </div>
            </Card>
          </div>

          {/* Quick Actions & Position Summary Banner */}
          <div className="p-4 rounded-[var(--radius-lg,12px)] bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-subtle,#1e212b)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--color-accent-primary,#818cf8)]/10 flex items-center justify-center text-[var(--color-accent-primary,#818cf8)]">
                <TrendingUp size={16} />
              </div>
              <div>
                <div className="text-sm font-bold text-white">
                  Đang mở {futuresAccount?.openPositions ?? 0} vị thế Futures
                </div>
                <div className="text-xs text-[var(--color-text-muted,#6b7280)]">
                  Chế độ ký quỹ cô lập (Isolated), đòn bẩy tối đa 20×
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                onClick={() => setTransferModalOpen(true)}
                className="flex items-center gap-1.5 font-bold"
              >
                <ArrowLeftRight size={14} />
                <span>Chuyển tiền</span>
              </Button>
              <Button
                variant="secondary"
                onClick={() => onNavigate('/futures/BTCUSDT')}
                className="flex items-center gap-1.5 font-bold"
              >
                <ArrowUpRight size={14} />
                <span>Giao dịch Futures</span>
              </Button>
            </div>
          </div>

          {/* Futures Ledger History */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[var(--color-text-primary,#f3f4f6)]">
                  Lịch sử biến động Futures (Sổ cái)
                </h2>
                <p className="text-xs text-[var(--color-text-secondary,#9ca3af)]">
                  Theo dõi biến động chuyển tiền, nạp/rút ký quỹ, phí giao dịch và lãi lỗ
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                {/* Toggle show Order Lock/Unlock */}
                <label className="flex items-center gap-1.5 cursor-pointer select-none text-[var(--color-text-secondary,#9ca3af)]">
                  <input
                    type="checkbox"
                    checked={showFuturesOrderLocks}
                    onChange={(e) => setShowFuturesOrderLocks(e.target.checked)}
                    className="rounded border-[var(--color-border-default,#272a33)] text-[var(--color-accent-primary,#818cf8)]"
                  />
                  <span>Hiện khóa/mở ký quỹ lệnh</span>
                </label>

                {/* Export CSV for Futures */}
                <a
                  href={`/api/v1/export/ledger.csv?${new URLSearchParams({
                    hideLocks: showFuturesOrderLocks ? 'false' : 'true',
                  }).toString()}`}
                  download="futures-ledger.csv"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-[var(--radius-sm,4px)] bg-[var(--color-bg-elevated,#1b1e27)] text-[var(--color-text-primary,#f3f4f6)] border border-[var(--color-border-default,#272a33)] hover:bg-[var(--color-border-default,#272a33)] transition-colors cursor-pointer"
                  title="Xuất dữ liệu sổ cái Futures ra file CSV"
                >
                  <Download size={13} />
                  <span>Xuất CSV</span>
                </a>
              </div>
            </div>

            {futuresLedgerEntries.length === 0 ? (
              <EmptyState
                title="Chưa có lịch sử biến động Futures"
                description="Các giao dịch chuyển tiền vào ví hoặc mở/đóng vị thế sẽ xuất hiện tại đây."
              />
            ) : (
              <div className="bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-subtle,#1e212b)] rounded-[var(--radius-lg,12px)] overflow-hidden shadow-xl">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thời gian</TableHead>
                      <TableHead>Loại biến động</TableHead>
                      <TableHead>Tài sản</TableHead>
                      <TableHead className="text-right">Thay đổi</TableHead>
                      <TableHead className="text-right">Số dư sau GD</TableHead>
                      <TableHead className="hidden md:table-cell">Mã tham chiếu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {futuresLedgerEntries.map((row) => {
                      const conf = futuresLedgerTypeLabels[row.type] || { label: row.type, variant: 'default' };
                      const isPositive = !row.deltaAvailable.startsWith('-');

                      return (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs text-[var(--color-text-muted,#6b7280)] font-mono">
                            {new Date(row.createdAt).toLocaleString('vi-VN', { hour12: false })}
                          </TableCell>
                          <TableCell>
                            <Badge variant={conf.variant} size="sm">
                              {conf.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-bold">{row.asset}</TableCell>
                          <TableCell className={`text-right font-mono tabular-nums font-semibold ${isPositive ? 'text-[var(--color-buy,#22c55e)]' : 'text-[var(--color-sell,#f87171)]'}`}>
                            {isPositive ? `+${formatAmount(row.deltaAvailable)}` : formatAmount(row.deltaAvailable)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-[var(--color-text-secondary,#9ca3af)]">
                            {formatAmount(row.availableAfter)}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-[var(--color-text-muted,#6b7280)] hidden md:table-cell">
                            {row.refId ? `${row.refType || 'REF'}: ${row.refId.slice(0, 12)}...` : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      <FuturesTransferModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        onTransferred={fetchWalletData}
      />
    </div>
  );
};
