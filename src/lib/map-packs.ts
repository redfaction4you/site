import { cache } from "react";
import { unstable_cache } from "next/cache";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { mapPacks, type MapPackEntry } from "@/lib/db/schema";

/**
 * Every pack mutation on /admin revalidates this tag. The active-pack read is
 * served from the data cache between mutations, because Neon bills for every
 * hour the database is kept awake and the VPS applier's poll of this read was
 * enough on its own to stop the compute ever suspending back when it ran every
 * five minutes; it is nightly now, and the cache keeps even that from reaching
 * Postgres. A script that writes `map_packs` directly (link-maps,
 * apply-welcome, remove-map) bypasses the tag; after one of those, save any
 * pack on /admin or wait out the hourly revalidation.
 */
export const MAP_PACKS_CACHE_TAG = "map-packs";

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

/*
 * The rules live in `map-pack-rules.ts`, which imports no database and can
 * therefore be loaded by `node --test`. Re-exported here so every existing
 * caller keeps working and there is still one obvious place to import from.
 */
import {
  asciiForGame,
  fingerprintOf,
  isLevelFilename,
  welcomeFor,
} from "@/lib/map-pack-rules";

export { asciiForGame, fingerprintOf, isLevelFilename, welcomeFor };
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

/**
 * The pack currently on for one server, as the public page shows it.
 *
 * The server is required, and that is the whole point of this signature. This
 * used to be `where active` with no server and take the first row, which was the
 * right answer while one server took packs. The moment a second did, the applier
 * polling for its own rotation could be handed somebody else's: the deathmatch
 * server was minutes away from being sent 156 novelty maps and restarted into
 * them, because both packs were legitimately active and the query could not tell
 * them apart. The database now enforces one active pack per server; this makes
 * the read ask the same question.
 */
const activePackFromDb = unstable_cache(
  async (server: string): Promise<MapPack | null> => {
    const [row] = await db
      .select(columns)
      .from(mapPacks)
      .where(and(eq(mapPacks.active, true), eq(mapPacks.server, server)));
    return row ?? null;
  },
  ["active-map-pack"],
  // The hour is a backstop for writes that bypass the tag, not the freshness
  // mechanism: an /admin change is fresh here immediately, and reaches the
  // server on the applier's next pass.
  { tags: [MAP_PACKS_CACHE_TAG], revalidate: 3600 },
);

export const activeMapPack = cache(async function activeMapPack(
  server: string,
): Promise<MapPack | null> {
  return activePackFromDb(server);
});

/** The pack currently on, as the VPS applies it. Null means "leave it alone". */
export async function activeMapPackForServer(
  server: string,
): Promise<ActiveMapPack | null> {
  const row = await activeMapPack(server);
  if (!row) return null;
  const active = toActive(row);
  // A pack with no usable filenames would empty the rotation and leave the
  // server with nothing to load. Refused here rather than on the VPS: the
  // applier should never have to decide whether what it was sent is sane.
  if (active.levels.length === 0) return null;
  return active;
}
