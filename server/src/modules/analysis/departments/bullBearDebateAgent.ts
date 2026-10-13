import { dec, floorSigned, maxDec, minDec, ZERO } from '@cex/core';
import type {
  BullBearDebateResult,
  BullBearDebateRound,
  CryptoMarketSnapshot,
  DepartmentFinding,
} from '@cex/contracts';
import type { ResilientLlmAdapter } from '../llmAdapter.ts';
import type { DecisionMemoryEpisode } from '../memoryLog.ts';

function reportOrAbsent(finding: DepartmentFinding | undefined, label: string): string {
  if (!finding || finding.status === 'UNAVAILABLE' || finding.status === 'FAILED') {
    return `[${label}: DATA_UNAVAILABLE — do not fabricate or extrapolate from missing ${label} feed]`;
  }
  return `[${label} (${finding.status}, stance=${finding.stance}, score=${finding.score}, conf=${finding.confidence}): ${finding.summary}]`;
}

/**
 * Department 5: Bull/Bear Debate & Independent Challenge Agent
 *
 * Adapted from upstream `bull_researcher.py`, `bear_researcher.py`, `research_manager.py`,
 * and `prompt_fallbacks.py` (#1176 `report_or_absent` / `opponent_argument_or_opening`).
 *
 * Adds an explicit Independent Challenger that penalizes cross-department divergence
 * (e.g., bullish candles vs. negative taker order flow or overcrowded perp funding).
 */
export async function runBullBearDebateAgent(params: {
  snapshot: CryptoMarketSnapshot;
  analystFindings: DepartmentFinding[];
  priorLessons: DecisionMemoryEpisode[];
  maxDebateRounds?: number;
  llm: ResilientLlmAdapter;
}): Promise<BullBearDebateResult> {
  const { snapshot, analystFindings, priorLessons, llm } = params;
  const maxRounds = Math.max(1, Math.min(4, params.maxDebateRounds ?? 2));

  const byDept = new Map(analystFindings.map((f) => [f.department, f]));
  const tech = byDept.get('technical_quant');
  const micro = byDept.get('order_flow_microstructure');
  const deriv = byDept.get('derivatives_positioning');
  const fund = byDept.get('crypto_fundamentals_sentiment');

  const activeFindings = analystFindings.filter(
    (f) => f.status !== 'UNAVAILABLE' && f.status !== 'FAILED' && f.stance !== 'ABSTAIN',
  );

  if (activeFindings.length === 0) {
    return {
      status: 'UNAVAILABLE',
      rounds: [],
      bullThesis: 'DATA_UNAVAILABLE: No active department findings available to construct a verified bullish thesis.',
      bearThesis: 'DATA_UNAVAILABLE: No active department findings available to construct a verified bearish thesis.',
      independentChallenge:
        'Independent Challenger vetoes directional conviction: all four upstream research departments abstained or lacked live data.',
      unresolvedRisks: ['All upstream research departments returned ABSTAIN / UNAVAILABLE'],
      consensusTilt: 'INCONCLUSIVE',
      debateConvictionScore: '0.00',
    };
  }

  // Compute confidence-weighted directional score across active departments
  const weights: Record<string, string> = {
    technical_quant: '0.32',
    order_flow_microstructure: '0.28',
    derivatives_positioning: '0.22',
    crypto_fundamentals_sentiment: '0.18',
  };

  let weightedSum = ZERO;
  let totalWeight = ZERO;
  let bullishCount = 0;
  let bearishCount = 0;

  for (const f of activeFindings) {
    const baseW = dec(weights[f.department] ?? '0.25');
    const effW = baseW.mul(maxDec(dec('0.20'), dec(f.confidence)));
    const s = dec(f.score);
    weightedSum = weightedSum.add(s.mul(effW));
    totalWeight = totalWeight.add(effW);
    if (s.gte(15)) bullishCount++;
    else if (s.lte(-15)) bearishCount++;
  }

  let compositeScore = totalWeight.gt(ZERO) ? weightedSum.div(totalWeight) : ZERO;

  // Detect inter-department conflicts (Independent Challenger check)
  const unresolvedRisks: string[] = [];
  if (bullishCount > 0 && bearishCount > 0) {
    unresolvedRisks.push(
      `Cross-department divergence: ${bullishCount} department(s) BULLISH vs ${bearishCount} department(s) BEARISH.`,
    );
    // Dampen conviction by 25% when departments disagree on direction
    compositeScore = compositeScore.mul('0.75');
  }

  for (const f of analystFindings) {
    if (f.status === 'UNAVAILABLE' || f.status === 'FAILED') {
      unresolvedRisks.push(`Department ${f.department} is ${f.status} (${f.missingData.join(', ') || 'no feed'}).`);
    }
    for (const rf of f.riskFlags) {
      if (rf.severity === 'WARNING' || rf.severity === 'CRITICAL' || rf.severity === 'BLOCKER') {
        unresolvedRisks.push(`[${rf.code}] ${rf.title}: ${rf.detail}`);
      }
    }
  }

  // Incorporate point-in-time settled lessons without look-ahead bias
  const adverseLessons = priorLessons.filter((l) => l.outcomeCorrect === false);
  if (adverseLessons.length > 0) {
    unresolvedRisks.push(
      `${adverseLessons.length} prior settled decision(s) on ${snapshot.symbol} had adverse outcomes; Challenger applies 10% conviction haircut.`,
    );
    compositeScore = compositeScore.mul('0.90');
  }

  const allEvidenceIds = analystFindings.flatMap((f) => f.evidence.map((e) => e.id));
  const bullFindings = analystFindings.filter((f) => dec(f.score).gt(ZERO));
  const bearFindings = analystFindings.filter((f) => dec(f.score).lt(ZERO));

  const rounds: BullBearDebateRound[] = [];
  for (let r = 1; r <= maxRounds; r++) {
    const bullArgFallback =
      r === 1
        ? `Opening Bull Case (${snapshot.symbol}): Supported by ${
            bullFindings.map((f) => `${f.department}(+${f.score})`).join(', ') || 'neutral mean-reversion structure'
          }. ${reportOrAbsent(tech, 'Technical')} ${reportOrAbsent(micro, 'OrderFlow')}`
        : `Rebuttal Round ${r} Bull Case: Emphasizes closed-bar structure and available liquidity depth while acknowledging ${unresolvedRisks.length} flagged risk(s).`;

    const bearArgFallback =
      r === 1
        ? `Opening Bear Case (${snapshot.symbol}): Highlighted by ${
            bearFindings.map((f) => `${f.department}(${f.score})`).join(', ') || 'execution friction and macro caution'
          }. ${reportOrAbsent(deriv, 'Derivatives')} ${reportOrAbsent(fund, 'Fundamentals')}`
        : `Rebuttal Round ${r} Bear Case: Presses on microstructure slippage, funding/OI crowding, and unresolved risk flags (${unresolvedRisks.slice(0, 2).join('; ') || 'none'}).`;

    const challengerFallback =
      `Round ${r} Independent Challenge: Verified ${allEvidenceIds.length} evidence item(s) across ${activeFindings.length}/4 active departments. ` +
      (bullishCount > 0 && bearishCount > 0
        ? `Challenges directional consensus due to conflict between bullish and bearish departments.`
        : `Confirms directional alignment across active departments; net conviction=${compositeScore.toFixed(2)}.`);

    const [bullNar, bearNar, chalNar] = await Promise.all([
      llm.narrate({
        department: 'bull_bear_debate',
        rolePrompt: `Crypto Bull Researcher (Round ${r})`,
        structuredContext: { round: r, bullDepartments: bullFindings.map((f) => f.department) },
        fallbackSummary: bullArgFallback,
      }),
      llm.narrate({
        department: 'bull_bear_debate',
        rolePrompt: `Crypto Bear Researcher (Round ${r})`,
        structuredContext: { round: r, bearDepartments: bearFindings.map((f) => f.department) },
        fallbackSummary: bearArgFallback,
      }),
      llm.narrate({
        department: 'bull_bear_debate',
        rolePrompt: `Independent Quant Challenger (Round ${r})`,
        structuredContext: { round: r, unresolvedRisks },
        fallbackSummary: challengerFallback,
      }),
    ]);

    rounds.push({
      round: r,
      bullArgument: bullNar.text,
      bearArgument: bearNar.text,
      challengerCritique: chalNar.text,
      citedEvidenceIds: allEvidenceIds.slice(0, 8),
    });
  }

  const finalConviction = floorSigned(minDec(dec('100'), maxDec(dec('-100'), compositeScore)), 2);
  const consensusTilt =
     snapshot.spotDataStatus !== 'LIVE'
      ? 'INCONCLUSIVE'
      : finalConviction.gte(15)
        ? 'BULLISH'
        : finalConviction.lte(-15)
          ? 'BEARISH'
          : 'BALANCED';

  return {
    status: activeFindings.length >= 2 && snapshot.spotDataStatus === 'LIVE' ? 'OK' : 'DEGRADED',
    rounds,
    bullThesis: rounds[rounds.length - 1]!.bullArgument,
    bearThesis: rounds[rounds.length - 1]!.bearArgument,
    independentChallenge: rounds[rounds.length - 1]!.challengerCritique,
    unresolvedRisks,
    consensusTilt,
    debateConvictionScore: finalConviction.toFixed(2),
  };
}
