CREATE TABLE "archive_days" (
	"server" text NOT NULL,
	"archive_day" date NOT NULL,
	"content_hash" text NOT NULL,
	"written_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "archive_days_server_archive_day_pk" PRIMARY KEY("server","archive_day")
);
