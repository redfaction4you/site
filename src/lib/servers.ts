/**
 * Every game server RedFaction4You runs, in one place.
 *
 * Small, stable, and edited by hand, so it is a typed file rather than a table:
 * the same trade `videos.ts` and `nav.ts` make. A server appearing here is a
 * decision somebody makes once, not something the site discovers.
 *
 * **Ports are derived, never configured.** All four run on one machine, so the
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
 * The four servers.
 *
 * Order is the order of the tabs, and it is deliberate: match first because it
 * is what the archive is about, then the three pub servers by how long they have
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
    slug: "bot-free-pub",
    name: "RedFaction4You.com (Bot-Free Pub)",
    blurb:
      "Casual deathmatch on stock favourites. No bots, and a round is recorded " +
      "whenever anybody is playing.",
    kind: "deathmatch",
    port: 17756,
    identity: "RedFaction4You.com [DM]",
    packSlug: "stock-favourites",
  },
  {
    slug: "halloween",
    name: "RedFaction4You.com (Halloween Maps)",
    blurb:
      "A pub server running a Halloween map pack, including maps you will not " +
      "find anywhere else.",
    kind: "pub",
    port: 17757,
    identity: null,
    packSlug: "halloween",
  },
  {
    slug: "micro-maps",
    name: "RedFaction4You.com (Micro Maps)",
    blurb:
      "A pub server for micro maps: small, fast, and over before you have " +
      "found the rocket launcher.",
    kind: "pub",
    port: 17758,
    identity: null,
    packSlug: "micro-maps",
  },
];

/** The host all four share, from the one address that is configured. */
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

/** Slots, which is the same on every server and is not worth four entries. */
export const SERVER_SLOTS = 16;
