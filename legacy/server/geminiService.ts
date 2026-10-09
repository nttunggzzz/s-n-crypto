import { GoogleGenAI } from '@google/genai';
import { AICommitteeReport, SetupSignal } from '../src/types/crypto';

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      aiClient = new GoogleGenAI({ apiKey });
    }
  }
  return aiClient;
}

export async function generateAICommitteeReport(signal: SetupSignal, marketRegime: string = 'BULLISH_EXPANSION'): Promise<AICommitteeReport> {
  const structuredPrompt = `You are the lead analyst of an institutional Crypto AI Investment Committee.
You have been provided with deterministic quantitative, technical, Smart Money Concepts (SMC), derivatives, and on-chain metrics for ${signal.symbol} (${signal.name}).

CRITICAL INSTRUCTIONS:
1. STRICT TRUTH: Do NOT invent prices, transactions, or metrics not provided below.
2. DISTINCTION: You must clearly distinguish:
   - FACTS: Directly measured numbers and verifiable chart levels.
   - INFERENCES: Logical deductions based on confluence.
   - UNCERTAINTIES: Missing variables, macro risks, or low-conviction areas.
3. NO PRICE GUARANTEES: Analyze probabilities and risk-reward setups, not certainties.
4. PRODUCE VALID JSON matching the required schema.

STRUCTURED EVIDENCE PROVIDED BY DETERMINISTIC ENGINES:
- Symbol: ${signal.symbol} (${signal.name})
- Current Price: $${signal.currentPrice}
- Market Regime: ${marketRegime}
- Total Confluence Score: ${signal.scores.totalConfluenceScore}/100
- Direction: ${signal.direction}
- Signal Status: ${signal.status} (Priority: ${signal.priority})
- Scores:
  * Market: ${signal.scores.marketScore}
  * Price Action: ${signal.scores.priceActionScore}
  * SMC: ${signal.scores.smcScore}
  * Relative Strength: ${signal.scores.relativeStrengthScore}
  * Derivatives: ${signal.scores.derivativesScore}
  * Whale & Smart Money: ${signal.scores.whaleScore}
  * On-Chain: ${signal.scores.onchainScore}
  * Ecosystem Rotation: ${signal.scores.rotationScore}
- Technical & SMC Findings:
  * Trend: ${signal.priceAction.trend}
  * Market Structure: ${signal.smc.marketStructure} (BOS: ${signal.smc.bosDetected ? 'Yes' : 'No'}, CHOCH: ${signal.smc.chochDetected ? 'Yes' : 'No'})
  * Pricing Zone: ${signal.smc.currentZone} (Equilibrium: $${signal.smc.equilibriumPrice})
  * Volatility State: ${signal.priceAction.volatilityState} (ATR: $${signal.priceAction.atr14.toFixed(4)})
- Derivatives:
  * OI Interpretation: ${signal.derivatives.oiInterpretation} (OI 24h Change: ${signal.derivatives.openInterestChange24h}%)
  * Funding Rate: ${(signal.derivatives.fundingRate * 100).toFixed(4)}%
  * Long/Short Ratio: ${signal.derivatives.longShortRatio}
- Risk Engine Execution Plan:
  * Entry Zone: $${signal.risk.entryZone[0]} – $${signal.risk.entryZone[1]}
  * Stop Loss: $${signal.risk.stopLossPrice} (-${signal.risk.stopLossPercent}%)
  * SL Rationale: ${signal.risk.stopLossRationale}
  * Target 1: $${signal.risk.takeProfit1} (+${signal.risk.takeProfit1Percent}%)
  * Target 2: $${signal.risk.takeProfit2} (+${signal.risk.takeProfit2Percent}%)
  * Target 3: $${signal.risk.takeProfit3} (+${signal.risk.takeProfit3Percent}%)
  * Risk:Reward: 1:${signal.risk.riskRewardRatio}
- Invalidation Conditions: ${signal.risk.invalidationConditions.join('; ')}
- Pre-computed Evidence Points: ${signal.evidencePoints.join('; ')}
- Pre-computed Key Risks: ${signal.keyRisks.join('; ')}

Return a valid JSON object strictly adhering to this interface:
{
  "verdict": "STRONG_CONVICTION_SETUP" | "MODERATE_SETUP" | "WATCHLIST_ONLY" | "REJECTED_UNFAVORABLE_RR" | "INVALIDATED",
  "confidenceScore": number (0-100),
  "executiveThesis": string,
  "facts": string[],
  "inferences": string[],
  "uncertainties": string[],
  "catalystsAndConfluences": string[],
  "counterThesisRisks": string[],
  "invalidationPlan": string,
  "macroContext": string,
  "committeeSummary": string
}`;

  try {
    const ai = getAIClient();
    if (ai) {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: structuredPrompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      });

      const text = response.text || '';
      const parsed = JSON.parse(text);

      return {
        signalId: signal.id,
        symbol: signal.symbol,
        timestamp: Date.now(),
        verdict: parsed.verdict || (signal.scores.totalConfluenceScore > 75 ? 'STRONG_CONVICTION_SETUP' : 'MODERATE_SETUP'),
        confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : Math.round(signal.scores.totalConfluenceScore),
        executiveThesis: parsed.executiveThesis || `High confluence ${signal.direction} positioning opportunity in ${signal.symbol}.`,
        facts: Array.isArray(parsed.facts) ? parsed.facts : [
          `Current spot price: $${signal.currentPrice}`,
          `24h Open Interest change: ${signal.derivatives.openInterestChange24h}%`,
          `Stop loss placed structurally at $${signal.risk.stopLossPrice}`
        ],
        inferences: Array.isArray(parsed.inferences) ? parsed.inferences : [
          `Institutional demand absorption active in the $${signal.risk.entryZone[0]}–$${signal.risk.entryZone[1]} zone.`,
          `Favorable risk-reward profile (1:${signal.risk.riskRewardRatio}) to Target 2.`
        ],
        uncertainties: Array.isArray(parsed.uncertainties) ? parsed.uncertainties : [
          `Potential broader crypto market volatility on upcoming macro economic announcements.`
        ],
        catalystsAndConfluences: Array.isArray(parsed.catalystsAndConfluences) ? parsed.catalystsAndConfluences : signal.evidencePoints,
        counterThesisRisks: Array.isArray(parsed.counterThesisRisks) ? parsed.counterThesisRisks : signal.keyRisks,
        invalidationPlan: parsed.invalidationPlan || signal.invalidationTrigger,
        macroContext: parsed.macroContext || `Operating under ${marketRegime} market backdrop.`,
        committeeSummary: parsed.committeeSummary || `The AI Investment Committee approves monitoring ${signal.symbol} with defined risk parameters.`,
        modelUsed: 'gemini-2.5-flash'
      };
    }
  } catch (error) {
    console.warn('Gemini API synthesis fallback to deterministic compiler:', error);
  }

  // Deterministic fallback compiler if API key not supplied or offline
  const isHighConviction = signal.scores.totalConfluenceScore >= 78 && signal.risk.riskRewardRatio >= 1.8;
  return {
    signalId: signal.id,
    symbol: signal.symbol,
    timestamp: Date.now(),
    verdict: isHighConviction ? 'STRONG_CONVICTION_SETUP' : signal.scores.totalConfluenceScore >= 60 ? 'MODERATE_SETUP' : 'WATCHLIST_ONLY',
    confidenceScore: Math.round(signal.scores.totalConfluenceScore),
    executiveThesis: `${signal.symbol} demonstrates structural ${signal.direction.toLowerCase()} alignment (${signal.scores.totalConfluenceScore}/100 Confluence) with an asymmetric 1:${signal.risk.riskRewardRatio} risk-to-reward setup.`,
    facts: [
      `Spot Price: $${signal.currentPrice.toFixed(4)} with ${signal.derivatives.openInterestChange24h >= 0 ? '+' : ''}${signal.derivatives.openInterestChange24h}% 24h OI Delta.`,
      `Funding Rate: ${(signal.derivatives.fundingRate * 100).toFixed(4)}% (Healthy baseline).`,
      `Stop Loss fixed at $${signal.risk.stopLossPrice} (${signal.risk.stopLossRationale}).`
    ],
    inferences: [
      `SMC Market Structure confirms ${signal.smc.marketStructure.toLowerCase()} bias with ${signal.smc.currentZone.toLowerCase()} pricing advantage.`,
      `Relative Strength vs BTC (+${signal.relativeStrength.rsVsBtc24h}%) indicates proactive capital rotation.`
    ],
    uncertainties: [
      `Macro BTC dominance fluctuations and sudden exchange liquidation spikes could test entry limits.`
    ],
    catalystsAndConfluences: signal.evidencePoints,
    counterThesisRisks: signal.keyRisks,
    invalidationPlan: `Setup terminates immediately on 4H candle closure below $${signal.risk.stopLossPrice}.`,
    macroContext: `Market regime analyzed as ${marketRegime}.`,
    committeeSummary: `Investment Committee formalizes a ${isHighConviction ? 'READY (High Conviction)' : 'WATCH'} stance with 1:${signal.risk.riskRewardRatio} R:R.`,
    modelUsed: 'Deterministic Confluence Synthesizer v1.0'
  };
}
