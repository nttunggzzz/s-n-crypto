import { defineConfig } from 'vitest/config';

// Pure package tests (packages/*) without the embedded Postgres of vitest.config.ts, so several
// worktrees/agents can run them at the same time (the test database port 5434 is shared).
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
