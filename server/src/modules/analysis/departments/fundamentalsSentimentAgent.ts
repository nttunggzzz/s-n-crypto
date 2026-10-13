// Adapted from TauricResearch/TradingAgents v0.6.0 (commit 1394a3f72aa4393e1a98f51b382434c4b4c2d972, Apache-2.0):
// role of tradingagents/agents/analysts/{fundamentals,news,sentiment}_analyst.py, stock tools replaced by crypto metrics.
// Metric formulas come from @cex/core quant.ts (adapted from MIT skills agiprolabs/claude-trading-skills custom-indicators
// and tradermonty/claude-trading-skills crypto-regime-analyzer). Modified. See THIRD_PARTY_NOTICES.md.
import {
  computeCryptoRegimeCompositeDec,
  dec,
  exchangeNetflowDec,
  floorSigned,
  maxDec,
  minDec,
  mvrvRatioDec,
  nvtRatioDec,
  smartMoneyFlowDec,
  tokenVelocityDec,
  toOptionalFixedStr,
  ZERO,
} from '@cex/core';
import type { CryptoMarketSnapshot, DepartmentFinding, EvidenceItem, RiskFlag } from '@cex/contracts';
import type { ResilientLlmAdapter } from '../llmAdapter.ts';

/**
 * Department 4: Crypto Fundamentals, Tokenomics, News & Sentiment Agent
 *
 * Replaces upstream's stock-oriented SEC 10-K/10-Q/Form 4 tools (`fundamentals_analyst.py`)
 * with crypto-native on-chain valuation (NVT, MVRV), exchange netflows, smart money flow,
 * token velocity, 6-component Crypto Regime Composite, and point-in-time news sentiment.
 */
export async function runCryptoFundamentalsSentimentAgent(
  snapshot: CryptoMarketSnapshot,
  llm: ResilientLlmAdapter,
): Promise<DepartmentFinding> {
  const startMs = Date.now();
  const department = 'crypto_fundamentals_sentiment' as const;
  const missingData: string[] = [];
  const riskFlags: RiskFlag[] = [];
  const evidence: EvidenceItem[] = [];

  const oc = snapshot.onChainAndMacro;
  if (!oc || oc.status === 'UNAVAILABLE') {
    missingData.push('onChainAndMacro (provider not connected or unavailable)');
    return {
      department,
      status: 'UNAVAILABLE',
      stance: 'ABSTAIN',
      score: '0.00',
      confidence: '0.00',
      summary: 'DATA_UNAVAILABLE: On-chain, tokenomics, and macro regime feeds are not connected for this snapshot.',
      metrics: { onChainStatus: oc?.status ?? 'UNAVAILABLE' },
      evidence,
      riskFlags,
      missingData,
      durationMs: Math.max(0, Date.now() - startMs),
    };
  }

  const mcap = oc.marketCapUsd ? dec(oc.marketCapUsd) : null;
  const rcap = oc.realizedCapUsd ? dec(oc.realizedCapUsd) : null;
  const txVol = oc.dailyTxVolumeUsd ? dec(oc.dailyTxVolumeUsd) : null;
  const deposits = oc.exchangeDepositsUsd ? dec(oc.exchangeDepositsUsd) : null;
  const withdrawals = oc.exchangeWithdrawalsUsd ? dec(oc.exchangeWithdrawalsUsd) : null;
  const smartBuys = oc.smartBuysUsd ? dec(oc.smartBuysUsd) : null;
  const smartSells = oc.smartSellsUsd ? dec(oc.smartSellsUsd) : null;
  const circSupply = oc.circulatingSupply ? dec(oc.circulatingSupply) : null;
  const volTokens = oc.dailyVolumeTokens ? dec(oc.dailyVolumeTokens) : null;
  const quoteVol24h = snapshot.spot.quoteVolume24h ? dec(snapshot.spot.quoteVolume24h) : txVol;

  const nvt = nvtRatioDec(mcap, txVol);
  const mvrv = mvrvRatioDec(mcap, rcap);
  const netflow = exchangeNetflowDec(deposits, withdrawals, mcap);
  const smf = smartMoneyFlowDec(smartBuys, smartSells, quoteVol24h);
  const velocity = tokenVelocityDec(volTokens, circSupply);

  const regime = computeCryptoRegimeCompositeDec({
    btcTrendScore: oc.btcTrendScore ? dec(oc.btcTrendScore) : null,
    altBreadthScore: oc.altBreadthScore ? dec(oc.altBreadthScore) : null,
    btcDominanceScore: oc.btcDominanceScore ? dec(oc.btcDominanceScore) : null,
    perpFundingScore: oc.perpFundingScore ? dec(oc.perpFundingScore) : null,
    drawdownVolScore: oc.drawdownVolScore ? dec(oc.drawdownVolScore) : null,
    momentumThrustScore: oc.momentumThrustScore ? dec(oc.momentumThrustScore) : null,
  });

  for (const m of regime.missingComponents) {
    missingData.push(`regime.${m}`);
  }

  // Score calculation
  let rawScore = ZERO;
  let activeSignals = 0;

  if (nvt.signal !== 'UNAVAILABLE') {
    activeSignals++;
    if (nvt.signal === 'BULLISH') rawScore = rawScore.add(15);
    else if (nvt.signal === 'BEARISH') rawScore = rawScore.sub(15);
    evidence.push({
      id: `${snapshot.snapshotId}-fund-nvt`,
      kind: 'OBSERVED',
      department,
      metric: 'nvtRatio',
      value: nvt.ratio?.toFixed(2) ?? null,
      source: 'onChainAndMacro.marketCapUsd/dailyTxVolumeUsd',
      observedAt: oc.observedAt ?? snapshot.asOf,
      dataStatus: oc.status,
      note: `NVT signal=${nvt.signal}.`,
    });
  } else {
    missingData.push('nvtRatio');
  }

  if (mvrv.signal !== 'UNAVAILABLE') {
    activeSignals++;
    if (mvrv.signal === 'BULLISH') rawScore = rawScore.add(18);
    else if (mvrv.signal === 'BEARISH') {
      rawScore = rawScore.sub(22);
      riskFlags.push({
        code: 'FUND_MVRV_OVERHEATED',
        severity: 'WARNING',
        department,
        title: 'MVRV ratio indicates overheated holder profit',
        detail: `MVRV is ${mvrv.ratio?.toFixed(2)} (> 3.5), historically associated with cycle distribution.`,
        blocksExecution: false,
      });
    }
    evidence.push({
      id: `${snapshot.snapshotId}-fund-mvrv`,
      kind: 'OBSERVED',
      department,
      metric: 'mvrvRatio',
      value: mvrv.ratio?.toFixed(4) ?? null,
      source: 'onChainAndMacro.marketCapUsd/realizedCapUsd',
      observedAt: oc.observedAt ?? snapshot.asOf,
      dataStatus: oc.status,
      note: `MVRV signal=${mvrv.signal}.`,
    });
  } else {
    missingData.push('mvrvRatio');
  }

  if (netflow.signal !== 'UNAVAILABLE') {
    activeSignals++;
    if (netflow.signal === 'BULLISH') rawScore = rawScore.add(20);
    else if (netflow.signal === 'BEARISH') rawScore = rawScore.sub(20);
    evidence.push({
      id: `${snapshot.snapshotId}-fund-netflow`,
      kind: 'OBSERVED',
      department,
      metric: 'exchangeNetflowUsd',
      value: netflow.netflowUsd?.toFixed(2) ?? null,
      source: 'onChainAndMacro.exchangeDepositsMinusWithdrawals',
      observedAt: oc.observedAt ?? snapshot.asOf,
      dataStatus: oc.status,
      note: `Exchange netflow signal=${netflow.signal} (negative = accumulation outflow).`,
    });
  } else {
    missingData.push('exchangeNetflow');
  }

  if (smf.signal !== 'UNAVAILABLE') {
    activeSignals++;
    if (smf.signal === 'BULLISH') rawScore = rawScore.add(18);
    else if (smf.signal === 'BEARISH') rawScore = rawScore.sub(18);
  }

  if (regime.score !== null) {
    activeSignals++;
    // Center regime score around 50: (score - 50) * 0.6 -> [-30, +30]
    rawScore = rawScore.add(regime.score.sub(50).mul('0.6'));
    if (regime.zone === 'RISK_OFF') {
      riskFlags.push({
        code: 'FUND_MACRO_REGIME_RISK_OFF',
        severity: 'WARNING',
        department,
        title: 'Crypto macro regime is RISK_OFF',
        detail: `Composite regime score is ${regime.score.toFixed(2)}/100 (< 40 RISK_OFF zone); reduce directional beta.`,
        blocksExecution: false,
      });
    }
    evidence.push({
      id: `${snapshot.snapshotId}-fund-regime`,
      kind: 'INFERRED',
      department,
      metric: 'cryptoRegimeComposite',
      value: `${regime.score.toFixed(2)} (${regime.zone})`,
      source: 'quant.computeCryptoRegimeCompositeDec',
      observedAt: oc.observedAt ?? snapshot.asOf,
      dataStatus: oc.status,
      note: `Computed from ${regime.availableComponents}/6 available macro regime components.`,
    });
  }

  // Point-in-time headlines sentiment
  if (oc.headlines.length > 0) {
    activeSignals++;
    let netTilt = 0;
    for (const h of oc.headlines) {
      if (h.sentimentTilt === 'BULLISH') netTilt++;
      else if (h.sentimentTilt === 'BEARISH') netTilt--;
    }
    const headlineScore = dec(String(netTilt)).div(oc.headlines.length).mul(15);
    rawScore = rawScore.add(headlineScore);
    evidence.push({
      id: `${snapshot.snapshotId}-fund-headlines`,
      kind: 'OBSERVED',
      department,
      metric: 'headlineSentimentCount',
      value: `${oc.headlines.length} item(s), netTilt=${netTilt}`,
      source: 'onChainAndMacro.headlines',
      observedAt: snapshot.asOf,
      dataStatus: oc.status,
      note: `All headlines verified publishedAt <= ${snapshot.asOf}.`,
    });
  } else {
    missingData.push('headlines');
  }

  if (activeSignals === 0) {
    return {
      department,
      status: 'UNAVAILABLE',
      stance: 'ABSTAIN',
      score: '0.00',
      confidence: '0.00',
      summary: 'DATA_UNAVAILABLE: All on-chain, macro regime, and sentiment fields are null.',
      metrics: { activeSignals: '0' },
      evidence,
      riskFlags,
      missingData,
      durationMs: Math.max(0, Date.now() - startMs),
    };
  }

  const clampedScore = floorSigned(minDec(dec('100'), maxDec(dec('-100'), rawScore)), 2);
  const stance =
    oc.status !== 'LIVE'
      ? 'ABSTAIN'
      : clampedScore.gte(15)
        ? 'BULLISH'
        : clampedScore.lte(-15)
          ? 'BEARISH'
          : 'NEUTRAL';

  const coverageRatio = dec(String(activeSignals)).div(6);
  const rawConf = oc.status === 'LIVE' ? minDec(dec('0.88'), coverageRatio.mul('0.80').add('0.15')) : dec('0.20');

  const metrics: Record<string, string | null> = {
    nvtRatio: toOptionalFixedStr(nvt.ratio, 2),
    nvtSignal: nvt.signal,
    mvrvRatio: toOptionalFixedStr(mvrv.ratio, 4),
    mvrvSignal: mvrv.signal,
    exchangeNetflowUsd: toOptionalFixedStr(netflow.netflowUsd, 2),
    exchangeNetflowSignal: netflow.signal,
    smartMoneyFlowRatio: toOptionalFixedStr(smf.smfRatio, 4),
    tokenVelocity: toOptionalFixedStr(velocity.velocity, 4),
    tokenVelocityClass: velocity.interpretation,
    regimeScore: toOptionalFixedStr(regime.score, 2),
    regimeZone: regime.zone,
    headlineCount: String(oc.headlines.length),
  };

  const fallbackSummary =
    `Crypto Fundamentals & Regime (${snapshot.symbol}): Stance=${stance} (score=${clampedScore.toFixed(2)}). ` +
    `Regime=${metrics.regimeScore ?? 'N/A'}/100 (${regime.zone}), NVT=${metrics.nvtRatio ?? 'N/A'} (${nvt.signal}), ` +
    `MVRV=${metrics.mvrvRatio ?? 'N/A'} (${mvrv.signal}), Netflow=${metrics.exchangeNetflowUsd ?? 'N/A'} USD (${netflow.signal}).`;

  const narrative = await llm.narrate({
    department,
    rolePrompt: 'Crypto On-Chain Fundamentals, Tokenomics & Macro Regime Analyst.',
    structuredContext: metrics,
    fallbackSummary,
  });

  return {
    department,
    status: oc.status === 'LIVE' && activeSignals >= 2 ? 'OK' : 'DEGRADED',
    stance,
    score: clampedScore.toFixed(2),
    confidence: floorSigned(rawConf, 2).toFixed(2),
    summary: narrative.text,
    metrics,
    evidence,
    riskFlags,
    missingData,
    durationMs: Math.max(0, Date.now() - startMs),
  };
}
