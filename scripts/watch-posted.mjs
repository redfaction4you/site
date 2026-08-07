/**
 * Samples posted_at every fifteen seconds and prints only transitions.
 *
 * Written because three attempts to diagnose the repeated Discord post from
 * timestamps after the fact all failed to close. A claimed row was becoming
 * unclaimed and no code path could account for it. This watches the column
 * itself, so the next transition to null is observed rather than inferred.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });
delete process.env.DISCORD_NEWS_WEBHOOK;

const sql = neon(process.env.DATABASE_URL);
const seen = new Map();

async function sample() {
  const rows = await sql`
    select 'opinion' kind, archive_day::text d, posted_at from opinion_pieces
    union all
    select 'column', archive_day::text, posted_at from night_columns
  `;
  for (const r of rows) {
    const id = `${r.kind} ${r.d}`;
    const now = r.posted_at ? r.posted_at.toISOString() : "NULL";
    const was = seen.get(id);
    if (was !== undefined && was !== now) {
      console.log(`${new Date().toISOString()}  ${id}: ${was} -> ${now}`);
    }
    seen.set(id, now);
  }
}

await sample();
console.log(`${new Date().toISOString()}  baseline taken, ${seen.size} rows, watching`);

setInterval(() => {
  sample().catch((e) => console.log(`sample failed: ${e.message}`));
}, 15_000);
