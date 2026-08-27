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
  /**
   * The message printed in chat when somebody joins.
   *
   * One line, plain ASCII, and it reaches a 2001 bitmap font, so `asciiForGame`
   * folds anything a browser produced.
   *
   * **Every one of them ends on a link to its own page.** Chat in Red Faction
   * is not clickable, so whatever is written here has to be retyped into a
   * browser from memory: the link is short, it is the last thing on the line,
   * and no two servers send people to the same place. `servers.test.mjs`
   * checks that last part, because the way this breaks is a copy of another
   * server's message with the link left in it, which is what happened when
   * these configs were first built.
   *
   * The match server points at the archive rather than at its own page. It
   * runs no pack, so there is no map list there to send anybody to.
   *
   * **This file is the source, and it is not what the servers read.** The pub
   * servers read `map_packs.welcome_message` through the applier and the match
   * server reads its own TOML, so `npm run apply:welcome` is what carries a
   * change here to the first of those. Editing this alone changes nothing in
   * the game.
   */
  welcome: string;
  /**
   * Which palette its page wears.
   *
   * The site has one theme and these pages are the exception: a Halloween
   * server whose page looks like every other page is a missed joke. Each theme
   * is a small set of accent tokens overridden on the page root, so the layout,
   * the type and the light and dark handling are untouched and only the accents
   * move.
   */
  theme: ServerTheme;
};

/** The palettes a server page can wear. See `globals.css`. */
export type ServerTheme = "default" | "novelty" | "halloween";

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
    /*
     * The one that points somewhere other than its own page.
     *
     * `/servers/match` carries the live panel and nothing else, because the
     * levels here are picked per match rather than by a pack. The archive is
     * where the reason to visit is.
     */
    welcome:
      "Match server. Every match played here is recorded, with scoreboards " +
      "and records: RedFaction4You.com/matches",
    theme: "default",
  },
  {
    slug: "themed",
    name: "RedFaction4You.com (Themed)",
    blurb:
      "Films, real places, and levels rebuilt from other games. One idea per " +
      "map, carried all the way through it.",
    kind: "deathmatch",
    port: 17756,
    /*
     * Still the deathmatch identity, and it always will be.
     *
     * This server has been called RF4U [DM], Bot-Free Pub, Themed Maps and now
     * Themed. The archive has called it one thing throughout, because
     * `archive_days` upserts on this string and `sync_pings` is keyed on it, so
     * following a rename here would fork its history and strand the old name in
     * `sync_pings` where it holds health red forever.
     */
    identity: "RedFaction4You.com [DM]",
    packSlug: "themed",
    welcome:
      "Themed maps: films, real places, and levels rebuilt from other games. " +
      "All play here is recorded and ranked on time played. " +
      "Every map and the standings: RedFaction4You.com/themed",
    theme: "default",
  },
  {
    slug: "novelty",
    name: "RedFaction4You.com (Novelty)",
    blurb:
      "Liminal spaces, oddities and minigames. Maps too strange or too rare to " +
      "turn up anywhere else.",
    kind: "pub",
    port: 17757,
    identity: null,
    packSlug: "novelty",
    welcome:
      "Novelty maps: liminal spaces, oddities, minigames, and maps too rare " +
      "to find anywhere else. Every map on this server: " +
      "RedFaction4You.com/novelty",
    theme: "novelty",
  },
  {
    slug: "halloween",
    name: "RedFaction4You.com (Halloween)",
    blurb:
      "Spooky season. Haunted houses, graveyards, crypts and castles, every " +
      "map picked for Halloween.",
    kind: "pub",
    port: 17758,
    identity: null,
    packSlug: "halloween",
    welcome:
      "Spooky season. Haunted houses, graveyards, crypts and castles, every " +
      "map picked for Halloween. The whole haunted rotation: " +
      "RedFaction4You.com/halloween",
    theme: "halloween",
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
