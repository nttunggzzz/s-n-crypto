import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Flame,
  Layers,
  Scale,
  TrendingDown,
  TrendingUp,
  Zap
} from 'lucide-react';
import { SetupSignal } from '../types/crypto';

interface DerivativesViewProps {
  signals: SetupSignal[];
  onSelectSignal: (signal: SetupSignal) => void;
}

export const DerivativesView: React.FC<DerivativesViewProps> = ({
  signals,
  onSelectSignal
}) => {
  const [selectedCoinSymbol, setSelectedCoinSymbol] = useState<string>(signals[0]?.symbol || 'BTC');

  const selectedSignal = signals.find(s => s.symbol === selectedCoinSymbol) || signals[0];

  const sortedByOIChange = [...signals].sort(
    (a, b) => b.derivatives.openInterestChange24h - a.derivatives.openInterestChange24h
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 font-mono uppercase tracking-wider">
              Derivatives &amp; Open Interest Intelligence
            </h2>
            <p className="text-xs text-slate-400">
              Evaluates OI buildup, funding imbalances, liquidation clusters, and basis metrics.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-400">Inspecting:</span>
          <select
            value={selectedCoinSymbol}
            onChange={e => setSelectedCoinSymbol(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 font-bold focus:outline-hidden"
          >
            {signals.map(s => (
              <option key={s.id} value={s.symbol}>{s.symbol} — ${(s.derivatives.openInterestUSD / 1e6).toFixed(1)}M OI</option>
            ))}
          </select>
        </div>
      </div>

      {/* Selected Asset Derivatives Card */}
      {selectedSignal && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 font-mono">
          {/* Open Interest */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-xs text-slate-400 uppercase">Open Interest (USD)</div>
            <div className="text-2xl font-bold text-slate-100">
              ${(selectedSignal.derivatives.openInterestUSD / 1e6).toFixed(1)}M
            </div>
            <div className={`text-xs flex items-center gap-1 font-semibold ${
              selectedSignal.derivatives.openInterestChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {selectedSignal.derivatives.openInterestChange24h >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              <span>{selectedSignal.derivatives.openInterestChange24h >= 0 ? '+' : ''}{selectedSignal.derivatives.openInterestChange24h}% (24h Δ)</span>
            </div>
          </div>

          {/* Funding Rate */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-xs text-slate-400 uppercase">Funding Rate (8h)</div>
            <div className="text-2xl font-bold text-cyan-300">
              {(selectedSignal.derivatives.fundingRate * 100).toFixed(4)}%
            </div>
            <div className="text-xs text-slate-400">
              Predicted: {(selectedSignal.derivatives.predictedFundingRate * 100).toFixed(4)}%
            </div>
          </div>

          {/* Long/Short Ratio */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-xs text-slate-400 uppercase">Long / Short Ratio</div>
            <div className="text-2xl font-bold text-slate-100">
              {selectedSignal.derivatives.longShortRatio} : 1.0
            </div>
            <div className="text-xs text-slate-400">
              {selectedSignal.derivatives.longShortRatio > 1.2 ? 'Long Heavy' : selectedSignal.derivatives.longShortRatio < 0.8 ? 'Short Heavy' : 'Balanced Positioning'}
            </div>
          </div>

          {/* OI Interpretation */}
          <div className="bg-slate-900/60 border border-cyan-500/30 rounded-xl p-4 space-y-1">
            <div className="text-xs text-cyan-400 uppercase font-semibold">OI Regime Matrix</div>
            <div className="text-lg font-bold text-emerald-300">
              {selectedSignal.derivatives.oiInterpretation.replace('_', ' ')}
            </div>
            <div className="text-xs text-slate-300">
              {selectedSignal.derivatives.oiInterpretation === 'LONG_BUILDUP'
                ? 'Fresh capital entering long side.'
                : selectedSignal.derivatives.oiInterpretation === 'SHORT_COVERING'
                ? 'Positions closing into strength.'
                : 'Neutral derivatives flow.'}
            </div>
          </div>
        </div>
      )}

      {/* Full Universe Derivatives Heatmap Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xs font-mono text-xs">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-200 uppercase tracking-wider">
            Universe Derivatives Confluence Heatmap
          </h3>
          <span className="text-xs text-slate-400">Ranked by 24h OI Expansion</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Asset</th>
                <th className="py-3 px-4">Current Price</th>
                <th className="py-3 px-4">Open Interest</th>
                <th className="py-3 px-4">24h OI Change</th>
                <th className="py-3 px-4">Funding Rate</th>
                <th className="py-3 px-4">Long / Short</th>
                <th className="py-3 px-4">Liquidations (24h)</th>
                <th className="py-3 px-4">Regime Deduction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sortedByOIChange.map(sig => {
                const oiDelta = sig.derivatives.openInterestChange24h;
                const funding = sig.derivatives.fundingRate;

                return (
                  <tr
                    key={sig.id}
                    onClick={() => {
                      setSelectedCoinSymbol(sig.symbol);
                      onSelectSignal(sig);
                    }}
                    className="hover:bg-slate-800/40 transition cursor-pointer"
                  >
                    <td className="py-3 px-4 font-bold text-slate-100">
                      {sig.symbol}
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      ${sig.currentPrice}
                    </td>
                    <td className="py-3 px-4 text-slate-200">
                      ${(sig.derivatives.openInterestUSD / 1e6).toFixed(1)}M
                    </td>
                    <td className="py-3 px-4">
                      <span className={`font-semibold ${oiDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {oiDelta >= 0 ? '+' : ''}{oiDelta}%
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={funding > 0.03 ? 'text-rose-400 font-bold' : funding < 0 ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
                        {(funding * 100).toFixed(4)}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      {sig.derivatives.longShortRatio}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      ${((sig.derivatives.liquidations24h.totalUSD) / 1e6).toFixed(2)}M
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px] font-semibold">
                        {sig.derivatives.oiInterpretation.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
