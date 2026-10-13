import {
  classifyOiPriceRegime,
  dec,
  floorSigned,
  fundingAnnualizedPctDec,
  liquidationBufferBpsDec,
  maxDec,
  minDec,
  openInterestMomentumPctDec,
  perpBasisBpsDec,
  toOptionalFixedStr,
  ZERO,
} from '@cex/core';
import type { CryptoMarketSnapshot, DepartmentFinding, EvidenceItem, RiskFlag } from '@cex/contracts';
import type { ResilientLlmAdapter } from '../llmAdapter.ts';

/**
 * Department 3: Derivatives & Positioning Agent
 *
 * Responsibilities:
 * - Evaluates perpetual mark-to-index basis, 8-hour funding rate & annualized carry,
 *   open interest momentum, 4-quadrant positioning regime, and liquidation proximity for active positions.
 */
export async function runDerivativesPositioningAgent(
  snapshot: CryptoMarketSnapshot,
  llm: ResilientLlmAdapter,
): Promise<DepartmentFinding> {
  const startMs = Date.now();
  const department = 'derivatives_positioning' as const;
  const missingData: string[] = [];
  const riskFlags: RiskFlag[] = [];
  const evidence: EvidenceItem[] = [];

  const deriv = snapshot.derivatives;
  if (!deriv || deriv.status === 'UNAVAILABLE' || !deriv.markPrice) {
    missingData.push('derivatives.markPrice / futures feed unavailable');
    return {
      department,
      status: 'UNAVAILABLE',
      stance: 'ABSTAIN',
      score: '0.00',
      confidence: '0.00',
      summary: 'DATA_UNAVAILABLE: Perpetual futures feed is not connected or unavailable for this symbol.',
      metrics: { futuresStatus: deriv?.status ?? 'UNAVAILABLE' },
      evidence,
      riskFlags,
      missingData,
      durationMs: Math.max(0, Date.now() - startMs),
    };
  }

  const markPrice = dec(deriv.markPrice);
  const indexPrice = deriv.indexPrice ? dec(deriv.indexPrice) : snapshot.spot.lastPrice ? dec(snapshot.spot.lastPrice) : null;
  const funding8h = deriv.lastFundingRate ? dec(deriv.lastFundingRate) : null;
  const basisBps = perpBasisBpsDec(markPrice, indexPrice);
  const fundingAprPct = fundingAnnualizedPctDec(funding8h, 3);

  const oiDecs = deriv.openInterestSeries.map(dec);
  const oiMomentumPct =
    oiDecs.length >= 2 ? openInterestMomentumPctDec(oiDecs, Math.min(7, oiDecs.length - 1)) : null;
  if (!oiMomentumPct) {
    missingData.push('derivatives.openInterestSeries (need >= 2 points)');
  }

  const priceChangePct = snapshot.spot.priceChangePct24h ? dec(snapshot.spot.priceChangePct24h) : null;
  const oiRegime = classifyOiPriceRegime(priceChangePct, oiMomentumPct);

  // OBSERVED evidence
  evidence.push({
    id: `${snapshot.snapshotId}-deriv-mark`,
    kind: 'OBSERVED',
    department,
    metric: 'perpMarkPrice',
    value: markPrice.toFixed(8),
    source: 'derivatives.markPrice',
    observedAt: deriv.updatedAt ?? snapshot.asOf,
    dataStatus: deriv.status,
    note: `Perp mark=${markPrice.toFixed(2)}, index=${indexPrice ? indexPrice.toFixed(2) : 'N/A'}, basis=${basisBps ? basisBps.toFixed(2) : 'N/A'} bps.`,
  });

  if (funding8h) {
    evidence.push({
      id: `${snapshot.snapshotId}-deriv-funding`,
      kind: 'OBSERVED',
      department,
      metric: 'fundingRate8h',
      value: funding8h.toFixed(6),
      source: 'derivatives.lastFundingRate',
      observedAt: deriv.updatedAt ?? snapshot.asOf,
      dataStatus: deriv.status,
      note: `Annualized perp funding rate = ${fundingAprPct ? fundingAprPct.toFixed(2) : 'N/A'}% APR.`,
    });
  }

  // Check active futures position liquidation proximity
  let minLiqBufferBps = null as ReturnType<typeof dec> | null;
  for (const pos of snapshot.portfolio.activePositions) {
    if (pos.symbol === snapshot.symbol && pos.marketType === 'FUTURES_PERP' && pos.marginUsdt) {
      const buf = liquidationBufferBpsDec(
        pos.side,
        dec(pos.entryPrice),
        markPrice,
        dec(pos.qty),
        dec(pos.marginUsdt),
        dec(pos.maintenanceMarginRate ?? deriv.maintenanceMarginRate),
      );
      if (buf.bufferBps !== null) {
        minLiqBufferBps = minLiqBufferBps === null ? buf.bufferBps : minDec(minLiqBufferBps, buf.bufferBps);
      }
      if (buf.isLiquidatable || (buf.bufferBps !== null && buf.bufferBps.lt(300))) {
        riskFlags.push({
          code: 'DERIV_LIQUIDATION_PROXIMITY',
          severity: 'BLOCKER',
          department,
          title: 'Active futures position near liquidation',
          detail: `Active ${pos.side} position buffer to liquidation is ${buf.bufferBps ? buf.bufferBps.toFixed(2) : '0'} bps (< 300 bps threshold).`,
          blocksExecution: true,
        });
      }
    }
  }

  // Score calculation: contrarian funding + OI regime + basis sanity
  let rawScore = ZERO;

  // OI regime signal
  if (oiRegime === 'LONG_BUILDUP') rawScore = rawScore.add(28);
  else if (oiRegime === 'SHORT_SQUEEZE') rawScore = rawScore.add(18);
  else if (oiRegime === 'SHORT_BUILDUP') rawScore = rawScore.sub(28);
  else if (oiRegime === 'LONG_LIQUIDATION') rawScore = rawScore.sub(18);

  // Funding crowding adjustment (contrarian at extremes, healthy trend confirmation at mild levels)
  if (funding8h) {
    if (funding8h.gt('0.0005')) {
      // > 0.05% per 8h (> 54.75% APR) = overcrowded longs
      rawScore = rawScore.sub(30);
      riskFlags.push({
        code: 'DERIV_CROWDED_LONG_FUNDING',
        severity: 'WARNING',
        department,
        title: 'Overcrowded long perpetual funding',
        detail: `8h funding rate is ${funding8h.mul(100).toFixed(4)}% (${fundingAprPct?.toFixed(2)}% APR), indicating elevated long-squeeze risk.`,
        blocksExecution: false,
      });
    } else if (funding8h.lt('-0.0005')) {
      // < -0.05% per 8h = overcrowded shorts
      rawScore = rawScore.add(30);
      riskFlags.push({
        code: 'DERIV_CROWDED_SHORT_FUNDING',
        severity: 'WARNING',
        department,
        title: 'Overcrowded short perpetual funding',
        detail: `8h funding rate is ${funding8h.mul(100).toFixed(4)}% (${fundingAprPct?.toFixed(2)}% APR), indicating elevated short-squeeze risk.`,
        blocksExecution: false,
      });
    } else if (funding8h.gt(ZERO)) {
      rawScore = rawScore.add(8);
    } else if (funding8h.lt(ZERO)) {
      rawScore = rawScore.sub(8);
    }
  }

  // Basis check
  if (basisBps) {
    if (basisBps.abs().gt(150)) {
      riskFlags.push({
        code: 'DERIV_EXTREME_BASIS_DISLOCATION',
        severity: 'WARNING',
        department,
        title: 'Extreme perpetual mark-index basis dislocation',
        detail: `Perp basis is ${basisBps.toFixed(2)} bps (> 150 bps), indicating mark-index divergence.`,
        blocksExecution: false,
      });
    }
  }

  const clampedScore = floorSigned(minDec(dec('100'), maxDec(dec('-100'), rawScore)), 2);
  const stance =
    deriv.status !== 'LIVE'
      ? 'ABSTAIN'
      : clampedScore.gte(15)
        ? 'BULLISH'
        : clampedScore.lte(-15)
          ? 'BEARISH'
          : 'NEUTRAL';

  evidence.push({
    id: `${snapshot.snapshotId}-deriv-regime-inference`,
    kind: 'INFERRED',
    department,
    metric: 'oiPositioningRegime',
    value: oiRegime,
    source: 'derivativesAgent',
    observedAt: snapshot.asOf,
    dataStatus: deriv.status,
    note: `Inferred 4-quadrant OI×Price regime=${oiRegime} with fundingAPR=${fundingAprPct ? fundingAprPct.toFixed(2) : 'N/A'}%.`,
  });

  const hasOi = oiMomentumPct !== null;
  const rawConf = deriv.status === 'LIVE' ? dec(hasOi ? '0.82' : '0.60') : dec('0.20');

  const metrics: Record<string, string | null> = {
    markPrice: markPrice.toFixed(8),
    indexPrice: toOptionalFixedStr(indexPrice, 8),
    basisBps: toOptionalFixedStr(basisBps, 2),
    fundingRate8h: toOptionalFixedStr(funding8h, 6),
    fundingAnnualizedPct: toOptionalFixedStr(fundingAprPct, 2),
    oiMomentumPct: toOptionalFixedStr(oiMomentumPct, 2),
    oiPriceRegime: oiRegime,
    minLiquidationBufferBps: toOptionalFixedStr(minLiqBufferBps, 2),
  };

  const fallbackSummary =
    `Derivatives & Positioning (${snapshot.symbol}): Stance=${stance} (score=${clampedScore.toFixed(2)}), Regime=${oiRegime}. ` +
    `Basis=${metrics.basisBps ?? 'N/A'} bps, Funding8h=${metrics.fundingRate8h ?? 'N/A'} (${metrics.fundingAnnualizedPct ?? 'N/A'}% APR), ` +
    `OIMomentum=${metrics.oiMomentumPct ?? 'N/A'}%.`;

  const narrative = await llm.narrate({
    department,
    rolePrompt: 'Crypto Derivatives, Funding Rate & Open Interest Positioning Analyst.',
    structuredContext: metrics,
    fallbackSummary,
  });

  return {
    department,
    status: deriv.status === 'LIVE' ? 'OK' : 'DEGRADED',
    stance,
    score: clampedScore.toFixed(2),
    confidence: rawConf.toFixed(2),
    summary: narrative.text,
    metrics,
    evidence,
    riskFlags,
    missingData,
    durationMs: Math.max(0, Date.now() - startMs),
  };
}
