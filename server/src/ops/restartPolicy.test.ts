import { describe, expect, it } from 'vitest';
import { describeExit, formatUptime, HEALTHY_RUN_MS, nextRestart } from './restartPolicy.ts';

describe('host restart policy (O1)', () => {
  it('backs off 5 s → 30 s → 2 min, then stays at 2 min while the server keeps dying', () => {
    let streak = 0;
    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = nextRestart(streak, 20_000);
      streak = r.streak;
      delays.push(r.delayMs);
    }
    expect(delays).toEqual([5_000, 30_000, 120_000, 120_000, 120_000]);
    expect(streak).toBe(5);
  });

  it('a run of 10 minutes or more was healthy: the next crash starts over at 5 s', () => {
    expect(nextRestart(4, HEALTHY_RUN_MS)).toEqual({ streak: 1, delayMs: 5_000 });
    expect(nextRestart(4, HEALTHY_RUN_MS - 1)).toEqual({ streak: 5, delayMs: 120_000 });
    expect(nextRestart(0, 0)).toEqual({ streak: 1, delayMs: 5_000 });
  });

  it('exit codes: Windows NTSTATUS in hex, signals by name', () => {
    expect(describeExit(3221226505, null)).toBe('3221226505 = 0xC0000409');
    expect(describeExit(-1073740791, null)).toBe('-1073740791 = 0xC0000409');
    expect(describeExit(1, null)).toBe('1');
    expect(describeExit(null, 'SIGKILL')).toBe('signal SIGKILL');
    expect(describeExit(null, null)).toBe('no exit code');
  });

  it('uptime text', () => {
    expect(formatUptime(45_900)).toBe('45s');
    expect(formatUptime(12 * 60_000 + 5_000)).toBe('12m');
    expect(formatUptime(3 * 3_600_000 + 5 * 60_000)).toBe('3h05m');
  });
});
