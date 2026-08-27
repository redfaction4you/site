DROP INDEX "map_packs_one_active_idx";--> statement-breakpoint
ALTER TABLE "map_packs" ADD COLUMN "server" text DEFAULT 'themed-maps' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "map_packs_one_active_idx" ON "map_packs" USING btree ("server","active") WHERE "map_packs"."active";