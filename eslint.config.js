// `npm run lint`. Backend, contracts, core, infra and e2e: errors fail `npm run verify`.
// UI (apps/*, packages/ui): the same base rules plus the "money / data" rules below, as WARNINGS for now
// (reported by verify, not blocking) — they catch the mistakes found in the UI reviews.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/** Patterns that showed up as real bugs in REVIEW-02 / REVIEW-03. */
const dataRules = [
  {
    selector: "LogicalExpression[operator=/^(\\|\\||\\?\\?)$/] > Literal.right[value=/^0(\\.0+)?%?$/]",
    message: 'NULL ≠ 0: missing data must show "—", not 0 (CLAUDE.md invariant 6). Only show 0 when the API says 0.',
  },
  {
    selector: "ConditionalExpression > Literal.alternate[value=/^0(\\.0+)?%?$/]",
    message: 'NULL ≠ 0: the "no data" branch must show "—", not 0.',
  },
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: 'No invented data in the UI (Math.random) — mocks live in @cex/contracts/mocks.',
  },
  {
    selector: "CallExpression[callee.name='fetch']",
    message: 'Call the API through the typed client (getApiClient / createApiClient), never fetch() directly.',
  },
  {
    selector: "NewExpression[callee.name='WebSocket']",
    message: 'Realtime goes through createRealtimeClient (reconnects, re-subscribes, one connection).',
  },
  {
    selector: "CallExpression[callee.property.name='toFixed']",
    message: 'Money/price text: use formatDecimal / formatPrice (tick- and locale-aware), not toFixed on a float.',
  },
];

/** The same rules with every "error" turned into "warn" (UI code: reported, not blocking — yet). */
function asWarnings(configs) {
  const rules = Object.assign({}, ...configs.map((c) => c.rules ?? {}));
  const warn = (v) => (v === 'off' || v === 0 ? v : Array.isArray(v) ? ['warn', ...v.slice(1)] : 'warn');
  return Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, warn(v)]));
}

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'legacy/**', '.e2e/**', 'ui/**', 'host/**', 'host-data/**', '**/*.d.ts', 'server/drizzle/**', 'apps/*/public/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    rules: {
      // UI: report, do not block (yet)
      ...asWarnings([js.configs.recommended, ...tseslint.configs.recommended]),
      'no-empty': ['warn', { allowEmptyCatch: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-restricted-syntax': ['warn', ...dataRules],
    },
  },
  {
    // tests may build fixtures freely
    files: ['**/*.test.ts', 'e2e/**', 'packages/contracts/src/mocks/**', 'packages/contracts/src/fixtures/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
