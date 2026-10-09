import React, { useState } from 'react';
import {
  Bell,
  Bot,
  CheckCircle2,
  ChevronRight,
  Copy,
  Flame,
  Radio,
  Send,
  ShieldCheck,
  Terminal,
  Zap
} from 'lucide-react';
import { SetupSignal } from '../types/crypto';

interface TelegramHubViewProps {
  signals: SetupSignal[];
  onSelectSignal: (signal: SetupSignal) => void;
}

export const TelegramHubView: React.FC<TelegramHubViewProps> = ({
  signals,
  onSelectSignal
}) => {
  const [botToken, setBotToken] = useState<string>('');
  const [chatId, setChatId] = useState<string>('');
  const [selectedSignalId, setSelectedSignalId] = useState<string>(signals[0]?.id || '');
  const [commandInput, setCommandInput] = useState<string>('/scan');
  const [terminalLogs, setTerminalLogs] = useState<Array<{ sender: 'user' | 'bot'; text: string; time: string }>>([
    {
      sender: 'bot',
      text: '🤖 <b>Crypto Intelligence Bot Online</b>\nType <code>/help</code> or <code>/scan</code> to interact with the engine.',
      time: new Date().toLocaleTimeString()
    }
  ]);
  const [sendingAlert, setSendingAlert] = useState<boolean>(false);
  const [alertStatus, setAlertStatus] = useState<string | null>(null);

  const activeSignal = signals.find(s => s.id === selectedSignalId) || signals[0];

  const handleSendCommand = async (cmd: string = commandInput) => {
    if (!cmd.trim()) return;
    const userMsg = { sender: 'user' as const, text: cmd, time: new Date().toLocaleTimeString() };
    setTerminalLogs(prev => [...prev, userMsg]);
    setCommandInput('');

    try {
      const res = await fetch('/api/telegram/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      });
      if (res.ok) {
        const data = await res.json();
        setTerminalLogs(prev => [
          ...prev,
          { sender: 'bot', text: data.response, time: new Date().toLocaleTimeString() }
        ]);
      }
    } catch (e) {
      setTerminalLogs(prev => [
        ...prev,
        { sender: 'bot', text: '❌ Failed to execute bot command.', time: new Date().toLocaleTimeString() }
      ]);
    }
  };

  const sendSelectedAlert = async () => {
    if (!activeSignal) return;
    setSendingAlert(true);
    setAlertStatus(null);
    try {
      const res = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal: activeSignal,
          config: {
            botToken: botToken || undefined,
            chatId: chatId || undefined,
            simulationMode: !botToken
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        setAlertStatus(`✓ Alert successfully broadcast to ${data.destination} [Message ID: ${data.messageId}]`);
        setTerminalLogs(prev => [
          ...prev,
          {
            sender: 'bot',
            text: `📢 <b>ALERT BROADCASTED:</b>\n${data.formattedText}`,
            time: new Date().toLocaleTimeString()
          }
        ]);
      } else {
        setAlertStatus(`⚠️ Delivery notice: ${data.error || 'Check Bot Token permissions'}`);
      }
    } catch (e: any) {
      setAlertStatus(`Error: ${e?.message}`);
    } finally {
      setSendingAlert(false);
    }
  };

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Top Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              Telegram Notification &amp; Interactive Bot Hub
            </h2>
            <p className="text-slate-400 font-sans text-xs">
              Primary operational interface for instant confluence setup alerts and interactive querying.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-[11px] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>TELEGRAM BOT ENGINE ACTIVE</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 Cols): Alert Dispatcher & Real Bot Config */}
        <div className="lg:col-span-5 space-y-4">
          {/* Signal Dispatcher Box */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Send className="w-4 h-4 text-cyan-400" />
              <span>Broadcast Signal Setup Alert</span>
            </h3>

            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-slate-400 text-[11px]">Select Setup to Broadcast:</label>
                <select
                  value={selectedSignalId}
                  onChange={e => setSelectedSignalId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-bold focus:outline-hidden"
                >
                  {signals.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.symbol} (${s.currentPrice}) — Score {s.scores.totalConfluenceScore}/100 [{s.status}]
                    </option>
                  ))}
                </select>
              </div>

              {activeSignal && (
                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Direction:</span>
                    <strong className="text-emerald-400">{activeSignal.direction}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Entry Zone:</span>
                    <strong className="text-cyan-300">${activeSignal.risk.entryZone[0]} – ${activeSignal.risk.entryZone[1]}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Stop Loss:</span>
                    <strong className="text-rose-400">${activeSignal.risk.stopLossPrice} (-{activeSignal.risk.stopLossPercent}%)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Take Profit 2:</span>
                    <strong className="text-emerald-300">${activeSignal.risk.takeProfit2} (+{activeSignal.risk.takeProfit2Percent}%)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Risk/Reward:</span>
                    <strong className="text-emerald-400">1:{activeSignal.risk.riskRewardRatio}</strong>
                  </div>
                </div>
              )}

              <button
                onClick={sendSelectedAlert}
                disabled={sendingAlert}
                className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Send className="w-4 h-4 fill-current" />
                <span>{sendingAlert ? 'Broadcasting...' : 'Broadcast to Telegram'}</span>
              </button>

              {alertStatus && (
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
                  {alertStatus}
                </div>
              )}
            </div>
          </div>

          {/* Real Telegram Webhook / Credentials (Optional) */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              <span>Real Bot Webhook Settings (Optional)</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Leave blank to use the built-in Interactive Telegram Terminal Simulator.
            </p>

            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-slate-400 uppercase">Telegram Bot Token (from @BotFather)</label>
                <input
                  type="password"
                  placeholder="e.g. 123456789:ABCdefGHIjklMNO..."
                  value={botToken}
                  onChange={e => setBotToken(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 placeholder:text-slate-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase">Telegram Chat ID / Channel ID</label>
                <input
                  type="text"
                  placeholder="e.g. -100123456789 or @channel_name"
                  value={chatId}
                  onChange={e => setChatId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 placeholder:text-slate-600 focus:outline-hidden"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (7 Cols): Interactive Bot Terminal Emulator */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-slate-950 border border-slate-800 rounded-xl flex flex-col h-[560px] overflow-hidden shadow-xl">
            {/* Terminal Header */}
            <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-slate-200 text-xs">TELEGRAM INTERACTIVE TERMINAL EMULATOR</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Ready for commands</span>
              </div>
            </div>

            {/* Quick Command Toolbar */}
            <div className="px-3 py-1.5 bg-slate-900/60 border-b border-slate-800 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-500">Quick:</span>
              {['/scan', '/market', '/whale', '/funding', '/rotation', '/setup LINK', '/help'].map(cmd => (
                <button
                  key={cmd}
                  onClick={() => handleSendCommand(cmd)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition cursor-pointer"
                >
                  {cmd}
                </button>
              ))}
            </div>

            {/* Terminal Message Stream */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 font-mono">
              {terminalLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${log.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className="text-[10px] text-slate-500 mb-0.5">
                    {log.sender === 'user' ? 'You' : 'Crypto Intel Bot'} • {log.time}
                  </div>
                  <div
                    className={`p-3 rounded-xl max-w-[90%] text-xs whitespace-pre-wrap leading-relaxed ${
                      log.sender === 'user'
                        ? 'bg-cyan-950 text-cyan-200 border border-cyan-800'
                        : 'bg-slate-900 text-slate-200 border border-slate-800'
                    }`}
                    dangerouslySetInnerHTML={{ __html: log.text }}
                  />
                </div>
              ))}
            </div>

            {/* Terminal Input Bar */}
            <form
              onSubmit={e => {
                e.preventDefault();
                handleSendCommand();
              }}
              className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Type command, e.g. /setup LINK or /scan..."
                value={commandInput}
                onChange={e => setCommandInput(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 text-xs placeholder:text-slate-500 focus:outline-hidden focus:border-cyan-500/60"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg transition cursor-pointer"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
