import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Candle, CandleInterval } from '@cex/contracts';
import { getApiClient } from '../../services/api.ts';
import { useMarket } from '../../context/MarketContext.tsx';
import { Skeleton, formatDecimal } from '@cex/ui';

export interface CandlestickChartProps {
  symbol: string;
}

const INTERVALS: CandleInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

export const CandlestickChart: React.FC<CandlestickChartProps> = ({ symbol }) => {
  const [interval, setIntervalState] = useState<CandleInterval>('15m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 350 });

  const api = getApiClient();
  const { realtimeClient } = useMarket();

  // Resize listener
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth || 600,
          height: Math.max(300, containerRef.current.clientHeight || 350),
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Fetch historical candles
  useEffect(() => {
    let active = true;
    async function fetchCandles() {
      setLoading(true);
      try {
        const res = await api.candles({
          params: { symbol },
          query: { interval, limit: 100 },
        });
        if (active) {
          setCandles(res.items);
        }
      } catch (err) {
        if (active) setCandles([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchCandles();
    return () => {
      active = false;
    };
  }, [api, symbol, interval]);

  // Realtime candle updates
  useEffect(() => {
    if (!realtimeClient) return;

    const unsub = realtimeClient.subscribe(
      `candles:${symbol}:${interval}`,
      (candleUpdate: Candle) => {
        setCandles((prev) => {
          if (prev.length === 0) return [candleUpdate];
          const last = prev[prev.length - 1]!;
          if (last.openTime === candleUpdate.openTime) {
            // Update current running candle
            return [...prev.slice(0, -1), candleUpdate];
          } else if (candleUpdate.openTime > last.openTime) {
            // New candle started
            return [...prev.slice(1), candleUpdate];
          }
          return prev;
        });
      }
    );

    return () => unsub();
  }, [realtimeClient, symbol, interval]);

  // Chart computation (strictly for visualization rendering coordinates)
  const { chartData, minPrice, maxPrice, priceRange } = useMemo(() => {
    if (candles.length === 0) {
      return { chartData: [], minPrice: 0, maxPrice: 1, priceRange: 1 };
    }

    let min = Infinity;
    let max = -Infinity;

    const data = candles.map((c) => {
      const o = parseFloat(c.open);
      const h = parseFloat(c.high);
      const l = parseFloat(c.low);
      const cl = parseFloat(c.close);
      if (h > max) max = h;
      if (l < min) min = l;
      return { ...c, oNum: o, hNum: h, lNum: l, cNum: cl };
    });

    // Add 1% padding to top and bottom
    const pad = (max - min) * 0.05 || 1;
    min -= pad;
    max += pad;

    return {
      chartData: data,
      minPrice: min,
      maxPrice: max,
      priceRange: max - min || 1,
    };
  }, [candles]);

  const activeCandle = hoveredCandle || (candles.length > 0 ? candles[candles.length - 1] : null);

  const paddingLeft = 10;
  const paddingRight = 65;
  const paddingTop = 25;
  const paddingBottom = 25;

  const plotWidth = Math.max(10, dimensions.width - paddingLeft - paddingRight);
  const plotHeight = Math.max(10, dimensions.height - paddingTop - paddingBottom);

  const candleWidth = chartData.length > 0 ? Math.max(2, plotWidth / chartData.length * 0.7) : 4;
  const candleGap = chartData.length > 0 ? plotWidth / chartData.length : 6;

  const getY = (priceNum: number) => {
    return paddingTop + plotHeight - ((priceNum - minPrice) / priceRange) * plotHeight;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[360px] sm:h-[400px] flex flex-col bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-subtle,#1e212b)] rounded-[var(--radius-lg,12px)] overflow-hidden"
    >
      {/* Top Header: Interval switcher + Candlestick summary bar */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle,#1e212b)] text-xs z-10 bg-[var(--color-bg-surface,#111319)]">
        {/* Intervals */}
        <div className="flex items-center gap-1">
          {INTERVALS.map((intv) => (
            <button
              key={intv}
              onClick={() => setIntervalState(intv)}
              className={`px-2 py-0.5 rounded-[var(--radius-sm,4px)] text-[11px] font-medium transition-colors cursor-pointer ${
                interval === intv
                  ? 'bg-[var(--color-accent-primary,#818cf8)] text-white'
                  : 'text-[var(--color-text-secondary,#9ca3af)] hover:text-white hover:bg-[var(--color-bg-elevated,#1b1e27)]'
              }`}
            >
              {intv}
            </button>
          ))}
        </div>

        {/* OHLC Bar */}
        {activeCandle && (
          <div className="flex items-center gap-2 text-[10px] sm:text-[11px] tabular-nums font-mono text-[var(--color-text-secondary,#9ca3af)]">
            <span>
              O: <span className="text-[var(--color-text-primary,#f3f4f6)]">{formatDecimal(activeCandle.open, { decimals: 2 })}</span>
            </span>
            <span>
              H: <span className="text-[var(--color-text-primary,#f3f4f6)]">{formatDecimal(activeCandle.high, { decimals: 2 })}</span>
            </span>
            <span>
              L: <span className="text-[var(--color-text-primary,#f3f4f6)]">{formatDecimal(activeCandle.low, { decimals: 2 })}</span>
            </span>
            <span>
              C: <span className={parseFloat(activeCandle.close) >= parseFloat(activeCandle.open) ? 'text-[var(--color-buy,#22c55e)]' : 'text-[var(--color-sell,#f87171)]'}>
                {formatDecimal(activeCandle.close, { decimals: 2 })}
              </span>
            </span>
            <span className="hidden sm:inline">
              V: <span className="text-[var(--color-text-primary,#f3f4f6)]">{formatDecimal(activeCandle.volume, { decimals: 2 })}</span>
            </span>
          </div>
        )}
      </div>

      {/* Main Chart Canvas / SVG */}
      <div className="relative flex-1 w-full overflow-hidden">
        {loading && candles.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <Skeleton className="w-full h-full rounded-[var(--radius-md,8px)]" />
          </div>
        ) : candles.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--color-text-muted,#6b7280)]">
            Chưa có dữ liệu nến cho khung thời gian này
          </div>
        ) : (
          <svg
            width={dimensions.width}
            height={dimensions.height - 40}
            className="w-full h-full select-none"
            onMouseLeave={() => setHoveredCandle(null)}
          >
            {/* Price axis horizontal gridlines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
              const y = paddingTop + plotHeight * pct;
              const priceVal = maxPrice - pct * priceRange;
              return (
                <g key={idx}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={dimensions.width - paddingRight}
                    y2={y}
                    stroke="var(--color-border-subtle, #1e212b)"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text
                    x={dimensions.width - paddingRight + 6}
                    y={y + 3}
                    fill="var(--color-text-muted, #6b7280)"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {formatDecimal(priceVal.toString(), { decimals: 2 })}
                  </text>
                </g>
              );
            })}

            {/* Candlesticks */}
            {chartData.map((d, i) => {
              const x = paddingLeft + i * candleGap + candleGap / 2;
              const yOpen = getY(d.oNum);
              const yClose = getY(d.cNum);
              const yHigh = getY(d.hNum);
              const yLow = getY(d.lNum);

              const isUp = d.cNum >= d.oNum;
              const color = isUp ? 'var(--color-buy, #22c55e)' : 'var(--color-sell, #f87171)';

              const bodyTop = Math.min(yOpen, yClose);
              const bodyHeight = Math.max(1.5, Math.abs(yClose - yOpen));

              return (
                <g
                  key={d.openTime}
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoveredCandle(d)}
                >
                  {/* Wick (High-Low line) */}
                  <line
                    x1={x}
                    y1={yHigh}
                    x2={x}
                    y2={yLow}
                    stroke={color}
                    strokeWidth="1.2"
                  />
                  {/* Candle Body */}
                  <rect
                    x={x - candleWidth / 2}
                    y={bodyTop}
                    width={candleWidth}
                    height={bodyHeight}
                    fill={color}
                    rx="1"
                  />
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
};
