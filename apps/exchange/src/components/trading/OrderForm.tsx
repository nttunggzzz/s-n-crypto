import React, { useState, useEffect, useMemo } from 'react';
import type { Balances, OrderSide, TimeInForce } from '@cex/contracts';
import { ApiError } from '@cex/contracts';
import {
  dec,
  floorToStep,
  roundDown,
  checkPrice,
  checkQuantity,
  checkNotional,
  type SymbolRules,
  positionSizeForRisk,
  ZERO,
} from '@cex/core';
import { getApiClient } from '../../services/api.ts';
import { getErrorMessage } from '../../services/errors.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useMarket } from '../../context/MarketContext.tsx';
import { Button, DecimalInput, useToast, formatDecimal, Modal } from '@cex/ui';
import { Calculator, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';

export type OrderTab = 'LIMIT' | 'MARKET' | 'STOP_LIMIT' | 'STOP_MARKET' | 'TRAILING' | 'OCO';

export interface OrderFormProps {
  symbol: string;
  selectedPrice?: string;
  onOrderPlaced?: () => void;
  onNavigateToLogin?: () => void;
}

export const OrderForm: React.FC<OrderFormProps> = ({
  symbol,
  selectedPrice,
  onOrderPlaced,
  onNavigateToLogin,
}) => {
  const { user, isAuthenticated } = useAuth();
  const { activeSymbolInfo, activeTicker, exchangeInfo, tradingHalted, realtimeClient } = useMarket();
  const { success, error: toastError } = useToast();
  const api = getApiClient();

  const [side, setSide] = useState<OrderSide>('BUY');
  const [orderType, setOrderType] = useState<OrderTab>('LIMIT');
  const [timeInForce, setTimeInForce] = useState<TimeInForce>('GTC');

  // Basic inputs
  const [price, setPrice] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [quoteOrderQty, setQuoteOrderQty] = useState<string>('');
  const [marketInputMode, setMarketInputMode] = useState<'qty' | 'quote'>('quote');

  // Advanced inputs
  const [stopPrice, setStopPrice] = useState<string>('');
  const [stopLimitPrice, setStopLimitPrice] = useState<string>(''); // For OCO
  const [trailingPercent, setTrailingPercent] = useState<string>('1.0');
  const [activationPrice, setActivationPrice] = useState<string>('');

  // TP/SL for BUY
  const [enableTpSl, setEnableTpSl] = useState(false);
  const [takeProfitPrice, setTakeProfitPrice] = useState<string>('');
  const [stopLossPrice, setStopLossPrice] = useState<string>('');
  const [stopLossLimitPrice, setStopLossLimitPrice] = useState<string>('');

  // Risk Calculator Modal / Drawer
  const [showRiskCalc, setShowRiskCalc] = useState(false);
  const [riskPercent, setRiskPercent] = useState<string>('1');
  const [riskEntryPrice, setRiskEntryPrice] = useState<string>('');
  const [riskStopPrice, setRiskStopPrice] = useState<string>('');

  // Confirm Order Modal
  const [confirmOrdersPref, setConfirmOrdersPref] = useState(true);
  const [confirmModalData, setConfirmModalData] = useState<any | null>(null);

  const [balances, setBalances] = useState<Balances | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [sliderValue, setSliderValue] = useState<number>(0);

  // Sync selected price from Orderbook clicks
  useEffect(() => {
    if (selectedPrice && (orderType === 'LIMIT' || orderType === 'STOP_LIMIT' || orderType === 'OCO')) {
      setPrice(selectedPrice);
    }
  }, [selectedPrice, orderType]);

  // Load preferences
  useEffect(() => {
    if (isAuthenticated) {
      api.getPreferences()
        .then((pref) => setConfirmOrdersPref(pref.confirmOrders))
        .catch(() => {});
    }
  }, [isAuthenticated, api]);

  // Load user balances
  const fetchBalances = async () => {
    if (!isAuthenticated) return;
    try {
      const b = await api.balances();
      setBalances(b);
    } catch {
      setBalances(null);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, [isAuthenticated, symbol]);

  // Listen to realtime balance updates & custom refresh event
  useEffect(() => {
    const handleRefresh = () => {
      fetchBalances();
    };
    window.addEventListener('cex:balance-refresh', handleRefresh);

    let unsub: (() => void) | undefined;
    if (realtimeClient && isAuthenticated) {
      unsub = realtimeClient.subscribe('user', (event: unknown) => {
        const ev = event as { kind: string };
        if (ev.kind === 'balance' || ev.kind === 'order' || ev.kind === 'trade') {
          fetchBalances();
        }
      });
    }

    return () => {
      window.removeEventListener('cex:balance-refresh', handleRefresh);
      if (unsub) unsub();
    };
  }, [realtimeClient, isAuthenticated]);

  const baseAsset = activeSymbolInfo?.baseAsset || 'COIN';
  const quoteAsset = activeSymbolInfo?.quoteAsset || 'USDT';

  const freeQuote = useMemo(() => {
    return balances?.items.find((b) => b.asset === quoteAsset)?.available || '0';
  }, [balances, quoteAsset]);

  const freeBase = useMemo(() => {
    return balances?.items.find((b) => b.asset === baseAsset)?.available || '0';
  }, [balances, baseAsset]);

  const freeCoin = freeBase;

  // Percentage slider logic
  const handlePercentClick = (percent: number) => {
    setValidationError(null);
    if (!activeSymbolInfo) return;

    try {
      const pct = dec((percent / 100).toString());
      const step = dec(activeSymbolInfo.stepSize);

      if (side === 'BUY') {
        const availableUsdt = dec(freeQuote);
        if (availableUsdt.lte(0)) return;

        if (orderType === 'MARKET' || orderType === 'STOP_MARKET' || orderType === 'TRAILING') {
          if (marketInputMode === 'quote' || orderType === 'STOP_MARKET' || orderType === 'TRAILING') {
            const calculatedQuote = roundDown(availableUsdt.mul(pct), 8);
            setQuoteOrderQty(calculatedQuote.toString());
          } else {
            const refPrice = activeTicker?.lastPrice ? dec(activeTicker.lastPrice) : null;
            if (refPrice && refPrice.gt(0)) {
              const estQty = floorToStep(availableUsdt.mul(pct).div(refPrice), step);
              setQuantity(estQty.toString());
            }
          }
        } else {
          // Limit, Stop-Limit, OCO
          const currentPrice = price ? dec(price) : activeTicker?.lastPrice ? dec(activeTicker.lastPrice) : null;
          if (!currentPrice || currentPrice.lte(0)) {
            setValidationError('Vui lòng nhập mức giá trước khi chọn tỷ lệ.');
            return;
          }
          if (!price && activeTicker?.lastPrice) {
            setPrice(activeTicker.lastPrice);
          }
          const calculatedQty = floorToStep(availableUsdt.mul(pct).div(currentPrice), step);
          setQuantity(calculatedQty.toString());
        }
      } else {
        // SELL
        const availableCoin = dec(freeCoin);
        if (availableCoin.lte(0)) return;
        const calculatedQty = floorToStep(availableCoin.mul(pct), step);
        setQuantity(calculatedQty.toString());
      }
    } catch (err) {
      console.error('Percent calculation error', err);
    }
  };

  const handleQuantityChange = (val: string) => {
    setQuantity(val);
    setSliderValue(0);
    if ((orderType === 'LIMIT' || orderType === 'STOP_LIMIT' || orderType === 'OCO') && price && val && activeSymbolInfo) {
      try {
        const q = dec(val);
        const p = dec(price);
        if (p.gt(0)) {
          setQuoteOrderQty(roundDown(q.mul(p), 2).toString());
        }
      } catch {}
    } else if (!val && (orderType === 'LIMIT' || orderType === 'STOP_LIMIT')) {
      setQuoteOrderQty('');
    }
  };

  const handleTotalChange = (val: string) => {
    setQuoteOrderQty(val);
    setSliderValue(0);
    if ((orderType === 'LIMIT' || orderType === 'STOP_LIMIT' || orderType === 'OCO') && price && val && activeSymbolInfo) {
      try {
        const t = dec(val);
        const p = dec(price);
        if (p.gt(0)) {
          setQuantity(floorToStep(t.div(p), dec(activeSymbolInfo.stepSize)).toString());
        }
      } catch {}
    } else if (!val && (orderType === 'LIMIT' || orderType === 'STOP_LIMIT')) {
      setQuantity('');
    }
  };

  // Stop Direction Hint
  const stopDirectionHint = useMemo(() => {
    if (!stopPrice || !activeTicker?.lastPrice) return null;
    try {
      const sp = dec(stopPrice);
      const lp = dec(activeTicker.lastPrice);
      if (sp.gt(lp)) {
        return 'Kích hoạt khi giá TĂNG đến hoặc vượt';
      } else if (sp.lt(lp)) {
        return 'Kích hoạt khi giá GIẢM đến hoặc dưới';
      }
    } catch {}
    return null;
  }, [stopPrice, activeTicker]);

  // Risk calculation result
  const riskResult = useMemo(() => {
    if (!showRiskCalc || !riskEntryPrice || !riskStopPrice || !activeSymbolInfo) return null;
    try {
      const ep = dec(riskEntryPrice);
      const sp = dec(riskStopPrice);
      const rp = dec(riskPercent);
      const eq = dec(freeQuote);
      const step = dec(activeSymbolInfo.stepSize);
      const fee = exchangeInfo?.feeRate ? dec(exchangeInfo.feeRate) : ZERO;

      if (ep.gt(0) && sp.gt(0) && sp.lt(ep) && rp.gt(0) && eq.gt(0)) {
        return positionSizeForRisk({
          equity: eq,
          riskPercent: rp,
          entryPrice: ep,
          stopPrice: sp,
          stepSize: step,
          feeRate: fee,
        });
      }
    } catch {}
    return null;
  }, [showRiskCalc, riskEntryPrice, riskStopPrice, riskPercent, freeQuote, activeSymbolInfo, exchangeInfo]);

  // Estimated fee
  const estimatedFee = useMemo(() => {
    if (!exchangeInfo?.feeRate) return '0.00';
    try {
      const rate = dec(exchangeInfo.feeRate);
      if (side === 'BUY') {
        if ((orderType === 'MARKET' || orderType === 'STOP_MARKET' || orderType === 'TRAILING') && quoteOrderQty) {
          const p = activeTicker?.lastPrice ? dec(activeTicker.lastPrice) : null;
          if (p && p.gt(0)) {
            return formatDecimal(roundDown(dec(quoteOrderQty).div(p).mul(rate), 6).toString());
          }
        } else if (quantity) {
          return formatDecimal(roundDown(dec(quantity).mul(rate), 6).toString());
        }
      } else {
        const p = (orderType === 'MARKET' || orderType === 'STOP_MARKET')
          ? (activeTicker?.lastPrice ? dec(activeTicker.lastPrice) : null)
          : (price ? dec(price) : null);
        if (p && quantity) {
          const notional = p.mul(dec(quantity));
          return formatDecimal(roundDown(notional.mul(rate), 2).toString());
        }
      }
    } catch {}
    return '0.00';
  }, [exchangeInfo, side, orderType, quoteOrderQty, quantity, price, activeTicker]);

  // Real order dispatching
  const dispatchOrder = async (orderPayload: any) => {
    setSubmitting(true);
    try {
      if (orderPayload.isOco) {
        const res = await api.placeOco({ body: orderPayload.body });
        success(`Đặt lệnh OCO ${side === 'BUY' ? 'Mua' : 'Bán'} thành công! Danh sách: ${res.id}`);
      } else {
        const res = await api.placeOrder({ body: orderPayload.body });
        const avgPrice = res.order.avgPrice ? ` ở giá TB ${formatDecimal(res.order.avgPrice)}` : '';
        success(`Đặt lệnh ${orderType} ${side === 'BUY' ? 'Mua' : 'Bán'} thành công! ${avgPrice}`);
      }
      setQuantity('');
      setQuoteOrderQty('');
      fetchBalances();
      onOrderPlaced?.();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError(getErrorMessage(err.code));
      } else {
        toastError('Không thể gửi lệnh lên hệ thống.');
      }
    } finally {
      setSubmitting(false);
      setConfirmModalData(null);
    }
  };

  // Form submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!isAuthenticated) {
      onNavigateToLogin?.();
      return;
    }

    if (!activeSymbolInfo) return;

    const rules: SymbolRules = {
      symbol: activeSymbolInfo.symbol,
      baseAsset: activeSymbolInfo.baseAsset,
      quoteAsset: activeSymbolInfo.quoteAsset,
      tickSize: activeSymbolInfo.tickSize,
      stepSize: activeSymbolInfo.stepSize,
      minQty: activeSymbolInfo.minQty,
      maxQty: activeSymbolInfo.maxQty,
      minNotional: activeSymbolInfo.minNotional,
    };

    try {
      const clientOrderId = crypto.randomUUID().replaceAll('-', '');

      // Common TP/SL building block
      let tpslPayload: any = undefined;
      if (side === 'BUY' && enableTpSl && (orderType === 'LIMIT' || orderType === 'MARKET')) {
        if (!takeProfitPrice && !stopLossPrice) {
          setValidationError('Vui lòng nhập ít nhất mức Chốt lời hoặc Cắt lỗ.');
          return;
        }
        tpslPayload = {};
        if (takeProfitPrice) tpslPayload.takeProfitPrice = takeProfitPrice;
        if (stopLossPrice) tpslPayload.stopLossPrice = stopLossPrice;
        if (stopLossLimitPrice) tpslPayload.stopLossLimitPrice = stopLossLimitPrice;
      }

      let payload: any = null;

      if (orderType === 'LIMIT') {
        if (!price || !quantity) {
          setValidationError('Vui lòng nhập đầy đủ giá và khối lượng.');
          return;
        }
        const pErr = checkPrice(rules, dec(price));
        if (pErr) return setValidationError(getErrorMessage(pErr));
        const qErr = checkQuantity(rules, dec(quantity));
        if (qErr) return setValidationError(getErrorMessage(qErr));
        const nErr = checkNotional(rules, dec(price).mul(dec(quantity)));
        if (nErr) return setValidationError(`Giá trị lệnh tối thiểu là ${rules.minNotional} USDT.`);

        payload = {
          isOco: false,
          body: {
            symbol,
            side,
            type: 'LIMIT',
            timeInForce,
            price,
            quantity,
            clientOrderId,
            ...(tpslPayload ? { tpsl: tpslPayload } : {}),
          },
        };
      } else if (orderType === 'MARKET') {
        const body: any = { symbol, side, type: 'MARKET', clientOrderId };
        if (marketInputMode === 'quote') {
          if (!quoteOrderQty) return setValidationError('Vui lòng nhập số tiền USDT muốn giao dịch.');
          if (dec(quoteOrderQty).lt(dec(rules.minNotional))) {
            return setValidationError(`Giá trị lệnh tối thiểu là ${rules.minNotional} USDT.`);
          }
          body.quoteOrderQty = quoteOrderQty;
        } else {
          if (!quantity) return setValidationError('Vui lòng nhập khối lượng muốn giao dịch.');
          const qErr = checkQuantity(rules, dec(quantity));
          if (qErr) return setValidationError(getErrorMessage(qErr));
          body.quantity = quantity;
        }
        if (tpslPayload) body.tpsl = tpslPayload;
        payload = { isOco: false, body };
      } else if (orderType === 'STOP_LIMIT') {
        if (!stopPrice || !price || !quantity) {
          return setValidationError('Vui lòng nhập mức giá kích hoạt, giá đặt lệnh và khối lượng.');
        }
        const sErr = checkPrice(rules, dec(stopPrice));
        if (sErr) return setValidationError(`Giá kích hoạt: ${getErrorMessage(sErr)}`);
        const pErr = checkPrice(rules, dec(price));
        if (pErr) return setValidationError(`Giá đặt: ${getErrorMessage(pErr)}`);
        const qErr = checkQuantity(rules, dec(quantity));
        if (qErr) return setValidationError(getErrorMessage(qErr));

        payload = {
          isOco: false,
          body: {
            symbol,
            side,
            type: 'STOP_LIMIT',
            stopPrice,
            price,
            quantity,
            timeInForce,
            clientOrderId,
          },
        };
      } else if (orderType === 'STOP_MARKET') {
        if (!stopPrice) return setValidationError('Vui lòng nhập mức giá kích hoạt.');
        const sErr = checkPrice(rules, dec(stopPrice));
        if (sErr) return setValidationError(getErrorMessage(sErr));

        const body: any = { symbol, side, type: 'STOP_MARKET', stopPrice, clientOrderId };
        if (side === 'BUY') {
          if (!quoteOrderQty) return setValidationError('Lệnh Mua Stop-Market cần nhập số USDT (quoteOrderQty).');
          body.quoteOrderQty = quoteOrderQty;
        } else {
          if (!quantity) return setValidationError('Lệnh Bán Stop-Market cần nhập số lượng coin.');
          body.quantity = quantity;
        }
        payload = { isOco: false, body };
      } else if (orderType === 'TRAILING') {
        const pctNum = parseFloat(trailingPercent);
        if (isNaN(pctNum) || pctNum < 0.1 || pctNum > 20) {
          return setValidationError('Tỷ lệ Trailing phải nằm trong khoảng từ 0.1% đến 20%.');
        }
        const trailingDeltaBips = Math.round(pctNum * 100);

        const body: any = {
          symbol,
          side,
          type: 'TRAILING_STOP_MARKET',
          trailingDeltaBips,
          clientOrderId,
        };
        if (activationPrice) body.activationPrice = activationPrice;

        if (side === 'BUY') {
          if (!quoteOrderQty) return setValidationError('Lệnh Mua Trailing cần nhập số USDT.');
          body.quoteOrderQty = quoteOrderQty;
        } else {
          if (!quantity) return setValidationError('Lệnh Bán Trailing cần nhập số lượng coin.');
          body.quantity = quantity;
        }
        payload = { isOco: false, body };
      } else if (orderType === 'OCO') {
        if (!quantity || !price || !stopPrice) {
          return setValidationError('Vui lòng nhập đầy đủ Khối lượng, Giá chốt lời (Limit) và Giá kích hoạt cắt lỗ (Stop).');
        }
        if (side === 'BUY' && !stopLimitPrice) {
          return setValidationError('Lệnh Mua OCO bắt buộc phải có mức Giá giới hạn cắt lỗ (stopLimitPrice).');
        }

        // Price relationship guide check
        if (activeTicker?.lastPrice) {
          const lp = dec(activeTicker.lastPrice);
          const p = dec(price);
          const sp = dec(stopPrice);
          if (side === 'SELL') {
            if (p.lte(lp) || sp.gte(lp)) {
              return setValidationError('OCO Bán quy định: Giá chốt lời > Giá hiện tại > Giá cắt lỗ.');
            }
          } else {
            if (p.gte(lp) || sp.lte(lp)) {
              return setValidationError('OCO Mua quy định: Giá chốt lời (mua rẻ) < Giá hiện tại < Giá cắt lỗ (mua breakout).');
            }
          }
        }

        const body: any = {
          symbol,
          side,
          quantity,
          price,
          stopPrice,
          clientListId: clientOrderId,
        };
        if (stopLimitPrice) body.stopLimitPrice = stopLimitPrice;
        payload = { isOco: true, body };
      }

      if (!payload) return;

      if (confirmOrdersPref) {
        setConfirmModalData(payload);
      } else {
        await dispatchOrder(payload);
      }
    } catch (err) {
      console.error(err);
      setValidationError('Dữ liệu nhập không hợp lệ.');
    }
  };

  const isPriceInvalid = activeTicker?.status === 'UNAVAILABLE' || activeTicker?.status === 'STALE';
  const isSymbolDisabled = !activeSymbolInfo?.enabled;
  const isEmailUnverified = user && !user.emailVerified;

  const cannotTradeReason = tradingHalted
    ? 'Sàn đang tạm dừng giao dịch'
    : isSymbolDisabled
    ? 'Cặp giao dịch đang tạm ngưng'
    : isEmailUnverified
    ? 'Vui lòng xác minh email trước khi đặt lệnh'
    : isPriceInvalid
    ? 'Dữ liệu giá hiện không hợp lệ'
    : null;

  return (
    <div className="flex flex-col bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-subtle,#1e212b)] rounded-[var(--radius-lg,12px)] p-4 text-xs select-none">
      {/* Side Tabs (Buy / Sell) */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-[var(--color-bg-base,#08090c)] rounded-[var(--radius-md,8px)] mb-3">
        <button
          type="button"
          onClick={() => setSide('BUY')}
          className={`py-2 rounded-[var(--radius-sm,4px)] font-bold text-xs transition-all cursor-pointer ${
            side === 'BUY'
              ? 'bg-[var(--color-buy,#22c55e)] text-white shadow-[0_2px_8px_rgba(34,197,94,0.3)]'
              : 'text-[var(--color-text-secondary,#9ca3af)] hover:text-white'
          }`}
        >
          MUA {baseAsset}
        </button>
        <button
          type="button"
          onClick={() => setSide('SELL')}
          className={`py-2 rounded-[var(--radius-sm,4px)] font-bold text-xs transition-all cursor-pointer ${
            side === 'SELL'
              ? 'bg-[var(--color-sell,#f87171)] text-white shadow-[0_2px_8px_rgba(248,113,113,0.3)]'
              : 'text-[var(--color-text-secondary,#9ca3af)] hover:text-white'
          }`}
        >
          BÁN {baseAsset}
        </button>
      </div>

      {/* Order Type Tabs: 6 Tabs */}
      <div className="flex items-center gap-2 pb-2 mb-3 border-b border-[var(--color-border-subtle,#1e212b)] overflow-x-auto no-scrollbar">
        {(['LIMIT', 'MARKET', 'STOP_LIMIT', 'STOP_MARKET', 'TRAILING', 'OCO'] as OrderTab[]).map((tab) => {
          const tabLabelMap: Record<OrderTab, string> = {
            LIMIT: 'Giới hạn',
            MARKET: 'Thị trường',
            STOP_LIMIT: 'Stop-Limit',
            STOP_MARKET: 'Stop-Market',
            TRAILING: 'Trailing',
            OCO: 'OCO',
          };
          const isActive = orderType === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setOrderType(tab);
                setValidationError(null);
              }}
              className={`font-semibold text-[11px] whitespace-nowrap cursor-pointer pb-1 border-b-2 transition-colors ${
                isActive
                  ? 'border-[var(--color-accent-primary,#818cf8)] text-[var(--color-text-primary,#f3f4f6)]'
                  : 'border-transparent text-[var(--color-text-muted,#6b7280)] hover:text-white'
              }`}
            >
              {tabLabelMap[tab]}
            </button>
          );
        })}
      </div>

      {/* Available Balance & Tools */}
      <div className="flex items-center justify-between mb-3 text-[11px] text-[var(--color-text-secondary,#9ca3af)]">
        <div className="flex items-center gap-1.5">
          <span>Khả dụng:</span>
          <span className="font-mono tabular-nums text-[var(--color-text-primary,#f3f4f6)] font-semibold">
            {isAuthenticated ? (
              side === 'BUY' ? (
                `${formatDecimal(freeQuote, { decimals: 2 })} ${quoteAsset}`
              ) : (
                `${formatDecimal(freeCoin, { decimals: 4 })} ${baseAsset}`
              )
            ) : (
              <span className="text-[var(--color-accent-primary,#818cf8)] cursor-pointer" onClick={onNavigateToLogin}>
                Đăng nhập
              </span>
            )}
          </span>
        </div>

        {/* Risk Calculator Toggle Button */}
        {side === 'BUY' && (
          <button
            type="button"
            onClick={() => {
              setShowRiskCalc(!showRiskCalc);
              if (!riskEntryPrice) setRiskEntryPrice(price || activeTicker?.lastPrice || '');
            }}
            className="flex items-center gap-1 text-[var(--color-accent-primary,#818cf8)] hover:brightness-125 cursor-pointer font-medium"
            title="Tính khối lượng theo % rủi ro tài khoản"
          >
            <Calculator size={13} />
            <span>% Rủi ro</span>
          </button>
        )}
      </div>

      {/* Collapsible Risk Calculator Panel */}
      {showRiskCalc && side === 'BUY' && (
        <div className="mb-3 p-2.5 rounded-[var(--radius-md,8px)] bg-[var(--color-bg-base,#08090c)] border border-[var(--color-accent-primary,#818cf8)]/30 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-[var(--color-text-primary,#f3f4f6)]">
            <span>Máy tính % Rủi ro danh mục</span>
            <span className="text-[10px] text-[var(--color-text-muted,#6b7280)] font-normal">Cắt lỗ &lt; Giá vào</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <span className="text-[10px] text-[var(--color-text-muted,#6b7280)]">% Rủi ro</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                value={riskPercent}
                onChange={(e) => setRiskPercent(e.target.value)}
                className="w-full bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-default,#272a33)] rounded px-2 py-1 text-xs text-white"
                placeholder="1%"
              />
            </div>
            <div>
              <span className="text-[10px] text-[var(--color-text-muted,#6b7280)]">Giá vào</span>
              <input
                type="text"
                value={riskEntryPrice}
                onChange={(e) => setRiskEntryPrice(e.target.value)}
                className="w-full bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-default,#272a33)] rounded px-2 py-1 text-xs text-white"
                placeholder="Giá mua"
              />
            </div>
            <div>
              <span className="text-[10px] text-[var(--color-text-muted,#6b7280)]">Giá cắt lỗ</span>
              <input
                type="text"
                value={riskStopPrice}
                onChange={(e) => setRiskStopPrice(e.target.value)}
                className="w-full bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-default,#272a33)] rounded px-2 py-1 text-xs text-white"
                placeholder="Dưới giá vào"
              />
            </div>
          </div>

          {riskResult ? (
            <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border-subtle,#1e212b)] text-[10px]">
              <div>
                Gợi ý: <span className="font-bold text-[var(--color-accent-primary,#818cf8)] font-mono">{riskResult.quantity.toString()} {baseAsset}</span>
                <span className="text-[var(--color-text-muted,#6b7280)] ml-1">(~{roundDown(riskResult.notional, 2).toString()} USDT)</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setQuantity(riskResult.quantity.toString());
                  if (orderType === 'LIMIT' || orderType === 'STOP_LIMIT') {
                    setPrice(riskEntryPrice);
                  }
                  setShowRiskCalc(false);
                }}
                className="px-2 py-0.5 rounded bg-[var(--color-accent-primary,#818cf8)] text-black font-bold hover:brightness-110 cursor-pointer"
              >
                Dùng số này
              </button>
            </div>
          ) : (
            <div className="text-[10px] text-[var(--color-text-muted,#6b7280)] italic">
              Nhập giá cắt lỗ thấp hơn giá vào để tính khối lượng an toàn.
            </div>
          )}
        </div>
      )}

      {/* Main Order Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* STOP PRICES (for Stop-Limit, Stop-Market, OCO) */}
        {(orderType === 'STOP_LIMIT' || orderType === 'STOP_MARKET' || orderType === 'OCO') && (
          <div>
            <DecimalInput
              label={orderType === 'OCO' ? 'Giá kích hoạt cắt lỗ (Stop)' : 'Giá kích hoạt (Stop)'}
              value={stopPrice}
              onValueChange={setStopPrice}
              maxDecimals={activeSymbolInfo?.pricePrecision}
              unit={quoteAsset}
              placeholder={activeTicker?.lastPrice || '0.00'}
            />
            {stopDirectionHint && (
              <div className="flex items-center gap-1 text-[10px] text-[var(--color-accent-primary,#818cf8)] mt-1 px-1">
                <Info size={11} />
                <span>{stopDirectionHint} {stopPrice} {quoteAsset}</span>
              </div>
            )}
          </div>
        )}

        {/* TRAILING PARAMS */}
        {orderType === 'TRAILING' && (
          <div className="flex flex-col gap-2">
            <div>
              <div className="flex items-center justify-between text-[11px] text-[var(--color-text-secondary,#9ca3af)] mb-1">
                <span>Tỷ lệ bám giá (Trailing Delta %)</span>
                <span className="text-[10px] text-[var(--color-text-muted,#6b7280)]">0.1% – 20%</span>
              </div>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="20"
                value={trailingPercent}
                onChange={(e) => setTrailingPercent(e.target.value)}
                className="w-full bg-[var(--color-bg-base,#08090c)] border border-[var(--color-border-default,#272a33)] rounded-[var(--radius-md,8px)] px-3 py-2 text-xs text-white"
                placeholder="1.0"
                required
              />
            </div>
            <DecimalInput
              label="Giá kích hoạt (Tùy chọn)"
              value={activationPrice}
              onValueChange={setActivationPrice}
              maxDecimals={activeSymbolInfo?.pricePrecision}
              unit={quoteAsset}
              placeholder="Để trống = Kích hoạt ngay"
            />
          </div>
        )}

        {/* LIMIT PRICE (for Limit, Stop-Limit, OCO) */}
        {(orderType === 'LIMIT' || orderType === 'STOP_LIMIT' || orderType === 'OCO') && (
          <DecimalInput
            label={orderType === 'OCO' ? 'Giá chốt lời (Limit)' : 'Giá đặt lệnh (Price)'}
            value={price}
            onValueChange={(v) => { setPrice(v); handleQuantityChange(quantity); }}
            maxDecimals={activeSymbolInfo?.pricePrecision}
            unit={quoteAsset}
            placeholder={activeTicker?.lastPrice || '0.00'}
          />
        )}

        {/* OCO STOP LIMIT PRICE */}
        {orderType === 'OCO' && (
          <DecimalInput
            label={`Giá giới hạn cắt lỗ ${side === 'BUY' ? '(Bắt buộc)' : '(Tùy chọn)'}`}
            value={stopLimitPrice}
            onValueChange={setStopLimitPrice}
            maxDecimals={activeSymbolInfo?.pricePrecision}
            unit={quoteAsset}
            placeholder={side === 'BUY' ? 'Bắt buộc khi Mua' : 'Để trống = Bán thị trường'}
          />
        )}

        {/* QUANTITY / NOTIONAL INPUTS */}
        {orderType === 'MARKET' ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--color-text-secondary,#9ca3af)]">Nhập theo:</span>
              <div className="flex gap-2 font-medium">
                <button
                  type="button"
                  onClick={() => setMarketInputMode('quote')}
                  className={`cursor-pointer ${marketInputMode === 'quote' ? 'text-[var(--color-accent-primary,#818cf8)] font-bold' : 'text-[var(--color-text-muted,#6b7280)]'}`}
                >
                  USDT
                </button>
                <span>|</span>
                <button
                  type="button"
                  onClick={() => setMarketInputMode('qty')}
                  className={`cursor-pointer ${marketInputMode === 'qty' ? 'text-[var(--color-accent-primary,#818cf8)] font-bold' : 'text-[var(--color-text-muted,#6b7280)]'}`}
                >
                  {baseAsset}
                </button>
              </div>
            </div>

            {marketInputMode === 'quote' ? (
              <DecimalInput
                label="Tổng số tiền USDT"
                value={quoteOrderQty}
                onValueChange={(v) => { setQuoteOrderQty(v); setSliderValue(0); }}
                maxDecimals={2}
                unit="USDT"
                placeholder="100.00"
              />
            ) : (
              <DecimalInput
                label="Khối lượng cần mua/bán"
                value={quantity}
                onValueChange={(v) => { setQuantity(v); setSliderValue(0); }}
                maxDecimals={activeSymbolInfo?.quantityPrecision}
                unit={baseAsset}
                placeholder="0.0000"
              />
            )}
          </div>
        ) : (orderType === 'STOP_MARKET' || orderType === 'TRAILING') && side === 'BUY' ? (
          /* Buy Stop-Market & Buy Trailing must specify quoteOrderQty (USDT) */
          <DecimalInput
            label="Số tiền USDT chi trả (Bắt buộc)"
            value={quoteOrderQty}
            onValueChange={(v) => { setQuoteOrderQty(v); setSliderValue(0); }}
            maxDecimals={2}
            unit="USDT"
            placeholder="100.00"
          />
        ) : (
          /* Standard Quantity input */
          <>
            <DecimalInput
              label="Khối lượng"
              value={quantity}
              onValueChange={handleQuantityChange}
              maxDecimals={activeSymbolInfo?.quantityPrecision}
              unit={baseAsset}
              placeholder="0.0000"
            />

            {(orderType === 'LIMIT' || orderType === 'STOP_LIMIT') && (
              <DecimalInput
                label="Tổng giá trị"
                value={quoteOrderQty}
                onValueChange={handleTotalChange}
                maxDecimals={2}
                unit={quoteAsset}
                placeholder="0.00"
              />
            )}
          </>
        )}

        {/* Time In Force toggle for Limit & Stop-Limit */}
        {(orderType === 'LIMIT' || orderType === 'STOP_LIMIT') && (
          <div className="flex items-center justify-between text-[11px] text-[var(--color-text-secondary,#9ca3af)] px-1">
            <span>Thời hạn lệnh:</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTimeInForce('GTC')}
                className={`px-2 py-0.5 rounded cursor-pointer ${timeInForce === 'GTC' ? 'bg-[var(--color-bg-elevated,#1b1e27)] text-white font-bold' : 'text-[var(--color-text-muted,#6b7280)]'}`}
              >
                GTC
              </button>
              <span>/</span>
              <button
                type="button"
                onClick={() => setTimeInForce('IOC')}
                className={`px-2 py-0.5 rounded cursor-pointer ${timeInForce === 'IOC' ? 'bg-[var(--color-bg-elevated,#1b1e27)] text-white font-bold' : 'text-[var(--color-text-muted,#6b7280)]'}`}
              >
                IOC
              </button>
            </div>
          </div>
        )}

        {/* Percentage Slider */}
        <div className="my-1 px-1">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={sliderValue}
            onChange={(e) => {
              const val = Number(e.target.value);
              setSliderValue(val);
              handlePercentClick(val);
            }}
            className="w-full h-1 bg-[var(--line,#1d1e21)] rounded-lg appearance-none cursor-pointer accent-[var(--accent,#818cf8)]"
          />
          <div className="flex justify-between text-[9px] text-[var(--text-3,#63636b)] mt-1.5 font-mono">
            <span className="cursor-pointer" onClick={() => { setSliderValue(0); handlePercentClick(0); }}>0%</span>
            <span className="cursor-pointer" onClick={() => { setSliderValue(25); handlePercentClick(25); }}>25%</span>
            <span className="cursor-pointer" onClick={() => { setSliderValue(50); handlePercentClick(50); }}>50%</span>
            <span className="cursor-pointer" onClick={() => { setSliderValue(75); handlePercentClick(75); }}>75%</span>
            <span className="cursor-pointer" onClick={() => { setSliderValue(100); handlePercentClick(100); }}>100%</span>
          </div>
        </div>

        {/* TP/SL Checkbox & Inputs (BUY Limit or Market only) */}
        {side === 'BUY' && (orderType === 'LIMIT' || orderType === 'MARKET') && (
          <div className="pt-2 border-t border-[var(--color-border-subtle,#1e212b)] flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-[var(--color-text-primary,#f3f4f6)] font-semibold">
              <input
                type="checkbox"
                checked={enableTpSl}
                onChange={(e) => setEnableTpSl(e.target.checked)}
                className="rounded accent-[var(--accent,#818cf8)] cursor-pointer"
              />
              <span>Gắn kèm Chốt lời / Cắt lỗ (TP/SL)</span>
            </label>

            {enableTpSl && (
              <div className="grid grid-cols-2 gap-2 p-2 rounded-[var(--radius-md,8px)] bg-[var(--color-bg-base,#08090c)] border border-[var(--color-border-default,#272a33)]">
                <div>
                  <span className="text-[10px] text-[var(--color-buy,#22c55e)] font-semibold flex items-center gap-0.5">
                    <ArrowUpRight size={11} /> Chốt lời (TP)
                  </span>
                  <input
                    type="text"
                    value={takeProfitPrice}
                    onChange={(e) => setTakeProfitPrice(e.target.value)}
                    placeholder="Giá TP > Giá vào"
                    className="w-full bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-default,#272a33)] rounded px-2 py-1 text-xs text-white mt-1"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[var(--color-sell,#f87171)] font-semibold flex items-center gap-0.5">
                    <ArrowDownRight size={11} /> Cắt lỗ (SL)
                  </span>
                  <input
                    type="text"
                    value={stopLossPrice}
                    onChange={(e) => setStopLossPrice(e.target.value)}
                    placeholder="Giá SL < Giá vào"
                    className="w-full bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-default,#272a33)] rounded px-2 py-1 text-xs text-white mt-1"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Estimated Fee info */}
        <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted,#6b7280)]">
          <span>Phí giao dịch (ước tính):</span>
          <span className="font-mono text-[var(--color-text-secondary,#9ca3af)]">
            ~{estimatedFee} {side === 'BUY' ? baseAsset : 'USDT'}
          </span>
        </div>

        {/* Validation Error Message */}
        {validationError && (
          <div className="p-2 rounded-[var(--radius-sm,4px)] bg-[var(--color-sell-bg,rgba(248,113,113,0.12))] border border-[var(--color-sell,#f87171)]/30 text-[11px] text-[var(--color-sell,#f87171)]">
            {validationError}
          </div>
        )}

        {/* Submit button */}
        {!isAuthenticated ? (
          <Button
            type="button"
            variant="primary"
            fullWidth
            onClick={onNavigateToLogin}
            className="mt-2"
          >
            Đăng nhập để giao dịch
          </Button>
        ) : cannotTradeReason ? (
          <Button
            type="button"
            disabled
            fullWidth
            className="mt-2 bg-neutral-800 text-neutral-400 border border-neutral-700"
          >
            {cannotTradeReason}
          </Button>
        ) : (
          <Button
            type="submit"
            variant={side === 'BUY' ? 'buy' : 'sell'}
            loading={submitting}
            fullWidth
            className="mt-2 font-bold text-sm tracking-wide"
          >
            {side === 'BUY' ? `MUA ${baseAsset}` : `BÁN ${baseAsset}`}
          </Button>
        )}
      </form>

      {/* Confirmation Modal */}
      {confirmModalData && (
        <Modal
          isOpen={true}
          onClose={() => setConfirmModalData(null)}
          title="Xác nhận đặt lệnh"
          maxWidth="sm"
        >
          <div className="p-4 flex flex-col gap-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border-subtle,#1e212b)]">
              <span className="text-[var(--color-text-muted,#6b7280)]">Cặp giao dịch:</span>
              <span className="font-bold text-white">{symbol}</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border-subtle,#1e212b)]">
              <span className="text-[var(--color-text-muted,#6b7280)]">Loại lệnh & Chiều:</span>
              <span className={`font-bold ${side === 'BUY' ? 'text-[var(--color-buy,#22c55e)]' : 'text-[var(--color-sell,#f87171)]'}`}>
                {side === 'BUY' ? 'MUA' : 'BÁN'} ({orderType})
              </span>
            </div>

            {confirmModalData.body.price && (
              <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border-subtle,#1e212b)]">
                <span className="text-[var(--color-text-muted,#6b7280)]">Mức giá:</span>
                <span className="font-mono text-white">{confirmModalData.body.price} {quoteAsset}</span>
              </div>
            )}

            {confirmModalData.body.stopPrice && (
              <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border-subtle,#1e212b)]">
                <span className="text-[var(--color-text-muted,#6b7280)]">Giá kích hoạt (Stop):</span>
                <span className="font-mono text-[var(--color-accent-primary,#818cf8)]">{confirmModalData.body.stopPrice} {quoteAsset}</span>
              </div>
            )}

            {confirmModalData.body.quantity && (
              <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border-subtle,#1e212b)]">
                <span className="text-[var(--color-text-muted,#6b7280)]">Khối lượng:</span>
                <span className="font-mono text-white">{confirmModalData.body.quantity} {baseAsset}</span>
              </div>
            )}

            {confirmModalData.body.quoteOrderQty && (
              <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border-subtle,#1e212b)]">
                <span className="text-[var(--color-text-muted,#6b7280)]">Số tiền thanh toán:</span>
                <span className="font-mono text-white">{confirmModalData.body.quoteOrderQty} USDT</span>
              </div>
            )}

            {confirmModalData.body.tpsl && (
              <div className="p-2 rounded bg-[var(--color-bg-base,#08090c)] border border-[var(--color-border-default,#272a33)] flex flex-col gap-1">
                <span className="font-bold text-[var(--color-text-primary,#f3f4f6)]">Kèm TP/SL:</span>
                {confirmModalData.body.tpsl.takeProfitPrice && (
                  <div className="text-[var(--color-buy,#22c55e)]">Chốt lời: {confirmModalData.body.tpsl.takeProfitPrice}</div>
                )}
                {confirmModalData.body.tpsl.stopLossPrice && (
                  <div className="text-[var(--color-sell,#f87171)]">Cắt lỗ: {confirmModalData.body.tpsl.stopLossPrice}</div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted,#6b7280)] mt-1">
              <span>Phí ước tính:</span>
              <span className="font-mono">~{estimatedFee} {side === 'BUY' ? baseAsset : 'USDT'}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[var(--color-border-subtle,#1e212b)]">
              <Button
                variant="secondary"
                onClick={() => setConfirmModalData(null)}
              >
                Hủy bỏ
              </Button>
              <Button
                variant={side === 'BUY' ? 'buy' : 'sell'}
                loading={submitting}
                onClick={() => dispatchOrder(confirmModalData)}
              >
                Xác nhận đặt
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
