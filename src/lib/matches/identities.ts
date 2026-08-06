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
/**
 * The identity exactly as the server sent it, before any merge decided here.
 *
 * Exported only so the admin page can count how many of these a person is made
 * of, which is how it shows that a merge is in force. Nothing else should group
 * by this: grouping by it is what `IDENTITY_KEY` exists to stop.
 */
export const SERVER_KEY = sql<string>`coalesce(${matchPlayers.identityKey}, lower(${matchPlayers.name}))`;

/**
 * What to group a player's rows by, after any merge decided by hand.
 *
 * The server's key is the starting point and `player_identities.merged_into` is
 * the correction. A correlated subquery rather than a join, deliberately: this
 * expression appears in about thirty queries and in almost as many `group by`
 * clauses, and requiring every one of them to also add a join is exactly the
 * shape of rule that gets applied by hand, missed once, and reaches a page.
 * Written this way, a merge takes effect everywhere the moment it is saved and
 * no query has to know it happened.
 *
 * The cost is a lookup per row against a table with one row per exception,
 * which on an archive of a few hundred rows is not measurable.
 *
 * **Resolved exactly once.** See `mergedInto` in schema.ts: chains are prevented
 * where they are written rather than followed where they are read, because a
 * recursive resolution here would be a recursive CTE inside every group-by on
 * the site.
 */
export const IDENTITY_KEY = sql<string>`coalesce(
  (
    select ${playerIdentities.mergedInto}
    from ${playerIdentities}
    where ${playerIdentities.identityKey} = ${SERVER_KEY}
  ),
  ${SERVER_KEY}
)`;

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
  min((
    select ${playerIdentities.displayName}
    from ${playerIdentities}
    where ${playerIdentities.identityKey} = ${IDENTITY_KEY}
  )),
  mode() within group (order by ${matchPlayers.name})
)`;

/*
 * `IDENTITY_JOIN` is gone, and so is the need for it.
 *
 * `DISPLAY_NAME` used to read `min(player_identities.display_name)` off a join
 * every caller had to remember to add. That worked while a person was one
 * identity, and stopped working the moment two identities could be one person:
 * the join matched on the raw key, so a merged identity found its own row
 * rather than the row of whoever it had been merged into, and the name came out
 * of the wrong record.
 *
 * Looking it up through `IDENTITY_KEY` makes it correct by construction and
 * costs the callers nothing. The existing `leftJoin(playerIdentities, ...)`
 * calls dotted around `queries.ts` are now redundant. They are harmless, since
 * `identity_key` is that table's primary key so at most one row can match, and
 * they are left alone rather than removed in the same change that alters what
 * every group-by on the site means.
 */

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
  /*
   * Resolved on both sides of the `in`.
   *
   * The inner query finds the server's keys for everybody who has used this
   * name, and each of those has to go through the same merge the outer rows go
   * through. Without that, a page reached by one of a merged person's names
   * would select on the pre-merge key and show a fraction of their record,
   * which is the split this module exists to close, reappearing one level up.
   */
  return sql`${IDENTITY_KEY} in (
    select coalesce(
      (
        select pi.merged_into from player_identities pi
        where pi.identity_key = coalesce(mp.identity_key, lower(mp.name))
      ),
      coalesce(mp.identity_key, lower(mp.name))
    )
    from match_players mp
    where lower(mp.name) = lower(${name})
  )`;
}
