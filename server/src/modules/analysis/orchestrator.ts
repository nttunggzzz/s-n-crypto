// Adapted from TauricResearch/TradingAgents v0.6.0 (commit 1394a3f72aa4393e1a98f51b382434c4b4c2d972, Apache-2.0):
// tradingagents/graph/trading_graph.py, tradingagents/graph/setup.py (staged analysts -> debate -> risk -> decision).
// Modified (TypeScript, crypto departments, deterministic narrator, fault isolation). See THIRD_PARTY_NOTICES.md.
import {
  CryptoMarketAnalysisReport,
  type AnalysisDepartmentId,
  type CryptoMarketSnapshot,
  type DepartmentFinding,
} from '@cex/contracts';
import { computeDeterministicHash, buildCryptoMarketSnapshot, type BuildCryptoMarketSnapshotInput } from './snapshotBuilder.ts';
import { ResilientLlmAdapter, type ResilientLlmAdapterOptions } from './llmAdapter.ts';
import { PointInTimeMemoryLog } from './memoryLog.ts';
import { runTechnicalQuantAgent } from './departments/technicalQuantAgent.ts';
import { runOrderFlowMicrostructureAgent } from './departments/orderFlowAgent.ts';
import { runDerivativesPositioningAgent } from './departments/derivativesAgent.ts';
import { runCryptoFundamentalsSentimentAgent } from './departments/fundamentalsSentimentAgent.ts';
import { runBullBearDebateAgent } from './departments/bullBearDebateAgent.ts';
import { runRiskExecutionReviewAgent } from './departments/riskExecutionAgent.ts';
import { runFinalSynthesisAgent } from './departments/finalSynthesisAgent.ts';

export const SUBSYSTEM_VERSION = '1.0.0-crypto-cex';
export const UPSTREAM_REPO = 'https://github.com/TauricResearch/TradingAgents' as const;
export const UPSTREAM_COMMIT = '1394a3f72aa4393e1a98f51b382434c4b4c2d972' as const;
export const UPSTREAM_VERSION = 'v0.6.0' as const;

export type DepartmentOverrideHook = (
  snapshot: CryptoMarketSnapshot,
  llm: ResilientLlmAdapter,
) => Promise<DepartmentFinding>;

export interface CryptoTradingAgentsConfig {
  llmOptions?: ResilientLlmAdapterOptions;
  memoryLog?: PointInTimeMemoryLog;
  maxDebateRounds?: number;
  /** Optional hooks for testing department fault isolation. */
  departmentOverrides?: Partial<Record<AnalysisDepartmentId, DepartmentOverrideHook>>;
}

/**
 * Crypto-Native Multi-Agent Market Analysis Orchestrator
 *
 * Adapted from `TauricResearch/TradingAgents/tradingagents/graph/trading_graph.py` (`v0.6.0`, `1394a3f`):
 * Stage 1 (Parallel Analysts with fault isolation):
 *   - Department 1: `technical_quant`
 *   - Department 2: `order_flow_microstructure`
 *   - Department 3: `derivatives_positioning`
 *   - Department 4: `crypto_fundamentals_sentiment`
 * Stage 2 (Adversarial Debate & Independent Challenge):
 *   - Department 5: `bull_bear_debate`
 * Stage 3 (Risk Committee & Deterministic Position Sizing Ladder):
 *   - Department 6: `risk_execution_review`
 * Stage 4 (Final Synthesis, Invalidation Conditions & Advisory-Only Proposal):
 *   - Department 7: `final_synthesis`
 */
export class CryptoTradingAgentsOrchestrator {
  readonly llm: ResilientLlmAdapter;
  readonly memoryLog: PointInTimeMemoryLog;
  private readonly maxDebateRounds: number;
  private readonly overrides: Partial<Record<AnalysisDepartmentId, DepartmentOverrideHook>>;

  constructor(config?: CryptoTradingAgentsConfig) {
    this.llm = new ResilientLlmAdapter(config?.llmOptions);
    this.memoryLog = config?.memoryLog ?? new PointInTimeMemoryLog();
    this.maxDebateRounds = config?.maxDebateRounds ?? 2;
    this.overrides = config?.departmentOverrides ?? {};
  }

  async analyzeFromRawInput(input: BuildCryptoMarketSnapshotInput): Promise<CryptoMarketAnalysisReport> {
    const { snapshot, snapshotHash } = buildCryptoMarketSnapshot(input);
    return this.analyzeSnapshot(snapshot, snapshotHash);
  }

  async analyzeSnapshot(
    snapshot: CryptoMarketSnapshot,
    precomputedSnapshotHash?: string,
  ): Promise<CryptoMarketAnalysisReport> {
    const startMs = Date.now();
    const snapshotHash = precomputedSnapshotHash ?? computeDeterministicHash(snapshot).slice(0, 32);

    // Retrieve only settled memory episodes with resolvedAtMs <= snapshot.asOfMs (no look-ahead leakage)
    const priorLessons = this.memoryLog.getSettledLessonsAsOf(snapshot.symbol, snapshot.asOfMs, 5);

    // Stage 1: Run the 4 domain research departments concurrently with fault isolation
    const [techFinding, microFinding, derivFinding, fundFinding] = await Promise.all([
      this.runDepartmentSafely('technical_quant', snapshot, runTechnicalQuantAgent),
      this.runDepartmentSafely('order_flow_microstructure', snapshot, runOrderFlowMicrostructureAgent),
      this.runDepartmentSafely('derivatives_positioning', snapshot, runDerivativesPositioningAgent),
      this.runDepartmentSafely('crypto_fundamentals_sentiment', snapshot, runCryptoFundamentalsSentimentAgent),
    ]);

    const analystFindings: DepartmentFinding[] = [techFinding, microFinding, derivFinding, fundFinding];

    // Stage 2: Bull/Bear Debate + Independent Challenge (Department 5)
    const debate = await runBullBearDebateAgent({
      snapshot,
      analystFindings,
      priorLessons,
      maxDebateRounds: this.maxDebateRounds,
      llm: this.llm,
    });

    const debateFinding: DepartmentFinding = {
      department: 'bull_bear_debate',
      status: debate.status,
      stance:
        debate.consensusTilt === 'BULLISH'
          ? 'BULLISH'
          : debate.consensusTilt === 'BEARISH'
            ? 'BEARISH'
            : debate.consensusTilt === 'INCONCLUSIVE'
              ? 'ABSTAIN'
              : 'NEUTRAL',
      score: debate.debateConvictionScore,
      confidence: debate.status === 'OK' ? '0.80' : '0.40',
      summary: debate.independentChallenge,
      metrics: {
        rounds: String(debate.rounds.length),
        consensusTilt: debate.consensusTilt,
        debateConvictionScore: debate.debateConvictionScore,
        unresolvedRiskCount: String(debate.unresolvedRisks.length),
      },
      evidence: [],
      riskFlags: [],
      missingData: [],
      durationMs: 0,
    };

    // Stage 3: Risk Management & Execution Review (Department 6)
    const riskResult = await runRiskExecutionReviewAgent({
      snapshot,
      analystFindings,
      debate,
      llm: this.llm,
    });

    // Stage 4: Final Synthesis (Department 7)
    const synthesis = await runFinalSynthesisAgent({
      snapshot,
      analystFindings,
      debate,
      riskReview: riskResult.review,
      proposedDirection: riskResult.proposedDirection,
      entryPrice: riskResult.entryPrice,
      stopLossPrice: riskResult.stopLossPrice,
      takeProfitPrice: riskResult.takeProfitPrice,
      llm: this.llm,
    });

    const allDepartmentFindings: DepartmentFinding[] = [
      ...analystFindings,
      debateFinding,
      riskResult.finding,
      synthesis.synthesisFinding,
    ];

    const allEvidence = allDepartmentFindings.flatMap((f) => f.evidence);
    const allRiskFlags = allDepartmentFindings.flatMap((f) => f.riskFlags);
    const degradedDepartments = allDepartmentFindings
      .filter((f) => f.status !== 'OK')
      .map((f) => f.department);

    // Deterministic runSignature for reproducibility & auditability
    const signaturePayload = {
      snapshotHash,
      portfolioFingerprint: snapshot.portfolio.fingerprint,
      rating: synthesis.rating,
      confidence: synthesis.confidence,
      uncertaintyScore: synthesis.uncertaintyScore,
      advisoryProposal: synthesis.advisoryProposal,
      departmentScores: allDepartmentFindings.map((f) => ({
        department: f.department,
        status: f.status,
        stance: f.stance,
        score: f.score,
      })),
    };
    const runSignature = computeDeterministicHash(signaturePayload).slice(0, 32);

    const rawReport = {
      reportId: `rep-${snapshot.symbol.toLowerCase()}-${snapshot.asOfMs}`,
      symbol: snapshot.symbol,
      interval: snapshot.interval,
      asOf: snapshot.asOf,
      rating: synthesis.rating,
      confidence: synthesis.confidence,
      uncertaintyScore: synthesis.uncertaintyScore,
      uncertaintyReasons: synthesis.uncertaintyReasons,
      executiveSummary: synthesis.executiveSummary,
      departmentFindings: allDepartmentFindings,
      debate,
      riskReview: riskResult.review,
      invalidationConditions: synthesis.invalidationConditions,
      advisoryProposal: synthesis.advisoryProposal,
      evidence: allEvidence,
      riskFlags: allRiskFlags,
      audit: {
        upstreamRepo: UPSTREAM_REPO,
        upstreamCommit: UPSTREAM_COMMIT,
        upstreamVersion: UPSTREAM_VERSION,
        subsystemVersion: SUBSYSTEM_VERSION,
        llmProvider: this.llm.providerId,
        deterministicMathEngine: '@cex/core/Dec' as const,
        portfolioFingerprint: snapshot.portfolio.fingerprint,
        snapshotHash,
        runSignature,
        degradedDepartments,
        priorLessonsUsed: priorLessons.length,
        totalDurationMs: Math.max(0, Date.now() - startMs),
      },
    };

    return CryptoMarketAnalysisReport.parse(rawReport);
  }

  private async runDepartmentSafely(
    department: AnalysisDepartmentId,
    snapshot: CryptoMarketSnapshot,
    runner: (s: CryptoMarketSnapshot, llm: ResilientLlmAdapter) => Promise<DepartmentFinding>,
  ): Promise<DepartmentFinding> {
    const startMs = Date.now();
    const fn = this.overrides[department] ?? runner;
    try {
      return await fn(snapshot, this.llm);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isCoreDept = department === 'technical_quant' || department === 'order_flow_microstructure';
      return {
        department,
        status: 'FAILED',
        stance: 'ABSTAIN',
        score: '0.00',
        confidence: '0.00',
        summary: `DEPARTMENT_ERROR (${department}): ${msg}`,
        metrics: { error: msg },
        evidence: [],
        riskFlags: [
          {
            code: `DEPT_FAILED_${department.toUpperCase()}`,
            severity: isCoreDept ? 'BLOCKER' : 'WARNING',
            department,
            title: `Department ${department} failed during execution`,
            detail: msg,
            blocksExecution: isCoreDept,
          },
        ],
        missingData: [`${department} threw an unhandled error`],
        durationMs: Math.max(0, Date.now() - startMs),
      };
    }
  }
}
