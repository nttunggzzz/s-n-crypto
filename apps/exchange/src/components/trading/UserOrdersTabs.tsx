import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Order, Trade, OrderList } from '@cex/contracts';
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
  Badge,
  useToast,
  formatDecimal,
  formatPrice,
  formatAmount,
} from '@cex/ui';
import { Download, AlertCircle, CheckCircle2, Clock, XCircle, ArrowRight } from 'lucide-react';

export interface UserOrdersTabsProps {
  symbol: string;
  refreshTrigger?: number;
}

export const UserOrdersTabs: React.FC<UserOrdersTabsProps> = ({
  symbol,
  refreshTrigger,
}) => {
  const { isAuthenticated } = useAuth();
  const { realtimeClient, symbols } = useMarket();
  const { success, error: toastError } = useToast();
  const api = getApiClient();

  const symbolMap = useMemo(() => {
    const map = new Map<string, { tickSize?: string; stepSize?: string }>();
    symbols?.forEach((s) => map.set(s.symbol, { tickSize: s.tickSize, stepSize: s.stepSize }));
    return map;
  }, [symbols]);

  const [activeTab, setActiveTab] = useState<'open' | 'history' | 'trades'>('open');
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [openOrderLists, setOpenOrderLists] = useState<OrderList[]>([]);
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [myTrades, setMyTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [cancelingListId, setCancelingListId] = useState<string | null>(null);
  const [hideOtherPairs, setHideOtherPairs] = useState(true);

  // Date filters for history
  const [dateFilter, setDateFilter] = useState<'all' | '1d' | '7d' | '30d'>('all');

  const filterParams = useMemo(() => {
    const params: { symbol?: string; from?: string; to?: string } = {};
    if (hideOtherPairs) params.symbol = symbol;

    if (dateFilter !== 'all') {
      const now = new Date();
      let past = new Date();
      if (dateFilter === '1d') past.setDate(now.getDate() - 1);
      if (dateFilter === '7d') past.setDate(now.getDate() - 7);
      if (dateFilter === '30d') past.setDate(now.getDate() - 30);
      params.from = past.toISOString();
      params.to = now.toISOString();
    }
    return params;
  }, [hideOtherPairs, symbol, dateFilter]);

  const exportQuery = useMemo(() => {
    const sp = new URLSearchParams();
    if (filterParams.symbol) sp.set('symbol', filterParams.symbol);
    if (filterParams.from) sp.set('from', filterParams.from);
    if (filterParams.to) sp.set('to', filterParams.to);
    return sp.toString();
  }, [filterParams]);

  // Load orders data
  const fetchData = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const symbolQuery = hideOtherPairs ? { symbol } : {};
      const [openRes, listsRes, histRes, tradesRes] = await Promise.all([
        api.openOrders({ query: symbolQuery }),
        api.openOrderLists({ query: symbolQuery }).catch(() => ({ items: [] })),
        api.orderHistory({ query: { ...filterParams, limit: 50 } }),
        api.myTrades({ query: { ...filterParams, limit: 50 } }),
      ]);
      setOpenOrders(openRes.items);
      setOpenOrderLists(listsRes.items);
      setOrderHistory(histRes.items);
      setMyTrades(tradesRes.items);
    } catch {
      // Ignore initial errors
    } finally {
      setLoading(false);
    }
  }, [api, isAuthenticated, hideOtherPairs, symbol, filterParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  // Subscribe to realtime `user` channel for immediate order & trade updates
  useEffect(() => {
    if (!realtimeClient || !isAuthenticated) return;

    const unsub = realtimeClient.subscribe('user', (event: unknown) => {
      const ev = event as { kind: string; order?: Order; trade?: Trade; orderList?: OrderList };

      if (ev.kind === 'orderList' && ev.orderList) {
        const list = ev.orderList;
        if (list.listStatus === 'EXECUTING') {
          setOpenOrderLists((prev) => {
            const exists = prev.some((l) => l.id === list.id);
            if (exists) return prev.map((l) => (l.id === list.id ? list : l));
            return [list, ...prev];
          });
        } else {
          setOpenOrderLists((prev) => prev.filter((l) => l.id !== list.id));
        }
      } else if (ev.kind === 'order' && ev.order) {
        const ord = ev.order;
        if (ord.status === 'NEW' || ord.status === 'PARTIALLY_FILLED') {
          setOpenOrders((prev) => {
            const exists = prev.some((o) => o.id === ord.id);
            if (exists) return prev.map((o) => (o.id === ord.id ? ord : o));
            return [ord, ...prev];
          });
        } else {
          // FILLED, CANCELED, REJECTED, EXPIRED
          setOpenOrders((prev) => prev.filter((o) => o.id !== ord.id));
          setOrderHistory((prev) => {
            const exists = prev.some((o) => o.id === ord.id);
            if (exists) return prev.map((o) => (o.id === ord.id ? ord : o));
            return [ord, ...prev];
          });
        }
      } else if (ev.kind === 'trade' && ev.trade) {
        setMyTrades((prev) => [ev.trade!, ...prev]);
        const tr = ev.trade;
        const sym = symbols?.find((s) => s.symbol === tr.symbol);
        const formattedQty = sym ? formatAmount(tr.quantity, sym.stepSize) : tr.quantity;
        const formattedPrice = sym ? formatPrice(tr.price, sym.tickSize) : tr.price;
        const sideText = tr.side === 'BUY' ? 'Mua' : 'Bán';
        const base = sym?.baseAsset ? ` ${sym.baseAsset}` : '';
        success(`Khớp lệnh ${sideText}: ${formattedQty}${base} @ ${formattedPrice}`);
      }
    });

    return () => unsub();
  }, [realtimeClient, isAuthenticated, success, symbols]);

  // Cancel single order
  const handleCancelOrder = async (orderId: string) => {
    setCancelingId(orderId);
    try {
      await api.cancelOrder({ params: { orderId } });
      setOpenOrders((prev) => prev.filter((o) => o.id !== orderId));
      success('Đã hủy lệnh thành công.');
      window.dispatchEvent(new CustomEvent('cex:balance-refresh'));
    } catch {
      toastError('Không thể hủy lệnh này.');
    } finally {
      setCancelingId(null);
    }
  };

  // Cancel OCO Order List
  const handleCancelOrderList = async (listId: string) => {
    setCancelingListId(listId);
    try {
      await api.cancelOrderList({ params: { listId } });
      setOpenOrderLists((prev) => prev.filter((l) => l.id !== listId));
      setOpenOrders((prev) => prev.filter((o) => o.orderListId !== listId));
      success('Đã hủy cặp lệnh OCO thành công.');
      window.dispatchEvent(new CustomEvent('cex:balance-refresh'));
    } catch {
      toastError('Không thể hủy danh sách lệnh OCO.');
    } finally {
      setCancelingListId(null);
    }
  };

  // Cancel all open orders for this symbol
  const handleCancelAll = async () => {
    try {
      await api.cancelAllOrders({ query: { symbol } });
      setOpenOrders([]);
      setOpenOrderLists((prev) => prev.filter((l) => l.symbol !== symbol));
      success('Đã hủy toàn bộ lệnh đang chờ của cặp tiền này.');
      window.dispatchEvent(new CustomEvent('cex:balance-refresh'));
      setCancelModalOpen(false);
    } catch {
      toastError('Không thể hủy tất cả lệnh.');
    }
  };

  // Map closeReason to human-readable Vietnamese
  const formatCloseReason = (reason: string | null) => {
    if (!reason) return '—';
    const map: Record<string, string> = {
      USER_CANCELED: 'Bạn hủy',
      OCO_SIBLING: 'Hủy do chân OCO',
      EXPIRED_REMAINDER: 'Hết hạn phần dư',
      ADMIN: 'Admin hủy',
      HALTED: 'Sàn tạm dừng',
      INSUFFICIENT_BALANCE: 'Số dư không đủ',
      BOT_STOPPED: 'Bot đã dừng',
    };
    return map[reason] || reason;
  };

  // Standalone open orders not belonging to open OCO lists
  const standaloneOpenOrders = useMemo(() => {
    const activeOcoIds = new Set(openOrderLists.map((l) => l.id));
    return openOrders.filter((o) => !o.orderListId || !activeOcoIds.has(o.orderListId));
  }, [openOrders, openOrderLists]);

  const hasBotOrders = useMemo(() => {
    return openOrders.some((o) => o.source && o.source !== 'USER');
  }, [openOrders]);

  const totalOpenCount = standaloneOpenOrders.length + openOrderLists.length;

  const tabs = [
    {
      id: 'open',
      label: 'Lệnh đang chờ',
      badge: totalOpenCount > 0 ? (
        <span className="ml-1 px-1.5 py-0.2 rounded-full bg-[var(--accent,#818cf8)] text-[var(--panel,#0a0a0b)] font-bold text-[10px]">
          {totalOpenCount}
        </span>
      ) : null,
    },
    { id: 'history', label: 'Lịch sử lệnh' },
    { id: 'trades', label: 'Lịch sử khớp' },
  ];

  return (
    <div className="flex flex-col bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,10px)] overflow-hidden text-xs">
      {/* Tabs bar */}
      <div className="px-4 py-1 border-b border-[var(--line,#1d1e21)] flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={tabs}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as 'open' | 'history' | 'trades')}
          variant="underline"
          size="sm"
        />

        <div className="flex items-center gap-4">
          {/* Quick Date Range Filter for history tabs */}
          {activeTab !== 'open' && (
            <div className="flex items-center gap-1 bg-[var(--panel-2,#141416)] p-0.5 rounded border border-[var(--line,#1d1e21)]">
              {(['all', '1d', '7d', '30d'] as const).map((r) => (
                <button
                  key={r}
                  aria-label={`Lọc ${r === 'all' ? 'tất cả thời gian' : r}`}
                  onClick={() => setDateFilter(r)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                    dateFilter === r ? 'bg-[var(--accent,#818cf8)] text-black' : 'text-[var(--text-3,#63636b)] hover:text-white'
                  }`}
                >
                  {r === 'all' ? 'Tất cả' : r}
                </button>
              ))}
            </div>
          )}

          {/* Hide Other Pairs checkbox */}
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]">
            <input
              type="checkbox"
              checked={hideOtherPairs}
              onChange={(e) => setHideOtherPairs(e.target.checked)}
              className="accent-[var(--accent,#818cf8)]"
            />
            Ẩn cặp khác
          </label>

          {/* CSV Export links */}
          {activeTab === 'history' && (
            <a
              href={`/api/v1/export/orders.csv?${exportQuery}`}
              download="orders.csv"
              className="flex items-center gap-1 text-[11px] text-[var(--text-2,#a1a1aa)] hover:text-[var(--accent,#818cf8)] bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] px-2 py-1 rounded"
              title="Xuất file CSV lịch sử lệnh"
            >
              <Download size={12} />
              <span>Xuất CSV</span>
            </a>
          )}

          {activeTab === 'trades' && (
            <a
              href={`/api/v1/export/trades.csv?${exportQuery}`}
              download="trades.csv"
              className="flex items-center gap-1 text-[11px] text-[var(--text-2,#a1a1aa)] hover:text-[var(--accent,#818cf8)] bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] px-2 py-1 rounded"
              title="Xuất file CSV lịch sử khớp"
            >
              <Download size={12} />
              <span>Xuất CSV</span>
            </a>
          )}

          {/* Cancel all button for open tab */}
          {activeTab === 'open' && totalOpenCount > 0 && (
            <button
              onClick={() => setCancelModalOpen(true)}
              aria-label={hasBotOrders ? 'Hủy tất cả (trừ lệnh bot)' : 'Hủy tất cả'}
              className="text-xs text-[var(--text-3,#63636b)] hover:text-[var(--text,#f4f4f5)] bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] px-2 py-1 rounded cursor-pointer"
            >
              {hasBotOrders ? 'Hủy tất cả (trừ lệnh bot)' : 'Hủy tất cả'}
            </button>
          )}
        </div>
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
          /* OPEN ORDERS & OCO TABLE */
          totalOpenCount === 0 ? (
            <EmptyState
              title="Không có lệnh đang chờ"
              description="Bạn hiện không có lệnh giới hạn hay lệnh điều kiện nào đang chờ khớp."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Cặp</TableHead>
                  <TableHead>Loại / Phe</TableHead>
                  <TableHead className="text-right">Giá đặt / Điều kiện</TableHead>
                  <TableHead className="text-right">Khối lượng</TableHead>
                  <TableHead className="text-right">Đã khớp</TableHead>
                  <TableHead className="text-center">Kích hoạt</TableHead>
                  <TableHead className="text-center">Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* 1. RENDER GROUPED OCO ORDERS */}
                {openOrderLists.map((list) => {
                  const symInfo = symbolMap.get(list.symbol);
                  const limitLeg = list.orders.find((o) => o.type === 'LIMIT');
                  const stopLeg = list.orders.find((o) => o.type === 'STOP_LIMIT' || o.type === 'STOP_MARKET');
                  return (
                    <TableRow key={list.id} data-testid="open-order-row" className="bg-[var(--accent,#818cf8)]/5 border-l-2 border-l-[var(--accent,#818cf8)]">
                      <TableCell className="text-xs text-[var(--color-text-muted,#6b7280)] font-mono">
                        {new Date(list.createdAt).toLocaleTimeString('vi-VN', { hour12: false })}
                      </TableCell>
                      <TableCell className="font-bold">{list.symbol}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <SideTag side={list.side} />
                          <Badge variant="outline" size="sm" className="border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]">
                            OCO
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <div>TP: <span className="text-[var(--color-buy,#22c55e)] font-bold">{limitLeg?.price ? formatPrice(limitLeg.price, symInfo?.tickSize) : '—'}</span></div>
                        <div className="text-[10px] text-[var(--color-text-muted,#6b7280)]">
                          SL: Stop {stopLeg?.stopPrice ? formatPrice(stopLeg.stopPrice, symInfo?.tickSize) : '—'} {stopLeg?.price ? `-> Limit ${formatPrice(stopLeg.price, symInfo?.tickSize)}` : ''}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatAmount(limitLeg?.quantity || stopLeg?.quantity, symInfo?.stepSize)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[var(--color-text-secondary,#9ca3af)]">
                        {formatAmount(limitLeg?.executedQty || '0', symInfo?.stepSize)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" size="sm">Cặp OCO</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="success" size="sm">Đang mở</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          data-testid="order-cancel"
                          variant="ghost"
                          size="sm"
                          aria-label={`Hủy lệnh OCO ${list.symbol}`}
                          loading={cancelingListId === list.id}
                          onClick={() => handleCancelOrderList(list.id)}
                          className="text-[var(--color-sell,#f87171)] hover:bg-[var(--color-sell-bg,rgba(248,113,113,0.12))] text-xs px-2 py-1"
                        >
                          Hủy OCO
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {/* 2. RENDER STANDALONE ORDERS */}
                {standaloneOpenOrders.map((ord) => {
                  const symInfo = symbolMap.get(ord.symbol);
                  const isTrailing = ord.type === 'TRAILING_STOP_MARKET';
                  return (
                    <TableRow key={ord.id} data-testid="open-order-row">
                      <TableCell className="text-xs text-[var(--color-text-muted,#6b7280)] font-mono">
                        {new Date(ord.createdAt).toLocaleTimeString('vi-VN', { hour12: false })}
                      </TableCell>
                      <TableCell className="font-bold">{ord.symbol}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <SideTag side={ord.side} />
                          <span className="text-xs text-[var(--color-text-secondary,#9ca3af)]">{ord.type}</span>
                          {ord.source === 'GRID' && (
                            <a
                              href={ord.sourceId ? `/bots?grid=${ord.sourceId}` : '/bots'}
                              className="inline-block"
                              title="Xem chi tiết bot lưới"
                            >
                              <Badge variant="info" size="sm" className="bg-[var(--accent,#818cf8)]/15 text-[var(--accent,#818cf8)] cursor-pointer">
                                Bot lưới
                              </Badge>
                            </a>
                          )}
                          {ord.source === 'DCA' && (
                            <a href="/bots?tab=dca" className="inline-block" title="Xem kế hoạch mua định kỳ">
                              <Badge variant="warning" size="sm">
                                Mua định kỳ
                              </Badge>
                            </a>
                          )}
                        </div>
                        {ord.tpsl && (
                          <div className="text-[10px] text-[var(--color-accent-primary,#818cf8)] mt-0.5">
                            TP: {ord.tpsl.takeProfitPrice ? formatPrice(ord.tpsl.takeProfitPrice, symInfo?.tickSize) : '—'} / SL: {ord.tpsl.stopLossPrice ? formatPrice(ord.tpsl.stopLossPrice, symInfo?.tickSize) : '—'}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {ord.price ? formatPrice(ord.price, symInfo?.tickSize) : 'Thị trường'}
                        {ord.stopPrice && (
                          <div className="text-[10px] text-[var(--color-accent-primary,#818cf8)]">
                            Stop: {formatPrice(ord.stopPrice, symInfo?.tickSize)}
                          </div>
                        )}
                        {isTrailing && (
                          <div className="text-[10px] text-[var(--text-3,#63636b)]">
                            Ref: {ord.trailingReferencePrice ? formatPrice(ord.trailingReferencePrice, symInfo?.tickSize) : '—'} (Δ {((ord.trailingDeltaBips || 0) / 100).toFixed(1)}%)
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {ord.quantity ? formatAmount(ord.quantity, symInfo?.stepSize) : `${formatDecimal(ord.quoteOrderQty, { decimals: 2 })} USDT`}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[var(--color-text-secondary,#9ca3af)]">
                        {formatAmount(ord.executedQty, symInfo?.stepSize)}
                      </TableCell>
                      <TableCell className="text-center">
                        {ord.triggerState === 'WAITING' ? (
                          <Badge variant="warning" size="sm">Chờ kích hoạt</Badge>
                        ) : ord.triggerState === 'TRIGGERED' ? (
                          <Badge variant="success" size="sm">Đã kích hoạt</Badge>
                        ) : (
                          <span className="text-[var(--text-3,#63636b)]">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <OrderStatusBadge status={ord.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {ord.source && ord.source !== 'USER' ? (
                          <span
                            className="text-xs text-[var(--text-3,#63636b)] cursor-help inline-flex items-center"
                            title="Dừng bot để hủy lệnh này"
                          >
                            Dừng bot
                          </span>
                        ) : (
                          <Button
                            data-testid="order-cancel"
                            variant="ghost"
                            size="sm"
                            aria-label={`Hủy lệnh ${ord.side} ${ord.symbol}`}
                            loading={cancelingId === ord.id}
                            onClick={() => handleCancelOrder(ord.id)}
                            className="text-[var(--color-sell,#f87171)] hover:bg-[var(--color-sell-bg,rgba(248,113,113,0.12))] text-xs px-2 py-1"
                          >
                            Hủy
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )
        ) : activeTab === 'history' ? (
          /* ORDER HISTORY TABLE */
          orderHistory.length === 0 ? (
            <EmptyState
              title="Không có lịch sử lệnh"
              description="Bạn chưa thực hiện lệnh giao dịch nào trong khoảng thời gian đã chọn."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Cặp</TableHead>
                  <TableHead>Loại / Phe</TableHead>
                  <TableHead className="text-right">Giá đặt / Kích hoạt</TableHead>
                  <TableHead className="text-right">Giá khớp TB</TableHead>
                  <TableHead className="text-right">Khối lượng</TableHead>
                  <TableHead className="text-right">Đã khớp</TableHead>
                  <TableHead className="text-center">Trạng thái</TableHead>
                  <TableHead className="text-right">Lý do đóng</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderHistory.map((ord) => {
                  const symInfo = symbolMap.get(ord.symbol);
                  return (
                    <TableRow key={ord.id}>
                      <TableCell className="text-xs text-[var(--color-text-muted,#6b7280)] font-mono">
                        {new Date(ord.createdAt).toLocaleString('vi-VN', { hour12: false })}
                      </TableCell>
                      <TableCell className="font-bold">{ord.symbol}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <SideTag side={ord.side} />
                          <span className="text-xs text-[var(--color-text-secondary,#9ca3af)]">{ord.type}</span>
                          {ord.source === 'GRID' && (
                            <Badge variant="info" size="sm" className="bg-[var(--accent,#818cf8)]/15 text-[var(--accent,#818cf8)]">
                              Bot lưới
                            </Badge>
                          )}
                          {ord.source === 'DCA' && (
                            <Badge variant="warning" size="sm">
                              Mua định kỳ
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {ord.price ? formatPrice(ord.price, symInfo?.tickSize) : 'Thị trường'}
                        {ord.stopPrice && (
                          <div className="text-[10px] text-[var(--color-text-muted,#6b7280)]">
                            Stop: {formatPrice(ord.stopPrice, symInfo?.tickSize)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[var(--color-text-primary,#f3f4f6)]">
                        {ord.avgPrice ? formatPrice(ord.avgPrice, symInfo?.tickSize) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {ord.quantity ? formatAmount(ord.quantity, symInfo?.stepSize) : `${formatDecimal(ord.quoteOrderQty, { decimals: 2 })} USDT`}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[var(--color-text-secondary,#9ca3af)]">
                        {formatAmount(ord.executedQty, symInfo?.stepSize)}
                      </TableCell>
                      <TableCell className="text-center">
                        <OrderStatusBadge status={ord.status} />
                      </TableCell>
                      <TableCell className="text-right text-xs text-[var(--text-3,#63636b)]">
                        {formatCloseReason(ord.closeReason)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )
        ) : (
          /* TRADES HISTORY TABLE */
          myTrades.length === 0 ? (
            <EmptyState
              title="Chưa có lượt khớp lệnh"
              description="Lịch sử các giao dịch đã khớp thành công sẽ hiển thị tại đây."
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
                  <TableHead className="text-right">Tổng giá trị</TableHead>
                  <TableHead className="text-right">Phí</TableHead>
                  <TableHead className="text-right">Lãi/Lỗ đã chốt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myTrades.map((tr) => {
                  const symInfo = symbolMap.get(tr.symbol);
                  const pnl = tr.realizedPnl;
                  const isPositive = pnl && parseFloat(pnl) > 0;
                  const isNegative = pnl && parseFloat(pnl) < 0;

                  return (
                    <TableRow key={tr.id}>
                      <TableCell className="text-xs text-[var(--color-text-muted,#6b7280)] font-mono">
                        {new Date(tr.createdAt).toLocaleString('vi-VN', { hour12: false })}
                      </TableCell>
                      <TableCell className="font-bold">{tr.symbol}</TableCell>
                      <TableCell>
                        <SideTag side={tr.side} />
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatPrice(tr.price, symInfo?.tickSize)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatAmount(tr.quantity, symInfo?.stepSize)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-[var(--color-text-secondary,#9ca3af)]">
                        {formatDecimal(tr.quoteQty, { decimals: 2 })} USDT
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-[var(--color-text-secondary,#9ca3af)]">
                        {formatDecimal(tr.fee)} {tr.feeAsset}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold">
                        {pnl === null ? (
                          <span className="text-[var(--text-3,#63636b)] font-normal">—</span>
                        ) : (
                          <span className={isPositive ? 'text-[var(--color-buy,#22c55e)]' : isNegative ? 'text-[var(--color-sell,#f87171)]' : 'text-white'}>
                            {isPositive ? `+${formatDecimal(pnl)}` : formatDecimal(pnl)} USDT
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
          Bạn có chắc chắn muốn hủy toàn bộ {totalOpenCount} lệnh đang chờ của cặp {symbol}? Hành động này không thể hoàn tác.
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
