import { describe, expect, it } from 'vitest';
import {
  atrDec,
  bollingerBandsDec,
  classifyOiPriceRegime,
  computeCryptoRegimeCompositeDec,
  computePositionSizingLadder,
  currentDrawdownPctDec,
  emaDec,
  emaSeriesDec,
  estimateDepthSlippageDec,
  evaluateCircuitBreakersDec,
  exchangeNetflowDec,
  fractionalKellyFractionDec,
  fundingAnnualizedPctDec,
  historicalVarAndCvarPctDec,
  liquidationBufferBpsDec,
  liquidityScoreDec,
  macdDec,
  maxDrawdownPctDec,
  mvrvRatioDec,
  nvtRatioDec,
  openInterestMomentumPctDec,
  orderBookImbalanceDec,
  perpBasisBpsDec,
  realizedVolatilityPctDec,
  rsiDec,
  smaDec,
  smartMoneyFlowDec,
  spreadBpsDec,
  takerFlowImbalanceDec,
  tokenVelocityDec,
  vwapDec,
  zScoreDec,
  type OhlcvCandleDec,
} from './quant.ts';
import { dec, ZERO } from './decimal.ts';

function buildCandles(closes: string[], opts?: { spreadPct?: string; volume?: string; closed?: boolean }): OhlcvCandleDec[] {
  const spread = dec(opts?.spreadPct ?? '0.01');
  const vol = dec(opts?.volume ?? '125.5');
  const closed = opts?.closed ?? true;
  return closes.map((close, idx) => {
    const c = dec(close);
    const high = c.mul(dec('1').add(spread));
    const low = c.mul(dec('1').sub(spread));
    const open = idx > 0 ? dec(closes[idx - 1]!) : c;
    return {
      openTime: 1_700_000_000_000 + idx * 3_600_000,
      closeTime: 1_700_000_000_000 + (idx + 1) * 3_600_000 - 1,
      open,
      high,
      low,
      close: c,
      volume: vol,
      quoteVolume: ZERO,
      closed,
    };
  });
}

describe('@cex/core quant calculators', () => {
  describe('technical indicators on closed candles', () => {
    it('computes SMA, EMA, RSI, MACD, Bollinger, ATR, VWAP, z-score, and realized volatility deterministically', () => {
      const closeStrs = [
        '60000', '60200', '60100', '60400', '60800', '60700', '61000',
        '61200', '61100', '61500', '61800', '61700', '62100', '62500',
        '62300', '62700', '63000', '62900', '63300', '63600', '63800',
        '64000', '64200', '64100', '64500', '64800', '65000', '65300',
        '65100', '65500', '65800', '66000', '66300', '66500', '66800',
      ];
      const closes = closeStrs.map(dec);
      const candles = buildCandles(closeStrs);

      const sma5 = smaDec(closes, 5);
      expect(sma5).not.toBeNull();
      // Last 5: 65800, 66000, 66300, 66500, 66800 -> avg = 66280
      expect(sma5?.toFixed(2)).toBe('66280.00');

      const ema10 = emaDec(closes, 10);
      expect(ema10).not.toBeNull();
      expect(ema10!.gt(dec('64000'))).toBe(true);
      expect(emaSeriesDec(closes, 10).length).toBeGreaterThan(20);

      const rsi14 = rsiDec(closes, 14);
      expect(rsi14).not.toBeNull();
      expect(rsi14!.gt(dec('60'))).toBe(true);
      expect(rsi14!.lte(dec('100'))).toBe(true);

      const macd = macdDec(closes, 12, 26, 9);
      expect(macd).not.toBeNull();
      expect(macd!.macd.gt(0)).toBe(true);

      const bb = bollingerBandsDec(closes, 20, dec('2'));
      expect(bb).not.toBeNull();
      expect(bb!.upper.gt(bb!.middle)).toBe(true);
      expect(bb!.lower.lt(bb!.middle)).toBe(true);
      expect(bb!.percentB!.gte(0)).toBe(true);

      const atr14 = atrDec(candles, 14);
      expect(atr14).not.toBeNull();
      expect(atr14!.gt(0)).toBe(true);

      const vwap = vwapDec(candles);
      expect(vwap).not.toBeNull();
      expect(vwap!.gt(dec('62000'))).toBe(true);

      const z = zScoreDec(closes, 20);
      expect(z).not.toBeNull();
      expect(z!.gt(0)).toBe(true);

      const rvol = realizedVolatilityPctDec(closes, 20, 365);
      expect(rvol).not.toBeNull();
      expect(rvol!.gt(0)).toBe(true);
    });

    it('ignores unclosed candles in ATR and VWAP to prevent look-ahead bias', () => {
      const closedCandles = buildCandles(['100', '102', '104', '106'], { closed: true });
      const withUnclosedSpike: OhlcvCandleDec[] = [
        ...closedCandles,
        {
          openTime: 1_700_020_000_000,
          closeTime: 1_700_023_599_999,
          open: dec('106'),
          high: dec('999999'),
          low: dec('1'),
          close: dec('500000'),
          volume: dec('999999'),
          quoteVolume: ZERO,
          closed: false,
        },
      ];
      expect(atrDec(withUnclosedSpike, 2)?.toFixed(8)).toBe(atrDec(closedCandles, 2)?.toFixed(8));
      expect(vwapDec(withUnclosedSpike)?.toFixed(8)).toBe(vwapDec(closedCandles)?.toFixed(8));
    });

    it('handles edge cases: 0 volume, flat prices, non-terminating division, PEPE small price, and > 2^53/100 large values', () => {
      // Non-terminating division 1/3 in SMA(3)
      const smaThird = smaDec(['1', '1', '2'].map(dec), 3);
      expect(smaThird?.toFixed(8)).toBe('1.33333333');

      // Flat prices -> RSI = 50, zScore = 0
      const flat = ['100', '100', '100', '100', '100'].map(dec);
      expect(rsiDec(flat, 3)?.toFixed(2)).toBe('50.00');
      expect(zScoreDec(flat, 3)?.toFixed(8)).toBe('0.00000000');

      // PEPE micro-price (0.00000406)
      const pepeCloses = ['0.00000402', '0.00000404', '0.00000406', '0.00000408', '0.00000410'].map(dec);
      expect(smaDec(pepeCloses, 5)?.toFixed(8)).toBe('0.00000406');

      // Large value > 2^53 / 100 (90,071,992,547,409.91)
      const largeCloses = [
        '100000000000000.12345678',
        '100000000000000.22345678',
        '100000000000000.32345678',
      ].map(dec);
      expect(smaDec(largeCloses, 3)?.toFixed(8)).toBe('100000000000000.22345678');

      // Zero volume VWAP returns null safely
      const zeroVolCandles = buildCandles(['100', '101'], { volume: '0' });
      expect(vwapDec(zeroVolCandles)).toBeNull();
    });
  });

  describe('order flow and microstructure calculators', () => {
    const bids = [
      { price: dec('65000.00'), qty: dec('1.50000') },
      { price: dec('64990.00'), qty: dec('2.50000') },
      { price: dec('64950.00'), qty: dec('5.00000') },
    ];
    const asks = [
      { price: dec('65010.00'), qty: dec('1.00000') },
      { price: dec('65020.00'), qty: dec('2.00000') },
      { price: dec('65050.00'), qty: dec('4.00000') },
    ];

    it('calculates spread bps, book imbalance, depth walk slippage, taker flow, and liquidity score', () => {
      const spread = spreadBpsDec(dec('65000.00'), dec('65010.00'));
      expect(spread).not.toBeNull();
      // 10 / 65005 * 10000 = 1.5383432...
      expect(spread!.toFixed(4)).toBe('1.5383');

      const obi = orderBookImbalanceDec(bids, asks, 3);
      expect(obi).not.toBeNull();
      expect(obi!.gt(0)).toBe(true);

      const slipBuy = estimateDepthSlippageDec('BUY', asks, dec('130000'), dec('0.00001'));
      expect(slipBuy.reachable).toBe(true);
      expect(slipBuy.slippageBps).not.toBeNull();
      expect(slipBuy.slippageBps!.gt(0)).toBe(true);

      const slipUnfilled = estimateDepthSlippageDec('BUY', asks, dec('5000000'), dec('0.00001'));
      expect(slipUnfilled.reachable).toBe(false);

      const takerFlow = takerFlowImbalanceDec([
        { price: dec('65010'), qty: dec('2'), isBuyerMaker: false }, // taker buy 130020
        { price: dec('65000'), qty: dec('1'), isBuyerMaker: true },  // taker sell 65000
      ]);
      expect(takerFlow.imbalanceRatio!.gt(0)).toBe(true);
      expect(takerFlow.netTakerFlowUsdt.toFixed(2)).toBe('65020.00');

      const liqScore = liquidityScoreDec({
        depthWithin2PctUsdt: dec('1000000'),
        spreadBps: spread,
        targetPositionUsdt: dec('50000'),
        poolOrQuoteVolumeUsdt: dec('10000000'),
      });
      expect(liqScore.gt(dec('50'))).toBe(true);
    });
  });

  describe('derivatives and positioning calculators', () => {
    it('calculates perp basis, annualized funding, OI momentum, 4-quadrant OI regime, and liquidation buffer', () => {
      const basis = perpBasisBpsDec(dec('65065'), dec('65000'));
      expect(basis?.toFixed(2)).toBe('10.00'); // +10 bps

      const annFunding = fundingAnnualizedPctDec(dec('0.0001')); // 0.01% per 8h -> 10.95% APR
      expect(annFunding?.toFixed(2)).toBe('10.95');

      const oiSeries = ['100', '101', '102', '103', '105', '106', '108', '110'].map(dec);
      const oiMom = openInterestMomentumPctDec(oiSeries, 7);
      expect(oiMom?.toFixed(2)).toBe('10.00');

      expect(classifyOiPriceRegime(dec('2.5'), dec('3.0'))).toBe('LONG_BUILDUP');
      expect(classifyOiPriceRegime(dec('-2.5'), dec('3.0'))).toBe('SHORT_BUILDUP');
      expect(classifyOiPriceRegime(dec('2.5'), dec('-3.0'))).toBe('SHORT_SQUEEZE');
      expect(classifyOiPriceRegime(dec('-2.5'), dec('-3.0'))).toBe('LONG_LIQUIDATION');
      expect(classifyOiPriceRegime(dec('0.1'), dec('0.1'))).toBe('NEUTRAL');

      const liqLong = liquidationBufferBpsDec(
        'LONG',
        dec('65000'),
        dec('65000'),
        dec('1'),
        dec('6500'), // 10x
        dec('0.004'),
      );
      expect(liqLong.isLiquidatable).toBe(false);
      expect(liqLong.bufferBps!.gt(dec('800'))).toBe(true);
    });
  });

  describe('crypto fundamentals & 6-component regime score', () => {
    it('computes NVT, MVRV, exchange netflow, smart money flow, token velocity, and redistributes missing weights', () => {
      const nvt = nvtRatioDec(dec('1000000000'), dec('50000000'));
      expect(nvt.ratio?.toFixed(2)).toBe('20.00');
      expect(nvt.signal).toBe('BULLISH');

      const mvrv = mvrvRatioDec(dec('1500000000'), dec('1000000000'));
      expect(mvrv.ratio?.toFixed(2)).toBe('1.50');
      expect(mvrv.signal).toBe('NEUTRAL');

      const netflow = exchangeNetflowDec(dec('1000'), dec('1800'), dec('1000000'));
      expect(netflow.netflowUsd?.toFixed(2)).toBe('-800.00');
      expect(netflow.signal).toBe('BULLISH');

      const smf = smartMoneyFlowDec(dec('18000000'), dec('5000000'), dec('100000000'));
      expect(smf.smfRatio?.gt(0)).toBe(true);
      expect(smf.signal).toBe('BULLISH');

      const tv = tokenVelocityDec(dec('50000000'), dec('1000000000'));
      expect(tv.velocity?.toFixed(4)).toBe('0.0500');

      // Regime with partial missing inputs (e.g. null dominance / breadth) redistributes weights cleanly
      const regime = computeCryptoRegimeCompositeDec({
        btcTrendScore: dec('85'),
        altBreadthScore: null,
        btcDominanceScore: null,
        perpFundingScore: dec('82'),
        drawdownVolScore: dec('80'),
        momentumThrustScore: dec('88'),
      });
      expect(regime.availableComponents).toBe(4);
      expect(regime.missingComponents).toEqual(['altBreadthScore', 'btcDominanceScore']);
      expect(regime.score!.gte(dec('80'))).toBe(true);
      expect(regime.zone).toBe('RISK_ON');
    });

    it('regime composite fails closed like the source scorer.py: needs >= 4 components AND >= 65% of the weight', () => {
      // 4 components, weight 0.25 + 0.15 + 0.15 + 0.10 = 0.65 (exactly the floor) -> scored.
      // score = (85*0.25 + 82*0.15 + 80*0.15 + 88*0.10) / 0.65 = (21.25 + 12.3 + 12 + 8.8) / 0.65 = 54.35 / 0.65 = 83.6153.. -> 83.61
      const atFloor = computeCryptoRegimeCompositeDec({
        btcTrendScore: dec('85'),
        perpFundingScore: dec('82'),
        drawdownVolScore: dec('80'),
        momentumThrustScore: dec('88'),
      });
      expect(atFloor.score?.toFixed(2)).toBe('83.61');

      // 4 components but only 0.20 + 0.15 + 0.15 + 0.10 = 0.60 of the weight (< 0.65) -> null.
      const lightWeight = computeCryptoRegimeCompositeDec({
        altBreadthScore: dec('70'),
        btcDominanceScore: dec('70'),
        drawdownVolScore: dec('70'),
        momentumThrustScore: dec('70'),
      });
      expect(lightWeight.score).toBeNull();
      expect(lightWeight.zone).toBe('UNAVAILABLE');
      expect(lightWeight.availableComponents).toBe(4);

      // 3 components with 0.25 + 0.20 + 0.15 = 0.60 -> null (fewer than 4 components).
      const three = computeCryptoRegimeCompositeDec({
        btcTrendScore: dec('90'),
        altBreadthScore: dec('90'),
        btcDominanceScore: dec('90'),
      });
      expect(three.score).toBeNull();
      expect(three.zone).toBe('UNAVAILABLE');
      expect(three.availableComponents).toBe(3);

      // A single component is never redistributed to 100% of the score.
      expect(computeCryptoRegimeCompositeDec({ btcTrendScore: dec('95') }).score).toBeNull();
    });
  });

  describe('position sizing ladder, VaR/CVaR, and circuit breakers', () => {
    it('enforces the minimum across Fixed Fractional, Concentration, ATR Volatility, Liquidity, and Fractional Kelly, floored to stepSize', () => {
      const kelly = fractionalKellyFractionDec({
        winRate: dec('0.58'),
        payoffRatio: dec('1.8'),
        kellyMultiplier: dec('0.25'),
      });
      expect(kelly.gt(0)).toBe(true);
      expect(kelly.lte(dec('0.25'))).toBe(true);

      const ladder = computePositionSizingLadder({
        side: 'LONG',
        equityUsdt: dec('100000'),
        entryPrice: dec('65000'),
        stopLossPrice: dec('63700'), // 2% stop distance (1300)
        takeProfitPrice: dec('68000'),
        feeRate: dec('0.001'),
        riskPercent: dec('1'), // 1%
        maxConcentrationFraction: dec('0.20'),
        targetDailyVolPercent: dec('0.5'),
        atrPrice: dec('1500'),
        visibleDepthUsdt: dec('150000'),
        maxDepthParticipation: dec('0.10'), // $15,000 -> ~0.23076 BTC
        estimatedWinRate: dec('0.55'),
        rules: {
          symbol: 'BTCUSDT',
          baseAsset: 'BTC',
          quoteAsset: 'USDT',
          tickSize: '0.01',
          stepSize: '0.00001',
          minQty: '0.00010',
          maxQty: '100',
          minNotional: '10',
        },
      });
      expect(ladder.lotCheckError).toBeNull();
      expect(ladder.finalQuantity.gt(0)).toBe(true);
      // Verify stepSize compliance
      expect(ladder.finalQuantity.mod('0.00001').isZero()).toBe(true);
    });

    it('rejects trade when recommended quantity falls below minQty or minNotional or PEPE integer step', () => {
      // Tiny account where risk budget cannot afford minNotional $10
      const tiny = computePositionSizingLadder({
        side: 'LONG',
        equityUsdt: dec('50'),
        entryPrice: dec('65000'),
        stopLossPrice: dec('58500'),
        feeRate: dec('0.001'),
        riskPercent: dec('1'),
        maxConcentrationFraction: dec('0.10'), // $5 notional < $10 minNotional
        atrPrice: dec('2000'),
        visibleDepthUsdt: dec('100000'),
        rules: {
          symbol: 'BTCUSDT',
          baseAsset: 'BTC',
          quoteAsset: 'USDT',
          tickSize: '0.01',
          stepSize: '0.00001',
          minQty: '0.00010',
          maxQty: '100',
          minNotional: '10',
        },
      });
      expect(tiny.lotCheckError).not.toBeNull();
      expect(tiny.finalQuantity.isZero()).toBe(true);
      expect(tiny.bindingConstraint).toBe('BELOW_MIN_LOT');

      // PEPE coin with integer stepSize = 1 and price = 0.00000406
      const pepeSizing = computePositionSizingLadder({
        side: 'LONG',
        equityUsdt: dec('1000'),
        entryPrice: dec('0.00000406'),
        stopLossPrice: dec('0.00000380'),
        feeRate: dec('0.001'),
        riskPercent: dec('1'),
        maxConcentrationFraction: dec('0.25'),
        atrPrice: dec('0.00000030'),
        visibleDepthUsdt: dec('50000'),
        rules: {
          symbol: 'PEPEUSDT',
          baseAsset: 'PEPE',
          quoteAsset: 'USDT',
          tickSize: '0.00000001',
          stepSize: '1',
          minQty: '100000',
          maxQty: '10000000000',
          minNotional: '5',
        },
      });
      expect(pepeSizing.lotCheckError).toBeNull();
      expect(pepeSizing.finalQuantity.mod(1).isZero()).toBe(true);
    });

    it('calculates drawdown, historical VaR/CVaR, and graduated circuit breakers', () => {
      const eq = ['10000', '10500', '9800', '9200', '9600'].map(dec);
      const mdd = maxDrawdownPctDec(eq);
      // Peak 10500 -> trough 9200 = 12.38095238% -> roundUp(4) = 12.3810
      expect(mdd.toFixed(2)).toBe('12.38');
      expect(currentDrawdownPctDec(eq).toFixed(2)).toBe('8.57');

      const varCvar = historicalVarAndCvarPctDec(
        [
          '-4.5', '-3.2', '-2.1', '-1.5', '-0.8',
          '0.2', '0.5', '1.1', '1.8', '2.5',
          '-5.5', '0.9', '-1.2', '0.4', '0.7',
          '-0.3', '1.4', '-1.9', '0.8', '1.2',
        ].map(dec),
      );
      expect(varCvar.varPct).not.toBeNull();
      expect(varCvar.cvarPct!.gte(varCvar.varPct!)).toBe(true);

      const cbNormal = evaluateCircuitBreakersDec({
        dailyLossPct: dec('1.2'),
        currentDrawdownPct: dec('3.5'),
        consecutiveLosses: 1,
      });
      expect(cbNormal.status).toBe('NORMAL');
      expect(cbNormal.halted).toBe(false);
      expect(cbNormal.sizeMultiplier.toFixed(2)).toBe('1.00');

      const cbCaution = evaluateCircuitBreakersDec({
        dailyLossPct: dec('1.0'),
        currentDrawdownPct: dec('6.0'),
        consecutiveLosses: 3,
      });
      expect(cbCaution.status).toBe('CAUTION');
      expect(cbCaution.sizeMultiplier.toFixed(2)).toBe('0.50');

      const cbEmergency = evaluateCircuitBreakersDec({
        dailyLossPct: dec('2.0'),
        currentDrawdownPct: dec('21.5'),
        consecutiveLosses: 4,
      });
      expect(cbEmergency.status).toBe('EMERGENCY');
      expect(cbEmergency.halted).toBe(true);
      expect(cbEmergency.sizeMultiplier.toFixed(2)).toBe('0.00');
    });
  });
});
