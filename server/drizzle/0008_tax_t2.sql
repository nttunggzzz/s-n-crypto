CREATE TABLE "tax_withholdings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trade_id" bigint NOT NULL,
	"order_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"asset" text NOT NULL,
	"quantity" numeric(38, 18) NOT NULL,
	"price" numeric(38, 18) NOT NULL,
	"gross_quote" numeric(38, 18) NOT NULL,
	"tax_rate" numeric(38, 18) NOT NULL,
	"tax_amount" numeric(38, 18) NOT NULL,
	"category" text NOT NULL,
	"vnd_rate" numeric(38, 18),
	"gross_vnd" numeric(38, 18),
	"tax_vnd" numeric(38, 18),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_withholdings_amount_pos" CHECK ("tax_withholdings"."tax_amount" > 0),
	CONSTRAINT "tax_withholdings_category" CHECK ("tax_withholdings"."category" in ('INDIVIDUAL', 'FOREIGN_ORG'))
);
--> statement-breakpoint
CREATE TABLE "user_tax_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"category" text DEFAULT 'INDIVIDUAL' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_tax_profiles_category" CHECK ("user_tax_profiles"."category" in ('INDIVIDUAL', 'FOREIGN_ORG', 'DOMESTIC_ORG'))
);
--> statement-breakpoint
ALTER TABLE "exchange_settings" ADD COLUMN "tax_mode" text DEFAULT 'OFF' NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange_settings" ADD COLUMN "tax_rate" numeric(38, 18) DEFAULT '0.001' NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange_settings" ADD COLUMN "tax_vnd_rate" numeric(38, 18);--> statement-breakpoint
ALTER TABLE "exchange_settings" ADD COLUMN "tax_vnd_rate_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exchange_settings" ADD COLUMN "tax_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "tax" numeric(38, 18) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_withholdings" ADD CONSTRAINT "tax_withholdings_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_withholdings" ADD CONSTRAINT "tax_withholdings_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_withholdings" ADD CONSTRAINT "tax_withholdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tax_profiles" ADD CONSTRAINT "user_tax_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tax_withholdings_trade_uq" ON "tax_withholdings" USING btree ("trade_id");--> statement-breakpoint
CREATE INDEX "tax_withholdings_user_idx" ON "tax_withholdings" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "tax_withholdings_created_idx" ON "tax_withholdings" USING btree ("created_at");--> statement-breakpoint
-- Withholding records are append-only like the ledger (forbid_mutation() from 0001): a withheld fill is never edited or deleted.
CREATE TRIGGER tax_withholdings_append_only BEFORE UPDATE OR DELETE ON tax_withholdings
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();