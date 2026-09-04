/**
 * Verifies what actually exists in the database.
 *
 * drizzle-kit migrate is quiet on success, which is indistinguishable from
 * quiet on doing nothing. Run this after migrating to confirm the tables are
 * really there.
 *
 *   node scripts/check-db.mjs
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Checked .env.local, then .env.");
  process.exit(1);
}

const sql = neon(url);

const EXPECTED = [
  // Phase 1: identity
  "accounts",
  "sessions",
  "users",
  "verificationToken",
  // Phase 2: the downloads catalogue
  "items",
  "files",
  "map_meta",
  "screenshots",
  "item_updates",
];

try {
  const host = new URL(url).host;
  console.log(`\nConnected to ${host}\n`);

  const tables = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `;
  const found = tables.map((row) => row.table_name);

  let missing = 0;
  for (const name of EXPECTED) {
    const ok = found.includes(name);
    if (!ok) missing++;
    console.log(`  ${ok ? "OK     " : "MISSING"}  ${name}`);
  }

  const extra = found.filter((name) => !EXPECTED.includes(name));
  if (extra.length) console.log(`\n  also present: ${extra.join(", ")}`);

  // Drizzle records applied migrations here. Empty means migrate did nothing.
  const applied = await sql`
    select count(*)::int as n
    from information_schema.tables
    where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
  `;

  if (applied[0].n > 0) {
    const rows = await sql`
      select id, hash, created_at from drizzle.__drizzle_migrations order by id
    `;
    console.log(`\n  migrations recorded: ${rows.length}`);
  } else {
    console.log("\n  no drizzle migrations table: migrate never ran");
    missing++;
  }

  if (missing === 0) {
    const users = await sql`select count(*)::int as n from users`;
    console.log(`  rows in users: ${users[0].n}`);
    console.log("\nSchema is live. Ready for sign-in.\n");
  } else {
    console.log("\nSomething did not apply. Re-run: npm run db:migrate\n");
    process.exit(1);
  }
} catch (error) {
  console.error("\nQuery failed:", error.message);
  if (String(error.message).includes("channel_binding")) {
    console.error(
      "Try removing '&channel_binding=require' from DATABASE_URL in .env.local.",
    );
  }
  process.exit(1);
}
