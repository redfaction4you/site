import { sql } from "drizzle-orm";

import { matchPlayers, playerIdentities } from "@/lib/db/schema";

/**
 * One person, however many names they have played under.
 *
 * Names on this server are neither unique nor stable, and people change them
 * between matches for fun. Grouping by name therefore splits one player into
 * several: one person here has appeared as Chill Hippo, Skuldug, s9 and s9!nX,
 * and had four rows on every board with a quarter of their record in each.
 *
 * The server has been sending an identity with every player row since the
 * beginning and nothing read it. It is derived from the connection, so **no
 * address is stored and none can be recovered from it**, and it never leaves the
 * server: it is a grouping key, not a fact about anybody that belongs on a page.
 *
 * These two expressions are the whole mechanism, and they exist as constants
 * because every aggregate in the archive has to use the same one. A scoreboard
 * grouped by name beside a stat board grouped by identity would disagree about
 * how many matches somebody has played, which is exactly the class of bug the
 * `TOOK_PART` and `tookPart` pair was written to avoid.
 */

/**
 * What to group a player's rows by.
 *
 * The identity where the server sent one, and the lowercased name otherwise, so
 * a row that arrives without an identity still aggregates the way it always did
 * rather than vanishing or merging with strangers.
 */
export const IDENTITY_KEY = sql<string>`coalesce(${matchPlayers.identityKey}, lower(${matchPlayers.name}))`;

/**
 * What to call the group.
 *
 * The name chosen on the admin page wins. Absent one, the name they have played
 * under most, which is right most of the time and is the reason that page holds
 * only the exceptions rather than a row per player.
 *
 * `mode()` is Postgres asking for the most common value in the group, and it
 * breaks ties by the ordering given, so the answer is stable between requests
 * rather than whichever row the planner happened to reach first.
 */
export const DISPLAY_NAME = sql<string>`coalesce(
  min(${playerIdentities.displayName}),
  mode() within group (order by ${matchPlayers.name})
)`;

/** The join every aggregate needs for `DISPLAY_NAME` to resolve. */
export const IDENTITY_JOIN = sql`${playerIdentities} on ${playerIdentities.identityKey} = ${matchPlayers.identityKey}`;

/**
 * Every row belonging to whoever plays under this name.
 *
 * A player page is reached by name, and a name is one of several a person may
 * have used. Filtering on the name alone would show a quarter of Skuldug's
 * record on Skuldug's page and the rest on three pages nobody links to, which is
 * the split this whole module exists to close.
 *
 * So the name resolves to an identity first, and the identity selects the rows.
 * Any of a person's names therefore reaches the same complete record, which is
 * also what makes an old link keep working after somebody is renamed.
 */
export function playedBy(name: string) {
  return sql`${IDENTITY_KEY} in (
    select coalesce(mp.identity_key, lower(mp.name))
    from match_players mp
    where lower(mp.name) = lower(${name})
  )`;
}
