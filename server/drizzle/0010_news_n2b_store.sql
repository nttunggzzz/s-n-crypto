CREATE TABLE "macro_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"importance" text NOT NULL,
	"reference_period" text NOT NULL,
	"source_url" text NOT NULL,
	"note" text,
	"actual" numeric(38, 18),
	"actual_known_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_ingest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"items_seen" integer DEFAULT 0 NOT NULL,
	"items_inserted" integer DEFAULT 0 NOT NULL,
	"median_lag_ms" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "news_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"url" text NOT NULL,
	"url_canonical" text NOT NULL,
	"title" text NOT NULL,
	"title_fingerprint" text NOT NULL,
	"published_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone NOT NULL,
	"symbols" text[] DEFAULT '{}'::text[] NOT NULL,
	"event_types" text[] NOT NULL,
	"tone" numeric(38, 18),
	"classifier_version" text NOT NULL,
	"ingest_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_items_event_types_nonempty" CHECK (cardinality("news_items"."event_types") >= 1)
);
--> statement-breakpoint
CREATE TABLE "news_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"poll_interval_sec" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "news_ingest_runs" ADD CONSTRAINT "news_ingest_runs_source_id_news_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."news_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_items" ADD CONSTRAINT "news_items_source_id_news_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."news_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_items" ADD CONSTRAINT "news_items_ingest_run_id_news_ingest_runs_id_fk" FOREIGN KEY ("ingest_run_id") REFERENCES "public"."news_ingest_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "macro_events_code_at_uq" ON "macro_events" USING btree ("code","scheduled_at");--> statement-breakpoint
CREATE INDEX "macro_events_at_idx" ON "macro_events" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "news_ingest_runs_source_idx" ON "news_ingest_runs" USING btree ("source_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "news_items_url_canonical_uq" ON "news_items" USING btree ("url_canonical");--> statement-breakpoint
CREATE INDEX "news_items_title_fingerprint_idx" ON "news_items" USING btree ("title_fingerprint");--> statement-breakpoint
CREATE INDEX "news_items_first_seen_idx" ON "news_items" USING btree ("first_seen_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "news_items_symbols_gin" ON "news_items" USING gin ("symbols");--> statement-breakpoint
CREATE INDEX "news_items_source_seen_idx" ON "news_items" USING btree ("source_id","first_seen_at" DESC NULLS LAST);