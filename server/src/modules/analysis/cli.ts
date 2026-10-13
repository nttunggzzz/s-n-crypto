import { dec, toFixedStr } from '@cex/core';
import { CryptoTradingAgentsOrchestrator } from './orchestrator.ts';
import { runWalkForwardBacktest, type HistoricalBacktestBar } from './backtester.ts';

function buildDeterministicSampleBars(count = 45): HistoricalBacktestBar[] {
  const baseTime = Date.parse('2026-10-01T00:00:00.000Z');
  const bars: HistoricalBacktestBar[] = [];
  let price = dec('64000');

  for (let i = 0; i < count; i++) {
    // Deterministic wave + trend
    const step = i % 5 === 0 ? dec('-120') : dec('185');
    const open = price;
    const close = price.add(step);
    const high = (close.gt(open) ? close : open).add('140');
    const low = (close.lt(open) ? close : open).sub('110');
    const vol = dec('180').add(String((i % 7) * 15));
    const quoteVol = vol.mul(close);

    bars.push({
      openTime: baseTime + i * 3_600_000,
      closeTime: baseTime + (i + 1) * 3_600_000 - 1,
      open: open.toFixed(2),
      high: high.toFixed(2),
      low: low.toFixed(2),
      close: close.toFixed(2),
      volume: vol.toFixed(5),
      quoteVolume: toFixedStr(quoteVol),
      closed: true,
      dataStatus: 'LIVE',
      spreadBps: '3.2000',
      fundingRate8h: '0.000100',
      openInterest: dec('150000000').add(String(i * 1_200_000)).toFixed(2),
    });
    price = close;
  }
  return bars;
}

async function main() {
  const bars = buildDeterministicSampleBars(45);
  const lastBar = bars[bars.length - 1]!;
  const rules = {
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    tickSize: '0.01',
    stepSize: '0.00001',
    minQty: '0.00010',
    maxQty: '100.00000',
    minNotional: '10.00',
    feeRate: '0.0010',
  };

  const orchestrator = new CryptoTradingAgentsOrchestrator({ maxDebateRounds: 2 });
  const report = await orchestrator.analyzeFromRawInput({
    symbol: 'BTCUSDT',
    interval: '1h',
    asOfMs: lastBar.closeTime,
    spotDataStatus: 'LIVE',
    futuresDataStatus: 'LIVE',
    rules,
    spot: {
      lastPrice: lastBar.close,
      bestBid: dec(lastBar.close).sub('5').toFixed(2),
      bestAsk: dec(lastBar.close).add('5').toFixed(2),
      priceChangePct24h: '4.20',
      quoteVolume24h: '420000000.00',
      tickerUpdatedAtMs: lastBar.closeTime,
      bookUpdatedAtMs: lastBar.closeTime,
      bids: [
        { price: dec(lastBar.close).sub('5').toFixed(2), qty: '2.50000' },
        { price: dec(lastBar.close).sub('20').toFixed(2), qty: '6.00000' },
      ],
      asks: [
        { price: dec(lastBar.close).add('5').toFixed(2), qty: '1.80000' },
        { price: dec(lastBar.close).add('20').toFixed(2), qty: '4.20000' },
      ],
      recentTrades: [
        {
          id: 'tr-1',
          price: lastBar.close,
          qty: '1.40000',
          quoteQty: dec(lastBar.close).mul('1.4').toFixed(2),
          isBuyerMaker: false,
          time: lastBar.closeTime - 500,
        },
        {
          id: 'tr-2',
          price: dec(lastBar.close).sub('5').toFixed(2),
          qty: '0.50000',
          quoteQty: dec(lastBar.close).sub('5').mul('0.5').toFixed(2),
          isBuyerMaker: true,
          time: lastBar.closeTime - 250,
        },
      ],
      candles: bars,
    },
    derivatives: {
      status: 'LIVE',
      markPrice: dec(lastBar.close).add('8').toFixed(2),
      indexPrice: lastBar.close,
      lastFundingRate: '0.000100',
      nextFundingTime: lastBar.closeTime + 8 * 3_600_000,
      openInterestSeries: bars.slice(-10).map((b) => b.openInterest!),
      updatedAtMs: lastBar.closeTime,
    },
    onChainAndMacro: {
      status: 'LIVE',
      observedAtMs: lastBar.closeTime,
      marketCapUsd: '1320000000000',
      realizedCapUsd: '680000000000',
      dailyTxVolumeUsd: '48000000000',
      exchangeDepositsUsd: '410000000',
      exchangeWithdrawalsUsd: '690000000',
      smartBuysUsd: '95000000',
      smartSellsUsd: '42000000',
      circulatingSupply: '19750000',
      dailyVolumeTokens: '320000',
      btcTrendScore: '82',
      altBreadthScore: '68',
      btcDominanceScore: '74',
      perpFundingScore: '78',
      drawdownVolScore: '80',
      momentumThrustScore: '76',
      headlines: [
        {
          id: 'hl-1',
          title: 'Spot BTC orderbook depth expands alongside net exchange outflows',
          source: 'CEX Research Feed',
          publishedAt: new Date(lastBar.closeTime - 60_000).toISOString(),
          sentimentTilt: 'BULLISH',
        },
      ],
    },
    portfolio: {
      provided: true,
      equityUsdt: '100000.00000000',
      availableUsdt: '100000.00000000',
      currentDrawdownPct: '1.2000',
      dailyLossPct: '0.4000',
      weeklyLossPct: '0.8000',
      consecutiveLosses: 0,
      activePositions: [],
    },
  });

  const bt = await runWalkForwardBacktest({
    symbol: 'BTCUSDT',
    interval: '1h',
    initialEquityUsdt: '100000.00000000',
    rules,
    bars,
    warmupBars: 20,
    walkForwardFoldCount: 2,
  });

  process.stdout.write(
    JSON.stringify(
      {
        report: {
          reportId: report.reportId,
          symbol: report.symbol,
          asOf: report.asOf,
          rating: report.rating,
          confidence: report.confidence,
          uncertaintyScore: report.uncertaintyScore,
          advisoryProposal: report.advisoryProposal,
          runSignature: report.audit.runSignature,
        },
        backtestSummary: bt.summary,
      },
      null,
      2,
    ) + '\n',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
