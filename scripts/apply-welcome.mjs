/**
 * Carry the welcome messages in `servers.ts` onto the servers.
 *
 *   npm run apply:welcome        # say what would change
 *   npm run apply:welcome -- --go
 *
 * `servers.ts` is where these are written and reviewed, and it is not what any
 * server reads. The pub servers read `map_packs.welcome_message`, which the
 * applier on the VPS polls and writes into a TOML; the match server runs no
 * pack and keeps its text in `rf4u-match.toml` directly. So a message edited in
 * the registry and nowhere else is a message nobody in the game ever sees, and
 * the two quietly disagree from then on.
 *
 * This closes the gap for everything that has a pack. The match server cannot
 * be reached from here at all, so it is printed rather than skipped silently:
 * an applier that is quiet about the one thing it cannot do reads exactly like
 * one that had nothing to do.
 *
 * Writes only `welcome_message`, and only on the active pack for each server.
 * The level list, the pack name and everything else are somebody else's job.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

import { SERVERS } from "../src/lib/servers.ts";
import { asciiForGame } from "../src/lib/map-pack-rules.ts";

config({ path: ".env.local" });
config();

const go = process.argv.includes("--go");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Checked .env.local, then .env.");
  process.exit(1);
}
const sql = neon(url);

/*
 * Folded the way the server will see it, not the way it was typed.
 *
 * `welcomeFor` runs `asciiForGame` over whatever is stored, so comparing the
 * raw strings would report a difference on every run for any message that
 * contains something the fold changes, and writing it would never settle.
 */
const intended = new Map(
  SERVERS.filter((server) => server.packSlug).map((server) => [
    server.slug,
    asciiForGame(server.welcome),
  ]),
);

const rows = await sql`
  select server, slug, welcome_message
  from map_packs
  where active`;

let changed = 0;
let missing = 0;

for (const server of SERVERS) {
  if (!server.packSlug) continue;

  const row = rows.find((candidate) => candidate.server === server.slug);
  if (!row) {
    console.log(`  ${server.slug.padEnd(10)} no active pack, nothing to write`);
    missing += 1;
    continue;
  }

  const want = intended.get(server.slug);
  if (row.welcome_message === want) {
    console.log(`  ${server.slug.padEnd(10)} already current`);
    continue;
  }

  changed += 1;
  console.log(`  ${server.slug.padEnd(10)} ${go ? "writing" : "would write"} on pack "${row.slug}"`);
  console.log(`             was : ${row.welcome_message ?? "(null, generated from the pack)"}`);
  console.log(`             now : ${want}`);

  if (go) {
    await sql`
      update map_packs
      set welcome_message = ${want}, updated_at = now()
      where server = ${server.slug} and active`;
  }
}

/*
 * The one this cannot reach.
 *
 * Two blocks, because `[levels.rules]` overrides `[base.rules]` and editing
 * only the second changes nothing anybody joining will read.
 */
const match = SERVERS.find((server) => !server.packSlug);
if (match) {
  console.log(`\n  ${match.slug.padEnd(10)} runs no pack. Set both welcome_message blocks in`);
  console.log(`             rf4u-match.toml by hand, then restart it:`);
  console.log(`             ${asciiForGame(match.welcome)}`);
}

console.log(
  `\n${changed} to change, ${missing} without an active pack.` +
    (go || changed === 0 ? "" : " Re-run with --go to write."),
);
