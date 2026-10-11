import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import { formatDecimal } from '@cex/ui';
import {
  Maximize2,
  Minimize2,
  Clock,
  BarChart2,
  Activity,
  TrendingUp,
  TrendingDown,
  Info,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

export interface CandlestickChartProps {
  symbol: string;
  marketType?: 'spot' | 'futures';
  futuresPosition?: FuturesPosition | null;
}

const INTERVALS: CandleInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

type ChartType = 'candles' | 'line' | 'area';

interface FormattedCandle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const setupMainSeries = (
  chart: IChartApi,
  type: ChartType,
  tickSize: string
): ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'> => {
  const precision = tickSize.includes('.') ? tickSize.split('.')[1]?.length ?? 2 : 2;
  const minMove = parseFloat(tickSize) || 0.01;

  if (type === 'candles') {
    return chart.addSeries(CandlestickSeries, {
      upColor: '#00c087',
      downColor: '#f6465d',
      borderUpColor: '#00c087',
      borderDownColor: '#f6465d',
      wickUpColor: '#00c087',
      wickDownColor: '#f6465d',
      priceFormat: {
        type: 'price',
        precision,
        minMove,
      },
    });
  } else if (type === 'line') {
    return chart.addSeries(LineSeries, {
      color: '#818cf8',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      priceFormat: {
        type: 'price',
        precision,
        minMove,
      },
    });
  } else {
    return chart.addSeries(AreaSeries, {
      topColor: 'rgba(129, 140, 248, 0.35)',
      bottomColor: 'rgba(129, 140, 248, 0.0)',
      lineColor: '#818cf8',
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision,
        minMove,
      },
    });
  }
};

const setupVolumeSeries = (chart: IChartApi): ISeriesApi<'Histogram'> => {
  const volSeries = chart.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: '', // Overlay scale ID
  });
  volSeries.priceScale().applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 },
  });
  return volSeries;
};

const setupMASeries = (chart: IChartApi) => {
  const ma5 = chart.addSeries(LineSeries, {
    color: '#f59e0b',
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  });
  const ma10 = chart.addSeries(LineSeries, {
    color: '#06b6d4',
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  });
  const ma20 = chart.addSeries(LineSeries, {
    color: '#a855f7',
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  });
  return { ma5, ma10, ma20 };
};

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
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const prevPriceRef = useRef<number | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [legendData, setLegendData] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    change: number;
    amplitude: number;
    volume: number;
  } | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ma5SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ma10SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ma20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const orderPriceLinesRef = useRef<IPriceLine[]>([]);
  const lastCandleRef = useRef<FormattedCandle | null>(null);
  const candlesListRef = useRef<FormattedCandle[]>([]);
  const needsFitContentRef = useRef<boolean>(true);
  const lastLegendUpdateRef = useRef<number>(0);

  const api = getApiClient();
  const { activeSymbolInfo, activeTicker, exchangeInfo, realtimeClient, connectionStatus } = useMarket();
  const { isAuthenticated } = useAuth();
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [avgCost, setAvgCost] = useState<string | null>(null);

  // Load default interval from user preferences
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

  // Fetch open orders and position avgCost for price lines
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

  // Fetch historical candles from server
  useEffect(() => {
    let active = true;
    async function fetchCandles() {
      setLoading(true);
      setFetchError(null);
      needsFitContentRef.current = true;

      try {
        const res = marketType === 'futures'
          ? await api.futuresCandles({
              params: { symbol },
              query: { interval, limit: 180 },
            })
          : await api.candles({
              params: { symbol },
              query: { interval, limit: 180 },
            });
        if (active) {
          setCandles(res.items);
        }
      } catch {
        if (active) {
          setCandles([]);
          setFetchError('Không thể kết nối lấy dữ liệu nến. Vui lòng thử lại.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchCandles();
    return () => {
      active = false;
    };
  }, [api, symbol, interval, marketType, retryTrigger]);

  // Format, sort ascending, and deduplicate candles
  const formattedCandles = useMemo<FormattedCandle[]>(() => {
    if (!candles || candles.length === 0) return [];

    const raw = candles
      .map((c) => {
        const timeMs = typeof c.openTime === 'number' ? c.openTime : new Date(c.openTime).getTime();
        const time = Math.floor(timeMs / 1000) as UTCTimestamp;
        const open = parseFloat(c.open);
        const close = parseFloat(c.close);
        const rawHigh = parseFloat(c.high);
        const rawLow = parseFloat(c.low);
        const high = Math.max(isNaN(rawHigh) ? open : rawHigh, open, close);
        const low = Math.min(isNaN(rawLow) ? close : rawLow, open, close);
        const volume = parseFloat(c.volume || '0');
        return { time, open, high, low, close, volume };
      })
      .filter((d) => !isNaN(d.time) && !isNaN(d.open) && !isNaN(d.close) && d.time > 0);

    // Strictly sort ascending by timestamp
    raw.sort((a, b) => a.time - b.time);

    // Deduplicate matching timestamps (keeping the latest occurrence)
    const result: FormattedCandle[] = [];
    for (const item of raw) {
      if (result.length > 0 && result[result.length - 1]!.time === item.time) {
        result[result.length - 1] = item;
      } else {
        result.push(item);
      }
    }

    candlesListRef.current = result;
    if (result.length > 0) {
      lastCandleRef.current = result[result.length - 1]!;
    }
    return result;
  }, [candles]);

  // Moving Average helper
  const calcMA = useCallback((data: FormattedCandle[], period: number) => {
    const maData: { time: UTCTimestamp; value: number }[] = [];
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        const pt = data[i - j];
        if (pt) sum += pt.close;
      }
      const cur = data[i];
      if (cur) {
        maData.push({ time: cur.time, value: sum / period });
      }
    }
    return maData;
  }, []);

  // Countdown timer for current candle close
  useEffect(() => {
    if (formattedCandles.length === 0) return;
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
      const last = lastCandleRef.current || formattedCandles[formattedCandles.length - 1];
      if (!last) return;
      const openSec = last.time as number;
      const closeSec = openSec + intervalSec;
      const nowSec = Math.floor(Date.now() / 1000);
      const diff = Math.max(0, closeSec - nowSec);
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      setCountdown(`${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [formattedCandles, interval]);

  // 1. Core Chart Lifecycle: Create Chart ONCE on mount / tab change
  useEffect(() => {
    if (activeTab !== 'chart' || !chartContainerRef.current) return;

    const container = chartContainerRef.current;

    // Cleanup old chart instance if existing
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch {}
      chartRef.current = null;
      mainSeriesRef.current = null;
      volumeSeriesRef.current = null;
      ma5SeriesRef.current = null;
      ma10SeriesRef.current = null;
      ma20SeriesRef.current = null;
      orderPriceLinesRef.current = [];
    }

    // Determine initial dimensions with positive fallback
    const rect = container.getBoundingClientRect();
    const initialWidth = rect.width > 0 ? rect.width : container.clientWidth || 600;
    const initialHeight = rect.height > 0 ? rect.height : container.clientHeight || 400;

    const chart = createChart(container, {
      width: Math.round(initialWidth),
      height: Math.round(initialHeight),
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#a1a1aa',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(129, 140, 248, 0.45)',
          width: 1,
          style: 3,
        },
        horzLine: {
          color: 'rgba(129, 140, 248, 0.45)',
          width: 1,
          style: 3,
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        scaleMargins: { top: 0.1, bottom: 0.22 },
        autoScale: true,
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        locale: 'vi-VN',
        dateFormat: 'dd/MM/yyyy',
      },
      autoSize: true,
    });
    chartRef.current = chart;

    // Create Main Series
    const tick = activeSymbolInfo?.tickSize || '0.01';
    const mainSeries = setupMainSeries(chart, chartType, tick);
    mainSeriesRef.current = mainSeries;

    // Create Volume Series
    if (showIndicators.vol) {
      volumeSeriesRef.current = setupVolumeSeries(chart);
    }

    // Create MA Series
    if (showIndicators.ma) {
      const mas = setupMASeries(chart);
      ma5SeriesRef.current = mas.ma5;
      ma10SeriesRef.current = mas.ma10;
      ma20SeriesRef.current = mas.ma20;
    }

    // Populate data if candles are already available
    if (candlesListRef.current.length > 0) {
      const currentCandles = candlesListRef.current;
      if (chartType === 'candles') {
        (mainSeries as ISeriesApi<'Candlestick'>).setData(currentCandles);
      } else {
        mainSeries.setData(currentCandles.map((d) => ({ time: d.time, value: d.close })));
      }

      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.setData(
          currentCandles.map((d) => ({
            time: d.time,
            value: d.volume,
            color: d.close >= d.open ? 'rgba(0, 192, 135, 0.35)' : 'rgba(246, 70, 93, 0.35)',
          }))
        );
      }

      if (showIndicators.ma) {
        ma5SeriesRef.current?.setData(calcMA(currentCandles, 5));
        ma10SeriesRef.current?.setData(calcMA(currentCandles, 10));
        ma20SeriesRef.current?.setData(calcMA(currentCandles, 20));
      }

      chart.timeScale().fitContent();
    }

    // Crosshair move listener for Pro HUD Legend
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData || !mainSeriesRef.current) return;
      const data = param.seriesData.get(mainSeriesRef.current) as {
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

    // ResizeObserver fallback to guarantee accurate canvas size
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !chartRef.current) return;
      const { width: w, height: h } = entry.contentRect;
      if (w > 0 && h > 0) {
        chartRef.current.resize(Math.round(w), Math.round(h));
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch {}
        chartRef.current = null;
        mainSeriesRef.current = null;
        volumeSeriesRef.current = null;
        ma5SeriesRef.current = null;
        ma10SeriesRef.current = null;
        ma20SeriesRef.current = null;
        orderPriceLinesRef.current = [];
      }
    };
  }, [activeTab]);

  // 2. Change Chart Type in place (Candles <-> Line <-> Area) without destroying canvas
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || activeTab !== 'chart') return;

    if (mainSeriesRef.current) {
      try {
        chart.removeSeries(mainSeriesRef.current);
      } catch {}
      mainSeriesRef.current = null;
      orderPriceLinesRef.current = [];
    }

    const tick = activeSymbolInfo?.tickSize || '0.01';
    const newSeries = setupMainSeries(chart, chartType, tick);
    mainSeriesRef.current = newSeries;

    const curCandles = candlesListRef.current;
    if (curCandles.length > 0) {
      if (chartType === 'candles') {
        (newSeries as ISeriesApi<'Candlestick'>).setData(curCandles);
      } else {
        newSeries.setData(curCandles.map((d) => ({ time: d.time, value: d.close })));
      }
    }
  }, [chartType, activeTab, activeSymbolInfo]);

  // 3. Toggle Volume Series in place
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || activeTab !== 'chart') return;

    if (showIndicators.vol) {
      if (!volumeSeriesRef.current) {
        const s = setupVolumeSeries(chart);
        volumeSeriesRef.current = s;
        const curCandles = candlesListRef.current;
        if (curCandles.length > 0) {
          s.setData(
            curCandles.map((d) => ({
              time: d.time,
              value: d.volume,
              color: d.close >= d.open ? 'rgba(0, 192, 135, 0.35)' : 'rgba(246, 70, 93, 0.35)',
            }))
          );
        }
      }
    } else {
      if (volumeSeriesRef.current) {
        try {
          chart.removeSeries(volumeSeriesRef.current);
        } catch {}
        volumeSeriesRef.current = null;
      }
    }
  }, [showIndicators.vol, activeTab]);

  // 4. Toggle MA Series in place
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || activeTab !== 'chart') return;

    if (showIndicators.ma) {
      if (!ma5SeriesRef.current) {
        const mas = setupMASeries(chart);
        ma5SeriesRef.current = mas.ma5;
        ma10SeriesRef.current = mas.ma10;
        ma20SeriesRef.current = mas.ma20;
        const curCandles = candlesListRef.current;
        if (curCandles.length > 0) {
          mas.ma5.setData(calcMA(curCandles, 5));
          mas.ma10.setData(calcMA(curCandles, 10));
          mas.ma20.setData(calcMA(curCandles, 20));
        }
      }
    } else {
      if (ma5SeriesRef.current) {
        try {
          if (ma5SeriesRef.current) chart.removeSeries(ma5SeriesRef.current);
          if (ma10SeriesRef.current) chart.removeSeries(ma10SeriesRef.current);
          if (ma20SeriesRef.current) chart.removeSeries(ma20SeriesRef.current);
        } catch {}
        ma5SeriesRef.current = null;
        ma10SeriesRef.current = null;
        ma20SeriesRef.current = null;
      }
    }
  }, [showIndicators.ma, activeTab, calcMA]);

  // 5. Sync historical candles data to series
  useEffect(() => {
    if (!mainSeriesRef.current || formattedCandles.length === 0) return;

    if (chartType === 'candles') {
      (mainSeriesRef.current as ISeriesApi<'Candlestick'>).setData(formattedCandles);
    } else {
      mainSeriesRef.current.setData(formattedCandles.map((d) => ({ time: d.time, value: d.close })));
    }

    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.setData(
        formattedCandles.map((d) => ({
          time: d.time,
          value: d.volume,
          color: d.close >= d.open ? 'rgba(0, 192, 135, 0.35)' : 'rgba(246, 70, 93, 0.35)',
        }))
      );
    }

    if (showIndicators.ma) {
      ma5SeriesRef.current?.setData(calcMA(formattedCandles, 5));
      ma10SeriesRef.current?.setData(calcMA(formattedCandles, 10));
      ma20SeriesRef.current?.setData(calcMA(formattedCandles, 20));
    }

    const last = formattedCandles[formattedCandles.length - 1];
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

    // Only fit content on initial data arrival, NOT on realtime ticks!
    if (needsFitContentRef.current) {
      chartRef.current?.timeScale().fitContent();
      needsFitContentRef.current = false;
    }
  }, [formattedCandles, chartType, showIndicators, calcMA]);

  // 6. Update order and position price lines without destroying chart
  useEffect(() => {
    if (!mainSeriesRef.current) return;
    const series = mainSeriesRef.current;

    orderPriceLinesRef.current.forEach((line) => {
      try {
        series.removePriceLine(line);
      } catch {}
    });
    orderPriceLinesRef.current = [];

    const tick = activeSymbolInfo?.tickSize || '0.01';
    const priceDecimals = tick.includes('.') ? (tick.split('.')[1]?.length ?? 2) : 2;

    // Spot Avg Cost line
    if (marketType === 'spot' && avgCost) {
      const costLine = series.createPriceLine({
        price: parseFloat(avgCost),
        color: '#f59e0b',
        lineWidth: 1,
        lineStyle: 1, // Dotted
        axisLabelVisible: true,
        title: `Giá vốn ${formatDecimal(avgCost, { decimals: priceDecimals })}`,
      });
      orderPriceLinesRef.current.push(costLine);
    }

    // Futures Position lines
    if (marketType === 'futures' && futuresPosition) {
      if (futuresPosition.entryPrice) {
        const entryLine = series.createPriceLine({
          price: parseFloat(futuresPosition.entryPrice),
          color: '#ffffff',
          lineWidth: 1,
          lineStyle: 0,
          axisLabelVisible: true,
          title: `Giá vào ${formatDecimal(futuresPosition.entryPrice, { decimals: priceDecimals })}`,
        });
        orderPriceLinesRef.current.push(entryLine);
      }
      if (futuresPosition.liquidationPrice) {
        const liqLine = series.createPriceLine({
          price: parseFloat(futuresPosition.liquidationPrice),
          color: '#f6465d',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `Thanh lý ${formatDecimal(futuresPosition.liquidationPrice, { decimals: priceDecimals })}`,
        });
        orderPriceLinesRef.current.push(liqLine);
      }
      if (futuresPosition.takeProfitPrice) {
        const tpLine = series.createPriceLine({
          price: parseFloat(futuresPosition.takeProfitPrice),
          color: '#00c087',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `TP ${formatDecimal(futuresPosition.takeProfitPrice, { decimals: priceDecimals })}`,
        });
        orderPriceLinesRef.current.push(tpLine);
      }
      if (futuresPosition.stopLossPrice) {
        const slLine = series.createPriceLine({
          price: parseFloat(futuresPosition.stopLossPrice),
          color: '#f6465d',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `SL ${formatDecimal(futuresPosition.stopLossPrice, { decimals: priceDecimals })}`,
        });
        orderPriceLinesRef.current.push(slLine);
      }
    }

    // Open User Orders lines
    if (openOrders.length > 0) {
      openOrders.forEach((ord) => {
        if (ord.price) {
          const line = series.createPriceLine({
            price: parseFloat(ord.price),
            color: ord.side === 'BUY' ? '#00c087' : '#f6465d',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `${ord.side === 'BUY' ? 'Mua' : 'Bán'} ${ord.quantity || ''}`,
          });
          orderPriceLinesRef.current.push(line);
        }
      });
    }
  }, [openOrders, avgCost, futuresPosition, marketType, activeSymbolInfo]);

  // 7. Realtime WebSocket Candle Updates Listener
  useEffect(() => {
    if (!realtimeClient) return;

    const channel = marketType === 'futures' ? `futures:candles:${symbol}:${interval}` : `candles:${symbol}:${interval}`;
    const unsub = realtimeClient.subscribe(channel, (event: unknown) => {
      const c = ((event && typeof event === 'object' && 'candle' in event ? (event as any).candle : event) as Candle);
      if (!c || (!c.openTime && !c.open)) return;

      const timeMs = typeof c.openTime === 'number' ? c.openTime : new Date(c.openTime).getTime();
      const candleTime = Math.floor(timeMs / 1000) as UTCTimestamp;
      if (isNaN(candleTime) || candleTime <= 0) return;

      // Drop out-of-order packets older than current forming candle
      if (lastCandleRef.current && candleTime < lastCandleRef.current.time) return;

      const o = parseFloat(c.open);
      const cl = parseFloat(c.close);
      const rawH = parseFloat(c.high);
      const rawL = parseFloat(c.low);
      const h = Math.max(isNaN(rawH) ? o : rawH, o, cl);
      const l = Math.min(isNaN(rawL) ? cl : rawL, o, cl);
      const vol = parseFloat(c.volume || '0');

      const updatedCandle: FormattedCandle = {
        time: candleTime,
        open: o,
        high: h,
        low: l,
        close: cl,
        volume: vol,
      };

      lastCandleRef.current = updatedCandle;

      // Update series in place
      if (chartType === 'candles' && mainSeriesRef.current) {
        (mainSeriesRef.current as ISeriesApi<'Candlestick'>).update(updatedCandle);
      } else if (mainSeriesRef.current) {
        mainSeriesRef.current.update({ time: candleTime, value: cl });
      }

      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.update({
          time: candleTime,
          value: vol,
          color: cl >= o ? 'rgba(0, 192, 135, 0.45)' : 'rgba(246, 70, 93, 0.45)',
        });
      }

      // Throttle HUD update
      const now = Date.now();
      if (now - lastLegendUpdateRef.current > 150) {
        lastLegendUpdateRef.current = now;
        const chgPct = ((cl - o) / (o || 1)) * 100;
        setLegendData({
          open: o,
          high: h,
          low: l,
          close: cl,
          change: chgPct,
          amplitude: ((h - l) / (l || 1)) * 100,
          volume: vol,
        });
      }
    });

    return () => unsub();
  }, [realtimeClient, symbol, interval, marketType, chartType]);

  // 8. Live Price Tick Synchronization & Flash Effect
  useEffect(() => {
    if (!activeTicker || activeTicker.symbol !== symbol || !activeTicker.lastPrice || !lastCandleRef.current) return;

    const lastPrice = parseFloat(activeTicker.lastPrice);
    if (isNaN(lastPrice) || lastPrice <= 0) return;

    // Trigger subtle price flash
    if (prevPriceRef.current !== null && prevPriceRef.current !== lastPrice) {
      const flash = lastPrice > prevPriceRef.current ? 'up' : 'down';
      setPriceFlash(flash);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => {
        setPriceFlash(null);
      }, 400);
    }
    prevPriceRef.current = lastPrice;

    // Update forming candle
    const cur = lastCandleRef.current;
    const updated: FormattedCandle = {
      ...cur,
      close: lastPrice,
      high: Math.max(cur.high, lastPrice),
      low: Math.min(cur.low, lastPrice),
    };
    lastCandleRef.current = updated;

    if (chartType === 'candles' && mainSeriesRef.current) {
      (mainSeriesRef.current as ISeriesApi<'Candlestick'>).update(updated);
    } else if (mainSeriesRef.current) {
      mainSeriesRef.current.update({ time: updated.time, value: lastPrice });
    }

    // Throttle HUD update
    const now = Date.now();
    if (now - lastLegendUpdateRef.current > 150) {
      lastLegendUpdateRef.current = now;
      const chgPct = ((updated.close - updated.open) / (updated.open || 1)) * 100;
      setLegendData((prev) => ({
        open: updated.open,
        high: updated.high,
        low: updated.low,
        close: updated.close,
        change: chgPct,
        amplitude: ((updated.high - updated.low) / (updated.low || 1)) * 100,
        volume: prev?.volume || 0,
      }));
    }
  }, [activeTicker, symbol, chartType]);

  // Handle Fullscreen resize trigger
  useEffect(() => {
    if (!chartRef.current || !chartContainerRef.current) return;
    const timer = setTimeout(() => {
      const container = chartContainerRef.current;
      if (container) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w > 0 && h > 0) {
          chartRef.current?.resize(w, h);
          chartRef.current?.timeScale().fitContent();
        }
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  const currentPrice = legendData?.close ?? (activeTicker && activeTicker.lastPrice ? parseFloat(activeTicker.lastPrice) : null);
  const isPositiveChange = (legendData?.change ?? 0) >= 0;

  return (
    <div
      className={`flex flex-col bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-[var(--radius-lg,12px)] overflow-hidden select-none transition-all duration-300 shadow-sm ${
        isFullscreen ? 'fixed inset-0 z-50 p-4 bg-[#0a0a0b]' : 'h-full min-h-[440px] flex-1'
      }`}
    >
      {/* Top Header / Pro Trader Toolbar */}
      <div className="px-3 py-2 border-b border-[var(--line,#1d1e21)] flex items-center justify-between text-xs gap-2 shrink-0 bg-[var(--panel-2,#141416)]/60 backdrop-blur-md overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 shrink-0">
          {/* Main Tabs: Biểu đồ | Thông tin */}
          <div className="flex items-center bg-[var(--panel,#0a0a0b)] rounded-lg p-0.5 border border-[var(--line,#1d1e21)] shadow-inner">
            <button
              onClick={() => setActiveTab('chart')}
              className={`px-2.5 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'chart'
                  ? 'bg-[var(--accent,#818cf8)] text-white shadow-sm'
                  : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
              }`}
            >
              <BarChart2 size={13} />
              Biểu đồ
            </button>
            <button
              onClick={() => setActiveTab('info')}
              className={`px-2.5 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'info'
                  ? 'bg-[var(--accent,#818cf8)] text-white shadow-sm'
                  : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
              }`}
            >
              <Info size={13} />
              Thông tin
            </button>
          </div>

          {activeTab === 'chart' && (
            <>
              {/* Interval Buttons */}
              <div className="flex items-center gap-0.5 sm:gap-1 font-mono text-[11px] border-l border-[var(--line,#1d1e21)] pl-2">
                {INTERVALS.map((inv) => (
                  <button
                    key={inv}
                    onClick={() => setIntervalState(inv)}
                    className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md cursor-pointer transition-all duration-150 ${
                      interval === inv
                        ? 'bg-[var(--accent,#818cf8)]/15 text-[var(--accent,#818cf8)] font-bold border border-[var(--accent,#818cf8)]/30'
                        : 'text-[var(--text-2,#a1a1aa)] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {inv}
                  </button>
                ))}
              </div>

              {/* Chart Type Toggle */}
              <div className="hidden sm:flex items-center gap-1 border-l border-[var(--line,#1d1e21)] pl-2">
                <button
                  onClick={() => setChartType('candles')}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                    chartType === 'candles'
                      ? 'text-[var(--accent,#818cf8)] font-semibold bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)]'
                      : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
                  }`}
                >
                  Nến
                </button>
                <button
                  onClick={() => setChartType('line')}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                    chartType === 'line'
                      ? 'text-[var(--accent,#818cf8)] font-semibold bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)]'
                      : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
                  }`}
                >
                  Đường
                </button>
                <button
                  onClick={() => setChartType('area')}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                    chartType === 'area'
                      ? 'text-[var(--accent,#818cf8)] font-semibold bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)]'
                      : 'text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
                  }`}
                >
                  Vùng
                </button>
              </div>

              {/* Indicators toggle */}
              <div className="hidden md:flex items-center gap-1.5 border-l border-[var(--line,#1d1e21)] pl-2 text-[11px]">
                <button
                  onClick={() => setShowIndicators((p) => ({ ...p, ma: !p.ma }))}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-all flex items-center gap-1 ${
                    showIndicators.ma
                      ? 'bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/30'
                      : 'text-[var(--text-3,#63636b)] hover:text-[var(--text-2,#a1a1aa)]'
                  }`}
                  title="Đường trung bình động MA (5, 10, 20)"
                >
                  <Activity size={12} />
                  MA
                </button>
                <button
                  onClick={() => setShowIndicators((p) => ({ ...p, vol: !p.vol }))}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-all ${
                    showIndicators.vol
                      ? 'bg-[var(--accent,#818cf8)]/10 text-[var(--accent,#818cf8)] font-semibold border border-[var(--accent,#818cf8)]/30'
                      : 'text-[var(--text-3,#63636b)] hover:text-[var(--text-2,#a1a1aa)]'
                  }`}
                  title="Cột khối lượng Volume"
                >
                  VOL
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right side toolbar items */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Connection / Feed Status & Simulation Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] text-[11px] font-mono">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connectionStatus === 'open' && activeTicker?.status !== 'STALE'
                  ? 'bg-[#00c087]'
                  : connectionStatus === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-[#f6465d]'
              }`}
            />
            <span className="text-[var(--text-3,#63636b)] text-[10px]">
              {connectionStatus === 'open' && activeTicker?.status !== 'STALE'
                ? 'LIVE'
                : connectionStatus === 'connecting'
                ? 'Đang kết nối...'
                : 'Stale'}
            </span>
            <span className="text-[var(--line,#1d1e21)]">|</span>
            <span className="text-[10px] text-[var(--accent,#818cf8)] font-sans" title="Sàn giao dịch mô phỏng dữ liệu Binance">
              Mô phỏng
            </span>
          </div>

          {/* Live Price with subtle flash */}
          {currentPrice !== null && (
            <div
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] font-mono text-xs transition-colors duration-300 motion-reduce:transition-none ${
                priceFlash === 'up'
                  ? 'bg-[#00c087]/20 border-[#00c087]/40 text-[#00c087]'
                  : priceFlash === 'down'
                  ? 'bg-[#f6465d]/20 border-[#f6465d]/40 text-[#f6465d]'
                  : ''
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isPositiveChange ? 'bg-[#00c087]' : 'bg-[#f6465d]'
                }`}
              />
              <span className={`font-bold ${isPositiveChange ? 'text-[#00c087]' : 'text-[#f6465d]'}`}>
                {formatDecimal((currentPrice ?? 0).toString())}
              </span>
            </div>
          )}

          {/* Candle countdown timer */}
          {countdown && activeTab === 'chart' && (
            <span className="hidden md:flex font-mono text-[11px] text-[var(--text-2,#a1a1aa)] bg-[var(--panel,#0a0a0b)] px-2 py-0.5 rounded-md border border-[var(--line,#1d1e21)] items-center gap-1 shadow-sm">
              <Clock size={12} className="text-[var(--accent,#818cf8)]" />
              <strong className="text-[var(--text,#f4f4f5)]">{countdown}</strong>
            </span>
          )}

          {/* Fullscreen Toggle Button */}
          <button
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="p-1 rounded-md text-[var(--text-3,#63636b)] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title={isFullscreen ? 'Thu nhỏ biểu đồ' : 'Phóng to toàn màn hình'}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>

      {/* Main Chart Body */}
      {activeTab === 'chart' ? (
        <div className="relative flex-1 w-full overflow-hidden min-h-[360px] h-full">
          {/* Pro HUD Legend Bar */}
          {legendData && !fetchError && (
            <div className="absolute top-2 left-2 sm:top-2.5 sm:left-3 z-10 flex flex-wrap items-center gap-2 sm:gap-3 font-mono text-[10px] sm:text-[11px] tabular-nums text-[var(--text-2,#a1a1aa)] pointer-events-none bg-[var(--bg,#000000)]/85 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg backdrop-blur-md border border-[var(--line,#1d1e21)]/80 shadow-md max-w-[calc(100%-1rem)]">
              <span className="text-white font-bold">{symbol}</span>
              <span>O: <strong className="text-[var(--text,#f4f4f5)]">{formatDecimal(legendData.open.toString())}</strong></span>
              <span>H: <strong className="text-[var(--text,#f4f4f5)]">{formatDecimal(legendData.high.toString())}</strong></span>
              <span>L: <strong className="text-[var(--text,#f4f4f5)]">{formatDecimal(legendData.low.toString())}</strong></span>
              <span>C: <strong className={legendData.change >= 0 ? 'text-[#00c087]' : 'text-[#f6465d]'}>{formatDecimal(legendData.close.toString())}</strong></span>
              <span className={`font-bold flex items-center gap-0.5 ${legendData.change >= 0 ? 'text-[#00c087]' : 'text-[#f6465d]'}`}>
                {legendData.change >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {legendData.change >= 0 ? `+${legendData.change.toFixed(2)}%` : `${legendData.change.toFixed(2)}%`}
              </span>
              <span className="hidden sm:inline">KL: <strong className="text-white">{formatDecimal(legendData.volume.toString(), { decimals: 2 })}</strong></span>
              {showIndicators.ma && (
                <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-white/10 text-[10px]">
                  <span className="text-[#f59e0b]">MA5</span>
                  <span className="text-[#06b6d4]">MA10</span>
                  <span className="text-[#a855f7]">MA20</span>
                </div>
              )}
            </div>
          )}

          {/* Canvas container: ALWAYS MOUNTED IN THE DOM! */}
          <div ref={chartContainerRef} className="w-full h-full" />

          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-[var(--panel,#0a0a0b)]/85 backdrop-blur-xs z-20 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-[var(--accent,#818cf8)] border-t-transparent rounded-full animate-spin" />
              <div className="flex flex-col items-center gap-1 font-mono text-xs">
                <span className="text-[var(--text,#f4f4f5)] font-semibold">Đang tải nến {symbol} ({interval})...</span>
                <span className="text-[10px] text-[var(--text-3,#63636b)]">Dữ liệu thị trường mô phỏng Binance</span>
              </div>
            </div>
          )}

          {/* Error Overlay */}
          {!loading && fetchError && (
            <div className="absolute inset-0 bg-[var(--panel,#0a0a0b)]/95 z-20 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertTriangle size={28} className="text-amber-400" />
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-[var(--text,#f4f4f5)]">Không thể tải dữ liệu nến</h4>
                <p className="text-xs text-[var(--text-3,#63636b)] max-w-sm">{fetchError}</p>
              </div>
              <button
                onClick={() => setRetryTrigger((p) => p + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent,#818cf8)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
              >
                <RotateCcw size={13} />
                Thử lại
              </button>
            </div>
          )}

          {/* Empty Overlay */}
          {!loading && !fetchError && formattedCandles.length === 0 && (
            <div className="absolute inset-0 bg-[var(--panel,#0a0a0b)]/90 z-20 flex flex-col items-center justify-center gap-2 p-6 text-center">
              <BarChart2 size={28} className="text-[var(--text-3,#63636b)]" />
              <span className="text-xs text-[var(--text-3,#63636b)] font-mono">
                Chưa có dữ liệu nến cho cặp {symbol} ({interval})
              </span>
            </div>
          )}
        </div>
      ) : (
        /* Coin Information & Trading Specifications Tab */
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--panel-2,#141416)] to-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] flex items-center justify-center font-bold text-base text-[var(--accent,#818cf8)] shadow-md">
              {activeSymbolInfo?.baseAsset.slice(0, 3)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-[var(--text,#f4f4f5)]">
                  {assetInfo?.name || activeSymbolInfo?.baseAsset}
                </h3>
                <span className="font-mono text-xs text-[var(--text-2,#a1a1aa)]">
                  {activeSymbolInfo?.baseAsset} / {activeSymbolInfo?.quoteAsset}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {assetInfo?.tags && assetInfo.tags.length > 0 ? (
                  assetInfo.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-0.5 rounded-full text-[10px] bg-[var(--accent,#818cf8)]/10 text-[var(--accent,#818cf8)] border border-[var(--accent,#818cf8)]/20 font-medium"
                    >
                      {ASSET_TAG_LABELS[tag]?.vi || tag}
                    </span>
                  ))
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-[var(--panel-2,#141416)] text-[var(--text-3,#63636b)] border border-[var(--line,#1d1e21)]">
                    Spot Token
                  </span>
                )}
              </div>
            </div>
          </div>

          {assetInfo?.description && (
            <div className="p-4 rounded-xl bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] leading-relaxed text-[var(--text-2,#a1a1aa)] shadow-sm">
              {assetInfo.description}
            </div>
          )}

          {/* Trading Rules Specifications */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-[var(--text,#f4f4f5)]">Quy chuẩn khớp lệnh & phí</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
              <div className="p-3 rounded-xl bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] space-y-1">
                <span className="text-[var(--text-3,#63636b)] block text-[10px]">Bước giá (Tick Size)</span>
                <span className="text-[var(--text,#f4f4f5)] font-bold">{activeSymbolInfo?.tickSize || '—'}</span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] space-y-1">
                <span className="text-[var(--text-3,#63636b)] block text-[10px]">Bước khối lượng (Step)</span>
                <span className="text-[var(--text,#f4f4f5)] font-bold">{activeSymbolInfo?.stepSize || '—'}</span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] space-y-1">
                <span className="text-[var(--text-3,#63636b)] block text-[10px]">Lệnh tối thiểu (Min Notional)</span>
                <span className="text-[var(--text,#f4f4f5)] font-bold">{activeSymbolInfo?.minNotional || '—'} USDT</span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] space-y-1">
                <span className="text-[var(--text-3,#63636b)] block text-[10px]">Phí giao dịch</span>
                <span className="text-[#00c087] font-bold">0,10% (Maker / Taker)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
