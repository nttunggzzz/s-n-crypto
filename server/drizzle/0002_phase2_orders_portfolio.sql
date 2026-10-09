CREATE TABLE "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lists" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"client_list_id" text NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"contingency_type" text NOT NULL,
	"list_status" text NOT NULL,
	"parent_order_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_snapshots" (
	"user_id" uuid NOT NULL,
	"time" timestamp with time zone NOT NULL,
	"total_value_usdt" numeric(38, 18),
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_snapshots_user_id_time_pk" PRIMARY KEY("user_id","time")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"user_id" uuid NOT NULL,
	"asset" text NOT NULL,
	"quantity" numeric(38, 18) DEFAULT '0' NOT NULL,
	"avg_cost" numeric(38, 18),
	"realized_pnl" numeric(38, 18) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_user_id_asset_pk" PRIMARY KEY("user_id","asset")
);
--> statement-breakpoint
CREATE TABLE "price_alerts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"condition" text NOT NULL,
	"target_price" numeric(38, 18) NOT NULL,
	"note" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"triggered_price" numeric(38, 18),
	"triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "lock_price" numeric(38, 18);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "trigger_state" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "trigger_direction" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "triggered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "trailing_delta_bips" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "activation_price" numeric(38, 18);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "trailing_reference_price" numeric(38, 18);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_list_id" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "parent_order_id" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tpsl" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "close_reason" text;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "realized_pnl" numeric(38, 18);--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lists" ADD CONSTRAINT "order_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lists" ADD CONSTRAINT "order_lists_symbol_symbols_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."symbols"("symbol") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_symbol_symbols_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."symbols"("symbol") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "order_lists_client_id_uq" ON "order_lists" USING btree ("user_id","client_list_id");--> statement-breakpoint
CREATE INDEX "order_lists_user_idx" ON "order_lists" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "price_alerts_user_idx" ON "price_alerts" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "price_alerts_active_idx" ON "price_alerts" USING btree ("symbol") WHERE "price_alerts"."status" = 'ACTIVE';--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_list_id_order_lists_id_fk" FOREIGN KEY ("order_list_id") REFERENCES "public"."order_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_list_idx" ON "orders" USING btree ("order_list_id");--> statement-breakpoint
CREATE INDEX "orders_parent_idx" ON "orders" USING btree ("parent_order_id");