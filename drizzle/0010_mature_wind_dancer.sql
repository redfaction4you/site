CREATE TABLE "opinion_pieces" (
	"archive_day" date PRIMARY KEY NOT NULL,
	"headline" text NOT NULL,
	"body" text NOT NULL,
	"match_count" integer NOT NULL,
	"model" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "opinion_pieces_generated_idx" ON "opinion_pieces" USING btree ("generated_at");