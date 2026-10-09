import React from 'react';
import {
  AlertOctagon,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronLeft,
  Coins,
  Copy,
  Layers,
  Radio,
  Scale,
  Send,
  ShieldAlert,
  Target,
  TrendingUp,
  Zap
} from 'lucide-react';
import { SetupSignal } from '../types/crypto';
import { CandleChart } from './CandleChart';

interface SetupDetailViewProps {
  signal: SetupSignal;
  onBackToScanner: () => void;
  onRequestAIReport: (signal: SetupSignal) => void;
  onSendTelegramAlert: (signal: SetupSignal) => void;
  onCompareAsset: (symbol: string) => void;
}

export const SetupDetailView: React.FC<SetupDetailViewProps> = ({
  signal,
  onBackToScanner,
  onRequestAIReport,
  onSendTelegramAlert,
  onCompareAsset
}) => {
  const [copied, setCopied] = React.useState(false);

  const copyBlueprint = () => {
    const text = `CRYPTO SIGNAL: ${signal.symbol} | Direction: ${signal.direction} | Score: ${signal.scores.totalConfluenceScore}/100\nEntry Zone: $${signal.risk.entryZone[0]} - $${signal.risk.entryZone[1]}\nStop Loss: $${signal.risk.stopLossPrice} (-${signal.risk.stopLossPercent}%)\nTP1: $${signal.risk.takeProfit1} (+${signal.risk.takeProfit1Percent}%)\nTP2: $${signal.risk.takeProfit2} (+${signal.risk.takeProfit2Percent}%)\nR:R: 1:${signal.risk.riskRewardRatio}\nInvalidation: ${signal.invalidationTrigger}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scoreItems = [
    { label: 'Market Regime', score: signal.scores.marketScore, weight: '10%' },
    { label: 'Price Action', score: signal.scores.priceActionScore, weight: '20%' },
    { label: 'SMC Structure', score: signal.scores.smcScore, weight: '20%' },
    { label: 'Relative Strength', score: signal.scores.relativeStrengthScore, weight: '15%' },
    { label: 'Derivatives & OI', score: signal.scores.derivativesScore, weight: '15%' },
    { label: 'Whale & Smart Money', score: signal.scores.whaleScore, weight: '10%' },
    { label: 'On-Chain Metrics', score: signal.scores.onchainScore, weight: '5%' },
    { label: 'Ecosystem Momentum', score: signal.scores.rotationScore, weight: '5%' }
  ];

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToScanner}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition cursor-pointer border border-slate-700"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Scanner</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold text-slate-100">{signal.symbol}</span>
            <span className="text-sm text-slate-400 font-mono">/ USDT</span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono font-semibold">
              {signal.category.replace('_', ' ')}
            </span>
            <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold uppercase tracking-wider ${
              signal.status === 'READY'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}>
              {signal.status}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyBlueprint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition cursor-pointer border border-slate-700"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copied ? 'Copied!' : 'Copy Plan'}</span>
          </button>
          <button
            onClick={() => onCompareAsset(signal.symbol)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition cursor-pointer border border-slate-700"
          >
            <Scale className="w-3.5 h-3.5 text-cyan-400" />
            <span>Compare Matrix</span>
          </button>
          <button
            onClick={() => onRequestAIReport(signal)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 text-xs font-mono font-semibold transition cursor-pointer border border-cyan-800"
          >
            <Bot className="w-3.5 h-3.5 text-cyan-400" />
            <span>AI Committee Report</span>
          </button>
          <button
            onClick={() => onSendTelegramAlert(signal)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 text-xs font-mono font-semibold transition cursor-pointer border border-emerald-800"
          >
            <Send className="w-3.5 h-3.5 text-emerald-400" />
            <span>Send Alert</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Chart on Left, Execution Parameters on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Interactive Candle & Technical Chart */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
                  Technical Structure &amp; Trade Architecture
                </h3>
              </div>
              <div className="text-xs font-mono text-slate-400">
                Current Spot: <span className="text-slate-100 font-bold">${signal.currentPrice}</span>
              </div>
            </div>

            <CandleChart
              candles={signal.candles}
              symbol={signal.symbol}
              currentPrice={signal.currentPrice}
              risk={signal.risk}
              smc={signal.smc}
              height={380}
            />
          </div>

          {/* Evidence and Confluence Breakdown Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Deterministic Evidence Points */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-200 uppercase tracking-wider mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Deterministic Confluence Evidence ({signal.evidencePoints.length})</span>
              </div>
              <div className="space-y-2 text-xs font-mono text-slate-300">
                {signal.evidencePoints.map((point, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Risks & Invalidation Trigger */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-200 uppercase tracking-wider mb-3">
                <AlertOctagon className="w-4 h-4 text-rose-400" />
                <span>Key Risks &amp; Invalidation Trigger</span>
              </div>
              <div className="space-y-2 text-xs font-mono">
                <div className="bg-rose-950/20 border border-rose-800/40 rounded-lg p-2.5 text-rose-300">
                  <div className="text-[11px] font-bold text-rose-400 mb-1 flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>STRICT INVALIDATION LEVEL:</span>
                  </div>
                  <div>{signal.invalidationTrigger}</div>
                </div>

                {signal.keyRisks.map((risk, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 text-slate-300">
                    <span className="text-amber-400 font-bold">!</span>
                    <span>{risk}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Confluence Score Radar & Risk Engine Execution Blueprint */}
        <div className="space-y-4">
          {/* Total Confluence Score Meter Card */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                Confluence Score Breakdown
              </h3>
              <span className="text-2xl font-extrabold text-cyan-400 font-mono">
                {signal.scores.totalConfluenceScore} <span className="text-xs text-slate-400 font-normal">/100</span>
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              {scoreItems.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>{item.label} <span className="text-slate-600">({item.weight})</span></span>
                    <span className="text-slate-200 font-semibold">{item.score}/100</span>
                  </div>
                  <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800/60">
                    <div
                      className={`h-full rounded-full transition-all ${
                        item.score >= 75 ? 'bg-emerald-400' : item.score >= 50 ? 'bg-cyan-400' : 'bg-slate-600'
                      }`}
                      style={{ width: `${Math.min(100, item.score)}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Engine Execution Parameters */}
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-cyan-500/30 rounded-xl p-4 space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                Risk Engine Specification
              </span>
              <span className="text-xs font-bold text-emerald-400">
                1:{signal.risk.riskRewardRatio} R:R
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {/* Entry Zone */}
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[11px]">ENTRY ZONE</div>
                <div className="text-cyan-300 font-bold text-sm">
                  ${signal.risk.entryZone[0]} – ${signal.risk.entryZone[1]}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{signal.risk.entryTrigger}</div>
              </div>

              {/* Stop Loss */}
              <div className="bg-rose-950/20 p-2.5 rounded-lg border border-rose-900/40">
                <div className="flex items-center justify-between">
                  <span className="text-rose-400 text-[11px] font-bold">STOP LOSS (STRUCTURE)</span>
                  <span className="text-rose-300 text-xs font-bold">-${signal.risk.stopLossPercent}%</span>
                </div>
                <div className="text-rose-200 font-bold text-sm">
                  ${signal.risk.stopLossPrice}
                </div>
                <div className="text-[10px] text-rose-400/80 mt-0.5">{signal.risk.stopLossRationale}</div>
              </div>

              {/* Take Profit Targets */}
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] text-slate-400 font-bold uppercase">TARGET LEVELS (TP)</div>

                <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-300">TP1 (1.5R):</span>
                  <div className="text-right">
                    <span className="text-emerald-400 font-bold">${signal.risk.takeProfit1}</span>
                    <span className="text-[10px] text-emerald-500/80 ml-1.5">+{signal.risk.takeProfit1Percent}%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2 rounded bg-emerald-950/20 border border-emerald-800/40">
                  <span className="text-emerald-300 font-bold">TP2 ({signal.risk.riskRewardRatio}R - Major):</span>
                  <div className="text-right">
                    <span className="text-emerald-300 font-bold">${signal.risk.takeProfit2}</span>
                    <span className="text-[10px] text-emerald-400 ml-1.5">+{signal.risk.takeProfit2Percent}%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-300">TP3 (Extension):</span>
                  <div className="text-right">
                    <span className="text-emerald-400 font-bold">${signal.risk.takeProfit3}</span>
                    <span className="text-[10px] text-emerald-500/80 ml-1.5">+{signal.risk.takeProfit3Percent}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
