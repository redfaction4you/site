CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"content_type" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"description" text,
	"author_name" text,
	"author_user_id" text,
	"uploader_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"released_on" date,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "items_kind_slug_key" UNIQUE("kind","slug")
);
--> statement-breakpoint
CREATE TABLE "map_meta" (
	"item_id" text PRIMARY KEY NOT NULL,
	"rfl_version" integer,
	"plays_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detection_confidence" text DEFAULT 'known' NOT NULL,
	"required_features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"levels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screenshots" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"caption" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "screenshots_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_meta" ADD CONSTRAINT "map_meta_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_item_idx" ON "files" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "files_sha256_idx" ON "files" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "items_kind_status_idx" ON "items" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "items_uploader_idx" ON "items" USING btree ("uploader_id");--> statement-breakpoint
CREATE INDEX "map_meta_rfl_version_idx" ON "map_meta" USING btree ("rfl_version");--> statement-breakpoint
CREATE UNIQUE INDEX "screenshots_item_position_idx" ON "screenshots" USING btree ("item_id","position");