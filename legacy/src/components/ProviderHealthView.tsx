import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cpu,
  Database,
  RefreshCw,
  Server,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { ProviderHealth } from '../types/crypto';

export const ProviderHealthView: React.FC = () => {
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/crypto/providers/health');
      if (res.ok) {
        const data = await res.json();
        setProviders(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Top Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              Data Providers &amp; Telemetry Health
            </h2>
            <p className="text-slate-400 font-sans text-xs">
              Ensures zero-silent-failure data integrity across exchange spot APIs, futures orderbooks, and on-chain indexers.
            </p>
          </div>
        </div>

        <button
          onClick={fetchHealth}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Ping Providers</span>
        </button>
      </div>

      {/* Provider Health Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {providers.map((prov, idx) => {
          const isOperational = prov.status === 'OPERATIONAL';
          const isNotConfigured = prov.status === 'NOT_CONFIGURED';
          return (
            <div
              key={idx}
              className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div>
                  <div className="font-bold text-slate-100 text-sm">{prov.providerName}</div>
                  <div className="text-[10px] text-slate-400">{prov.category}</div>
                </div>

                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  isOperational
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : isNotConfigured
                    ? 'bg-slate-800 text-slate-400 border border-slate-700'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {prov.status}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                  <div className="text-[10px] text-slate-500">API LATENCY</div>
                  <div className="text-cyan-300 font-bold text-sm">{prov.latencyMs} ms</div>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                  <div className="text-[10px] text-slate-500">DATA FRESHNESS</div>
                  <div className="text-emerald-400 font-bold text-sm">
                    {prov.dataFreshnessSec > 9000 ? 'N/A' : `${prov.dataFreshnessSec}s ago`}
                  </div>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                  <div className="text-[10px] text-slate-500">ERROR RATE</div>
                  <div className="text-slate-200 font-bold text-sm">{prov.errorRatePercent}%</div>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                <span>Last verification:</span>
                <span className="text-slate-300">
                  {prov.lastSuccessfulFetch > 0
                    ? new Date(prov.lastSuccessfulFetch).toLocaleTimeString()
                    : 'Awaiting credentials'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
