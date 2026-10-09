import { NormalizedCandle, NormalizedMarketQuote, NormalizedMarketRegime } from './types';

export class MarketRegimeEngine {
  public static computeRegime(
    markets: NormalizedMarketQuote[],
    btcCandles: NormalizedCandle[] = [],
    ethCandles: NormalizedCandle[] = []
  ): NormalizedMarketRegime {
    const now = Date.now();
    if (!markets || markets.length === 0) {
      return {
        regime: 'TRANSITIONAL',
        score: 50,
        sentiment: 'NEUTRAL',
        breadthPercentage: 50,
        advancersCount: 0,
        declinersCount: 0,
        btcDominance: 55,
        ethDominance: 15,
        totalMarketCapUSD: 0,
        total2USD: 0,
        total3USD: 0,
        averageAtrPercent: 3.5,
        components: {
          btcTrendScore: 50,
          ethTrendScore: 50,
          breadthScore: 50,
          volatilityScore: 50,
          momentumScore: 50
        },
        methodology: 'Awaiting market quote ingestion.',
        timestamp: now,
        source: 'Deterministic Regime Engine',
        status: 'DATA_UNAVAILABLE'
      };
    }

    // 1. Calculate Advancers vs Decliners
    let advancers = 0;
    let decliners = 0;
    let totalCap = 0;
    let btcCap = 0;
    let ethCap = 0;
    let sumAbsChange = 0;

    for (const m of markets) {
      totalCap += m.marketCap;
      sumAbsChange += Math.abs(m.change24h);
      if (m.symbol === 'BTC') btcCap = m.marketCap;
      if (m.symbol === 'ETH') ethCap = m.marketCap;

      if (m.change24h > 0) advancers++;
      else if (m.change24h < 0) decliners++;
    }

    const breadthPercentage = Number(((advancers / markets.length) * 100).toFixed(1));
    const btcDominance = totalCap > 0 ? Number(((btcCap / totalCap) * 100).toFixed(1)) : 56.5;
    const ethDominance = totalCap > 0 ? Number(((ethCap / totalCap) * 100).toFixed(1)) : 14.2;
    const total2USD = totalCap - btcCap;
    const total3USD = totalCap - btcCap - ethCap;
    const avgChange = sumAbsChange / markets.length;

    // 2. Compute Sub-component scores
    const btcCoin = markets.find(m => m.symbol === 'BTC');
    const ethCoin = markets.find(m => m.symbol === 'ETH');

    let btcTrendScore = 50;
    if (btcCoin) {
      if (btcCoin.change24h > 4) btcTrendScore = 90;
      else if (btcCoin.change24h > 1.5) btcTrendScore = 75;
      else if (btcCoin.change24h > -1.5) btcTrendScore = 55;
      else if (btcCoin.change24h > -4) btcTrendScore = 35;
      else btcTrendScore = 15;
    }

    let ethTrendScore = 50;
    if (ethCoin) {
      if (ethCoin.change24h > 4) ethTrendScore = 90;
      else if (ethCoin.change24h > 1.5) ethTrendScore = 75;
      else if (ethCoin.change24h > -1.5) ethTrendScore = 55;
      else ethTrendScore = 30;
    }

    const breadthScore = breadthPercentage;
    const momentumScore = Number(((btcTrendScore * 0.4) + (ethTrendScore * 0.2) + (breadthScore * 0.4)).toFixed(1));
    const volatilityScore = Math.min(100, Math.max(10, Math.round(avgChange * 18)));

    // 3. Composite Regime Score (0 - 100)
    const compositeScore = Math.round(
      btcTrendScore * 0.35 +
      ethTrendScore * 0.15 +
      breadthScore * 0.35 +
      (100 - Math.abs(50 - volatilityScore)) * 0.15
    );

    // 4. Regime Classification
    let regime: NormalizedMarketRegime['regime'] = 'RANGE_BOUND';
    let sentiment: NormalizedMarketRegime['sentiment'] = 'NEUTRAL';

    if (breadthPercentage >= 65 && btcCoin?.change24h !== undefined && btcCoin?.change24h !== null && btcCoin.change24h >= 0) {
      regime = 'BULLISH_EXPANSION';
      sentiment = 'RISK_ON';
    } else if (breadthPercentage <= 35 && btcCoin?.change24h !== undefined && btcCoin?.change24h !== null && btcCoin.change24h < 0) {
      regime = 'BEARISH_DISTRIBUTION';
      sentiment = 'RISK_OFF';
    } else if (avgChange < 1.2) {
      regime = 'VOLATILITY_SQUEEZE';
      sentiment = 'NEUTRAL';
    } else if (Math.abs(advancers - decliners) <= 3) {
      regime = 'RANGE_BOUND';
      sentiment = 'NEUTRAL';
    } else {
      regime = 'TRANSITIONAL';
      sentiment = compositeScore > 50 ? 'RISK_ON' : 'RISK_OFF';
    }

    return {
      regime,
      score: compositeScore,
      sentiment,
      breadthPercentage,
      advancersCount: advancers,
      declinersCount: decliners,
      btcDominance,
      ethDominance,
      totalMarketCapUSD: totalCap,
      total2USD,
      total3USD,
      averageAtrPercent: Number(avgChange.toFixed(2)),
      components: {
        btcTrendScore,
        ethTrendScore,
        breadthScore,
        volatilityScore,
        momentumScore
      },
      methodology: `Deterministic calculation from ${markets.length} tracked universe assets (${advancers} advancers / ${decliners} decliners, BTC 24h: ${btcCoin?.change24h || 0}%, Breadth: ${breadthPercentage}%).`,
      timestamp: now,
      source: 'Deterministic Market Regime Engine',
      status: 'LIVE'
    };
  }
}
