CREATE TABLE "invites" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"code_prefix" text NOT NULL,
	"note" text NOT NULL,
	"max_uses" integer NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_uses_le_max" CHECK ("invites"."uses" >= 0 and "invites"."uses" <= "invites"."max_uses")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invite_id" bigint;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invites_code_uq" ON "invites" USING btree ("code_hash");