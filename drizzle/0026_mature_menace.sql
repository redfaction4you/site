CREATE TABLE "item_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"release_version" text,
	"title" text NOT NULL,
	"body" text,
	"released_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "release_version" text;--> statement-breakpoint
ALTER TABLE "item_updates" ADD CONSTRAINT "item_updates_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_updates_item_released_idx" ON "item_updates" USING btree ("item_id","released_at");--> statement-breakpoint
CREATE INDEX "items_kind_status_category_idx" ON "items" USING btree ("kind","status","category");