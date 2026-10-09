import { db } from '../db/client';
import { sql } from 'drizzle-orm';
import { marketOhlcvCandles, derivativesSnapshots, onchainEcosystemSnapshots } from '../db/schema';
import { BinanceSpotProvider } from '../providers/BinanceSpotProvider';
import { BinanceFuturesProvider } from '../providers/BinanceFuturesProvider';
import { DeFiLlamaProvider } from '../providers/DeFiLlamaProvider';

async function run() {
  const spot = new BinanceSpotProvider();
  const res = await spot.getKlinesHistorical('BTCUSDT', '1h', Date.now() - 3600000 * 5, Date.now(), 10);
  console.log('Spot:', res.length > 0 ? Object.keys(res[0]) : 'None');

  const fut = new BinanceFuturesProvider();
  try {
    const futRes = await fut.getDerivativesData('BTCUSDT');
    console.log('Futures:', Object.keys(futRes));
  } catch (e) {
    console.error('Futures Error:', e);
  }

  const def = new DeFiLlamaProvider();
  try {
    const defRes = await def.getChainTVLs();
    console.log('DeFiLlama TVL:', defRes.length);
  } catch (e) {
    console.error('DeFiLlama Error:', e);
  }
}
run().catch(console.error);
