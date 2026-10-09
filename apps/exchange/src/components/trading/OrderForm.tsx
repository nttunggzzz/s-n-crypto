import React, { useState, useEffect, useMemo } from 'react';
import type { Balances, OrderSide, OrderType, TimeInForce } from '@cex/contracts';
import { ApiError } from '@cex/contracts';
import { dec, floorToStep, roundDown, checkPrice, checkQuantity, checkNotional, type SymbolRules } from '@cex/core';
import { getApiClient } from '../../services/api.ts';
import { getErrorMessage } from '../../services/errors.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useMarket } from '../../context/MarketContext.tsx';
import { Button, DecimalInput, useToast, formatDecimal } from '@cex/ui';

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
  const { activeSymbolInfo, activeTicker, exchangeInfo, tradingHalted } = useMarket();
  const { success, error: toastError } = useToast();
  const api = getApiClient();

  const [side, setSide] = useState<OrderSide>('BUY');
  const [orderType, setOrderType] = useState<OrderType>('LIMIT');
  const [timeInForce, setTimeInForce] = useState<TimeInForce>('GTC');

  // Inputs
  const [price, setPrice] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [quoteOrderQty, setQuoteOrderQty] = useState<string>('');
  const [marketInputMode, setMarketInputMode] = useState<'qty' | 'quote'>('quote');

  const [balances, setBalances] = useState<Balances | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync selected price from Orderbook clicks
  useEffect(() => {
    if (selectedPrice && orderType === 'LIMIT') {
      setPrice(selectedPrice);
    }
  }, [selectedPrice, orderType]);

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

  const baseAsset = activeSymbolInfo?.baseAsset || 'COIN';
  const quoteAsset = activeSymbolInfo?.quoteAsset || 'USDT';

  const freeQuote = useMemo(() => {
    return balances?.items.find((b) => b.asset === quoteAsset)?.available || '0';
  }, [balances, quoteAsset]);

  const freeBase = useMemo(() => {
    return balances?.items.find((b) => b.asset === baseAsset)?.available || '0';
  }, [balances, baseAsset]);

  // Handle Percentage buttons: 25%, 50%, 75%, 100% computed via @cex/core
  const handlePercentClick = (percent: number) => {
    setValidationError(null);
    if (!activeSymbolInfo) return;

    try {
      const pct = dec((percent / 100).toString());
      const step = dec(activeSymbolInfo.stepSize);

      if (side === 'BUY') {
        const availableUsdt = dec(freeQuote);
        if (availableUsdt.lte(0)) return;

        if (orderType === 'MARKET') {
          if (marketInputMode === 'quote') {
            const calculatedQuote = roundDown(availableUsdt.mul(pct), 8);
            setQuoteOrderQty(calculatedQuote.toString());
          } else {
            // Need a reference price to estimate qty
            const refPrice = activeTicker?.lastPrice ? dec(activeTicker.lastPrice) : null;
            if (refPrice && refPrice.gt(0)) {
              const estQty = floorToStep(availableUsdt.mul(pct).div(refPrice), step);
              setQuantity(estQty.toString());
            }
          }
        } else {
          // Limit Buy: requires valid price
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

  const freeCoin = freeBase;

  // Estimated fee calculation: feeRate * notional
  const estimatedFee = useMemo(() => {
    if (!exchangeInfo?.feeRate) return '0.00';
    try {
      const rate = dec(exchangeInfo.feeRate);
      if (side === 'BUY') {
        if (orderType === 'MARKET' && marketInputMode === 'quote' && quoteOrderQty) {
          // fee in base asset: (quote / price) * feeRate
          const p = activeTicker?.lastPrice ? dec(activeTicker.lastPrice) : null;
          if (p && p.gt(0)) {
            return formatDecimal(roundDown(dec(quoteOrderQty).div(p).mul(rate), 6).toString());
          }
        } else if (quantity) {
          return formatDecimal(roundDown(dec(quantity).mul(rate), 6).toString());
        }
      } else {
        // Sell: fee in USDT = price * quantity * feeRate
        const p = orderType === 'MARKET' ? (activeTicker?.lastPrice ? dec(activeTicker.lastPrice) : null) : (price ? dec(price) : null);
        if (p && quantity) {
          const notional = p.mul(dec(quantity));
          return formatDecimal(roundDown(notional.mul(rate), 2).toString());
        }
      }
    } catch {}
    return '0.00';
  }, [exchangeInfo, side, orderType, marketInputMode, quoteOrderQty, quantity, price, activeTicker]);

  // Submit order handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!isAuthenticated) {
      onNavigateToLogin?.();
      return;
    }

    if (!activeSymbolInfo) return;

    // Rules validation using @cex/core
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

      if (orderType === 'LIMIT') {
        if (!price || !quantity) {
          setValidationError('Vui lòng nhập đầy đủ giá và khối lượng.');
          return;
        }

        const priceDec = dec(price);
        const qtyDec = dec(quantity);

        const priceErr = checkPrice(rules, priceDec);
        if (priceErr) {
          setValidationError(getErrorMessage(priceErr));
          return;
        }

        const qtyErr = checkQuantity(rules, qtyDec);
        if (qtyErr) {
          setValidationError(getErrorMessage(qtyErr));
          return;
        }

        const notional = priceDec.mul(qtyDec);
        const notionalErr = checkNotional(rules, notional);
        if (notionalErr) {
          setValidationError(`Giá trị lệnh tối thiểu là ${rules.minNotional} USDT.`);
          return;
        }

        setSubmitting(true);
        const res = await api.placeOrder({
          body: {
            symbol,
            side,
            type: 'LIMIT',
            timeInForce,
            price,
            quantity,
            clientOrderId,
          },
        });
        setSubmitting(false);

        success(`Đặt lệnh Limit ${side === 'BUY' ? 'Mua' : 'Bán'} thành công! Trạng thái: ${res.order.status}`);
        setQuantity('');
        fetchBalances();
        onOrderPlaced?.();
      } else {
        // MARKET order
        const body: Record<string, string> = {
          symbol,
          side,
          type: 'MARKET',
          clientOrderId,
        };

        if (marketInputMode === 'quote') {
          if (!quoteOrderQty) {
            setValidationError('Vui lòng nhập số tiền USDT muốn giao dịch.');
            return;
          }
          const quoteDec = dec(quoteOrderQty);
          if (quoteDec.lt(dec(rules.minNotional))) {
            setValidationError(`Giá trị lệnh tối thiểu là ${rules.minNotional} USDT.`);
            return;
          }
          body.quoteOrderQty = quoteOrderQty;
        } else {
          if (!quantity) {
            setValidationError('Vui lòng nhập khối lượng muốn giao dịch.');
            return;
          }
          const qtyDec = dec(quantity);
          const qtyErr = checkQuantity(rules, qtyDec);
          if (qtyErr) {
            setValidationError(getErrorMessage(qtyErr));
            return;
          }
          body.quantity = quantity;
        }

        setSubmitting(true);
        const res = await api.placeOrder({
          body: body as never,
        });
        setSubmitting(false);

        const avgPrice = res.order.avgPrice ? `ở giá TB ${formatDecimal(res.order.avgPrice)}` : '';
        success(`Lệnh Market ${side === 'BUY' ? 'Mua' : 'Bán'} đã khớp ${avgPrice}!`);
        setQuantity('');
        setQuoteOrderQty('');
        fetchBalances();
        onOrderPlaced?.();
      }
    } catch (err: unknown) {
      setSubmitting(false);
      if (err instanceof ApiError) {
        toastError(getErrorMessage(err.code));
      } else {
        toastError('Không thể gửi lệnh lên hệ thống.');
      }
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
    <div className="flex flex-col bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-subtle,#1e212b)] rounded-[var(--radius-lg,12px)] p-4 text-xs">
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

      {/* Order Type Tabs (Limit / Market) */}
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-[var(--color-border-subtle,#1e212b)]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOrderType('LIMIT')}
            className={`font-semibold cursor-pointer pb-1 border-b-2 transition-colors ${
              orderType === 'LIMIT'
                ? 'border-[var(--color-accent-primary,#818cf8)] text-[var(--color-text-primary,#f3f4f6)]'
                : 'border-transparent text-[var(--color-text-muted,#6b7280)] hover:text-white'
            }`}
          >
            Giới hạn (Limit)
          </button>
          <button
            type="button"
            onClick={() => setOrderType('MARKET')}
            className={`font-semibold cursor-pointer pb-1 border-b-2 transition-colors ${
              orderType === 'MARKET'
                ? 'border-[var(--color-accent-primary,#818cf8)] text-[var(--color-text-primary,#f3f4f6)]'
                : 'border-transparent text-[var(--color-text-muted,#6b7280)] hover:text-white'
            }`}
          >
            Thị trường (Market)
          </button>
        </div>

        {orderType === 'LIMIT' && (
          <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted,#6b7280)]">
            <span
              onClick={() => setTimeInForce('GTC')}
              className={`cursor-pointer px-1.5 py-0.5 rounded ${timeInForce === 'GTC' ? 'bg-[var(--color-bg-elevated,#1b1e27)] text-white' : ''}`}
            >
              GTC
            </span>
            <span>/</span>
            <span
              onClick={() => setTimeInForce('IOC')}
              className={`cursor-pointer px-1.5 py-0.5 rounded ${timeInForce === 'IOC' ? 'bg-[var(--color-bg-elevated,#1b1e27)] text-white' : ''}`}
            >
              IOC
            </span>
          </div>
        )}
      </div>

      {/* Available Balance Row */}
      <div className="flex items-center justify-between mb-3 text-[11px] text-[var(--color-text-secondary,#9ca3af)]">
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
              Đăng nhập để xem
            </span>
          )}
        </span>
      </div>

      {/* Inputs Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {orderType === 'LIMIT' ? (
          <>
            <DecimalInput
              label="Giá đặt lệnh"
              value={price}
              onValueChange={setPrice}
              maxDecimals={activeSymbolInfo?.pricePrecision}
              unit={quoteAsset}
              placeholder={activeTicker?.lastPrice || '0.00'}
            />

            <DecimalInput
              label="Khối lượng"
              value={quantity}
              onValueChange={setQuantity}
              maxDecimals={activeSymbolInfo?.quantityPrecision}
              unit={baseAsset}
              placeholder="0.0000"
            />
          </>
        ) : (
          /* MARKET order inputs */
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
                onValueChange={setQuoteOrderQty}
                maxDecimals={2}
                unit="USDT"
                placeholder="100.00"
              />
            ) : (
              <DecimalInput
                label="Khối lượng cần mua/bán"
                value={quantity}
                onValueChange={setQuantity}
                maxDecimals={activeSymbolInfo?.quantityPrecision}
                unit={baseAsset}
                placeholder="0.0000"
              />
            )}
          </div>
        )}

        {/* 25% / 50% / 75% / 100% Quick Buttons */}
        <div className="grid grid-cols-4 gap-1.5 my-1">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => handlePercentClick(pct)}
              className="py-1 px-1 bg-[var(--color-bg-elevated,#1b1e27)] hover:bg-[#262b38] border border-[var(--color-border-subtle,#1e212b)] rounded-[var(--radius-sm,4px)] text-[11px] font-mono text-[var(--color-text-secondary,#9ca3af)] hover:text-white transition-colors cursor-pointer"
            >
              {pct}%
            </button>
          ))}
        </div>

        {/* Estimated Fee info */}
        <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted,#6b7280)] pt-1">
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
    </div>
  );
};
