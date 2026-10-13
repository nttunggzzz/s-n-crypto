import { dec, floorSigned, type Dec } from '@cex/core';
import type { CryptoAnalysisRating } from '@cex/contracts';

export interface DecisionMemoryEpisode {
  episodeId: string;
  symbol: string;
  decisionAtMs: number;
  horizonMs: number;
  resolvedAtMs: number | null;
  rating: CryptoAnalysisRating;
  entryPrice: string;
  resolvedPrice: string | null;
  realizedReturnPct: string | null;
  outcomeCorrect: boolean | null;
  lesson: string | null;
}

/**
 * Crypto 24/7 Point-in-Time Decision Memory Log (adapted from upstream `memory_log/settlement.py` #1251).
 *
 * Key crypto adaptations:
 * 1. Exact 24/7 UTC millisecond settlement windows (`decisionAtMs + horizonMs`) instead of 5/7 equity business days.
 * 2. Point-in-time retrieval (`getSettledLessonsAsOf`): strictly filters `resolvedAtMs !== null && resolvedAtMs <= asOfMs`
 *    so future trade outcomes never leak into historical analysis or walk-forward folds.
 */
export class PointInTimeMemoryLog {
  private readonly episodes = new Map<string, DecisionMemoryEpisode>();

  recordDecision(params: {
    episodeId: string;
    symbol: string;
    decisionAtMs: number;
    horizonHours?: number;
    rating: CryptoAnalysisRating;
    entryPrice: string;
  }): DecisionMemoryEpisode {
    const horizonMs = Math.max(1, params.horizonHours ?? 24) * 3_600_000;
    const ep: DecisionMemoryEpisode = {
      episodeId: params.episodeId,
      symbol: params.symbol,
      decisionAtMs: params.decisionAtMs,
      horizonMs,
      resolvedAtMs: null,
      rating: params.rating,
      entryPrice: params.entryPrice,
      resolvedPrice: null,
      realizedReturnPct: null,
      outcomeCorrect: null,
      lesson: null,
    };
    this.episodes.set(ep.episodeId, ep);
    return ep;
  }

  /**
   * Settles any open episodes whose `decisionAtMs + horizonMs <= barCloseTimeMs`.
   */
  settleDueEpisodes(params: {
    symbol: string;
    barCloseTimeMs: number;
    closePrice: string;
  }): DecisionMemoryEpisode[] {
    const settled: DecisionMemoryEpisode[] = [];
    const closeDec = dec(params.closePrice);
    if (closeDec.lte(0)) return settled;

    for (const ep of this.episodes.values()) {
      if (ep.symbol !== params.symbol || ep.resolvedAtMs !== null) continue;
      const dueAtMs = ep.decisionAtMs + ep.horizonMs;
      if (params.barCloseTimeMs < dueAtMs) continue;

      const entryDec = dec(ep.entryPrice);
      if (entryDec.lte(0)) continue;

      const rawReturnPct: Dec = closeDec.sub(entryDec).div(entryDec).mul(100);
      const retStr = floorSigned(rawReturnPct, 4).toFixed(4);
      let correct: boolean | null = null;
      if (ep.rating === 'BUY' || ep.rating === 'OVERWEIGHT') {
        correct = rawReturnPct.gt(0);
      } else if (ep.rating === 'SELL' || ep.rating === 'UNDERWEIGHT') {
        correct = rawReturnPct.lt(0);
      }

      ep.resolvedAtMs = params.barCloseTimeMs;
      ep.resolvedPrice = params.closePrice;
      ep.realizedReturnPct = retStr;
      ep.outcomeCorrect = correct;
      ep.lesson =
        correct === null
          ? `Episode ${ep.episodeId} (${ep.rating}) settled with ${retStr}% move.`
          : correct
            ? `Validated ${ep.rating} call on ${ep.symbol}: price moved ${retStr}% over ${ep.horizonMs / 3_600_000}h.`
            : `Caution on ${ep.symbol}: prior ${ep.rating} call experienced adverse ${retStr}% move over ${ep.horizonMs / 3_600_000}h.`;
      settled.push({ ...ep });
    }
    return settled;
  }

  /**
   * Returns only lessons whose settlement timestamp is `<= asOfMs`.
   * Prevents look-ahead leakage when replaying historical dates.
   */
  getSettledLessonsAsOf(symbol: string, asOfMs: number, limit = 5): DecisionMemoryEpisode[] {
    const eligible: DecisionMemoryEpisode[] = [];
    for (const ep of this.episodes.values()) {
      if (ep.symbol === symbol && ep.resolvedAtMs !== null && ep.resolvedAtMs <= asOfMs) {
        eligible.push({ ...ep });
      }
    }
    eligible.sort((a, b) => (b.resolvedAtMs ?? 0) - (a.resolvedAtMs ?? 0));
    return eligible.slice(0, limit);
  }
}
