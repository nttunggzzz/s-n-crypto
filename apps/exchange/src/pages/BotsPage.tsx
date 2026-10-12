import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  GridBot,
  GridPreview,
  DcaPlan,
  DcaRun,
  Order,
  Balances,
} from '@cex/contracts';

type GridMode = 'ARITHMETIC' | 'GEOMETRIC';
type DcaInterval = 'DAILY' | 'WEEKLY' | 'MONTHLY';
import { ApiError } from '@cex/contracts';
import { getApiClient } from '../services/api.ts';
import { getErrorMessage } from '../services/errors.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useMarket } from '../context/MarketContext.tsx';
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
  EmptyState,
  Skeleton,
  useToast,
  formatDecimal,
} from '@cex/ui';
import {
  dec,
  floorToStep,
  roundDown,
  ZERO,
} from '@cex/core';
import {
  Bot,
  Play,
  Square,
  Pause,
  Clock,
  TrendingUp,
  TrendingDown,
  Info,
  Calendar,
  Layers,
  ChevronRight,
  ExternalLink,
  Edit2,
  Trash2,
} from 'lucide-react';

export interface BotsPageProps {
  onNavigate: (path: string) => void;
}

export const BotsPage: React.FC<BotsPageProps> = ({ onNavigate }) => {
  const { isAuthenticated } = useAuth();
  const { symbols, tickers, realtimeClient } = useMarket();
  const { success, error: toastError } = useToast();
  const api = getApiClient();

  // URL query params
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialTab = searchParams.get('tab') === 'dca' ? 'dca' : 'grid';
  const initialGridId = searchParams.get('grid');
  const initialSymbol = searchParams.get('symbol') || 'BTCUSDT';

  const [activeTab, setActiveTab] = useState<'grid' | 'dca'>(initialTab);
  const [subTab, setSubTab] = useState<'all' | 'running' | 'history'>('all');

  // Balances
  const [balances, setBalances] = useState<Balances | null>(null);

  // Grid bots state
  const [gridBotsList, setGridBotsList] = useState<GridBot[]>([]);
  const [loadingGridBots, setLoadingGridBots] = useState(false);

  // Create Grid Bot Form states
  const [gridSymbol, setGridSymbol] = useState(initialSymbol);
  const [lowerPrice, setLowerPrice] = useState('');
  const [upperPrice, setUpperPrice] = useState('');
  const [gridCount, setGridCount] = useState(10);
  const [gridMode, setGridMode] = useState<GridMode>('ARITHMETIC');
  const [gridInvestment, setGridInvestment] = useState('');
  const [gridPercent, setGridPercent] = useState(0);

  const [gridPreviewData, setGridPreviewData] = useState<GridPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Grid bot modals & drawers
  const [createGridModalOpen, setCreateGridModalOpen] = useState(false);
  const [creatingGrid, setCreatingGrid] = useState(false);

  const [stoppingBot, setStoppingBot] = useState<GridBot | null>(null);
  const [stoppingSellBase, setStoppingSellBase] = useState(false);
  const [stoppingAction, setStoppingAction] = useState(false);

  const [detailsBot, setDetailsBot] = useState<GridBot | null>(null);
  const [botOrders, setBotOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // DCA Plans state
  const [dcaPlansList, setDcaPlansList] = useState<DcaPlan[]>([]);
  const [loadingDcaPlans, setLoadingDcaPlans] = useState(false);

  // Create DCA Form states
  const [dcaSymbol, setDcaSymbol] = useState(initialSymbol);
  const [dcaQuoteAmount, setDcaQuoteAmount] = useState('50');
  const [dcaInterval, setDcaInterval] = useState<DcaInterval>('DAILY');
  const [dcaHour, setDcaHour] = useState(9);
  const [dcaDayOfWeek, setDcaDayOfWeek] = useState(1); // 1 = Monday
  const [dcaDayOfMonth, setDcaDayOfMonth] = useState(1);
  const [creatingDca, setCreatingDca] = useState(false);
  const [createDcaModalOpen, setCreateDcaModalOpen] = useState(false);

  // DCA Modals
  const [editDcaPlan, setEditDcaPlan] = useState<DcaPlan | null>(null);
  const [editDcaAmount, setEditDcaAmount] = useState('');
  const [savingDcaEdit, setSavingDcaEdit] = useState(false);

  const [cancelDcaPlanItem, setCancelDcaPlanItem] = useState<DcaPlan | null>(null);
  const [cancelingDca, setCancelingDca] = useState(false);

  const [viewRunsPlan, setViewRunsPlan] = useState<DcaPlan | null>(null);
  const [dcaRunsList, setDcaRunsList] = useState<DcaRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  // Available USDT balance
  const availableUsdt = useMemo(() => {
    return balances?.items.find((b) => b.asset === 'USDT')?.available || '0';
  }, [balances]);

  // Current symbol info & ticker
  const currentSymbolInfo = useMemo(() => {
    const s = activeTab === 'grid' ? gridSymbol : dcaSymbol;
    return symbols.find((item) => item.symbol === s);
  }, [symbols, activeTab, gridSymbol, dcaSymbol]);

  const currentTicker = useMemo(() => {
    const s = activeTab === 'grid' ? gridSymbol : dcaSymbol;
    return tickers[s];
  }, [tickers, activeTab, gridSymbol, dcaSymbol]);

  // Fetch balances
  const fetchBalances = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const b = await api.balances();
      setBalances(b);
    } catch {}
  }, [api, isAuthenticated]);

  // Fetch Grid bots
  const fetchGridBots = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoadingGridBots(true);
    try {
      const res = await api.gridBots();
      setGridBotsList(res.items);
      // If initialGridId is set in query, open its details
      if (initialGridId) {
        const found = res.items.find((b) => b.id === initialGridId);
        if (found) {
          setDetailsBot(found);
        }
      }
    } catch {} finally {
      setLoadingGridBots(false);
    }
  }, [api, isAuthenticated, initialGridId]);

  // Fetch DCA plans
  const fetchDcaPlans = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoadingDcaPlans(true);
    try {
      const res = await api.dcaPlans();
      setDcaPlansList(res.items);
    } catch {} finally {
      setLoadingDcaPlans(false);
    }
  }, [api, isAuthenticated]);

  useEffect(() => {
    fetchBalances();
    fetchGridBots();
    fetchDcaPlans();
  }, [fetchBalances, fetchGridBots, fetchDcaPlans]);

  // Realtime subscription for gridBot and dcaPlan events
  useEffect(() => {
    if (!realtimeClient || !isAuthenticated) return;

    const unsub = realtimeClient.subscribe('user', (event: unknown) => {
      const ev = event as { kind: string; gridBot?: GridBot; dcaPlan?: DcaPlan };
      if (ev.kind === 'gridBot' && ev.gridBot) {
        const updated = ev.gridBot;
        setGridBotsList((prev) => {
          const idx = prev.findIndex((b) => b.id === updated.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = updated;
            return next;
          }
          return [updated, ...prev];
        });
        if (detailsBot?.id === updated.id) {
          setDetailsBot(updated);
        }
      } else if (ev.kind === 'dcaPlan' && ev.dcaPlan) {
        const updated = ev.dcaPlan;
        setDcaPlansList((prev) => {
          const idx = prev.findIndex((p) => p.id === updated.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = updated;
            return next;
          }
          return [updated, ...prev];
        });
      }
    });

    return () => unsub();
  }, [realtimeClient, isAuthenticated, detailsBot?.id]);

  // Suggest grid price range: ±10% from current price
  const handleSuggestRange = () => {
    if (!currentTicker?.lastPrice || !currentSymbolInfo?.tickSize) return;
    try {
      const p = dec(currentTicker.lastPrice);
      const tick = dec(currentSymbolInfo.tickSize);
      const low = floorToStep(p.mul(dec('0.9')), tick).toString();
      const high = floorToStep(p.mul(dec('1.1')), tick).toString();
      setLowerPrice(low);
      setUpperPrice(high);
    } catch {}
  };

  // Debounced Grid Bot Preview
  useEffect(() => {
    if (!lowerPrice || !upperPrice || !gridInvestment || !isAuthenticated) {
      setGridPreviewData(null);
      setPreviewError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const preview = await api.gridBotPreview({
          body: {
            symbol: gridSymbol,
            lowerPrice,
            upperPrice,
            gridCount,
            mode: gridMode,
            investment: gridInvestment,
          },
        });
        setGridPreviewData(preview);
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          setPreviewError(getErrorMessage(err.code) || 'Thông số lưới không hợp lệ.');
        } else {
          setPreviewError('Không thể tính toán xem trước lưới.');
        }
        setGridPreviewData(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [api, isAuthenticated, gridSymbol, lowerPrice, upperPrice, gridCount, gridMode, gridInvestment]);

  // Handle percent slider for grid investment
  const handlePercentChange = (pct: number) => {
    setGridPercent(pct);
    try {
      const total = dec(availableUsdt);
      const allocated = roundDown(total.mul(dec((pct / 100).toString())), 2);
      setGridInvestment(allocated.toString());
    } catch {}
  };

  // Submit Create Grid Bot
  const handleCreateGridBot = async () => {
    setCreatingGrid(true);
    try {
      await api.createGridBot({
        body: {
          symbol: gridSymbol,
          lowerPrice,
          upperPrice,
          gridCount,
          mode: gridMode,
          investment: gridInvestment,
        },
      });
      success(`Đã khởi chạy bot lưới ${gridSymbol} thành công!`);
      setCreateGridModalOpen(false);
      fetchGridBots();
      fetchBalances();
      setLowerPrice('');
      setUpperPrice('');
      setGridInvestment('');
      setGridPercent(0);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError(getErrorMessage(err.code));
      } else {
        toastError('Không thể khởi tạo bot lưới.');
      }
    } finally {
      setCreatingGrid(false);
    }
  };

  // Stop Grid Bot
  const handleStopGridBot = async () => {
    if (!stoppingBot) return;
    setStoppingAction(true);
    try {
      await api.stopGridBot({
        params: { botId: stoppingBot.id },
        body: { sellBase: stoppingSellBase },
      });
      success(`Đã dừng bot lưới ${stoppingBot.symbol} thành công.`);
      setStoppingBot(null);
      fetchGridBots();
      fetchBalances();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError(getErrorMessage(err.code));
      } else {
        toastError('Không thể dừng bot.');
      }
    } finally {
      setStoppingAction(false);
    }
  };

  // Load Bot Orders
  const handleOpenDetails = async (bot: GridBot) => {
    setDetailsBot(bot);
    setLoadingOrders(true);
    try {
      const res = await api.gridBotOrders({ params: { botId: bot.id } });
      setBotOrders(res.items);
    } catch {} finally {
      setLoadingOrders(false);
    }
  };

  // Create DCA Plan
  const handleCreateDcaPlan = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (!dcaQuoteAmount || parseFloat(dcaQuoteAmount) <= 0) {
      toastError('Vui lòng nhập số tiền hợp lệ.');
      return;
    }
    setCreatingDca(true);
    try {
      await api.createDcaPlan({
        body: {
          symbol: dcaSymbol,
          quoteAmount: dcaQuoteAmount,
          interval: dcaInterval,
          hour: dcaHour,
          dayOfWeek: dcaInterval === 'WEEKLY' ? dcaDayOfWeek : undefined,
          dayOfMonth: dcaInterval === 'MONTHLY' ? dcaDayOfMonth : undefined,
        },
      });
      success(`Đã tạo kế hoạch Mua định kỳ ${dcaSymbol}!`);
      setCreateDcaModalOpen(false);
      fetchDcaPlans();
      setDcaQuoteAmount('50');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError(getErrorMessage(err.code));
      } else {
        toastError('Không thể tạo kế hoạch Mua định kỳ.');
      }
    } finally {
      setCreatingDca(false);
    }
  };

  // Toggle Pause/Resume DCA Plan
  const handleToggleDcaStatus = async (plan: DcaPlan) => {
    const nextStatus = plan.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await api.updateDcaPlan({
        params: { planId: plan.id },
        body: { status: nextStatus },
      });
      success(`Đã ${nextStatus === 'ACTIVE' ? 'tiếp tục' : 'tạm dừng'} kế hoạch ${plan.symbol}.`);
      fetchDcaPlans();
    } catch {
      toastError('Không thể cập nhật trạng thái kế hoạch.');
    }
  };

  // Edit DCA Quote Amount
  const handleSaveDcaAmount = async () => {
    if (!editDcaPlan || !editDcaAmount || parseFloat(editDcaAmount) <= 0) return;
    setSavingDcaEdit(true);
    try {
      await api.updateDcaPlan({
        params: { planId: editDcaPlan.id },
        body: { quoteAmount: editDcaAmount },
      });
      success(`Đã sửa số tiền mua định kỳ ${editDcaPlan.symbol} thành ${editDcaAmount} USDT.`);
      setEditDcaPlan(null);
      fetchDcaPlans();
    } catch {
      toastError('Không thể cập nhật số tiền.');
    } finally {
      setSavingDcaEdit(false);
    }
  };

  // Cancel DCA Plan
  const handleConfirmCancelDca = async () => {
    if (!cancelDcaPlanItem) return;
    setCancelingDca(true);
    try {
      await api.cancelDcaPlan({ params: { planId: cancelDcaPlanItem.id } });
      success(`Đã hủy kế hoạch Mua định kỳ ${cancelDcaPlanItem.symbol}.`);
      setCancelDcaPlanItem(null);
      fetchDcaPlans();
    } catch {
      toastError('Không thể hủy kế hoạch.');
    } finally {
      setCancelingDca(false);
    }
  };

  // View DCA Runs
  const handleOpenRuns = async (plan: DcaPlan) => {
    setViewRunsPlan(plan);
    setLoadingRuns(true);
    try {
      const res = await api.dcaRuns({ params: { planId: plan.id } });
      setDcaRunsList(res.items);
    } catch {} finally {
      setLoadingRuns(false);
    }
  };

  // Format Frequency Vietnamese String
  const formatDcaFrequency = (plan: DcaPlan) => {
    const hourStr = `${plan.hour.toString().padStart(2, '0')}:00 (GMT+7)`;
    if (plan.interval === 'DAILY') {
      return `Hằng ngày lúc ${hourStr}`;
    }
    if (plan.interval === 'WEEKLY') {
      const dayNames = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
      return `${dayNames[plan.dayOfWeek || 1]} hằng tuần, ${hourStr}`;
    }
    return `Ngày ${plan.dayOfMonth} hằng tháng, ${hourStr}`;
  };

  // Format Stop Reason Vietnamese
  const formatStopReason = (reason: string | null) => {
    if (!reason) return '—';
    const map: Record<string, string> = {
      USER: 'Bạn đã dừng',
      ADMIN: 'Quản trị viên dừng',
      ORDER_CANCELED: 'Lệnh của bot bị hủy',
      SYMBOL_REMOVED: 'Cặp đã ngừng giao dịch',
      START_FAILED: 'Khởi tạo thất bại',
    };
    return map[reason] || reason;
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <EmptyState
          title="Yêu cầu đăng nhập"
          description="Vui lòng đăng nhập để sử dụng tính năng Bot giao dịch tự động."
          action={
            <Button variant="primary" onClick={() => onNavigate('/login')}>
              Đăng nhập
            </Button>
          }
        />
      </div>
    );
  }

  // Filter running vs history
  const runningGridBots = gridBotsList.filter((b) => b.status === 'RUNNING');
  const historyGridBots = gridBotsList.filter((b) => b.status !== 'RUNNING');

  const runningDcaPlans = dcaPlansList.filter((p) => p.status !== 'CANCELED');
  const historyDcaPlans = dcaPlansList.filter((p) => p.status === 'CANCELED');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20 w-full space-y-6">
      {/* Top Header & Main Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--line,#1d1e21)]">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)] flex items-center gap-2">
            <Bot size={26} className="text-[var(--accent,#818cf8)]" />
            Bot giao dịch tự động
          </h1>
          <p className="text-xs text-[var(--text-3,#63636b)] mt-1">
            Giao dịch tự động trên ví Spot với Bot lưới hoặc Chiến lược Mua định kỳ (DCA).
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1 bg-[var(--panel-2,#141416)] p-1 rounded-lg border border-[var(--line,#1d1e21)]">
          <button
            onClick={() => setActiveTab('grid')}
            className={`px-4 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'grid'
                ? 'bg-[var(--accent,#818cf8)] text-black shadow-sm'
                : 'text-[var(--text-2,#a1a1aa)] hover:text-white'
            }`}
          >
            Bot lưới (Grid Bot)
          </button>
          <button
            data-testid="bots-tab-dca"
            onClick={() => setActiveTab('dca')}
            className={`px-4 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'dca'
                ? 'bg-[var(--accent,#818cf8)] text-black shadow-sm'
                : 'text-[var(--text-2,#a1a1aa)] hover:text-white'
            }`}
          >
            Mua định kỳ (DCA)
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: SPOT GRID BOT                                                      */}
      {/* ========================================================================= */}
      {activeTab === 'grid' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left / Center 2 Cols: Running Bots & History */}
          <div className="lg:col-span-2 space-y-4">
            {/* Sub-tabs: Tất cả vs Đang chạy vs Lịch sử */}
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line,#1d1e21)]">
              <div className="flex items-center gap-4 text-xs font-semibold">
                <button
                  onClick={() => setSubTab('all')}
                  className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                    subTab === 'all'
                      ? 'border-[var(--accent,#818cf8)] text-white'
                      : 'border-transparent text-[var(--text-3,#63636b)] hover:text-[var(--text-2,#a1a1aa)]'
                  }`}
                >
                  Tất cả ({gridBotsList.length})
                </button>
                <button
                  onClick={() => setSubTab('running')}
                  className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                    subTab === 'running'
                      ? 'border-[var(--accent,#818cf8)] text-white'
                      : 'border-transparent text-[var(--text-3,#63636b)] hover:text-[var(--text-2,#a1a1aa)]'
                  }`}
                >
                  Đang chạy ({runningGridBots.length})
                </button>
                <button
                  onClick={() => setSubTab('history')}
                  className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                    subTab === 'history'
                      ? 'border-[var(--accent,#818cf8)] text-white'
                      : 'border-transparent text-[var(--text-3,#63636b)] hover:text-[var(--text-2,#a1a1aa)]'
                  }`}
                >
                  Lịch sử ({historyGridBots.length})
                </button>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={fetchGridBots}
                className="text-xs text-[var(--text-3,#63636b)] hover:text-white"
              >
                Làm mới
              </Button>
            </div>

            {loadingGridBots && gridBotsList.length === 0 ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} height={140} className="w-full rounded-xl" />
                ))}
              </div>
            ) : (() => {
              const displayedBots = subTab === 'running'
                ? runningGridBots
                : subTab === 'history'
                ? historyGridBots
                : gridBotsList;

              if (displayedBots.length === 0) {
                return (
                  <EmptyState
                    title="Chưa có bot lưới nào"
                    description="Hãy thiết lập thông số bên cạnh để khởi chạy bot lưới đầu tiên của bạn."
                  />
                );
              }

              return (
                <div className="space-y-4">
                  {displayedBots.map((bot) => {
                    const isRunning = bot.status === 'RUNNING';
                    const pnlVal = bot.totalPnl !== null && bot.totalPnl !== undefined ? parseFloat(bot.totalPnl) : null;
                    return (
                      <div
                        key={bot.id}
                        data-testid="grid-bot-card"
                        className={`p-5 rounded-xl bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] hover:border-[var(--line,#1d1e21)]/80 transition-all space-y-4 ${
                          !isRunning ? 'opacity-90' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-base text-[var(--text,#f4f4f5)]">{bot.symbol}</span>
                            {isRunning ? (
                              <Badge variant="success" size="sm" className="bg-[var(--up,#1fc27a)]/10 text-[var(--up,#1fc27a)] border-none">
                                Đang chạy
                              </Badge>
                            ) : (
                              <Badge variant="secondary" size="sm">
                                Đã dừng
                              </Badge>
                            )}
                            <span className="text-[11px] text-[var(--text-3,#63636b)]">
                              {bot.mode === 'ARITHMETIC' ? 'Số học' : 'Hình học'} · {bot.gridCount} lưới
                              {!isRunning && bot.stopReason && ` · ${formatStopReason(bot.stopReason)}`}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDetails(bot)}
                              className="text-xs"
                            >
                              Chi tiết
                            </Button>
                            {isRunning && (
                              <Button
                                data-testid="grid-bot-stop"
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setStoppingBot(bot);
                                  setStoppingSellBase(false);
                                }}
                                className="text-xs text-[var(--down,#f2475f)]"
                              >
                                Dừng
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Metrics Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3 rounded-lg bg-[var(--panel-2,#141416)] text-xs font-mono">
                          <div>
                            <span className="text-[10px] text-[var(--text-3,#63636b)] block">
                              {isRunning ? 'Tổng Lãi/Lỗ:' : 'Kết quả cuối:'}
                            </span>
                            <span
                              className={`font-bold ${
                                pnlVal === null
                                  ? 'text-[var(--text-3,#63636b)]'
                                  : pnlVal > 0
                                  ? 'text-[var(--up,#1fc27a)]'
                                  : pnlVal < 0
                                  ? 'text-[var(--down,#f2475f)]'
                                  : 'text-[var(--text,#f4f4f5)]'
                              }`}
                            >
                              {pnlVal === null ? '—' : `${pnlVal > 0 ? '+' : ''}${formatDecimal(bot.totalPnl, { decimals: 2 })} USDT`}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[var(--text-3,#63636b)] block">Lãi lưới đã chốt:</span>
                            <span className="text-[var(--up,#1fc27a)] font-semibold">
                              +{formatDecimal(bot.gridProfit, { decimals: 2 })} USDT
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[var(--text-3,#63636b)] block">Số vòng hoàn thành:</span>
                            <span className="text-[var(--text,#f4f4f5)]">{bot.completedRounds} vòng</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[var(--text-3,#63636b)] block">
                              {isRunning ? 'Lệnh đang mở:' : 'Thời gian dừng:'}
                            </span>
                            <span className="text-[var(--text,#f4f4f5)]">
                              {isRunning
                                ? `${bot.openOrders} lệnh`
                                : bot.stoppedAt
                                ? new Date(bot.stoppedAt).toLocaleString('vi-VN')
                                : '—'}
                            </span>
                          </div>
                        </div>

                        {/* Range & Holdings */}
                        <div className="flex flex-wrap items-center justify-between text-[11px] text-[var(--text-3,#63636b)] pt-1">
                          <span>Khoảng giá: {bot.lowerPrice} – {bot.upperPrice} USDT</span>
                          <span>Đang giữ: {bot.baseHeld} + {bot.quoteHeld} USDT</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Right Col: Create Grid Bot Form */}
          <div className="space-y-4">
            <div className="p-5 rounded-xl bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] space-y-4">
              <h2 className="text-base font-bold text-[var(--text,#f4f4f5)] flex items-center gap-2">
                <span>Tạo Bot lưới Spot</span>
              </h2>

              {/* Symbol selector */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-2,#a1a1aa)] mb-1">Cặp giao dịch</label>
                <select
                  data-testid="grid-symbol"
                  value={gridSymbol}
                  onChange={(e) => {
                    setGridSymbol(e.target.value);
                    setLowerPrice('');
                    setUpperPrice('');
                  }}
                  className="w-full bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-xs text-white"
                >
                  {symbols.map((s) => (
                    <option key={s.symbol} value={s.symbol}>
                      {s.baseAsset}/{s.quoteAsset} ({s.symbol})
                    </option>
                  ))}
                </select>
              </div>

              {/* Price Range */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--text-2,#a1a1aa)]">Khoảng giá (USDT)</label>
                  <button
                    type="button"
                    onClick={handleSuggestRange}
                    className="text-[11px] text-[var(--accent,#818cf8)] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    Gợi ý (±10%)
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    data-testid="grid-lower"
                    placeholder="Giá thấp"
                    value={lowerPrice}
                    onChange={(e) => setLowerPrice(e.target.value)}
                  />
                  <Input
                    data-testid="grid-upper"
                    placeholder="Giá cao"
                    value={upperPrice}
                    onChange={(e) => setUpperPrice(e.target.value)}
                  />
                </div>
              </div>

              {/* Grid Count & Mode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2,#a1a1aa)] mb-1">
                    Số lưới (2–100)
                  </label>
                  <Input
                    data-testid="grid-count"
                    type="number"
                    min={2}
                    max={100}
                    value={gridCount}
                    onChange={(e) => setGridCount(parseInt(e.target.value) || 2)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2,#a1a1aa)] mb-1">Kiểu lưới</label>
                  <div className="flex gap-1 bg-[var(--panel-2,#141416)] p-0.5 rounded border border-[var(--line,#1d1e21)]">
                    <button
                      type="button"
                      onClick={() => setGridMode('ARITHMETIC')}
                      className={`flex-1 py-1 text-[11px] font-semibold rounded cursor-pointer ${
                        gridMode === 'ARITHMETIC' ? 'bg-[var(--accent,#818cf8)] text-black' : 'text-[var(--text-3,#63636b)]'
                      }`}
                    >
                      Số học
                    </button>
                    <button
                      type="button"
                      onClick={() => setGridMode('GEOMETRIC')}
                      className={`flex-1 py-1 text-[11px] font-semibold rounded cursor-pointer ${
                        gridMode === 'GEOMETRIC' ? 'bg-[var(--accent,#818cf8)] text-black' : 'text-[var(--text-3,#63636b)]'
                      }`}
                    >
                      Hình học
                    </button>
                  </div>
                </div>
              </div>

              {/* Investment Amount */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[var(--text-2,#a1a1aa)]">Vốn đầu tư</span>
                  <span className="text-[var(--text-3,#63636b)] font-mono">
                    Khả dụng: {formatDecimal(availableUsdt, { decimals: 2 })} USDT
                  </span>
                </div>
                <Input
                  data-testid="grid-investment"
                  placeholder="Số USDT đầu tư"
                  value={gridInvestment}
                  onChange={(e) => {
                    setGridInvestment(e.target.value);
                    setGridPercent(0);
                  }}
                  rightAddon="USDT"
                />

                {/* Slider */}
                <div className="flex gap-1.5 pt-1">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => handlePercentChange(pct)}
                      className={`flex-1 py-1 text-[10px] font-bold rounded border cursor-pointer ${
                        gridPercent === pct
                          ? 'border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]'
                          : 'border-[var(--line,#1d1e21)] text-[var(--text-3,#63636b)] hover:text-white'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Preview Info */}
              {previewLoading ? (
                <div className="p-3 rounded-lg bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)]">
                  <Skeleton height={40} className="w-full" />
                </div>
              ) : previewError ? (
                <div className="p-3 rounded-lg bg-[var(--down,#f2475f)]/10 border border-[var(--down,#f2475f)]/30 text-xs text-[var(--down,#f2475f)]">
                  {previewError}
                </div>
              ) : gridPreviewData ? (
                <div className="p-3 rounded-lg bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-3,#63636b)]">Lãi mỗi lưới (sau phí):</span>
                    <span data-testid="grid-preview-profit" className="text-[var(--up,#1fc27a)] font-bold font-mono">
                      {(parseFloat(gridPreviewData.profitPerGridMin) * 100).toFixed(2)}% –{' '}
                      {(parseFloat(gridPreviewData.profitPerGridMax) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-3,#63636b)]">Lệnh mua / bán:</span>
                    <span className="text-white font-mono">
                      {gridPreviewData.buyOrders} mua / {gridPreviewData.sellOrders} bán
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-3,#63636b)]">KL mỗi lưới:</span>
                    <span className="text-white font-mono">
                      {gridPreviewData.quantityPerGrid} {currentSymbolInfo?.baseAsset}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-3,#63636b)]">Mua ngay ban đầu:</span>
                    <span className="text-white font-mono">
                      {gridPreviewData.initialBuyQuantity} {currentSymbolInfo?.baseAsset}
                    </span>
                  </div>
                </div>
              ) : null}

              <Button
                data-testid="grid-create"
                variant="primary"
                fullWidth
                disabled={!gridPreviewData || previewLoading}
                onClick={() => setCreateGridModalOpen(true)}
              >
                Tạo Bot lưới
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DCA RECURRING BUY                                                  */}
      {/* ========================================================================= */}
      {activeTab === 'dca' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left / Center 2 Cols: Running Plans & History */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line,#1d1e21)]">
              <div className="flex items-center gap-4 text-xs font-semibold">
                <button
                  onClick={() => setSubTab('running')}
                  className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                    subTab !== 'history'
                      ? 'border-[var(--accent,#818cf8)] text-white'
                      : 'border-transparent text-[var(--text-3,#63636b)] hover:text-[var(--text-2,#a1a1aa)]'
                  }`}
                >
                  Đang hoạt động ({runningDcaPlans.length})
                </button>
                <button
                  onClick={() => setSubTab('history')}
                  className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                    subTab === 'history'
                      ? 'border-[var(--accent,#818cf8)] text-white'
                      : 'border-transparent text-[var(--text-3,#63636b)] hover:text-[var(--text-2,#a1a1aa)]'
                  }`}
                >
                  Đã hủy ({historyDcaPlans.length})
                </button>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={fetchDcaPlans}
                className="text-xs text-[var(--text-3,#63636b)] hover:text-white"
              >
                Làm mới
              </Button>
            </div>

            {loadingDcaPlans && dcaPlansList.length === 0 ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} height={140} className="w-full rounded-xl" />
                ))}
              </div>
            ) : subTab !== 'history' ? (
              runningDcaPlans.length === 0 ? (
                <EmptyState
                  title="Chưa có kế hoạch Mua định kỳ nào"
                  description="Hãy tạo kế hoạch DCA để tích lũy tài sản đều đặn theo thời gian."
                />
              ) : (
                <div className="space-y-4">
                  {runningDcaPlans.map((plan) => {
                    const currentTicker = tickers[plan.symbol];
                    const isTickerLive = Boolean(currentTicker && currentTicker.status !== 'STALE' && currentTicker.lastPrice);
                    let pnlText = '—';
                    let pnlClass = 'text-[var(--text-3,#63636b)]';

                    if (isTickerLive && currentTicker?.lastPrice) {
                      try {
                        const boughtDec = dec(plan.totalBought);
                        const spentDec = dec(plan.totalSpent);
                        const priceDec = dec(currentTicker.lastPrice);
                        const estValue = boughtDec.mul(priceDec);
                        const pnlDec = spentDec.gt(dec('0')) ? estValue.sub(spentDec) : dec('0');

                        if (pnlDec.gt(dec('0'))) {
                          pnlText = `+${formatDecimal(pnlDec.toFixed(2), { decimals: 2, locale: 'vi' })} USDT`;
                          pnlClass = 'text-[var(--up,#1fc27a)] font-bold';
                        } else if (pnlDec.lt(dec('0'))) {
                          pnlText = `${formatDecimal(pnlDec.toFixed(2), { decimals: 2, locale: 'vi' })} USDT`;
                          pnlClass = 'text-[var(--down,#f2475f)] font-bold';
                        } else {
                          pnlText = '0,00 USDT';
                          pnlClass = 'text-white font-bold';
                        }
                      } catch {
                        pnlText = '—';
                        pnlClass = 'text-[var(--text-3,#63636b)]';
                      }
                    }

                    return (
                      <div
                        key={plan.id}
                        data-testid="dca-plan-card"
                        className="p-5 rounded-xl bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-base text-[var(--text,#f4f4f5)]">{plan.symbol}</span>
                            <Badge
                              variant={plan.status === 'ACTIVE' ? 'success' : 'warning'}
                              size="sm"
                            >
                              {plan.status === 'ACTIVE' ? 'Đang chạy' : 'Tạm dừng'}
                            </Badge>
                            <span className="text-xs text-[var(--text-3,#63636b)]">
                              {formatDcaFrequency(plan)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              data-testid="dca-pause"
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleDcaStatus(plan)}
                              className="text-xs"
                            >
                              {plan.status === 'ACTIVE' ? <Pause size={13} className="mr-1" /> : <Play size={13} className="mr-1" />}
                              {plan.status === 'ACTIVE' ? 'Tạm dừng' : 'Tiếp tục'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditDcaPlan(plan);
                                setEditDcaAmount(plan.quoteAmount);
                              }}
                              className="text-xs"
                              title="Sửa số tiền"
                            >
                              <Edit2 size={13} />
                            </Button>
                            <Button
                              data-testid="dca-cancel"
                              variant="ghost"
                              size="sm"
                              onClick={() => setCancelDcaPlanItem(plan)}
                              className="text-xs text-[var(--down,#f2475f)]"
                              title="Hủy kế hoạch"
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </div>

                        {/* Financial numbers */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3 rounded-lg bg-[var(--panel-2,#141416)] text-xs font-mono">
                          <div>
                            <span className="text-[10px] text-[var(--text-3,#63636b)] block">Số tiền mỗi kỳ:</span>
                            <span className="font-bold text-white">{plan.quoteAmount} USDT</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[var(--text-3,#63636b)] block">Đã đầu tư:</span>
                            <span>{formatDecimal(plan.totalSpent, { decimals: 2, locale: 'vi' })} USDT</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[var(--text-3,#63636b)] block">Đã mua được:</span>
                            <span>{formatDecimal(plan.totalBought, { decimals: 4, locale: 'vi' })}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[var(--text-3,#63636b)] block">Lãi/Lỗ tạm tính:</span>
                            <span className={pnlClass}>
                              {pnlText}
                            </span>
                          </div>
                        </div>

                        {/* Extra info footer */}
                        <div className="flex items-center justify-between text-[11px] text-[var(--text-3,#63636b)] pt-1">
                          <span>
                            Đã chạy: {plan.runs} kỳ ({plan.skipped} bỏ qua)
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenRuns(plan)}
                            className="text-[var(--accent,#818cf8)] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            Lịch sử kỳ mua <ChevronRight size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              /* History DCA */
              historyDcaPlans.length === 0 ? (
                <EmptyState
                  title="Không có kế hoạch đã hủy"
                  description="Các kế hoạch mua định kỳ đã hủy sẽ hiển thị tại đây."
                />
              ) : (
                <div className="space-y-4">
                  {historyDcaPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className="p-5 rounded-xl bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] space-y-3 opacity-90"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[var(--text,#f4f4f5)]">{plan.symbol}</span>
                          <Badge variant="secondary" size="sm">Đã hủy</Badge>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenRuns(plan)}
                          className="text-xs text-[var(--text-3,#63636b)] hover:underline cursor-pointer"
                        >
                          Xem các kỳ đã chạy
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-[var(--panel-2,#141416)] text-xs font-mono">
                        <div>
                          <span className="text-[10px] text-[var(--text-3,#63636b)] block">Tổng đầu tư:</span>
                          <span>{formatDecimal(plan.totalSpent, { decimals: 2 })} USDT</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[var(--text-3,#63636b)] block">Tổng mua:</span>
                          <span>{formatDecimal(plan.totalBought, { decimals: 4 })}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[var(--text-3,#63636b)] block">Số kỳ:</span>
                          <span>{plan.runs}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

          {/* Right Col: Create DCA Form */}
          <div className="space-y-4">
            <form onSubmit={handleCreateDcaPlan} className="p-5 rounded-xl bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] space-y-4">
              <h2 className="text-base font-bold text-[var(--text,#f4f4f5)]">Tạo Mua định kỳ (DCA)</h2>

              {/* Symbol selector */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-2,#a1a1aa)] mb-1">Cặp giao dịch</label>
                <select
                  data-testid="dca-symbol"
                  value={dcaSymbol}
                  onChange={(e) => setDcaSymbol(e.target.value)}
                  className="w-full bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-xs text-white"
                >
                  {symbols.map((s) => (
                    <option key={s.symbol} value={s.symbol}>
                      {s.baseAsset}/{s.quoteAsset} ({s.symbol})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quote Amount */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-2,#a1a1aa)] mb-1">Số USDT mỗi kỳ</label>
                <Input
                  data-testid="dca-amount"
                  value={dcaQuoteAmount}
                  onChange={(e) => setDcaQuoteAmount(e.target.value)}
                  placeholder="50"
                  rightAddon="USDT"
                  required
                />
              </div>

              {/* Interval Selection */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-2,#a1a1aa)] mb-1">Tần suất mua</label>
                <select
                  data-testid="dca-interval"
                  value={dcaInterval}
                  onChange={(e) => setDcaInterval(e.target.value as DcaInterval)}
                  className="w-full bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-xs text-white"
                >
                  <option value="DAILY">Hằng ngày</option>
                  <option value="WEEKLY">Hằng tuần</option>
                  <option value="MONTHLY">Hằng tháng</option>
                </select>
              </div>

              {/* Day of Week for WEEKLY */}
              {dcaInterval === 'WEEKLY' && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2,#a1a1aa)] mb-1">Vào ngày trong tuần</label>
                  <select
                    value={dcaDayOfWeek}
                    onChange={(e) => setDcaDayOfWeek(parseInt(e.target.value))}
                    className="w-full bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value={1}>Thứ Hai</option>
                    <option value={2}>Thứ Ba</option>
                    <option value={3}>Thứ Tư</option>
                    <option value={4}>Thứ Năm</option>
                    <option value={5}>Thứ Sáu</option>
                    <option value={6}>Thứ Bảy</option>
                    <option value={7}>Chủ Nhật</option>
                  </select>
                </div>
              )}

              {/* Day of Month for MONTHLY */}
              {dcaInterval === 'MONTHLY' && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-2,#a1a1aa)] mb-1">Ngày trong tháng (1–28)</label>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    value={dcaDayOfMonth}
                    onChange={(e) => setDcaDayOfMonth(parseInt(e.target.value))}
                    className="w-full bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              )}

              {/* Hour (0-23) */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-2,#a1a1aa)] mb-1">
                  Giờ mua: <span className="text-white font-mono">{dcaHour}:00</span> (Giờ Việt Nam GMT+7)
                </label>
                <input
                  type="range"
                  min="0"
                  max="23"
                  value={dcaHour}
                  onChange={(e) => setDcaHour(parseInt(e.target.value))}
                  className="w-full cursor-pointer accent-[var(--accent,#818cf8)]"
                />
              </div>

              <p className="text-[11px] text-[var(--text-3,#63636b)] leading-relaxed">
                * Nếu sàn tạm dừng đúng giờ mua, kỳ đó sẽ được bỏ qua và không mua bù.
              </p>

              <Button
                data-testid="dca-create"
                type="button"
                variant="primary"
                fullWidth
                onClick={() => setCreateDcaModalOpen(true)}
              >
                Bắt đầu Mua định kỳ
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS & DRAWERS                                                          */}
      {/* ========================================================================= */}

      {/* Confirm Create Grid Bot Modal */}
      <Modal
        isOpen={createGridModalOpen}
        onClose={() => setCreateGridModalOpen(false)}
        title="Xác nhận khởi chạy Bot lưới"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[var(--text-2,#a1a1aa)] leading-relaxed">
            Bot lưới sẽ tự động quản lý các lệnh Mua và Bán trong khoảng giá đã chọn.
          </p>

          <div className="p-3 rounded-lg bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] space-y-2 font-mono">
            <div className="flex justify-between">
              <span className="text-[var(--text-3,#63636b)]">Cặp:</span>
              <span className="text-white font-bold">{gridSymbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-3,#63636b)]">Khoảng giá:</span>
              <span className="text-white">{lowerPrice} – {upperPrice} USDT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-3,#63636b)]">Số lưới:</span>
              <span className="text-white">{gridCount} ({gridMode === 'ARITHMETIC' ? 'Số học' : 'Hình học'})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-3,#63636b)]">Vốn đầu tư:</span>
              <span className="text-[var(--up,#1fc27a)] font-bold">{gridInvestment} USDT</span>
            </div>
          </div>

          {gridPreviewData && (
            <div className="p-3 rounded-lg bg-[var(--accent,#818cf8)]/10 border border-[var(--accent,#818cf8)]/30 text-[11px] text-white">
              ℹ️ Bot sẽ mua ngay <strong>{gridPreviewData.initialBuyQuantity} {currentSymbolInfo?.baseAsset}</strong> bằng lệnh Market khi bắt đầu để đặt các lưới bán phía trên.
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setCreateGridModalOpen(false)}>
              Hủy
            </Button>
            <Button
              data-testid="bot-confirm"
              variant="primary"
              loading={creatingGrid}
              onClick={handleCreateGridBot}
            >
              Xác nhận khởi chạy
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm Create DCA Plan Modal */}
      <Modal
        isOpen={createDcaModalOpen}
        onClose={() => setCreateDcaModalOpen(false)}
        title="Xác nhận tạo kế hoạch Mua định kỳ"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[var(--text-2,#a1a1aa)] leading-relaxed">
            Hệ thống sẽ tự động đặt lệnh Mua theo chu kỳ đã thiết lập.
          </p>

          <div className="p-3 rounded-lg bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] space-y-2 font-mono">
            <div className="flex justify-between">
              <span className="text-[var(--text-3,#63636b)]">Cặp:</span>
              <span className="text-white font-bold">{dcaSymbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-3,#63636b)]">Số tiền mỗi kỳ:</span>
              <span className="text-[var(--up,#1fc27a)] font-bold">{dcaQuoteAmount} USDT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-3,#63636b)]">Tần suất:</span>
              <span className="text-white">
                {dcaInterval === 'DAILY' ? 'Hằng ngày' : dcaInterval === 'WEEKLY' ? `Hằng tuần (Thứ ${dcaDayOfWeek + 1})` : `Hằng tháng (Ngày ${dcaDayOfMonth})`} lúc {dcaHour}:00 (GMT+7)
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setCreateDcaModalOpen(false)}>
              Hủy
            </Button>
            <Button
              data-testid="bot-confirm"
              variant="primary"
              loading={creatingDca}
              onClick={handleCreateDcaPlan}
            >
              Xác nhận
            </Button>
          </div>
        </div>
      </Modal>

      {/* Stop Grid Bot Modal */}
      <Modal
        isOpen={stoppingBot !== null}
        onClose={() => setStoppingBot(null)}
        title="Dừng bot lưới"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[var(--text-2,#a1a1aa)]">
            Bạn có chắc chắn muốn dừng bot lưới <strong>{stoppingBot?.symbol}</strong>? Toàn bộ lệnh đang chờ của bot sẽ bị hủy.
          </p>

          <div className="space-y-2 p-3 rounded-lg bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                data-testid="grid-stop-sell-base"
                checked={stoppingSellBase}
                onChange={(e) => setStoppingSellBase(e.target.checked)}
                className="accent-[var(--accent,#818cf8)] rounded cursor-pointer"
              />
              <span className="text-[var(--text-2,#a1a1aa)]">Bán coin bot đang giữ sang USDT (Lệnh thị trường)</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setStoppingBot(null)}>
              Hủy bỏ
            </Button>
            <Button
              data-testid="grid-stop-confirm"
              variant="primary"
              loading={stoppingAction}
              onClick={handleStopGridBot}
            >
              Xác nhận dừng bot
            </Button>
          </div>
        </div>
      </Modal>

      {/* Grid Bot Orders Modal */}
      <Modal
        isOpen={detailsBot !== null}
        onClose={() => setDetailsBot(null)}
        title={`Chi tiết bot lưới #${detailsBot?.id} — ${detailsBot?.symbol}`}
      >
        <div className="space-y-6 text-xs">
          {detailsBot && (
            <div className="p-4 rounded-xl bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-[var(--text-3,#63636b)]">Trạng thái:</span>
                <span className="font-bold text-white">{detailsBot.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-3,#63636b)]">Khoảng giá:</span>
                <span>{detailsBot.lowerPrice} – {detailsBot.upperPrice}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-3,#63636b)]">Vốn đầu tư:</span>
                <span>{detailsBot.investment} USDT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-3,#63636b)]">Lãi lưới đã chốt:</span>
                <span className="text-[var(--up,#1fc27a)] font-bold">+{detailsBot.gridProfit} USDT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-3,#63636b)]">Số vòng hoàn thành:</span>
                <span>{detailsBot.completedRounds}</span>
              </div>
            </div>
          )}

          <div>
            <h4 className="font-bold text-sm text-[var(--text,#f4f4f5)] mb-3">
              Danh sách lệnh của bot ({botOrders.length})
            </h4>

            {loadingOrders ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} height={36} className="w-full" />
                ))}
              </div>
            ) : botOrders.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-3,#63636b)]">Chưa có lệnh nào.</div>
            ) : (
              <div className="border border-[var(--line,#1d1e21)] rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Phe</TableHead>
                      <TableHead className="text-right text-xs">Giá</TableHead>
                      <TableHead className="text-right text-xs">Khối lượng</TableHead>
                      <TableHead className="text-right text-xs">Trạng thái</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {botOrders.map((ord) => (
                      <TableRow key={ord.id}>
                        <TableCell>
                          <span className={ord.side === 'BUY' ? 'text-[var(--up,#1fc27a)] font-bold' : 'text-[var(--down,#f2475f)] font-bold'}>
                            {ord.side === 'BUY' ? 'MUA' : 'BÁN'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatDecimal(ord.price)}</TableCell>
                        <TableCell className="text-right font-mono">{formatDecimal(ord.quantity)}</TableCell>
                        <TableCell className="text-right font-mono">
                          <Badge variant={ord.status === 'FILLED' ? 'success' : 'secondary'} size="sm">
                            {ord.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Edit DCA Quote Amount Modal */}
      <Modal
        isOpen={editDcaPlan !== null}
        onClose={() => setEditDcaPlan(null)}
        title={`Sửa số tiền mua định kỳ ${editDcaPlan?.symbol}`}
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[var(--text-2,#a1a1aa)] mb-1">
              Số tiền USDT mỗi kỳ mới:
            </label>
            <Input
              value={editDcaAmount}
              onChange={(e) => setEditDcaAmount(e.target.value)}
              rightAddon="USDT"
              placeholder="50"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEditDcaPlan(null)}>
              Hủy
            </Button>
            <Button variant="primary" loading={savingDcaEdit} onClick={handleSaveDcaAmount}>
              Lưu thay đổi
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel DCA Plan Modal */}
      <Modal
        isOpen={cancelDcaPlanItem !== null}
        onClose={() => setCancelDcaPlanItem(null)}
        title="Hủy kế hoạch Mua định kỳ"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[var(--text-2,#a1a1aa)] leading-relaxed">
            Bạn có chắc chắn muốn hủy kế hoạch Mua định kỳ <strong>{cancelDcaPlanItem?.symbol}</strong>?
            Sau khi hủy, kế hoạch sẽ dừng vĩnh viễn và không thực hiện thêm kỳ mua nào.
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setCancelDcaPlanItem(null)}>
              Không hủy
            </Button>
            <Button
              data-testid="dca-cancel-confirm"
              variant="primary"
              loading={cancelingDca}
              onClick={handleConfirmCancelDca}
            >
              Xác nhận hủy
            </Button>
          </div>
        </div>
      </Modal>

      {/* DCA Runs History Modal */}
      <Modal
        isOpen={viewRunsPlan !== null}
        onClose={() => setViewRunsPlan(null)}
        title={`Lịch sử các kỳ mua — ${viewRunsPlan?.symbol}`}
      >
        <div className="space-y-4 text-xs">
          {loadingRuns ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} height={36} className="w-full" />
              ))}
            </div>
          ) : dcaRunsList.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-3,#63636b)]">Chưa có kỳ mua nào được thực hiện.</div>
          ) : (
            <div className="border border-[var(--line,#1d1e21)] rounded-lg overflow-hidden max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Thời gian</TableHead>
                    <TableHead className="text-xs">Trạng thái</TableHead>
                    <TableHead className="text-right text-xs">Số tiền</TableHead>
                    <TableHead className="text-right text-xs">Lượng mua</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dcaRunsList.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-mono text-[11px] text-[var(--text-3,#63636b)]">
                        {new Date(run.scheduledAt).toLocaleString('vi-VN')}
                      </TableCell>
                      <TableCell>
                        {run.status === 'FILLED' ? (
                          <Badge variant="success" size="sm">Đã mua</Badge>
                        ) : (
                          <Badge variant="warning" size="sm" title={run.reason || ''}>
                            Bỏ qua ({run.reason === 'INSUFFICIENT_BALANCE' ? 'Không đủ USDT' : run.reason || 'Lỗi'})
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {run.status === 'FILLED' ? `${formatDecimal(run.quoteSpent)} USDT` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-white">
                        {run.status === 'FILLED' ? formatDecimal(run.baseBought) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => setViewRunsPlan(null)}>
              Đóng
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
