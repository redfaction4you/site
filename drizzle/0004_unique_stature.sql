CREATE TABLE "night_columns" (
	"archive_day" date PRIMARY KEY NOT NULL,
	"headline" text NOT NULL,
	"body" text NOT NULL,
	"match_count" integer NOT NULL,
	"model" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "night_columns_generated_idx" ON "night_columns" USING btree ("generated_at");