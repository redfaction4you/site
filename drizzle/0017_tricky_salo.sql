ALTER TABLE "dm_rounds" ADD COLUMN "archive_day" date NOT NULL;--> statement-breakpoint
CREATE INDEX "dm_rounds_archive_day_idx" ON "dm_rounds" USING btree ("server","archive_day");