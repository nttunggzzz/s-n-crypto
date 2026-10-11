import { logger } from '../logger.ts';

/**
 * Process memory in the log every 10 minutes (O1): a slow leak shows up as a rising `rssMb` / `heapUsedMb`
 * over hours, before the process dies of it. Not started under tests.
 */
export function memoryUsageMb(m: NodeJS.MemoryUsage = process.memoryUsage()) {
  const mb = (bytes: number) => Math.round(bytes / 104_857.6) / 10; // one decimal
  return { rssMb: mb(m.rss), heapUsedMb: mb(m.heapUsed), heapTotalMb: mb(m.heapTotal), externalMb: mb(m.external) };
}

/** Starts the periodic memory line; returns the function that stops it. */
export function startMemoryLog(everyMs = 10 * 60_000): () => void {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return () => {};
  const timer = setInterval(() => logger.info(memoryUsageMb(), 'memory'), everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
