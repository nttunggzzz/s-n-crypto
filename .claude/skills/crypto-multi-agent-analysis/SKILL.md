---
name: crypto-multi-agent-analysis
description: Audit, extend, and verify the CEX crypto-native multi-agent market analysis and walk-forward backtesting subsystem across packages/core/src/quant.ts, packages/contracts/src/analysis.ts, and server/src/modules/analysis (7 departments, point-in-time snapshot clamping, Decimal math, 5-step position sizing ladder, circuit breakers, and DSR/PBO walk-forward evaluation). Use when modifying or reviewing agent departments, quant indicators, risk vetoes, look-ahead guards, or backtester friction ("multi-agent", "TradingAgents", "phân tích đa tác tử", "backtest walk-forward", "position sizing ladder", "department agent"). Not for live order matching (use ledger-order-concurrency) or frontend visual styling (use ui-branch-review).
---

# Crypto Multi-Agent Market Analysis — Quant, Risk, Security & Evaluation Guide

Notation: **[AUTO]** verified by test/script · **[MANUAL]** requires code inspection · **[INVARIANT]** non-negotiable safety rule.

## 1. Purpose
Provide a repository-verified workflow for maintaining and auditing the crypto-native multi-agent analysis subsystem adapted from `TauricResearch/TradingAgents` (`v0.6.0`, commit `1394a3f72aa4393e1a98f51b382434c4b4c2d972`, Apache-2.0). Ensures point-in-time data integrity, `@cex/core` `Dec` precision, strict separation between analysis and order execution, and realistic walk-forward evaluation with fees, slippage, funding, and liquidity constraints.

## 2. When to use
- Adding or modifying quant indicators or risk calculators in `packages/core/src/quant.ts`.
- Updating analysis or backtesting schemas in `packages/contracts/src/analysis.ts`.
- Changing any of the 7 department agents, the orchestrator, the LLM retry/fallback adapter, the point-in-time memory log, or the walk-forward backtester under `server/src/modules/analysis/`.
- Auditing strategies or agent outputs for look-ahead bias, numeric confabulation, stale-feed execution, or backtest overfitting (DSR, PBO).

**Do not use when:** editing live order matching or balance locking in `server/src/modules/exchange/` (use `ledger-order-concurrency`), auditing WebSocket feed ingestion in `server/src/modules/market/binance.ts` (use `realtime-market-data-qa`), or reviewing React UI components in `ui/apps/` (use `ui-branch-review`).

## 3. Scope and non-goals
- **In scope:** `packages/core/src/quant.ts`, `packages/contracts/src/analysis.ts`, `server/src/modules/analysis/`, and `docs/architecture/crypto-trading-agents.md`.
- **Non-goals:** Enabling autonomous live trading, calling `OrderService.placeOrder` or `applyBalanceChanges` from analysis modules, or introducing paid data/LLM credentials without explicit user approval.

## 4. Required context
| Component | Path | Role |
|---|---|---|
| Quant & Risk Calculators | `packages/core/src/quant.ts` | Closed-bar indicators, L2 slippage (`walkBook`), perp basis/funding/OI regime, NVT/MVRV/netflow, 6-factor regime, 5-step sizing ladder, VaR/CVaR, circuit breakers |
| Shared Zod Contracts | `packages/contracts/src/analysis.ts` | `CryptoMarketSnapshot`, `DepartmentFinding`, `EvidenceItem` (`OBSERVED` vs `INFERRED`), `RiskExecutionReview`, `AdvisoryTradeProposal`, `CryptoMarketAnalysisReport`, `BacktestEvaluationSummary` |
| Point-in-Time Snapshot Builder | `server/src/modules/analysis/snapshotBuilder.ts` | Strips unclosed candles (`closed !== true`) and future items (`> asOfMs`), checks staleness lag, computes SHA-256 `snapshotHash` and portfolio `fingerprint` |
| Resilient LLM Adapter | `server/src/modules/analysis/llmAdapter.ts` | Vendor-neutral narrative adapter with retry, 429 rate-limit backoff, timeout, reconnect, and zero-key `DeterministicQuantNarrator` fallback |
| Point-in-Time Memory Log | `server/src/modules/analysis/memoryLog.ts` | 24/7 UTC millisecond episode settlement; `getSettledLessonsAsOf` withholds outcomes where `resolvedAtMs > asOfMs` |
| 7 Department Agents | `server/src/modules/analysis/departments/` | `technicalQuantAgent.ts`, `orderFlowAgent.ts`, `derivativesAgent.ts`, `fundamentalsSentimentAgent.ts`, `bullBearDebateAgent.ts`, `riskExecutionAgent.ts`, `finalSynthesisAgent.ts` |
| Orchestrator & Backtester | `server/src/modules/analysis/orchestrator.ts`, `server/src/modules/analysis/backtester.ts` | Fault-isolated 7-department pipeline + `runWalkForwardBacktest` with next-bar open fills, fees, slippage, 8h funding, volume caps, DSR, and PBO |
| Architecture Documentation | `docs/architecture/crypto-trading-agents.md` | Pinned upstream revision, stock-to-crypto replacement table, data flow, and CLI commands |

## 5. Workflow

**Step 1 — Inspect contracts & decimal rules before editing.**
Read `packages/contracts/src/analysis.ts` and `packages/core/src/quant.ts`. Verify that all monetary, price, quantity, fee, funding, and sizing calculations use `Dec` from `packages/core/src/decimal.ts` (`roundUp` for fees/slippage charged, `roundDown` for payouts, `floorSigned` for PnL/funding, `floorToStep` for quantities).

**Step 2 — Verify point-in-time and freshness guards.**
Confirm in `server/src/modules/analysis/snapshotBuilder.ts` that:
1. Only candles with `closed === true` and `closeTime <= asOfMs` enter `spot.closedCandles`.
2. Trades (`time > asOfMs`), headlines (`publishedAt > asOfMs`), and on-chain snapshots (`observedAtMs > asOfMs`) are filtered and counted in `timestampAlignment.lookaheadItemsFiltered`.
3. `PointInTimeMemoryLog.getSettledLessonsAsOf` in `server/src/modules/analysis/memoryLog.ts` filters `resolvedAtMs <= asOfMs`.

**Step 3 — Verify department separation & non-fabrication.**
Each department in `server/src/modules/analysis/departments/` must only read its designated domain slice and emit `status: 'UNAVAILABLE'`, `stance: 'ABSTAIN'`, and `DATA_UNAVAILABLE` summary when its feed is missing or disconnected. Every `EvidenceItem` must tag `kind: 'OBSERVED'` (raw/calculated data) or `kind: 'INFERRED'` (regime/thesis conclusion).

**Step 4 — Verify risk vetoes & execution isolation.**
In `server/src/modules/analysis/departments/riskExecutionAgent.ts` and `server/src/modules/analysis/departments/finalSynthesisAgent.ts`:
- `AdvisoryTradeProposal` must keep `advisoryOnly: true` and `liveExecutionEnabled: false`.
- Final rating must be `REVIEW` (`action: 'NO_TRADE'`, `recommendedQuantity: '0.00000000'`) whenever `spotDataStatus !== 'LIVE'`, `!timestampAlignment.aligned`, a core department (`technical_quant` or `order_flow_microstructure`) fails, or circuit breakers (`evaluateCircuitBreakersDec`) are in `CRITICAL` or `EMERGENCY`.

**Step 5 — Run validation suites.**
```bash
node infra/test-all.mjs quant.test.ts analysis.test.ts
npm run typecheck
node .claude/skills/cex-contract-first-api/scripts/check-contract-drift.mjs
node .claude/skills/cex-skills-maintenance/scripts/validate-skills.mjs
```

## 6. Project-specific rules
| Rule | Enforcement | Level |
|---|---|---|
| Authoritative math uses `@cex/core` `Dec`, never JS `number` | `packages/core/src/quant.test.ts` | [AUTO] |
| Unclosed candles and timestamps after `asOfMs` are stripped | `server/src/modules/analysis/analysis.test.ts` | [AUTO] |
| `AdvisoryTradeProposal` has `advisoryOnly: true` and `liveExecutionEnabled: false` | `packages/contracts/src/analysis.ts` | [INVARIANT] |
| `STALE`/`UNAVAILABLE` data or core department failure routes rating to `REVIEW` | `server/src/modules/analysis/analysis.test.ts` | [AUTO] |
| Backtester fills at `bar[t+1].open` and deducts fees, L2 slippage, and 8h funding | `server/src/modules/analysis/backtester.ts` | [AUTO] |
| Never claim live profitability from backtests or AI confidence scores | `BacktestEvaluationSummary.profitabilityDisclaimer` | [INVARIANT] |

## 7. Anti-patterns
- Computing RSI, ATR, or MACD on an unclosed in-progress candle (`closed: false`), causing intrabar repainting and look-ahead bias.
- Filling backtest trades at the same bar close (`bar[t].close`) that generated the signal instead of `bar[t+1].open`.
- Allowing an LLM prompt to invent prices, funding rates, or on-chain metrics when `derivatives` or `onChainAndMacro` is `null`.
- Using full Kelly sizing instead of capped Fractional Kelly (`kellyMultiplier <= 0.50`, default `0.25`) inside `computePositionSizingLadder`.
- Calling `OrderService` or mutating user balances from `server/src/modules/analysis/`.
- Modifying existing lines in `packages/core/src/decimal.ts` or `packages/contracts/src/endpoints.ts` in ways that break `validate-skills.mjs` or the 128-endpoint UI coverage check.

## 8. Verification checklist
- [ ] `node infra/test-all.mjs quant.test.ts analysis.test.ts` passes 100% of tests.
- [ ] `npx tsx server/src/modules/analysis/cli.ts` runs cleanly without external API keys.
- [ ] `npm run typecheck` and `npm run lint` pass with 0 errors.
- [ ] `node .claude/skills/cex-contract-first-api/scripts/check-contract-drift.mjs` exits 0.
- [ ] `node .claude/skills/cex-skills-maintenance/scripts/validate-skills.mjs` exits 0 with 0 FAIL.

## 9. Evidence and reporting format
```markdown
## Multi-Agent Analysis Audit — <date>
- **Upstream Base**: `TauricResearch/TradingAgents` @ `1394a3f72aa4393e1a98f51b382434c4b4c2d972` (`v0.6.0`, Apache-2.0)
- **Files Modified**: `<list of files>`
- **Point-in-Time & Decimal Checks**: `<PASS/FAIL + details>`
- **Test Results**: `node infra/test-all.mjs quant.test.ts analysis.test.ts` → `<X/X passed>`
- **Disclaimer**: Historical simulation and confidence scores do not guarantee live profitability; live execution remains disabled.
```

## 10. Escalation conditions
- User requests connecting the analysis subsystem to live order placement (`OrderService.placeOrder`) or real exchange API keys.
- User requests adding a paid data provider or external LLM API key to `.env` or production config.
- A proposed change alters `@cex/contracts` `endpoints.ts` endpoint count or requires a breaking contract version bump.
