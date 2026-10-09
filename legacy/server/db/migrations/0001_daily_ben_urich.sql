PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_onchain_ecosystem_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_key` text NOT NULL,
	`entity_type` text NOT NULL,
	`ecosystem` text NOT NULL,
	`event_time` integer NOT NULL,
	`value_usd` real,
	`delta_24h_usd` real,
	`delta_24h_pct` real,
	`chain_breakdown_json` text,
	`source` text NOT NULL,
	`observed_at` integer NOT NULL,
	`ingested_at` integer NOT NULL,
	`quality_status` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_onchain_ecosystem_snapshots`("id", "entity_key", "entity_type", "ecosystem", "event_time", "value_usd", "delta_24h_usd", "delta_24h_pct", "chain_breakdown_json", "source", "observed_at", "ingested_at", "quality_status") SELECT "id", "entity_key", "entity_type", "ecosystem", "event_time", "value_usd", "delta_24h_usd", "delta_24h_pct", "chain_breakdown_json", "source", "observed_at", "ingested_at", "quality_status" FROM `onchain_ecosystem_snapshots`;--> statement-breakpoint
DROP TABLE `onchain_ecosystem_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_onchain_ecosystem_snapshots` RENAME TO `onchain_ecosystem_snapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_entity_event` ON `onchain_ecosystem_snapshots` (`entity_key`,`entity_type`,`event_time`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_symbol_event` ON `derivatives_snapshots` (`symbol`,`event_time`);