CREATE TABLE "match_captures" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"elapsed_seconds" integer DEFAULT 0 NOT NULL,
	"team" text DEFAULT '' NOT NULL,
	"red_score" integer DEFAULT 0 NOT NULL,
	"blue_score" integer DEFAULT 0 NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"player_name" text,
	"assists" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"drive_participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"observed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "match_players" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"name" text NOT NULL,
	"team" text DEFAULT '' NOT NULL,
	"spectator" boolean DEFAULT false NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"caps" integer DEFAULT 0 NOT NULL,
	"max_streak" integer DEFAULT 0 NOT NULL,
	"accuracy" double precision DEFAULT 0 NOT NULL,
	"shots_hit" double precision DEFAULT 0 NOT NULL,
	"shots_fired" double precision DEFAULT 0 NOT NULL,
	"damage_given" double precision DEFAULT 0 NOT NULL,
	"damage_taken" double precision DEFAULT 0 NOT NULL,
	"flag_hold_ms" integer DEFAULT 0 NOT NULL,
	"flag_pickups" integer DEFAULT 0 NOT NULL,
	"flag_drops" integer DEFAULT 0 NOT NULL,
	"flag_returns" integer DEFAULT 0 NOT NULL,
	"flag_carrier_kills" integer DEFAULT 0 NOT NULL,
	"flag_carrier_deaths" integer DEFAULT 0 NOT NULL,
	"capture_assists" integer DEFAULT 0 NOT NULL,
	"flag_recoveries" integer DEFAULT 0 NOT NULL,
	"successful_flag_drives" integer DEFAULT 0 NOT NULL,
	"successful_carry_ms" integer DEFAULT 0 NOT NULL,
	"fastest_capture_ms" integer,
	"identity_key" text
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"source_match_id" integer NOT NULL,
	"server" text NOT NULL,
	"archive_day" date NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"map_name" text NOT NULL,
	"mode" text DEFAULT 'CTF' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"red_score" integer DEFAULT 0 NOT NULL,
	"blue_score" integer DEFAULT 0 NOT NULL,
	"overtime" boolean DEFAULT false NOT NULL,
	"winner" text,
	"kills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flag_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"roster_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_server_source_id_key" UNIQUE("server","source_match_id")
);
--> statement-breakpoint
ALTER TABLE "match_captures" ADD CONSTRAINT "match_captures_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_captures_match_idx" ON "match_captures" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_captures_elapsed_idx" ON "match_captures" USING btree ("match_id","elapsed_seconds");--> statement-breakpoint
CREATE INDEX "match_players_match_idx" ON "match_players" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_players_name_idx" ON "match_players" USING btree ("name");--> statement-breakpoint
CREATE INDEX "match_players_identity_idx" ON "match_players" USING btree ("identity_key");--> statement-breakpoint
CREATE INDEX "matches_archive_day_idx" ON "matches" USING btree ("archive_day");--> statement-breakpoint
CREATE INDEX "matches_started_at_idx" ON "matches" USING btree ("started_at");