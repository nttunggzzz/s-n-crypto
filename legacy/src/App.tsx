import React, { useEffect, useState } from 'react';
import { AICommitteeView } from './components/AICommitteeView';
import { BacktestView } from './components/BacktestView';
import { ComparisonView } from './components/ComparisonView';
import { DerivativesView } from './components/DerivativesView';
import { ActiveTab, Header } from './components/Header';
import { ProviderHealthView } from './components/ProviderHealthView';
import { RotationView } from './components/RotationView';
import { ScannerView } from './components/ScannerView';
import { SetupDetailView } from './components/SetupDetailView';
import { TelegramHubView } from './components/TelegramHubView';
import { WhaleRadarView } from './components/WhaleRadarView';
import { MarketRegimeResponse, SetupSignal, WhaleTransaction } from './types/crypto';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('scanner');
  const [signals, setSignals] = useState<SetupSignal[]>([]);
  const [whaleTxs, setWhaleTxs] = useState<WhaleTransaction[]>([]);
  const [regime, setRegime] = useState<MarketRegimeResponse | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<SetupSignal | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchData = async () => {
    setIsRefreshing(true);
    try {
      const [signalsRes, whalesRes, regimeRes] = await Promise.all([
        fetch('/api/crypto/signals'),
        fetch('/api/crypto/whales'),
        fetch('/api/crypto/regime')
      ]);

      if (signalsRes.ok) {
        const sigs: SetupSignal[] = await signalsRes.json();
        setSignals(sigs);
        if (!selectedSignal && sigs.length > 0) {
          setSelectedSignal(sigs[0]);
        } else if (selectedSignal) {
          const updated = sigs.find(s => s.id === selectedSignal.id);
          if (updated) setSelectedSignal(updated);
        }
      }

      if (whalesRes.ok) {
        const whales: WhaleTransaction[] = await whalesRes.json();
        setWhaleTxs(whales);
      }

      if (regimeRes.ok) {
        const reg: MarketRegimeResponse = await regimeRes.json();
        setRegime(reg);
      }
    } catch (err) {
      console.error('Error fetching crypto intelligence data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // 30s live scan cycle
    return () => clearInterval(interval);
  }, []);

  const handleInspectSetup = (signal: SetupSignal) => {
    setSelectedSignal(signal);
    setActiveTab('setup');
  };

  const handleRequestAIReport = (signal: SetupSignal) => {
    setSelectedSignal(signal);
    setActiveTab('ai-committee');
  };

  const handleSendTelegramAlert = (signal: SetupSignal) => {
    setSelectedSignal(signal);
    setActiveTab('telegram-hub');
  };

  const handleCompareAsset = (symbol: string) => {
    setActiveTab('comparison');
  };

  const readyCount = signals.filter(s => s.status === 'READY').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Institutional Navigation Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isRefreshing={isRefreshing}
        onRefresh={fetchData}
        signalsCount={signals.length}
        readyCount={readyCount}
        regime={regime}
      />

      {/* Main App Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {isLoading && signals.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center space-y-4">
            <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin"></div>
            <div className="font-mono text-sm text-slate-300 font-bold">
              Booting Deterministic Confluence Engines &amp; Market Stream...
            </div>
            <div className="font-mono text-xs text-slate-500">
              Aggregating SMC structure, live 24h orderbooks, and whale cluster telemetry.
            </div>
          </div>
        ) : (
          <div>
            {activeTab === 'scanner' && (
              <ScannerView
                signals={signals}
                selectedSignal={selectedSignal}
                onSelectSignal={setSelectedSignal}
                onInspectSetup={handleInspectSetup}
                onRequestAIReport={handleRequestAIReport}
                onSendTelegramAlert={handleSendTelegramAlert}
              />
            )}

            {activeTab === 'setup' && selectedSignal && (
              <SetupDetailView
                signal={selectedSignal}
                onBackToScanner={() => setActiveTab('scanner')}
                onRequestAIReport={handleRequestAIReport}
                onSendTelegramAlert={handleSendTelegramAlert}
                onCompareAsset={handleCompareAsset}
              />
            )}

            {activeTab === 'ai-committee' && selectedSignal && (
              <AICommitteeView
                signals={signals}
                selectedSignal={selectedSignal}
                onSelectSignal={setSelectedSignal}
                onSendTelegramAlert={handleSendTelegramAlert}
              />
            )}

            {activeTab === 'comparison' && (
              <ComparisonView
                signals={signals}
                onInspectSetup={handleInspectSetup}
                onRequestAIReport={handleRequestAIReport}
              />
            )}

            {activeTab === 'whale-radar' && (
              <WhaleRadarView
                whaleTxs={whaleTxs}
                onSelectCoin={sym => {
                  const match = signals.find(s => s.symbol === sym);
                  if (match) handleInspectSetup(match);
                }}
              />
            )}

            {activeTab === 'derivatives' && (
              <DerivativesView
                signals={signals}
                onSelectSignal={setSelectedSignal}
              />
            )}

            {activeTab === 'rotation' && (
              <RotationView
                onSelectCategory={cat => {
                  setActiveTab('scanner');
                }}
              />
            )}

            {activeTab === 'backtest' && (
              <BacktestView />
            )}

            {activeTab === 'telegram-hub' && (
              <TelegramHubView
                signals={signals}
                onSelectSignal={setSelectedSignal}
              />
            )}

            {activeTab === 'providers' && (
              <ProviderHealthView />
            )}
          </div>
        )}
      </main>

      {/* Institutional Status Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-3 px-4 text-xs font-mono text-slate-500 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span>CRYPTO INTELLIGENCE SYSTEM v2.4</span>
          <span>•</span>
          <span className="text-slate-400">Deterministic Confluence &amp; AI Committee</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-emerald-400">Strict Structure-Based SL/TP</span>
          <span>•</span>
          <span className="text-cyan-400">Non-Autonomous Research Mode</span>
        </div>
      </footer>
    </div>
  );
}
