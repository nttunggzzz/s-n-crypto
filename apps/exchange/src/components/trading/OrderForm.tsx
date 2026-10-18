import React, { useState, useEffect, useMemo } from 'react';
import type { Balances, OrderSide, TimeInForce, PlaceOrderRequest, PlaceOcoRequest, TaxCategory } from '@cex/contracts';
import { ApiError } from '@cex/contracts';
import {
  dec,
  floorToStep,
  roundDown,
  roundUp,
  type Dec,
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
import { useConfig } from '../../context/ConfigContext.tsx';
import { useMarket } from '../../context/MarketContext.tsx';
import { Button, DecimalInput, useToast, formatDecimal, formatPrice, Modal } from '@cex/ui';
import { Calculator, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';

export type OrderTab = 'LIMIT' | 'MARKET' | 'STOP_LIMIT' | 'STOP_MARKET' | 'TRAILING' | 'OCO';

export type OrderPayload =
  | { isOco: true; body: PlaceOcoRequest }
  | { isOco: false; body: PlaceOrderRequest };

export interface OrderTpSlPayload {
  takeProfitPrice?: string;
  stopLossPrice?: string;
  stopLossLimitPrice?: string;
}

export interface OrderFormProps {
  symbol: string;
  selectedPrice?: string;
  initialSide?: OrderSide;
  onOrderPlaced?: () => void;
  onNavigateToLogin?: () => void;
}

export const OrderForm: React.FC<OrderFormProps> = ({
  symbol,
  selectedPrice,
  initialSide,
  onOrderPlaced,
  onNavigateToLogin,
}) => {
  const { user, isAuthenticated, resendVerification } = useAuth();
  const { publicConfig } = useConfig();
  const { activeSymbolInfo, activeTicker, exchangeInfo, exchangeStatus, tradingHalted, disabledSymbols, realtimeClient } = useMarket();
  const { success, error: toastError } = useToast();
  const api = getApiClient();

  const [resendingEmail, setResendingEmail] = useState(false);
  const [emailCooldown, setEmailCooldown] = useState(0);

  useEffect(() => {
    if (emailCooldown <= 0) return;
    const timer = setInterval(() => setEmailCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [emailCooldown]);

  const handleResendEmail = async () => {
    if (emailCooldown > 0) return;
    setResendingEmail(true);
    try {
      const res = await resendVerification();
      if (res.success) {
        success('Đã gửi lại email xác minh.');
        setEmailCooldown(60);
      } else {
        toastError(res.error || 'Không thể gửi lại email xác minh.');
      }
    } finally {
      setResendingEmail(false);
    }
  };

  const [side, setSide] = useState<OrderSide>(initialSide || 'BUY');
  const [orderType, setOrderType] = useState<OrderTab>('LIMIT');
  const [timeInForce, setTimeInForce] = useState<TimeInForce>('GTC');

  // Basic inputs
  const [price, setPrice] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [quoteOrderQty, setQuoteOrderQty] = useState<string>('');
  const [marketInputMode, setMarketInputMode] = useState<'qty' | 'quote'>(initialSide === 'SELL' ? 'qty' : 'quote');

  const userChangedPriceRef = React.useRef(false);

  // Sync side from prop
  useEffect(() => {
    if (initialSide) {
      setSide(initialSide);
      if (initialSide === 'SELL') {
        setMarketInputMode('qty');
      }
    }
  }, [initialSide]);

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
  const [confirmModalData, setConfirmModalData] = useState<OrderPayload | null>(null);

  const [balances, setBalances] = useState<Balances | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [sliderValue, setSliderValue] = useState<number>(0);

  const formattedLastPrice = useMemo(() => {
    if (!activeTicker?.lastPrice) return '—';
    if (!activeSymbolInfo?.tickSize) return activeTicker.lastPrice;
    try {
      return floorToStep(dec(activeTicker.lastPrice), dec(activeSymbolInfo.tickSize)).toString();
    } catch {
      return activeTicker.lastPrice;
    }
  }, [activeTicker?.lastPrice, activeSymbolInfo?.tickSize]);

  // Sync selected price from Orderbook clicks
  useEffect(() => {
    if (selectedPrice && (orderType === 'LIMIT' || orderType === 'STOP_LIMIT' || orderType === 'OCO')) {
      userChangedPriceRef.current = true;
      if (activeSymbolInfo?.tickSize) {
        try {
          const snapped = floorToStep(dec(selectedPrice), dec(activeSymbolInfo.tickSize)).toString();
          setPrice(snapped);
        } catch {
          setPrice(selectedPrice);
        }
      } else {
        setPrice(selectedPrice);
      }
    }
  }, [selectedPrice, orderType, activeSymbolInfo]);

  // N-04: Auto-fill Limit price with current market price if empty and user hasn't typed
  useEffect(() => {
    if (
      !userChangedPriceRef.current &&
      price === '' &&
      activeTicker?.lastPrice &&
      activeTicker.status !== 'UNAVAILABLE' &&
      (orderType === 'LIMIT' || orderType === 'STOP_LIMIT' || orderType === 'OCO')
    ) {
      if (activeSymbolInfo?.tickSize) {
        try {
          const snapped = floorToStep(dec(activeTicker.lastPrice), dec(activeSymbolInfo.tickSize)).toString();
          setPrice(snapped);
        } catch {
          setPrice(activeTicker.lastPrice);
        }
      } else {
        setPrice(activeTicker.lastPrice);
      }
    }
  }, [activeTicker?.lastPrice, activeTicker?.status, activeSymbolInfo?.tickSize, orderType, price]);

  // Load preferences
  useEffect(() => {
    if (isAuthenticated) {
      api.getPreferences()
        .then((pref) => setConfirmOrdersPref(pref.confirmOrders))
        .catch(() => {});
    }
  }, [isAuthenticated, api]);

  // Load taxpayer category (Module T)
  const [taxCategory, setTaxCategory] = useState<TaxCategory>('INDIVIDUAL');

  useEffect(() => {
    if (!isAuthenticated) {
      setTaxCategory('INDIVIDUAL');
      return;
    }
    let cancelled = false;
    const loadProfile = () => {
      api.taxProfile()
        .then((p) => {
          if (!cancelled && p?.category) {
            setTaxCategory(p.category);
          }
        })
        .catch(() => {});
    };
    loadProfile();

    const handleTaxProfileUpdated = () => {
      loadProfile();
    };
    window.addEventListener('cex:tax-profile-updated', handleTaxProfileUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener('cex:tax-profile-updated', handleTaxProfileUpdated);
    };
  }, [isAuthenticated, api]);

  const isDomesticOrg = taxCategory === 'DOMESTIC_ORG';

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
    userChangedPriceRef.current = false;
    setPrice('');
    setQuantity('');
    setQuoteOrderQty('');
    setStopPrice('');
    setStopLimitPrice('');
    setValidationError(null);
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

  const baseAsset = activeSymbolInfo?.baseAsset || (symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol.replace(/USDT$/, '')) || 'BTC';
  const quoteAsset = activeSymbolInfo?.quoteAsset || 'USDT';

  const freeQuote = useMemo(() => {
    return balances?.items.find((b) => b.asset === quoteAsset)?.available || '0';
  }, [balances, quoteAsset]);

  const freeBase = useMemo(() => {
    return balances?.items.find((b) => b.asset === baseAsset)?.available || '0';
  }, [balances, baseAsset]);

  const freeCoin = freeBase;

  // Percentage slider logic
  const handlePercentClick = async (percent: number) => {
    setValidationError(null);
    let symInfo = activeSymbolInfo;
    if (!symInfo && exchangeInfo) {
      symInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol) || null;
    }
    if (!symInfo) {
      try {
        const info = await api.exchangeInfo();
        symInfo = info.symbols.find((s) => s.symbol === symbol) || null;
      } catch {}
    }
    const step = dec(symInfo?.stepSize || '0.0001');

    try {
      const pct = dec((percent / 100).toString());

      if (side === 'BUY') {
        let curFreeQuote = freeQuote;
        if (dec(curFreeQuote).lte(0) && isAuthenticated) {
          try {
            const b = await api.balances();
            setBalances(b);
            curFreeQuote = b.items.find((x) => x.asset === quoteAsset)?.available || '0';
          } catch {}
        }
        const availableUsdt = dec(curFreeQuote);
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
            const snapped = symInfo?.tickSize
              ? floorToStep(dec(activeTicker.lastPrice), dec(symInfo.tickSize)).toString()
              : activeTicker.lastPrice;
            setPrice(snapped);
          }
          const calculatedQty = floorToStep(availableUsdt.mul(pct).div(currentPrice), step);
          setQuantity(calculatedQty.toString());
          recalcTotal(price || currentPrice.toString(), calculatedQty.toString());
        }
      } else {
        // SELL (N-05: switch to base coin input mode)
        setMarketInputMode('qty');
        let curFreeCoin = freeCoin;
        if (dec(curFreeCoin).lte(0) && isAuthenticated) {
          try {
            const b = await api.balances();
            setBalances(b);
            curFreeCoin = b.items.find((x) => x.asset === baseAsset)?.available || '0';
          } catch {}
        }
        const availableCoin = dec(curFreeCoin);
        if (availableCoin.lte(0)) return;
        const calculatedQty = floorToStep(availableCoin.mul(pct), step);
        setQuantity(calculatedQty.toString());
        recalcTotal(price, calculatedQty.toString());
      }
    } catch (err) {
      console.error('Percent calculation error', err);
    }
  };

  const recalcTotal = (pVal: string, qVal: string) => {
    if ((orderType === 'LIMIT' || orderType === 'STOP_LIMIT' || orderType === 'OCO') && pVal && qVal && activeSymbolInfo) {
      try {
        const q = dec(qVal);
        const p = dec(pVal);
        if (p.gt(0) && q.gt(0)) {
          setQuoteOrderQty(roundDown(q.mul(p), 2).toString());
          return;
        }
      } catch {}
    }
    if (!qVal || !pVal) {
      setQuoteOrderQty('');
    }
  };

  const handleQuantityChange = (val: string) => {
    setQuantity(val);
    setSliderValue(0);
    recalcTotal(price, val);
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

  // Fee rate & formatted percentage
  const effectiveFeeRate = exchangeInfo?.feeRate ?? null;

  const formattedFeeRatePercent = useMemo(() => {
    if (!effectiveFeeRate) return '—';
    try {
      return `${formatDecimal(dec(effectiveFeeRate).mul(100).toString(), { locale: 'vi', trimTrailingZeros: true })}%`;
    } catch {
      return '—';
    }
  }, [effectiveFeeRate]);

  // Risk calculation result
  const riskResult = useMemo(() => {
    if (!showRiskCalc || !riskEntryPrice || !riskStopPrice || !activeSymbolInfo) return null;
    try {
      const ep = dec(riskEntryPrice);
      const sp = dec(riskStopPrice);
      const rp = dec(riskPercent);
      const eq = dec(freeQuote);
      const step = dec(activeSymbolInfo.stepSize);
      const fee = effectiveFeeRate ? dec(effectiveFeeRate) : ZERO;

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
  }, [showRiskCalc, riskEntryPrice, riskStopPrice, riskPercent, freeQuote, activeSymbolInfo, effectiveFeeRate]);

  // Estimated fee
  const estimatedFee = useMemo(() => {
    if (!effectiveFeeRate) return '—';
    if (!quantity && !quoteOrderQty) return '—';
    try {
      const rate = dec(effectiveFeeRate);
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
    return '—';
  }, [effectiveFeeRate, side, orderType, quoteOrderQty, quantity, price, activeTicker]);

  // Vietnam Tax calculation (Module T)
  const taxMode = exchangeStatus?.taxMode ?? exchangeInfo?.taxMode ?? 'OFF';
  const taxRate = exchangeStatus?.taxRate ?? exchangeInfo?.taxRate ?? null;
  const taxVndRate = exchangeStatus ? exchangeStatus.taxVndRate : (exchangeInfo?.taxVndRate ?? null);
  const feeRate = effectiveFeeRate;

  const formattedTaxRatePercent = useMemo(() => {
    const rateToUse = taxRate && taxRate.trim?.() !== '' ? taxRate : '0.001';
    try {
      return `${formatDecimal(dec(rateToUse).mul(100).toString(), { locale: 'vi', trimTrailingZeros: true })}%`;
    } catch {
      return '0,1%';
    }
  }, [taxRate]);

  const taxCalculation = useMemo(() => {
    if (side !== 'SELL' || taxMode !== 'WITHHOLD' || isDomesticOrg) return null;
    const effectiveTaxRate = taxRate && taxRate.trim?.() !== '' ? taxRate : '0.001';
    if (!quantity || !activeSymbolInfo || !feeRate || !effectiveTaxRate) return null;
    try {
      const q = dec(quantity);
      if (q.lte(0)) return null;

      let p: Dec | null = null;
      if (orderType === 'MARKET' || orderType === 'STOP_MARKET') {
        p = activeTicker?.lastPrice ? dec(activeTicker.lastPrice) : null;
      } else {
        p = price ? dec(price) : null;
      }

      if (!p || p.lte(0)) return null;

      const gross = p.mul(q);
      const fRate = dec(feeRate);
      const fee = roundUp(gross.mul(fRate));
      const tRate = dec(effectiveTaxRate);
      const tax = roundUp(gross.mul(tRate));
      const net = gross.sub(fee).sub(tax);

      let vnd: Dec | null = null;
      if (taxVndRate !== null && taxVndRate !== undefined && taxVndRate !== '') {
        const vRate = dec(taxVndRate);
        if (vRate.gt(0)) {
          vnd = roundUp(tax.mul(vRate), 0);
        }
      }

      return {
        gross,
        fee,
        tax,
        net,
        vnd,
      };
    } catch {
      return null;
    }
  }, [side, taxMode, isDomesticOrg, quantity, price, orderType, activeTicker?.lastPrice, activeSymbolInfo, feeRate, taxRate, taxVndRate]);

  // Real order dispatching
  const dispatchOrder = async (orderPayload: OrderPayload) => {
    setSubmitting(true);
    try {
      if (orderPayload.isOco) {
        const res = await api.placeOco({ body: orderPayload.body });
        success(`Đặt lệnh OCO ${side === 'BUY' ? 'Mua' : 'Bán'} thành công! Danh sách: ${res.id}`);
      } else {
        const res = await api.placeOrder({ body: orderPayload.body });
        const avgPrice = res.order.avgPrice ? `, giá TB ${formatPrice(res.order.avgPrice, activeSymbolInfo?.tickSize)}` : '';
        success(`Đặt lệnh ${orderType} ${side === 'BUY' ? 'Mua' : 'Bán'} thành công!${avgPrice}`);
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
      let tpslPayload: OrderTpSlPayload | undefined = undefined;
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

      let payload: OrderPayload | null = null;

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
        if (marketInputMode === 'quote') {
          if (!quoteOrderQty) return setValidationError('Vui lòng nhập số tiền USDT muốn giao dịch.');
          if (dec(quoteOrderQty).lt(dec(rules.minNotional))) {
            return setValidationError(`Giá trị lệnh tối thiểu là ${rules.minNotional} USDT.`);
          }
          payload = {
            isOco: false,
            body: {
              symbol,
              side,
              type: 'MARKET',
              clientOrderId,
              quoteOrderQty,
              ...(tpslPayload ? { tpsl: tpslPayload } : {}),
            },
          };
        } else {
          if (!quantity) return setValidationError('Vui lòng nhập khối lượng muốn giao dịch.');
          const qErr = checkQuantity(rules, dec(quantity));
          if (qErr) return setValidationError(getErrorMessage(qErr));
          payload = {
            isOco: false,
            body: {
              symbol,
              side,
              type: 'MARKET',
              clientOrderId,
              quantity,
              ...(tpslPayload ? { tpsl: tpslPayload } : {}),
            },
          };
        }
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

        if (side === 'BUY') {
          if (!quoteOrderQty) return setValidationError('Lệnh Mua Stop-Market cần nhập số USDT (quoteOrderQty).');
          payload = {
            isOco: false,
            body: { symbol, side, type: 'STOP_MARKET', stopPrice, clientOrderId, quoteOrderQty },
          };
        } else {
          if (!quantity) return setValidationError('Lệnh Bán Stop-Market cần nhập số lượng coin.');
          payload = {
            isOco: false,
            body: { symbol, side, type: 'STOP_MARKET', stopPrice, clientOrderId, quantity },
          };
        }
      } else if (orderType === 'TRAILING') {
        const pctNum = parseFloat(trailingPercent);
        if (isNaN(pctNum) || pctNum < 0.1 || pctNum > 20) {
          return setValidationError('Tỷ lệ Trailing phải nằm trong khoảng từ 0.1% đến 20%.');
        }
        const trailingDeltaBips = Math.round(pctNum * 100);

        if (side === 'BUY') {
          if (!quoteOrderQty) return setValidationError('Lệnh Mua Trailing cần nhập số USDT.');
          payload = {
            isOco: false,
            body: {
              symbol,
              side,
              type: 'TRAILING_STOP_MARKET',
              trailingDeltaBips,
              clientOrderId,
              quoteOrderQty,
              ...(activationPrice ? { activationPrice } : {}),
            },
          };
        } else {
          if (!quantity) return setValidationError('Lệnh Bán Trailing cần nhập số lượng coin.');
          payload = {
            isOco: false,
            body: {
              symbol,
              side,
              type: 'TRAILING_STOP_MARKET',
              trailingDeltaBips,
              clientOrderId,
              quantity,
              ...(activationPrice ? { activationPrice } : {}),
            },
          };
        }
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

        payload = {
          isOco: true,
          body: {
            symbol,
            side,
            quantity,
            price,
            stopPrice,
            clientListId: clientOrderId,
            ...(stopLimitPrice ? { stopLimitPrice } : {}),
          },
        };
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
  const isSymbolDisabled = !activeSymbolInfo?.enabled || (disabledSymbols && disabledSymbols.includes(symbol));
  const isEmailUnverified = Boolean(
    isAuthenticated &&
    publicConfig?.emailVerificationRequired === true &&
    user &&
    !user.emailVerified
  );

  const isContractLoading = !exchangeInfo || !activeSymbolInfo;

  const cannotTradeReason = isContractLoading
    ? 'Đang tải thông tin hợp đồng…'
    : tradingHalted
    ? 'Sàn đang tạm dừng giao dịch'
    : isSymbolDisabled
    ? 'Cặp giao dịch đang tạm ngưng'
    : isEmailUnverified
    ? 'Vui lòng xác minh email trước khi đặt lệnh'
    : isPriceInvalid
    ? 'Dữ liệu giá hiện không hợp lệ'
    : null;

  return (
    <div className="flex flex-col bg-[var(--color-bg-surface,#111319)]/95 backdrop-blur-md border border-[var(--color-border-subtle,#1e212b)] rounded-[var(--radius-lg,12px)] p-3.5 text-xs select-none shadow-xl shadow-black/20">
      {/* Side Tabs (Buy / Sell) */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-[var(--color-bg-base,#08090c)] border border-[var(--color-border-subtle,#1e212b)] rounded-[var(--radius-md,8px)] mb-3">
        <button
          type="button"
          onClick={() => {
            setSide('BUY');
            setMarketInputMode('quote');
            setSliderValue(0);
          }}
          className={`py-2 rounded-[var(--radius-sm,4px)] font-bold text-xs transition-all duration-200 cursor-pointer active:scale-[0.98] ${
            side === 'BUY'
              ? 'bg-[var(--color-buy,#22c55e)] text-white shadow-sm shadow-[rgba(34,197,94,0.35)]'
              : 'text-[var(--color-text-secondary,#9ca3af)] hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          MUA {baseAsset}
        </button>
        <button
          type="button"
          onClick={() => {
            setSide('SELL');
            setMarketInputMode('qty');
            setSliderValue(0);
          }}
          className={`py-2 rounded-[var(--radius-sm,4px)] font-bold text-xs transition-all duration-200 cursor-pointer active:scale-[0.98] ${
            side === 'SELL'
              ? 'bg-[var(--color-sell,#f87171)] text-white shadow-sm shadow-[rgba(248,113,113,0.35)]'
              : 'text-[var(--color-text-secondary,#9ca3af)] hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          BÁN {baseAsset}
        </button>
      </div>

      {/* Order Type Tabs: 6 Tabs */}
      <div className="flex items-center gap-1 pb-1.5 mb-3 border-b border-[var(--color-border-subtle,#1e212b)] overflow-x-auto no-scrollbar">
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
              aria-label={tabLabelMap[tab]}
              onClick={() => {
                setOrderType(tab);
                setValidationError(null);
              }}
              className={`font-semibold text-[11px] whitespace-nowrap cursor-pointer px-1.5 pb-1 border-b-2 transition-all duration-150 active:scale-95 ${
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
                `${formatDecimal(freeCoin, { decimals: activeSymbolInfo?.quantityPrecision ?? 8 })} ${baseAsset}`
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
                className="w-full bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-default,#272a33)] rounded px-2 py-1 text-xs font-mono tabular-nums text-white focus:outline-none focus:ring-1 focus:ring-[var(--accent,#818cf8)]/50 focus:border-[var(--accent,#818cf8)]/60 transition-all duration-150"
                placeholder="1%"
              />
            </div>
            <div>
              <span className="text-[10px] text-[var(--color-text-muted,#6b7280)]">Giá vào</span>
              <input
                type="text"
                value={riskEntryPrice}
                onChange={(e) => setRiskEntryPrice(e.target.value)}
                className="w-full bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-default,#272a33)] rounded px-2 py-1 text-xs font-mono tabular-nums text-white focus:outline-none focus:ring-1 focus:ring-[var(--accent,#818cf8)]/50 focus:border-[var(--accent,#818cf8)]/60 transition-all duration-150"
                placeholder="Giá mua"
              />
            </div>
            <div>
              <span className="text-[10px] text-[var(--color-text-muted,#6b7280)]">Giá cắt lỗ</span>
              <input
                type="text"
                value={riskStopPrice}
                onChange={(e) => setRiskStopPrice(e.target.value)}
                className="w-full bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-default,#272a33)] rounded px-2 py-1 text-xs font-mono tabular-nums text-white focus:outline-none focus:ring-1 focus:ring-[var(--accent,#818cf8)]/50 focus:border-[var(--accent,#818cf8)]/60 transition-all duration-150"
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
              placeholder={formattedLastPrice}
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
                className="w-full bg-[var(--color-bg-base,#08090c)] border border-[var(--color-border-default,#272a33)] rounded-[var(--radius-md,8px)] px-3 py-2 text-xs font-mono tabular-nums text-white placeholder-[var(--color-text-muted,#6b7280)] focus:outline-none focus:ring-1 focus:ring-[var(--accent,#818cf8)]/50 focus:border-[var(--accent,#818cf8)]/60 transition-all duration-150"
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
            data-testid="order-price"
            label={orderType === 'OCO' ? 'Giá chốt lời (Limit)' : 'Giá đặt lệnh (Price)'}
            value={price}
            onValueChange={(v) => {
              userChangedPriceRef.current = true;
              setPrice(v);
              recalcTotal(v, quantity);
            }}
            maxDecimals={activeSymbolInfo?.pricePrecision}
            unit={quoteAsset}
            placeholder={formattedLastPrice}
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
                data-testid="order-total"
                label="Tổng số tiền USDT"
                value={quoteOrderQty}
                onValueChange={(v) => { setQuoteOrderQty(v); setSliderValue(0); }}
                maxDecimals={2}
                unit="USDT"
                placeholder="100.00"
              />
            ) : (
              <DecimalInput
                data-testid="order-quantity"
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
            data-testid="order-total"
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
              data-testid="order-quantity"
              label="Khối lượng"
              value={quantity}
              onValueChange={handleQuantityChange}
              maxDecimals={activeSymbolInfo?.quantityPrecision}
              unit={baseAsset}
              placeholder="0.0000"
            />

            {(orderType === 'LIMIT' || orderType === 'STOP_LIMIT') && (
              <DecimalInput
                data-testid="order-total"
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

        {/* Percentage Slider & Quick Percent Buttons */}
        <div className="my-1.5 flex flex-col gap-2">
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
          <div className="grid grid-cols-4 gap-1.5">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => {
                  setSliderValue(pct);
                  handlePercentClick(pct);
                }}
                className={`py-1 text-[11px] font-mono font-medium rounded-[var(--radius-sm,4px)] border cursor-pointer select-none transition-all active:scale-95 hover:border-[var(--accent,#818cf8)]/40 hover:shadow-[0_0_8px_rgba(129,140,248,0.15)] ${
                  sliderValue === pct
                    ? 'bg-[var(--accent,#818cf8)]/15 border-[var(--accent,#818cf8)] text-[var(--color-text-primary,#f3f4f6)] shadow-[0_0_8px_rgba(129,140,248,0.25)]'
                    : 'bg-[var(--color-bg-base,#08090c)] border-[var(--color-border-subtle,#1e212b)] text-[var(--color-text-secondary,#9ca3af)] hover:text-white hover:bg-[var(--color-bg-elevated,#1b1e27)]'
                }`}
              >
                {pct}%
              </button>
            ))}
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
                    className="w-full bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-default,#272a33)] rounded px-2 py-1 text-xs font-mono tabular-nums text-white focus:outline-none focus:ring-1 focus:ring-[var(--accent,#818cf8)]/50 focus:border-[var(--accent,#818cf8)]/60 transition-all duration-150 mt-1"
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
                    className="w-full bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-default,#272a33)] rounded px-2 py-1 text-xs font-mono tabular-nums text-white focus:outline-none focus:ring-1 focus:ring-[var(--accent,#818cf8)]/50 focus:border-[var(--accent,#818cf8)]/60 transition-all duration-150 mt-1"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Vietnam Tax Breakdown (Module T) */}
        {side === 'SELL' && taxMode === 'WITHHOLD' && !isDomesticOrg && taxCalculation ? (
          <div
            data-testid="tax-breakdown"
            className="p-2.5 rounded-[var(--radius-sm,4px)] bg-[var(--color-bg-secondary,#16181d)] border border-[var(--color-border,#242731)] flex flex-col gap-1.5 text-[11px]"
          >
            <div className="flex items-center justify-between pb-1 border-b border-[var(--color-border,#242731)]">
              <span className="font-medium text-[var(--color-text,#e5e7eb)] flex items-center gap-1.5">
                Chi tiết thuế & phí
                <span
                  data-testid="tax-test-label"
                  className="px-1.5 py-0.2 text-[9px] font-semibold tracking-wider uppercase rounded bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  title={`Sàn khấu trừ thuế ${formattedTaxRatePercent} trên giá trị bán (sàn thử nghiệm: số liệu mô phỏng).`}
                >
                  thử nghiệm
                </span>
              </span>
              <span className="text-[10px] text-[var(--color-text-muted,#6b7280)] font-mono">
                {quoteAsset}
              </span>
            </div>

            <div className="flex items-center justify-between text-[var(--color-text-muted,#6b7280)]">
              <span>Giá trị gộp:</span>
              <span
                data-testid="tax-gross"
                data-value={taxCalculation.gross.toString()}
                className="font-mono text-[var(--color-text,#e5e7eb)]"
              >
                {formatDecimal(taxCalculation.gross.toString(), { decimals: 2 })} {quoteAsset}
              </span>
            </div>

            <div className="flex items-center justify-between text-[var(--color-text-muted,#6b7280)]">
              <span>Phí ước tính ({formattedFeeRatePercent}):</span>
              <span
                data-testid="tax-fee"
                data-value={taxCalculation.fee.toString()}
                className="font-mono text-[var(--color-text,#e5e7eb)]"
              >
                {formatDecimal(taxCalculation.fee.toString(), { decimals: 8 })} {quoteAsset}
              </span>
            </div>

            <div
              data-testid="spot-tax-line"
              className="flex items-center justify-between text-[var(--color-text-muted,#6b7280)]"
            >
              <span className="flex items-center gap-1">
                Thuế ước tính (<span data-testid="tax-rate-label">{formattedTaxRatePercent}</span>):
                <span
                  title={`Sàn khấu trừ thuế ${formattedTaxRatePercent} trên giá trị bán (sàn thử nghiệm: số liệu mô phỏng).`}
                  className="cursor-help text-[var(--color-text-muted,#6b7280)] hover:text-amber-400"
                >
                  <Info className="w-3 h-3" />
                </span>
              </span>
              <span
                data-testid="tax-amount"
                data-value={taxCalculation.tax.toString()}
                className="font-mono text-amber-400 font-medium"
              >
                {formatDecimal(taxCalculation.tax.toString(), { decimals: 8 })} {quoteAsset}
              </span>
            </div>

            {taxCalculation.vnd !== null && (
              <div className="flex items-center justify-between text-[var(--color-text-muted,#6b7280)]">
                <span>Quy đổi VND:</span>
                <span
                  data-testid="tax-vnd"
                  data-value={taxCalculation.vnd.toString()}
                  className="font-mono text-amber-300/90"
                >
                  ~ {formatDecimal(taxCalculation.vnd.toString(), { decimals: 0 })} ₫
                </span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border,#242731)] font-medium">
              <span className="text-[var(--color-text,#e5e7eb)]">Thực nhận ước tính:</span>
              <span
                data-testid="tax-net"
                data-value={taxCalculation.net.toString()}
                className="font-mono text-[var(--color-buy,#34d399)]"
              >
                {formatDecimal(taxCalculation.net.toString(), { decimals: 8 })} {quoteAsset}
              </span>
            </div>
          </div>
        ) : (
          /* Estimated Fee & Tax info */
          <div className="flex flex-col gap-1.5 text-[11px] text-[var(--color-text-muted,#6b7280)]">
            <div className="flex items-center justify-between">
              <span>Phí giao dịch ({formattedFeeRatePercent}):</span>
              <span className="font-mono text-[var(--color-text-secondary,#9ca3af)]">
                ~{estimatedFee} {side === 'BUY' ? baseAsset : quoteAsset}
              </span>
            </div>
            {taxMode === 'OFF' ? (
              <div data-testid="spot-tax-line" className="flex items-center justify-between">
                <span>Thuế:</span>
                <span className="font-mono text-[var(--color-text-secondary,#9ca3af)]">
                  không áp dụng (sàn đang tắt)
                </span>
              </div>
            ) : side === 'BUY' ? (
              <div data-testid="spot-tax-line" className="flex items-center justify-between">
                <span>Thuế ({formattedTaxRatePercent}):</span>
                <span className="font-mono text-[var(--color-text-secondary,#9ca3af)]">
                  0 — chỉ khấu trừ khi bán
                </span>
              </div>
            ) : isDomesticOrg ? (
              <div data-testid="spot-tax-line" className="flex items-center justify-between">
                <span>Thuế:</span>
                <span className="font-mono text-[var(--color-text-secondary,#9ca3af)]">
                  0 — tổ chức trong nước tự kê khai
                </span>
              </div>
            ) : (
              <div data-testid="spot-tax-line" className="flex items-center justify-between">
                <span>Thuế ({formattedTaxRatePercent}):</span>
                <span className="font-mono text-[var(--color-text-secondary,#9ca3af)]">
                  ước tính khi nhập khối lượng
                </span>
              </div>
            )}
          </div>
        )}

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
            className="mt-2 active:scale-[0.99] transition-transform"
          >
            Đăng nhập để giao dịch
          </Button>
        ) : cannotTradeReason ? (
          <div className="flex flex-col gap-2 mt-2">
            <Button
              type="button"
              disabled
              fullWidth
              className="bg-neutral-800 text-neutral-400 border border-neutral-700"
            >
              {cannotTradeReason}
            </Button>
            {isEmailUnverified && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                fullWidth
                loading={resendingEmail}
                disabled={emailCooldown > 0}
                onClick={handleResendEmail}
                className="text-[11px]"
              >
                {emailCooldown > 0 ? `Gửi lại sau ${emailCooldown}s` : 'Gửi lại email xác minh'}
              </Button>
            )}
          </div>
        ) : (
          <Button
            type="submit"
            variant={side === 'BUY' ? 'buy' : 'sell'}
            loading={submitting}
            fullWidth
            aria-label={side === 'BUY' ? `MUA ${baseAsset}` : `BÁN ${baseAsset}`}
            className="mt-2 font-bold text-sm tracking-wide active:scale-[0.99] transition-transform"
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

            {'price' in confirmModalData.body && Boolean(confirmModalData.body.price) && (
              <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border-subtle,#1e212b)]">
                <span className="text-[var(--color-text-muted,#6b7280)]">Mức giá:</span>
                <span className="font-mono text-white">{String(confirmModalData.body.price)} {quoteAsset}</span>
              </div>
            )}

            {'stopPrice' in confirmModalData.body && Boolean(confirmModalData.body.stopPrice) && (
              <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border-subtle,#1e212b)]">
                <span className="text-[var(--color-text-muted,#6b7280)]">Giá kích hoạt (Stop):</span>
                <span className="font-mono text-[var(--color-accent-primary,#818cf8)]">{String(confirmModalData.body.stopPrice)} {quoteAsset}</span>
              </div>
            )}

            {'quantity' in confirmModalData.body && Boolean(confirmModalData.body.quantity) && (
              <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border-subtle,#1e212b)]">
                <span className="text-[var(--color-text-muted,#6b7280)]">Khối lượng:</span>
                <span className="font-mono text-white">{String(confirmModalData.body.quantity)} {baseAsset}</span>
              </div>
            )}

            {'quoteOrderQty' in confirmModalData.body && Boolean(confirmModalData.body.quoteOrderQty) && (
              <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border-subtle,#1e212b)]">
                <span className="text-[var(--color-text-muted,#6b7280)]">Số tiền thanh toán:</span>
                <span className="font-mono text-white">{String(confirmModalData.body.quoteOrderQty)} USDT</span>
              </div>
            )}

            {'tpsl' in confirmModalData.body && Boolean(confirmModalData.body.tpsl) && (
              <div className="p-2 rounded bg-[var(--color-bg-base,#08090c)] border border-[var(--color-border-default,#272a33)] flex flex-col gap-1">
                <span className="font-bold text-[var(--color-text-primary,#f3f4f6)]">Kèm TP/SL:</span>
                {(confirmModalData.body.tpsl as OrderTpSlPayload).takeProfitPrice && (
                  <div className="text-[var(--color-buy,#22c55e)]">Chốt lời: {(confirmModalData.body.tpsl as OrderTpSlPayload).takeProfitPrice}</div>
                )}
                {(confirmModalData.body.tpsl as OrderTpSlPayload).stopLossPrice && (
                  <div className="text-[var(--color-sell,#f87171)]">Cắt lỗ: {(confirmModalData.body.tpsl as OrderTpSlPayload).stopLossPrice}</div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted,#6b7280)] mt-1">
              <span>Phí giao dịch ({formattedFeeRatePercent}):</span>
              <span className="font-mono">~{estimatedFee} {side === 'BUY' ? baseAsset : quoteAsset}</span>
            </div>

            {taxMode === 'OFF' ? (
              <div data-testid="spot-tax-line" className="flex items-center justify-between text-[11px] text-[var(--color-text-muted,#6b7280)]">
                <span>Thuế:</span>
                <span className="font-mono text-[var(--color-text-secondary,#9ca3af)]">
                  không áp dụng (sàn đang tắt)
                </span>
              </div>
            ) : side === 'BUY' ? (
              <div data-testid="spot-tax-line" className="flex items-center justify-between text-[11px] text-[var(--color-text-muted,#6b7280)]">
                <span>Thuế ({formattedTaxRatePercent}):</span>
                <span className="font-mono text-[var(--color-text-secondary,#9ca3af)]">
                  0 — chỉ khấu trừ khi bán
                </span>
              </div>
            ) : isDomesticOrg ? (
              <div data-testid="spot-tax-line" className="flex items-center justify-between text-[11px] text-[var(--color-text-muted,#6b7280)]">
                <span>Thuế:</span>
                <span className="font-mono text-[var(--color-text-secondary,#9ca3af)]">
                  0 — tổ chức trong nước tự kê khai
                </span>
              </div>
            ) : taxCalculation ? (
              <>
                <div data-testid="spot-tax-line" className="flex items-center justify-between text-[11px] text-[var(--color-text-muted,#6b7280)]">
                  <span>Thuế ước tính ({formattedTaxRatePercent}):</span>
                  <span className="font-mono text-amber-400 font-medium">
                    {formatDecimal(taxCalculation.tax.toString(), { decimals: 8 })} {quoteAsset}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-medium pt-1 border-t border-[var(--color-border-subtle,#1e212b)]">
                  <span className="text-[var(--color-text,#e5e7eb)]">Thực nhận ước tính:</span>
                  <span className="font-mono text-[var(--color-buy,#34d399)]">
                    {formatDecimal(taxCalculation.net.toString(), { decimals: 8 })} {quoteAsset}
                  </span>
                </div>
              </>
            ) : (
              <div data-testid="spot-tax-line" className="flex items-center justify-between text-[11px] text-[var(--color-text-muted,#6b7280)]">
                <span>Thuế ({formattedTaxRatePercent}):</span>
                <span className="font-mono text-[var(--color-text-secondary,#9ca3af)]">
                  ước tính khi nhập khối lượng
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[var(--color-border-subtle,#1e212b)]">
              <Button
                variant="secondary"
                onClick={() => setConfirmModalData(null)}
              >
                Hủy bỏ
              </Button>
              <Button
                data-testid="order-confirm"
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
