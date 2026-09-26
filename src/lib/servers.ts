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
 * There were four until 25 September 2026. The Match server was switched off
 * that day, when RF4U stopped recording stats, and is expected back later as a
 * different kind of server. It left this list rather than being hidden in it,
 * because every page built from this list would otherwise have to remember to
 * skip it.
 */

export type GameServer = {
  /** URL fragment and tab key. Stable; changing one breaks a shared link. */
  slug: string;
  /** What a person reads, and what the server browser shows. */
  name: string;
  /** One sentence on what it is for. */
  blurb: string;
  port: number;
  /**
   * The map pack whose rotation this server runs, by slug.
   *
   * Required, not nullable. Every server here exists to be looked up by its
   * maps, so a server without a pack would be a page with nothing on it, and
   * `servers.test.mjs` would rather that failed than shipped.
   */
  packSlug: string;
  /**
   * The server's config file on the VPS, by name, inside the game directory.
   *
   * **Written out per server and never derived.** The slug is `themed` and the
   * file is `rf4u-dm.toml`, because that server was the deathmatch server
   * before it was the themed one and the file kept its name.
   * `scripts/remove-map.mjs` builds `rf4u-${server}.toml` by rule and is wrong
   * for exactly that one, which is the trap this field exists to close.
   */
  configFile: string;
  /**
   * The Windows scheduled task that supervises this server's process.
   *
   * Each is a watchdog loop, not the game itself: it starts the game through
   * the Alpine launcher, and relaunches within about five seconds of the UDP
   * port going free. So restarting a server means ending the game process and
   * letting the watchdog notice, which is the same path it uses for a hang.
   * Stopping the task alone does not stop the game.
   */
  restartTask: string;
  /**
   * The message printed in chat when somebody joins.
   *
   * One line, plain ASCII, and it reaches a 2001 bitmap font, so `asciiForGame`
   * folds anything a browser produced.
   *
   * **Every one of them ends on a link to its own page**, apart from
   * Halloween's, which was written for the season and is left as its author
   * wrote it. Chat in Red Faction is not clickable, so whatever is written here
   * has to be retyped into a browser from memory: the link is short, it is the
   * last thing on the line, and no two servers send people to the same place.
   * `servers.test.mjs` checks that last part, because the way this breaks is a
   * copy of another server's message with the link left in it, which is what
   * happened when these configs were first built.
   *
   * **This file is the source, and it is not what the servers read.** They read
   * `map_packs.welcome_message` through the applier, so `npm run apply:welcome`
   * is what carries a change here to them. Editing this alone changes nothing in
   * the game, and every text here must match the database or that command will
   * overwrite the database with it.
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
 * Order is the order of the tabs and of the cards on the front page, oldest
 * first. The first one is also where `/servers` lands.
 */
export const SERVERS: GameServer[] = [
  {
    slug: "themed",
    name: "RF4U - Themed",
    blurb:
      "Films, real places, and levels rebuilt from other games. One idea per " +
      "map, carried all the way through it.",
    port: 17756,
    packSlug: "themed",
    configFile: "rf4u-dm.toml",
    restartTask: "RF4U DM Server",
    welcome:
      "Themed maps: films, real places, and levels rebuilt from other games. " +
      "Every map on this server: RedFaction4You.com/themed",
    theme: "default",
  },
  {
    slug: "novelty",
    name: "RF4U - Novelty",
    blurb:
      "Liminal spaces, oddities and minigames. Maps too strange or too rare to " +
      "turn up anywhere else.",
    port: 17757,
    packSlug: "novelty",
    configFile: "rf4u-novelty.toml",
    restartTask: "RF4U Novelty Server",
    welcome:
      "Novelty maps: liminal spaces, oddities, minigames, and maps too rare " +
      "to find anywhere else. Every map on this server: " +
      "RedFaction4You.com/novelty",
    theme: "novelty",
  },
  {
    slug: "halloween",
    name: "RF4U - Halloween",
    blurb:
      "Spooky season. Haunted houses, graveyards, crypts and castles, every " +
      "map picked for Halloween.",
    port: 17758,
    packSlug: "halloween",
    configFile: "rf4u-halloween.toml",
    restartTask: "RF4U Halloween Server",
    /*
     * Exactly the text in `map_packs`, character for character, so that
     * `apply:welcome` finds nothing to change here. The owner set it for the
     * season; see the note on `welcome` about why it has no link.
     */
    welcome:
      "Welcome to Haunt Faction 2026! The Spookiest server this side of mars! " +
      "Filled with the creepiest down-right most frightening maps in the Red " +
      "Faction collection!",
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
 * "Alpine Faction 1.3.0" a day after both servers went to 1.4.0: a version
 * number in an environment variable is a version number nobody updates. The
 * servers all run the same build, so it belongs beside them.
 */
export const SERVER_CLIENT = "Alpine Faction 1.4.0";

/** Slots, which is the same on every server and is not worth an entry each. */
export const SERVER_SLOTS = 16;
