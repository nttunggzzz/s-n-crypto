import { CoinMarketData, SectorRotationSummary } from '../types/crypto';

export const SECTOR_DEFINITIONS: Record<string, { name: string; symbols: string[] }> = {
  'AI_DEPIN': {
    name: 'AI & DePIN',
    symbols: ['TAO', 'RENDER', 'NEAR']
  },
  'DEFI_PRIMITIVES': {
    name: 'DeFi Primitives',
    symbols: ['AAVE', 'UNI', 'LINK', 'PENDLE']
  },
  'SOLANA_ECOSYSTEM': {
    name: 'Solana Ecosystem',
    symbols: ['SOL', 'JUP']
  },
  'RWA_TOKENIZATION': {
    name: 'RWA & Tokenization',
    symbols: ['ONDO']
  },
  'MODULAR_INFRA': {
    name: 'Modular & Layer 1s',
    symbols: ['SUI', 'AVAX', 'INJ', 'TIA']
  },
  'ETH_L2': {
    name: 'Ethereum & L2s',
    symbols: ['ETH', 'ARB', 'OP']
  },
  'BITCOIN_ECOSYSTEM': {
    name: 'Bitcoin Ecosystem',
    symbols: ['BTC']
  },
  'MEME_SPECULATION': {
    name: 'Meme & Speculation',
    symbols: ['DOGE', 'PEPE']
  }
};

export function analyzeSectorRotations(allCoins: CoinMarketData[]): SectorRotationSummary[] {
  const coinMap = new Map<string, CoinMarketData>();
  for (const c of allCoins) {
    coinMap.set(c.symbol.toUpperCase(), c);
  }

  const results: SectorRotationSummary[] = [];

  for (const [sectorKey, meta] of Object.entries(SECTOR_DEFINITIONS)) {
    const presentCoins = meta.symbols
      .map(sym => coinMap.get(sym))
      .filter((c): c is CoinMarketData => Boolean(c));

    if (presentCoins.length === 0) continue;

    const totalMarketCap = presentCoins.reduce((acc, c) => acc + c.marketCap, 0);
    const totalVolume = presentCoins.reduce((acc, c) => acc + c.volume24h, 0);
    const avgChange24h = presentCoins.reduce((acc, c) => acc + c.change24h, 0) / presentCoins.length;
    const avgChange7d = presentCoins.reduce((acc, c) => acc + (c.change7d ?? c.change24h * 1.4), 0) / presentCoins.length;
    const avgVolChange = presentCoins.reduce((acc, c) => acc + (c.volumeChange24h || 0), 0) / presentCoins.length;

    // Find leader coin
    const sortedCoins = [...presentCoins].sort((a, b) => b.change24h - a.change24h);
    const leader = sortedCoins[0];

    // Estimate TVL for representative sectors
    let tvl = 0;
    if (sectorKey === 'SOLANA_ECOSYSTEM') tvl = 8_400_000_000;
    else if (sectorKey === 'ETH_L2') tvl = 42_000_000_000;
    else if (sectorKey === 'DEFI_PRIMITIVES') tvl = 65_000_000_000;
    else if (sectorKey === 'RWA_TOKENIZATION') tvl = 9_100_000_000;
    else if (sectorKey === 'BITCOIN_ECOSYSTEM') tvl = 3_200_000_000;
    else tvl = 1_500_000_000;

    let capitalFlow: SectorRotationSummary['capitalFlow'] = 'STAGNANT';
    let momentumScore = 50;

    if (avgChange24h > 3 && avgVolChange > 5) {
      capitalFlow = 'ACCELERATING_INFLOW';
      momentumScore = Math.min(98, 50 + avgChange24h * 4 + avgVolChange * 0.4);
    } else if (avgChange24h > 1.0) {
      capitalFlow = 'MODERATE_INFLOW';
      momentumScore = Math.min(85, 50 + avgChange24h * 3);
    } else if (avgChange24h < -3) {
      capitalFlow = 'OUTFLOW_HEAVY';
      momentumScore = Math.max(10, 50 + avgChange24h * 3);
    } else {
      capitalFlow = 'STAGNANT';
      momentumScore = 52;
    }

    results.push({
      sectorKey,
      sectorName: meta.name,
      coins: meta.symbols,
      totalMarketCapUSD: totalMarketCap,
      totalVolume24h: totalVolume,
      volumeChange24h: Number(avgVolChange.toFixed(1)),
      averageChange24h: Number(avgChange24h.toFixed(2)),
      averageChange7d: Number(avgChange7d.toFixed(2)),
      tvlUSD: tvl,
      capitalFlow,
      momentumScore: Math.round(momentumScore),
      leaderCoin: leader ? leader.symbol : meta.symbols[0],
      leaderChange24h: leader ? leader.change24h : 0
    });
  }

  return results.sort((a, b) => b.momentumScore - a.momentumScore);
}
