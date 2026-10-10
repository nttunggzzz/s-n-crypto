import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  FuturesTicker,
  FuturesPosition,
  FuturesOrder,
  FuturesAccount,
  MarkPrice,
  FuturesSymbolSettings,
  FundingEvent,
  FuturesTrade,
  FuturesSymbolInfo,
  UserEvent,
} from '@cex/contracts';
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
  Modal,
  DecimalInput,
  Skeleton,
  EmptyState,
  useToast,
  formatDecimal,
} from '@cex/ui';
import {
  ShieldAlert,
  ChevronDown,
  Info,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  X,
  Edit2,
  Sliders,
  AlertTriangle,
} from 'lucide-react';
import { CandlestickChart } from '../components/trading/CandlestickChart.tsx';
import { Orderbook } from '../components/trading/Orderbook.tsx';
import { MarketTrades } from '../components/trading/MarketTrades.tsx';
import { FuturesTransferModal } from '../components/FuturesTransferModal.tsx';
import {
  dec,
  roundDown,
  roundUp,
  floorToStep,
  initialMargin,
  liquidationPrice,
  pnl,
  returnOnMargin,
  ZERO,
} from '@cex/core';

export interface FuturesPageProps {
  symbolParam?: string;
  onNavigate: (path: string) => void;
}

export const FuturesPage: React.FC<FuturesPageProps> = ({
  symbolParam = 'BTCUSDT',
  onNavigate,
}) => {
  const { isAuthenticated } = useAuth();
  const { realtimeClient } = useMarket();
  const { success, error: toastError, info: toastInfo } = useToast();
  const api = getApiClient();

  const [symbol, setSymbol] = useState(symbolParam);
  const [tickers, setTickers] = useState<FuturesTicker[]>([]);
  const [markPrice, setMarkPrice] = useState<MarkPrice | null>(null);
  const [account, setAccount] = useState<FuturesAccount | null>(null);
  const [positions, setPositions] = useState<FuturesPosition[]>([]);
  const [openOrders, setOpenOrders] = useState<FuturesOrder[]>([]);
  const [orderHistory, setOrderHistory] = useState<FuturesOrder[]>([]);
  const [positionHistory, setPositionHistory] = useState<FuturesPosition[]>([]);
  const [fundingHistory, setFundingHistory] = useState<FundingEvent[]>([]);
  const [symbolSettings, setSymbolSettings] = useState<FuturesSymbolSettings[]>([]);
  const [symbolInfos, setSymbolInfos] = useState<FuturesSymbolInfo[]>([]);

  // Modals & Panels
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [leverageModalOpen, setLeverageModalOpen] = useState(false);
  const [adjustMarginModalOpen, setAdjustMarginModalOpen] = useState(false);
  const [adjustMarginPosition, setAdjustMarginPosition] = useState<FuturesPosition | null>(null);
  const [marginAdjustAmount, setMarginAdjustAmount] = useState('');
  const [marginAdjustDirection, setMarginAdjustDirection] = useState<'ADD' | 'REMOVE'>('ADD');

  const [tpslModalOpen, setTpslModalOpen] = useState(false);
  const [tpslPosition, setTpslPosition] = useState<FuturesPosition | null>(null);
  const [tpPriceInput, setTpPriceInput] = useState('');
  const [slPriceInput, setSlPriceInput] = useState('');

  const [closePositionModalOpen, setClosePositionModalOpen] = useState(false);
  const [closePositionTarget, setClosePositionTarget] = useState<FuturesPosition | null>(null);
  const [closeQtyInput, setCloseQtyInput] = useState('');

  // First-time warning banner state
  const [introDismissed, setIntroDismissed] = useState(
    () => localStorage.getItem('cex_futures_intro_dismissed') === 'true'
  );
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);

  // Active Futures Ticker
  const currentTicker = useMemo(() => {
    return tickers.find((t) => t.symbol === symbol) || null;
  }, [tickers, symbol]);

  // Current Symbol Leverage & Symbol Info
  const currentSettings = useMemo(() => {
    return symbolSettings.find((s) => s.symbol === symbol) || null;
  }, [symbolSettings, symbol]);

  const currentSymbolInfo = useMemo(() => {
    return symbolInfos.find((s) => s.symbol === symbol) || null;
  }, [symbolInfos, symbol]);

  const currentLeverage = currentSettings?.leverage || 10;
  const maxLeverage = currentSymbolInfo?.maxLeverage || 20;

  // Selected order tab
  const [bottomTab, setBottomTab] = useState<'positions' | 'orders' | 'orderHistory' | 'posHistory' | 'funding'>('positions');

  // Order Form State
  const [orderType, setOrderType] = useState<'LIMIT' | 'MARKET'>('LIMIT');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitMode, setUnitMode] = useState<'coin' | 'usdt'>('coin');
  const [sliderValue, setSliderValue] = useState(0);
  const [enableTpSl, setEnableTpSl] = useState(false);
  const [orderTpPrice, setOrderTpPrice] = useState('');
  const [orderSlPrice, setOrderSlPrice] = useState('');
  const [reduceOnly, setReduceOnly] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Load Initial Data
  const fetchData = useCallback(async () => {
    try {
      const [tRes, markRes, exInfo] = await Promise.all([
        api.futuresTickers(),
        api.futuresMarkPrice({ params: { symbol } }).catch(() => null),
        api.futuresExchangeInfo().catch(() => null),
      ]);
      setTickers(tRes.items);
      if (markRes) setMarkPrice(markRes);
      if (exInfo?.symbols) setSymbolInfos(exInfo.symbols);

      if (isAuthenticated) {
        const [acc, pos, ords, sets] = await Promise.all([
          api.futuresAccount().catch(() => null),
          api.futuresPositions().catch(() => ({ items: [] })),
          api.futuresOpenOrders({ query: { symbol } }).catch(() => ({ items: [] })),
          api.futuresSymbolSettings().catch(() => ({ items: [] })),
        ]);
        if (acc) setAccount(acc);
        setPositions(pos.items);
        setOpenOrders(ords.items);
        setSymbolSettings(sets.items);
      }
    } catch {}
  }, [api, symbol, isAuthenticated]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch Tab Specific Histories
  const fetchTabHistory = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      if (bottomTab === 'orderHistory') {
        const res = await api.futuresOrderHistory({ query: { symbol, limit: 50 } });
        setOrderHistory(res.items);
      } else if (bottomTab === 'posHistory') {
        const res = await api.futuresPositionHistory({ query: { limit: 50 } });
        setPositionHistory(res.items);
      } else if (bottomTab === 'funding') {
        const res = await api.futuresFundingHistory({ params: { symbol }, query: { limit: 30 } });
        setFundingHistory(res.items);
      }
    } catch {}
  }, [api, symbol, isAuthenticated, bottomTab]);

  useEffect(() => {
    fetchTabHistory();
  }, [fetchTabHistory]);

  // Realtime Subscriptions
  useEffect(() => {
    if (!realtimeClient) return;

    const unsubMark = realtimeClient.subscribe(`futures:mark:${symbol}`, (data: MarkPrice) => {
      setMarkPrice(data);
    });

    const unsubTicker = realtimeClient.subscribe(`futures:ticker:${symbol}`, (data: FuturesTicker) => {
      setTickers((prev) => prev.map((t) => (t.symbol === data.symbol ? data : t)));
    });

    let unsubUser: (() => void) | undefined;
    if (isAuthenticated) {
      unsubUser = realtimeClient.subscribe('user', (event: unknown) => {
        const ev = event as UserEvent;

        if (ev.kind === 'futuresAccount') {
          setAccount(ev.account);
        } else if (ev.kind === 'futuresPosition') {
          const p = ev.position;
          setPositions((prev) => {
            if (p.status === 'CLOSED') return prev.filter((item) => item.id !== p.id);
            const exists = prev.some((item) => item.id === p.id);
            if (exists) return prev.map((item) => (item.id === p.id ? p : item));
            return [p, ...prev];
          });
        } else if (ev.kind === 'futuresOrder') {
          const ord = ev.order;
          if (ord.status === 'NEW' || ord.status === 'PARTIALLY_FILLED') {
            setOpenOrders((prev) => {
              const exists = prev.some((o) => o.id === ord.id);
              if (exists) return prev.map((o) => (o.id === ord.id ? ord : o));
              return [ord, ...prev];
            });
          } else {
            setOpenOrders((prev) => prev.filter((o) => o.id !== ord.id));
          }
        } else if (ev.kind === 'notification') {
          if (ev.notification.type === 'POSITION_LIQUIDATED') {
            toastError(
              `Vị thế ${ev.notification.side} ${ev.notification.quantity} ${ev.notification.symbol} đã bị thanh lý ở ${ev.notification.markPrice} — mất ${ev.notification.lostMargin} USDT ký quỹ!`
            );
          } else if (ev.notification.type === 'POSITION_TPSL') {
            toastInfo(`Chốt lời / Cắt lỗ đã khớp, lãi lỗ: ${ev.notification.realizedPnl} USDT.`);
          }
        }
      });
    }

    return () => {
      unsubMark();
      unsubTicker();
      if (unsubUser) unsubUser();
    };
  }, [realtimeClient, symbol, isAuthenticated]);

  // Handle Leverage Change
  const [selectedLeverage, setSelectedLeverage] = useState(currentLeverage);
  useEffect(() => {
    setSelectedLeverage(currentLeverage);
  }, [currentLeverage]);

  const handleUpdateLeverage = async () => {
    try {
      const res = await api.futuresSetLeverage({
        params: { symbol },
        body: { leverage: selectedLeverage },
      });
      setSymbolSettings((prev) =>
        prev.map((s) => (s.symbol === symbol ? res : s))
      );
      success(`Đã cập nhật đòn bẩy ${symbol} lên ${selectedLeverage}×!`);
      setLeverageModalOpen(false);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'LEVERAGE_LOCKED') {
        toastError('Vui lòng đóng vị thế và hủy lệnh đang mở của cặp này trước khi đổi đòn bẩy.');
      } else {
        toastError('Không thể thay đổi đòn bẩy.');
      }
    }
  };

  // Calculations for Order Form
  const refPrice = orderType === 'LIMIT' && price ? dec(price) : markPrice?.markPrice ? dec(markPrice.markPrice) : ZERO;

  const calculatedQty = useMemo(() => {
    if (!quantity) return ZERO;
    try {
      const step = currentSymbolInfo?.stepSize || '0.001';
      if (unitMode === 'coin') return dec(quantity);
      if (refPrice.gt(0)) {
        const raw = dec(quantity).mul(currentLeverage).div(refPrice);
        return floorToStep(raw, dec(step));
      }
    } catch {}
    return ZERO;
  }, [quantity, unitMode, refPrice, currentLeverage, currentSymbolInfo]);

  const requiredMargin = useMemo(() => {
    if (calculatedQty.lte(0) || refPrice.lte(0)) return ZERO;
    try {
      return initialMargin(refPrice, calculatedQty, currentLeverage);
    } catch {}
    return ZERO;
  }, [calculatedQty, refPrice, currentLeverage]);

  // Est Liquidation Price (using maintenanceMarginRate from symbol info)
  const estLiqLong = useMemo(() => {
    if (calculatedQty.lte(0) || refPrice.lte(0) || requiredMargin.lte(0)) return null;
    try {
      const mmr = currentSymbolInfo?.maintenanceMarginRate ? dec(currentSymbolInfo.maintenanceMarginRate) : dec('0.005');
      return liquidationPrice('LONG', refPrice, calculatedQty, requiredMargin, mmr);
    } catch {}
    return null;
  }, [refPrice, calculatedQty, requiredMargin, currentSymbolInfo]);

  const estLiqShort = useMemo(() => {
    if (calculatedQty.lte(0) || refPrice.lte(0) || requiredMargin.lte(0)) return null;
    try {
      const mmr = currentSymbolInfo?.maintenanceMarginRate ? dec(currentSymbolInfo.maintenanceMarginRate) : dec('0.005');
      return liquidationPrice('SHORT', refPrice, calculatedQty, requiredMargin, mmr);
    } catch {}
    return null;
  }, [refPrice, calculatedQty, requiredMargin, currentSymbolInfo]);

  // Submit Order (Open Long / Open Short)
  const handlePlaceOrder = async (orderSide: 'BUY' | 'SELL') => {
    if (!isAuthenticated) {
      onNavigate('/login');
      return;
    }
    if (calculatedQty.lte(0)) {
      toastError('Vui lòng nhập khối lượng hợp lệ.');
      return;
    }
    if (orderType === 'LIMIT' && (!price || parseFloat(price) <= 0)) {
      toastError('Vui lòng nhập mức giá giới hạn.');
      return;
    }

    setSubmittingOrder(true);
    try {
      const body: any = {
        symbol,
        side: orderSide,
        type: orderType,
        quantity: calculatedQty.toString(),
        reduceOnly,
      };
      if (orderType === 'LIMIT') body.price = price;
      if (enableTpSl) {
        body.tpsl = {};
        if (orderTpPrice) body.tpsl.takeProfitPrice = orderTpPrice;
        if (orderSlPrice) body.tpsl.stopLossPrice = orderSlPrice;
      }

      await api.futuresPlaceOrder({ body });
      success(`Đã gửi lệnh Futures ${orderSide === 'BUY' ? 'Mở Long' : 'Mở Short'} thành công!`);
      setQuantity('');
      fetchData();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError(getErrorMessage(err.code));
      } else {
        toastError('Không thể gửi lệnh Futures.');
      }
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Close Position handler
  const handleClosePosition = async (pos: FuturesPosition, marketCloseAll = true) => {
    try {
      const body: any = { positionId: pos.id };
      if (!marketCloseAll && closeQtyInput) {
        body.quantity = closeQtyInput;
      }
      await api.futuresClosePosition({
        params: { symbol: pos.symbol },
        body,
      });
      success(`Đã đóng ${marketCloseAll ? 'toàn bộ' : closeQtyInput} vị thế ${pos.symbol}!`);
      setClosePositionModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError(getErrorMessage(err.code));
      } else {
        toastError('Không thể đóng vị thế.');
      }
    }
  };

  // Adjust Margin handler
  const handleAdjustMargin = async () => {
    if (!adjustMarginPosition || !marginAdjustAmount) return;
    try {
      const signedAmount = marginAdjustDirection === 'ADD' ? marginAdjustAmount : `-${marginAdjustAmount}`;
      await api.futuresAdjustMargin({
        params: { symbol: adjustMarginPosition.symbol },
        body: {
          amount: signedAmount,
        },
      });
      success(`Đã ${marginAdjustDirection === 'ADD' ? 'thêm' : 'giảm'} ký quỹ thành công!`);
      setAdjustMarginModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError(getErrorMessage(err.code));
      } else {
        toastError('Không thể điều chỉnh ký quỹ.');
      }
    }
  };

  // Set TP/SL handler
  const handleSaveTpSl = async () => {
    if (!tpslPosition) return;
    try {
      await api.futuresSetTpSl({
        params: { symbol: tpslPosition.symbol },
        body: {
          takeProfitPrice: tpPriceInput || null,
          stopLossPrice: slPriceInput || null,
        },
      });
      success('Đã cập nhật mức Chốt lời / Cắt lỗ!');
      setTpslModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError(getErrorMessage(err.code));
      } else {
        toastError('Không thể lưu cài đặt TP/SL.');
      }
    }
  };

  const currentPosition = positions.find((p) => p.symbol === symbol);

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)] bg-[var(--bg,#000000)] text-[var(--text,#f4f4f5)] text-xs select-none">
      {/* 1. First-time Intro Box */}
      {!introDismissed && (
        <div className="mx-4 mt-3 p-3.5 rounded-[var(--radius-lg,10px)] bg-[var(--accent,#818cf8)]/10 border border-[var(--accent,#818cf8)]/30 flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <ShieldAlert size={20} className="text-[var(--accent,#818cf8)] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-sm text-white">Chào mừng đến với Hợp đồng Futures Mô phỏng!</div>
              <ul className="list-disc list-inside text-xs text-[var(--text-2,#a1a1aa)] space-y-0.5">
                <li>Đòn bẩy tối đa lên tới 20× giúp gia tăng lợi nhuận nhưng cũng tăng rủi ro tương ứng.</li>
                <li>Vị thế có thể bị thanh lý tự động nếu ký quỹ không đủ bù đắp khoản lỗ.</li>
                <li>Môi trường mô phỏng an toàn: dùng số dư USDT thử nghiệm, không rủi ro tài chính thật.</li>
              </ul>
              <label className="flex items-center gap-1.5 pt-1 text-[11px] text-[var(--text-3,#63636b)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={doNotShowAgain}
                  onChange={(e) => setDoNotShowAgain(e.target.checked)}
                  className="accent-[var(--accent,#818cf8)]"
                />
                <span>Không hiển thị lại thông báo này</span>
              </label>
            </div>
          </div>
          <button
            onClick={() => {
              if (doNotShowAgain) localStorage.setItem('cex_futures_intro_dismissed', 'true');
              setIntroDismissed(true);
            }}
            className="p-1 rounded hover:bg-white/10 text-[var(--text-3,#63636b)] hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 2. Ticker Bar */}
      <div className="px-4 py-2 border-b border-[var(--line,#1d1e21)] bg-[var(--panel,#0a0a0b)] flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-white">{symbol}</h1>
            <Badge variant="outline" size="sm" className="text-[10px] text-[var(--accent,#818cf8)] border-[var(--accent,#818cf8)]/40 font-bold">
              Futures · Mô phỏng
            </Badge>
          </div>

          {/* Last Price */}
          <div className="flex flex-col">
            <span className="text-[10px] text-[var(--text-3,#63636b)]">Giá gần nhất</span>
            <span className="font-mono text-sm font-bold text-[var(--up,#1fc27a)]">
              {currentTicker ? formatDecimal(currentTicker.lastPrice) : '—'}
            </span>
          </div>

          {/* Mark Price */}
          <div className="flex flex-col">
            <span className="text-[10px] text-[var(--text-3,#63636b)]">Giá đánh dấu</span>
            <span className="font-mono text-xs font-bold text-[var(--accent,#818cf8)]">
              {markPrice ? formatDecimal(markPrice.markPrice) : '—'}
            </span>
          </div>

          {/* Index Price */}
          <div className="flex flex-col">
            <span className="text-[10px] text-[var(--text-3,#63636b)]">Giá chỉ số</span>
            <span className="font-mono text-xs text-[var(--text-2,#a1a1aa)]">
              {markPrice ? formatDecimal(markPrice.indexPrice) : '—'}
            </span>
          </div>

          {/* Funding Rate & Countdown */}
          <div className="flex flex-col">
            <span className="text-[10px] text-[var(--text-3,#63636b)]">Funding / Đếm ngược</span>
            <span className="font-mono text-xs text-[var(--warn,#f59e0b)] font-semibold">
              {markPrice?.fundingRate ? `${(parseFloat(markPrice.fundingRate) * 100).toFixed(4)}%` : '0.0100%'} · 04:22:15
            </span>
          </div>
        </div>

        {/* 24h Stats */}
        <div className="hidden lg:flex items-center gap-6 font-mono text-[11px] text-[var(--text-2,#a1a1aa)]">
          <div>
            <div className="text-[10px] text-[var(--text-3,#63636b)] font-sans">Cao 24h</div>
            <div className="text-white font-semibold">{currentTicker ? formatDecimal(currentTicker.highPrice) : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-3,#63636b)] font-sans">Thấp 24h</div>
            <div className="text-white font-semibold">{currentTicker ? formatDecimal(currentTicker.lowPrice) : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-3,#63636b)] font-sans">KL 24h (USDT)</div>
            <div className="text-white font-semibold">{currentTicker ? formatDecimal(currentTicker.quoteVolume, { decimals: 2 }) : '—'}</div>
          </div>
        </div>
      </div>

      {/* 3. Main Workspace: Desktop Grid */}
      <div className="flex-1 flex flex-col lg:flex-row p-1 gap-1">
        {/* Left / Middle: Chart, Orderbook & Trades */}
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <div className="flex flex-col xl:flex-row gap-1 h-[480px]">
            {/* Chart Area */}
            <div className="flex-1 min-w-0">
              <CandlestickChart
                symbol={symbol}
                marketType="futures"
                futuresPosition={currentPosition}
              />
            </div>

            {/* Orderbook & Trades */}
            <div className="w-full xl:w-[280px] h-[480px]">
              <Orderbook symbol={symbol} marketType="futures" onSelectPrice={setPrice} />
            </div>
          </div>

          {/* Bottom Tabs Panel */}
          <div className="flex-1 bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,10px)] overflow-hidden flex flex-col min-h-[260px]">
            {/* Header Tabs */}
            <div className="px-4 py-2 border-b border-[var(--line,#1d1e21)] flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs font-semibold">
                <button
                  onClick={() => setBottomTab('positions')}
                  className={`pb-1 border-b-2 transition-colors cursor-pointer ${
                    bottomTab === 'positions' ? 'border-[var(--accent,#818cf8)] text-white' : 'border-transparent text-[var(--text-3,#63636b)] hover:text-white'
                  }`}
                >
                  Vị thế ({positions.length})
                </button>
                <button
                  onClick={() => setBottomTab('orders')}
                  className={`pb-1 border-b-2 transition-colors cursor-pointer ${
                    bottomTab === 'orders' ? 'border-[var(--accent,#818cf8)] text-white' : 'border-transparent text-[var(--text-3,#63636b)] hover:text-white'
                  }`}
                >
                  Lệnh đang chờ ({openOrders.length})
                </button>
                <button
                  onClick={() => setBottomTab('orderHistory')}
                  className={`pb-1 border-b-2 transition-colors cursor-pointer ${
                    bottomTab === 'orderHistory' ? 'border-[var(--accent,#818cf8)] text-white' : 'border-transparent text-[var(--text-3,#63636b)] hover:text-white'
                  }`}
                >
                  Lịch sử lệnh
                </button>
                <button
                  onClick={() => setBottomTab('posHistory')}
                  className={`pb-1 border-b-2 transition-colors cursor-pointer ${
                    bottomTab === 'posHistory' ? 'border-[var(--accent,#818cf8)] text-white' : 'border-transparent text-[var(--text-3,#63636b)] hover:text-white'
                  }`}
                >
                  Lịch sử vị thế
                </button>
                <button
                  onClick={() => setBottomTab('funding')}
                  className={`pb-1 border-b-2 transition-colors cursor-pointer ${
                    bottomTab === 'funding' ? 'border-[var(--accent,#818cf8)] text-white' : 'border-transparent text-[var(--text-3,#63636b)] hover:text-white'
                  }`}
                >
                  Lịch sử Funding
                </button>
              </div>

              {bottomTab === 'orders' && openOrders.length > 0 && (
                <button
                  onClick={async () => {
                    await api.futuresCancelAll({ query: { symbol } });
                    setOpenOrders([]);
                    success('Đã hủy toàn bộ lệnh Futures!');
                  }}
                  className="text-xs text-[var(--text-3,#63636b)] hover:text-white bg-[var(--panel-2,#141416)] px-2.5 py-1 rounded border border-[var(--line,#1d1e21)] cursor-pointer"
                >
                  Hủy tất cả
                </button>
              )}
            </div>

            {/* Content Table */}
            <div className="flex-1 p-2 overflow-x-auto">
              {bottomTab === 'positions' ? (
                positions.length === 0 ? (
                  <EmptyState title="Chưa có vị thế mở" description="Các vị thế Long/Short đang nắm giữ sẽ hiển thị tại đây." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cặp / Chiều</TableHead>
                        <TableHead className="text-right">Khối lượng</TableHead>
                        <TableHead className="text-right">Giá vào TB</TableHead>
                        <TableHead className="text-right">Giá đánh dấu</TableHead>
                        <TableHead className="text-right">Giá thanh lý</TableHead>
                        <TableHead className="text-right">Ký quỹ (Cô lập)</TableHead>
                        <TableHead className="text-right">Lãi lỗ chưa chốt (ROE%)</TableHead>
                        <TableHead className="text-center">TP / SL</TableHead>
                        <TableHead className="text-right">Đóng vị thế</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {positions.map((pos) => {
                        const mPrice = markPrice?.markPrice ? dec(markPrice.markPrice) : dec(pos.entryPrice);
                        const unrealized = pnl(pos.side, dec(pos.entryPrice), mPrice, dec(pos.quantity));
                        const roe = returnOnMargin(unrealized, dec(pos.margin));
                        const isPos = unrealized.gt(ZERO);
                        const isNeg = unrealized.lt(ZERO);

                        return (
                          <TableRow key={pos.id}>
                            <TableCell className="font-bold">
                              <div className="flex items-center gap-1.5">
                                <span className={pos.side === 'LONG' ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}>
                                  {pos.side} {pos.leverage}×
                                </span>
                                <span className="text-white">{pos.symbol}</span>
                              </div>
                            </TableCell>

                            <TableCell className="text-right font-mono font-medium text-white">
                              {formatDecimal(pos.quantity)}
                            </TableCell>

                            <TableCell className="text-right font-mono text-[var(--text-2,#a1a1aa)]">
                              {formatDecimal(pos.entryPrice)}
                            </TableCell>

                            <TableCell className="text-right font-mono text-[var(--accent,#818cf8)]">
                              {markPrice ? formatDecimal(markPrice.markPrice) : '—'}
                            </TableCell>

                            <TableCell className="text-right font-mono font-bold text-[var(--down,#f2475f)]">
                              {pos.liquidationPrice ? formatDecimal(pos.liquidationPrice) : '—'}
                            </TableCell>

                            <TableCell className="text-right font-mono">
                              <div className="flex items-center justify-end gap-1">
                                <span>{formatDecimal(pos.margin, { decimals: 2 })} USDT</span>
                                <button
                                  onClick={() => {
                                    setAdjustMarginPosition(pos);
                                    setAdjustMarginModalOpen(true);
                                  }}
                                  className="p-1 hover:text-[var(--accent,#818cf8)] text-[var(--text-3,#63636b)] cursor-pointer"
                                  title="Điều chỉnh ký quỹ"
                                >
                                  <Edit2 size={12} />
                                </button>
                              </div>
                            </TableCell>

                            <TableCell className="text-right font-mono font-bold">
                              <div className={isPos ? 'text-[var(--up,#1fc27a)]' : isNeg ? 'text-[var(--down,#f2475f)]' : 'text-white'}>
                                <div>{isPos ? `+${formatDecimal(unrealized.toString(), { decimals: 2 })}` : formatDecimal(unrealized.toString(), { decimals: 2 })} USDT</div>
                                <div className="text-[10px]">
                                  {roe ? `${isPos ? '+' : ''}${(parseFloat(roe.toString()) * 100).toFixed(2)}%` : '0.00%'}
                                </div>
                              </div>
                            </TableCell>

                            <TableCell className="text-center font-mono text-[11px]">
                              <button
                                onClick={() => {
                                  setTpslPosition(pos);
                                  setTpPriceInput(pos.takeProfitPrice || '');
                                  setSlPriceInput(pos.stopLossPrice || '');
                                  setTpslModalOpen(true);
                                }}
                                className="px-2 py-0.5 rounded bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] hover:border-[var(--accent,#818cf8)] cursor-pointer"
                              >
                                {pos.takeProfitPrice || pos.stopLossPrice ? `${pos.takeProfitPrice || '—'} / ${pos.stopLossPrice || '—'}` : 'Thêm'}
                              </button>
                            </TableCell>

                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleClosePosition(pos, true)}
                                  className="text-[var(--down,#f2475f)] hover:bg-[var(--down,#f2475f)]/10 text-[11px] px-2 py-1"
                                >
                                  Thị trường
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setClosePositionTarget(pos);
                                    setCloseQtyInput(pos.quantity);
                                    setClosePositionModalOpen(true);
                                  }}
                                  className="text-[var(--text-2,#a1a1aa)] hover:text-white text-[11px] px-2 py-1"
                                >
                                  Một phần
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )
              ) : bottomTab === 'orders' ? (
                openOrders.length === 0 ? (
                  <EmptyState title="Không có lệnh Futures đang chờ" description="Lệnh Giới hạn chưa khớp sẽ hiển thị tại đây." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Thời gian</TableHead>
                        <TableHead>Cặp</TableHead>
                        <TableHead>Loại / Chiều</TableHead>
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
                          <TableCell className="font-mono text-[var(--text-3,#63636b)]">
                            {new Date(ord.createdAt).toLocaleTimeString('vi-VN')}
                          </TableCell>
                          <TableCell className="font-bold">{ord.symbol}</TableCell>
                          <TableCell className={ord.side === 'BUY' ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}>
                            {ord.side === 'BUY' ? 'MUA' : 'BÁN'} {ord.type}
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatDecimal(ord.price)}</TableCell>
                          <TableCell className="text-right font-mono">{formatDecimal(ord.quantity)}</TableCell>
                          <TableCell className="text-right font-mono text-[var(--text-3,#63636b)]">{formatDecimal(ord.executedQty)}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" size="sm">{ord.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                await api.futuresCancelOrder({ params: { orderId: ord.id } });
                                setOpenOrders((prev) => prev.filter((o) => o.id !== ord.id));
                                success('Đã hủy lệnh thành công.');
                              }}
                              className="text-[var(--down,#f2475f)] text-xs px-2 py-0.5"
                            >
                              Hủy
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
              ) : (
                <div className="py-12 text-center text-xs text-[var(--text-3,#63636b)]">
                  Đang tải dữ liệu lịch sử...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Futures Order Form */}
        <div className="w-full lg:w-[320px] bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,10px)] p-4 flex flex-col gap-3 shrink-0">
          {/* Top Control Chips: Margin Mode & Leverage */}
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled
              className="py-1.5 px-3 rounded-[var(--radius-md,6px)] bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] font-semibold text-xs text-white text-center"
            >
              Cô lập (Isolated)
            </button>

            <button
              onClick={() => setLeverageModalOpen(true)}
              className="py-1.5 px-3 rounded-[var(--radius-md,6px)] bg-[var(--panel-2,#141416)] hover:bg-[var(--line,#1d1e21)] border border-[var(--accent,#818cf8)]/40 font-bold text-xs text-[var(--accent,#818cf8)] flex items-center justify-center gap-1 cursor-pointer transition-colors"
            >
              <Sliders size={13} />
              <span>Đòn bẩy {currentLeverage}×</span>
            </button>
          </div>

          {/* Order Type Tabs */}
          <div className="grid grid-cols-2 gap-1 p-0.5 rounded bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] text-[11px] font-semibold text-center">
            <button
              onClick={() => setOrderType('LIMIT')}
              className={`py-1 rounded transition-colors cursor-pointer ${orderType === 'LIMIT' ? 'bg-[var(--line,#1d1e21)] text-white' : 'text-[var(--text-3,#63636b)]'}`}
            >
              Giới hạn (Limit)
            </button>
            <button
              onClick={() => setOrderType('MARKET')}
              className={`py-1 rounded transition-colors cursor-pointer ${orderType === 'MARKET' ? 'bg-[var(--line,#1d1e21)] text-white' : 'text-[var(--text-3,#63636b)]'}`}
            >
              Thị trường (Market)
            </button>
          </div>

          {/* Available Balance Row with Transfer Button */}
          <div className="flex items-center justify-between text-[11px] text-[var(--text-3,#63636b)]">
            <div className="flex items-center gap-1">
              <span>Khả dụng:</span>
              <span className="font-mono text-white font-semibold">
                {isAuthenticated ? `${formatDecimal(account?.available || '0.00', { decimals: 2 })} USDT` : '—'}
              </span>
            </div>
            <button
              onClick={() => setTransferModalOpen(true)}
              className="text-[var(--accent,#818cf8)] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
            >
              <ArrowRightLeft size={11} />
              <span>Chuyển tiền</span>
            </button>
          </div>

          {/* Price Input (for Limit) */}
          {orderType === 'LIMIT' && (
            <DecimalInput
              label="Giá đặt lệnh"
              value={price}
              onValueChange={setPrice}
              unit="USDT"
              placeholder={markPrice?.markPrice || '0.00'}
            />
          )}

          {/* Quantity Input with Coin / USDT Switch */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-[var(--text-3,#63636b)] mb-1">
              <span>Khối lượng</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setUnitMode('coin')}
                  className={`cursor-pointer ${unitMode === 'coin' ? 'text-[var(--accent,#818cf8)] font-bold' : 'text-[var(--text-3,#63636b)]'}`}
                >
                  {symbol.replace('USDT', '')}
                </button>
                <span>/</span>
                <button
                  onClick={() => setUnitMode('usdt')}
                  className={`cursor-pointer ${unitMode === 'usdt' ? 'text-[var(--accent,#818cf8)] font-bold' : 'text-[var(--text-3,#63636b)]'}`}
                >
                  USDT
                </button>
              </div>
            </div>
            <DecimalInput
              value={quantity}
              onValueChange={setQuantity}
              unit={unitMode === 'coin' ? symbol.replace('USDT', '') : 'USDT'}
              placeholder="0.0000"
            />
          </div>

          {/* Percentage Slider */}
          <div className="my-1">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={sliderValue}
              onChange={(e) => {
                const val = Number(e.target.value);
                setSliderValue(val);
                if (account?.available && refPrice.gt(0)) {
                  const step = currentSymbolInfo?.stepSize || '0.001';
                  const maxAffordable = dec(account.available).mul(currentLeverage).div(refPrice);
                  const q = floorToStep(maxAffordable.mul(dec((val / 100).toString())), dec(step));
                  setQuantity(unitMode === 'coin' ? q.toString() : roundDown(q.mul(refPrice), 2).toString());
                }
              }}
              className="w-full h-1 bg-[var(--line,#1d1e21)] rounded-lg appearance-none cursor-pointer accent-[var(--accent,#818cf8)]"
            />
            <div className="flex justify-between text-[9px] text-[var(--text-3,#63636b)] mt-1 font-mono">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>70%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Checkboxes: TP/SL & Reduce Only */}
          <div className="flex items-center justify-between pt-1 border-t border-[var(--line,#1d1e21)] text-[11px]">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={enableTpSl}
                onChange={(e) => setEnableTpSl(e.target.checked)}
                className="accent-[var(--accent,#818cf8)]"
              />
              <span>TP / SL</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={reduceOnly}
                onChange={(e) => setReduceOnly(e.target.checked)}
                className="accent-[var(--accent,#818cf8)]"
              />
              <span>Chỉ giảm vị thế</span>
            </label>
          </div>

          {/* TP/SL inputs if checked */}
          {enableTpSl && (
            <div className="grid grid-cols-2 gap-2 p-2 rounded bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)]">
              <div>
                <span className="text-[10px] text-[var(--up,#1fc27a)] font-semibold">Chốt lời (TP)</span>
                <input
                  type="text"
                  value={orderTpPrice}
                  onChange={(e) => setOrderTpPrice(e.target.value)}
                  placeholder="Giá TP"
                  className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded px-2 py-1 text-xs text-white mt-0.5"
                />
              </div>
              <div>
                <span className="text-[10px] text-[var(--down,#f2475f)] font-semibold">Cắt lỗ (SL)</span>
                <input
                  type="text"
                  value={orderSlPrice}
                  onChange={(e) => setOrderSlPrice(e.target.value)}
                  placeholder="Giá SL"
                  className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded px-2 py-1 text-xs text-white mt-0.5"
                />
              </div>
            </div>
          )}

          {/* Estimated Calculations Box */}
          <div className="space-y-1.5 p-2.5 rounded bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] text-[11px] text-[var(--text-3,#63636b)]">
            <div className="flex items-center justify-between">
              <span>Ký quỹ ban đầu:</span>
              <span className="font-mono text-white">{roundDown(requiredMargin, 2).toString()} USDT</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Giá thanh lý (Long):</span>
              <span className="font-mono text-[var(--down,#f2475f)] font-semibold">
                {estLiqLong ? formatDecimal(estLiqLong.toString()) : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Giá thanh lý (Short):</span>
              <span className="font-mono text-[var(--up,#1fc27a)] font-semibold">
                {estLiqShort ? formatDecimal(estLiqShort.toString()) : '—'}
              </span>
            </div>
          </div>

          {/* Two Big Action Buttons: Mở Long / Mở Short */}
          <div className="grid grid-cols-2 gap-2 mt-1">
            <Button
              variant="buy"
              size="lg"
              loading={submittingOrder}
              onClick={() => handlePlaceOrder('BUY')}
              className="py-3 font-bold text-sm tracking-wide"
            >
              {currentPosition?.side === 'SHORT' ? 'Đóng Short' : 'Mở Long'}
            </Button>
            <Button
              variant="sell"
              size="lg"
              loading={submittingOrder}
              onClick={() => handlePlaceOrder('SELL')}
              className="py-3 font-bold text-sm tracking-wide"
            >
              {currentPosition?.side === 'LONG' ? 'Đóng Long' : 'Mở Short'}
            </Button>
          </div>
        </div>
      </div>

      {/* Leverage Modal */}
      {leverageModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setLeverageModalOpen(false)}
          title={`Điều chỉnh đòn bẩy (${symbol})`}
          maxWidth="sm"
        >
          <div className="p-5 flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-3,#63636b)]">Đòn bẩy hiện tại:</span>
              <span className="font-bold text-lg text-[var(--accent,#818cf8)]">{selectedLeverage}×</span>
            </div>

            <input
              type="range"
              min="1"
              max={maxLeverage}
              step="1"
              value={selectedLeverage}
              onChange={(e) => setSelectedLeverage(Number(e.target.value))}
              className="w-full h-1.5 bg-[var(--line,#1d1e21)] rounded-lg appearance-none cursor-pointer accent-[var(--accent,#818cf8)]"
            />

            <div className="grid grid-cols-5 gap-1.5 text-center font-mono">
              {[1, 5, 10, 15, 20].filter((v) => v <= maxLeverage).map((val) => (
                <button
                  key={val}
                  onClick={() => setSelectedLeverage(val)}
                  className={`py-1.5 rounded border text-xs font-bold cursor-pointer transition-colors ${
                    selectedLeverage === val
                      ? 'bg-[var(--accent,#818cf8)] text-black border-[var(--accent,#818cf8)]'
                      : 'bg-[var(--panel-2,#141416)] text-[var(--text-2,#a1a1aa)] border-[var(--line,#1d1e21)] hover:text-white'
                  }`}
                >
                  {val}×
                </button>
              ))}
            </div>

            {selectedLeverage > 10 && (
              <div className="p-2 rounded bg-[var(--warn,#f59e0b)]/10 border border-[var(--warn,#f59e0b)]/30 text-[11px] text-[var(--warn,#f59e0b)] flex items-center gap-1.5">
                <AlertTriangle size={15} className="shrink-0" />
                <span>Đòn bẩy cao trên 10× gia tăng rủi ro thanh lý nhanh chóng trong các đợt biến động mạnh.</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[var(--line,#1d1e21)] mt-2">
              <Button variant="secondary" onClick={() => setLeverageModalOpen(false)}>Hủy</Button>
              <Button variant="primary" onClick={handleUpdateLeverage}>Xác nhận</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Adjust Margin Modal */}
      {adjustMarginModalOpen && adjustMarginPosition && (
        <Modal
          isOpen={true}
          onClose={() => setAdjustMarginModalOpen(false)}
          title="Điều chỉnh ký quỹ vị thế"
          maxWidth="sm"
        >
          <div className="p-5 flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-3,#63636b)]">Ký quỹ hiện tại:</span>
              <span className="font-bold font-mono text-white">{formatDecimal(adjustMarginPosition.margin, { decimals: 2 })} USDT</span>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 bg-[var(--panel-2,#141416)] rounded border border-[var(--line,#1d1e21)] text-center font-bold">
              <button
                onClick={() => setMarginAdjustDirection('ADD')}
                className={`py-1.5 rounded cursor-pointer transition-colors ${marginAdjustDirection === 'ADD' ? 'bg-[var(--up,#1fc27a)] text-white' : 'text-[var(--text-3,#63636b)]'}`}
              >
                + Thêm ký quỹ
              </button>
              <button
                onClick={() => setMarginAdjustDirection('REMOVE')}
                className={`py-1.5 rounded cursor-pointer transition-colors ${marginAdjustDirection === 'REMOVE' ? 'bg-[var(--down,#f2475f)] text-white' : 'text-[var(--text-3,#63636b)]'}`}
              >
                − Giảm ký quỹ
              </button>
            </div>

            <DecimalInput
              label="Số tiền USDT điều chỉnh"
              value={marginAdjustAmount}
              onValueChange={setMarginAdjustAmount}
              maxDecimals={2}
              unit="USDT"
              placeholder="0.00"
            />

            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[var(--line,#1d1e21)]">
              <Button variant="secondary" onClick={() => setAdjustMarginModalOpen(false)}>Hủy</Button>
              <Button variant="primary" onClick={handleAdjustMargin}>Xác nhận</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* TP/SL Position Modal */}
      {tpslModalOpen && tpslPosition && (
        <Modal
          isOpen={true}
          onClose={() => setTpslModalOpen(false)}
          title="Cài đặt Chốt lời / Cắt lỗ cho vị thế"
          maxWidth="sm"
        >
          <div className="p-5 flex flex-col gap-4 text-xs">
            <div className="text-[11px] text-[var(--text-3,#63636b)]">
              Vị thế: <span className="font-bold text-white">{tpslPosition.side} {tpslPosition.quantity} {tpslPosition.symbol}</span> ở giá vào <span className="font-bold text-white">{tpslPosition.entryPrice}</span>
            </div>

            <DecimalInput
              label="Mức giá Chốt lời (TP)"
              value={tpPriceInput}
              onValueChange={setTpPriceInput}
              unit="USDT"
              placeholder="Để trống nếu không đặt"
            />

            <DecimalInput
              label="Mức giá Cắt lỗ (SL)"
              value={slPriceInput}
              onValueChange={setSlPriceInput}
              unit="USDT"
              placeholder="Để trống nếu không đặt"
            />

            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[var(--line,#1d1e21)]">
              <Button variant="secondary" onClick={() => setTpslModalOpen(false)}>Hủy</Button>
              <Button variant="primary" onClick={handleSaveTpSl}>Lưu thay đổi</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Close Partial Position Modal */}
      {closePositionModalOpen && closePositionTarget && (
        <Modal
          isOpen={true}
          onClose={() => setClosePositionModalOpen(false)}
          title="Đóng vị thế một phần"
          maxWidth="sm"
        >
          <div className="p-5 flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--text-3,#63636b)]">Tổng khối lượng hiện tại:</span>
              <span className="font-bold text-white font-mono">{closePositionTarget.quantity}</span>
            </div>

            <DecimalInput
              label="Khối lượng muốn đóng theo giá thị trường"
              value={closeQtyInput}
              onValueChange={setCloseQtyInput}
              unit={closePositionTarget.symbol.replace('USDT', '')}
              placeholder="0.0000"
            />

            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[var(--line,#1d1e21)]">
              <Button variant="secondary" onClick={() => setClosePositionModalOpen(false)}>Hủy</Button>
              <Button variant="danger" onClick={() => handleClosePosition(closePositionTarget, false)}>
                Xác nhận đóng
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Transfer Modal */}
      <FuturesTransferModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        onTransferred={fetchData}
      />
    </div>
  );
};
