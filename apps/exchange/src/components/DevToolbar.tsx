import React, { useState } from 'react';
import type { MockScenario } from '@cex/contracts/mocks';
import { isMockMode } from '../services/api.ts';
import { useMarket } from '../context/MarketContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { Button, Badge } from '@cex/ui';

export const DevToolbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentScenario, setCurrentScenario] = useState<MockScenario>('normal');
  const { refreshMarketData, connectionStatus } = useMarket();
  const { refreshUser } = useAuth();

  if (!isMockMode()) return null;

  const handleSetScenario = async (sc: MockScenario) => {
    try {
      const { setMockScenario } = await import('@cex/contracts/mocks');
      setMockScenario(sc);
      setCurrentScenario(sc);
      await Promise.all([refreshMarketData(), refreshUser()]);
    } catch (e) {
      console.error('Failed to change mock scenario', e);
    }
  };

  const scenarios: { key: MockScenario; label: string; desc: string }[] = [
    { key: 'normal', label: 'Bình thường (Normal)', desc: 'Dữ liệu chuẩn, AVAX=STALE, LINK=UNAVAILABLE, SUI=Tắt' },
    { key: 'empty', label: 'Dữ liệu trống (Empty)', desc: 'Không có lệnh chờ, không có lịch sử' },
    { key: 'error', label: 'Lỗi API (500 Error)', desc: 'Mọi API trả về 500 để test ErrorState' },
    { key: 'halted', label: 'Sàn dừng (Halted)', desc: 'Sàn tạm dừng khẩn cấp TRADING_HALTED' },
    { key: 'signedOut', label: 'Chưa đăng nhập (401)', desc: 'Phiên chưa đăng nhập UNAUTHENTICATED' },
    { key: 'unverified', label: 'Chưa xác minh email', desc: 'Chặn nạp/đặt lệnh EMAIL_NOT_VERIFIED' },
  ];

  return (
    <div className="fixed bottom-16 right-4 z-50 flex flex-col items-end">
      {isOpen ? (
        <div className="w-80 bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-default,#272a33)] rounded-[var(--radius-lg,12px)] shadow-2xl p-4 mb-2 text-xs">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-[var(--color-border-subtle,#1e212b)]">
            <div className="flex items-center gap-1.5 font-bold text-[var(--color-text-primary,#f3f4f6)]">
              <span className="w-2 h-2 rounded-full bg-[var(--color-accent-secondary,#67e8f9)] animate-pulse" />
              <span>DEV MOCK SCENARIO TOOLBAR</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-[var(--color-text-muted,#6b7280)] hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center justify-between mb-3 text-[11px] text-[var(--color-text-secondary,#9ca3af)]">
            <span>WebSocket Status:</span>
            <Badge
              variant={connectionStatus === 'open' ? 'success' : connectionStatus === 'connecting' ? 'warning' : 'error'}
              size="sm"
            >
              {connectionStatus.toUpperCase()}
            </Badge>
          </div>

          <div className="flex flex-col gap-1.5">
            {scenarios.map((sc) => {
              const isSelected = currentScenario === sc.key;
              return (
                <button
                  key={sc.key}
                  onClick={() => handleSetScenario(sc.key)}
                  className={`flex flex-col text-left p-2 rounded-[var(--radius-sm,4px)] border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[var(--color-accent-primary,#818cf8)] bg-[var(--color-accent-primary,#818cf8)]/10 text-[var(--color-text-primary,#f3f4f6)]'
                      : 'border-transparent hover:bg-[var(--color-bg-elevated,#1b1e27)] text-[var(--color-text-secondary,#9ca3af)]'
                  }`}
                >
                  <div className="font-semibold flex items-center justify-between">
                    <span>{sc.label}</span>
                    {isSelected && <span className="text-[var(--color-accent-primary,#818cf8)]">✓</span>}
                  </div>
                  <span className="text-[10px] text-[var(--color-text-muted,#6b7280)] mt-0.5">
                    {sc.desc}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Test Mock Price Changes (Milestone 3 of GD2) */}
          <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle,#1e212b)]">
            <span className="font-bold text-[10px] text-[var(--color-text-primary,#f3f4f6)] block mb-1.5">
              TEST GIÁ (KÍCH HOẠT STOP / TP / SL / ALERT)
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={async () => {
                  const { setMockPrice } = await import('@cex/contracts/mocks');
                  setMockPrice('BTCUSDT', 70000);
                  refreshMarketData();
                }}
                className="p-1.5 rounded bg-[var(--color-buy,#22c55e)]/10 text-[var(--color-buy,#22c55e)] border border-[var(--color-buy,#22c55e)]/30 hover:bg-[var(--color-buy,#22c55e)]/20 text-[10px] font-bold"
              >
                BTC +3% (70,000)
              </button>
              <button
                onClick={async () => {
                  const { setMockPrice } = await import('@cex/contracts/mocks');
                  setMockPrice('BTCUSDT', 65000);
                  refreshMarketData();
                }}
                className="p-1.5 rounded bg-[var(--color-sell,#f87171)]/10 text-[var(--color-sell,#f87171)] border border-[var(--color-sell,#f87171)]/30 hover:bg-[var(--color-sell,#f87171)]/20 text-[10px] font-bold"
              >
                BTC −3% (65,000)
              </button>
              <button
                onClick={async () => {
                  const { setMockPrice } = await import('@cex/contracts/mocks');
                  setMockPrice('BTCUSDT', 75000);
                  refreshMarketData();
                }}
                className="p-1.5 rounded bg-[var(--accent,#818cf8)]/10 text-[var(--accent,#818cf8)] border border-[var(--accent,#818cf8)]/30 hover:bg-[var(--accent,#818cf8)]/20 text-[10px] font-bold"
              >
                Chạm TP (75,000)
              </button>
              <button
                onClick={async () => {
                  const { setMockPrice } = await import('@cex/contracts/mocks');
                  setMockPrice('BTCUSDT', 60000);
                  refreshMarketData();
                }}
                className="p-1.5 rounded bg-[var(--down,#f2475f)]/10 text-[var(--down,#f2475f)] border border-[var(--down,#f2475f)]/30 hover:bg-[var(--down,#f2475f)]/20 text-[10px] font-bold"
              >
                Chạm SL (60,000)
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Button
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="shadow-xl bg-[var(--color-bg-elevated,#1b1e27)] border border-[var(--color-accent-primary,#818cf8)] text-[var(--color-accent-secondary,#67e8f9)] font-mono text-xs"
      >
        🛠 MOCK: {currentScenario.toUpperCase()}
      </Button>
    </div>
  );
};
