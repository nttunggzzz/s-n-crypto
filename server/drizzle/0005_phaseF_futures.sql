CREATE TABLE "futures_funding_events" (
	"symbol" text NOT NULL,
	"funding_time" timestamp with time zone NOT NULL,
	"rate" numeric(38, 18) NOT NULL,
	"mark_price" numeric(38, 18) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "futures_funding_events_symbol_funding_time_pk" PRIMARY KEY("symbol","funding_time")
);
--> statement-breakpoint
CREATE TABLE "futures_funding_payments" (
	"position_id" bigint NOT NULL,
	"funding_time" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"amount" numeric(38, 18) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "futures_funding_payments_position_id_funding_time_pk" PRIMARY KEY("position_id","funding_time")
);
--> statement-breakpoint
CREATE TABLE "futures_orders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"client_order_id" text NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"type" text NOT NULL,
	"purpose" text DEFAULT 'TRADE' NOT NULL,
	"time_in_force" text,
	"price" numeric(38, 18),
	"quantity" numeric(38, 18) NOT NULL,
	"executed_qty" numeric(38, 18) DEFAULT '0' NOT NULL,
	"executed_notional" numeric(38, 18) DEFAULT '0' NOT NULL,
	"reduce_only" boolean DEFAULT false NOT NULL,
	"leverage" integer NOT NULL,
	"status" text NOT NULL,
	"margin_locked" numeric(38, 18) DEFAULT '0' NOT NULL,
	"fee_locked" numeric(38, 18) DEFAULT '0' NOT NULL,
	"fee" numeric(38, 18) DEFAULT '0' NOT NULL,
	"realized_pnl" numeric(38, 18) DEFAULT '0' NOT NULL,
	"take_profit_price" numeric(38, 18),
	"stop_loss_price" numeric(38, 18),
	"close_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "futures_orders_exec_le_qty" CHECK ("futures_orders"."executed_qty" <= "futures_orders"."quantity"),
	CONSTRAINT "futures_orders_locks_nonneg" CHECK ("futures_orders"."margin_locked" >= 0 and "futures_orders"."fee_locked" >= 0)
);
--> statement-breakpoint
CREATE TABLE "futures_positions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"margin_mode" text DEFAULT 'ISOLATED' NOT NULL,
	"quantity" numeric(38, 18) NOT NULL,
	"max_quantity" numeric(38, 18) NOT NULL,
	"entry_price" numeric(38, 18) NOT NULL,
	"leverage" integer NOT NULL,
	"margin" numeric(38, 18) NOT NULL,
	"realized_pnl" numeric(38, 18) DEFAULT '0' NOT NULL,
	"fees" numeric(38, 18) DEFAULT '0' NOT NULL,
	"funding" numeric(38, 18) DEFAULT '0' NOT NULL,
	"closed_quantity" numeric(38, 18) DEFAULT '0' NOT NULL,
	"closed_notional" numeric(38, 18) DEFAULT '0' NOT NULL,
	"take_profit_price" numeric(38, 18),
	"stop_loss_price" numeric(38, 18),
	"close_reason" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "futures_positions_qty_nonneg" CHECK ("futures_positions"."quantity" >= 0),
	CONSTRAINT "futures_positions_margin_nonneg" CHECK ("futures_positions"."margin" >= 0)
);
--> statement-breakpoint
CREATE TABLE "futures_symbols" (
	"symbol" text PRIMARY KEY NOT NULL,
	"base_asset" text NOT NULL,
	"quote_asset" text NOT NULL,
	"underlying_asset" text NOT NULL,
	"multiplier" integer DEFAULT 1 NOT NULL,
	"tick_size" numeric(38, 18) NOT NULL,
	"step_size" numeric(38, 18) NOT NULL,
	"min_qty" numeric(38, 18) NOT NULL,
	"max_qty" numeric(38, 18) NOT NULL,
	"min_notional" numeric(38, 18) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"source_status" text NOT NULL,
	"max_leverage" integer DEFAULT 20 NOT NULL,
	"maintenance_margin_rate" numeric(38, 18) DEFAULT '0.005' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "futures_trades" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"position_id" bigint,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"price" numeric(38, 18) NOT NULL,
	"quantity" numeric(38, 18) NOT NULL,
	"quote_qty" numeric(38, 18) NOT NULL,
	"fee" numeric(38, 18) NOT NULL,
	"liquidity" text NOT NULL,
	"realized_pnl" numeric(38, 18) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "futures_user_symbols" (
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"leverage" integer DEFAULT 10 NOT NULL,
	"margin_mode" text DEFAULT 'ISOLATED' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "futures_user_symbols_user_id_symbol_pk" PRIMARY KEY("user_id","symbol"),
	CONSTRAINT "futures_leverage_range" CHECK ("futures_user_symbols"."leverage" between 1 and 20)
);
--> statement-breakpoint
ALTER TABLE "balances" ADD COLUMN "account" text DEFAULT 'SPOT' NOT NULL;--> statement-breakpoint
ALTER TABLE "balances" DROP CONSTRAINT "balances_user_id_asset_pk";--> statement-breakpoint
ALTER TABLE "balances" ADD CONSTRAINT "balances_user_id_account_asset_pk" PRIMARY KEY("user_id","account","asset");--> statement-breakpoint
ALTER TABLE "balances" ADD CONSTRAINT "balances_account_valid" CHECK ("balances"."account" in ('SPOT', 'FUTURES'));--> statement-breakpoint
ALTER TABLE "exchange_settings" ADD COLUMN "futures_maker_fee" numeric(38, 18) DEFAULT '0.0002' NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange_settings" ADD COLUMN "futures_taker_fee" numeric(38, 18) DEFAULT '0.0005' NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange_settings" ADD COLUMN "futures_liquidation_fee" numeric(38, 18) DEFAULT '0.005' NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "account" text DEFAULT 'SPOT' NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_valid" CHECK ("ledger_entries"."account" in ('SPOT', 'FUTURES'));--> statement-breakpoint
ALTER TABLE "futures_funding_payments" ADD CONSTRAINT "futures_funding_payments_position_id_futures_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."futures_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "futures_funding_payments" ADD CONSTRAINT "futures_funding_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "futures_orders" ADD CONSTRAINT "futures_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "futures_positions" ADD CONSTRAINT "futures_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "futures_trades" ADD CONSTRAINT "futures_trades_order_id_futures_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."futures_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "futures_trades" ADD CONSTRAINT "futures_trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "futures_user_symbols" ADD CONSTRAINT "futures_user_symbols_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "futures_orders_client_id" ON "futures_orders" USING btree ("user_id","client_order_id");--> statement-breakpoint
CREATE INDEX "futures_orders_user_idx" ON "futures_orders" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "futures_orders_open_idx" ON "futures_orders" USING btree ("symbol","side","price") WHERE "futures_orders"."status" in ('NEW', 'PARTIALLY_FILLED');--> statement-breakpoint
CREATE UNIQUE INDEX "futures_positions_one_open" ON "futures_positions" USING btree ("user_id","symbol") WHERE "futures_positions"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "futures_positions_open_symbol_idx" ON "futures_positions" USING btree ("symbol") WHERE "futures_positions"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "futures_positions_user_idx" ON "futures_positions" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "futures_trades_user_idx" ON "futures_trades" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "futures_trades_order_idx" ON "futures_trades" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ledger_user_account_idx" ON "ledger_entries" USING btree ("user_id","account","id");