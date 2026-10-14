// Adapted from TauricResearch/TradingAgents v0.6.0 (commit 1394a3f72aa4393e1a98f51b382434c4b4c2d972, Apache-2.0):
// tradingagents/agents/managers/portfolio_manager.py, tradingagents/agents/rating.py (5-tier rating + REVIEW).
// Modified (deterministic rating from Dec conviction, invalidation conditions, advisory-only proposal). See THIRD_PARTY_NOTICES.md.
import { dec, floorSigned, maxDec, minDec, ZERO } from '@cex/core';
import type {
  AdvisoryTradeProposal,
  BullBearDebateResult,
  CryptoAnalysisRating,
  CryptoMarketSnapshot,
  DepartmentFinding,
  InvalidationCondition,
  RiskExecutionReview,
} from '@cex/contracts';
import type { ResilientLlmAdapter } from '../llmAdapter.ts';

/**
 * Department 7: Final Synthesis Agent
 *
 * Adapted from upstream `portfolio_manager.py` and `rating.py` (#1170):
 * - Produces the 5-tier rating (`BUY`, `OVERWEIGHT`, `HOLD`, `UNDERWEIGHT`, `SELL`) or non-tradeable `REVIEW` sentinel.
 * - Explicitly quantifies `uncertaintyScore` and `uncertaintyReasons`.
 * - Defines concrete `invalidationConditions` (price levels, feed status, microstructure spread).
 * - Emits an `AdvisoryTradeProposal` with `advisoryOnly: true` and `liveExecutionEnabled: false`.
 */
export async function runFinalSynthesisAgent(params: {
  snapshot: CryptoMarketSnapshot;
  analystFindings: DepartmentFinding[];
  debate: BullBearDebateResult;
  riskReview: RiskExecutionReview;
  proposedDirection: 'LONG' | 'SHORT' | 'NONE';
  entryPrice: string | null;
  stopLossPrice: string | null;
  takeProfitPrice: string | null;
  llm: ResilientLlmAdapter;
}): Promise<{
  rating: CryptoAnalysisRating;
  confidence: string;
  uncertaintyScore: string;
  uncertaintyReasons: string[];
  executiveSummary: string;
  invalidationConditions: InvalidationCondition[];
  advisoryProposal: AdvisoryTradeProposal;
  synthesisFinding: DepartmentFinding;
}> {
  const startMs = Date.now();
  const {
    snapshot,
    analystFindings,
    debate,
    riskReview,
    proposedDirection,
    entryPrice,
    stopLossPrice,
    takeProfitPrice,
    llm,
  } = params;
  const department = 'final_synthesis' as const;

  // 1. Collect uncertainty reasons & compute uncertaintyScore (0.00..1.00)
  const uncertaintyReasons: string[] = [];
  let uncertaintyAcc = dec('0.10'); // Baseline market uncertainty

  if (snapshot.spotDataStatus !== 'LIVE') {
    uncertaintyAcc = uncertaintyAcc.add('0.60');
    uncertaintyReasons.push(`Spot market data is ${snapshot.spotDataStatus}.`);
  }
  if (!snapshot.timestampAlignment.aligned) {
    uncertaintyAcc = uncertaintyAcc.add('0.35');
    uncertaintyReasons.push(
      `Snapshot timestamp lag (${snapshot.timestampAlignment.observedMaxLagMs}ms) exceeds ${snapshot.timestampAlignment.maxAllowedStalenessMs}ms.`,
    );
  }
  if (snapshot.timestampAlignment.lookaheadItemsFiltered > 0) {
    uncertaintyReasons.push(
      `Filtered ${snapshot.timestampAlignment.lookaheadItemsFiltered} look-ahead item(s) beyond asOf=${snapshot.asOf}.`,
    );
  }

  const unavailableDepts = analystFindings.filter((f) => f.status === 'UNAVAILABLE' || f.status === 'FAILED');
  if (unavailableDepts.length > 0) {
    uncertaintyAcc = uncertaintyAcc.add(dec(String(unavailableDepts.length)).mul('0.12'));
    uncertaintyReasons.push(
      `${unavailableDepts.length} department(s) unavailable/degraded: ${unavailableDepts.map((d) => d.department).join(', ')}.`,
    );
  }

  for (const r of debate.unresolvedRisks) {
    if (!uncertaintyReasons.includes(r)) {
      uncertaintyReasons.push(r);
    }
  }
  if (debate.unresolvedRisks.length > 0) {
    uncertaintyAcc = uncertaintyAcc.add(minDec(dec('0.25'), dec(String(debate.unresolvedRisks.length)).mul('0.05')));
  }

  const uncertaintyDec = floorSigned(minDec(dec('1.00'), maxDec(ZERO, uncertaintyAcc)), 2);
  const confidenceDec = floorSigned(maxDec(ZERO, dec('1.00').sub(uncertaintyDec)), 2);

  // 2. Determine 5-tier rating or `REVIEW` sentinel (upstream `rating.py` #1170)
  const coreTech = analystFindings.find((f) => f.department === 'technical_quant');
  const coreMicro = analystFindings.find((f) => f.department === 'order_flow_microstructure');
  const coreBroken =
    !coreTech ||
    !coreMicro ||
    coreTech.status === 'UNAVAILABLE' ||
    coreTech.status === 'FAILED' ||
    coreTech.stance === 'ABSTAIN' ||
    coreMicro.status === 'UNAVAILABLE' ||
    coreMicro.status === 'FAILED' ||
    coreMicro.stance === 'ABSTAIN';

  const conviction = dec(debate.debateConvictionScore);
  let rating: CryptoAnalysisRating;

  if (
    snapshot.spotDataStatus !== 'LIVE' ||
    !snapshot.timestampAlignment.aligned ||
    coreBroken ||
    riskReview.circuitBreakerStatus === 'CRITICAL' ||
    riskReview.circuitBreakerStatus === 'EMERGENCY'
  ) {
    rating = 'REVIEW';
  } else if (!riskReview.approved) {
    rating = 'HOLD';
  } else if (conviction.gte(40)) {
    rating = 'BUY';
  } else if (conviction.gte(15)) {
    rating = 'OVERWEIGHT';
  } else if (conviction.lte(-40)) {
    rating = 'SELL';
  } else if (conviction.lte(-15)) {
    rating = 'UNDERWEIGHT';
  } else {
    rating = 'HOLD';
  }

  // 3. Build explicit, machine-verifiable invalidation conditions
  const invalidationConditions: InvalidationCondition[] = [
    {
      id: `${snapshot.snapshotId}-inv-feed`,
      metric: 'spotDataStatus',
      operator: 'STATUS_NOT_LIVE',
      threshold: 'LIVE',
      description: 'Invalidate immediately if spot market data transitions to STALE or UNAVAILABLE.',
    },
  ];

  if (stopLossPrice && (rating === 'BUY' || rating === 'OVERWEIGHT')) {
    invalidationConditions.push({
      id: `${snapshot.snapshotId}-inv-long-stop`,
      metric: 'spot.lastPrice',
      operator: 'LTE',
      threshold: stopLossPrice,
      description: `Bullish thesis invalidated if price trades at or below ATR stop-loss ${stopLossPrice}.`,
    });
  } else if (stopLossPrice && (rating === 'SELL' || rating === 'UNDERWEIGHT')) {
    invalidationConditions.push({
      id: `${snapshot.snapshotId}-inv-short-stop`,
      metric: 'spot.lastPrice',
      operator: 'GTE',
      threshold: stopLossPrice,
      description: `Bearish thesis invalidated if price trades at or above ATR stop-loss ${stopLossPrice}.`,
    });
  }

  invalidationConditions.push({
    id: `${snapshot.snapshotId}-inv-spread`,
    metric: 'orderFlow.spreadBps',
    operator: 'GT',
    threshold: '80.0000',
    description: 'Invalidate execution if top-of-book bid-ask spread widens beyond 80 bps.',
  });

  // 4. Construct strictly non-executing AdvisoryTradeProposal
  const tradeable =
    rating === 'BUY' || rating === 'OVERWEIGHT' || rating === 'SELL' || rating === 'UNDERWEIGHT';

  const marketType = !tradeable
    ? 'NONE'
    : proposedDirection === 'SHORT' && snapshot.derivatives?.status === 'LIVE' && !snapshot.futuresTradeBlock
      ? 'FUTURES_PERP'
      : 'SPOT';

  const action = !tradeable
    ? rating === 'REVIEW'
      ? 'NO_TRADE'
      : 'HOLD'
    : proposedDirection === 'LONG'
      ? 'LONG'
      : 'SHORT';

  const advisoryProposal: AdvisoryTradeProposal = {
    advisoryOnly: true,
    liveExecutionEnabled: false,
    marketType,
    action,
    side: !tradeable ? null : proposedDirection === 'LONG' ? 'BUY' : 'SELL',
    entryPrice: tradeable ? entryPrice : null,
    stopLossPrice: tradeable ? stopLossPrice : null,
    takeProfitPrice: tradeable ? takeProfitPrice : null,
    recommendedQuantity: tradeable && riskReview.sizingLadder ? riskReview.sizingLadder.finalQuantity : '0.00000000',
    recommendedNotionalUsdt:
      tradeable && riskReview.sizingLadder ? riskReview.sizingLadder.finalNotionalUsdt : '0.00000000',
    maxLeverage: '1.00',
  };

  const fallbackExecSummary =
    `Final Synthesis (${snapshot.symbol} @ ${snapshot.asOf}): Rating=${rating} (Confidence=${confidenceDec.toFixed(2)}, Uncertainty=${uncertaintyDec.toFixed(2)}). ` +
    `DebateConviction=${debate.debateConvictionScore} (${debate.consensusTilt}), RiskApproved=${riskReview.approved}. ` +
    (tradeable
      ? `Advisory ${advisoryProposal.action} on ${advisoryProposal.marketType}: Entry=${advisoryProposal.entryPrice}, Stop=${advisoryProposal.stopLossPrice}, TP=${advisoryProposal.takeProfitPrice}, Qty=${advisoryProposal.recommendedQuantity} (${advisoryProposal.recommendedNotionalUsdt} USDT).`
      : `No trade execution recommended (${riskReview.vetoReasons[0] ?? 'Hold/Review posture'}).`);

  const narrative = await llm.narrate({
    department,
    rolePrompt: 'Head of Crypto Multi-Agent Research & Final Synthesis',
    structuredContext: {
      rating,
      confidence: confidenceDec.toFixed(2),
      uncertaintyScore: uncertaintyDec.toFixed(2),
      advisoryProposal,
    },
    fallbackSummary: fallbackExecSummary,
  });

  const synthesisFinding: DepartmentFinding = {
    department,
    status: rating === 'REVIEW' ? 'DEGRADED' : 'OK',
    stance:
      rating === 'BUY' || rating === 'OVERWEIGHT'
        ? 'BULLISH'
        : rating === 'SELL' || rating === 'UNDERWEIGHT'
          ? 'BEARISH'
          : rating === 'REVIEW'
            ? 'ABSTAIN'
            : 'NEUTRAL',
    score: debate.debateConvictionScore,
    confidence: confidenceDec.toFixed(2),
    summary: narrative.text,
    metrics: {
      rating,
      confidence: confidenceDec.toFixed(2),
      uncertaintyScore: uncertaintyDec.toFixed(2),
      advisoryAction: advisoryProposal.action,
      recommendedQuantity: advisoryProposal.recommendedQuantity,
      recommendedNotionalUsdt: advisoryProposal.recommendedNotionalUsdt,
    },
    evidence: [],
    riskFlags: [],
    missingData: [],
    durationMs: Math.max(0, Date.now() - startMs),
  };

  return {
    rating,
    confidence: confidenceDec.toFixed(2),
    uncertaintyScore: uncertaintyDec.toFixed(2),
    uncertaintyReasons,
    executiveSummary: narrative.text,
    invalidationConditions,
    advisoryProposal,
    synthesisFinding,
  };
}
