/**
 * Carry the welcome messages in `servers.ts` onto the servers.
 *
 *   npm run apply:welcome        # say what would change
 *   npm run apply:welcome -- --go
 *
 * `servers.ts` is where these are written and reviewed, and it is not what any
 * server reads. The servers read `map_packs.welcome_message`, which the
 * applier on the VPS polls and writes into a TOML. So a message edited in the
 * registry and nowhere else is a message nobody in the game ever sees, and the
 * two quietly disagree from then on.
 *
 * **Only Themed is carried the whole way.** The applier on the VPS applies the
 * Themed pack and nothing else; Novelty's and Halloween's configs are edited by
 * hand. A change written here for those two lands in the database and on the
 * admin page, and reaches the game only when somebody edits that server's TOML
 * to match.
 *
 * Writes only `welcome_message`, and only on the active pack for each server.
 * The level list, the pack name and everything else are somebody else's job.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

import { SERVERS } from "../src/lib/servers.ts";
import { asciiForGame } from "../src/lib/map-pack-rules.ts";
import { flag } from "./cli-flags.mjs";

config({ path: ".env.local" });
config();

// Not `process.argv.includes("--go")`: npm eats the flag on Windows and this
// would then quietly write nothing. See scripts/cli-flags.mjs.
const go = flag("go");

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
  SERVERS.map((server) => [
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

console.log(
  `\n${changed} to change, ${missing} without an active pack.` +
    (go || changed === 0 ? "" : " Re-run with --go to write."),
);
