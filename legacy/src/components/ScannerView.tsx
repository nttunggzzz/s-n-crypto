import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Eye,
  Filter,
  Flame,
  Search,
  Send,
  Sparkles,
  TrendingUp,
  Zap
} from 'lucide-react';
import { SetupSignal, SignalStatus } from '../types/crypto';

interface ScannerViewProps {
  signals: SetupSignal[];
  selectedSignal: SetupSignal | null;
  onSelectSignal: (signal: SetupSignal) => void;
  onInspectSetup: (signal: SetupSignal) => void;
  onRequestAIReport: (signal: SetupSignal) => void;
  onSendTelegramAlert: (signal: SetupSignal) => void;
}

export const ScannerView: React.FC<ScannerViewProps> = ({
  signals,
  selectedSignal,
  onSelectSignal,
  onInspectSetup,
  onRequestAIReport,
  onSendTelegramAlert
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<SignalStatus | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [minScore, setMinScore] = useState<number>(0);

  const categories = useMemo(() => {
    const set = new Set(signals.map(s => s.category));
    return ['ALL', ...Array.from(set)];
  }, [signals]);

  const filteredSignals = useMemo(() => {
    return signals.filter(s => {
      const matchSearch =
        s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || s.status === statusFilter;
      const matchCategory = categoryFilter === 'ALL' || s.category === categoryFilter;
      const matchScore = s.scores.totalConfluenceScore >= minScore;
      return matchSearch && matchStatus && matchCategory && matchScore;
    });
  }, [signals, searchQuery, statusFilter, categoryFilter, minScore]);

  const topReady = useMemo(() => {
    return signals.find(s => s.status === 'READY') || signals[0];
  }, [signals]);

  const avgScore = useMemo(() => {
    if (signals.length === 0) return 0;
    const sum = signals.reduce((acc, s) => acc + s.scores.totalConfluenceScore, 0);
    return Number((sum / signals.length).toFixed(1));
  }, [signals]);

  const readyCount = signals.filter(s => s.status === 'READY').length;
  const formingCount = signals.filter(s => s.status === 'SETUP FORMING').length;

  return (
    <div className="space-y-6">
      {/* Top Confluence Summary Bento */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>READY SETUPS</span>
            <Flame className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="my-2">
            <span className="text-3xl font-extrabold text-slate-100">{readyCount}</span>
            <span className="text-xs text-slate-400 ml-2">High Conviction</span>
          </div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Passed R:R &gt; 1.5 &amp; SMC Validation</span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>SETUPS FORMING</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="my-2">
            <span className="text-3xl font-extrabold text-slate-100">{formingCount}</span>
            <span className="text-xs text-slate-400 ml-2">Pending Retest</span>
          </div>
          <div className="text-[11px] text-amber-400/90 font-mono">
            Developing structure in Discount zones
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>UNIVERSE CONFLUENCE</span>
            <Zap className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="my-2">
            <span className="text-3xl font-extrabold text-cyan-400">{avgScore}</span>
            <span className="text-xs text-slate-400 ml-1">/ 100 avg</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            Across 8 deterministic analytical engines
          </div>
        </div>

        <div className="bg-gradient-to-br from-cyan-950/40 to-slate-900/80 border border-cyan-500/30 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-cyan-400 font-mono font-semibold">
            <span>#1 CONFLUENCE LEADER</span>
            <Sparkles className="w-4 h-4 text-cyan-400" />
          </div>
          {topReady ? (
            <div className="my-1">
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold text-slate-100">{topReady.symbol}</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold text-xs">
                  {topReady.scores.totalConfluenceScore}/100
                </span>
              </div>
              <div className="text-xs text-slate-300 font-mono mt-0.5">
                ${topReady.currentPrice} • R:R 1:{topReady.risk.riskRewardRatio}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">Scanning...</div>
          )}
          <button
            onClick={() => topReady && onInspectSetup(topReady)}
            className="text-[11px] text-cyan-300 hover:text-cyan-200 flex items-center gap-1 font-mono font-semibold cursor-pointer"
          >
            <span>View Execution Blueprint</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search coin by symbol or name (e.g. LINK, AAVE, SOL)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-hidden focus:border-cyan-500/50"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            {(['ALL', 'READY', 'SETUP FORMING', 'WATCH', 'INVALIDATED'] as const).map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer font-mono text-[11px] ${
                  statusFilter === status
                    ? 'bg-slate-800 text-slate-100 font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Sector:</span>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-hidden"
            >
              {categories.map(c => (
                <option key={c} value={c}>{c.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-slate-400">
            <span>Min Score:</span>
            <input
              type="range"
              min="0"
              max="85"
              step="5"
              value={minScore}
              onChange={e => setMinScore(Number(e.target.value))}
              className="w-20 accent-cyan-400"
            />
            <span className="w-6 text-slate-200">{minScore}</span>
          </div>
        </div>
      </div>

      {/* Main Confluence Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Asset</th>
                <th className="py-3 px-3">Price &amp; 24h</th>
                <th className="py-3 px-3">24h Vol / OI Δ</th>
                <th className="py-3 px-4">Confluence Score</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-4">Key Confluence Signals</th>
                <th className="py-3 px-3">Risk / Reward</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredSignals.map(sig => {
                const isSelected = selectedSignal?.id === sig.id;
                const score = sig.scores.totalConfluenceScore;
                const isReady = sig.status === 'READY';
                const isForming = sig.status === 'SETUP FORMING';

                return (
                  <tr
                    key={sig.id}
                    onClick={() => onSelectSignal(sig)}
                    className={`hover:bg-slate-800/40 transition cursor-pointer ${
                      isSelected ? 'bg-cyan-950/20' : ''
                    }`}
                  >
                    {/* Symbol & Name */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-slate-200 text-xs border border-slate-700">
                          {sig.symbol.slice(0, 3)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-100 text-sm flex items-center gap-1.5">
                            <span>{sig.symbol}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-normal">
                              {sig.category.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400">{sig.name}</div>
                        </div>
                      </div>
                    </td>

                    {/* Price & 24h Change */}
                    <td className="py-3.5 px-3">
                      <div className="font-semibold text-slate-100">
                        ${sig.currentPrice.toFixed(sig.currentPrice < 1 ? 5 : 2)}
                      </div>
                      <div className={`flex items-center gap-0.5 text-[11px] font-semibold ${
                        sig.relativeStrength.rsVsBtc24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {sig.relativeStrength.rsVsBtc24h >= 0 ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        <span>{sig.relativeStrength.rsVsBtc24h >= 0 ? '+' : ''}{sig.relativeStrength.rsVsBtc24h}% vs BTC</span>
                      </div>
                    </td>

                    {/* Vol & OI Delta */}
                    <td className="py-3.5 px-3">
                      <div className="text-slate-300">
                        OI: ${(sig.derivatives.openInterestUSD / 1e6).toFixed(1)}M
                      </div>
                      <div className={`text-[11px] ${
                        sig.derivatives.openInterestChange24h >= 0 ? 'text-emerald-400' : 'text-slate-400'
                      }`}>
                        OI Δ: {sig.derivatives.openInterestChange24h >= 0 ? '+' : ''}{sig.derivatives.openInterestChange24h}%
                      </div>
                    </td>

                    {/* Confluence Score & Progress Bar */}
                    <td className="py-3.5 px-4 min-w-[140px]">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-bold ${
                          score >= 80 ? 'text-emerald-400' : score >= 65 ? 'text-amber-400' : 'text-slate-400'
                        }`}>
                          {score} / 100
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {score >= 80 ? 'HIGH' : score >= 65 ? 'MED' : 'LOW'}
                        </span>
                      </div>
                      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className={`h-full rounded-full transition-all ${
                            score >= 80 ? 'bg-emerald-400' : score >= 65 ? 'bg-amber-400' : 'bg-slate-600'
                          }`}
                          style={{ width: `${Math.min(100, score)}%` }}
                        ></div>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-3">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                        isReady
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : isForming
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : sig.status === 'WATCH'
                          ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {isReady && <CheckCircle2 className="w-3 h-3" />}
                        {isForming && <TrendingUp className="w-3 h-3" />}
                        {sig.status}
                      </span>
                    </td>

                    {/* Confluence Highlights */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        {sig.smc.bosDetected && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                            BOS Validated
                          </span>
                        )}
                        {sig.smc.activeOrderBlocks.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                            Demand OB
                          </span>
                        )}
                        {sig.smc.currentZone === 'DISCOUNT' && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                            Discount Zone
                          </span>
                        )}
                        {sig.whaleSummary && sig.whaleSummary.netSmartMoneyFlowUSD > 1_000_000 && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                            Whale Accum (+${(sig.whaleSummary.netSmartMoneyFlowUSD / 1e6).toFixed(1)}M)
                          </span>
                        )}
                        {sig.relativeStrength.rsTier === 'LEADER' && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                            RS Leader
                          </span>
                        )}
                      </div>
                    </td>

                    {/* R:R Ratio */}
                    <td className="py-3.5 px-3">
                      <div className="font-bold text-slate-200">
                        1:{sig.risk.riskRewardRatio}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        SL: -{sig.risk.stopLossPercent}%
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => onInspectSetup(sig)}
                          title="Inspect Setup Blueprint & Chart"
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onRequestAIReport(sig)}
                          title="Run AI Investment Committee"
                          className="p-1.5 rounded bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 transition cursor-pointer"
                        >
                          <Bot className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onSendTelegramAlert(sig)}
                          title="Send to Telegram"
                          className="p-1.5 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 transition cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
