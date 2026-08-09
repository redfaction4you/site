CREATE TABLE "feature_pieces" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"headline" text NOT NULL,
	"body" text NOT NULL,
	"standfirst" text,
	"subjects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"match_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "feature_pieces_slug_idx" ON "feature_pieces" USING btree ("slug");