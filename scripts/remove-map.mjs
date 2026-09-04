/**
 * Take one map out of a server's active pack.
 *
 *   npm run map:remove -- halloween DM_BartsCorridors.rfl
 *   npm run map:remove -- halloween DM_BartsCorridors.rfl --go
 *
 * Order is preserved. The rotation was shuffled once, deliberately, and set;
 * rebuilding it because one map left would reshuffle every other map with it
 * and quietly discard that decision.
 *
 * **This is half the job for three of the four servers.** The applier on the
 * VPS polls `/api/rf4u/map-pack/active` and rewrites `rf4u-dm.toml` only, so
 * the Themed server picks a change up within five minutes and Novelty and
 * Halloween do not: their TOMLs were written by hand and stay that way until
 * somebody edits them. The script says so at the end rather than exiting
 * quietly, because a pack that no longer lists a map while the server still
 * rotates onto it is the kind of disagreement nobody goes looking for.
 *
 * Matching is on filename, case-insensitively, and on the resolved title as a
 * fallback. A filename that matches nothing is an error rather than a no-op.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { flag, positionals } from "./cli-flags.mjs";

config({ path: ".env.local" });
config();

// Not `args.includes("--go")`: npm eats the flag on Windows and the removal
// would report itself as a dry run. See scripts/cli-flags.mjs.
const go = flag("go");
const [server, wanted] = positionals();

if (!server || !wanted) {
  console.error("Usage: npm run map:remove -- <server> <filename or title> [--go]");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Checked .env.local, then .env.");
  process.exit(1);
}
const sql = neon(url);

const [pack] = await sql`
  select id, slug, server, maps from map_packs where server = ${server} and active`;

if (!pack) {
  console.error(`No active pack for server "${server}".`);
  process.exit(1);
}

const needle = wanted.trim().toLowerCase();
const matches = pack.maps.filter(
  (map) =>
    String(map.filename ?? "").toLowerCase() === needle ||
    String(map.title ?? "").toLowerCase() === needle,
);

if (matches.length === 0) {
  console.error(`"${wanted}" is not in pack "${pack.slug}" (${pack.maps.length} maps).`);
  const near = pack.maps.filter((map) =>
    `${map.filename} ${map.title ?? ""}`.toLowerCase().includes(needle.split(/[\s_.-]/)[0] ?? needle),
  );
  if (near.length) {
    console.error("Did you mean:");
    for (const map of near.slice(0, 8)) console.error(`  ${map.filename}  (${map.title ?? "no title"})`);
  }
  process.exit(1);
}

const remaining = pack.maps.filter((map) => !matches.includes(map));

console.log(`pack "${pack.slug}" on ${pack.server}: ${pack.maps.length} maps`);
for (const map of matches) {
  console.log(`  ${go ? "removing" : "would remove"}  ${map.filename}  (${map.title ?? "no title"})`);
}
console.log(`  ${pack.maps.length} -> ${remaining.length}`);

if (go) {
  await sql`
    update map_packs set maps = ${JSON.stringify(remaining)}::jsonb, updated_at = now()
    where id = ${pack.id}`;
  console.log("written.");
} else {
  console.log("\nDry run. Re-run with --go to write.");
}

/*
 * What the database cannot do on its own.
 */
if (server === "themed") {
  console.log("\nThe applier rewrites rf4u-dm.toml within five minutes and restarts the server.");
} else {
  console.log(`\nStill to do on the VPS, which the applier does not reach:`);
  for (const map of matches) {
    console.log(`  remove the [[levels]] entry for ${map.filename} from rf4u-${server}.toml`);
  }
  console.log(`  then restart the "RF4U ${server[0].toUpperCase()}${server.slice(1)} Server" task`);
}
