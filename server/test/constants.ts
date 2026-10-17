// CEX_TEST_DB_PORT lets several checkouts run `npm test` at the same time (main, agent worktrees, the UI worktree):
// each one needs its own port; the data directory (.pgdata-test) is already per checkout.
export const TEST_DB_PORT = Number(process.env.CEX_TEST_DB_PORT ?? 5434);
export const TEST_DB_URL = `postgres://postgres:postgres@localhost:${TEST_DB_PORT}/cex_test`;
