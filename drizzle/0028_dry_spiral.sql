CREATE TABLE "map_opinions" (
	"id" text PRIMARY KEY NOT NULL,
	"server" text NOT NULL,
	"filename" text NOT NULL,
	"title" text,
	"player" text NOT NULL,
	"verdict" text NOT NULL,
	"reason" text,
	"asked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "map_opinions_map_idx" ON "map_opinions" USING btree ("server","filename");