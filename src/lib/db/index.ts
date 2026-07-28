import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
  );
}

/**
 * Neon's HTTP driver. One round trip per query, no connection pool to exhaust,
 * which is what we want on Vercel's serverless functions.
 *
 * If we later need transactions spanning several statements (Phase 2 uploads
 * are the likely trigger), swap this for drizzle-orm/neon-serverless with the
 * WebSocket Pool driver. The query API is identical, so callers do not change.
 */
const sql = neon(connectionString);

export const db = drizzle(sql, { schema });

export * from "./schema";
