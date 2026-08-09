CREATE TABLE "map_packs" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"blurb" text,
	"server_name" text,
	"welcome_message" text,
	"maps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "map_packs_slug_idx" ON "map_packs" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "map_packs_one_active_idx" ON "map_packs" USING btree ("active") WHERE "map_packs"."active";