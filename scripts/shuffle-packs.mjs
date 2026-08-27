/**
 * Shuffle a pack's rotation once, and mark the levels that are not deathmatch.
 *
 *   node scripts/shuffle-packs.mjs             # show what it would do
 *   node scripts/shuffle-packs.mjs --go        # do it
 *   node scripts/shuffle-packs.mjs --go halloween novelty-maps   # only these
 *
 * **Once, deliberately, and then it stays put.** Alpine has its own shuffle:
 * `dynamic_rotation` reshuffles the array when the rotation reaches its last
 * level. That is worth knowing about for two reasons. It does nothing for a long
 * time -- seventy maps at a ten minute limit is about twelve hours before the
 * first shuffle, so the order the maps were listed in is the order they play all
 * evening. And when it does fire it happens inside the game server, which never
 * tells the website, so from that moment the order stored here is fiction.
 *
 * So the rotation is shuffled here, written once, and `dynamic_rotation` is
 * turned off on the server. The order is then a fact the site knows rather than
 * a guess, which is what lets a pack page honestly say what is coming next.
 *
 * **The shuffle is Fisher-Yates and it is not seeded.** A pack shuffled twice
 * gives two different orders, which is why this is a deliberate one-off rather
 * than something a deploy or a sync could re-run: re-shuffling a live rotation
 * would move every map out from under whatever the server is currently playing.
 */
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const go = process.argv.includes("--go");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const url = fs
  .readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim()
  .replace(/^["']|["']$/g, "");
const sql = neon(url);

/**
 * What game type a level wants, read off its filename.
 *
 * Red Faction map names carry their mode as a prefix by long convention, and it
 * is the only signal available: nothing in the pack, the archive or FactionFiles
 * records a level's game type. Only `dc` is acted on. Everything else is left
 * undefined and inherits the server's own type, which is right for the 341
 * deathmatch maps and avoids writing a rules block for every one of them.
 */
function gameTypeFor(filename) {
  return /^dc/i.test(filename) ? "dc" : undefined;
}

/** Fisher-Yates, unbiased, on a copy. */
function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const packs = await sql`select slug, name, maps from map_packs order by name`;

for (const pack of packs) {
  if (only.length && !only.includes(pack.slug)) continue;
  const maps = Array.isArray(pack.maps) ? pack.maps : [];
  if (maps.length < 2) {
    console.log(`\n=== ${pack.name}: ${maps.length} map, nothing to shuffle ===`);
    continue;
  }

  const typed = maps.map((entry) => {
    const gameType = gameTypeFor(entry.filename);
    return gameType ? { ...entry, gameType } : { ...entry, gameType: undefined };
  });
  const next = shuffled(typed);

  const marked = next.filter((entry) => entry.gameType);
  console.log(`\n=== ${pack.name}: ${next.length} maps ===`);
  console.log(`   first five now: ${next.slice(0, 5).map((m) => m.filename).join(", ")}`);
  if (marked.length) {
    for (const m of marked) console.log(`   game type ${m.gameType}: ${m.filename}`);
  } else {
    console.log("   no level needs its own game type");
  }

  if (go) {
    await sql`update map_packs set maps = ${JSON.stringify(next)}::jsonb, updated_at = now()
              where slug = ${pack.slug}`;
    console.log("   stored");
  }
}

if (!go) console.log("\nNothing was written. Re-run with --go.");
