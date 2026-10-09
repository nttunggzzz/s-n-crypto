import { BaseProvider } from './BaseProvider';
import { NormalizedStablecoin, NormalizedTVL } from './types';

export class DeFiLlamaProvider extends BaseProvider {
  constructor() {
    super({
      providerId: 'DEFILLAMA',
      providerName: 'DeFiLlama Public API',
      category: 'ONCHAIN',
      baseUrl: 'https://api.llama.fi',
      timeoutMs: 5000,
      maxRetries: 2,
      activeEndpoints: [
        'https://api.llama.fi/v2/chains',
        'https://api.llama.fi/protocols',
        'https://stablecoins.llama.fi/stablecoins?includePrices=true'
      ],
      notes: 'Open access DeFi TVL, chain balances, and stablecoin circulation data.'
    });
  }

  public async getChainTVLs(): Promise<NormalizedTVL[]> {
    const rawChains = await this.fetchWithRetry<any[]>('https://api.llama.fi/v2/chains');
    const now = Date.now();

    const ecosystemMap: Record<string, string> = {
      'Solana': 'SOLANA_ECOSYSTEM',
      'Ethereum': 'ETH_L2',
      'Arbitrum': 'ETH_L2',
      'Optimism': 'ETH_L2',
      'Base': 'ETH_L2',
      'Avalanche': 'MODULAR_INFRA',
      'Sui': 'MODULAR_INFRA',
      'Bitcoin': 'BITCOIN_ECOSYSTEM',
      'Polygon': 'ETH_L2',
      'BNB Chain': 'DEFI_PRIMITIVES'
    };

    return rawChains
      .filter(c => ecosystemMap[c.name] || c.tvl > 500_000_000)
      .slice(0, 15)
      .map(c => ({
        ecosystem: ecosystemMap[c.name] || 'MODULAR_INFRA',
        chain: c.name,
        tvlUSD: c.tvl !== undefined && c.tvl !== null ? Math.round(c.tvl) : null,
        tvlChange24h: null, // Not provided directly in this endpoint
        tvlChange7d: null,  // Not provided directly in this endpoint
        timestamp: now,
        source: 'DeFiLlama (api.llama.fi/v2/chains)',
        status: 'LIVE'
      }));
  }

  public async getStablecoinMetrics(): Promise<NormalizedStablecoin[]> {
    const rawData = await this.fetchWithRetry<any>('https://stablecoins.llama.fi/stablecoins?includePrices=true');
    const now = Date.now();

    if (!rawData || !rawData.peggedAssets || !Array.isArray(rawData.peggedAssets)) {
      return [];
    }

    const topPegged = rawData.peggedAssets.slice(0, 8);
    return topPegged.map((st: any) => {
      const circulating = st.circulating?.peggedUSD;
      const chains: Record<string, number> = {};
      if (st.chainBalances) {
        for (const [chainName, balanceObj] of Object.entries<any>(st.chainBalances)) {
          if (balanceObj?.peggedUSD && balanceObj.peggedUSD > 10_000_000) {
            chains[chainName] = Math.round(balanceObj.peggedUSD);
          }
        }
      }

      return {
        symbol: st.symbol,
        name: st.name,
        circulatingUSD: circulating !== undefined && circulating !== null ? Math.round(circulating) : null,
        change24hUSD: st.change_1d != null && circulating != null ? Math.round(circulating * (st.change_1d / 100)) : null,
        change24hPercent: st.change_1d != null ? Number(st.change_1d.toFixed(2)) : null,
        chainDistribution: chains,
        timestamp: now,
        source: 'DeFiLlama Stablecoins API (stablecoins.llama.fi)',
        status: 'LIVE'
      };
    });
  }
}
