ALTER TABLE "match_players" ADD COLUMN "solo_caps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "relay_caps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "lead_carries" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "winning_carry_ms" integer DEFAULT 0 NOT NULL;