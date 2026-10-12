import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'server/src/**/*.test.ts', 'infra/*.test.mjs'],
    // DB tests share one embedded Postgres; run files sequentially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    globalSetup: ['server/test/globalSetup.ts'],
  },
});
