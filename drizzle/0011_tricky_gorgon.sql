CREATE TABLE "match_videos" (
	"id" text PRIMARY KEY NOT NULL,
	"youtube_id" text NOT NULL,
	"archive_day" date NOT NULL,
	"source_match_id" integer NOT NULL,
	"starts_at" integer,
	"title" text,
	"author_name" text,
	"author_url" text,
	"note" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_videos_unique" UNIQUE("youtube_id","archive_day","source_match_id")
);
--> statement-breakpoint
CREATE INDEX "match_videos_day_idx" ON "match_videos" USING btree ("archive_day");