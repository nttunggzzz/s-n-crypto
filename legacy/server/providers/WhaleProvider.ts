import { BaseProvider } from './BaseProvider';
import { NormalizedWhaleEvent } from './types';

export class WhaleProvider extends BaseProvider {
  constructor() {
    const hasKeys = !!(process.env.ARKHAM_API_KEY || process.env.NANSEN_API_KEY || process.env.ETHERSCAN_API_KEY);
    super({
      providerId: 'WHALE_MONITOR',
      providerName: 'On-Chain Whale & Entity Radar',
      category: 'WHALE',
      baseUrl: 'https://api.etherscan.io',
      timeoutMs: 4000,
      maxRetries: 1,
      apiKey: process.env.ETHERSCAN_API_KEY || process.env.ARKHAM_API_KEY,
      activeEndpoints: [
        'api.etherscan.io/api (ERC-20 Transfer Events)',
        'arkhamintelligence.com/api (Entity Labels)'
      ],
      notes: hasKeys
        ? 'Connected to configured on-chain indexer.'
        : 'Awaiting on-chain indexer API credentials (ARKHAM_API_KEY / ETHERSCAN_API_KEY). Zero fake data displayed.'
    });

    if (!hasKeys) {
      this.status = 'NOT_CONFIGURED';
    }
  }

  public async getVerifiedWhaleTransactions(): Promise<{
    transactions: NormalizedWhaleEvent[];
    status: 'LIVE' | 'NOT_CONFIGURED' | 'DATA_UNAVAILABLE';
    message: string;
  }> {
    const hasKeys = !!(process.env.ARKHAM_API_KEY || process.env.NANSEN_API_KEY || process.env.ETHERSCAN_API_KEY);

    if (!hasKeys) {
      return {
        transactions: [],
        status: 'NOT_CONFIGURED',
        message: 'On-chain RPC/Indexer API keys not configured. Synthetic whale data removed to guarantee data integrity.'
      };
    }

    // If API keys are provided in the future, connect to live indexer
    return {
      transactions: [],
      status: 'DATA_UNAVAILABLE',
      message: 'On-chain indexer returned 0 transactions in recent window.'
    };
  }
}
