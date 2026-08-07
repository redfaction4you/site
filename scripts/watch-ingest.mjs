/**
 * Watches which days the ingest actually writes.
 *
 * A day is only rewritten when its payload changes, so after the first pass
 * through the new code each day should be fingerprinted once and then left
 * alone. This prints a line whenever a `written_at` moves, which is the only
 * thing that should be rare.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });
delete process.env.DISCORD_NEWS_WEBHOOK;

const sql = neon(process.env.DATABASE_URL);
const seen = new Map();

async function sample() {
  const rows = await sql`
    select archive_day::text as d, written_at from archive_days order by 1
  `;
  for (const row of rows) {
    const at = row.written_at.toISOString();
    const was = seen.get(row.d);
    if (was === undefined) {
      console.log(`${new Date().toISOString().slice(11, 19)}  ${row.d} fingerprinted`);
    } else if (was !== at) {
      console.log(`${new Date().toISOString().slice(11, 19)}  ${row.d} REWRITTEN`);
    }
    seen.set(row.d, at);
  }
}

await sample();
console.log(`baseline: ${seen.size} day(s) fingerprinted, watching`);
setInterval(() => sample().catch((e) => console.log(`sample failed: ${e.message}`)), 20_000);
