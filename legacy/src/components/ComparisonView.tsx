import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  Plus,
  Scale,
  Trash2,
  Trophy,
  Zap
} from 'lucide-react';
import { SetupSignal } from '../types/crypto';

interface ComparisonViewProps {
  signals: SetupSignal[];
  onInspectSetup: (signal: SetupSignal) => void;
  onRequestAIReport: (signal: SetupSignal) => void;
}

export const ComparisonView: React.FC<ComparisonViewProps> = ({
  signals,
  onInspectSetup,
  onRequestAIReport
}) => {
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['LINK', 'AAVE', 'SOL']);

  const comparedSignals = useMemo(() => {
    return selectedSymbols
      .map(sym => signals.find(s => s.symbol.toUpperCase() === sym.toUpperCase()))
      .filter((s): s is SetupSignal => Boolean(s));
  }, [selectedSymbols, signals]);

  const addSymbol = (sym: string) => {
    if (!selectedSymbols.includes(sym) && selectedSymbols.length < 5) {
      setSelectedSymbols([...selectedSymbols, sym]);
    }
  };

  const removeSymbol = (sym: string) => {
    setSelectedSymbols(selectedSymbols.filter(s => s !== sym));
  };

  const bestRiskAdjusted = useMemo(() => {
    if (comparedSignals.length === 0) return null;
    return [...comparedSignals].sort((a, b) => b.scores.totalConfluenceScore - a.scores.totalConfluenceScore)[0];
  }, [comparedSignals]);

  const comparisonRows = [
    {
      label: 'Confluence Setup Score',
      getValue: (s: SetupSignal) => (
        <div className="flex items-center gap-1.5 font-bold">
          <span className={s.scores.totalConfluenceScore >= 78 ? 'text-emerald-400' : 'text-amber-400'}>
            {s.scores.totalConfluenceScore}/100
          </span>
          {bestRiskAdjusted?.id === s.id && (
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
          )}
        </div>
      )
    },
    {
      label: 'Signal Classification',
      getValue: (s: SetupSignal) => (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
          s.status === 'READY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
        }`}>
          {s.status}
        </span>
      )
    },
    {
      label: 'Current Spot Price',
      getValue: (s: SetupSignal) => `$${s.currentPrice}`
    },
    {
      label: 'Relative Strength vs BTC (24h)',
      getValue: (s: SetupSignal) => (
        <span className={s.relativeStrength.rsVsBtc24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
          {s.relativeStrength.rsVsBtc24h >= 0 ? '+' : ''}{s.relativeStrength.rsVsBtc24h}% ({s.relativeStrength.rsTier})
        </span>
      )
    },
    {
      label: 'Market Structure & BOS',
      getValue: (s: SetupSignal) => (
        <div className="text-[11px]">
          <div className="font-semibold text-slate-200">{s.smc.marketStructure}</div>
          <div className="text-slate-400">{s.smc.bosDetected ? 'Bullish BOS' : 'No recent BOS'}</div>
        </div>
      )
    },
    {
      label: 'Institutional Pricing Zone',
      getValue: (s: SetupSignal) => (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
          s.smc.currentZone === 'DISCOUNT' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-300'
        }`}>
          {s.smc.currentZone}
        </span>
      )
    },
    {
      label: 'Open Interest 24h Delta',
      getValue: (s: SetupSignal) => (
        <span className={s.derivatives.openInterestChange24h >= 0 ? 'text-emerald-400' : 'text-slate-400'}>
          {s.derivatives.openInterestChange24h >= 0 ? '+' : ''}{s.derivatives.openInterestChange24h}% (${(s.derivatives.openInterestUSD / 1e6).toFixed(1)}M)
        </span>
      )
    },
    {
      label: 'Funding Rate (8h)',
      getValue: (s: SetupSignal) => (
        <span className="text-slate-300">
          {(s.derivatives.fundingRate * 100).toFixed(4)}%
        </span>
      )
    },
    {
      label: 'Smart Money Net Flow',
      getValue: (s: SetupSignal) => (
        <span className={s.whaleSummary && s.whaleSummary.netSmartMoneyFlowUSD > 0 ? 'text-purple-400 font-semibold' : 'text-slate-400'}>
          {s.whaleSummary ? `+$${(s.whaleSummary.netSmartMoneyFlowUSD / 1e6).toFixed(1)}M` : '$0M'}
        </span>
      )
    },
    {
      label: 'Risk / Reward Ratio',
      getValue: (s: SetupSignal) => (
        <div className="font-bold text-cyan-300">
          1:{s.risk.riskRewardRatio} <span className="text-[10px] text-slate-400 font-normal">(SL: -{s.risk.stopLossPercent}%)</span>
        </div>
      )
    },
    {
      label: 'Entry Zone',
      getValue: (s: SetupSignal) => `$${s.risk.entryZone[0]} – $${s.risk.entryZone[1]}`
    },
    {
      label: 'Target 2 (Major)',
      getValue: (s: SetupSignal) => `$${s.risk.takeProfit2} (+${s.risk.takeProfit2Percent}%)`
    }
  ];

  return (
    <div className="space-y-6">
      {/* Top Header & Selector */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 font-mono uppercase tracking-wider">
              Asset Comparison Confluence Matrix
            </h2>
            <p className="text-xs text-slate-400">
              Rank assets based on risk-adjusted asymmetric reward rather than raw return.
            </p>
          </div>
        </div>

        {/* Add symbol pill buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono text-slate-400">Add asset:</span>
          {signals
            .filter(s => !selectedSymbols.includes(s.symbol))
            .slice(0, 6)
            .map(s => (
              <button
                key={s.symbol}
                onClick={() => addSymbol(s.symbol)}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition cursor-pointer border border-slate-700"
              >
                <Plus className="w-3 h-3 text-cyan-400" />
                <span>{s.symbol}</span>
              </button>
            ))}
        </div>
      </div>

      {/* Comparison Matrix Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xs font-mono text-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-950/90 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
              <tr>
                <th className="py-4 px-4 w-1/4">Evaluation Vector</th>
                {comparedSignals.map(sig => (
                  <th key={sig.id} className="py-4 px-4 min-w-[200px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded bg-slate-800 flex items-center justify-center font-bold text-slate-100 text-xs border border-slate-700">
                          {sig.symbol.slice(0, 3)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-100 text-sm">{sig.symbol}</div>
                          <div className="text-[10px] text-slate-400 normal-case">{sig.category.replace('_', ' ')}</div>
                        </div>
                      </div>
                      {comparedSignals.length > 2 && (
                        <button
                          onClick={() => removeSymbol(sig.symbol)}
                          className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {comparisonRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-4 font-semibold text-slate-400 bg-slate-950/40">
                    {row.label}
                  </td>
                  {comparedSignals.map(sig => (
                    <td key={sig.id} className="py-3 px-4 text-slate-200">
                      {row.getValue(sig)}
                    </td>
                  ))}
                </tr>
              ))}
              {/* Action row */}
              <tr className="bg-slate-950/60">
                <td className="py-4 px-4 font-semibold text-slate-400">Actions</td>
                {comparedSignals.map(sig => (
                  <td key={sig.id} className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onInspectSetup(sig)}
                        className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition cursor-pointer border border-slate-700"
                      >
                        Inspect Blueprint
                      </button>
                      <button
                        onClick={() => onRequestAIReport(sig)}
                        className="px-2.5 py-1.5 rounded bg-cyan-950 hover:bg-cyan-900 text-cyan-300 text-xs font-mono transition cursor-pointer border border-cyan-800"
                      >
                        AI Thesis
                      </button>
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
