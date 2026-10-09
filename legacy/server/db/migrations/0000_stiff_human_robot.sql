CREATE TABLE `asset_universe_registry` (
	`symbol` text PRIMARY KEY NOT NULL,
	`base_asset` text NOT NULL,
	`quote_asset` text NOT NULL,
	`name` text NOT NULL,
	`asset_type` text NOT NULL,
	`category` text NOT NULL,
	`coingecko_id` text,
	`circulating_supply` real,
	`is_active` integer DEFAULT true,
	`is_universe_member` integer DEFAULT true,
	`universe_rank` integer,
	`min_24h_volume_usd` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `derivatives_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`event_time` integer NOT NULL,
	`open_interest_contracts` real,
	`open_interest_usd` real,
	`oi_change_1h_pct` real,
	`oi_change_4h_pct` real,
	`oi_change_24h_pct` real,
	`funding_rate` real,
	`funding_interval_hours` integer DEFAULT 8,
	`predicted_funding_rate` real,
	`long_short_ratio` real,
	`long_liquidations_usd` real,
	`short_liquidations_usd` real,
	`basis_spread_bps` real,
	`oi_interpretation` text,
	`source` text NOT NULL,
	`observed_at` integer NOT NULL,
	`ingested_at` integer NOT NULL,
	`quality_status` text NOT NULL,
	FOREIGN KEY (`symbol`) REFERENCES `asset_universe_registry`(`symbol`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `market_events_journal` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`symbol` text,
	`event_time` integer NOT NULL,
	`severity` text NOT NULL,
	`payload_json` text NOT NULL,
	`source_engine` text NOT NULL,
	`observed_at` integer NOT NULL,
	`ingested_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `market_ohlcv_candles` (
	`symbol` text NOT NULL,
	`timeframe` text NOT NULL,
	`bucket_timestamp` integer NOT NULL,
	`open` real NOT NULL,
	`high` real NOT NULL,
	`low` real NOT NULL,
	`close` real NOT NULL,
	`volume` real NOT NULL,
	`quote_volume` real,
	`trades_count` integer,
	`is_closed` integer DEFAULT true,
	`source` text NOT NULL,
	`observed_at` integer NOT NULL,
	`ingested_at` integer NOT NULL,
	`quality_status` text NOT NULL,
	PRIMARY KEY(`symbol`, `timeframe`, `bucket_timestamp`),
	FOREIGN KEY (`symbol`) REFERENCES `asset_universe_registry`(`symbol`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `market_regime_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_time` integer NOT NULL,
	`universe_size` integer NOT NULL,
	`advancers_count` integer NOT NULL,
	`decliners_count` integer NOT NULL,
	`breadth_percentage` real NOT NULL,
	`regime` text NOT NULL,
	`regime_score` integer NOT NULL,
	`sentiment` text NOT NULL,
	`btc_dominance` real,
	`eth_dominance` real,
	`total_market_cap_usd` real,
	`total2_usd` real,
	`total3_usd` real,
	`average_atr_percent` real,
	`methodology` text NOT NULL,
	`source` text NOT NULL,
	`observed_at` integer NOT NULL,
	`ingested_at` integer NOT NULL,
	`quality_status` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_regime_snapshots_event_time_unique` ON `market_regime_snapshots` (`event_time`);--> statement-breakpoint
CREATE TABLE `onchain_ecosystem_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_key` text NOT NULL,
	`entity_type` text NOT NULL,
	`ecosystem` text NOT NULL,
	`event_time` integer NOT NULL,
	`value_usd` real NOT NULL,
	`delta_24h_usd` real,
	`delta_24h_pct` real,
	`chain_breakdown_json` text,
	`source` text NOT NULL,
	`observed_at` integer NOT NULL,
	`ingested_at` integer NOT NULL,
	`quality_status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `provider_telemetry_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` text NOT NULL,
	`category` text NOT NULL,
	`status` text NOT NULL,
	`latency_ms` integer NOT NULL,
	`error_count` integer NOT NULL,
	`error_rate_pct` real NOT NULL,
	`data_freshness_sec` integer NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `whale_and_smart_money_ledger` (
	`tx_hash` text PRIMARY KEY NOT NULL,
	`chain` text NOT NULL,
	`block_number` integer,
	`event_time` integer NOT NULL,
	`token_symbol` text NOT NULL,
	`token_amount` real NOT NULL,
	`usd_value` real NOT NULL,
	`sender_address` text NOT NULL,
	`sender_label` text,
	`sender_entity_type` text,
	`receiver_address` text NOT NULL,
	`receiver_label` text,
	`receiver_entity_type` text,
	`classification` text NOT NULL,
	`confidence_score` real NOT NULL,
	`reasoning` text,
	`source` text NOT NULL,
	`observed_at` integer NOT NULL,
	`ingested_at` integer NOT NULL,
	`quality_status` text NOT NULL
);
