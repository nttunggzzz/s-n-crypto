import { BaseProvider } from './BaseProvider';
import { NormalizedDerivatives } from './types';

export class BinanceFuturesProvider extends BaseProvider {
  constructor() {
    super({
      providerId: 'BINANCE_FUTURES',
      providerName: 'Binance Futures API (USD-M)',
      category: 'DERIVATIVES',
      baseUrl: 'https://fapi.binance.com',
      timeoutMs: 4000,
      maxRetries: 2,
      activeEndpoints: [
        '/fapi/v1/openInterest',
        '/fapi/v1/fundingRate',
        '/futures/data/openInterestHist',
        '/futures/data/globalLongShortAccountRatio'
      ],
      notes: 'Real-time perpetual futures Open Interest, Funding Rates, and Long/Short ratios.'
    });
  }

  public async getDerivativesData(symbol: string): Promise<NormalizedDerivatives> {
    const pair = `${symbol.toUpperCase()}USDT`;
    const now = Date.now();

    // 0. Fetch real Mark Price to compute USD OI and Basis
    let currentMarkPrice: number | null = null;
    let fundingRate: number | null = null;
    let nextFundingTime: number | null = null;

    try {
      const priceRes = await this.fetchWithRetry<any>(`/fapi/v1/premiumIndex?symbol=${pair}`);
      if (priceRes && priceRes.markPrice) {
        currentMarkPrice = parseFloat(priceRes.markPrice);
        if (priceRes.lastFundingRate) {
          fundingRate = parseFloat(priceRes.lastFundingRate);
          nextFundingTime = Number(priceRes.nextFundingTime);
        }
      }
    } catch (err) {}

    // 1. Fetch live Open Interest
    let openInterestContracts: number | null = null;
    let openInterestUSD: number | null = null;
    let oiFetchSuccess = false;

    try {
      const oiRes = await this.fetchWithRetry<any>(`/fapi/v1/openInterest?symbol=${pair}`);
      if (oiRes && oiRes.openInterest) {
        openInterestContracts = parseFloat(oiRes.openInterest);
        openInterestUSD = currentMarkPrice !== null && currentMarkPrice > 0 ? Math.round(openInterestContracts * currentMarkPrice) : null;
        oiFetchSuccess = true;
      }
    } catch (err) {
      // Handled in base telemetry
    }

    // 3. Fetch Historical Open Interest (5m intervals) to compute real OI Change
    let oiChange24h: number | null = null;
    let oiChange4h: number | null = null;
    let oiHistory: Array<{ time: number; openInterest: number; price?: number }> = [];

    try {
      const oiHistRes = await this.fetchWithRetry<any[]>(`/futures/data/openInterestHist?symbol=${pair}&period=5m&limit=48`); // 48 * 5m = 4h
      if (oiHistRes && Array.isArray(oiHistRes) && oiHistRes.length > 0) {
        oiHistory = oiHistRes.map(h => ({
          time: Number(h.timestamp),
          openInterest: parseFloat(h.sumOpenInterestValue || h.sumOpenInterest)
        }));

        const oldest = oiHistory[0].openInterest;
        const latest = oiHistory[oiHistory.length - 1].openInterest;
        if (oldest > 0) {
          oiChange4h = Number((((latest - oldest) / oldest) * 100).toFixed(2));
          // Do NOT artificially calculate 24h change from 4h data
          oiChange24h = null; 
        }
      }
    } catch (err) {
      // Historical OI endpoint fallback
    }

    // 4. Fetch Global Long/Short Ratio
    let longShortRatio: number | null = null;
    try {
      const lsRes = await this.fetchWithRetry<any[]>(`/futures/data/globalLongShortAccountRatio?symbol=${pair}&period=5m&limit=1`);
      if (lsRes && lsRes.length > 0 && lsRes[0].longShortRatio) {
        longShortRatio = parseFloat(lsRes[0].longShortRatio);
      }
    } catch (err) {
      // Telemetry recorded
    }

    // 5. Determine OI Interpretation
    let oiInterpretation: NormalizedDerivatives['oiInterpretation'] = 'UNAVAILABLE';
    if (oiChange4h !== null && fundingRate !== null) {
      oiInterpretation = 'NEUTRAL';
      if (oiChange4h > 3.0 && fundingRate > 0.00015) {
        oiInterpretation = 'LONG_BUILDUP';
      } else if (oiChange4h > 3.0 && fundingRate < -0.00005) {
        oiInterpretation = 'SHORT_BUILDUP';
      } else if (oiChange4h < -3.0 && fundingRate > 0.0002) {
        oiInterpretation = 'LONG_LIQUIDATION';
      } else if (oiChange4h < -3.0 && fundingRate < -0.0001) {
        oiInterpretation = 'SHORT_SQUEEZE';
      }
    }

    return {
      symbol: symbol.toUpperCase(),
      openInterestUSD,
      openInterestContracts,
      openInterestChange24h: oiChange24h,
      openInterestChange4h: oiChange4h,
      openInterestChange1h: null, // Not currently calculated
      fundingRate: fundingRate !== null ? Number((fundingRate * 100).toFixed(4)) : null, 
      fundingIntervalHours: fundingRate !== null ? 8 : null,
      nextFundingTime,
      longShortRatio: longShortRatio !== null ? Number(longShortRatio.toFixed(2)) : null,
      liquidations24h: {
        longsUSD: null,
        shortsUSD: null,
        totalUSD: null,
        status: 'DATA_UNAVAILABLE',
        note: 'Requires WebSocket stream or CoinGlass Enterprise API. Not fabricating 0.'
      },
      basis: null, // Removed synthetic calculation (fundingRate * 250)
      oiInterpretation,
      timestamp: now,
      source: 'Binance Futures API (fapi.binance.com)',
      status: oiFetchSuccess ? 'LIVE' : 'DEGRADED',
      history: oiHistory
    };
  }
}
