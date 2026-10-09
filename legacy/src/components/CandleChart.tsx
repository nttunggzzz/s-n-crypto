import React, { useMemo, useState } from 'react';
import { Candle, RiskRewardMetrics, SMCAnalysis } from '../types/crypto';

interface CandleChartProps {
  candles: Candle[];
  symbol: string;
  currentPrice: number;
  risk?: RiskRewardMetrics;
  smc?: SMCAnalysis;
  height?: number;
}

export const CandleChart: React.FC<CandleChartProps> = ({
  candles,
  symbol,
  currentPrice,
  risk,
  smc,
  height = 360
}) => {
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);

  const { minPrice, maxPrice, priceRange, width, padding } = useMemo(() => {
    if (!candles || candles.length === 0) {
      return { minPrice: 0, maxPrice: 100, priceRange: 100, width: 800, padding: { top: 20, bottom: 30, left: 10, right: 70 } };
    }

    let min = Math.min(...candles.map(c => c.low));
    let max = Math.max(...candles.map(c => c.high));

    if (risk) {
      min = Math.min(min, risk.stopLossPrice * 0.99);
      max = Math.max(max, risk.takeProfit3 * 1.01);
    }

    const margin = (max - min) * 0.08 || 1;
    return {
      minPrice: min - margin,
      maxPrice: max + margin,
      priceRange: (max + margin) - (min - margin) || 1,
      width: 800,
      padding: { top: 25, bottom: 25, left: 10, right: 65 }
    };
  }, [candles, risk]);

  if (!candles || candles.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 font-mono text-sm">
        Loading chart candles for {symbol}...
      </div>
    );
  }

  const chartWidth = 800;
  const chartHeight = height;
  const usableWidth = chartWidth - padding.left - padding.right;
  const usableHeight = chartHeight - padding.top - padding.bottom;

  const getY = (price: number) => {
    return padding.top + usableHeight * (1 - (price - minPrice) / priceRange);
  };

  const candleStep = usableWidth / Math.max(1, candles.length);
  const candleWidth = Math.max(2, Math.min(12, candleStep * 0.7));

  // Generate Y-axis grid lines
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(frac => minPrice + frac * priceRange);

  return (
    <div className="relative w-full bg-slate-950/80 rounded-xl border border-slate-800/80 p-3 overflow-hidden select-none">
      {/* Chart Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800/60 font-mono text-xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-100 text-sm">{symbol}/USDT</span>
          <span className="text-cyan-400 font-semibold">${currentPrice.toFixed(currentPrice < 1 ? 5 : 2)}</span>
          {hoveredCandle ? (
            <span className="text-slate-400">
              O: <span className="text-slate-200">{hoveredCandle.open}</span> H: <span className="text-slate-200">{hoveredCandle.high}</span> L: <span className="text-slate-200">{hoveredCandle.low}</span> C: <span className="text-slate-200">{hoveredCandle.close}</span>
            </span>
          ) : (
            <span className="text-slate-500">4H Institutional Structure View</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded-sm bg-emerald-500/40 border border-emerald-400"></span> Demand OB</span>
          <span className="flex items-center gap-1 text-amber-400"><span className="w-2 h-2 rounded-sm bg-amber-500/30 border border-amber-400"></span> FVG</span>
          <span className="flex items-center gap-1 text-cyan-400"><span className="w-2.5 h-0.5 bg-cyan-400"></span> Entry</span>
          <span className="flex items-center gap-1 text-rose-400"><span className="w-2.5 h-0.5 bg-rose-500"></span> Stop Loss</span>
          <span className="flex items-center gap-1 text-emerald-400"><span className="w-2.5 h-0.5 bg-emerald-400"></span> TP Targets</span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full min-w-[620px] h-auto overflow-visible"
        >
          <defs>
            <linearGradient id="entryZoneGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="bullOBGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="fvgGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.04" />
            </linearGradient>
          </defs>

          {/* Grid Lines */}
          {yTicks.map((price, idx) => {
            const y = getY(price);
            return (
              <g key={idx}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={chartWidth - padding.right}
                  y2={y}
                  stroke="#1e293b"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={chartWidth - padding.right + 6}
                  y={y + 3}
                  fill="#64748b"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  ${price.toFixed(price < 1 ? 4 : 2)}
                </text>
              </g>
            );
          })}

          {/* SMC Active Order Blocks */}
          {smc?.activeOrderBlocks.map((ob, idx) => {
            if (ob.isBreached) return null;
            const topY = getY(ob.topPrice);
            const botY = getY(ob.bottomPrice);
            const rectHeight = Math.max(2, Math.abs(botY - topY));
            const y = Math.min(topY, botY);
            return (
              <g key={`ob-${idx}`}>
                <rect
                  x={padding.left + (candles.length * 0.45) * candleStep}
                  y={y}
                  width={usableWidth * 0.55}
                  height={rectHeight}
                  fill="url(#bullOBGrad)"
                  stroke="#10b981"
                  strokeWidth="1"
                  strokeDasharray="4 2"
                  rx="2"
                />
                <text
                  x={padding.left + (candles.length * 0.46) * candleStep}
                  y={y + 11}
                  fill="#34d399"
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="600"
                >
                  DEMAND ORDER BLOCK ({ob.volumeMultiplier}x Vol)
                </text>
              </g>
            );
          })}

          {/* SMC Active FVGs */}
          {smc?.activeFVGs.map((fvg, idx) => {
            if (fvg.isMitigated) return null;
            const topY = getY(fvg.topPrice);
            const botY = getY(fvg.bottomPrice);
            const rectHeight = Math.max(2, Math.abs(botY - topY));
            const y = Math.min(topY, botY);
            return (
              <g key={`fvg-${idx}`}>
                <rect
                  x={padding.left + (candles.length * 0.6) * candleStep}
                  y={y}
                  width={usableWidth * 0.4}
                  height={rectHeight}
                  fill="url(#fvgGrad)"
                  stroke="#f59e0b"
                  strokeWidth="0.8"
                  rx="1"
                />
                <text
                  x={padding.left + (candles.length * 0.61) * candleStep}
                  y={y + 9}
                  fill="#fbbf24"
                  fontSize="8.5"
                  fontFamily="monospace"
                >
                  FVG IMBALANCE
                </text>
              </g>
            );
          })}

          {/* Risk Engine Overlay: Entry Zone, Stop Loss, TP1, TP2, TP3 */}
          {risk && (
            <g>
              {/* Entry Zone Box */}
              {(() => {
                const topY = getY(risk.entryZone[1]);
                const botY = getY(risk.entryZone[0]);
                const rectHeight = Math.max(2, Math.abs(botY - topY));
                const y = Math.min(topY, botY);
                return (
                  <g>
                    <rect
                      x={padding.left + usableWidth * 0.72}
                      y={y}
                      width={usableWidth * 0.28}
                      height={rectHeight}
                      fill="url(#entryZoneGrad)"
                      stroke="#06b6d4"
                      strokeWidth="1.2"
                      rx="2"
                    />
                    <text
                      x={padding.left + usableWidth * 0.73}
                      y={y + 11}
                      fill="#22d3ee"
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      ENTRY ZONE
                    </text>
                  </g>
                );
              })()}

              {/* Stop Loss Line */}
              {(() => {
                const y = getY(risk.stopLossPrice);
                return (
                  <g>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={chartWidth - padding.right}
                      y2={y}
                      stroke="#f43f5e"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />
                    <rect
                      x={chartWidth - padding.right + 4}
                      y={y - 8}
                      width={58}
                      height={16}
                      fill="#e11d48"
                      rx="3"
                    />
                    <text
                      x={chartWidth - padding.right + 7}
                      y={y + 4}
                      fill="#ffffff"
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      SL ${risk.stopLossPrice.toFixed(risk.stopLossPrice < 1 ? 3 : 1)}
                    </text>
                  </g>
                );
              })()}

              {/* TP1 Line */}
              {(() => {
                const y = getY(risk.takeProfit1);
                return (
                  <g>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={chartWidth - padding.right}
                      y2={y}
                      stroke="#10b981"
                      strokeWidth="1.2"
                      strokeDasharray="3 2"
                    />
                    <rect
                      x={chartWidth - padding.right + 4}
                      y={y - 7}
                      width={58}
                      height={14}
                      fill="#059669"
                      rx="2"
                    />
                    <text
                      x={chartWidth - padding.right + 7}
                      y={y + 3.5}
                      fill="#ffffff"
                      fontSize="8.5"
                      fontFamily="monospace"
                    >
                      TP1 (+{risk.takeProfit1Percent}%)
                    </text>
                  </g>
                );
              })()}

              {/* TP2 Line (Major Target) */}
              {(() => {
                const y = getY(risk.takeProfit2);
                return (
                  <g>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={chartWidth - padding.right}
                      y2={y}
                      stroke="#10b981"
                      strokeWidth="1.8"
                    />
                    <rect
                      x={chartWidth - padding.right + 4}
                      y={y - 8}
                      width={58}
                      height={16}
                      fill="#10b981"
                      rx="3"
                    />
                    <text
                      x={chartWidth - padding.right + 7}
                      y={y + 4}
                      fill="#042f2e"
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      TP2 ({risk.riskRewardRatio}R)
                    </text>
                  </g>
                );
              })()}

              {/* TP3 Line */}
              {(() => {
                const y = getY(risk.takeProfit3);
                return (
                  <g>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={chartWidth - padding.right}
                      y2={y}
                      stroke="#059669"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                    <rect
                      x={chartWidth - padding.right + 4}
                      y={y - 7}
                      width={58}
                      height={14}
                      fill="#047857"
                      rx="2"
                    />
                    <text
                      x={chartWidth - padding.right + 7}
                      y={y + 3.5}
                      fill="#ffffff"
                      fontSize="8.5"
                      fontFamily="monospace"
                    >
                      TP3 (+{risk.takeProfit3Percent}%)
                    </text>
                  </g>
                );
              })()}
            </g>
          )}

          {/* Candlesticks */}
          {candles.map((candle, idx) => {
            const x = padding.left + idx * candleStep + candleStep / 2;
            const openY = getY(candle.open);
            const closeY = getY(candle.close);
            const highY = getY(candle.high);
            const lowY = getY(candle.low);
            const isBull = candle.close >= candle.open;
            const bodyY = Math.min(openY, closeY);
            const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));

            return (
              <g
                key={`candle-${idx}`}
                className="cursor-pointer transition-opacity hover:opacity-80"
                onMouseEnter={() => setHoveredCandle(candle)}
                onMouseLeave={() => setHoveredCandle(null)}
              >
                {/* Wick */}
                <line
                  x1={x}
                  y1={highY}
                  x2={x}
                  y2={lowY}
                  stroke={isBull ? '#10b981' : '#f43f5e'}
                  strokeWidth="1.2"
                />
                {/* Body */}
                <rect
                  x={x - candleWidth / 2}
                  y={bodyY}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={isBull ? '#10b981' : '#f43f5e'}
                  rx="0.5"
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-800/40 text-[11px] font-mono text-slate-400">
        <div>
          Structure Invalidation: <span className="text-rose-400 font-semibold">{risk?.stopLossRationale || 'Below structure base'}</span>
        </div>
        <div>
          Calculated Risk/Reward: <span className="text-emerald-400 font-bold">1:{risk?.riskRewardRatio || '2.5'}</span>
        </div>
      </div>
    </div>
  );
};
