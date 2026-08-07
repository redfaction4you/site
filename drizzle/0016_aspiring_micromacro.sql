CREATE TABLE "dm_players" (
	"id" text PRIMARY KEY NOT NULL,
	"round_id" text NOT NULL,
	"name" text NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"max_streak" integer DEFAULT 0 NOT NULL,
	"shots_hit" double precision DEFAULT 0 NOT NULL,
	"shots_fired" double precision DEFAULT 0 NOT NULL,
	"damage_given" double precision DEFAULT 0 NOT NULL,
	"damage_taken" double precision DEFAULT 0 NOT NULL,
	"seconds_played" integer DEFAULT 0 NOT NULL,
	"weapon_stats" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"identity_key" text
);
--> statement-breakpoint
CREATE TABLE "dm_rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"server" text NOT NULL,
	"source_round_id" integer NOT NULL,
	"map_name" text NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dm_rounds_server_source_id_key" UNIQUE("server","source_round_id")
);
--> statement-breakpoint
ALTER TABLE "dm_players" ADD CONSTRAINT "dm_players_round_id_dm_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."dm_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dm_players_round_idx" ON "dm_players" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "dm_players_identity_idx" ON "dm_players" USING btree ("identity_key");--> statement-breakpoint
CREATE INDEX "dm_players_name_idx" ON "dm_players" USING btree ("name");--> statement-breakpoint
CREATE INDEX "dm_rounds_started_at_idx" ON "dm_rounds" USING btree ("started_at");