import { createHash } from "node:crypto";

import type { MapPackEntry } from "@/lib/db/schema";

/**
 * The four map pack rules, separated from the queries that use them.
 *
 * They were in `map-packs.ts`, which imports the database, so `node --test`
 * could not load a single one of them — and these are the rules where being
 * wrong is expensive and silent:
 *
 * - a filename the server cannot load is **dropped** at config load, so the
 *   rotation quietly shortens while the site goes on listing the full pack;
 * - a curly quote or an em dash reaches a 2001 bitmap font, which is how the
 *   very first pack name arrived broken;
 * - the fingerprint decides whether the DM server restarts, so anything
 *   wrongly included bounces a server full of people for a wording change,
 *   and anything wrongly excluded leaves the server running the old rotation.
 *
 * The same arrangement `pairings.ts`, `names.ts` and `accuracy.ts` use. Only
 * `node:crypto` is imported, and the type is erased at build.
 */

/**
 * A filename the server could actually load. Anything else is a typo.
 *
 * **Stated as what is forbidden, not what is allowed**, and that is the whole
 * correction. This was an allowlist of `A-Za-z0-9 _.-()[]`, which reads as
 * cautious and quietly threw away eighteen real maps across the packs: every
 * name carrying `~`, `{`, `}`, `'` or `!`. `DM-STUs Nighthawks~.rfl`,
 * `dm_{DVL} Boingy.rfl`, `DM-Sneeky's.rfl` and `dm- ARRRRRRGGGHHH!.rfl` are all
 * genuine Red Faction levels, and fourteen of the hundred and fifty-six in
 * Novelty Maps were being dropped.
 *
 * It failed in the exact way the module header warns about: the rotation
 * quietly shortens while the site goes on listing the full pack. Nobody sees a
 * refusal, because there is nowhere for one to appear.
 *
 * The forbidden set is what Windows actually refuses in a filename, which is
 * the same set `cleanLevelName` on the VPS rejects, plus control characters and
 * a leading or trailing dot. A mapper in 2003 could name a file anything the
 * filesystem accepted, so anything the filesystem accepts has to be allowed
 * here.
 */
const FORBIDDEN_IN_FILENAME = /[\\\/:*?"<>|]/;
const CONTROL_CHARACTER = /[\u0000-\u001f]/;

export function isLevelFilename(value: string): boolean {
  const name = value.trim();
  if (!/^.{1,64}\.rfl$/i.test(name)) return false;
  if (FORBIDDEN_IN_FILENAME.test(name)) return false;
  if (CONTROL_CHARACTER.test(name)) return false;
  // A leading dot hides the file, and `..` is a path rather than a name.
  if (name.startsWith(".") || name.includes("..")) return false;
  return true;
}

/**
 * Anything bound for the game, folded to plain ASCII.
 *
 * The server name and the welcome message end up in a TOML file read by a
 * 2001 engine and rendered in its own bitmap font. A curly quote or an em
 * dash — exactly what a person gets for free typing into a browser — is at
 * best drawn as rubbish and at worst mangles the line. Caught on the first
 * real pack, whose name arrived carrying an em dash.
 *
 * The substitutions are the punctuation a form actually produces; everything
 * else outside printable ASCII is dropped rather than guessed at. Only the
 * two server-bound fields go through this. The public page keeps whatever was
 * typed, because a browser renders it correctly.
 */
export function asciiForGame(value: string): string {
  return value
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/[…]/g, "...")
    .replace(/[   ]/g, " ")
    .replace(/[•]/g, "*")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The in-game welcome message for a pack.
 *
 * Written from the pack when it has no message of its own, because typing the
 * map list twice is how the two come to disagree. Kept to one line: this is
 * printed into a chat area, not a page. ASCII only — see `asciiForGame`.
 */
export function welcomeFor(pack: {
  name: string;
  welcomeMessage?: string | null;
  maps: MapPackEntry[];
}): string {
  if (pack.welcomeMessage?.trim()) return asciiForGame(pack.welcomeMessage);
  const count = pack.maps.length;
  /*
   * The generated one says how stats work here, not just what is playing.
   *
   * Asked for on 10 August: somebody joining should know straight away that
   * they are being recorded and where to look. It is written here rather than
   * into a pack's own `welcomeMessage` field on purpose — a per-pack string
   * freezes to that pack, and the next pack somebody makes silently loses it.
   *
   * **The wording differs from the match server's on purpose.** Everything on
   * this server is recorded whether or not a match is running, and the board is
   * ranked on time played; the match server only records inside a started
   * match. Telling a newcomer the wrong one of those is worse than telling them
   * nothing.
   */
  return asciiForGame(
    `Now playing: ${pack.name} - ${count} ${count === 1 ? "map" : "maps"}. ` +
      `All play here is recorded and ranked on time played. ` +
      `Your stats: RedFaction4You.com/stats`,
  );
}

/**
 * Everything the server would notice, hashed.
 *
 * Level order is included: the rotation running in a different order is a
 * different rotation. The blurb, the note under each map and the author
 * credit are all absent on purpose — they are for readers, and a wording fix
 * must never bounce the server.
 */
export function fingerprintOf(pack: {
  slug: string;
  serverName: string | null;
  welcomeMessage: string;
  levels: string[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        slug: pack.slug,
        serverName: pack.serverName,
        welcomeMessage: pack.welcomeMessage,
        levels: pack.levels,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}
