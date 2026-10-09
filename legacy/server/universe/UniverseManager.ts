import { db } from '../db/client';
import { assetUniverseRegistry } from '../db/schema';
import { eq } from 'drizzle-orm';

export interface UniverseAsset {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  name: string;
  assetType: string;
  category: string;
  isActive?: boolean;
}

export class UniverseManager {
  /**
   * Initializes the bootstrap universe of 20 top assets
   */
  static async initializeBootstrapUniverse() {
    const bootstrapAssets: UniverseAsset[] = [
      { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', name: 'Bitcoin', assetType: 'SPOT', category: 'L1' },
      { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', name: 'Ethereum', assetType: 'SPOT', category: 'L1' },
      { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', name: 'Solana', assetType: 'SPOT', category: 'L1' },
      { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT', name: 'BNB', assetType: 'SPOT', category: 'L1' },
      { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT', name: 'XRP', assetType: 'SPOT', category: 'L1' },
      { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT', name: 'Cardano', assetType: 'SPOT', category: 'L1' },
      { symbol: 'AVAXUSDT', baseAsset: 'AVAX', quoteAsset: 'USDT', name: 'Avalanche', assetType: 'SPOT', category: 'L1' },
      { symbol: 'DOGEUSDT', baseAsset: 'DOGE', quoteAsset: 'USDT', name: 'Dogecoin', assetType: 'SPOT', category: 'MEME' },
      { symbol: 'DOTUSDT', baseAsset: 'DOT', quoteAsset: 'USDT', name: 'Polkadot', assetType: 'SPOT', category: 'L0' },
      { symbol: 'LINKUSDT', baseAsset: 'LINK', quoteAsset: 'USDT', name: 'Chainlink', assetType: 'SPOT', category: 'INFRA' },
      { symbol: 'MATICUSDT', baseAsset: 'MATIC', quoteAsset: 'USDT', name: 'Polygon', assetType: 'SPOT', category: 'L2', isActive: false },
      { symbol: 'POLUSDT', baseAsset: 'POL', quoteAsset: 'USDT', name: 'Polygon Ecosystem Token', assetType: 'SPOT', category: 'L2' },
      { symbol: 'SUIUSDT', baseAsset: 'SUI', quoteAsset: 'USDT', name: 'Sui', assetType: 'SPOT', category: 'L1' },
      { symbol: 'APTUSDT', baseAsset: 'APT', quoteAsset: 'USDT', name: 'Aptos', assetType: 'SPOT', category: 'L1' },
      { symbol: 'ARBUSDT', baseAsset: 'ARB', quoteAsset: 'USDT', name: 'Arbitrum', assetType: 'SPOT', category: 'L2' },
      { symbol: 'OPUSDT', baseAsset: 'OP', quoteAsset: 'USDT', name: 'Optimism', assetType: 'SPOT', category: 'L2' },
      { symbol: 'RNDRUSDT', baseAsset: 'RNDR', quoteAsset: 'USDT', name: 'Render', assetType: 'SPOT', category: 'AI_DEPIN', isActive: false },
      { symbol: 'RENDERUSDT', baseAsset: 'RENDER', quoteAsset: 'USDT', name: 'Render Token', assetType: 'SPOT', category: 'AI_DEPIN' },
      { symbol: 'INJUSDT', baseAsset: 'INJ', quoteAsset: 'USDT', name: 'Injective', assetType: 'SPOT', category: 'DEFI' },
      { symbol: 'TAOUSDT', baseAsset: 'TAO', quoteAsset: 'USDT', name: 'Bittensor', assetType: 'SPOT', category: 'AI' },
      { symbol: 'TIAUSDT', baseAsset: 'TIA', quoteAsset: 'USDT', name: 'Celestia', assetType: 'SPOT', category: 'INFRA' },
      { symbol: 'WLDUSDT', baseAsset: 'WLD', quoteAsset: 'USDT', name: 'Worldcoin', assetType: 'SPOT', category: 'AI' }
    ];

    for (let i = 0; i < bootstrapAssets.length; i++) {
      const asset = bootstrapAssets[i];
      await db.insert(assetUniverseRegistry).values({
        symbol: asset.symbol,
        baseAsset: asset.baseAsset,
        quoteAsset: asset.quoteAsset,
        name: asset.name,
        assetType: asset.assetType,
        category: asset.category,
        isActive: asset.isActive !== false,
        isUniverseMember: true,
        universeRank: i + 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: assetUniverseRegistry.symbol,
        set: {
          universeRank: i + 1,
          updatedAt: new Date()
        }
      });
    }
  }

  static async getActiveUniverse(): Promise<string[]> {
    const assets = await db.select({ symbol: assetUniverseRegistry.symbol })
      .from(assetUniverseRegistry)
      .where(eq(assetUniverseRegistry.isActive, true));
    
    return assets.map(a => a.symbol);
  }
}
