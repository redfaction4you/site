ALTER TABLE "dm_players" ADD COLUMN "team" text;--> statement-breakpoint
ALTER TABLE "dm_players" ADD COLUMN "first_seen" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dm_players" ADD COLUMN "last_seen" timestamp with time zone;