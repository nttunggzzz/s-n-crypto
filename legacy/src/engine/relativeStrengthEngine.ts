import { CoinMarketData, RelativeStrengthAnalysis } from '../types/crypto';

export function calculateRelativeStrength(
  targetCoin: CoinMarketData,
  btcCoin?: CoinMarketData,
  ethCoin?: CoinMarketData,
  allCoins: CoinMarketData[] = []
): RelativeStrengthAnalysis {
  const btcChange24h = btcCoin ? btcCoin.change24h : 0;
  const btcChange7d = btcCoin ? (btcCoin.change7d ?? btcCoin.change24h * 1.5) : 0;
  const ethChange24h = ethCoin ? ethCoin.change24h : 0;
  const ethChange7d = ethCoin ? (ethCoin.change7d ?? ethCoin.change24h * 1.5) : 0;

  const targetChange24h = targetCoin.change24h;
  const targetChange7d = targetCoin.change7d ?? targetCoin.change24h * 1.5;

  const rsVsBtc24h = Number((targetChange24h - btcChange24h).toFixed(2));
  const rsVsBtc7d = Number((targetChange7d - btcChange7d).toFixed(2));
  const rsVsEth24h = Number((targetChange24h - ethChange24h).toFixed(2));
  const rsVsEth7d = Number((targetChange7d - ethChange7d).toFixed(2));

  // Sector ranking
  const sectorCoins = allCoins.filter(c => c.category === targetCoin.category);
  const totalCoinsInSector = Math.max(1, sectorCoins.length);
  const sortedSector = [...sectorCoins].sort((a, b) => b.change24h - a.change24h);
  const rankInSector = Math.max(1, sortedSector.findIndex(c => c.id === targetCoin.id || c.symbol === targetCoin.symbol) + 1);

  // Market average
  const avgMarket24h = allCoins.length > 0
    ? allCoins.reduce((acc, c) => acc + c.change24h, 0) / allCoins.length
    : 0;
  const rsVsMarket24h = Number((targetChange24h - avgMarket24h).toFixed(2));

  const outperformingSector = rankInSector <= Math.ceil(totalCoinsInSector * 0.35);

  let rsTier: RelativeStrengthAnalysis['rsTier'] = 'INLINE';
  let score = 50;

  if (rsVsBtc24h > 4 && rsVsMarket24h > 3) {
    rsTier = 'LEADER';
    score += 35;
  } else if (rsVsBtc24h > 1.5 && rsVsMarket24h > 1) {
    rsTier = 'STRONG';
    score += 20;
  } else if (rsVsBtc24h < -4 || rsVsMarket24h < -3) {
    rsTier = 'LAGGARD';
    score -= 30;
  } else {
    rsTier = 'INLINE';
  }

  if (outperformingSector) score += 10;
  if (rsVsBtc7d > 5) score += 10;

  score = Math.max(10, Math.min(98, score));

  return {
    symbol: targetCoin.symbol,
    rsVsBtc24h,
    rsVsBtc7d,
    rsVsEth24h,
    rsVsEth7d,
    rsVsMarket24h,
    outperformingSector,
    rankInSector,
    totalCoinsInSector,
    rsTier,
    score
  };
}
