import React, { useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Layers,
  Percent,
  Play,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  Zap
} from 'lucide-react';
import { BacktestConfig, BacktestSummary } from '../types/crypto';

export const BacktestView: React.FC = () => {
  const [config, setConfig] = useState<BacktestConfig>({
    minSetupScore: 75,
    minRiskRewardRatio: 1.8,
    maxHoldingPeriodBars: 24,
    slippagePercent: 0.1,
    feePercent: 0.06,
    requireSMCConfirmation: true,
    requireDerivativesConfirmation: true,
    requireRSLeader: false
  });

  const [loading, setLoading] = useState<boolean>(false);
  const [summary, setSummary] = useState<BacktestSummary | null>(null);

  const runBacktest = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Run initial backtest on load if not yet run
  React.useEffect(() => {
    runBacktest();
  }, []);

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Top Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              Historical Backtest &amp; Performance Studio
            </h2>
            <p className="text-slate-400 font-sans text-xs">
              Simulate quantitative setups across historical 4H cycles with realistic slippage, fee modeling, and structural SL execution.
            </p>
          </div>
        </div>

        <button
          onClick={runBacktest}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition cursor-pointer disabled:opacity-50"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>{loading ? 'Simulating...' : 'Run Simulation'}</span>
        </button>
      </div>

      {/* Parameter Control Panel */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 className="font-bold text-slate-200 uppercase tracking-wider">
            Strategy Simulation Parameters
          </h3>
          <span className="text-slate-400 text-[11px]">Strict Walk-Forward Validation</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Min Setup Score */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-1.5">
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Min Confluence Score</span>
              <strong className="text-cyan-400">{config.minSetupScore} / 100</strong>
            </div>
            <input
              type="range"
              min="50"
              max="90"
              step="5"
              value={config.minSetupScore}
              onChange={e => setConfig({ ...config, minSetupScore: Number(e.target.value) })}
              className="w-full accent-cyan-400"
            />
          </div>

          {/* Min Risk Reward */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-1.5">
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Min Risk / Reward</span>
              <strong className="text-emerald-400">1:{config.minRiskRewardRatio}</strong>
            </div>
            <input
              type="range"
              min="1.0"
              max="3.5"
              step="0.1"
              value={config.minRiskRewardRatio}
              onChange={e => setConfig({ ...config, minRiskRewardRatio: Number(e.target.value) })}
              className="w-full accent-emerald-400"
            />
          </div>

          {/* Max Holding Period */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-1.5">
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Max Hold (4H Bars)</span>
              <strong className="text-slate-200">{config.maxHoldingPeriodBars} bars</strong>
            </div>
            <input
              type="range"
              min="6"
              max="60"
              step="6"
              value={config.maxHoldingPeriodBars}
              onChange={e => setConfig({ ...config, maxHoldingPeriodBars: Number(e.target.value) })}
              className="w-full accent-slate-400"
            />
          </div>

          {/* Toggles */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex flex-col justify-center gap-2">
            <label className="flex items-center gap-2 text-slate-300 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={config.requireSMCConfirmation}
                onChange={e => setConfig({ ...config, requireSMCConfirmation: e.target.checked })}
                className="accent-cyan-400 rounded"
              />
              <span>Require BOS / Demand OB</span>
            </label>
            <label className="flex items-center gap-2 text-slate-300 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={config.requireDerivativesConfirmation}
                onChange={e => setConfig({ ...config, requireDerivativesConfirmation: e.target.checked })}
                className="accent-cyan-400 rounded"
              />
              <span>Require Clean OI / Funding</span>
            </label>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {/* Win Rate */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <div className="text-slate-400 text-[10px] uppercase">Win Rate</div>
              <div className="text-2xl font-extrabold text-emerald-400">{summary.winRate}%</div>
              <div className="text-[10px] text-slate-400">{summary.winningTrades}W / {summary.losingTrades}L</div>
            </div>

            {/* Profit Factor */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <div className="text-slate-400 text-[10px] uppercase">Profit Factor</div>
              <div className="text-2xl font-extrabold text-cyan-300">{summary.profitFactor}</div>
              <div className="text-[10px] text-slate-400">&gt; 1.8 is Institutional Grade</div>
            </div>

            {/* Expectancy */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <div className="text-slate-400 text-[10px] uppercase">Expectancy / Trade</div>
              <div className="text-2xl font-extrabold text-emerald-300">+{summary.expectancyR} R</div>
              <div className="text-[10px] text-slate-400">Net Risk-Adjusted Gain</div>
            </div>

            {/* Total Return */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <div className="text-slate-400 text-[10px] uppercase">Simulated Return</div>
              <div className="text-2xl font-extrabold text-slate-100">+{summary.totalReturnPercent}%</div>
              <div className="text-[10px] text-slate-400">{summary.totalTrades} Total Setups</div>
            </div>

            {/* Max Drawdown */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <div className="text-slate-400 text-[10px] uppercase">Max Drawdown</div>
              <div className="text-2xl font-extrabold text-rose-400">-{summary.maxDrawdownPercent}%</div>
              <div className="text-[10px] text-slate-400">Peak-to-Trough</div>
            </div>

            {/* Sharpe */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <div className="text-slate-400 text-[10px] uppercase">Sharpe Ratio</div>
              <div className="text-2xl font-extrabold text-slate-100">{summary.sharpeRatio}</div>
              <div className="text-[10px] text-slate-400">Annualized Risk metric</div>
            </div>
          </div>

          {/* Breakdown Tables: By Confluence Bracket & By Market Regime */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* By Confluence Score */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="font-bold text-slate-200 uppercase tracking-wider">
                Performance by Confluence Score Bracket
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Score Bracket</th>
                      <th className="py-2 px-3">Trades</th>
                      <th className="py-2 px-3">Win Rate</th>
                      <th className="py-2 px-3">Avg Return</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {summary.byScoreBracket.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 font-semibold text-slate-200">{row.scoreBracket}</td>
                        <td className="py-2.5 px-3 text-slate-300">{row.trades}</td>
                        <td className="py-2.5 px-3 font-bold text-emerald-400">{row.winRate}%</td>
                        <td className="py-2.5 px-3 text-cyan-300">+{row.avgReturnPercent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* By Market Regime */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="font-bold text-slate-200 uppercase tracking-wider">
                Performance by Market Regime
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Regime</th>
                      <th className="py-2 px-3">Trades</th>
                      <th className="py-2 px-3">Win Rate</th>
                      <th className="py-2 px-3">Profit Factor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {summary.byRegime.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 font-semibold text-slate-200">{row.regime.replace(/_/g, ' ')}</td>
                        <td className="py-2.5 px-3 text-slate-300">{row.trades}</td>
                        <td className="py-2.5 px-3 font-bold text-emerald-400">{row.winRate}%</td>
                        <td className="py-2.5 px-3 text-cyan-300">{row.profitFactor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Recent Backtested Trades Log */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <h3 className="font-bold text-slate-200 uppercase tracking-wider">
                Simulated Execution Log (Recent Setups)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Asset</th>
                    <th className="py-3 px-4">Setup Score</th>
                    <th className="py-3 px-4">Entry</th>
                    <th className="py-3 px-4">Exit</th>
                    <th className="py-3 px-4">Outcome</th>
                    <th className="py-3 px-4">PnL (R)</th>
                    <th className="py-3 px-4">Exit Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {summary.trades.slice(0, 8).map(tr => {
                    const isWin = tr.outcome === 'WIN';
                    return (
                      <tr key={tr.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-bold text-slate-100">{tr.symbol}</td>
                        <td className="py-2.5 px-4 text-cyan-300 font-semibold">{tr.confluenceScore}/100</td>
                        <td className="py-2.5 px-4 text-slate-300">${tr.entryPrice}</td>
                        <td className="py-2.5 px-4 text-slate-300">${tr.exitPrice}</td>
                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isWin ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {tr.outcome}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-bold">
                          <span className={tr.pnlR >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {tr.pnlR >= 0 ? '+' : ''}{tr.pnlR}R
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-400">{tr.exitReason.replace(/_/g, ' ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
