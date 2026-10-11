import { describe, expect, it } from 'vitest';
import { memoryUsageMb } from './memoryLog.ts';

describe('memory log (O1)', () => {
  it('reports MB with one decimal', () => {
    const MB = 1024 * 1024;
    expect(memoryUsageMb({ rss: 248.26 * MB, heapUsed: 100 * MB, heapTotal: 150.04 * MB, external: 0.5 * MB, arrayBuffers: 0 })).toEqual({
      rssMb: 248.3,
      heapUsedMb: 100,
      heapTotalMb: 150,
      externalMb: 0.5,
    });
  });
});
