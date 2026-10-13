// Adapted from TauricResearch/TradingAgents v0.6.0 (commit 1394a3f72aa4393e1a98f51b382434c4b4c2d972, Apache-2.0):
// tradingagents/agents/risk_mgmt/{aggressive,conservative,neutral}_debator.py (3-persona risk committee).
// Sizing ladder / circuit breakers come from @cex/core quant.ts (formulas adapted from MIT skills
// agiprolabs/claude-trading-skills risk-management + position-sizing). Modified. See THIRD_PARTY_NOTICES.md.
import {
  ceilToStep,
  computePositionSizingLadder,
  dec,
  estimateDepthSlippageDec,
  evaluateCircuitBreakersDec,
  floorToStep,
  maxDec,
  minDec,
  toFixedStr,
  toOptionalFixedStr,
  ZERO,
  type BookLevel,
  type Dec,
} from '@cex/core';
import type {
  BullBearDebateResult,
  CircuitBreakerStatusSchema,
  CryptoMarketSnapshot,
  DepartmentFinding,
  PositionSizingLadderOutput,
  RiskExecutionReview,
} from '@cex/contracts';
import type { ResilientLlmAdapter } from '../llmAdapter.ts';

/**
 * Department 6: Risk Management & Execution Review Agent
 *
 * Combines upstream's 3-persona risk committee (Aggressive, Conservative, Neutral)
 * with deterministic `@cex/core` risk & execution guards:
 * - Graduated circuit breakers (`evaluateCircuitBreakersDec`)
 * - 5-step Position Sizing Ladder (`computePositionSizingLadder`)
 * - `walkBook` depth slippage verification (`estimateDepthSlippageDec`)
 * - Hard vetoes on `STALE`/`UNAVAILABLE` feeds, `spotTradeBlock`/`futuresTradeBlock`, or `BLOCKER` risk flags.
 */
export async function runRiskExecutionReviewAgent(params: {
  snapshot: CryptoMarketSnapshot;
  analystFindings: DepartmentFinding[];
  debate: BullBearDebateResult;
  llm: ResilientLlmAdapter;
}): Promise<{
  review: RiskExecutionReview;
  finding: DepartmentFinding;
  proposedDirection: 'LONG' | 'SHORT' | 'NONE';
  entryPrice: string | null;
  stopLossPrice: string | null;
  takeProfitPrice: string | null;
}> {
  const startMs = Date.now();
  const { snapshot, analystFindings, debate, llm } = params;
  const department = 'risk_execution_review' as const;
  const vetoReasons: string[] = [];

  // 1. Check data freshness & timestamp alignment
  if (snapshot.spotDataStatus !== 'LIVE') {
    vetoReasons.push(`Spot market data status is ${snapshot.spotDataStatus} (must be LIVE).`);
  }
  if (!snapshot.timestampAlignment.aligned) {
    vetoReasons.push(
      `Market snapshot timestamps are not aligned (observedMaxLagMs=${snapshot.timestampAlignment.observedMaxLagMs}ms > ${snapshot.timestampAlignment.maxAllowedStalenessMs}ms).`,
    );
  }
  if (snapshot.spotTradeBlock) {
    vetoReasons.push(`Exchange spot trading is blocked: ${snapshot.spotTradeBlock}`);
  }

  // 2. Check blocker risk flags from upstream departments
  for (const f of analystFindings) {
    for (const rf of f.riskFlags) {
      if (rf.blocksExecution || rf.severity === 'BLOCKER') {
        vetoReasons.push(`[${rf.code}] ${rf.title}: ${rf.detail}`);
      }
    }
  }

  // 3. Evaluate portfolio circuit breakers (`risk-management` skill).
  // - NOT_PROVIDED: there is no account to protect -> NOT_APPLICABLE (not "NORMAL"); sizing uses a reference baseline.
  // - Provided without a drawdown: the breakers cannot be evaluated -> fail closed (CRITICAL, size 0, veto).
  // - Provided with a drawdown: evaluate; daily/weekly loss or loss streak that were not provided are skipped and
  //   listed in `missingData`.
  const portfolio = snapshot.portfolio;
  const portfolioProvided = portfolio.status !== 'NOT_PROVIDED';
  const cb: { halted: boolean; sizeMultiplier: Dec; status: CircuitBreakerStatusSchema; reasons: string[] } =
    !portfolioProvided
      ? { halted: false, sizeMultiplier: dec('1'), status: 'NOT_APPLICABLE', reasons: [] }
      : portfolio.currentDrawdownPct === null
        ? {
            halted: true,
            sizeMultiplier: ZERO,
            status: 'CRITICAL',
            reasons: ['Portfolio currentDrawdownPct was not provided; circuit breakers cannot be evaluated (fail closed).'],
          }
        : evaluateCircuitBreakersDec({
            currentDrawdownPct: dec(portfolio.currentDrawdownPct),
            dailyLossPct: portfolio.dailyLossPct !== null ? dec(portfolio.dailyLossPct) : null,
            weeklyLossPct: portfolio.weeklyLossPct !== null ? dec(portfolio.weeklyLossPct) : null,
            consecutiveLosses: portfolio.consecutiveLosses ?? undefined,
          });
  if (cb.halted) {
    for (const r of cb.reasons) {
      vetoReasons.push(`Circuit Breaker (${cb.status}): ${r}`);
    }
  }
  // A provided account with no positive equity cannot be sized (no $10,000 baseline for a real account).
  const providedEquity =
    portfolioProvided && portfolio.equityUsdt !== null && dec(portfolio.equityUsdt).gt(ZERO) ? dec(portfolio.equityUsdt) : null;
  if (portfolioProvided && providedEquity === null) {
    vetoReasons.push(
      `Provided portfolio has no positive equity (equityUsdt=${portfolio.equityUsdt ?? 'null'}); position cannot be sized.`,
    );
  }
  const missingData: string[] = !portfolioProvided
    ? ['portfolio (NOT_PROVIDED): sizing uses the $10,000 reference baseline; portfolio circuit breakers not applicable']
    : (['equityUsdt', 'currentDrawdownPct', 'dailyLossPct', 'weeklyLossPct', 'consecutiveLosses'] as const)
        .filter((k) => portfolio[k] === null)
        .map((k) => `portfolio.${k} (not provided)`);

  // 4. Determine candidate trade direction from debate conviction
  const conviction = dec(debate.debateConvictionScore);
  const proposedDirection: 'LONG' | 'SHORT' | 'NONE' =
    conviction.gte(15) ? 'LONG' : conviction.lte(-15) ? 'SHORT' : 'NONE';

  if (proposedDirection === 'NONE') {
    vetoReasons.push(
      `Debate conviction score (${conviction.toFixed(2)}) is inside the [-15, +15] neutral no-trade zone.`,
    );
  }

  // 5. Compute deterministic entry, ATR stop-loss, and take-profit prices snapped to tickSize
  const tickSize = dec(snapshot.rules.tickSize);
  const stepSize = dec(snapshot.rules.stepSize);
  const feeRate = dec(snapshot.rules.feeRate);

  const techFinding = analystFindings.find((f) => f.department === 'technical_quant');
  const microFinding = analystFindings.find((f) => f.department === 'order_flow_microstructure');
  const derivFinding = analystFindings.find((f) => f.department === 'derivatives_positioning');

  const rawRefPrice =
    proposedDirection === 'LONG'
      ? snapshot.spot.bestAsk ?? snapshot.spot.lastPrice
      : proposedDirection === 'SHORT'
        ? snapshot.spot.bestBid ?? snapshot.spot.lastPrice
        : snapshot.spot.lastPrice;

  let entryPriceStr: string | null = null;
  let stopLossPriceStr: string | null = null;
  let takeProfitPriceStr: string | null = null;
  let sizingLadderOutput: PositionSizingLadderOutput | null = null;
  let estimatedSlippageBpsStr: string | null = null;

  // Sizing equity: the account's own equity, or the $10,000 reference baseline only when no portfolio was provided.
  // A provided account without positive equity is not sized at all (vetoed above).
  const sizingEquity = portfolioProvided ? providedEquity : dec('10000');

  if (
    rawRefPrice &&
    dec(rawRefPrice).gt(ZERO) &&
    tickSize.gt(ZERO) &&
    proposedDirection !== 'NONE' &&
    sizingEquity !== null
  ) {
    const entryDec =
      proposedDirection === 'LONG'
        ? ceilToStep(dec(rawRefPrice), tickSize)
        : floorToStep(dec(rawRefPrice), tickSize);

    const atrDecVal =
      techFinding?.metrics.atr14 && dec(techFinding.metrics.atr14).gt(ZERO)
        ? dec(techFinding.metrics.atr14)
        : entryDec.mul('0.02');

    // Stop distance = max(2 * ATR, 1.2% of entry, 2 * tickSize)
    const rawStopDist = maxDec(atrDecVal.mul(2), maxDec(entryDec.mul('0.012'), tickSize.mul(2)));
    const rawTpDist = rawStopDist.mul('2.2');

    const stopDec =
      proposedDirection === 'LONG'
        ? maxDec(tickSize, floorToStep(entryDec.sub(rawStopDist), tickSize))
        : ceilToStep(entryDec.add(rawStopDist), tickSize);

    const tpDec =
      proposedDirection === 'LONG'
        ? ceilToStep(entryDec.add(rawTpDist), tickSize)
        : maxDec(tickSize, floorToStep(entryDec.sub(rawTpDist), tickSize));

    entryPriceStr = entryDec.toFixed(tickSize.decimalPlaces());
    stopLossPriceStr = stopDec.toFixed(tickSize.decimalPlaces());
    takeProfitPriceStr = tpDec.toFixed(tickSize.decimalPlaces());

    const visibleDepthUsdt =
      microFinding?.metrics.depthWithin2PctUsdt && dec(microFinding.metrics.depthWithin2PctUsdt).gt(ZERO)
        ? dec(microFinding.metrics.depthWithin2PctUsdt)
        : null;

    // Estimate win rate from conviction (bounded 0.45..0.62 — anti-overfitting conservative bound)
    const estWinRate = minDec(dec('0.62'), maxDec(dec('0.45'), dec('0.50').add(conviction.abs().div(600))));

    const ladder = computePositionSizingLadder({
      side: proposedDirection,
      equityUsdt: sizingEquity,
      entryPrice: entryDec,
      stopLossPrice: stopDec,
      takeProfitPrice: tpDec,
      rules: snapshot.rules,
      feeRate,
      riskPercent: dec('1.0'),
      atrPrice: atrDecVal,
      targetDailyVolPercent: dec('1.5'),
      estimatedWinRate: estWinRate,
      visibleDepthUsdt,
      maxDepthParticipation: dec('0.10'),
      maxConcentrationFraction: dec('0.10'),
      drawdownSizeMultiplier: cb.sizeMultiplier,
    });

    const stepPlaces = Math.max(0, stepSize.decimalPlaces());
    sizingLadderOutput = {
      kellyQty: ladder.kellyQty.toFixed(stepPlaces),
      fixedFractionalQty: ladder.fixedFractionalQty.toFixed(stepPlaces),
      volatilityAdjustedQty: ladder.volatilityAdjustedQty.toFixed(stepPlaces),
      liquidityConstrainedQty: ladder.liquidityConstrainedQty.toFixed(stepPlaces),
      concentrationCappedQty: ladder.concentrationCappedQty.toFixed(stepPlaces),
      finalQuantity: ladder.finalQuantity.toFixed(stepPlaces),
      finalNotionalUsdt: toFixedStr(ladder.finalNotionalUsdt),
      bindingConstraint: ladder.bindingConstraint,
      lossPerUnitUsdt: toFixedStr(ladder.lossPerUnitUsdt),
      netRewardPerUnitUsdt: ladder.netRewardPerUnitUsdt ? toFixedStr(ladder.netRewardPerUnitUsdt) : null,
      netRiskRewardRatio: ladder.netRiskRewardRatio ? ladder.netRiskRewardRatio.toFixed(4) : null,
      lotCheckError: ladder.lotCheckError,
    };

    if (ladder.lotCheckError || ladder.finalQuantity.lte(ZERO)) {
      vetoReasons.push(`Position Sizing Ladder rejected size: ${ladder.lotCheckError ?? 'finalQuantity is 0'}.`);
    }

    // Verify order book slippage at the recommended notional
    if (ladder.finalNotionalUsdt.gt(ZERO)) {
      const bookSideLevels: BookLevel[] =
        proposedDirection === 'LONG'
          ? snapshot.spot.asks.map((a) => ({ price: dec(a.price), qty: dec(a.qty) }))
          : snapshot.spot.bids.map((b) => ({ price: dec(b.price), qty: dec(b.qty) }));
      const slip = estimateDepthSlippageDec(
        proposedDirection === 'LONG' ? 'BUY' : 'SELL',
        bookSideLevels,
        ladder.finalNotionalUsdt,
        stepSize,
      );
      estimatedSlippageBpsStr = toOptionalFixedStr(slip.slippageBps, 4);
      if (!slip.reachable) {
        vetoReasons.push(
          `Order book depth cannot fill recommended notional (${toFixedStr(ladder.finalNotionalUsdt)} USDT) completely.`,
        );
      } else if (slip.slippageBps && slip.slippageBps.gt(60)) {
        vetoReasons.push(
          `Estimated book slippage (${slip.slippageBps.toFixed(2)} bps) exceeds 60 bps execution safety ceiling.`,
        );
      }
    }
  }

  const approved = vetoReasons.length === 0 && proposedDirection !== 'NONE';
  const liqBufferBps = derivFinding?.metrics.minLiquidationBufferBps ?? null;

  const aggressiveFallback =
    proposedDirection === 'NONE'
      ? `Aggressive Risk Persona: Acknowledges low directional conviction (${debate.debateConvictionScore}); stands down.`
      : `Aggressive Risk Persona: Favors ${proposedDirection} exposure on ${snapshot.symbol} at ${entryPriceStr ?? 'market'} with target ${takeProfitPriceStr ?? 'N/A'} (Net R:R=${sizingLadderOutput?.netRiskRewardRatio ?? 'N/A'}).`;

  const conservativeFallback =
    vetoReasons.length > 0
      ? `Conservative Risk Persona: VETOES execution due to ${vetoReasons.length} constraint(s): ${vetoReasons.join(' | ')}`
      : `Conservative Risk Persona: Approves strictly capped ${proposedDirection} size=${sizingLadderOutput?.finalQuantity ?? '0'} (${sizingLadderOutput?.finalNotionalUsdt ?? '0'} USDT, binding=${sizingLadderOutput?.bindingConstraint ?? 'NONE'}) with hard stop at ${stopLossPriceStr}.`;

  const neutralFallback =
    approved
      ? `Neutral Risk Synthesis: APPROVED for advisory ${proposedDirection} (Qty=${sizingLadderOutput?.finalQuantity}, Stop=${stopLossPriceStr}, CircuitBreaker=${cb.status} ${cb.sizeMultiplier.toFixed(2)}x).`
      : `Neutral Risk Synthesis: EXECUTION VETOED (${vetoReasons[0] ?? 'No trade setup'}). Maintain flat/defensive posture.`;

  const [aggNar, conNar, neuNar] = await Promise.all([
    llm.narrate({
      department,
      rolePrompt: 'Aggressive Risk & Opportunity Evaluator',
      structuredContext: { proposedDirection, conviction: debate.debateConvictionScore },
      fallbackSummary: aggressiveFallback,
    }),
    llm.narrate({
      department,
      rolePrompt: 'Conservative Capital-Preservation Risk Officer',
      structuredContext: { vetoReasons, circuitBreaker: cb.status },
      fallbackSummary: conservativeFallback,
    }),
    llm.narrate({
      department,
      rolePrompt: 'Chief Risk Officer & Execution Judge',
      structuredContext: { approved, sizingLadderOutput },
      fallbackSummary: neutralFallback,
    }),
  ]);

  const review: RiskExecutionReview = {
    approved,
    vetoReasons,
    aggressiveView: aggNar.text,
    conservativeView: conNar.text,
    neutralSynthesis: neuNar.text,
    circuitBreakerStatus: cb.status,
    circuitBreakerMultiplier: cb.sizeMultiplier.toFixed(2),
    estimatedSlippageBps: estimatedSlippageBpsStr,
    liquidationBufferBps: liqBufferBps,
    sizingLadder: sizingLadderOutput,
  };

  const finding: DepartmentFinding = {
    department,
    status: snapshot.spotDataStatus === 'LIVE' ? 'OK' : 'DEGRADED',
    stance: approved ? (proposedDirection === 'LONG' ? 'BULLISH' : 'BEARISH') : 'NEUTRAL',
    score: approved ? debate.debateConvictionScore : '0.00',
    confidence: approved ? '0.88' : '0.95',
    summary: neuNar.text,
    metrics: {
      approved: String(approved),
      circuitBreakerStatus: cb.status,
      circuitBreakerMultiplier: cb.sizeMultiplier.toFixed(2),
      bindingConstraint: sizingLadderOutput?.bindingConstraint ?? 'BLOCKED',
      recommendedQty: sizingLadderOutput?.finalQuantity ?? '0.00000000',
      recommendedNotionalUsdt: sizingLadderOutput?.finalNotionalUsdt ?? '0.00000000',
      estimatedSlippageBps: estimatedSlippageBpsStr,
    },
    evidence: [
      {
        id: `${snapshot.snapshotId}-risk-cb`,
        kind: 'OBSERVED',
        department,
        metric: 'circuitBreakerEvaluation',
        value: `${cb.status} (mult=${cb.sizeMultiplier.toFixed(2)}x)`,
        source: 'quant.evaluateCircuitBreakersDec',
        observedAt: snapshot.asOf,
        dataStatus: snapshot.spotDataStatus,
        note: `Portfolio drawdown=${portfolio.currentDrawdownPct !== null ? `${portfolio.currentDrawdownPct}%` : 'N/A'}, dailyLoss=${portfolio.dailyLossPct !== null ? `${portfolio.dailyLossPct}%` : 'N/A'}.`,
      },
    ],
    riskFlags: vetoReasons.map((reason, idx) => ({
      code: `RISK_VETO_${idx + 1}`,
      severity: 'BLOCKER' as const,
      department,
      title: 'Risk & Execution Veto',
      detail: reason,
      blocksExecution: true,
    })),
    missingData,
    durationMs: Math.max(0, Date.now() - startMs),
  };

  return {
    review,
    finding,
    proposedDirection,
    entryPrice: entryPriceStr,
    stopLossPrice: stopLossPriceStr,
    takeProfitPrice: takeProfitPriceStr,
  };
}
