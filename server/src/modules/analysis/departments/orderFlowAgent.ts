import {
  dec,
  estimateDepthSlippageDec,
  floorSigned,
  liquidityScoreDec,
  maxDec,
  minDec,
  orderBookImbalanceDec,
  roundDown,
  spreadBpsDec,
  takerFlowImbalanceDec,
  toOptionalFixedStr,
  ZERO,
  type BookLevel,
} from '@cex/core';
import type { CryptoMarketSnapshot, DepartmentFinding, EvidenceItem, RiskFlag } from '@cex/contracts';
import type { ResilientLlmAdapter } from '../llmAdapter.ts';

/**
 * Department 2: Order Flow & Market Microstructure Agent
 *
 * Responsibilities:
 * - Evaluates top-of-book bid-ask spread, L2 depth imbalance, `walkBook` slippage for a reference order,
 *   and public trade aggressor flow (`isBuyerMaker`).
 * - Flags illiquid books or wide spreads that would make execution hazardous.
 */
export async function runOrderFlowMicrostructureAgent(
  snapshot: CryptoMarketSnapshot,
  llm: ResilientLlmAdapter,
): Promise<DepartmentFinding> {
  const startMs = Date.now();
  const department = 'order_flow_microstructure' as const;
  const missingData: string[] = [];
  const riskFlags: RiskFlag[] = [];
  const evidence: EvidenceItem[] = [];

  const bids: BookLevel[] = snapshot.spot.bids.map((b) => ({ price: dec(b.price), qty: dec(b.qty) }));
  const asks: BookLevel[] = snapshot.spot.asks.map((a) => ({ price: dec(a.price), qty: dec(a.qty) }));

  if (snapshot.spotDataStatus === 'UNAVAILABLE' || bids.length === 0 || asks.length === 0) {
    missingData.push('spot.orderBook (bids or asks empty)');
    riskFlags.push({
      code: 'MICRO_ORDERBOOK_EMPTY',
      severity: 'BLOCKER',
      department,
      title: 'Order book depth unavailable',
      detail: `Visible order book has ${bids.length} bid(s) and ${asks.length} ask(s); execution slippage cannot be bounded.`,
      blocksExecution: true,
    });
    return {
      department,
      status: snapshot.spotDataStatus === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'DEGRADED',
      stance: 'ABSTAIN',
      score: '0.00',
      confidence: '0.00',
      summary: 'DATA_UNAVAILABLE: Order book depth is empty or unavailable; microstructure review blocks execution.',
      metrics: { bidLevels: String(bids.length), askLevels: String(asks.length) },
      evidence,
      riskFlags,
      missingData,
      durationMs: Math.max(0, Date.now() - startMs),
    };
  }

  const bestBid = snapshot.spot.bestBid ? dec(snapshot.spot.bestBid) : bids[0]!.price;
  const bestAsk = snapshot.spot.bestAsk ? dec(snapshot.spot.bestAsk) : asks[0]!.price;
  const spreadBps = spreadBpsDec(bestBid, bestAsk);
  const obi = orderBookImbalanceDec(bids, asks, 20);
  const stepSize = dec(snapshot.rules.stepSize);
  const refNotional = dec('25000');

  const buySlippage = estimateDepthSlippageDec('BUY', asks, refNotional, stepSize);
  const sellSlippage = estimateDepthSlippageDec('SELL', bids, refNotional, stepSize);

  // Compute total depth within 2% of mid price
  const mid = bestBid.add(bestAsk).div(2);
  let depthWithin2PctUsdt = ZERO;
  for (const b of bids) {
    if (mid.sub(b.price).div(mid).lte('0.02')) {
      depthWithin2PctUsdt = depthWithin2PctUsdt.add(b.price.mul(b.qty));
    }
  }
  for (const a of asks) {
    if (a.price.sub(mid).div(mid).lte('0.02')) {
      depthWithin2PctUsdt = depthWithin2PctUsdt.add(a.price.mul(a.qty));
    }
  }

  const takerFlow = takerFlowImbalanceDec(
    snapshot.spot.recentTrades.map((t) => ({
      price: dec(t.price),
      qty: dec(t.qty),
      isBuyerMaker: t.isBuyerMaker,
    })),
  );
  if (snapshot.spot.recentTrades.length === 0) {
    missingData.push('spot.recentTrades (0 trades in window)');
  }

  const liqScore = liquidityScoreDec({
    depthWithin2PctUsdt,
    spreadBps,
    targetPositionUsdt: refNotional,
    poolOrQuoteVolumeUsdt: snapshot.spot.quoteVolume24h ? dec(snapshot.spot.quoteVolume24h) : null,
  });

  // OBSERVED evidence
  if (spreadBps) {
    evidence.push({
      id: `${snapshot.snapshotId}-micro-spread`,
      kind: 'OBSERVED',
      department,
      metric: 'spreadBps',
      value: spreadBps.toFixed(4),
      source: 'spot.orderBook.topOfBook',
      observedAt: snapshot.spot.bookUpdatedAt ?? snapshot.asOf,
      dataStatus: snapshot.spotDataStatus,
      note: `Top-of-book bid=${bestBid.toFixed(4)}, ask=${bestAsk.toFixed(4)}.`,
    });
  }

  evidence.push({
    id: `${snapshot.snapshotId}-micro-depth2pct`,
    kind: 'OBSERVED',
    department,
    metric: 'depthWithin2PctUsdt',
    value: roundDown(depthWithin2PctUsdt, 2).toFixed(2),
    source: 'spot.orderBook.L2',
    observedAt: snapshot.spot.bookUpdatedAt ?? snapshot.asOf,
    dataStatus: snapshot.spotDataStatus,
    note: 'Combined bid + ask notional depth within 2% of mid price.',
  });

  if (takerFlow.imbalanceRatio) {
    evidence.push({
      id: `${snapshot.snapshotId}-micro-takerflow`,
      kind: 'OBSERVED',
      department,
      metric: 'takerFlowImbalanceRatio',
      value: takerFlow.imbalanceRatio.toFixed(4),
      source: `spot.recentTrades(${snapshot.spot.recentTrades.length})`,
      observedAt: snapshot.asOf,
      dataStatus: snapshot.spotDataStatus,
      note: `Net aggressor taker delta = ${takerFlow.netTakerFlowUsdt.toFixed(2)} USDT.`,
    });
  }

  // Risk flags for spread & thin book
  if (spreadBps && spreadBps.gt(80)) {
    riskFlags.push({
      code: 'MICRO_WIDE_SPREAD',
      severity: 'BLOCKER',
      department,
      title: 'Excessive bid-ask spread',
      detail: `Top-of-book spread is ${spreadBps.toFixed(2)} bps (> 80 bps threshold); market orders face severe immediate cost.`,
      blocksExecution: true,
    });
  } else if (spreadBps && spreadBps.gt(25)) {
    riskFlags.push({
      code: 'MICRO_ELEVATED_SPREAD',
      severity: 'WARNING',
      department,
      title: 'Elevated bid-ask spread',
      detail: `Spread is ${spreadBps.toFixed(2)} bps (> 25 bps); prefer passive limit execution.`,
      blocksExecution: false,
    });
  }

  if (!buySlippage.reachable || !sellSlippage.reachable || liqScore.lt(30)) {
    riskFlags.push({
      code: 'MICRO_THIN_ORDERBOOK',
      severity: !buySlippage.reachable && !sellSlippage.reachable ? 'BLOCKER' : 'WARNING',
      department,
      title: 'Thin order book liquidity',
      detail: `Liquidity score=${liqScore.toFixed(2)}/100; $25k BUY reachable=${buySlippage.reachable}, SELL reachable=${sellSlippage.reachable}.`,
      blocksExecution: !buySlippage.reachable && !sellSlippage.reachable,
    });
  }

  // Directional microstructure score (-100..+100) from book imbalance (50%) + taker flow (50%)
  const obiScore = obi ? obi.mul(55) : ZERO;
  const takerScore = takerFlow.imbalanceRatio ? takerFlow.imbalanceRatio.mul(45) : ZERO;
  const clampedScore = floorSigned(minDec(dec('100'), maxDec(dec('-100'), obiScore.add(takerScore))), 2);

  const stance =
    snapshot.spotDataStatus !== 'LIVE'
      ? 'ABSTAIN'
      : clampedScore.gte(15)
        ? 'BULLISH'
        : clampedScore.lte(-15)
          ? 'BEARISH'
          : 'NEUTRAL';

  evidence.push({
    id: `${snapshot.snapshotId}-micro-inference`,
    kind: 'INFERRED',
    department,
    metric: 'orderFlowPressure',
    value: stance,
    source: 'orderFlowAgent',
    observedAt: snapshot.asOf,
    dataStatus: snapshot.spotDataStatus,
    note: `Inferred from L2 OBI=${obi ? obi.toFixed(4) : 'N/A'} and taker flow imbalance=${takerFlow.imbalanceRatio ? takerFlow.imbalanceRatio.toFixed(4) : 'N/A'}.`,
  });

  const rawConf =
    snapshot.spotDataStatus === 'LIVE'
      ? minDec(dec('0.92'), liqScore.div(120).add(snapshot.spot.recentTrades.length > 0 ? '0.25' : '0.10'))
      : dec('0.20');

  const metrics: Record<string, string | null> = {
    spreadBps: toOptionalFixedStr(spreadBps, 4),
    orderBookImbalance: toOptionalFixedStr(obi, 4),
    depthWithin2PctUsdt: roundDown(depthWithin2PctUsdt, 2).toFixed(2),
    buySlippage25kBps: toOptionalFixedStr(buySlippage.slippageBps, 4),
    sellSlippage25kBps: toOptionalFixedStr(sellSlippage.slippageBps, 4),
    netTakerFlowUsdt: takerFlow.netTakerFlowUsdt.toFixed(2),
    takerImbalanceRatio: toOptionalFixedStr(takerFlow.imbalanceRatio, 4),
    liquidityScore: liqScore.toFixed(2),
  };

  const fallbackSummary =
    `Order Flow & Microstructure (${snapshot.symbol}): Stance=${stance} (score=${clampedScore.toFixed(2)}). ` +
    `Spread=${metrics.spreadBps ?? 'N/A'} bps, OBI=${metrics.orderBookImbalance ?? 'N/A'}, ` +
    `NetTakerFlow=${metrics.netTakerFlowUsdt} USDT, LiquidityScore=${metrics.liquidityScore}/100.`;

  const narrative = await llm.narrate({
    department,
    rolePrompt: 'Crypto Order Flow & Market Microstructure Specialist.',
    structuredContext: metrics,
    fallbackSummary,
  });

  return {
    department,
    status: snapshot.spotDataStatus === 'LIVE' ? 'OK' : 'DEGRADED',
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
