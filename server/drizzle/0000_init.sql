CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "balances" (
	"user_id" uuid NOT NULL,
	"asset" text NOT NULL,
	"available" numeric(38, 18) DEFAULT '0' NOT NULL,
	"locked" numeric(38, 18) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "balances_user_id_asset_pk" PRIMARY KEY("user_id","asset"),
	CONSTRAINT "balances_available_nonneg" CHECK ("balances"."available" >= 0),
	CONSTRAINT "balances_locked_nonneg" CHECK ("balances"."locked" >= 0)
);
--> statement-breakpoint
CREATE TABLE "candles" (
	"symbol" text NOT NULL,
	"interval" text NOT NULL,
	"open_time" timestamp with time zone NOT NULL,
	"close_time" timestamp with time zone NOT NULL,
	"open" numeric(38, 18) NOT NULL,
	"high" numeric(38, 18) NOT NULL,
	"low" numeric(38, 18) NOT NULL,
	"close" numeric(38, 18) NOT NULL,
	"volume" numeric(38, 18) NOT NULL,
	"quote_volume" numeric(38, 18) NOT NULL,
	"trade_count" integer NOT NULL,
	"source" text DEFAULT 'binance' NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candles_symbol_interval_open_time_pk" PRIMARY KEY("symbol","interval","open_time")
);
--> statement-breakpoint
CREATE TABLE "exchange_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"trading_halted" boolean DEFAULT false NOT NULL,
	"fee_rate" numeric(38, 18) DEFAULT '0.001' NOT NULL,
	"faucet_asset" text DEFAULT 'USDT' NOT NULL,
	"faucet_amount" numeric(38, 18) DEFAULT '10000' NOT NULL,
	"faucet_cooldown_hours" integer DEFAULT 24 NOT NULL,
	"faucet_lifetime_cap" numeric(38, 18) DEFAULT '100000' NOT NULL,
	"stale_threshold_ms" integer DEFAULT 10000 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_settings_singleton" CHECK ("exchange_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "faucet_claims" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"asset" text NOT NULL,
	"amount" numeric(38, 18) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"asset" text NOT NULL,
	"type" text NOT NULL,
	"delta_available" numeric(38, 18) NOT NULL,
	"delta_locked" numeric(38, 18) NOT NULL,
	"available_after" numeric(38, 18) NOT NULL,
	"locked_after" numeric(38, 18) NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"client_order_id" text NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"type" text NOT NULL,
	"time_in_force" text,
	"status" text NOT NULL,
	"price" numeric(38, 18),
	"stop_price" numeric(38, 18),
	"quantity" numeric(38, 18),
	"quote_order_qty" numeric(38, 18),
	"executed_qty" numeric(38, 18) DEFAULT '0' NOT NULL,
	"cumulative_quote_qty" numeric(38, 18) DEFAULT '0' NOT NULL,
	"locked_asset" text,
	"locked_amount" numeric(38, 18) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_locked_nonneg" CHECK ("orders"."locked_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reconciliation_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"ok" boolean NOT NULL,
	"checked_balances" integer NOT NULL,
	"mismatches" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "symbols" (
	"symbol" text PRIMARY KEY NOT NULL,
	"base_asset" text NOT NULL,
	"quote_asset" text NOT NULL,
	"tick_size" numeric(38, 18) NOT NULL,
	"step_size" numeric(38, 18) NOT NULL,
	"min_qty" numeric(38, 18) NOT NULL,
	"max_qty" numeric(38, 18) NOT NULL,
	"min_notional" numeric(38, 18) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"source_status" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"price" numeric(38, 18) NOT NULL,
	"quantity" numeric(38, 18) NOT NULL,
	"quote_qty" numeric(38, 18) NOT NULL,
	"fee" numeric(38, 18) NOT NULL,
	"fee_asset" text NOT NULL,
	"liquidity" text NOT NULL,
	"market_event_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"email_verified_at" timestamp with time zone,
	"role" text DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"signals_access" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balances" ADD CONSTRAINT "balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faucet_claims" ADD CONSTRAINT "faucet_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_symbol_symbols_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."symbols"("symbol") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "faucet_claims_user_idx" ON "faucet_claims" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_user_idx" ON "ledger_entries" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "ledger_user_asset_idx" ON "ledger_entries" USING btree ("user_id","asset","id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_client_id_uq" ON "orders" USING btree ("user_id","client_order_id");--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "orders_open_idx" ON "orders" USING btree ("symbol","status") WHERE "orders"."status" in ('NEW', 'PARTIALLY_FILLED');--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trades_user_idx" ON "trades" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "trades_order_idx" ON "trades" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_hash_uq" ON "verification_tokens" USING btree ("token_hash");