import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit runs outside Next.js, so nothing has loaded the environment for
 * it. Plain `dotenv/config` reads `.env` only: `.env.local` is a Next
 * convention that dotenv knows nothing about. Load it explicitly, then fall
 * back to `.env`. dotenv does not overwrite variables that are already set, so
 * the first call wins and real shell variables beat both (which is what CI
 * wants).
 */
config({ path: ".env.local" });
config();

// Migrations run over the direct (unpooled) connection. Neon's pooler does not
// support the session-level statements drizzle-kit issues.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL_UNPOOLED or DATABASE_URL must be set to run migrations.\n" +
      "Checked .env.local, then .env, then the shell environment.",
  );
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
