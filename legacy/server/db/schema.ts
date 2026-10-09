import { sqliteTable, text, integer, real, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const assetUniverseRegistry = sqliteTable('asset_universe_registry', {
  symbol: text('symbol').primaryKey(),
  baseAsset: text('base_asset').notNull(),
  quoteAsset: text('quote_asset').notNull(),
  name: text('name').notNull(),
  assetType: text('asset_type').notNull(), // SPOT, PERPETUAL, WRAPPED, STABLECOIN
  category: text('category').notNull(),
  coingeckoId: text('coingecko_id'),
  circulatingSupply: real('circulating_supply'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  isUniverseMember: integer('is_universe_member', { mode: 'boolean' }).default(true),
  universeRank: integer('universe_rank'),
  min24hVolumeUsd: real('min_24h_volume_usd'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const marketOhlcvCandles = sqliteTable('market_ohlcv_candles', {
  symbol: text('symbol').notNull().references(() => assetUniverseRegistry.symbol),
  timeframe: text('timeframe').notNull(),
  bucketTimestamp: integer('bucket_timestamp').notNull(),
  open: real('open').notNull(),
  high: real('high').notNull(),
  low: real('low').notNull(),
  close: real('close').notNull(),
  volume: real('volume').notNull(),
  quoteVolume: real('quote_volume'),
  tradesCount: integer('trades_count'),
  isClosed: integer('is_closed', { mode: 'boolean' }).default(true),
  source: text('source').notNull(),
  observedAt: integer('observed_at').notNull(),
  ingestedAt: integer('ingested_at').notNull(),
  qualityStatus: text('quality_status').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.symbol, table.timeframe, table.bucketTimestamp] }),
}));

export const derivativesSnapshots = sqliteTable('derivatives_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbol: text('symbol').notNull().references(() => assetUniverseRegistry.symbol),
  eventTime: integer('event_time').notNull(),
  openInterestContracts: real('open_interest_contracts'),
  openInterestUsd: real('open_interest_usd'),
  oiChange1hPct: real('oi_change_1h_pct'),
  oiChange4hPct: real('oi_change_4h_pct'),
  oiChange24hPct: real('oi_change_24h_pct'),
  fundingRate: real('funding_rate'),
  fundingIntervalHours: integer('funding_interval_hours').default(8),
  predictedFundingRate: real('predicted_funding_rate'),
  longShortRatio: real('long_short_ratio'),
  longLiquidationsUsd: real('long_liquidations_usd'),
  shortLiquidationsUsd: real('short_liquidations_usd'),
  basisSpreadBps: real('basis_spread_bps'),
  oiInterpretation: text('oi_interpretation'),
  source: text('source').notNull(),
  observedAt: integer('observed_at').notNull(),
  ingestedAt: integer('ingested_at').notNull(),
  qualityStatus: text('quality_status').notNull(),
}, (table) => ({
  idx_symbol_event: uniqueIndex('idx_symbol_event').on(table.symbol, table.eventTime)
}));

export const marketRegimeSnapshots = sqliteTable('market_regime_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventTime: integer('event_time').notNull().unique(),
  universeSize: integer('universe_size').notNull(),
  advancersCount: integer('advancers_count').notNull(),
  declinersCount: integer('decliners_count').notNull(),
  breadthPercentage: real('breadth_percentage').notNull(),
  regime: text('regime').notNull(),
  regimeScore: integer('regime_score').notNull(),
  sentiment: text('sentiment').notNull(),
  btcDominance: real('btc_dominance'),
  ethDominance: real('eth_dominance'),
  totalMarketCapUsd: real('total_market_cap_usd'),
  total2Usd: real('total2_usd'),
  total3Usd: real('total3_usd'),
  averageAtrPercent: real('average_atr_percent'),
  methodology: text('methodology').notNull(),
  source: text('source').notNull(),
  observedAt: integer('observed_at').notNull(),
  ingestedAt: integer('ingested_at').notNull(),
  qualityStatus: text('quality_status').notNull(),
});

export const onchainEcosystemSnapshots = sqliteTable('onchain_ecosystem_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  entityKey: text('entity_key').notNull(),
  entityType: text('entity_type').notNull(),
  ecosystem: text('ecosystem').notNull(),
  eventTime: integer('event_time').notNull(),
  valueUsd: real('value_usd'),
  delta24hUsd: real('delta_24h_usd'),
  delta24hPct: real('delta_24h_pct'),
  chainBreakdownJson: text('chain_breakdown_json'),
  source: text('source').notNull(),
  observedAt: integer('observed_at').notNull(),
  ingestedAt: integer('ingested_at').notNull(),
  qualityStatus: text('quality_status').notNull(),
}, (table) => ({
  idx_entity_event: uniqueIndex('idx_entity_event').on(table.entityKey, table.entityType, table.eventTime)
}));

export const whaleAndSmartMoneyLedger = sqliteTable('whale_and_smart_money_ledger', {
  txHash: text('tx_hash').primaryKey(),
  chain: text('chain').notNull(),
  blockNumber: integer('block_number'),
  eventTime: integer('event_time').notNull(),
  tokenSymbol: text('token_symbol').notNull(),
  tokenAmount: real('token_amount').notNull(),
  usdValue: real('usd_value').notNull(),
  senderAddress: text('sender_address').notNull(),
  senderLabel: text('sender_label'),
  senderEntityType: text('sender_entity_type'),
  receiverAddress: text('receiver_address').notNull(),
  receiverLabel: text('receiver_label'),
  receiverEntityType: text('receiver_entity_type'),
  classification: text('classification').notNull(),
  confidenceScore: real('confidence_score').notNull(),
  reasoning: text('reasoning'),
  source: text('source').notNull(),
  observedAt: integer('observed_at').notNull(),
  ingestedAt: integer('ingested_at').notNull(),
  qualityStatus: text('quality_status').notNull(),
});

export const marketEventsJournal = sqliteTable('market_events_journal', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventType: text('event_type').notNull(),
  symbol: text('symbol'),
  eventTime: integer('event_time').notNull(),
  severity: text('severity').notNull(),
  payloadJson: text('payload_json').notNull(),
  sourceEngine: text('source_engine').notNull(),
  observedAt: integer('observed_at').notNull(),
  ingestedAt: integer('ingested_at').notNull(),
});

export const providerTelemetryHistory = sqliteTable('provider_telemetry_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  providerId: text('provider_id').notNull(),
  category: text('category').notNull(),
  status: text('status').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  errorCount: integer('error_count').notNull(),
  errorRatePct: real('error_rate_pct').notNull(),
  dataFreshnessSec: integer('data_freshness_sec').notNull(),
  timestamp: integer('timestamp').notNull(),
});
