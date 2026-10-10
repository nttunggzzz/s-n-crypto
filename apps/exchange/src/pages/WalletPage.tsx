import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Balances, FaucetStatus, LedgerEntry } from '@cex/contracts';
import { ApiError } from '@cex/contracts';
import { getApiClient } from '../services/api.ts';
import { getErrorMessage } from '../services/errors.ts';
import { useAuth } from '../context/AuthContext.tsx';
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

export interface WalletPageProps {
  onNavigate: (path: string) => void;
}

export const WalletPage: React.FC<WalletPageProps> = ({ onNavigate }) => {
  const { isAuthenticated, user } = useAuth();
  const { realtimeClient } = useMarket();
  const { success, error: toastError } = useToast();
  const api = getApiClient();

  const [balances, setBalances] = useState<Balances | null>(null);
  const [faucetStatus, setFaucetStatus] = useState<FaucetStatus | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerFilterAsset, setLedgerFilterAsset] = useState<string>('ALL');
  const [showOrderLocks, setShowOrderLocks] = useState(false);

  const [loading, setLoading] = useState(true);
  const [faucetClaiming, setFaucetClaiming] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch Balances and Faucet info
  const fetchWalletData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [balRes, fctRes, ldgRes] = await Promise.all([
        api.balances(),
        api.faucetStatus(),
        api.ledger({ query: { limit: 50 } }),
      ]);
      setBalances(balRes);
      setFaucetStatus(fctRes);
      setLedgerEntries(ldgRes.items);
    } catch {
      // Handled in UI
    } finally {
      setLoading(false);
    }
  }, [api, isAuthenticated]);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  // Realtime balance listener: update specific asset and debounced refetch total
  useEffect(() => {
    if (!realtimeClient || !isAuthenticated) return;

    const unsub = realtimeClient.subscribe('user', (event: unknown) => {
      const ev = event as { kind: string; asset?: string; available?: string; locked?: string };
      if (ev.kind === 'balance' && ev.asset) {
        // Update local item row immediately
        setBalances((prev) => {
          if (!prev) return prev;
          const updated = prev.items.map((item) => {
            if (item.asset === ev.asset) {
              return {
                ...item,
                available: ev.available || item.available,
                locked: ev.locked || item.locked,
              };
            }
            return item;
          });
          return { ...prev, items: updated };
        });

        // Debounce 1s refetch balances to get accurate totalValueUsdt from server
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(async () => {
          try {
            const b = await api.balances();
            setBalances(b);
          } catch {}
        }, 1000);
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

  // Filter ledger entries
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20 md:pb-6 space-y-6">
      {/* Page Header & Total Assets Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Total Assets Overview */}
        <Card variant="surface" className="lg:col-span-2 flex flex-col justify-between p-6">
          <div>
            <span className="text-xs font-semibold text-[var(--color-text-secondary,#9ca3af)] uppercase tracking-wider">
              Tổng giá trị tài sản ước tính
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
            disabled={!faucetStatus?.canClaim || !!countdown || Boolean(user && !user.emailVerified)}
            onClick={handleClaimFaucet}
            className="py-2.5 font-bold"
          >
            {user && !user.emailVerified
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
          Danh sách số dư tài sản
        </h2>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height={48} className="w-full" />
            ))}
          </div>
        ) : !balances || balances.items.length === 0 ? (
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
                {balances.items.map((b) => (
                  <TableRow key={b.asset}>
                    <TableCell className="font-bold flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[var(--color-bg-elevated,#1b1e27)] flex items-center justify-center text-xs font-black text-[var(--color-accent-secondary,#67e8f9)]">
                        {b.asset.slice(0, 3)}
                      </span>
                      <span>{b.asset}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-[var(--color-buy,#22c55e)]">
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Ledger History */}
      <div className="space-y-3 pt-4 border-t border-[var(--color-border-subtle,#1e212b)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[var(--color-text-primary,#f3f4f6)]">
            Lịch sử biến động tài sản (Sổ cái)
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
    </div>
  );
};
