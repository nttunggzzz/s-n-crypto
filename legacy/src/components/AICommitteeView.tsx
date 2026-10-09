import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cpu,
  FileDown,
  HelpCircle,
  RefreshCw,
  Scale,
  Send,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { AICommitteeReport, SetupSignal } from '../types/crypto';

interface AICommitteeViewProps {
  signals: SetupSignal[];
  selectedSignal: SetupSignal;
  onSelectSignal: (signal: SetupSignal) => void;
  onSendTelegramAlert: (signal: SetupSignal) => void;
}

export const AICommitteeView: React.FC<AICommitteeViewProps> = ({
  signals,
  selectedSignal,
  onSelectSignal,
  onSendTelegramAlert
}) => {
  const [report, setReport] = useState<AICommitteeReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAIReport = async (signalToUse: SetupSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ai/committee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal: signalToUse, marketRegime: 'BULLISH_EXPANSION' })
      });
      if (!response.ok) {
        throw new Error(`AI Service returned ${response.status}`);
      }
      const data: AICommitteeReport = await response.json();
      setReport(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to synthesize AI research report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSignal) {
      fetchAIReport(selectedSignal);
    }
  }, [selectedSignal.id]);

  const downloadMarkdownReport = () => {
    if (!report) return;
    const content = `# AI INVESTMENT COMMITTEE REPORT: ${report.symbol}
Verdict: ${report.verdict} (Confidence: ${report.confidenceScore}/100)
Timestamp: ${new Date(report.timestamp).toISOString()}
Model: ${report.modelUsed}

## Executive Thesis
${report.executiveThesis}

## 1. Verified Facts (Direct Deterministic Data)
${report.facts.map(f => `* ${f}`).join('\n')}

## 2. Inferences (Confluence Deductions)
${report.inferences.map(i => `* ${i}`).join('\n')}

## 3. Uncertainties & Macro Unknowns
${report.uncertainties.map(u => `* ${u}`).join('\n')}

## 4. Catalysts & Confluences
${report.catalystsAndConfluences.map(c => `* ${c}`).join('\n')}

## 5. Counter-Thesis & Key Risks
${report.counterThesisRisks.map(r => `* ${r}`).join('\n')}

## 6. Structural Invalidation Plan
${report.invalidationPlan}

## 7. Committee Summary
${report.committeeSummary}
`;

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI-Committee-Report-${report.symbol}-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Coin Selector */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 font-mono uppercase tracking-wider flex items-center gap-2">
              <span>AI Investment Committee</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                POST-DETERMINISTIC REASONING
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Grounds LLM synthesis strictly on quantitative SMC, derivatives, and on-chain facts.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
            <span>Evaluating:</span>
            <select
              value={selectedSignal.symbol}
              onChange={e => {
                const found = signals.find(s => s.symbol === e.target.value);
                if (found) onSelectSignal(found);
              }}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 font-bold focus:outline-hidden"
            >
              {signals.map(s => (
                <option key={s.id} value={s.symbol}>
                  {s.symbol} ({s.scores.totalConfluenceScore}/100) — {s.status}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => fetchAIReport(selectedSignal)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-xs font-mono transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Synthesizing...' : 'Re-Evaluate'}</span>
          </button>

          {report && (
            <button
              onClick={downloadMarkdownReport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-mono transition cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Export Report (.MD)</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
          <div className="text-sm font-mono text-slate-200 font-bold">
            Gemini AI Investment Committee Deliberating...
          </div>
          <div className="text-xs text-slate-400 max-w-md mx-auto">
            Cross-examining deterministic SMC order blocks, derivatives OI delta, and whale flows against macroeconomic regime parameters.
          </div>
        </div>
      ) : error ? (
        <div className="bg-rose-950/20 border border-rose-800 rounded-xl p-6 text-center space-y-2">
          <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto" />
          <div className="text-sm font-mono text-rose-200 font-bold">Evaluation Error</div>
          <div className="text-xs text-rose-400">{error}</div>
        </div>
      ) : report ? (
        <div className="space-y-6">
          {/* Executive Verdict Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 border border-cyan-500/30 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase">COMMITTEE VERDICT:</span>
                <span className="px-3 py-1 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-extrabold text-xs">
                  {report.verdict.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="text-slate-400">
                  Model: <span className="text-slate-200 font-semibold">{report.modelUsed}</span>
                </span>
                <span className="text-slate-400">
                  Confidence: <span className="text-cyan-400 font-bold">{report.confidenceScore}/100</span>
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800/80 text-xs font-mono leading-relaxed text-slate-200">
              <span className="font-bold text-cyan-300">Executive Thesis: </span>
              {report.executiveThesis}
            </div>
          </div>

          {/* Core Grounding Triad: Facts vs Inferences vs Uncertainties */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. FACTS */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider pb-2 border-b border-slate-800">
                <ShieldCheck className="w-4 h-4" />
                <span>1. VERIFIED FACTS</span>
              </div>
              <div className="space-y-2 text-xs font-mono text-slate-300">
                {report.facts.map((fact, idx) => (
                  <div key={idx} className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                    {fact}
                  </div>
                ))}
              </div>
            </div>

            {/* 2. INFERENCES */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider pb-2 border-b border-slate-800">
                <Sparkles className="w-4 h-4" />
                <span>2. INFERENCES</span>
              </div>
              <div className="space-y-2 text-xs font-mono text-slate-300">
                {report.inferences.map((inf, idx) => (
                  <div key={idx} className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                    {inf}
                  </div>
                ))}
              </div>
            </div>

            {/* 3. UNCERTAINTIES */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-400 uppercase tracking-wider pb-2 border-b border-slate-800">
                <HelpCircle className="w-4 h-4" />
                <span>3. UNCERTAINTIES</span>
              </div>
              <div className="space-y-2 text-xs font-mono text-slate-300">
                {report.uncertainties.map((unc, idx) => (
                  <div key={idx} className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                    {unc}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Catalysts vs Counter-Thesis & Invalidation Plan */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
            {/* Catalysts & Confluences */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 font-bold text-slate-200 uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Catalysts &amp; Confluence Signals</span>
              </div>
              <div className="space-y-1.5 text-slate-300">
                {report.catalystsAndConfluences.map((cat, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-slate-950/50 p-2 rounded border border-slate-800/60">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span>{cat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Counter Thesis & Invalidation */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 font-bold text-slate-200 uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Counter-Thesis &amp; Invalidation Strategy</span>
              </div>
              <div className="space-y-2">
                <div className="bg-rose-950/20 border border-rose-800/40 p-2.5 rounded-lg text-rose-300">
                  <div className="font-bold text-[11px] text-rose-400 mb-1">INVALIDATION DIRECTIVE:</div>
                  <div>{report.invalidationPlan}</div>
                </div>

                <div className="space-y-1.5 text-slate-300">
                  {report.counterThesisRisks.map((risk, idx) => (
                    <div key={idx} className="flex items-start gap-2 bg-slate-950/50 p-2 rounded border border-slate-800/60">
                      <span className="text-amber-400 font-bold">!</span>
                      <span>{risk}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
