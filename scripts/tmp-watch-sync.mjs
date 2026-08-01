import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);
const baseline = "2026-08-01T09:26:54.515Z";
for (let i = 0; i < 30; i++) {
  const [row] = await sql`select max(ingested_at) as last from matches`;
  const last = new Date(row.last).toISOString();
  if (last !== baseline) {
    console.log(`sync landed at ${last} (baseline ${baseline})`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 60_000));
}
console.log(`no sync in 30 minutes; last ingest still ${baseline}`);
