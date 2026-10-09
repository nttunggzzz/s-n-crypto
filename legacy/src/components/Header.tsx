import React from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  Compass,
  Cpu,
  Download,
  Layers,
  Radio,
  RefreshCw,
  Scale,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { MarketRegimeResponse } from '../types/crypto';

export type ActiveTab =
  | 'scanner'
  | 'setup'
  | 'ai-committee'
  | 'comparison'
  | 'whale-radar'
  | 'derivatives'
  | 'rotation'
  | 'backtest'
  | 'telegram-hub'
  | 'providers';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  signalsCount: number;
  readyCount: number;
  regime?: MarketRegimeResponse | null;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isRefreshing,
  onRefresh,
  signalsCount,
  readyCount,
  regime
}) => {
  const tabs = [
    { id: 'scanner', label: 'Confluence Scanner', icon: Compass, badge: readyCount > 0 ? `${readyCount} Ready` : undefined },
    { id: 'setup', label: 'Setup Inspector & Chart', icon: Activity },
    { id: 'ai-committee', label: 'AI Investment Committee', icon: Cpu },
    { id: 'comparison', label: 'Asset Matrix', icon: Scale },
    { id: 'whale-radar', label: 'Whale & Smart Money', icon: Radio },
    { id: 'derivatives', label: 'Derivatives & OI', icon: Zap },
    { id: 'rotation', label: 'Ecosystem Rotation', icon: Layers },
    { id: 'backtest', label: 'Backtest Studio', icon: BarChart3 },
    { id: 'telegram-hub', label: 'Telegram Alert Hub', icon: Bot },
    { id: 'providers', label: 'Data Quality & Health', icon: ShieldCheck }
  ];

  const regimeColor =
    regime?.regime === 'BULLISH_EXPANSION' ? 'text-emerald-400' :
    regime?.regime === 'BEARISH_DISTRIBUTION' ? 'text-rose-400' :
    regime?.regime === 'VOLATILITY_SQUEEZE' ? 'text-amber-400' : 'text-cyan-400';

  return (
    <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
      {/* Top Status Banner */}
      <div className="px-4 py-2 border-b border-slate-800/60 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-bold tracking-wider text-slate-100 uppercase">ALPHA CONFLUENCE ENGINE</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
              BINANCE SPOT (LIVE)
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-slate-400 border-l border-slate-800 pl-3">
            <span>Regime:</span>
            <span className={`${regimeColor} font-semibold uppercase`}>
              {regime ? regime.regime.replace(/_/g, ' ') : 'BULLISH EXPANSION'}
            </span>
            <span className="text-slate-600">•</span>
            <span>Breadth:</span>
            <span className="text-slate-200 font-semibold">
              {regime ? `${regime.breadthPercentage}% (${regime.advancersCount}A / ${regime.declinersCount}D)` : '74%'}
            </span>
            <span className="text-slate-600">•</span>
            <span>BTC.D:</span>
            <span className="text-amber-400 font-semibold">
              {regime ? `${regime.btcDominance}%` : '56.5%'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-slate-400">
            Scanning <span className="text-slate-200 font-semibold">{signalsCount}</span> assets
          </div>
          <a
            href="/api/download/codebase"
            download="crypto_intelligence_codebase.tar.gz"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-700/60 transition cursor-pointer text-xs"
            title="Tải toàn bộ mã nguồn (.tar.gz) kèm hướng dẫn CLAUDE.md"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Tải Code (Claude)</span>
          </a>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{isRefreshing ? 'Syncing...' : 'Scan Now'}</span>
          </button>
        </div>
      </div>

      {/* Navigation Tab Bar */}
      <div className="px-4 overflow-x-auto scrollbar-none flex items-center gap-1 py-1.5">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ActiveTab)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                isActive
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950 font-bold text-[10px]">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
};
