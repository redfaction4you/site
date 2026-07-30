CREATE TABLE "player_profiles" (
	"name_key" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"body" text NOT NULL,
	"match_count" integer NOT NULL,
	"model" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "player_profiles_generated_idx" ON "player_profiles" USING btree ("generated_at");