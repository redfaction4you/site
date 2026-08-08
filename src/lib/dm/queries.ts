import { cache } from "react";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { dmPlayers, dmRounds, playerIdentities } from "@/lib/db/schema";

/**
 * The deathmatch record, read the way the archive means it.
 *
 * DM is not match based: maps load, people join, people play, and nobody ever
 * wins. So the unit is time spent on the server, the headline is time played,
 * and every total carries a rate beside it — on a server where a total only
 * measures attendance, frags per minute is the honest figure. XonStat, the
 * prior art, ranks its front page the same way.
 *
 * Grouped by identity with the same merge resolution the CTF side uses, so a
 * person renamed or merged on /admin is one person here too. The expressions
 * are this module's own because `IDENTITY_KEY` in `matches/queries.ts` is bound
 * to the `match_players` columns; the shape is deliberately identical.
 */

/** The identity as sent, before any hand merge. */
const DM_SERVER_KEY = sql<string>`coalesce(${dmPlayers.identityKey}, lower(${dmPlayers.name}))`;

/** What to group by: the server's key corrected by `player_identities`. */
const DM_IDENTITY_KEY = sql<string>`coalesce(
  (
    select ${playerIdentities.mergedInto}
    from ${playerIdentities}
    where ${playerIdentities.identityKey} = ${DM_SERVER_KEY}
  ),
  ${DM_SERVER_KEY}
)`;

/**
 * What to call the group: a name pinned on /admin wins, else the name they
 * have used most on the DM server. `mode()` breaks ties by the ordering given,
 * so the answer is stable between requests.
 */
const DM_DISPLAY_NAME = sql<string>`coalesce(
  min((
    select ${playerIdentities.displayName}
    from ${playerIdentities}
    where ${playerIdentities.identityKey} = ${DM_IDENTITY_KEY}
  )),
  mode() within group (order by ${dmPlayers.name})
)`;

/**
 * The soundness rule, restated over these columns on purpose — the *rule* is
 * imported in spirit (hits cannot exceed shots; a row that says otherwise
 * contributes nothing to the totals), but `SOUND_SHOOTING` in
 * `matches/queries.ts` is bound to `match_players` and cannot be reused.
 */
const DM_SOUND_SHOOTING = sql`${dmPlayers.shotsHit} <= ${dmPlayers.shotsFired}`;

export type DmPlayerTotals = {
  name: string;
  rounds: number;
  secondsPlayed: number;
  kills: number;
  deaths: number;
  bestStreak: number;
  shotsHit: number;
  shotsFired: number;
  damageGiven: number;
  powerups: number;
  firstSeen: string | null;
  lastSeen: string | null;
};

/**
 * Everyone who has played recorded deathmatch, one row per person.
 *
 * counts-everything (dm): there is no completion rule on this side — a
 * rotation cut short by a vote was still time in which people fragged each
 * other — and rows with nothing recorded were already dropped at ingest.
 */
export const listDmPlayers = cache(async function listDmPlayers(): Promise<
  DmPlayerTotals[]
> {
  const rows = await db
    .select({
      name: DM_DISPLAY_NAME,
      rounds: sql<number>`count(distinct ${dmPlayers.roundId})::int`,
      secondsPlayed: sql<number>`coalesce(sum(${dmPlayers.secondsPlayed}), 0)::int`,
      kills: sql<number>`coalesce(sum(${dmPlayers.kills}), 0)::int`,
      deaths: sql<number>`coalesce(sum(${dmPlayers.deaths}), 0)::int`,
      bestStreak: sql<number>`coalesce(max(${dmPlayers.maxStreak}), 0)::int`,
      shotsHit: sql<number>`coalesce(sum(${dmPlayers.shotsHit}) filter (where ${DM_SOUND_SHOOTING}), 0)::float8`,
      shotsFired: sql<number>`coalesce(sum(${dmPlayers.shotsFired}) filter (where ${DM_SOUND_SHOOTING}), 0)::float8`,
      damageGiven: sql<number>`coalesce(sum(${dmPlayers.damageGiven}), 0)::float8`,
      powerups: sql<number>`coalesce(sum(
        ${dmPlayers.powerupAmps} + ${dmPlayers.powerupInvulns}
        + ${dmPlayers.powerupSuperArmors} + ${dmPlayers.powerupSuperHealths}
      ), 0)::int`,
      // Converted to the site's day before the date is taken: a Friday-evening
      // session is Friday, not the Saturday it already is in UTC. Same rule as
      // `archive_day` everywhere else.
      firstSeen: sql<string | null>`(min(${dmPlayers.firstSeen}) at time zone 'America/Los_Angeles')::date::text`,
      lastSeen: sql<string | null>`(max(${dmPlayers.lastSeen}) at time zone 'America/Los_Angeles')::date::text`,
    })
    .from(dmPlayers)
    .innerJoin(dmRounds, sql`${dmRounds.id} = ${dmPlayers.roundId}`)
    .groupBy(DM_IDENTITY_KEY)
    .orderBy(sql`sum(${dmPlayers.secondsPlayed}) desc nulls last`);

  return rows;
});

/**
 * One person's DM record, for the second column on their player page.
 *
 * Matched by display name because that is how the player page is addressed.
 * A person whose DM name never appears in the CTF archive has a record here
 * and no page to show it on yet, which is fine: the page arrives when the DM
 * index does.
 */
export const getDmPlayer = cache(async function getDmPlayer(
  name: string,
): Promise<DmPlayerTotals | null> {
  const everyone = await listDmPlayers();
  const lower = name.toLowerCase();
  return everyone.find((player) => player.name.toLowerCase() === lower) ?? null;
});

export type DmMapSummary = {
  mapName: string;
  rounds: number;
  secondsPlayed: number;
  kills: number;
  players: number;
  lastPlayed: string | null;
};

/**
 * Every map the DM server has recorded play on, most played first.
 *
 * Played is measured in time, not rounds — a rotation nobody joined stores
 * nothing, and two short rounds are less play than one long one. The same
 * frame as the player board above.
 *
 * counts-everything (dm): no completion rule exists on this side; a rotation
 * cut short by a vote was still play on that map.
 */
export const listDmMaps = cache(async function listDmMaps(): Promise<
  DmMapSummary[]
> {
  const rows = await db
    .select({
      mapName: dmRounds.mapName,
      rounds: sql<number>`count(distinct ${dmRounds.id})::int`,
      secondsPlayed: sql<number>`coalesce(sum(${dmPlayers.secondsPlayed}), 0)::int`,
      kills: sql<number>`coalesce(sum(${dmPlayers.kills}), 0)::int`,
      players: sql<number>`count(distinct ${DM_IDENTITY_KEY})::int`,
      lastPlayed: sql<string | null>`(max(${dmRounds.startedAt}) at time zone 'America/Los_Angeles')::date::text`,
    })
    .from(dmRounds)
    .leftJoin(dmPlayers, sql`${dmPlayers.roundId} = ${dmRounds.id}`)
    .groupBy(dmRounds.mapName)
    .orderBy(sql`sum(${dmPlayers.secondsPlayed}) desc nulls last`);

  return rows;
});

/** Headline figures for the DM tab: how much play the archive holds. */
export const dmTotals = cache(async function dmTotals() {
  const [row] = await db
    .select({
      rounds: sql<number>`count(distinct ${dmRounds.id})::int`,
      maps: sql<number>`count(distinct ${dmRounds.mapName})::int`,
      // counts-everything (dm): provenance totals; no completion rule exists.
      secondsPlayed: sql<number>`coalesce(sum(${dmPlayers.secondsPlayed}), 0)::int`,
      kills: sql<number>`coalesce(sum(${dmPlayers.kills}), 0)::int`,
      firstDay: sql<string | null>`(min(${dmRounds.archiveDay}) at time zone 'America/Los_Angeles')::date::text`,
      lastDay: sql<string | null>`(max(${dmRounds.archiveDay}) at time zone 'America/Los_Angeles')::date::text`,
    })
    .from(dmRounds)
    .leftJoin(dmPlayers, sql`${dmPlayers.roundId} = ${dmRounds.id}`);

  return row ?? { rounds: 0, maps: 0, secondsPlayed: 0, kills: 0, firstDay: null, lastDay: null };
});
