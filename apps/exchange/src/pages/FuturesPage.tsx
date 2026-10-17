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
  FuturesExchangeInfo,
  UserEvent,
  FuturesPlaceOrderRequest,
  Depth,
} from '@cex/contracts';
import { countdown, resolveFuturesSymbol, ApiError, TRADE_BLOCK_LABELS } from '@cex/contracts';

type ClosePositionBody = { quantity?: string };
import { getApiClient } from '../services/api.ts';
import { formatApiError, getErrorMessage } from '../services/errors.ts';
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
  minDec,
} from '@cex/core';

export interface FuturesPageProps {
  symbolParam?: string;
  onNavigate: (path: string) => void;
}

const KNOWN_1000: Record<string, string> = {
  PEPEUSDT: '1000PEPEUSDT',
  SHIBUSDT: '1000SHIBUSDT',
  BONKUSDT: '1000BONKUSDT',
  FLOKIUSDT: '1000FLOKIUSDT',
};

const resolveInitialFuturesSymbol = (raw: string): string => {
  const upper = (raw || '').toUpperCase();
  return KNOWN_1000[upper] || raw || 'BTCUSDT';
};

export const FuturesPage: React.FC<FuturesPageProps> = ({
  symbolParam = 'BTCUSDT',
  onNavigate,
}) => {
  const { isAuthenticated } = useAuth();
  const { symbols: spotSymbols, realtimeClient, activeTradeBlock, tradingHalted } = useMarket();
  const { success, error: toastError, info: toastInfo } = useToast();
  const api = getApiClient();

  const [symbol, setSymbol] = useState(() => {
    const init = resolveInitialFuturesSymbol(symbolParam);
    if (init !== symbolParam && typeof window !== 'undefined') {
      window.history.replaceState({}, '', `/futures/${init}`);
    }
    return init;
  });
  const [tickers, setTickers] = useState<FuturesTicker[]>([]);
  const [markPrice, setMarkPrice] = useState<MarkPrice | null>(null);
  const [account, setAccount] = useState<FuturesAccount | null>(null);
  const [positions, setPositions] = useState<FuturesPosition[]>([]);
  const [openOrders, setOpenOrders] = useState<FuturesOrder[]>([]);
  const [orderHistory, setOrderHistory] = useState<FuturesOrder[]>([]);
  const [positionHistory, setPositionHistory] = useState<FuturesPosition[]>([]);
  const [fundingHistory, setFundingHistory] = useState<FundingEvent[]>([]);
  const [futuresTrades, setFuturesTrades] = useState<FuturesTrade[]>([]);
  const [symbolSettings, setSymbolSettings] = useState<FuturesSymbolSettings[]>([]);
  const [symbolInfos, setSymbolInfos] = useState<FuturesSymbolInfo[]>([]);
  const [futuresExchangeInfo, setFuturesExchangeInfo] = useState<FuturesExchangeInfo | null>(null);
  const [depth, setDepth] = useState<Depth | null>(null);

  // Ticking now for countdown
  const [now, setNow] = useState(Date.now());
  const [confirmOrdersPref, setConfirmOrdersPref] = useState(true);
  const [confirmOrderData, setConfirmOrderData] = useState<{ side: 'BUY' | 'SELL'; body: FuturesPlaceOrderRequest } | null>(null);
  const [showContractSelector, setShowContractSelector] = useState(false);
  const [contractSearch, setContractSearch] = useState('');

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

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch preferences
  useEffect(() => {
    if (isAuthenticated) {
      api.getPreferences()
        .then((pref) => {
          if (typeof pref.confirmOrders === 'boolean') {
            setConfirmOrdersPref(pref.confirmOrders);
          }
        })
        .catch(() => {});
    }
  }, [api, isAuthenticated]);

  // Symbol resolution for Spot -> Futures (REVIEW-03 A4)
  useEffect(() => {
    const fallback = resolveInitialFuturesSymbol(symbolParam);
    if (symbolInfos.length > 0) {
      const resolved = resolveFuturesSymbol(symbolParam, symbolInfos, spotSymbols || []) || fallback;
      if (resolved !== symbol) {
        setSymbol(resolved);
        if (resolved !== symbolParam) {
          window.history.replaceState({}, '', `/futures/${resolved}`);
        }
      }
    } else if (fallback !== symbol) {
      setSymbol(fallback);
      if (fallback !== symbolParam) {
        window.history.replaceState({}, '', `/futures/${fallback}`);
      }
    }
  }, [symbolParam, symbolInfos, spotSymbols, symbol]);

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
  const [bottomTab, setBottomTab] = useState<'positions' | 'orders' | 'trades' | 'orderHistory' | 'posHistory' | 'funding'>('positions');
  const setActiveTab = setBottomTab;

  const currentPosition = useMemo(() => positions.find((p) => p.symbol === symbol), [positions, symbol]);
  const baseAsset = currentSymbolInfo?.baseAsset || symbol.replace('USDT', '');

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
    const cur = resolveInitialFuturesSymbol(symbol);
    try {
      const [tRes, markRes, exInfo, depthRes] = await Promise.all([
        api.futuresTickers(),
        api.futuresMarkPrice({ params: { symbol: cur } }).catch(() => null),
        api.futuresExchangeInfo().catch(() => null),
        api.futuresDepth({ params: { symbol: cur }, query: { limit: 20 } }).catch(() => null),
      ]);
      setTickers(tRes.items);
      if (markRes) setMarkPrice(markRes);
      if (exInfo) setFuturesExchangeInfo(exInfo);
      if (exInfo?.symbols) setSymbolInfos(exInfo.symbols);
      if (depthRes) setDepth(depthRes);

      if (isAuthenticated) {
        const [acc, pos, ords, sets] = await Promise.all([
          api.futuresAccount().catch(() => null),
          api.futuresPositions().catch(() => ({ items: [] })),
          api.futuresOpenOrders({ query: { symbol: cur } }).catch(() => ({ items: [] })),
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
    const cur = resolveInitialFuturesSymbol(symbol);
    try {
      if (bottomTab === 'orderHistory') {
        const res = await api.futuresOrderHistory({ query: { symbol: cur, limit: 50 } });
        setOrderHistory(res.items);
      } else if (bottomTab === 'trades') {
        const res = await api.futuresMyTrades({ query: { symbol: cur, limit: 50 } });
        setFuturesTrades(res.items);
      } else if (bottomTab === 'posHistory') {
        const res = await api.futuresPositionHistory({ query: { limit: 50 } });
        setPositionHistory(res.items);
      } else if (bottomTab === 'funding') {
        const res = await api.futuresFundingHistory({ params: { symbol: cur }, query: { limit: 30 } });
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

    const unsubTickers = realtimeClient.subscribe('futures:tickers', (data: { items: FuturesTicker[] }) => {
      setTickers(data.items);
    });

    const unsubMark = realtimeClient.subscribe(`futures:mark:${symbol}`, (data: MarkPrice) => {
      setMarkPrice(data);
    });

    const unsubTicker = realtimeClient.subscribe(`futures:ticker:${symbol}`, (data: FuturesTicker) => {
      setTickers((prev) => prev.map((t) => (t.symbol === data.symbol ? data : t)));
    });

    const unsubDepth = realtimeClient.subscribe(`futures:depth:${symbol}`, (data: unknown) => {
      setDepth(data as Depth);
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
      unsubTickers();
      unsubMark();
      unsubTicker();
      unsubDepth();
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
      const isLocked = (err instanceof ApiError && err.code === 'LEVERAGE_LOCKED') ||
        (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'LEVERAGE_LOCKED');
      const msg = formatApiError(err, 'Không thể thay đổi đòn bẩy.', undefined, {
        symbol,
        baseAsset,
        positionQty: currentPosition?.quantity,
        openOrdersCount: openOrders.filter((o) => o.symbol === symbol).length,
      });
      if (isLocked) {
        toastError(
          <div className="flex flex-col gap-1.5 items-start">
            <span>{msg}</span>
            <button
              type="button"
              onClick={() => {
                setBottomTab('positions');
                setLeverageModalOpen(false);
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent,#818cf8)] underline hover:opacity-80 cursor-pointer"
            >
              Xem vị thế
            </button>
          </div>
        );
      } else {
        toastError(msg);
      }
    }
  };

  // Calculations for Order Form & Confirmation Modal (S-02)
  const refPrice = useMemo(() => {
    if (orderType === 'LIMIT') {
      if (price) {
        try {
          const p = dec(price);
          if (p.gt(0)) return p;
        } catch {}
      }
      return markPrice?.markPrice ? dec(markPrice.markPrice) : ZERO;
    }
    return markPrice?.markPrice ? dec(markPrice.markPrice) : ZERO;
  }, [orderType, price, markPrice?.markPrice]);

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

  const orderNotional = useMemo(() => {
    if (calculatedQty.lte(0) || refPrice.lte(0)) return ZERO;
    if (orderType === 'LIMIT' && (!price || parseFloat(price) <= 0)) return ZERO;
    try {
      return refPrice.mul(calculatedQty);
    } catch {
      return ZERO;
    }
  }, [calculatedQty, refPrice, orderType, price]);

  // Keep notionalValue as alias for compatibility with S-01
  const notionalValue = orderNotional;

  const takerFeeRate = useMemo(() => {
    return futuresExchangeInfo?.fees?.takerFee || '0.0005';
  }, [futuresExchangeInfo]);

  const makerFeeRate = useMemo(() => {
    return futuresExchangeInfo?.fees?.makerFee || '0.0002';
  }, [futuresExchangeInfo]);

  const takerFeePercent = useMemo(() => {
    try {
      return formatDecimal(dec(takerFeeRate).mul(100).toString());
    } catch {
      return '0,05';
    }
  }, [takerFeeRate]);

  const makerFeePercent = useMemo(() => {
    try {
      return formatDecimal(dec(makerFeeRate).mul(100).toString());
    } catch {
      return '0,02';
    }
  }, [makerFeeRate]);

  const estMargin = useMemo(() => {
    if (calculatedQty.lte(0) || refPrice.lte(0)) return ZERO;
    if (orderType === 'LIMIT' && (!price || parseFloat(price) <= 0)) return ZERO;
    try {
      return initialMargin(refPrice, calculatedQty, currentLeverage);
    } catch {
      return ZERO;
    }
  }, [calculatedQty, refPrice, currentLeverage, orderType, price]);

  // Keep requiredMargin as alias for compatibility
  const requiredMargin = estMargin;

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

  const futuresAvailable = useMemo(() => {
    return account?.available ? dec(account.available) : ZERO;
  }, [account?.available]);

  const estFee = useMemo(() => {
    if (orderNotional.lte(0)) return ZERO;
    try {
      return roundUp(orderNotional.mul(dec(takerFeeRate)));
    } catch {
      return ZERO;
    }
  }, [orderNotional, takerFeeRate]);

  const totalCost = useMemo(() => {
    return estMargin.add(estFee);
  }, [estMargin, estFee]);

  // Max calculations (S-02)
  const stepSize = useMemo(() => {
    return dec(currentSymbolInfo?.stepSize || '0.001');
  }, [currentSymbolInfo?.stepSize]);

  const maxByBalance = useMemo(() => {
    if (refPrice.lte(0) || futuresAvailable.lte(0) || currentLeverage <= 0) return ZERO;
    try {
      const denom = refPrice.div(currentLeverage).add(refPrice.mul(dec(takerFeeRate)));
      return denom.gt(0) ? floorToStep(futuresAvailable.div(denom), stepSize) : ZERO;
    } catch {
      return ZERO;
    }
  }, [refPrice, futuresAvailable, currentLeverage, takerFeeRate, stepSize]);

  const maxByDepthLong = useMemo(() => {
    if (!depth?.asks || depth.asks.length === 0) return ZERO;
    try {
      const slice = depth.asks.slice(0, 20);
      return slice.reduce((sum, [, qty]) => sum.add(dec(qty)), ZERO);
    } catch {
      return ZERO;
    }
  }, [depth?.asks]);

  const maxByDepthShort = useMemo(() => {
    if (!depth?.bids || depth.bids.length === 0) return ZERO;
    try {
      const slice = depth.bids.slice(0, 20);
      return slice.reduce((sum, [, qty]) => sum.add(dec(qty)), ZERO);
    } catch {
      return ZERO;
    }
  }, [depth?.bids]);

  const maxLong = useMemo(() => {
    if (orderType === 'MARKET' && maxByDepthLong.gt(0)) {
      return floorToStep(minDec(maxByBalance, maxByDepthLong), stepSize);
    }
    return maxByBalance;
  }, [orderType, maxByDepthLong, maxByBalance, stepSize]);

  const maxShort = useMemo(() => {
    if (orderType === 'MARKET' && maxByDepthShort.gt(0)) {
      return floorToStep(minDec(maxByBalance, maxByDepthShort), stepSize);
    }
    return maxByBalance;
  }, [orderType, maxByDepthShort, maxByBalance, stepSize]);

  // Funding calculations (S-02)
  const fundingRate = markPrice?.fundingRate || '0';

  const fundingRatePercent = useMemo(() => {
    try {
      return formatDecimal(dec(fundingRate).mul(100).toString());
    } catch {
      return '0';
    }
  }, [fundingRate]);

  const fundingCountdown = useMemo(() => {
    if (markPrice?.nextFundingTime) {
      const cd = countdown(markPrice.nextFundingTime, now);
      if (cd) return cd;
    }
    const nowDate = new Date(now);
    const nextTarget = new Date(now);
    const currentHour = nowDate.getUTCHours();
    const nextFundingHour = (Math.floor(currentHour / 8) + 1) * 8;
    nextTarget.setUTCHours(nextFundingHour, 0, 0, 0);
    return countdown(nextTarget.toISOString(), now) || '00:00:00';
  }, [markPrice?.nextFundingTime, now]);

  const estFunding = useMemo(() => {
    if (orderNotional.lte(0)) return ZERO;
    try {
      return orderNotional.mul(dec(fundingRate).abs());
    } catch {
      return ZERO;
    }
  }, [orderNotional, fundingRate]);

  const fundingPayer = useMemo(() => {
    try {
      const fr = dec(fundingRate);
      if (fr.gt(0)) return 'Long trả Short';
      if (fr.lt(0)) return 'Short trả Long';
    } catch {}
    return 'Không tính phí funding';
  }, [fundingRate]);

  const handleFillMax = useCallback(() => {
    const targetMax = currentPosition?.side === 'SHORT' ? maxShort : maxLong;
    const chosenMax = targetMax.gt(0) ? targetMax : (maxLong.gt(0) ? maxLong : maxShort);
    if (chosenMax.lte(0)) return;

    if (unitMode === 'coin') {
      setQuantity(chosenMax.toString());
    } else {
      if (refPrice.gt(0)) {
        setQuantity(roundDown(chosenMax.mul(refPrice), 2).toString());
      }
    }
    setSliderValue(100);
  }, [currentPosition?.side, maxShort, maxLong, unitMode, refPrice]);

  const isTradingHalted = tradingHalted || Boolean(futuresExchangeInfo?.tradingHalted) || activeTradeBlock === 'HALTED';
  const isMarketDataStale = markPrice === null || markPrice.status !== 'LIVE' || currentTicker?.status === 'STALE' || activeTradeBlock === 'PRICE_STALE';
  const isSymbolDisabled = Boolean(currentSymbolInfo && (currentSymbolInfo.enabled === false || (currentSymbolInfo as { status?: string }).status === 'DISABLED')) || activeTradeBlock === 'PAIR_DISABLED';

  const blockReason = useMemo<string | null>(() => {
    if (isTradingHalted) {
      return 'Sàn giao dịch đang tạm dừng khẩn cấp';
    }
    if (isMarketDataStale || markPrice === null) {
      return 'Dữ liệu thị trường bị gián đoạn';
    }
    if (isSymbolDisabled) {
      return 'Cặp giao dịch đang tạm ngưng';
    }
    const minQtyStr = (currentSymbolInfo as { minQuantity?: string } | null)?.minQuantity || currentSymbolInfo?.minQty || '0.001';
    const minNotionalStr = currentSymbolInfo?.minNotional || '5';

    if (calculatedQty.gt(0)) {
      if (calculatedQty.lt(dec(minQtyStr))) {
        return `Khối lượng nhỏ hơn mức tối thiểu (${minQtyStr} ${baseAsset})`;
      }
      if (notionalValue.lt(dec(minNotionalStr))) {
        return `Giá trị lệnh nhỏ hơn mức tối thiểu (${minNotionalStr} USDT)`;
      }
      if (isAuthenticated && totalCost.gt(futuresAvailable)) {
        return `Cần thêm ~${formatDecimal(totalCost.sub(futuresAvailable).toString(), { decimals: 2 })} USDT (ký quỹ + phí)`;
      }
    }
    return null;
  }, [
    isTradingHalted,
    isMarketDataStale,
    markPrice,
    isSymbolDisabled,
    currentSymbolInfo,
    calculatedQty,
    baseAsset,
    notionalValue,
    isAuthenticated,
    totalCost,
    futuresAvailable,
  ]);

  const isInsufficientBalanceBlock = useMemo(() => {
    return isAuthenticated && calculatedQty.gt(0) && totalCost.gt(futuresAvailable);
  }, [isAuthenticated, calculatedQty, totalCost, futuresAvailable]);

  // Submit Order (Open Long / Open Short)
  const handlePlaceOrder = async (orderSide: 'BUY' | 'SELL') => {
    if (!isAuthenticated) {
      onNavigate('/login');
      return;
    }
    if (blockReason) {
      toastError(blockReason);
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

    const tpslPayload = enableTpSl ? {
      ...(orderTpPrice ? { takeProfitPrice: orderTpPrice } : {}),
      ...(orderSlPrice ? { stopLossPrice: orderSlPrice } : {}),
    } : undefined;

    const body: FuturesPlaceOrderRequest = orderType === 'LIMIT'
      ? {
          symbol,
          side: orderSide,
          type: 'LIMIT',
          price,
          quantity: calculatedQty.toString(),
          reduceOnly,
          ...(tpslPayload && Object.keys(tpslPayload).length > 0 ? { tpsl: tpslPayload } : {}),
        }
      : {
          symbol,
          side: orderSide,
          type: 'MARKET',
          quantity: calculatedQty.toString(),
          reduceOnly,
          ...(tpslPayload && Object.keys(tpslPayload).length > 0 ? { tpsl: tpslPayload } : {}),
        };

    if (confirmOrdersPref) {
      setConfirmOrderData({ side: orderSide, body });
    } else {
      await executePlaceOrder(body, orderSide);
    }
  };

  const executePlaceOrder = async (body: FuturesPlaceOrderRequest, orderSide: 'BUY' | 'SELL') => {
    setSubmittingOrder(true);
    try {
      await api.futuresPlaceOrder({ body });
      success(`Đã gửi lệnh Futures ${orderSide === 'BUY' ? 'Mở Long' : 'Mở Short'} thành công!`);
      setQuantity('');
      setConfirmOrderData(null);
      fetchData();
    } catch (err: unknown) {
      const isInsufficient = (err instanceof ApiError && err.code === 'INSUFFICIENT_BALANCE') ||
        (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'INSUFFICIENT_BALANCE');

      const errMessage = formatApiError(err, 'Không thể gửi lệnh Futures.', undefined, {
        needed: totalCost.gt(futuresAvailable) ? totalCost.sub(futuresAvailable).toString() : undefined,
        currentNotional: formatDecimal(notionalValue.toString(), { decimals: 2 }),
        baseAsset,
        symbol,
        side: orderSide,
        available: futuresAvailable.toString(),
        positionQty: currentPosition?.quantity,
        openOrdersCount: openOrders.filter((o) => o.symbol === symbol).length,
      });

      if (isInsufficient) {
        toastError(
          <div className="flex flex-col gap-1.5 items-start">
            <span>{errMessage}</span>
            <button
              type="button"
              onClick={() => setTransferModalOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent,#818cf8)] underline hover:opacity-80 cursor-pointer"
            >
              Chuyển từ Spot
            </button>
          </div>
        );
      } else {
        toastError(errMessage);
      }
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Close Position handler
  const handleClosePosition = async (pos: FuturesPosition, marketCloseAll = true) => {
    try {
      const body: ClosePositionBody = marketCloseAll || !closeQtyInput ? {} : { quantity: closeQtyInput };
      await api.futuresClosePosition({
        params: { symbol: pos.symbol },
        body,
      });
      success(`Đã đóng ${marketCloseAll ? 'toàn bộ' : closeQtyInput} vị thế ${pos.symbol}!`);
      setClosePositionModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      toastError(formatApiError(err, 'Không thể đóng vị thế.', undefined, {
        symbol: pos.symbol,
        baseAsset,
        positionQty: pos.quantity,
        side: pos.side === 'LONG' ? 'SELL' : 'BUY',
      }));
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
      const isInsufficient = (err instanceof ApiError && err.code === 'INSUFFICIENT_BALANCE') ||
        (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'INSUFFICIENT_BALANCE');
      const msg = formatApiError(err, 'Không thể điều chỉnh ký quỹ.', undefined, {
        available: futuresAvailable.toString(),
        symbol: adjustMarginPosition.symbol,
        baseAsset,
      });
      if (isInsufficient) {
        toastError(
          <div className="flex flex-col gap-1.5 items-start">
            <span>{msg}</span>
            <button
              type="button"
              onClick={() => {
                setTransferModalOpen(true);
                setAdjustMarginModalOpen(false);
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent,#818cf8)] underline hover:opacity-80 cursor-pointer"
            >
              Chuyển từ Spot
            </button>
          </div>
        );
      } else {
        toastError(msg);
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
      toastError(formatApiError(err, 'Không thể lưu cài đặt TP/SL.', undefined, {
        side: tpslPosition.side === 'LONG' ? 'BUY' : 'SELL',
        symbol: tpslPosition.symbol,
      }));
    }
  };

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
      <div className="px-4 py-2 border-b border-[var(--line,#1d1e21)] bg-[var(--panel,#0a0a0b)] flex flex-wrap items-center justify-between gap-4 shrink-0 relative z-30">
        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              onClick={() => setShowContractSelector((prev) => !prev)}
              className="flex items-center gap-2 hover:bg-[var(--line,#1d1e21)] px-2 py-1 rounded transition-colors cursor-pointer"
            >
              <h1 className="text-base font-bold text-white flex items-center gap-1">
                {symbol}
                <ChevronDown size={14} className="text-[var(--text-3,#63636b)]" />
              </h1>
              <Badge variant="outline" size="sm" className="text-[10px] text-[var(--accent,#818cf8)] border-[var(--accent,#818cf8)]/40 font-bold">
                Futures · Vĩnh cửu
              </Badge>
            </button>

            {/* Contract Selector Dropdown (REVIEW-03 A4) */}
            {showContractSelector && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-lg shadow-2xl p-2 z-50">
                <input
                  type="text"
                  placeholder="Tìm kiếm hợp đồng..."
                  value={contractSearch}
                  onChange={(e) => setContractSearch(e.target.value)}
                  className="w-full px-2 py-1 bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] rounded text-xs text-white mb-2 focus:outline-none focus:border-[var(--accent,#818cf8)]"
                  autoFocus
                />
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {symbolInfos
                    .filter((c) => {
                      const q = contractSearch.trim().toUpperCase();
                      return !q || c.symbol.includes(q) || c.underlyingAsset.includes(q);
                    })
                    .map((c) => {
                      const t = tickers.find((x) => x.symbol === c.symbol);
                      return (
                        <div
                          key={c.symbol}
                          onClick={() => {
                            setSymbol(c.symbol);
                            window.history.replaceState({}, '', `/futures/${c.symbol}`);
                            setShowContractSelector(false);
                          }}
                          className={`flex items-center justify-between p-2 rounded cursor-pointer text-xs hover:bg-[var(--panel-2,#141416)] ${
                            c.symbol === symbol ? 'bg-[var(--panel-2,#141416)] font-bold text-[var(--accent,#818cf8)]' : 'text-white'
                          }`}
                        >
                          <div>
                            <div>{c.symbol}</div>
                            <div className="text-[10px] text-[var(--text-3,#63636b)]">Đơn vị: {c.multiplier}× {c.underlyingAsset}</div>
                          </div>
                          <div className="text-right font-mono">
                            <div>{t?.lastPrice ? formatDecimal(t.lastPrice) : '—'}</div>
                            <div className={`text-[10px] ${t?.priceChangePercent?.startsWith('-') ? 'text-[var(--down,#f2475f)]' : 'text-[var(--up,#1fc27a)]'}`}>
                              {t?.priceChangePercent ? `${t.priceChangePercent}%` : '—'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
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

          {/* Funding Rate & Countdown (REVIEW-03 A2) */}
          <div className="flex flex-col">
            <span className="text-[10px] text-[var(--text-3,#63636b)]">Funding / Đếm ngược</span>
            <span className="font-mono text-xs text-[var(--warn,#f59e0b)] font-semibold flex items-center gap-1">
              <span>
                {markPrice?.fundingRate
                  ? `${formatDecimal(dec(markPrice.fundingRate).mul(100).toString(), { decimals: 4 })}%`
                  : '—'}
              </span>
              <span>·</span>
              <span data-testid="funding-countdown">
                {countdown(markPrice?.nextFundingTime, now) || '—'}
              </span>
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

      {activeTradeBlock && (
        <div data-testid="trade-block-reason" className="bg-[var(--down,#f2475f)]/10 text-[var(--down,#f2475f)] px-4 py-2 text-sm text-center border-b border-[var(--down,#f2475f)]/20 font-medium">
          {TRADE_BLOCK_LABELS[activeTradeBlock] || 'Giao dịch tạm thời bị khóa'}
        </div>
      )}

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
              <Orderbook symbol={symbol} marketType="futures" onSelectPrice={setPrice} onDepthChange={setDepth} />
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
                  onClick={() => setBottomTab('trades')}
                  className={`pb-1 border-b-2 transition-colors cursor-pointer ${
                    bottomTab === 'trades' ? 'border-[var(--accent,#818cf8)] text-white' : 'border-transparent text-[var(--text-3,#63636b)] hover:text-white'
                  }`}
                >
                  Lịch sử khớp
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
                          <TableRow key={pos.id} data-testid="position-row">
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
                                  {roe ? `${isPos ? '+' : ''}${(parseFloat(roe.toString()) * 100).toFixed(2)}%` : '—'}
                                </div>
                              </div>
                            </TableCell>

                            <TableCell className="text-center font-mono text-[11px]">
                              <button
                                data-testid="position-tpsl"
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
                                  data-testid="position-close"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setClosePositionTarget(pos);
                                    setCloseQtyInput(pos.quantity);
                                    setClosePositionModalOpen(true);
                                  }}
                                  className="text-[var(--down,#f2475f)] hover:bg-[var(--down,#f2475f)]/10 text-[11px] px-2 py-1"
                                >
                                  Đóng
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
              ) : bottomTab === 'trades' ? (
                futuresTrades.length === 0 ? (
                  <EmptyState title="Chưa có lượt khớp lệnh Futures" description="Lịch sử các giao dịch đã khớp của hợp đồng sẽ hiển thị tại đây." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Thời gian</TableHead>
                        <TableHead>Cặp</TableHead>
                        <TableHead>Chiều</TableHead>
                        <TableHead className="text-right">Giá khớp</TableHead>
                        <TableHead className="text-right">Khối lượng</TableHead>
                        <TableHead className="text-right">Phí</TableHead>
                        <TableHead className="text-right">Lãi/Lỗ đã chốt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {futuresTrades.map((tr) => {
                        const pnlVal = tr.realizedPnl ? parseFloat(tr.realizedPnl) : 0;
                        return (
                          <TableRow key={tr.id}>
                            <TableCell className="font-mono text-[var(--text-3,#63636b)]">
                              {new Date(tr.createdAt).toLocaleTimeString('vi-VN')}
                            </TableCell>
                            <TableCell className="font-bold">{tr.symbol}</TableCell>
                            <TableCell className={tr.side === 'BUY' ? 'text-[var(--up,#1fc27a)] font-bold' : 'text-[var(--down,#f2475f)] font-bold'}>
                              {tr.side === 'BUY' ? 'MUA' : 'BÁN'}
                            </TableCell>
                            <TableCell className="text-right font-mono">{formatDecimal(tr.price)}</TableCell>
                            <TableCell className="text-right font-mono">{formatDecimal(tr.quantity)}</TableCell>
                            <TableCell className="text-right font-mono text-[var(--text-3,#63636b)]">{formatDecimal(tr.fee)} {tr.feeAsset}</TableCell>
                            <TableCell className={`text-right font-mono font-bold ${pnlVal > 0 ? 'text-[var(--up,#1fc27a)]' : pnlVal < 0 ? 'text-[var(--down,#f2475f)]' : 'text-white'}`}>
                              {tr.realizedPnl ? `${pnlVal > 0 ? '+' : ''}${formatDecimal(tr.realizedPnl)} USDT` : '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )
              ) : bottomTab === 'orderHistory' ? (
                orderHistory.length === 0 ? (
                  <EmptyState title="Không có lịch sử lệnh Futures" description="Các lệnh đã đóng hoặc hủy sẽ hiển thị tại đây." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Thời gian</TableHead>
                        <TableHead>Cặp</TableHead>
                        <TableHead>Chiều / Loại</TableHead>
                        <TableHead className="text-right">Giá đặt</TableHead>
                        <TableHead className="text-right">Khối lượng</TableHead>
                        <TableHead className="text-right">Đã khớp</TableHead>
                        <TableHead className="text-center">Trạng thái</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderHistory.map((ord) => (
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
                            <Badge variant={ord.status === 'FILLED' ? 'success' : 'secondary'} size="sm">{ord.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
              ) : bottomTab === 'posHistory' ? (
                positionHistory.length === 0 ? (
                  <EmptyState title="Chưa có lịch sử vị thế" description="Lịch sử các vị thế đã đóng sẽ hiển thị tại đây." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Thời gian đóng</TableHead>
                        <TableHead>Cặp</TableHead>
                        <TableHead>Chiều</TableHead>
                        <TableHead className="text-right">Giá vào TB</TableHead>
                        <TableHead className="text-right">Khối lượng</TableHead>
                        <TableHead className="text-right">Ký quỹ</TableHead>
                        <TableHead className="text-center">Trạng thái</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {positionHistory.map((pos) => (
                        <TableRow key={pos.id}>
                          <TableCell className="font-mono text-[var(--text-3,#63636b)]">
                            {pos.closedAt ? new Date(pos.closedAt).toLocaleTimeString('vi-VN') : '—'}
                          </TableCell>
                          <TableCell className="font-bold">{pos.symbol}</TableCell>
                          <TableCell className={pos.side === 'LONG' ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}>
                            {pos.side} {pos.leverage}×
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatDecimal(pos.entryPrice)}</TableCell>
                          <TableCell className="text-right font-mono">{formatDecimal(pos.quantity)}</TableCell>
                          <TableCell className="text-right font-mono">{formatDecimal(pos.margin)} USDT</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" size="sm">ĐÃ ĐÓNG</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
              ) : (
                fundingHistory.length === 0 ? (
                  <EmptyState title="Chưa có lịch sử Funding" description="Các kỳ thanh toán funding của hợp đồng sẽ hiển thị tại đây." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Thời gian</TableHead>
                        <TableHead className="text-right">Funding Rate</TableHead>
                        <TableHead className="text-right">Giá đánh dấu</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fundingHistory.map((f, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-[var(--text-3,#63636b)]">
                            {new Date(f.fundingTime).toLocaleString('vi-VN')}
                          </TableCell>
                          <TableCell className="text-right font-mono text-[var(--warn,#f59e0b)] font-semibold">
                            {(parseFloat(f.rate) * 100).toFixed(4)}%
                          </TableCell>
                          <TableCell className="text-right font-mono text-[var(--accent,#818cf8)]">
                            {formatDecimal(f.markPrice)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
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
              data-testid="futures-order-type-market"
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
              data-testid="futures-transfer-open"
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

          {/* Quantity Input with Coin / USDT Switch & Max Button */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-[var(--text-3,#63636b)] mb-1">
              <div className="flex items-center gap-1.5">
                <span>Khối lượng</span>
                <button
                  type="button"
                  data-testid="futures-max-btn"
                  onClick={handleFillMax}
                  className="text-[10px] text-[var(--accent,#818cf8)] font-semibold hover:underline cursor-pointer"
                >
                  Tối đa
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button
                  data-testid="futures-unit-coin"
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
              data-testid="futures-qty"
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
                const targetMax = currentPosition?.side === 'SHORT' ? maxShort : maxLong;
                const chosenMax = targetMax.gt(0) ? targetMax : maxLong;
                if (chosenMax.gt(0)) {
                  const q = floorToStep(chosenMax.mul(dec((val / 100).toString())), stepSize);
                  setQuantity(unitMode === 'coin' ? q.toString() : (refPrice.gt(0) ? roundDown(q.mul(refPrice), 2).toString() : ''));
                }
              }}
              className="w-full h-1 bg-[var(--line,#1d1e21)] rounded-lg appearance-none cursor-pointer accent-[var(--accent,#818cf8)]"
            />
            <div className="flex justify-between text-[9px] text-[var(--text-3,#63636b)] mt-1 font-mono">
              {[0, 25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    setSliderValue(pct);
                    const targetMax = currentPosition?.side === 'SHORT' ? maxShort : maxLong;
                    const chosenMax = targetMax.gt(0) ? targetMax : maxLong;
                    if (chosenMax.gt(0)) {
                      const q = floorToStep(chosenMax.mul(dec((pct / 100).toString())), stepSize);
                      setQuantity(unitMode === 'coin' ? q.toString() : (refPrice.gt(0) ? roundDown(q.mul(refPrice), 2).toString() : ''));
                    }
                  }}
                  className="hover:text-white cursor-pointer"
                >
                  {pct}%
                </button>
              ))}
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
              <span>Giá trị lệnh:</span>
              <span data-testid="futures-est-notional" className="font-mono text-white">
                {formatDecimal(orderNotional.toString())} USDT
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span>Ký quỹ ban đầu:</span>
              <span data-testid="futures-est-margin" className="font-mono text-white">
                {formatDecimal(estMargin.toString())} USDT
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span>Phí mở (ước tính):</span>
              <span data-testid="futures-est-fee" className="font-mono text-white text-right">
                {formatDecimal(estFee.toString())} USDT ({takerFeePercent}% taker){orderType === 'LIMIT' ? `; tối đa theo taker, khớp maker ${makerFeePercent}% thì hoàn chênh` : ''}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Tổng cần:</span>
              <span
                data-testid="futures-est-cost"
                data-value={totalCost.toString()}
                className="font-mono font-bold text-[var(--accent,#818cf8)]"
              >
                {formatDecimal(totalCost.toString())} USDT
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span>Khả dụng ví Futures:</span>
              <span data-testid="futures-available" className="font-mono text-white">
                {isAuthenticated ? `${formatDecimal(futuresAvailable.toString())} USDT` : '—'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span>Tối đa mở được:</span>
              <div className="flex items-center gap-2 font-mono text-[10px]">
                <span className="text-[var(--up,#1fc27a)]">
                  Long: <span data-testid="futures-max-long">{maxLong.toString()} {baseAsset}</span>
                </span>
                <span className="text-[var(--down,#f2475f)]">
                  Short: <span data-testid="futures-max-short">{maxShort.toString()} {baseAsset}</span>
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span>Funding:</span>
              <span data-testid="futures-est-funding" className="font-mono text-right text-[var(--warn,#f59e0b)]">
                {fundingRatePercent}% · còn {fundingCountdown} (~{formatDecimal(estFunding.toString())} USDT; {fundingPayer})
              </span>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-[var(--line,#1d1e21)]">
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
              data-testid="futures-open-long"
              variant="buy"
              size="lg"
              disabled={Boolean(blockReason) || submittingOrder}
              loading={submittingOrder}
              onClick={() => handlePlaceOrder('BUY')}
              className="py-3 font-bold text-sm tracking-wide"
            >
              {currentPosition?.side === 'SHORT' ? 'Đóng Short' : 'Mở Long'}
            </Button>
            <Button
              data-testid="futures-open-short"
              variant="sell"
              size="lg"
              disabled={Boolean(blockReason) || submittingOrder}
              loading={submittingOrder}
              onClick={() => handlePlaceOrder('SELL')}
              className="py-3 font-bold text-sm tracking-wide"
            >
              {currentPosition?.side === 'LONG' ? 'Đóng Long' : 'Mở Short'}
            </Button>
          </div>

          {blockReason && (
            <div
              data-testid="futures-order-block-reason"
              className="text-[var(--down,#f2475f)] text-[11px] mt-1.5 text-center flex items-center justify-center gap-1.5 flex-wrap"
            >
              <span>{blockReason}</span>
              {isInsufficientBalanceBlock && (
                <button
                  type="button"
                  onClick={() => setTransferModalOpen(true)}
                  className="underline font-semibold hover:opacity-80 text-[var(--accent,#818cf8)] cursor-pointer"
                >
                  Chuyển từ Spot
                </button>
              )}
            </div>
          )}

          <div className="text-[10px] text-center text-[var(--color-text-muted,#6b7280)] mt-2">
            Futures: chưa có quy định thuế, không khấu trừ
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
              data-testid="tpsl-take-profit"
              label="Mức giá Chốt lời (TP)"
              value={tpPriceInput}
              onValueChange={setTpPriceInput}
              unit="USDT"
              placeholder="Để trống nếu không đặt"
            />

            <DecimalInput
              data-testid="tpsl-stop-loss"
              label="Mức giá Cắt lỗ (SL)"
              value={slPriceInput}
              onValueChange={setSlPriceInput}
              unit="USDT"
              placeholder="Để trống nếu không đặt"
            />

            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[var(--line,#1d1e21)]">
              <Button variant="secondary" onClick={() => setTpslModalOpen(false)}>Hủy</Button>
              <Button data-testid="tpsl-save" variant="primary" onClick={handleSaveTpSl}>Lưu thay đổi</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Close Position Modal */}
      {closePositionModalOpen && closePositionTarget && (
        <Modal
          isOpen={true}
          onClose={() => setClosePositionModalOpen(false)}
          title="Đóng vị thế"
          maxWidth="sm"
        >
          <div className="p-5 flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--text-3,#63636b)]">Tổng khối lượng vị thế:</span>
              <span className="font-bold text-white font-mono">{closePositionTarget.quantity} {closePositionTarget.symbol.replace('USDT', '')}</span>
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
              <Button
                data-testid="close-confirm"
                variant="danger"
                onClick={() => handleClosePosition(closePositionTarget, !closeQtyInput || closeQtyInput === closePositionTarget.quantity)}
              >
                Xác nhận đóng
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Order Confirmation Modal */}
      {confirmOrderData && (
        <Modal
          isOpen={true}
          onClose={() => setConfirmOrderData(null)}
          title="Xác nhận đặt lệnh Hợp đồng"
          maxWidth="sm"
        >
          <div className="p-4 flex flex-col gap-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line,#1d1e21)]">
              <span className="text-[var(--text-3,#63636b)]">Hợp đồng:</span>
              <span className="font-bold text-white">{symbol}</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line,#1d1e21)]">
              <span className="text-[var(--text-3,#63636b)]">Loại lệnh & Chiều:</span>
              <span className={`font-bold ${confirmOrderData.side === 'BUY' ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}`}>
                {confirmOrderData.side === 'BUY' ? 'MUA / MỞ LONG' : 'BÁN / MỞ SHORT'} ({confirmOrderData.body.type})
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line,#1d1e21)]">
              <span className="text-[var(--text-3,#63636b)]">Khối lượng:</span>
              <span className="font-mono text-white font-bold">{confirmOrderData.body.quantity} {baseAsset}</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line,#1d1e21)]">
              <span className="text-[var(--text-3,#63636b)]">Mức giá:</span>
              <span className="font-mono text-white font-bold">
                {confirmOrderData.body.type === 'LIMIT' && confirmOrderData.body.price
                  ? `${confirmOrderData.body.price} USDT`
                  : `Thị trường (~${formatDecimal(refPrice.toString())} USDT)`}
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line,#1d1e21)]">
              <span className="text-[var(--text-3,#63636b)]">Giá trị lệnh:</span>
              <span data-testid="futures-confirm-notional" className="font-mono text-white font-semibold">
                {formatDecimal(orderNotional.toString())} USDT
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line,#1d1e21)]">
              <span className="text-[var(--text-3,#63636b)]">Ký quỹ ban đầu:</span>
              <span data-testid="futures-confirm-margin" className="font-mono text-white font-semibold">
                {formatDecimal(estMargin.toString())} USDT
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line,#1d1e21)]">
              <span className="text-[var(--text-3,#63636b)]">Phí mở (ước tính):</span>
              <span data-testid="futures-confirm-fee" className="font-mono text-white font-semibold">
                {formatDecimal(estFee.toString())} USDT
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line,#1d1e21)]">
              <span className="text-[var(--text-3,#63636b)] font-bold text-white">Tổng cần:</span>
              <span
                data-testid="futures-confirm-cost"
                data-value={totalCost.toString()}
                className="font-mono font-bold text-[var(--accent,#818cf8)]"
              >
                {formatDecimal(totalCost.toString())} USDT
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line,#1d1e21)]">
              <span className="text-[var(--text-3,#63636b)]">Giá thanh lý ước tính:</span>
              <span className="font-mono font-semibold">
                {confirmOrderData.side === 'BUY'
                  ? (estLiqLong ? <span className="text-[var(--down,#f2475f)]">{formatDecimal(estLiqLong.toString())} USDT</span> : '—')
                  : (estLiqShort ? <span className="text-[var(--up,#1fc27a)]">{formatDecimal(estLiqShort.toString())} USDT</span> : '—')}
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line,#1d1e21)]">
              <span className="text-[var(--text-3,#63636b)]">Funding ước tính mỗi kỳ:</span>
              <span className="font-mono text-[var(--warn,#f59e0b)] font-semibold">
                ~{formatDecimal(estFunding.toString())} USDT ({fundingRatePercent}%)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-[var(--line,#1d1e21)]">
              <Button variant="secondary" onClick={() => setConfirmOrderData(null)}>Hủy bỏ</Button>
              <Button
                data-testid="order-confirm"
                variant={confirmOrderData.side === 'BUY' ? 'buy' : 'sell'}
                loading={submittingOrder}
                onClick={() => executePlaceOrder(confirmOrderData.body, confirmOrderData.side)}
              >
                Xác nhận đặt
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
