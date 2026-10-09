import React, { useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  CircleDollarSign,
  Flame,
  Layers,
  RefreshCw,
  TrendingUp,
  Vault,
  Zap
} from 'lucide-react';
import { SectorRotationSummary, StablecoinResponse, TVLResponse } from '../types/crypto';

interface RotationViewProps {
  onSelectCategory?: (category: string) => void;
}

export const RotationView: React.FC<RotationViewProps> = ({ onSelectCategory }) => {
  const [rotations, setRotations] = useState<SectorRotationSummary[]>([]);
  const [tvlList, setTvlList] = useState<TVLResponse[]>([]);
  const [stablecoins, setStablecoins] = useState<StablecoinResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rotRes, tvlRes, stabRes] = await Promise.all([
        fetch('/api/crypto/rotations'),
        fetch('/api/crypto/tvl'),
        fetch('/api/crypto/stablecoins')
      ]);

      if (rotRes.ok) {
        const data = await rotRes.json();
        setRotations(data);
      }
      if (tvlRes.ok) {
        const tvls = await tvlRes.json();
        setTvlList(tvls);
      }
      if (stabRes.ok) {
        const stabs = await stabRes.json();
        setStablecoins(stabs);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalStableUSD = stablecoins.reduce((sum, s) => sum + s.circulatingUSD, 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100 font-mono uppercase tracking-wider">
                Ecosystem &amp; Sector Capital Rotation
              </h2>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold font-mono">
                DEFILLAMA (LIVE)
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Tracks multi-timeframe capital flow velocity, real chain TVL balances, and stablecoin liquidity migration.
            </p>
          </div>
        </div>

        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition cursor-pointer border border-slate-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Sectors</span>
        </button>
      </div>

      {/* On-Chain TVL & Stablecoin Liquidity Summary */}
      {tvlList.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
          {/* Top Chains by TVL */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 font-bold text-slate-100">
                <Vault className="w-4 h-4 text-cyan-400" />
                <span>VERIFIED CHAIN TVL (DEFILLAMA)</span>
              </div>
              <span className="text-[10px] text-slate-500">Live Balance Ingestion</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {tvlList.slice(0, 6).map((tvl, i) => (
                <div key={i} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                  <div className="text-slate-400 text-[11px] font-bold">{tvl.chain}</div>
                  <div className="text-slate-100 font-extrabold text-sm mt-0.5">
                    ${(tvl.tvlUSD / 1e9).toFixed(2)}B
                  </div>
                  <div className="text-[10px] text-cyan-400">{tvl.ecosystem.replace(/_/g, ' ')}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Stablecoins Liquidity */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 font-bold text-slate-100">
                <CircleDollarSign className="w-4 h-4 text-emerald-400" />
                <span>STABLECOIN LIQUIDITY POOL</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-bold">
                ${(totalStableUSD / 1e9).toFixed(1)}B Total Tracked
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {stablecoins.slice(0, 4).map((st, i) => (
                <div key={i} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                  <div className="text-slate-400 text-[11px] font-bold">{st.symbol}</div>
                  <div className="text-slate-100 font-extrabold text-sm mt-0.5">
                    ${(st.circulatingUSD / 1e9).toFixed(1)}B
                  </div>
                  <div className={`text-[10px] font-bold ${st.change24hPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {st.change24hPercent >= 0 ? '+' : ''}{st.change24hPercent}% (24h)
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sector Rotation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono">
        {rotations.map(sec => {
          const isAccelerating = sec.capitalFlow === 'ACCELERATING_INFLOW';
          const isModerate = sec.capitalFlow === 'MODERATE_INFLOW';

          return (
            <div
              key={sec.sectorKey}
              className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl p-4 space-y-3 transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-100 text-sm">
                    {sec.sectorName}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    isAccelerating
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : isModerate
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {sec.capitalFlow.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-400">Momentum:</span>
                  <span className="text-sm font-extrabold text-cyan-400">{sec.momentumScore}/100</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all ${
                    sec.momentumScore >= 75 ? 'bg-emerald-400' : sec.momentumScore >= 50 ? 'bg-cyan-400' : 'bg-slate-600'
                  }`}
                  style={{ width: `${sec.momentumScore}%` }}
                ></div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-slate-800/60">
                <div>
                  <div className="text-slate-500 text-[10px]">AVG 24H DELTA</div>
                  <div className={`font-bold flex items-center gap-0.5 ${
                    sec.averageChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {sec.averageChange24h >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    <span>{sec.averageChange24h >= 0 ? '+' : ''}{sec.averageChange24h}%</span>
                  </div>
                </div>

                <div>
                  <div className="text-slate-500 text-[10px]">SECTOR VOL (24H)</div>
                  <div className="text-slate-200 font-bold">
                    ${(sec.totalVolume24h / 1e6).toFixed(1)}M
                  </div>
                </div>

                <div>
                  <div className="text-slate-500 text-[10px]">LEADER COIN</div>
                  <div className="text-cyan-300 font-bold">
                    {sec.leaderCoin} (+{sec.leaderChange24h}%)
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
