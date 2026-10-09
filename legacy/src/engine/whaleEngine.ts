import { EntityType, TransactionIntent, WhaleTransaction } from '../types/crypto';

export interface WalletEntityProfile {
  address: string;
  name: string;
  type: EntityType;
  reputation: 'VERIFIED_MM' | 'TIER_1_FUND' | 'CEX_HOT_WALLET' | 'SMART_WHALE' | 'TREASURY';
  historicalBias: 'NET_BUYER' | 'MARKET_MAKING' | 'LIQUIDATOR' | 'LONG_TERM_HODL';
}

export const KNOWN_ENTITIES: Record<string, WalletEntityProfile> = {
  '0x1111111254fb6c44bac0bed2854e76f90643097d': {
    address: '0x1111111254fb6c44bac0bed2854e76f90643097d',
    name: '1inch Router',
    type: 'INSTITUTION',
    reputation: 'SMART_WHALE',
    historicalBias: 'MARKET_MAKING'
  },
  '0xdbf5e9c5206d0d44a18449b7c56aa5ce0b1b0f94': {
    address: '0xdbf5e9c5206d0d44a18449b7c56aa5ce0b1b0f94',
    name: 'Wintermute Trading',
    type: 'MARKET_MAKER',
    reputation: 'VERIFIED_MM',
    historicalBias: 'MARKET_MAKING'
  },
  '0x92b9532f38d38865cbe98c2579dfd10cf6e37b42': {
    address: '0x92b9532f38d38865cbe98c2579dfd10cf6e37b42',
    name: 'Jump Trading',
    type: 'MARKET_MAKER',
    reputation: 'VERIFIED_MM',
    historicalBias: 'MARKET_MAKING'
  },
  '0x7713974908be4bed47172370115e8b1219f4a5f0': {
    address: '0x7713974908be4bed47172370115e8b1219f4a5f0',
    name: 'GSR Markets',
    type: 'MARKET_MAKER',
    reputation: 'VERIFIED_MM',
    historicalBias: 'MARKET_MAKING'
  },
  '0x1b44f3514812d835eb1bdb0acb33d3fa3351ee43': {
    address: '0x1b44f3514812d835eb1bdb0acb33d3fa3351ee43',
    name: 'Binance Hot Wallet 6',
    type: 'EXCHANGE',
    reputation: 'CEX_HOT_WALLET',
    historicalBias: 'MARKET_MAKING'
  },
  '0x28c6c06298d514db089934071355e5743bf21d60': {
    address: '0x28c6c06298d514db089934071355e5743bf21d60',
    name: 'Binance Hot Wallet 14',
    type: 'EXCHANGE',
    reputation: 'CEX_HOT_WALLET',
    historicalBias: 'MARKET_MAKING'
  },
  '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': {
    address: '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43',
    name: 'Coinbase Prime Custody',
    type: 'INSTITUTION',
    reputation: 'TIER_1_FUND',
    historicalBias: 'LONG_TERM_HODL'
  },
  '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503': {
    address: '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503',
    name: 'Binance Lock / Cold Reserve',
    type: 'EXCHANGE',
    reputation: 'CEX_HOT_WALLET',
    historicalBias: 'MARKET_MAKING'
  },
  '0x53d284357ec70ce289d6d64134dfac8e511c8a3d': {
    address: '0x53d284357ec70ce289d6d64134dfac8e511c8a3d',
    name: 'Cumberland DRW',
    type: 'MARKET_MAKER',
    reputation: 'VERIFIED_MM',
    historicalBias: 'MARKET_MAKING'
  },
  '0x6b175474e89094c44da98b954eedeac495271d0f': {
    address: '0x6b175474e89094c44da98b954eedeac495271d0f',
    name: 'Smart Money Whale Alpha',
    type: 'SMART_MONEY',
    reputation: 'SMART_WHALE',
    historicalBias: 'NET_BUYER'
  }
};

export function classifyWhaleTransaction(raw: {
  senderAddress: string;
  receiverAddress: string;
  tokenSymbol: string;
  tokenAmount: number;
  usdValue: number;
  isContractCall?: boolean;
}): {
  classification: TransactionIntent;
  confidence: number;
  reasoning: string;
  senderLabel?: string;
  senderType?: EntityType;
  receiverLabel?: string;
  receiverType?: EntityType;
  impactScore: number;
} {
  const senderEntity = KNOWN_ENTITIES[raw.senderAddress.toLowerCase()];
  const receiverEntity = KNOWN_ENTITIES[raw.receiverAddress.toLowerCase()];

  const senderType = senderEntity?.type || 'WHALE';
  const receiverType = receiverEntity?.type || (raw.isContractCall ? 'INSTITUTION' : 'WHALE');

  let classification: TransactionIntent = 'TRANSFER';
  let confidence = 70;
  let reasoning = 'Standard on-chain asset movement between self-custodial wallets.';
  let impactScore = 5;

  // 1. CEX Inflow: Wallet -> Exchange
  if (receiverEntity?.type === 'EXCHANGE' && senderEntity?.type !== 'EXCHANGE') {
    classification = 'EXCHANGE_INFLOW';
    confidence = 90;
    impactScore = raw.usdValue > 10_000_000 ? 9 : raw.usdValue > 3_000_000 ? 7 : 5;
    reasoning = `Large deposit from ${senderEntity ? senderEntity.name : 'unlabeled whale'} to ${receiverEntity.name}. Represents potential spot sell inventory or derivative collateral.`;
  }
  // 2. CEX Outflow: Exchange -> Wallet (Institutional Accumulation / Custody)
  else if (senderEntity?.type === 'EXCHANGE' && receiverEntity?.type !== 'EXCHANGE') {
    if (receiverEntity?.type === 'INSTITUTION' || receiverEntity?.type === 'SMART_MONEY' || receiverEntity?.historicalBias === 'NET_BUYER') {
      classification = 'ACCUMULATION';
      confidence = 88;
      impactScore = raw.usdValue > 5_000_000 ? 9 : 7;
      reasoning = `Large outflow from ${senderEntity.name} into ${receiverEntity ? receiverEntity.name : 'fresh cold storage'}. Indicative of spot accumulation and exchange supply reduction.`;
    } else {
      classification = 'EXCHANGE_OUTFLOW';
      confidence = 82;
      impactScore = 6;
      reasoning = `Withdrawal from ${senderEntity.name} to self-custody wallet, reducing liquid circulating supply on exchanges.`;
    }
  }
  // 3. Market Maker rebalancing
  else if (senderEntity?.type === 'MARKET_MAKER' || receiverEntity?.type === 'MARKET_MAKER') {
    classification = 'TRANSFER';
    confidence = 85;
    impactScore = 4;
    reasoning = `Institutional liquidity provision or cross-venue arbitrage between ${senderEntity?.name || 'wallet'} and ${receiverEntity?.name || 'wallet'}. Neutral directional bias.`;
  }
  // 4. Smart Money direct DEX / Contract interaction
  else if (raw.isContractCall && (senderEntity?.type === 'SMART_MONEY' || senderEntity?.type === 'FUND')) {
    classification = 'ACCUMULATION';
    confidence = 86;
    impactScore = 8;
    reasoning = `Direct DEX aggregator interaction by verified ${senderEntity.name}. Programmatic on-chain accumulation.`;
  }
  // 5. Internal CEX Cold/Hot transfers
  else if (senderEntity?.type === 'EXCHANGE' && receiverEntity?.type === 'EXCHANGE') {
    classification = 'TRANSFER';
    confidence = 95;
    impactScore = 2;
    reasoning = `Routine exchange internal liquidity rebalancing between ${senderEntity.name} and ${receiverEntity.name}. No market impact.`;
  }

  return {
    classification,
    confidence,
    reasoning,
    senderLabel: senderEntity?.name,
    senderType,
    receiverLabel: receiverEntity?.name,
    receiverType,
    impactScore
  };
}

export function scoreWhaleFlows(transactions: WhaleTransaction[], tokenSymbol: string): {
  score: number;
  recentLargeTxsCount: number;
  netSmartMoneyFlowUSD: number;
  dominantIntent: TransactionIntent;
} {
  const tokenTxs = transactions.filter(t => t.tokenSymbol.toUpperCase() === tokenSymbol.toUpperCase());
  if (tokenTxs.length === 0) {
    return {
      score: 50,
      recentLargeTxsCount: 0,
      netSmartMoneyFlowUSD: 0,
      dominantIntent: 'TRANSFER'
    };
  }

  let netFlow = 0;
  const intentCounts: Record<TransactionIntent, number> = {
    TRANSFER: 0,
    ACCUMULATION: 0,
    DISTRIBUTION: 0,
    EXCHANGE_INFLOW: 0,
    EXCHANGE_OUTFLOW: 0,
    CONTRACT_INTERACTION: 0
  };

  for (const tx of tokenTxs) {
    intentCounts[tx.classification] = (intentCounts[tx.classification] || 0) + 1;
    if (tx.classification === 'ACCUMULATION' || tx.classification === 'EXCHANGE_OUTFLOW') {
      netFlow += tx.usdValue;
    } else if (tx.classification === 'DISTRIBUTION' || tx.classification === 'EXCHANGE_INFLOW') {
      netFlow -= tx.usdValue;
    }
  }

  let dominantIntent: TransactionIntent = 'TRANSFER';
  let maxCount = -1;
  for (const [intent, count] of Object.entries(intentCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantIntent = intent as TransactionIntent;
    }
  }

  let score = 50;
  if (netFlow > 10_000_000) score += 35;
  else if (netFlow > 2_000_000) score += 20;
  else if (netFlow < -10_000_000) score -= 30;
  else if (netFlow < -2_000_000) score -= 15;

  if (dominantIntent === 'ACCUMULATION') score += 10;
  if (dominantIntent === 'EXCHANGE_INFLOW') score -= 15;

  score = Math.max(10, Math.min(98, score));

  return {
    score,
    recentLargeTxsCount: tokenTxs.length,
    netSmartMoneyFlowUSD: netFlow,
    dominantIntent
  };
}
