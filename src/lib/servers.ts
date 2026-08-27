/**
 * Every game server RedFaction4You runs, in one place.
 *
 * Small, stable, and edited by hand, so it is a typed file rather than a table:
 * the same trade `videos.ts` and `nav.ts` make. A server appearing here is a
 * decision somebody makes once, not something the site discovers.
 *
 * **Ports are derived, never configured.** They all run on one machine, so the
 * host comes from `NEXT_PUBLIC_SERVER_ADDRESS` and each server carries its own
 * port. That is deliberate and `server-status.ts` already had to learn it: a new
 * environment variable on Vercel needs a fresh build rather than a redeploy, and
 * that trap has cost half an hour once already. Adding a server here is a code
 * change that ships with the deploy that mentions it.
 *
 * **`identity` is not `name`.** The archive upserts matches on
 * `(server, source_match_id)` and `sync_pings` is keyed on the same string, so
 * an identity can never follow a rename. The two servers that record anything
 * therefore carry both: the name a person reads, and the string the database
 * has always used. `server-names.ts` is what keeps them looking the same.
 *
 * The deathmatch server is the cautionary one. It has been called RF4U [DM],
 * Bot-Free Pub and Themed Maps; the archive has called it `RedFaction4You.com
 * [DM]` throughout, and must go on doing so.
 */

/** What a server is for, which decides what the site can show about it. */
export type ServerKind =
  /** Organised capture the flag. Everything is recorded. */
  | "match"
  /** Casual play, recorded as rounds rather than matches. */
  | "deathmatch"
  /** Casual play, not recorded at all. */
  | "pub";

export type GameServer = {
  /** URL fragment and tab key. Stable; changing one breaks a shared link. */
  slug: string;
  /** What a person reads, and what the server browser shows. */
  name: string;
  /** One sentence on what it is for. */
  blurb: string;
  kind: ServerKind;
  port: number;
  /**
   * The string the archive stores for this server, or null when nothing about
   * it is archived.
   *
   * Never edit one of these to match a rename. See the module note.
   */
  identity: string | null;
  /**
   * The map pack whose rotation this server runs, by slug, or null where the
   * rotation is not managed from the site.
   *
   * The match server's levels are chosen per match rather than by a pack.
   */
  packSlug: string | null;
};

/**
 * The servers.
 *
 * Order is the order of the tabs, and it is deliberate: match first because it
 * is what the archive is about, then the casual servers by how long they have
 * existed.
 */
export const SERVERS: GameServer[] = [
  {
    slug: "match",
    name: "RedFaction4You.com (Match)",
    blurb:
      "Organised capture the flag. Matches are started deliberately and every " +
      "one of them is recorded here.",
    kind: "match",
    port: 17755,
    identity: "RF4U Competitive [Match]",
    packSlug: null,
  },
  {
    slug: "themed-maps",
    name: "RedFaction4You.com (Themed Maps)",
    blurb:
      "Casual deathmatch on whichever themed pack is in circulation. No bots, " +
      "and a round is recorded whenever anybody is playing.",
    kind: "deathmatch",
    port: 17756,
    /*
     * Still the deathmatch identity, and it always will be.
     *
     * This server has now been called three things. The archive has called it
     * one, because `archive_days` upserts on this string and `sync_pings` is
     * keyed on it, so following a rename here would fork its history and strand
     * the old name in `sync_pings` where it holds health red forever.
     */
    identity: "RedFaction4You.com [DM]",
    packSlug: "stock-favourites",
  },
  {
    slug: "novelty-maps",
    name: "RedFaction4You.com (Novelty Maps)",
    blurb:
      "A pub server for the odd ones: maps that are strange, tiny, or built " +
      "around a single idea, several of them found nowhere else.",
    kind: "pub",
    port: 17757,
    identity: null,
    packSlug: "novelty-maps",
  },
];

/** The host they all share, from the one address that is configured. */
export function serverHost(): string | null {
  const address = process.env.NEXT_PUBLIC_SERVER_ADDRESS;
  const host = address?.split(":")[0];
  return host && host.length > 0 ? host : null;
}

/** `host:port` for a server, or null when no host is configured. */
export function serverAddress(server: GameServer): string | null {
  const host = serverHost();
  return host ? `${host}:${server.port}` : null;
}

export function serverBySlug(slug: string): GameServer | null {
  return SERVERS.find((server) => server.slug === slug) ?? null;
}

/**
 * The client build people need, said once.
 *
 * This was `NEXT_PUBLIC_SERVER_CLIENT`, and on 26 August it still read
 * "Alpine Faction 1.3.0" a day after both servers went to 1.4.0 -- a version
 * number in an environment variable is a version number nobody updates. The
 * servers all run the same build, so it belongs beside them.
 */
export const SERVER_CLIENT = "Alpine Faction 1.4.0";

/** Slots, which is the same on every server and is not worth an entry each. */
export const SERVER_SLOTS = 16;
