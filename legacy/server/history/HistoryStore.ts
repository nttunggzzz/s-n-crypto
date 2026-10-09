import { NormalizedCandle, NormalizedDerivatives, NormalizedMarketRegime, NormalizedTVL } from '../providers/types';

export class HistoryStore {
  private static instance: HistoryStore;

  private candleStore: Map<string, NormalizedCandle[]> = new Map();
  private derivativesHistory: Map<string, Array<{ time: number; data: NormalizedDerivatives }>> = new Map();
  private regimeHistory: NormalizedMarketRegime[] = [];
  private tvlHistory: NormalizedTVL[] = [];

  private constructor() {}

  public static getInstance(): HistoryStore {
    if (!HistoryStore.instance) {
      HistoryStore.instance = new HistoryStore();
    }
    return HistoryStore.instance;
  }

  public recordCandles(symbol: string, timeframe: string, candles: NormalizedCandle[]): void {
    const key = `${symbol.toUpperCase()}_${timeframe}`;
    this.candleStore.set(key, candles);
  }

  public getCandles(symbol: string, timeframe: string): NormalizedCandle[] | undefined {
    return this.candleStore.get(`${symbol.toUpperCase()}_${timeframe}`);
  }

  public recordDerivatives(symbol: string, derivatives: NormalizedDerivatives): void {
    const key = symbol.toUpperCase();
    const list = this.derivativesHistory.get(key) || [];
    list.push({ time: Date.now(), data: derivatives });
    // Keep max 100 observations per symbol
    if (list.length > 100) list.shift();
    this.derivativesHistory.set(key, list);
  }

  public getDerivativesHistory(symbol: string): Array<{ time: number; data: NormalizedDerivatives }> {
    return this.derivativesHistory.get(symbol.toUpperCase()) || [];
  }

  public recordRegime(regime: NormalizedMarketRegime): void {
    this.regimeHistory.push(regime);
    if (this.regimeHistory.length > 50) this.regimeHistory.shift();
  }

  public getLatestRegime(): NormalizedMarketRegime | undefined {
    return this.regimeHistory[this.regimeHistory.length - 1];
  }

  public recordTVL(tvl: NormalizedTVL[]): void {
    this.tvlHistory = tvl;
  }

  public getLatestTVL(): NormalizedTVL[] {
    return this.tvlHistory;
  }
}
