import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type IPriceLine,
} from 'lightweight-charts';
import type { Candle, CandleInterval, Order, FuturesPosition } from '@cex/contracts';
import { ASSET_TAG_LABELS } from '@cex/contracts';
import { getApiClient } from '../../services/api.ts';
import { useMarket } from '../../context/MarketContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { Skeleton, formatDecimal } from '@cex/ui';

export interface CandlestickChartProps {
  symbol: string;
  marketType?: 'spot' | 'futures';
  futuresPosition?: FuturesPosition | null;
}

const INTERVALS: CandleInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

type ChartType = 'candles' | 'line' | 'area';

export const CandlestickChart: React.FC<CandlestickChartProps> = ({
  symbol,
  marketType = 'spot',
  futuresPosition,
}) => {
  const [activeTab, setActiveTab] = useState<'chart' | 'info'>('chart');
  const [interval, setIntervalState] = useState<CandleInterval>('15m');
  const [chartType, setChartType] = useState<ChartType>('candles');
  const [showIndicators, setShowIndicators] = useState({ ma: true, vol: true });
  const [countdown, setCountdown] = useState<string | null>(null);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [legendData, setLegendData] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    change: number;
    amplitude: number;
    volume: number;
    ma5?: number;
    ma10?: number;
    ma20?: number;
  } | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ma5SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ma10SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ma20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const orderPriceLinesRef = useRef<IPriceLine[]>([]);

  const api = getApiClient();
  const { activeSymbolInfo, activeTicker, exchangeInfo, realtimeClient } = useMarket();
  const { isAuthenticated } = useAuth();
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [avgCost, setAvgCost] = useState<string | null>(null);

  // Load default interval from preferences
  useEffect(() => {
    if (isAuthenticated) {
      api.getPreferences()
        .then((pref) => {
          if (pref.defaultInterval) setIntervalState(pref.defaultInterval);
        })
        .catch(() => {});
    }
  }, [api, isAuthenticated]);

  // Find asset metadata from exchangeInfo
  const assetInfo = useMemo(() => {
    if (!exchangeInfo || !activeSymbolInfo) return null;
    return exchangeInfo.assets?.find((a) => a.asset === activeSymbolInfo.baseAsset) || null;
  }, [exchangeInfo, activeSymbolInfo]);

  // Fetch open orders and position avgCost to render price lines
  useEffect(() => {
    if (!isAuthenticated) {
      setOpenOrders([]);
      setAvgCost(null);
      return;
    }

    if (marketType === 'futures') {
      setAvgCost(null);
      api.futuresOpenOrders({ query: { symbol } })
        .then((res) => {
          setOpenOrders(
            res.items.map((fo) => ({
              id: fo.id,
              symbol: fo.symbol,
              side: fo.side,
              type: fo.type,
              price: fo.price || '0',
              quantity: fo.quantity,
              executedQty: fo.executedQty,
              createdAt: fo.createdAt,
              updatedAt: fo.updatedAt,
              status: fo.status,
              source: 'USER',
              icebergQty: null,
              timeInForce: 'GTC',
              avgPrice: null,
              quoteSpent: '0',
              baseReceived: '0',
              cumFee: '0',
              clientOrderId: null,
              stopPrice: null,
              closeReason: null,
            } as any))
          );
        })
        .catch(() => setOpenOrders([]));
      return;
    }

    api.openOrders({ query: { symbol } })
      .then((res) => setOpenOrders(res.items))
      .catch(() => setOpenOrders([]));

    api.portfolio()
      .then((port) => {
        const base = activeSymbolInfo?.baseAsset;
        const pos = port.positions.find((p) => p.asset === base);
        setAvgCost(pos?.avgCost || null);
      })
      .catch(() => setAvgCost(null));
  }, [api, symbol, isAuthenticated, activeSymbolInfo, marketType]);

  // Fetch historical candles
  useEffect(() => {
    let active = true;
    async function fetchCandles() {
      setLoading(true);
      try {
        const res = marketType === 'futures'
          ? await api.futuresCandles({
              params: { symbol },
              query: { interval, limit: 150 },
            })
          : await api.candles({
              params: { symbol },
              query: { interval, limit: 150 },
            });
        if (active) {
          setCandles(res.items);
        }
      } catch {
        if (active) setCandles([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchCandles();
    return () => {
      active = false;
    };
  }, [api, symbol, interval, marketType]);

  // Countdown timer for current candle close
  useEffect(() => {
    if (candles.length === 0) return;
    const intervalMap: Record<CandleInterval, number> = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '1h': 3600,
      '4h': 14400,
      '1d': 86400,
    };
    const intervalSec = intervalMap[interval] || 900;

    const timer = setInterval(() => {
      const lastCandle = candles[candles.length - 1];
      if (!lastCandle) return;
      const openSec = Math.floor(new Date(lastCandle.openTime).getTime() / 1000);
      const closeSec = openSec + intervalSec;
      const nowSec = Math.floor(Date.now() / 1000);
      const diff = Math.max(0, closeSec - nowSec);
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      setCountdown(`${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [candles, interval]);

  // Initialize and update Lightweight Chart
  useEffect(() => {
    if (!chartContainerRef.current || activeTab !== 'chart') return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#a1a1aa',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(29, 30, 33, 0.45)' },
        horzLines: { color: 'rgba(29, 30, 33, 0.45)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: '#1d1e21',
        scaleMargins: { top: 0.1, bottom: 0.22 },
      },
      timeScale: {
        borderColor: '#1d1e21',
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true,
    });
    chartRef.current = chart;

    // Prepare chart series based on chartType
    const formattedData = candles
      .map((c) => ({
        time: Math.floor(new Date(c.openTime).getTime() / 1000) as UTCTimestamp,
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseFloat(c.volume),
      }))
      .filter((c, idx, arr) => idx === 0 || (arr[idx - 1] && c.time > arr[idx - 1]!.time))
      .sort((a, b) => a.time - b.time);

    let mainSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'> | null = null;

    if (chartType === 'candles') {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: '#1fc27a',
        downColor: '#f2475f',
        borderUpColor: '#1fc27a',
        borderDownColor: '#f2475f',
        wickUpColor: '#1fc27a',
        wickDownColor: '#f2475f',
      });
      series.setData(formattedData);
      candleSeriesRef.current = series;
      mainSeries = series;
    } else if (chartType === 'line') {
      const series = chart.addSeries(LineSeries, {
        color: '#818cf8',
        lineWidth: 2,
      });
      series.setData(formattedData.map((d) => ({ time: d.time, value: d.close })));
      lineSeriesRef.current = series;
      mainSeries = series;
    } else {
      const series = chart.addSeries(AreaSeries, {
        topColor: 'rgba(129, 140, 248, 0.4)',
        bottomColor: 'rgba(129, 140, 248, 0.0)',
        lineColor: '#818cf8',
        lineWidth: 2,
      });
      series.setData(formattedData.map((d) => ({ time: d.time, value: d.close })));
      areaSeriesRef.current = series;
      mainSeries = series;
    }

    // Volume histogram
    if (showIndicators.vol) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });
      volumeSeries.setData(
        formattedData.map((d) => ({
          time: d.time,
          value: d.volume,
          color: d.close >= d.open ? 'rgba(31, 194, 122, 0.35)' : 'rgba(242, 71, 95, 0.35)',
        }))
      );
      volumeSeriesRef.current = volumeSeries;
    }

    // Moving Averages: MA5, MA10, MA20
    if (showIndicators.ma && formattedData.length >= 5) {
      const calcMA = (period: number) => {
        const maData: { time: UTCTimestamp; value: number }[] = [];
        for (let i = period - 1; i < formattedData.length; i++) {
          let sum = 0;
          for (let j = 0; j < period; j++) {
            const dataPoint = formattedData[i - j];
            if (dataPoint) {
              sum += dataPoint.close;
            }
          }
          const currentPoint = formattedData[i];
          if (currentPoint) {
            maData.push({ time: currentPoint.time, value: sum / period });
          }
        }
        return maData;
      };

      const ma5 = chart.addSeries(LineSeries, {
        color: '#eab308',
        lineWidth: 1,
        priceLineVisible: false,
      });
      ma5.setData(calcMA(5));
      ma5SeriesRef.current = ma5;

      const ma10 = chart.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 1,
        priceLineVisible: false,
      });
      ma10.setData(calcMA(10));
      ma10SeriesRef.current = ma10;

      const ma20 = chart.addSeries(LineSeries, {
        color: '#ec4899',
        lineWidth: 1,
        priceLineVisible: false,
      });
      ma20.setData(calcMA(20));
      ma20SeriesRef.current = ma20;
    }

    // Draw open orders, TP/SL, Stop triggers, and Avg Cost as horizontal lines
    if (mainSeries) {
      orderPriceLinesRef.current = [];

      const tick = activeSymbolInfo?.tickSize || '0.01';
      const priceDecimals = tick.includes('.') ? (tick.split('.')[1]?.length ?? 2) : 2;

      // 1. Avg Cost line from portfolio (Spot only)
      if (marketType === 'spot' && avgCost) {
        const costLine = mainSeries.createPriceLine({
          price: parseFloat(avgCost),
          color: '#f59e0b',
          lineWidth: 2,
          lineStyle: 1, // Dotted
          axisLabelVisible: true,
          title: `Giá vốn ${formatDecimal(avgCost, { decimals: priceDecimals })}`,
        });
        orderPriceLinesRef.current.push(costLine);
      }

      // 2. Futures Position lines
      if (marketType === 'futures' && futuresPosition) {
        // Entry Price (white solid)
        if (futuresPosition.entryPrice) {
          const entryLine = mainSeries.createPriceLine({
            price: parseFloat(futuresPosition.entryPrice),
            color: '#ffffff',
            lineWidth: 1,
            lineStyle: 0,
            axisLabelVisible: true,
            title: `Giá vào ${formatDecimal(futuresPosition.entryPrice, { decimals: priceDecimals })}`,
          });
          orderPriceLinesRef.current.push(entryLine);
        }

        // Liquidation Price (red dashed)
        if (futuresPosition.liquidationPrice) {
          const liqLine = mainSeries.createPriceLine({
            price: parseFloat(futuresPosition.liquidationPrice),
            color: '#f2475f',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `Giá thanh lý ${formatDecimal(futuresPosition.liquidationPrice, { decimals: priceDecimals })}`,
          });
          orderPriceLinesRef.current.push(liqLine);
        }

        // Take Profit (green)
        if (futuresPosition.takeProfitPrice) {
          const tpLine = mainSeries.createPriceLine({
            price: parseFloat(futuresPosition.takeProfitPrice),
            color: '#1fc27a',
            lineWidth: 1,
            lineStyle: 0,
            axisLabelVisible: true,
            title: `TP ${formatDecimal(futuresPosition.takeProfitPrice, { decimals: priceDecimals })}`,
          });
          orderPriceLinesRef.current.push(tpLine);
        }

        // Stop Loss (red)
        if (futuresPosition.stopLossPrice) {
          const slLine = mainSeries.createPriceLine({
            price: parseFloat(futuresPosition.stopLossPrice),
            color: '#f2475f',
            lineWidth: 1,
            lineStyle: 0,
            axisLabelVisible: true,
            title: `SL ${formatDecimal(futuresPosition.stopLossPrice, { decimals: priceDecimals })}`,
          });
          orderPriceLinesRef.current.push(slLine);
        }
      }

      // 3. Open orders lines
      if (openOrders.length > 0) {
        openOrders.forEach((ord) => {
          // Limit Price
          if (ord.price) {
            const line = mainSeries!.createPriceLine({
              price: parseFloat(ord.price),
              color: ord.side === 'BUY' ? '#1fc27a' : '#f2475f',
              lineWidth: 1,
              lineStyle: 2, // Dashed
              axisLabelVisible: true,
              title: `${ord.side === 'BUY' ? 'Mua' : 'Bán'} ${ord.quantity || ''}`,
            });
            orderPriceLinesRef.current.push(line);
          }

          // Stop Price
          if (ord.stopPrice) {
            const stopLine = mainSeries!.createPriceLine({
              price: parseFloat(ord.stopPrice),
              color: '#818cf8',
              lineWidth: 1,
              lineStyle: 3, // Large dashed
              axisLabelVisible: true,
              title: `Stop ${ord.stopPrice}`,
            });
            orderPriceLinesRef.current.push(stopLine);
          }

          // Attached TP / SL
          if (ord.tpsl?.takeProfitPrice) {
            const tpLine = mainSeries!.createPriceLine({
              price: parseFloat(ord.tpsl.takeProfitPrice),
              color: '#22c55e',
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: `TP ${ord.tpsl.takeProfitPrice}`,
            });
            orderPriceLinesRef.current.push(tpLine);
          }
          if (ord.tpsl?.stopLossPrice) {
            const slLine = mainSeries!.createPriceLine({
              price: parseFloat(ord.tpsl.stopLossPrice),
              color: '#ef4444',
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: `SL ${ord.tpsl.stopLossPrice}`,
            });
            orderPriceLinesRef.current.push(slLine);
          }
        });
      }
    }

    // Default legend values to latest candle
    if (formattedData.length > 0) {
      const last = formattedData[formattedData.length - 1];
      if (last) {
        const chg = last.close - last.open;
        const chgPct = (chg / (last.open || 1)) * 100;
        setLegendData({
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
          change: chgPct,
          amplitude: ((last.high - last.low) / (last.low || 1)) * 100,
          volume: last.volume,
        });
      }
    }

    // Crosshair move listener to update Legend
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) return;
      const data = param.seriesData.get(mainSeries!) as {
        open?: number;
        high?: number;
        low?: number;
        close?: number;
        value?: number;
      };
      if (data && 'open' in data) {
        const o = data.open ?? 0;
        const h = data.high ?? 0;
        const l = data.low ?? 0;
        const c = data.close ?? 0;
        const chgPct = ((c - o) / (o || 1)) * 100;
        setLegendData((prev) => ({
          open: o,
          high: h,
          low: l,
          close: c,
          change: chgPct,
          amplitude: ((h - l) / (l || 1)) * 100,
          volume: prev?.volume || 0,
        }));
      }
    });

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, chartType, showIndicators, openOrders, avgCost, activeTab, futuresPosition, marketType]);

  // Realtime candle updates listener
  useEffect(() => {
    if (!realtimeClient) return;

    const channel = marketType === 'futures' ? `futures:candles:${symbol}:${interval}` : `candles:${symbol}:${interval}`;
    const unsub = realtimeClient.subscribe(channel, (event: unknown) => {
      const ev = event as { candle?: Candle };
      if (!ev.candle) return;
      const c = ev.candle;
      const candleTime = Math.floor(new Date(c.openTime).getTime() / 1000) as UTCTimestamp;

      if (candleSeriesRef.current) {
        candleSeriesRef.current.update({
          time: candleTime,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
        });
      }
      if (lineSeriesRef.current) {
        lineSeriesRef.current.update({ time: candleTime, value: parseFloat(c.close) });
      }
      if (areaSeriesRef.current) {
        areaSeriesRef.current.update({ time: candleTime, value: parseFloat(c.close) });
      }
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.update({
          time: candleTime,
          value: parseFloat(c.volume),
          color: parseFloat(c.close) >= parseFloat(c.open) ? 'rgba(31, 194, 122, 0.35)' : 'rgba(242, 71, 95, 0.35)',
        });
      }

      // Update legend data if chart is active
      const o = parseFloat(c.open);
      const h = parseFloat(c.high);
      const l = parseFloat(c.low);
      const cl = parseFloat(c.close);
      const chgPct = ((cl - o) / (o || 1)) * 100;
      setLegendData({
        open: o,
        high: h,
        low: l,
        close: cl,
        change: chgPct,
        amplitude: ((h - l) / (l || 1)) * 100,
        volume: parseFloat(c.volume),
      });
    });

    return () => unsub();
  }, [realtimeClient, symbol, interval, marketType]);

  return (
    <div className="flex flex-col bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,10px)] overflow-hidden h-[420px] select-none">
      {/* Top Header / Toolbar */}
      <div className="px-3 py-2 border-b border-[var(--line,#1d1e21)] flex items-center justify-between text-xs gap-2 shrink-0">
        <div className="flex items-center gap-2">
          {/* Main Tabs: Biểu đồ | Thông tin */}
          <div className="flex items-center bg-[var(--panel-2,#141416)] rounded-lg p-0.5 border border-[var(--line,#1d1e21)]">
            <button
              onClick={() => setActiveTab('chart')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'chart'
                  ? 'bg-[var(--text,#f4f4f5)] text-[var(--bg,#000000)]'
                  : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
              }`}
            >
              Biểu đồ
            </button>
            <button
              onClick={() => setActiveTab('info')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'info'
                  ? 'bg-[var(--text,#f4f4f5)] text-[var(--bg,#000000)]'
                  : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
              }`}
            >
              Thông tin coin
            </button>
          </div>

          {activeTab === 'chart' && (
            <>
              {/* Interval Buttons */}
              <div className="hidden sm:flex items-center gap-1 font-mono text-[11px] border-l border-[var(--line,#1d1e21)] pl-2">
                {INTERVALS.map((inv) => (
                  <button
                    key={inv}
                    onClick={() => setIntervalState(inv)}
                    className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                      interval === inv
                        ? 'text-[var(--accent,#818cf8)] font-bold bg-[var(--panel-2,#141416)]'
                        : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
                    }`}
                  >
                    {inv}
                  </button>
                ))}
              </div>

              {/* Chart Type Toggle */}
              <div className="hidden md:flex items-center gap-1 border-l border-[var(--line,#1d1e21)] pl-2">
                <button
                  onClick={() => setChartType('candles')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    chartType === 'candles'
                      ? 'text-[var(--accent,#818cf8)] font-semibold'
                      : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
                  }`}
                >
                  Nến
                </button>
                <button
                  onClick={() => setChartType('line')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    chartType === 'line'
                      ? 'text-[var(--accent,#818cf8)] font-semibold'
                      : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
                  }`}
                >
                  Đường
                </button>
                <button
                  onClick={() => setChartType('area')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    chartType === 'area'
                      ? 'text-[var(--accent,#818cf8)] font-semibold'
                      : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
                  }`}
                >
                  Vùng
                </button>
              </div>

              {/* Indicators toggle */}
              <div className="hidden lg:flex items-center gap-1 border-l border-[var(--line,#1d1e21)] pl-2 text-[11px]">
                <button
                  onClick={() => setShowIndicators((p) => ({ ...p, ma: !p.ma }))}
                  className={`px-1.5 py-0.5 rounded cursor-pointer ${
                    showIndicators.ma ? 'text-yellow-400 font-semibold' : 'text-[var(--text-3,#63636b)]'
                  }`}
                >
                  MA
                </button>
                <button
                  onClick={() => setShowIndicators((p) => ({ ...p, vol: !p.vol }))}
                  className={`px-1.5 py-0.5 rounded cursor-pointer ${
                    showIndicators.vol ? 'text-[var(--accent,#818cf8)] font-semibold' : 'text-[var(--text-3,#63636b)]'
                  }`}
                >
                  VOL
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right side countdown timer & tradingview badge */}
        <div className="flex items-center gap-2">
          {countdown && activeTab === 'chart' && (
            <span className="font-mono text-[11px] text-[var(--text-2,#a1a1aa)] bg-[var(--panel-2,#141416)] px-2 py-0.5 rounded border border-[var(--line,#1d1e21)]">
              Đóng nến: <strong className="text-[var(--text,#f4f4f5)]">{countdown}</strong>
            </span>
          )}
          <span className="text-[10px] text-[var(--text-3,#63636b)] hidden sm:inline">
            TradingView Charts
          </span>
        </div>
      </div>

      {/* Main Body */}
      {activeTab === 'chart' ? (
        <div className="relative flex-1 w-full overflow-hidden">
          {/* OHLC & Indicator Legend Bar */}
          {legendData && (
            <div className="absolute top-2 left-3 z-10 flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums text-[var(--text-2,#a1a1aa)] pointer-events-none bg-[var(--bg,#000000)]/70 px-2 py-1 rounded backdrop-blur-sm border border-[var(--line,#1d1e21)]/60">
              <span>O: <strong className="text-[var(--text,#f4f4f5)]">{formatDecimal(legendData.open.toString())}</strong></span>
              <span>H: <strong className="text-[var(--text,#f4f4f5)]">{formatDecimal(legendData.high.toString())}</strong></span>
              <span>L: <strong className="text-[var(--text,#f4f4f5)]">{formatDecimal(legendData.low.toString())}</strong></span>
              <span>C: <strong className={legendData.change >= 0 ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}>{formatDecimal(legendData.close.toString())}</strong></span>
              <span className={legendData.change >= 0 ? 'text-[var(--up,#1fc27a)]' : 'text-[var(--down,#f2475f)]'}>
                {legendData.change >= 0 ? `+${legendData.change.toFixed(2)}%` : `${legendData.change.toFixed(2)}%`}
              </span>
              {showIndicators.ma && (
                <span className="hidden xl:inline text-[10px] text-yellow-400">MA(5,10,20)</span>
              )}
            </div>
          )}

          {/* Lightweight chart canvas container */}
          {loading ? (
            <div className="h-full flex flex-col justify-center items-center gap-2">
              <Skeleton width="60%" height="24px" />
              <Skeleton width="90%" height="70%" />
            </div>
          ) : (
            <div ref={chartContainerRef} className="w-full h-full" />
          )}
        </div>
      ) : (
        /* Coin Information & Rules Tab */
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] flex items-center justify-center font-bold text-sm text-[var(--accent,#818cf8)]">
              {activeSymbolInfo?.baseAsset.slice(0, 3)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-[var(--text,#f4f4f5)]">
                  {assetInfo?.name || activeSymbolInfo?.baseAsset}
                </h3>
                <span className="font-mono text-xs text-[var(--text-2,#a1a1aa)]">
                  {activeSymbolInfo?.baseAsset} / {activeSymbolInfo?.quoteAsset}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {assetInfo?.tags && assetInfo.tags.length > 0 ? (
                  assetInfo.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded text-[10px] bg-[var(--panel-2,#141416)] text-[var(--text-2,#a1a1aa)] border border-[var(--line,#1d1e21)]"
                    >
                      {ASSET_TAG_LABELS[tag]?.vi || tag}
                    </span>
                  ))
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] bg-[var(--panel-2,#141416)] text-[var(--text-3,#63636b)]">
                    Spot Token
                  </span>
                )}
              </div>
            </div>
          </div>

          {assetInfo?.description && (
            <div className="p-3 rounded-lg bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] leading-relaxed text-[var(--text-2,#a1a1aa)]">
              {assetInfo.description}
            </div>
          )}

          {/* Trading Rules Specifications */}
          <div>
            <h4 className="font-semibold text-[var(--text,#f4f4f5)] mb-2">Quy chuẩn giao dịch</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
              <div className="p-2.5 rounded bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)]">
                <span className="text-[var(--text-3,#63636b)] block text-[10px]">Bước giá (Tick Size)</span>
                <span className="text-[var(--text,#f4f4f5)] font-bold">{activeSymbolInfo?.tickSize || '—'}</span>
              </div>
              <div className="p-2.5 rounded bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)]">
                <span className="text-[var(--text-3,#63636b)] block text-[10px]">Bước khối lượng (Step)</span>
                <span className="text-[var(--text,#f4f4f5)] font-bold">{activeSymbolInfo?.stepSize || '—'}</span>
              </div>
              <div className="p-2.5 rounded bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)]">
                <span className="text-[var(--text-3,#63636b)] block text-[10px]">Giá trị lệnh tối thiểu</span>
                <span className="text-[var(--text,#f4f4f5)] font-bold">{activeSymbolInfo?.minNotional || '—'} USDT</span>
              </div>
              <div className="p-2.5 rounded bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)]">
                <span className="text-[var(--text-3,#63636b)] block text-[10px]">Phí giao dịch Spot</span>
                <span className="text-[var(--up,#1fc27a)] font-bold">0,10% (Taker / Maker)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
