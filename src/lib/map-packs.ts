import { createHash } from "node:crypto";
import { cache } from "react";
import { asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { mapPacks, type MapPackEntry } from "@/lib/db/schema";

/**
 * Themed map packs for the deathmatch server.
 *
 * A pack is a list of maps plus what to call the server while it is on.
 * Switching one on from /admin is the whole interface; the VPS polls
 * `/api/rf4u/map-pack/active`, notices the fingerprint moved, and rewrites
 * three fields of the server's config.
 *
 * **The fingerprint is the contract.** The VPS applies a pack when the hash it
 * last applied differs from the one it is served, which means a pack edited in
 * place — a map added, the name changed — is applied exactly as readily as a
 * different pack being switched on. Anything the server would notice goes into
 * the hash and nothing else does: renaming the blurb on the public page must
 * not restart a server full of people.
 */

export type MapPack = {
  id: string;
  slug: string;
  name: string;
  blurb: string | null;
  serverName: string | null;
  welcomeMessage: string | null;
  maps: MapPackEntry[];
  active: boolean;
  activatedAt: string | null;
};

/** What the VPS is served. Deliberately smaller than the row. */
export type ActiveMapPack = {
  slug: string;
  name: string;
  /** What to set `server_name` to, already resolved. Null leaves it alone. */
  serverName: string | null;
  /** The welcome message, already built if the pack did not write one. */
  welcomeMessage: string;
  /** Just the filenames, in order, which is all the level list needs. */
  levels: string[];
  /** Changes only when something the server would notice changes. */
  fingerprint: string;
  activatedAt: string | null;
};

/** A filename the server could actually load. Anything else is a typo. */
export function isLevelFilename(value: string): boolean {
  return /^[A-Za-z0-9 _.\-()[\]]{1,64}\.rfl$/.test(value.trim());
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
    .replace(/[   ]/g, " ")
    .replace(/[•]/g, "*")
    // eslint-disable-next-line no-control-regex
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
  return asciiForGame(
    `Now playing: ${pack.name} - ${count} ${count === 1 ? "map" : "maps"}. ` +
      `Full list and credits at RedFaction4You.com/server/map-packs`,
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

function toActive(row: MapPack): ActiveMapPack {
  const levels = row.maps
    .map((entry) => entry.filename.trim())
    .filter((filename) => isLevelFilename(filename));
  const welcomeMessage = welcomeFor(row);
  const serverName = row.serverName?.trim() ? asciiForGame(row.serverName) || null : null;
  return {
    slug: row.slug,
    name: row.name,
    serverName,
    welcomeMessage,
    levels,
    fingerprint: fingerprintOf({ slug: row.slug, serverName, welcomeMessage, levels }),
    activatedAt: row.activatedAt,
  };
}

const columns = {
  id: mapPacks.id,
  slug: mapPacks.slug,
  name: mapPacks.name,
  blurb: mapPacks.blurb,
  serverName: mapPacks.serverName,
  welcomeMessage: mapPacks.welcomeMessage,
  maps: mapPacks.maps,
  active: mapPacks.active,
  activatedAt: sql<string | null>`${mapPacks.activatedAt}::text`,
};

export const listMapPacks = cache(async function listMapPacks(): Promise<MapPack[]> {
  return db
    .select(columns)
    .from(mapPacks)
    .orderBy(desc(mapPacks.active), asc(mapPacks.name));
});

export const getMapPack = cache(async function getMapPack(
  slug: string,
): Promise<MapPack | null> {
  const [row] = await db.select(columns).from(mapPacks).where(eq(mapPacks.slug, slug));
  return row ?? null;
});

/** The pack currently on, as the public page shows it. */
export const activeMapPack = cache(async function activeMapPack(): Promise<MapPack | null> {
  const [row] = await db.select(columns).from(mapPacks).where(eq(mapPacks.active, true));
  return row ?? null;
});

/** The pack currently on, as the VPS applies it. Null means "leave it alone". */
export async function activeMapPackForServer(): Promise<ActiveMapPack | null> {
  const row = await activeMapPack();
  if (!row) return null;
  const active = toActive(row);
  // A pack with no usable filenames would empty the rotation and leave the
  // server with nothing to load. Refused here rather than on the VPS: the
  // applier should never have to decide whether what it was sent is sane.
  if (active.levels.length === 0) return null;
  return active;
}
