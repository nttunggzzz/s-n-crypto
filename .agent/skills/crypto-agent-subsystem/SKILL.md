---
name: crypto-agent-subsystem
description: Integrate, observe, and test the CEX crypto-native multi-agent market analysis subsystem in the Antigravity UI workspace (apps/exchange, apps/admin, packages/ui) using @cex/contracts analysis schemas (CryptoMarketAnalysisReport, DepartmentFinding, BullBearDebateResult, RiskExecutionReview, AdvisoryTradeProposal, BacktestEvaluationSummary). Use when building or auditing agent observability panels, department confidence/evidence cards, Bull/Bear debate views, risk sizing ladders, REVIEW/STALE UI states, or testing multi-agent advisory workflows in the frontend.
---

# Crypto Agent Subsystem — Antigravity Frontend Integration, Observability & UI State Guide

## 1. Purpose
Guide Antigravity agents (`contracts-integrator`, `ui-craftsman`, `quant-advisor`, `anti-ai-auditor`, `e2e-sync-tester`) when connecting the CEX frontend (`apps/exchange`, `apps/admin`) to the Crypto-Native Multi-Agent Market Analysis Subsystem (`packages/contracts/src/analysis.ts` and `server/src/modules/analysis/`).

## 2. When to use
- Rendering `CryptoMarketAnalysisReport` or `BacktestEvaluationSummary` in `apps/exchange` (e.g., AI Quant Advisory drawer, Bot Strategy Analyzer) or `apps/admin` (Agent Observability & Risk Telemetry).
- Displaying the 7 department findings (`technical_quant`, `order_flow_microstructure`, `derivatives_positioning`, `crypto_fundamentals_sentiment`, `bull_bear_debate`, `risk_execution_review`, `final_synthesis`).
- Rendering `OBSERVED` vs `INFERRED` evidence badges, `InvalidationCondition` triggers, the 5-step `PositionSizingLadderOutput`, and the `REVIEW` sentinel state.
- Writing component or Playwright tests for multi-agent advisory states.

**Do not use when:** modifying backend ledger or order matching (`server/src/modules/exchange/`).

## 3. Shared Contracts (`@cex/contracts`)
All multi-agent analysis payloads are strictly typed in `packages/contracts/src/analysis.ts`:
- `CryptoMarketAnalysisReport`:
  - `rating`: `'BUY' | 'OVERWEIGHT' | 'HOLD' | 'UNDERWEIGHT' | 'SELL' | 'REVIEW'`
  - `confidence`: `DecimalString` (`"0.00"` .. `"1.00"`)
  - `uncertaintyScore`: `DecimalString` (`"0.00"` .. `"1.00"`) + `uncertaintyReasons: string[]`
  - `departmentFindings`: `DepartmentFinding[]` (each has `status: 'OK' | 'DEGRADED' | 'FAILED' | 'UNAVAILABLE'`, `stance: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'ABSTAIN'`, `score`, `confidence`, `metrics`, `evidence`, `riskFlags`, `missingData`)
  - `debate`: `BullBearDebateResult` (`rounds`, `bullThesis`, `bearThesis`, `independentChallenge`, `unresolvedRisks`, `consensusTilt`, `debateConvictionScore`)
  - `riskReview`: `RiskExecutionReview` (`approved`, `vetoReasons`, `circuitBreakerStatus`, `circuitBreakerMultiplier`, `estimatedSlippageBps`, `liquidationBufferBps`, `sizingLadder`)
  - `invalidationConditions`: `InvalidationCondition[]`
  - `advisoryProposal`: `AdvisoryTradeProposal` (`advisoryOnly: true`, `liveExecutionEnabled: false`, `action`, `entryPrice`, `stopLossPrice`, `takeProfitPrice`, `recommendedQuantity`, `recommendedNotionalUsdt`)
  - `audit`: `AnalysisAuditMetadata` (`upstreamCommit: "1394a3f72aa4393e1a98f51b382434c4b4c2d972"`, `snapshotHash`, `portfolioFingerprint`, `runSignature`)

## 4. Honest UI States & Observability Rules

### A. Non-Tradeable `REVIEW` Sentinel & Stale Data States
1. **`rating === 'REVIEW'` or `riskReview.approved === false`**:
   - Never display a green/red "Execute Trade" CTA when `rating === 'REVIEW'`.
   - Render an honest warning banner showing `riskReview.vetoReasons` and `uncertaintyReasons`.
   - Pre-fill or copy-to-order-ticket buttons must be **disabled** whenever `rating === 'REVIEW'`, `advisoryProposal.action === 'NO_TRADE'`, or `spotTradeBlock` / `futuresTradeBlock` is active.
2. **Department Status Badges (`OK` | `DEGRADED` | `FAILED` | `UNAVAILABLE`)**:
   - When a department has `status === 'UNAVAILABLE'` (e.g., `derivatives_positioning` or `crypto_fundamentals_sentiment` when no feed is connected), render `"— (Chưa kết nối dữ liệu)"` rather than `0` or fake gauges.
3. **`OBSERVED` vs `INFERRED` Evidence Separation**:
   - Visually distinguish `EvidenceItem.kind === 'OBSERVED'` (verified candle/book/funding metrics with timestamp and source) from `EvidenceItem.kind === 'INFERRED'` (regime classification or thesis conclusion).

### B. Advisory-Only Execution Separation
- The subsystem enforces `advisoryOnly: true` and `liveExecutionEnabled: false`.
- If the UI provides a *"Điền vào khung đặt lệnh"* (Copy to Order Form) helper, it may only populate the user's Spot/Futures order form inputs (`price`, `quantity`, `stopPrice`) so the user can review and submit manually. It must **never** auto-submit an order on arrival of an analysis report.

### C. Decimal Formatting (`decimal-money-safety`)
- Never apply `parseFloat` or arithmetic in the frontend to recalculate `recommendedQuantity`, `recommendedNotionalUsdt`, or `sizingLadder` steps. Display the authoritative `DecimalString` values from `CryptoMarketAnalysisReport` via `@cex/contracts` formatting helpers (`formatPrice`, `formatQuantity`, `formatUsdt`).

### D. Profitability Disclaimer on Backtest Panels
- Whenever rendering `BacktestEvaluationSummary`, always display `summary.profitabilityDisclaimer`, `deflatedSharpeRatio`, `probabilityOfBacktestOverfitting`, and the fee/slippage/funding breakdown (`totalFeesPaidUsdt`, `totalSlippageCostUsdt`, `totalFundingPaidUsdt`). Never present backtest returns or AI confidence scores as guaranteed future returns.

## 5. Verification Commands
```bash
# Run core, contract, and multi-agent subsystem tests
node infra/test-all.mjs quant.test.ts analysis.test.ts

# Run local CLI analysis & walk-forward demo
npx tsx server/src/modules/analysis/cli.ts

# Check UI anti-AI design rules when building UI panels
node ui/.agent/skills/avoid-ai-design/scripts/detect.mjs ui/apps/exchange/src
```
