import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`select archive_day::text as day, headline, body, match_count, model from opinion_pieces order by archive_day desc`;
if (!rows.length) { console.log("no opinion piece yet"); process.exit(0); }
for (const r of rows) {
  console.log(`\n=== ${r.day} · ${r.model} · from ${r.match_count} matches ===`);
  console.log(r.headline);
  console.log("---");
  console.log(r.body);
}
