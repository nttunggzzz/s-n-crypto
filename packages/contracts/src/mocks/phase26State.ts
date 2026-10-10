/** ⚠️ MOCK state for phase 2.6 (profile/security, DCA, grid bots) — UI development only. */
import type { AvatarId, DcaPlan, DcaRun, GridBot, LoginEvent } from '../index.ts';

export interface MockPhase26State {
  avatar: AvatarId | null;
  name: string;
  antiPhishing: string | null;
  logins: LoginEvent[];
  dca: DcaPlan[];
  dcaRuns: DcaRun[];
  /** spare = investment not in an order; finalValue = value when stopped (like the server). */
  grids: (GridBot & { levels: number[]; orderIds: string[]; spare: number; finalValue: number | null })[];
}

export function initialPhase26State(isEmpty = false): MockPhase26State {
  const t = Date.parse('2026-10-09T03:00:00.000Z');
  const logins: LoginEvent[] = [
    { id: '3', at: new Date(t).toISOString(), ip: '113.161.2.10', device: 'Chrome · Windows', success: true, result: 'OK', newDevice: false },
    { id: '2', at: new Date(t - 3 * 3600_000).toISOString(), ip: '27.72.100.5', device: 'Safari · iOS', success: true, result: 'OK', newDevice: true },
    { id: '1', at: new Date(t - 3 * 3600_000 - 60_000).toISOString(), ip: '27.72.100.5', device: 'Safari · iOS', success: false, result: 'BAD_PASSWORD', newDevice: false },
  ];
  const dca: DcaPlan[] = isEmpty
    ? []
    : [
        { id: '301', symbol: 'BTCUSDT', quoteAmount: '50.00000000', interval: 'WEEKLY', hour: 9, dayOfWeek: 1, dayOfMonth: null, status: 'ACTIVE', nextRunAt: '2026-10-12T02:00:00.000Z', lastRunAt: '2026-10-05T02:00:00.000Z', runs: 4, skipped: 1, totalSpent: '200.00000000', totalBought: '0.00250121', avgPrice: '79961.30', createdAt: '2026-09-07T02:00:00.000Z' },
        { id: '302', symbol: 'ETHUSDT', quoteAmount: '20.00000000', interval: 'DAILY', hour: 21, dayOfWeek: null, dayOfMonth: null, status: 'PAUSED', nextRunAt: null, lastRunAt: '2026-10-08T14:00:00.000Z', runs: 12, skipped: 0, totalSpent: '240.00000000', totalBought: '0.09720000', avgPrice: '2469.14', createdAt: '2026-09-26T14:00:00.000Z' },
      ];
  const dcaRuns: DcaRun[] = isEmpty
    ? []
    : [
        { id: '4004', planId: '301', scheduledAt: '2026-10-05T02:00:00.000Z', executedAt: '2026-10-05T02:00:01.000Z', status: 'FILLED', orderId: '88', quoteSpent: '50.00000000', baseBought: '0.00062430', price: '80089.00', reason: null },
        { id: '4003', planId: '301', scheduledAt: '2026-09-28T02:00:00.000Z', executedAt: null, status: 'SKIPPED', orderId: null, quoteSpent: '0.00000000', baseBought: '0.00000000', price: null, reason: 'INSUFFICIENT_BALANCE' },
      ];
  return { avatar: 'fox', name: 'Người dùng demo', antiPhishing: null, logins: isEmpty ? logins.slice(0, 1) : logins, dca, dcaRuns, grids: [] };
}

