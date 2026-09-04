/**
 * Resolve every map in every pack to its FactionFiles page.
 *
 *   node scripts/link-maps.mjs            # report only, writes nothing
 *   node scripts/link-maps.mjs --go       # store what it found
 *   node scripts/link-maps.mjs --go --all # re-resolve entries that already have one
 *
 * A pack is a list of filenames the server loads. That is all the server needs
 * and nothing a reader can use: "DM-CI_Serpentes_Punctum.rfl" is not a name, and
 * a pack page that lists 156 of them is a page nobody reads. FactionFiles knows
 * the real title, the author and where to download it, and it will match on the
 * level filename, so the whole list can become links.
 *
 * **Resolved once and stored, never looked up per request.** Three packs are 341
 * maps; a page that resolved them on render would make 341 HTTP calls to
 * somebody else's server every time somebody opened it. The answers go into the
 * pack's own `maps` array, which already had `title`, `author` and `url` fields
 * waiting for exactly this.
 *
 * **A guess is recorded as a guess.** The lookup says whether it matched exactly
 * or guessed from a similar name, and a guess can point at a different map. The
 * flag is stored rather than resolved here, because "link it anyway" and "show
 * nothing" are both defensible and that is a decision for the page, not for a
 * batch script. What is not defensible is losing the distinction.
 */
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { flag } from "./cli-flags.mjs";

const LOOKUP = "https://rfsb.factionfiles.com/api/v2/ff-rfl-lookup";
const PAGE = (id) => `https://www.factionfiles.com/ff.php?action=file&id=${id}`;

/** Polite spacing between calls to somebody else's server. */
const GAP_MS = 120;
const TIMEOUT_MS = 15_000;

const go = flag("go");
const all = flag("all");

const url = fs
  .readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim()
  .replace(/^["']|["']$/g, "");
const sql = neon(url);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function lookup(filename) {
  try {
    const response = await fetch(`${LOOKUP}/${encodeURIComponent(filename)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { state: "error", reason: `HTTP ${response.status}` };
    const body = await response.json();
    if (!body?.success || !body.file_id) return { state: "unknown" };
    return {
      state: "found",
      title: body.file_name || undefined,
      fileId: body.file_id,
      guessed: Boolean(body.guessed),
    };
  } catch (error) {
    return { state: "error", reason: error?.message ?? "failed" };
  }
}

const packs = await sql`select slug, name, maps from map_packs order by name`;
let totalFound = 0;
let totalGuessed = 0;
let totalUnknown = 0;

for (const pack of packs) {
  const maps = Array.isArray(pack.maps) ? pack.maps : [];
  const todo = maps.filter((m) => all || !m.url);
  if (todo.length === 0) {
    console.log(`\n=== ${pack.name}: all ${maps.length} already linked ===`);
    continue;
  }

  console.log(`\n=== ${pack.name}: resolving ${todo.length} of ${maps.length} ===`);
  const next = [];
  let found = 0;
  let guessed = 0;
  const unknown = [];

  for (const entry of maps) {
    if (!all && entry.url) {
      next.push(entry);
      continue;
    }
    const result = await lookup(entry.filename);
    await sleep(GAP_MS);

    if (result.state === "found") {
      found++;
      if (result.guessed) guessed++;
      next.push({
        ...entry,
        title: result.title ?? entry.title,
        url: PAGE(result.fileId),
        guessed: result.guessed || undefined,
      });
    } else {
      if (result.state === "error") {
        console.log(`   ! ${entry.filename}: ${result.reason}`);
      }
      unknown.push(entry.filename);
      // Left exactly as it was. A failed lookup must not erase a link that a
      // previous run found, which is why this rebuilds rather than patches.
      next.push(entry);
    }
  }

  totalFound += found;
  totalGuessed += guessed;
  totalUnknown += unknown.length;

  console.log(
    `   ${found} linked (${guessed} guessed), ${unknown.length} not on FactionFiles`,
  );
  for (const name of unknown.slice(0, 8)) console.log(`     - ${name}`);
  if (unknown.length > 8) console.log(`     ... and ${unknown.length - 8} more`);

  if (go) {
    await sql`update map_packs set maps = ${JSON.stringify(next)}::jsonb, updated_at = now()
              where slug = ${pack.slug}`;
    console.log("   stored");
  }
}

console.log(
  `\n${totalFound} linked, ${totalGuessed} of them guessed, ${totalUnknown} unresolved.`,
);
if (!go) console.log("Nothing was written. Re-run with --go to store it.");
