import { DeFiLlamaProvider } from '../providers/DeFiLlamaProvider';
async function test() {
  const p = new DeFiLlamaProvider();
  const t = await p.getChainTVLs();
  console.log('TVL returned:', t.length);
  const s = await p.getStablecoinMetrics();
  console.log('Stablecoins returned:', s.length);
}
test().catch(console.error);
