import React, { useState, useEffect, useCallback } from 'react';
import type { Order, Trade } from '@cex/contracts';
import { getApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useMarket } from '../../context/MarketContext.tsx';
import {
  Tabs,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  OrderStatusBadge,
  SideTag,
  Button,
  Modal,
  Skeleton,
  EmptyState,
  useToast,
  formatDecimal,
} from '@cex/ui';

export interface UserOrdersTabsProps {
  symbol: string;
  refreshTrigger?: number;
}

export const UserOrdersTabs: React.FC<UserOrdersTabsProps> = ({
  symbol,
  refreshTrigger,
}) => {
  const { isAuthenticated } = useAuth();
  const { realtimeClient } = useMarket();
  const { success, error: toastError } = useToast();
  const api = getApiClient();

  const [activeTab, setActiveTab] = useState<'open' | 'history' | 'trades'>('open');
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [myTrades, setMyTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  // Load orders data
  const fetchData = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const [openRes, histRes, tradesRes] = await Promise.all([
        api.openOrders({ query: { symbol } }),
        api.orderHistory({ query: { symbol, limit: 30 } }),
        api.myTrades({ query: { symbol, limit: 30 } }),
      ]);
      setOpenOrders(openRes.items);
      setOrderHistory(histRes.items);
      setMyTrades(tradesRes.items);
    } catch {
      // Ignore initial errors
    } finally {
      setLoading(false);
    }
  }, [api, isAuthenticated, symbol]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  // Subscribe to realtime `user` channel for immediate order & trade updates
  useEffect(() => {
    if (!realtimeClient || !isAuthenticated) return;

    const unsub = realtimeClient.subscribe('user', (event: unknown) => {
      const ev = event as { kind: string; order?: Order; trade?: Trade };
      if (ev.kind === 'order' && ev.order) {
        const ord = ev.order;
        if (ord.status === 'NEW' || ord.status === 'PARTIALLY_FILLED') {
          setOpenOrders((prev) => {
            const exists = prev.some((o) => o.id === ord.id);
            if (exists) return prev.map((o) => (o.id === ord.id ? ord : o));
            return [ord, ...prev];
          });
        } else {
          // FILLED, CANCELED, REJECTED
          setOpenOrders((prev) => prev.filter((o) => o.id !== ord.id));
          setOrderHistory((prev) => [ord, ...prev]);
        }
      } else if (ev.kind === 'trade' && ev.trade) {
        setMyTrades((prev) => [ev.trade!, ...prev]);
        success(`Lệnh đã khớp: ${ev.trade.quantity} @ ${ev.trade.price}`);
      }
    });

    return () => unsub();
  }, [realtimeClient, isAuthenticated, success]);

  // Cancel single order
  const handleCancelOrder = async (orderId: string) => {
    setCancelingId(orderId);
    try {
      await api.cancelOrder({ params: { orderId } });
      setOpenOrders((prev) => prev.filter((o) => o.id !== orderId));
      success('Đã hủy lệnh thành công.');
    } catch {
      toastError('Không thể hủy lệnh này.');
    } finally {
      setCancelingId(null);
    }
  };

  // Cancel all open orders for this symbol
  const handleCancelAll = async () => {
    try {
      await api.cancelAllOrders({ query: { symbol } });
      setOpenOrders([]);
      success('Đã hủy toàn bộ lệnh đang chờ của cặp tiền này.');
      setCancelModalOpen(false);
    } catch {
      toastError('Không thể hủy tất cả lệnh.');
    }
  };

  const tabs = [
    {
      id: 'open',
      label: 'Lệnh đang chờ',
      badge: openOrders.length > 0 ? (
        <span className="ml-1 px-1.5 py-0.2 rounded-full bg-[var(--color-accent-primary,#818cf8)] text-white text-[10px]">
          {openOrders.length}
        </span>
      ) : null,
    },
    { id: 'history', label: 'Lịch sử lệnh' },
    { id: 'trades', label: 'Lịch sử khớp lệnh' },
  ];

  return (
    <div className="flex flex-col bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-subtle,#1e212b)] rounded-[var(--radius-lg,12px)] overflow-hidden">
      {/* Tabs bar */}
      <div className="px-4 py-2 border-b border-[var(--color-border-subtle,#1e212b)] flex items-center justify-between">
        <Tabs
          tabs={tabs}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as 'open' | 'history' | 'trades')}
          variant="underline"
          size="sm"
        />

        {activeTab === 'open' && openOrders.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCancelModalOpen(true)}
            className="text-xs text-[var(--color-sell,#f87171)] hover:bg-[var(--color-sell-bg,rgba(248,113,113,0.12))]"
          >
            Hủy tất cả lệnh
          </Button>
        )}
      </div>

      {/* Tab Panels */}
      <div className="p-2 min-h-[160px] overflow-x-auto">
        {!isAuthenticated ? (
          <EmptyState
            title="Chưa đăng nhập"
            description="Đăng nhập để xem danh sách lệnh và lịch sử giao dịch của bạn."
          />
        ) : loading && openOrders.length === 0 && orderHistory.length === 0 ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height={36} className="w-full" />
            ))}
          </div>
        ) : activeTab === 'open' ? (
          /* OPEN ORDERS TABLE */
          openOrders.length === 0 ? (
            <EmptyState
              title="Không có lệnh đang chờ"
              description="Bạn hiện không có lệnh giới hạn nào đang chờ khớp."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Cặp</TableHead>
                  <TableHead>Loại / Phe</TableHead>
                  <TableHead className="text-right">Giá đặt</TableHead>
                  <TableHead className="text-right">Khối lượng</TableHead>
                  <TableHead className="text-right">Đã khớp</TableHead>
                  <TableHead className="text-center">Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openOrders.map((ord) => (
                  <TableRow key={ord.id}>
                    <TableCell className="text-xs text-[var(--color-text-muted,#6b7280)] font-mono">
                      {new Date(ord.createdAt).toLocaleTimeString('vi-VN', { hour12: false })}
                    </TableCell>
                    <TableCell className="font-bold">{ord.symbol}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <SideTag side={ord.side} />
                        <span className="text-xs text-[var(--color-text-secondary,#9ca3af)]">{ord.type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {ord.price ? formatDecimal(ord.price) : 'Thị trường'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatDecimal(ord.quantity)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[var(--color-text-secondary,#9ca3af)]">
                      {formatDecimal(ord.executedQty)}
                    </TableCell>
                    <TableCell className="text-center">
                      <OrderStatusBadge status={ord.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={cancelingId === ord.id}
                        onClick={() => handleCancelOrder(ord.id)}
                        className="text-[var(--color-sell,#f87171)] hover:bg-[var(--color-sell-bg,rgba(248,113,113,0.12))] text-xs px-2 py-1"
                      >
                        Hủy
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        ) : activeTab === 'history' ? (
          /* ORDER HISTORY TABLE */
          orderHistory.length === 0 ? (
            <EmptyState
              title="Chưa có lịch sử lệnh"
              description="Các lệnh đã hoàn tất hoặc bị hủy sẽ xuất hiện tại đây."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Cặp</TableHead>
                  <TableHead>Loại / Phe</TableHead>
                  <TableHead className="text-right">Giá đặt / Giá TB</TableHead>
                  <TableHead className="text-right">Khối lượng</TableHead>
                  <TableHead className="text-right">Đã khớp</TableHead>
                  <TableHead className="text-center">Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderHistory.map((ord) => (
                  <TableRow key={ord.id}>
                    <TableCell className="text-xs text-[var(--color-text-muted,#6b7280)] font-mono">
                      {new Date(ord.createdAt).toLocaleString('vi-VN', { hour12: false })}
                    </TableCell>
                    <TableCell className="font-bold">{ord.symbol}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <SideTag side={ord.side} />
                        <span className="text-xs text-[var(--color-text-secondary,#9ca3af)]">{ord.type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {ord.avgPrice ? formatDecimal(ord.avgPrice) : ord.price ? formatDecimal(ord.price) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatDecimal(ord.quantity)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatDecimal(ord.executedQty)}
                    </TableCell>
                    <TableCell className="text-center">
                      <OrderStatusBadge status={ord.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        ) : (
          /* MY TRADES TABLE */
          myTrades.length === 0 ? (
            <EmptyState
              title="Chưa có giao dịch khớp lệnh"
              description="Lịch sử các giao dịch đã khớp của bạn sẽ hiển thị tại đây."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Cặp</TableHead>
                  <TableHead>Phe</TableHead>
                  <TableHead className="text-right">Giá khớp</TableHead>
                  <TableHead className="text-right">Khối lượng</TableHead>
                  <TableHead className="text-right">Phí giao dịch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myTrades.map((tr) => (
                  <TableRow key={tr.id}>
                    <TableCell className="text-xs text-[var(--color-text-muted,#6b7280)] font-mono">
                      {new Date(tr.createdAt).toLocaleString('vi-VN', { hour12: false })}
                    </TableCell>
                    <TableCell className="font-bold">{tr.symbol}</TableCell>
                    <TableCell>
                      <SideTag side={tr.side} />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatDecimal(tr.price)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatDecimal(tr.quantity)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-[var(--color-text-secondary,#9ca3af)]">
                      {formatDecimal(tr.fee)} {tr.feeAsset}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        )}
      </div>

      {/* Confirmation Modal for Cancel All */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Xác nhận hủy toàn bộ lệnh"
      >
        <p className="text-sm text-[var(--color-text-secondary,#9ca3af)] mb-6">
          Bạn có chắc chắn muốn hủy toàn bộ {openOrders.length} lệnh đang chờ của cặp {symbol}? Hành động này không thể hoàn tác.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setCancelModalOpen(false)}>
            Đóng
          </Button>
          <Button variant="danger" onClick={handleCancelAll}>
            Xác nhận hủy tất cả
          </Button>
        </div>
      </Modal>
    </div>
  );
};
