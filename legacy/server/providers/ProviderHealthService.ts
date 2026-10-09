import { BinanceFuturesProvider } from './BinanceFuturesProvider';
import { BinanceSpotProvider } from './BinanceSpotProvider';
import { DeFiLlamaProvider } from './DeFiLlamaProvider';
import { ProviderTelemetry } from './types';
import { WhaleProvider } from './WhaleProvider';

export class ProviderHealthService {
  private static instance: ProviderHealthService;

  public binanceSpot = new BinanceSpotProvider();
  public binanceFutures = new BinanceFuturesProvider();
  public defiLlama = new DeFiLlamaProvider();
  public whaleMonitor = new WhaleProvider();

  private constructor() {}

  public static getInstance(): ProviderHealthService {
    if (!ProviderHealthService.instance) {
      ProviderHealthService.instance = new ProviderHealthService();
    }
    return ProviderHealthService.instance;
  }

  public getAllTelemetry(): ProviderTelemetry[] {
    return [
      this.binanceSpot.getTelemetry(),
      this.binanceFutures.getTelemetry(),
      this.defiLlama.getTelemetry(),
      this.whaleMonitor.getTelemetry()
    ];
  }
}
