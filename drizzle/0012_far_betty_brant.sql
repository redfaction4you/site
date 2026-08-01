CREATE TABLE "player_identities" (
	"identity_key" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
