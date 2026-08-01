/**
 * Reading the match archive.
 *
 * Every query here names its columns. None of them name
 * `match_players.identity_key`, and none of them should: it is stored so that
 * Discord accounts can one day be reconciled against in-game identities, and
 * it has no business in a scoreboard. Selecting whole rows with
 * `db.query.matchPlayers.findMany()` would quietly undo that, so don't.
 */
import { and, asc, desc, eq, gt, inArray, lt, lte, ne, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import {
  matchCaptures,
  matchPlayers,
  matches,
  nightColumns,
  opinionPieces,
  playerProfiles,
} from "@/lib/db/schema";
import { type PickableMatch, pickMatch } from "@/lib/ai/match-pick";
import {
  type Appearance,
  type Pairings,
  type PlayerPairings,
  buildPairings,
  pairingsFor,
} from "@/lib/matches/pairings";
import { ARCHIVE_TIME_ZONE, type PublicWeaponStat } from "@/lib/matches/sanitize";
import type { VettableMatch } from "@/lib/matches/vet";

/**
 * Who actually played, as a `where` clause.
 *
 * The SQL twin of `tookPart` in participation.ts, which is where the reasoning
 * lives. Kept in step with it by hand because a scoreboard filtered in
 * TypeScript and a total filtered in Postgres disagreeing would be the worst of
 * both: a player page saying somebody played nine matches and a match page not
 * listing them in one of the nine.
 *
 * Replaces the bare `spectator = false` that used to be the test everywhere.
 * That let through rows on a real team with nothing whatever recorded, which
 * turned a two against two into a three against three.
 */
export const TOOK_PART = sql`
  not ${matchPlayers.spectator} and (
    ${matchPlayers.score} > 0 or ${matchPlayers.kills} > 0 or ${matchPlayers.deaths} > 0
    or ${matchPlayers.caps} > 0 or ${matchPlayers.shotsFired} > 0
    or ${matchPlayers.shotsHit} > 0 or ${matchPlayers.damageTaken} > 0
    or ${matchPlayers.damageGiven} > 0 or ${matchPlayers.flagPickups} > 0
    or ${matchPlayers.flagReturns} > 0 or ${matchPlayers.maxStreak} > 0
  )`;

/**
 * The order captures actually happened in.
 *
 * Not `elapsed_seconds`, which is the match clock and **restarts at zero in
 * overtime**. Ordering by it puts the golden goal at the top of the timeline: on
 * Rail Fight the winning capture two seconds into extra time sorted above the
 * opening capture of the match, so the page opened by showing the final score
 * and then counted up to it.
 *
 * `observed_at` is a real instant and is populated on every capture on record.
 * The clock is kept as the tie break, so a match that somehow arrives without
 * timestamps still comes out in a sensible order rather than an arbitrary one.
 */
const CAPTURE_ORDER = {
  first: asc(matchCaptures.observedAt),
  second: asc(matchCaptures.elapsedSeconds),
};

export type DaySummary = {
  archiveDay: string;
  matchCount: number;
  finalCount: number;
};

/** Every day that has matches, newest first. Drives the day selector. */
export const listDays = cache(async function listDays(): Promise<DaySummary[]> {
  const rows = await db
    .select({
      archiveDay: matches.archiveDay,
      matchCount: sql<number>`count(*)::int`,
      finalCount: sql<number>`count(*) filter (where ${matches.status} = 'final')::int`,
    })
    .from(matches)
    .groupBy(matches.archiveDay)
    .orderBy(desc(matches.archiveDay));

  return rows;
});

export const latestDay = cache(async function latestDay(): Promise<string | null> {
  const [row] = await db
    .select({ archiveDay: matches.archiveDay })
    .from(matches)
    .orderBy(desc(matches.archiveDay))
    .limit(1);

  return row?.archiveDay ?? null;
});

export type MatchSummary = {
  /** Position in the night, from 1. Derived from play order, not from the id. */
  number: number;
  id: string;
  sourceMatchId: number;
  server: string;
  status: string;
  mapName: string;
  mode: string;
  startedAt: Date | null;
  endedAt: Date | null;
  redScore: number;
  blueScore: number;
  overtime: boolean;
  winner: string | null;
  playerCount: number;
  /**
   * Who had the best of it, by the game's own scoring.
   *
   * A row that says which map and what the score was does not say anything
   * about the match, and opening six pages to find out who played well is the
   * thing a list is supposed to save you. Every scoreboard on every sports site
   * carries this for the same reason.
   *
   * Score rather than frags, because in CTF a capture is worth many frags and
   * the top fragger is often not the person who won the game.
   */
  top: { name: string; score: number; caps: number } | null;
};

/** The matches played on one day, in the order they were played. */
export const listMatchesForDay = cache(async function listMatchesForDay(
  archiveDay: string,
): Promise<MatchSummary[]> {
  const rows = await db
    .select({
      id: matches.id,
      sourceMatchId: matches.sourceMatchId,
      server: matches.server,
      status: matches.status,
      mapName: matches.mapName,
      mode: matches.mode,
      startedAt: matches.startedAt,
      endedAt: matches.endedAt,
      redScore: matches.redScore,
      blueScore: matches.blueScore,
      overtime: matches.overtime,
      winner: matches.winner,
    })
    .from(matches)
    .where(eq(matches.archiveDay, archiveDay))
    .orderBy(asc(matches.startedAt), asc(matches.sourceMatchId));

  if (rows.length === 0) return [];

  // A second query rather than a correlated subquery in the select. The
  // subquery version rendered to something that returned zero for every match
  // while the same SQL by hand returned the right counts, and a grouped join is
  // both clearer and not worth debugging a template for.
  //
  // Every participant rather than a count, because the count and the best
  // player come out of the same rows and a night is a few dozen of them. Two
  // aggregates over one small result beats two round trips.
  const played = await db
    .select({
      matchId: matchPlayers.matchId,
      name: matchPlayers.name,
      score: matchPlayers.score,
      caps: matchPlayers.caps,
    })
    .from(matchPlayers)
    .where(
      and(
        inArray(
          matchPlayers.matchId,
          rows.map((row) => row.id),
        ),
        TOOK_PART,
      ),
    );

  const counts = new Map<string, number>();
  const best = new Map<string, { name: string; score: number; caps: number }>();
  for (const entry of played) {
    counts.set(entry.matchId, (counts.get(entry.matchId) ?? 0) + 1);

    const standing = best.get(entry.matchId);
    // Ties keep the first seen rather than picking one, which would be
    // inventing an order the record does not have.
    if (!standing || entry.score > standing.score) {
      best.set(entry.matchId, {
        name: entry.name,
        score: entry.score,
        caps: entry.caps,
      });
    }
  }

  // Numbered by when they were played, not by the server's match id. The ids
  // keep counting across restarts, so the third game of the evening is rarely
  // match 3 as far as the server is concerned.
  return rows.map((row, index) => ({
    ...row,
    number: index + 1,
    playerCount: counts.get(row.id) ?? 0,
    top: best.get(row.id) ?? null,
  }));
});

/** A player row as the public sees it. No identity key, by construction. */
export type PublicScoreRow = {
  name: string;
  team: string;
  spectator: boolean;
  score: number;
  kills: number;
  deaths: number;
  caps: number;
  maxStreak: number;
  accuracy: number;
  shotsHit: number;
  shotsFired: number;
  damageGiven: number;
  damageTaken: number;
  flagHoldMs: number;
  flagPickups: number;
  flagReturns: number;
  flagCarrierKills: number;
  captureAssists: number;
  fastestCaptureMs: number | null;
  soloCaps: number;
  relayCaps: number;
  leadCarries: number;
  /** Empty for matches archived before the 2.1 broadcaster. */
  weaponStats: PublicWeaponStat[];
};

export const getMatch = cache(async function getMatch(
  archiveDay: string,
  sourceMatchId: number,
) {
  const [match] = await db
    .select({
      id: matches.id,
      sourceMatchId: matches.sourceMatchId,
      server: matches.server,
      archiveDay: matches.archiveDay,
      status: matches.status,
      mapName: matches.mapName,
      mode: matches.mode,
      startedAt: matches.startedAt,
      endedAt: matches.endedAt,
      redScore: matches.redScore,
      blueScore: matches.blueScore,
      overtime: matches.overtime,
      winner: matches.winner,
      kills: matches.kills,
      flagEvents: matches.flagEvents,
      rosterEvents: matches.rosterEvents,
      report: matches.report,
      reportModel: matches.reportModel,
    })
    .from(matches)
    .where(
      and(eq(matches.archiveDay, archiveDay), eq(matches.sourceMatchId, sourceMatchId)),
    )
    .limit(1);

  if (!match) return null;

  const players: PublicScoreRow[] = await db
    .select({
      name: matchPlayers.name,
      team: matchPlayers.team,
      spectator: matchPlayers.spectator,
      score: matchPlayers.score,
      kills: matchPlayers.kills,
      deaths: matchPlayers.deaths,
      caps: matchPlayers.caps,
      maxStreak: matchPlayers.maxStreak,
      accuracy: matchPlayers.accuracy,
      shotsHit: matchPlayers.shotsHit,
      shotsFired: matchPlayers.shotsFired,
      damageGiven: matchPlayers.damageGiven,
      damageTaken: matchPlayers.damageTaken,
      flagHoldMs: matchPlayers.flagHoldMs,
      flagPickups: matchPlayers.flagPickups,
      flagReturns: matchPlayers.flagReturns,
      flagCarrierKills: matchPlayers.flagCarrierKills,
      captureAssists: matchPlayers.captureAssists,
      fastestCaptureMs: matchPlayers.fastestCaptureMs,
      soloCaps: matchPlayers.soloCaps,
      relayCaps: matchPlayers.relayCaps,
      leadCarries: matchPlayers.leadCarries,
      weaponStats: matchPlayers.weaponStats,
    })
    .from(matchPlayers)
    .where(eq(matchPlayers.matchId, match.id))
    .orderBy(
      asc(matchPlayers.spectator),
      asc(matchPlayers.team),
      desc(matchPlayers.score),
      desc(matchPlayers.kills),
    );

  const captures = await db
    .select({
      elapsedSeconds: matchCaptures.elapsedSeconds,
      team: matchCaptures.team,
      redScore: matchCaptures.redScore,
      blueScore: matchCaptures.blueScore,
      quantity: matchCaptures.quantity,
      playerName: matchCaptures.playerName,
      assists: matchCaptures.assists,
      message: matchCaptures.message,
      observedAt: matchCaptures.observedAt,
    })
    .from(matchCaptures)
    .where(eq(matchCaptures.matchId, match.id))
    .orderBy(CAPTURE_ORDER.first, CAPTURE_ORDER.second);

  return { ...match, players, captures };
});

export type MatchDetail = NonNullable<Awaited<ReturnType<typeof getMatch>>>;

export type MatchLink = {
  archiveDay: string;
  sourceMatchId: number;
  mapName: string;
};

/**
 * The matches either side of this one, in the order they were played.
 *
 * Deliberately across the whole archive rather than within the night: the last
 * match of an evening should lead to the first of the next one. Having to press
 * the browser's back button to move between matches is the thing this fixes.
 */
export const getAdjacentMatches = cache(async function getAdjacentMatches(
  startedAt: Date | null,
  matchId: string,
): Promise<{ previous: MatchLink | null; next: MatchLink | null }> {
  if (!startedAt) return { previous: null, next: null };

  const columns = {
    archiveDay: matches.archiveDay,
    sourceMatchId: matches.sourceMatchId,
    mapName: matches.mapName,
  };

  const [previous] = await db
    .select(columns)
    .from(matches)
    .where(and(lt(matches.startedAt, startedAt), ne(matches.id, matchId)))
    .orderBy(desc(matches.startedAt))
    .limit(1);

  const [next] = await db
    .select(columns)
    .from(matches)
    .where(and(gt(matches.startedAt, startedAt), ne(matches.id, matchId)))
    .orderBy(asc(matches.startedAt))
    .limit(1);

  return { previous: previous ?? null, next: next ?? null };
});

// ---------------------------------------------------------------------------
// Players
//
// Aggregated by name, because that is the only key we can show. An RF player
// name is neither unique nor stable, so two people who used the same name will
// be merged here and one person who renamed will be split. The pages say so
// rather than implying more precision than exists. `identity_key` is what will
// eventually fix this; it is stored and deliberately not used yet.
// ---------------------------------------------------------------------------

export type PlayerTotals = {
  name: string;
  matchesPlayed: number;
  kills: number;
  deaths: number;
  caps: number;
  score: number;
  /** Totalled from matches whose counters agree with themselves. See below. */
  shotsHit: number;
  shotsFired: number;
  /** How many of their matches were left out of the two figures above. */
  unsoundShootingMatches: number;
  damageGiven: number;
  damageTaken: number;
  flagHoldMs: number;
  flagReturns: number;
  bestStreak: number;
  fastestCaptureMs: number | null;
  soloCaps: number;
  relayCaps: number;
  leadCarries: number;
  firstSeen: string | null;
  lastSeen: string | null;
};

/*
 * `MIN_MEANINGFUL_CAPTURE_MS` and `UNRELAYED` lived here and are gone.
 *
 * Both were attempts to rescue the server's `fastest_capture_ms`, a scalar per
 * player per match that could not be tied to a capture. A two second floor was
 * the first try and was guessing at the wrong thing; requiring `relay_caps = 0`
 * was better and still let a 2.7 second capture lead the board, because that
 * player really did have one unrelayed capture and the number simply was not the
 * length of a run.
 *
 * Neither is needed now the figure is measured rather than reported. See
 * `fastest_solo_capture_ms` in schema.ts.
 */

/**
 * Matches whose shooting counters agree with themselves.
 *
 * The rail maps produce rows where hits exceed shots, sometimes by a factor of
 * ten. Summing those into a career total is worse than showing one bad match,
 * because it silently corrupts a figure that looks fine: a player with one rail
 * match and thirty sound ones ends up with an accuracy nobody can trace back to
 * anything. Totalled from the sound matches only, and the count of what was
 * left out is returned alongside so a page can say so rather than quietly
 * showing less than it claims.
 *
 * The rows themselves are untouched. See `accuracy.ts` for why withholding the
 * derived figure is the trade rather than correcting the record.
 */
export const SOUND_SHOOTING = sql`${matchPlayers.shotsHit} <= ${matchPlayers.shotsFired}`;

const playerTotalColumns = {
  name: sql<string>`min(${matchPlayers.name})`,
  matchesPlayed: sql<number>`count(distinct ${matchPlayers.matchId})::int`,
  kills: sql<number>`coalesce(sum(${matchPlayers.kills}), 0)::int`,
  deaths: sql<number>`coalesce(sum(${matchPlayers.deaths}), 0)::int`,
  caps: sql<number>`coalesce(sum(${matchPlayers.caps}), 0)::int`,
  score: sql<number>`coalesce(sum(${matchPlayers.score}), 0)::int`,
  shotsHit: sql<number>`coalesce(sum(${matchPlayers.shotsHit}) filter (where ${SOUND_SHOOTING}), 0)::float8`,
  shotsFired: sql<number>`coalesce(sum(${matchPlayers.shotsFired}) filter (where ${SOUND_SHOOTING}), 0)::float8`,
  /** Matches left out of the two figures above, so a page can say so. */
  unsoundShootingMatches: sql<number>`count(*) filter (where not (${SOUND_SHOOTING}))::int`,
  damageGiven: sql<number>`coalesce(sum(${matchPlayers.damageGiven}), 0)::float8`,
  damageTaken: sql<number>`coalesce(sum(${matchPlayers.damageTaken}), 0)::float8`,
  flagHoldMs: sql<number>`coalesce(sum(${matchPlayers.flagHoldMs}), 0)::int`,
  flagReturns: sql<number>`coalesce(sum(${matchPlayers.flagReturns}), 0)::int`,
  bestStreak: sql<number>`coalesce(max(${matchPlayers.maxStreak}), 0)::int`,
  /**
   * The quickest flag journey they completed alone.
   *
   * Measured rather than reported. See the column comment on
   * `fastest_solo_capture_ms`: the server's own figure could not be tied to a
   * capture, so what it measured was uncheckable, and filtering it on
   * `relay_caps = 0` still left a 2.7 second capture leading the board. This is
   * the flag's journey from its stand to being touched down, on drives one
   * person carried the whole way, which is the only case where that time belongs
   * to anybody.
   *
   * No floor and no `UNRELAYED` filter, because neither is needed once the
   * number means what it says.
   */
  fastestCaptureMs: sql<number | null>`min(${matchPlayers.fastestSoloCaptureMs})::int`,
  soloCaps: sql<number>`coalesce(sum(${matchPlayers.soloCaps}), 0)::int`,
  relayCaps: sql<number>`coalesce(sum(${matchPlayers.relayCaps}), 0)::int`,
  leadCarries: sql<number>`coalesce(sum(${matchPlayers.leadCarries}), 0)::int`,
};

/** Everyone who has played, most active first. */
export const listPlayers = cache(async function listPlayers(): Promise<PlayerTotals[]> {
  const rows = await db
    .select({
      ...playerTotalColumns,
      firstSeen: sql<string | null>`min(${matches.archiveDay})::text`,
      lastSeen: sql<string | null>`max(${matches.archiveDay})::text`,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(TOOK_PART)
    .groupBy(sql`lower(${matchPlayers.name})`)
    .orderBy(sql`count(distinct ${matchPlayers.matchId}) desc`, sql`2 desc`);

  return rows;
});

/**
 * Recent results for everybody, newest last, keyed by lowercased name.
 *
 * The squad list ranked people by career totals and said nothing about who is
 * playing well now, which on any sports site is the first thing a reader scans
 * a table for. One query for the whole list rather than one per player: the
 * archive is small enough to sort in memory and an N+1 here would be a round
 * trip per name for a strip of five letters.
 */
export const recentForm = cache(async function recentForm(
  perPlayer = 5,
): Promise<Map<string, (boolean | null)[]>> {
  const rows = await db
    .select({
      nameKey: sql<string>`lower(${matchPlayers.name})`,
      team: matchPlayers.team,
      winner: matches.winner,
      startedAt: matches.startedAt,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(TOOK_PART, eq(matches.status, "final")))
    .orderBy(desc(matches.startedAt));

  const byPlayer = new Map<string, (boolean | null)[]>();

  for (const row of rows) {
    const runs = byPlayer.get(row.nameKey) ?? [];
    if (runs.length >= perPlayer) continue;
    // Null rather than false with no winner: a match without a result is not a
    // defeat, the same rule the player page's history uses.
    runs.push(row.winner ? row.winner === row.team : null);
    byPlayer.set(row.nameKey, runs);
  }

  // Collected newest first, read oldest first, the way a run of form is written.
  for (const [key, runs] of byPlayer) byPlayer.set(key, runs.reverse());

  return byPlayer;
});

export const getPlayer = cache(async function getPlayer(
  name: string,
): Promise<PlayerTotals | null> {
  const [row] = await db
    .select({
      ...playerTotalColumns,
      firstSeen: sql<string | null>`min(${matches.archiveDay})::text`,
      lastSeen: sql<string | null>`max(${matches.archiveDay})::text`,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    // Filtered like the list is. Without this a player page counted the nights
    // somebody spectated as matches they played, so the list and the page
    // disagreed about the same person.
    .where(and(sql`lower(${matchPlayers.name}) = lower(${name})`, TOOK_PART))
    .groupBy(sql`lower(${matchPlayers.name})`)
    .limit(1);

  return row ?? null;
});

/**
 * Orion's opinion piece for a night, if one was written.
 *
 * Deliberately a separate read from `getColumn`. The two are different kinds of
 * writing with different guards, and a caller that fetched them together would
 * be one refactor away from rendering them in the same box.
 */
export const getOpinion = cache(async function getOpinion(archiveDay: string) {
  const [row] = await db
    .select({
      archiveDay: opinionPieces.archiveDay,
      headline: opinionPieces.headline,
      body: opinionPieces.body,
      matchCount: opinionPieces.matchCount,
      model: opinionPieces.model,
      generatedAt: opinionPieces.generatedAt,
    })
    .from(opinionPieces)
    .where(eq(opinionPieces.archiveDay, archiveDay))
    .limit(1);

  return row ?? null;
});

/** Everything the columnist has written, newest first. */
export const listOpinions = cache(async function listOpinions(limit = 60) {
  return db
    .select({
      archiveDay: opinionPieces.archiveDay,
      headline: opinionPieces.headline,
      body: opinionPieces.body,
      matchCount: opinionPieces.matchCount,
      model: opinionPieces.model,
      generatedAt: opinionPieces.generatedAt,
    })
    .from(opinionPieces)
    .orderBy(desc(opinionPieces.archiveDay))
    .limit(limit);
});

/** The written profile, if one has been generated for this player. */
export const getPlayerProfile = cache(async function getPlayerProfile(name: string) {
  const [row] = await db
    .select({
      body: playerProfiles.body,
      model: playerProfiles.model,
      matchCount: playerProfiles.matchCount,
      generatedAt: playerProfiles.generatedAt,
    })
    .from(playerProfiles)
    .where(eq(playerProfiles.nameKey, name.toLocaleLowerCase("en-US")))
    .limit(1);

  return row ?? null;
});

// ---------------------------------------------------------------------------
// Pairings
//
// Who plays with whom, and how it goes. The arithmetic lives in pairings.ts,
// which is pure so it can be tested; all that happens here is fetching the
// appearances it reads.
// ---------------------------------------------------------------------------

/**
 * Every player's every match, as the pairing code wants it.
 *
 * Deliberately not filtered to `status = 'final'`, matching `listPlayers` and
 * `getPlayerMatches`. A match that never finished still happened and the people
 * in it were still on the same side; it carries no winner, so it lands in
 * `undecided` and cannot flatter or damage anybody's record.
 *
 * Exported uncached as well as cached because the profile writer runs outside a
 * request, where React's `cache` has no scope to work in.
 */
export async function fetchAppearances(upToDay?: string): Promise<Appearance[]> {
  return db
    .select({
      matchId: matchPlayers.matchId,
      name: matchPlayers.name,
      team: matchPlayers.team,
      winner: matches.winner,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(
      upToDay
        ? and(TOOK_PART, lte(matches.archiveDay, upToDay))
        : TOOK_PART,
    );
}

/** Every partnership and rivalry on record. One query, computed in memory. */
export const allPairings = cache(async function allPairings(): Promise<Pairings> {
  return buildPairings(await fetchAppearances());
});

/** One player's pairings, from their point of view. */
export const getPlayerPairings = cache(async function getPlayerPairings(
  name: string,
): Promise<PlayerPairings> {
  return pairingsFor(name, await allPairings());
});

export type PlayerMatchRow = {
  /** The archive's own id, for joining the rest of the match's roster on. */
  matchId: string;
  archiveDay: string;
  sourceMatchId: number;
  mapName: string;
  mode: string;
  startedAt: Date | null;
  team: string;
  won: boolean | null;
  overtime: boolean;
  redScore: number;
  blueScore: number;
  score: number;
  kills: number;
  deaths: number;
  caps: number;
  /**
   * Carried raw so the page can apply the same accuracy rule as everywhere
   * else. Deriving it from the stored `accuracy` would mean a second way of
   * spotting a broken counter, and two rules drift.
   */
  shotsHit: number;
  shotsFired: number;
};

/** Every match this player appeared in, newest first. */
export const getPlayerMatches = cache(async function getPlayerMatches(
  name: string,
): Promise<PlayerMatchRow[]> {
  const rows = await db
    .select({
      matchId: matches.id,
      archiveDay: matches.archiveDay,
      sourceMatchId: matches.sourceMatchId,
      mapName: matches.mapName,
      mode: matches.mode,
      startedAt: matches.startedAt,
      team: matchPlayers.team,
      winner: matches.winner,
      overtime: matches.overtime,
      redScore: matches.redScore,
      blueScore: matches.blueScore,
      score: matchPlayers.score,
      kills: matchPlayers.kills,
      deaths: matchPlayers.deaths,
      caps: matchPlayers.caps,
      shotsHit: matchPlayers.shotsHit,
      shotsFired: matchPlayers.shotsFired,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(sql`lower(${matchPlayers.name}) = lower(${name})`, TOOK_PART))
    .orderBy(desc(matches.startedAt));

  return rows.map(({ winner, ...row }) => ({
    ...row,
    // Null rather than false when the match had no winner: a cancelled match
    // is not a loss.
    won: winner ? winner === row.team : null,
  }));
});

export type PlayerRecordRow = PlayerMatchRow & {
  /** Everybody else on their side that match. */
  alongside: string[];
  /** Everybody on the other side. */
  against: string[];
};

/**
 * One player's matches with the room they were played in.
 *
 * The match history table could say what somebody scored and not who they were
 * scoring it against, which on a server where sides are reshuffled every match
 * is most of the story: two frags against the two best players in the archive
 * and two against nobody in particular are the same row otherwise.
 *
 * A second query rather than a join, because a join would return one row per
 * player per match and the caller wants one row per match. Two round trips for
 * a player's whole career is cheap; the archive is hundreds of rows, not
 * millions.
 *
 * Named columns, as everywhere: `identity_key` is stored and never served, and
 * a select of everything is how it would leak.
 */
export const getPlayerRecord = cache(async function getPlayerRecord(
  name: string,
): Promise<PlayerRecordRow[]> {
  const rows = await getPlayerMatches(name);
  if (rows.length === 0) return [];

  const roster = await db
    .select({
      matchId: matchPlayers.matchId,
      name: matchPlayers.name,
      team: matchPlayers.team,
    })
    .from(matchPlayers)
    .where(
      and(
        inArray(
          matchPlayers.matchId,
          rows.map((row) => row.matchId),
        ),
        TOOK_PART,
      ),
    );

  const byMatch = new Map<string, { name: string; team: string }[]>();
  for (const entry of roster) {
    byMatch.set(entry.matchId, [...(byMatch.get(entry.matchId) ?? []), entry]);
  }

  const key = name.toLowerCase();

  return rows.map((row) => {
    const everyone = byMatch.get(row.matchId) ?? [];
    return {
      ...row,
      alongside: everyone
        .filter(
          (entry) => entry.team === row.team && entry.name.toLowerCase() !== key,
        )
        .map((entry) => entry.name),
      // Anybody on a different side, rather than "on the other of two". A match
      // with a stray third side would otherwise silently drop those players.
      against: everyone
        .filter((entry) => entry.team !== row.team)
        .map((entry) => entry.name),
    };
  });
});

/* ---------------------------------------------------------------------------
   Maps.

   A match already knows which level it was played on, and that was a string on
   a row and nothing else: no way to ask what a map plays like, whether it is
   the one that always goes to overtime, or who is good on it. These are the
   same aggregates the player and night pages use, grouped the other way.
   --------------------------------------------------------------------------- */

/** Every map with a match on record, most played first. */
export const listMapNames = cache(async function listMapNames(): Promise<
  { mapName: string; matchCount: number }[]
> {
  return db
    .select({
      mapName: matches.mapName,
      matchCount: sql<number>`count(*)::int`,
    })
    .from(matches)
    .groupBy(matches.mapName)
    .orderBy(sql`count(*) desc`, asc(matches.mapName));
});

export type MapMatchRow = {
  matchId: string;
  archiveDay: string;
  sourceMatchId: number;
  startedAt: Date | null;
  redScore: number;
  blueScore: number;
  winner: string | null;
  overtime: boolean;
  status: string;
  playerCount: number;
};

export type MapRecord = {
  matches: MapMatchRow[];
  totals: {
    matches: number;
    redWins: number;
    blueWins: number;
    undecided: number;
    overtime: number;
    captures: number;
  };
  players: {
    name: string;
    matchesPlayed: number;
    score: number;
    kills: number;
    deaths: number;
    caps: number;
  }[];
};

/** Everything the archive knows about one map. */
export const getMapRecord = cache(async function getMapRecord(
  mapName: string,
): Promise<MapRecord> {
  const rows = await db
    .select({
      matchId: matches.id,
      archiveDay: matches.archiveDay,
      sourceMatchId: matches.sourceMatchId,
      startedAt: matches.startedAt,
      redScore: matches.redScore,
      blueScore: matches.blueScore,
      winner: matches.winner,
      overtime: matches.overtime,
      status: matches.status,
    })
    .from(matches)
    .where(eq(matches.mapName, mapName))
    .orderBy(desc(matches.startedAt));

  if (rows.length === 0) {
    return {
      matches: [],
      totals: {
        matches: 0,
        redWins: 0,
        blueWins: 0,
        undecided: 0,
        overtime: 0,
        captures: 0,
      },
      players: [],
    };
  }

  const [counts, players] = await Promise.all([
    db
      .select({
        matchId: matchPlayers.matchId,
        playerCount: sql<number>`count(*)::int`,
      })
      .from(matchPlayers)
      .where(
        and(
          inArray(
            matchPlayers.matchId,
            rows.map((row) => row.matchId),
          ),
          TOOK_PART,
        ),
      )
      .groupBy(matchPlayers.matchId),

    db
      .select({
        name: sql<string>`min(${matchPlayers.name})`,
        matchesPlayed: sql<number>`count(distinct ${matchPlayers.matchId})::int`,
        score: sql<number>`coalesce(sum(${matchPlayers.score}), 0)::int`,
        kills: sql<number>`coalesce(sum(${matchPlayers.kills}), 0)::int`,
        deaths: sql<number>`coalesce(sum(${matchPlayers.deaths}), 0)::int`,
        caps: sql<number>`coalesce(sum(${matchPlayers.caps}), 0)::int`,
      })
      .from(matchPlayers)
      .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
      .where(and(eq(matches.mapName, mapName), TOOK_PART))
      .groupBy(sql`lower(${matchPlayers.name})`)
      .orderBy(sql`coalesce(sum(${matchPlayers.score}), 0) desc`),
  ]);

  const byMatch = new Map(counts.map((row) => [row.matchId, row.playerCount]));

  return {
    matches: rows.map((row) => ({
      ...row,
      playerCount: byMatch.get(row.matchId) ?? 0,
    })),
    totals: {
      matches: rows.length,
      redWins: rows.filter((row) => row.winner === "red").length,
      blueWins: rows.filter((row) => row.winner === "blue").length,
      undecided: rows.filter((row) => row.winner !== "red" && row.winner !== "blue")
        .length,
      overtime: rows.filter((row) => row.overtime).length,
      captures: rows.reduce((sum, row) => sum + row.redScore + row.blueScore, 0),
    },
    players,
  };
});

/**
 * A whole day, assembled for the public JSON API.
 *
 * Three queries rather than one per match: a busy night is twenty matches and
 * an N+1 here would be twenty round trips to answer one request.
 *
 * Field names are the snake_case of the original data contract, so anything
 * already written against that contract keeps working. The exception is the
 * bulk event streams, which are returned as stored.
 */
export const getDayDocument = cache(async function getDayDocument(archiveDay: string) {
  const dayMatches = await db
    .select({
      id: matches.id,
      sourceMatchId: matches.sourceMatchId,
      server: matches.server,
      status: matches.status,
      mapName: matches.mapName,
      mode: matches.mode,
      startedAt: matches.startedAt,
      endedAt: matches.endedAt,
      redScore: matches.redScore,
      blueScore: matches.blueScore,
      overtime: matches.overtime,
      winner: matches.winner,
      kills: matches.kills,
      flagEvents: matches.flagEvents,
      rosterEvents: matches.rosterEvents,
    })
    .from(matches)
    .where(eq(matches.archiveDay, archiveDay))
    .orderBy(asc(matches.startedAt), asc(matches.sourceMatchId));

  if (dayMatches.length === 0) return null;

  const ids = dayMatches.map((m) => m.id);

  // Note the explicit column list: identity_key is not among them, and must
  // never be. This is the endpoint where a mistake would be public.
  const players = await db
    .select({
      matchId: matchPlayers.matchId,
      name: matchPlayers.name,
      team: matchPlayers.team,
      spectator: matchPlayers.spectator,
      score: matchPlayers.score,
      kills: matchPlayers.kills,
      deaths: matchPlayers.deaths,
      caps: matchPlayers.caps,
      maxStreak: matchPlayers.maxStreak,
      accuracy: matchPlayers.accuracy,
      shotsHit: matchPlayers.shotsHit,
      shotsFired: matchPlayers.shotsFired,
      damageGiven: matchPlayers.damageGiven,
      damageTaken: matchPlayers.damageTaken,
      flagHoldMs: matchPlayers.flagHoldMs,
      flagPickups: matchPlayers.flagPickups,
      flagDrops: matchPlayers.flagDrops,
      flagReturns: matchPlayers.flagReturns,
      flagCarrierKills: matchPlayers.flagCarrierKills,
      flagCarrierDeaths: matchPlayers.flagCarrierDeaths,
      captureAssists: matchPlayers.captureAssists,
      flagRecoveries: matchPlayers.flagRecoveries,
      successfulFlagDrives: matchPlayers.successfulFlagDrives,
      successfulCarryMs: matchPlayers.successfulCarryMs,
      fastestCaptureMs: matchPlayers.fastestCaptureMs,
    })
    .from(matchPlayers)
    .where(inArray(matchPlayers.matchId, ids))
    .orderBy(asc(matchPlayers.spectator), asc(matchPlayers.team), desc(matchPlayers.score));

  const captures = await db
    .select({
      matchId: matchCaptures.matchId,
      elapsedSeconds: matchCaptures.elapsedSeconds,
      team: matchCaptures.team,
      redScore: matchCaptures.redScore,
      blueScore: matchCaptures.blueScore,
      quantity: matchCaptures.quantity,
      playerName: matchCaptures.playerName,
      assists: matchCaptures.assists,
      driveParticipants: matchCaptures.driveParticipants,
      message: matchCaptures.message,
      observedAt: matchCaptures.observedAt,
    })
    .from(matchCaptures)
    .where(inArray(matchCaptures.matchId, ids))
    .orderBy(CAPTURE_ORDER.first, CAPTURE_ORDER.second);

  const iso = (value: Date | null) => value?.toISOString() ?? null;

  return {
    format: "rf4u-public-match-archive-v1",
    generatedAt: new Date().toISOString(),
    archiveTimeZone: ARCHIVE_TIME_ZONE,
    calendarDate: archiveDay,
    server: dayMatches[0].server,
    matchCount: dayMatches.length,
    completedMatchCount: dayMatches.filter((m) => m.status === "final").length,
    matches: dayMatches.map((match) => ({
      id: match.sourceMatchId,
      status: match.status,
      map_name: match.mapName,
      mode: match.mode,
      started_at: iso(match.startedAt),
      ended_at: iso(match.endedAt),
      red_score: match.redScore,
      blue_score: match.blueScore,
      overtime: match.overtime,
      winner: match.winner,
      players: players
        .filter((p) => p.matchId === match.id)
        .map((p) => ({
          name: p.name,
          team: p.team,
          spectator: p.spectator,
          score: p.score,
          kills: p.kills,
          deaths: p.deaths,
          caps: p.caps,
          max_streak: p.maxStreak,
          accuracy: p.accuracy,
          shots_hit: p.shotsHit,
          shots_fired: p.shotsFired,
          damage_given: p.damageGiven,
          damage_taken: p.damageTaken,
          flag_hold_ms: p.flagHoldMs,
          flag_pickups: p.flagPickups,
          flag_drops: p.flagDrops,
          flag_returns: p.flagReturns,
          flag_carrier_kills: p.flagCarrierKills,
          flag_carrier_deaths: p.flagCarrierDeaths,
          capture_assists: p.captureAssists,
          flag_recoveries: p.flagRecoveries,
          successful_flag_drives: p.successfulFlagDrives,
          successful_carry_ms: p.successfulCarryMs,
          fastest_capture_ms: p.fastestCaptureMs,
        })),
      captures: captures
        .filter((c) => c.matchId === match.id)
        .map((c) => ({
          elapsed_seconds: c.elapsedSeconds,
          team: c.team,
          red_score: c.redScore,
          blue_score: c.blueScore,
          quantity: c.quantity,
          player_name: c.playerName,
          capture_assists: c.assists,
          drive_participants: c.driveParticipants,
          message: c.message,
          observed_at: iso(c.observedAt),
        })),
      kills: match.kills,
      flagEvents: match.flagEvents,
      rosterEvents: match.rosterEvents,
    })),
  };
});

/**
 * When matches actually kicked off, newest first.
 *
 * Returned as raw instants so the browser can work out what that means where
 * the reader is. Doing the conversion here would bake in whichever timezone the
 * server happens to run in, which is nobody's.
 */
export const getMatchStartTimes = cache(async function getMatchStartTimes(
  limit = 400,
): Promise<string[]> {
  const rows = await db
    .select({ startedAt: matches.startedAt })
    .from(matches)
    .orderBy(desc(matches.startedAt))
    .limit(limit);

  return rows
    .map((row) => row.startedAt?.toISOString())
    .filter((value): value is string => Boolean(value));
});

/** The most recently played matches, across nights. For the front page. */
export const recentMatches = cache(async function recentMatches(limit = 5) {
  return db
    .select({
      archiveDay: matches.archiveDay,
      sourceMatchId: matches.sourceMatchId,
      mapName: matches.mapName,
      mode: matches.mode,
      startedAt: matches.startedAt,
      redScore: matches.redScore,
      blueScore: matches.blueScore,
      winner: matches.winner,
      overtime: matches.overtime,
    })
    .from(matches)
    .where(eq(matches.status, "final"))
    .orderBy(desc(matches.startedAt))
    .limit(limit);
});

/** Headline figures for one night, for the session page. */
export const nightTotals = cache(async function nightTotals(archiveDay: string) {
  const [row] = await db
    .select({
      players: sql<number>`count(distinct lower(${matchPlayers.name}))::int`,
      frags: sql<number>`coalesce(sum(${matchPlayers.kills}), 0)::int`,
      captures: sql<number>`coalesce(sum(${matchPlayers.caps}), 0)::int`,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(eq(matches.archiveDay, archiveDay), TOOK_PART));

  return row ?? { players: 0, frags: 0, captures: 0 };
});

/** Every written column, newest first. */
export const listColumns = cache(async function listColumns() {
  return db
    .select({
      archiveDay: nightColumns.archiveDay,
      headline: nightColumns.headline,
      body: nightColumns.body,
      matchCount: nightColumns.matchCount,
      generatedAt: nightColumns.generatedAt,
      imageKey: nightColumns.imageKey,
      imageModel: nightColumns.imageModel,
    })
    .from(nightColumns)
    .orderBy(desc(nightColumns.archiveDay))
    .limit(60);
});

export const getColumn = cache(async function getColumn(archiveDay: string) {
  const [row] = await db
    .select({
      archiveDay: nightColumns.archiveDay,
      headline: nightColumns.headline,
      body: nightColumns.body,
      matchCount: nightColumns.matchCount,
      model: nightColumns.model,
      generatedAt: nightColumns.generatedAt,
      imageKey: nightColumns.imageKey,
      imageModel: nightColumns.imageModel,
      // The prompt is stored but not selected. It is a maintenance record, not
      // something a reader needs, and it would be a long string on every page.
    })
    .from(nightColumns)
    .where(eq(nightColumns.archiveDay, archiveDay))
    .limit(1);

  return row ?? null;
});

/**
 * What actually gets played here, and how often.
 *
 * The server page said what the server is and nothing about what happens on it.
 * Every figure below is a count of something recorded, not an inference: with
 * fourteen matches on record a per-map win rate would be noise dressed as a
 * spawn advantage, so this reports how often a map comes up and when it was last
 * seen, and stops there.
 */
export const mapRotation = cache(async function mapRotation() {
  return db
    .select({
      mapName: matches.mapName,
      played: sql<number>`count(*)::int`,
      lastPlayed: sql<string>`max(${matches.archiveDay})::text`,
      overtimes: sql<number>`count(*) filter (where ${matches.overtime})::int`,
    })
    .from(matches)
    .where(eq(matches.status, "final"))
    .groupBy(matches.mapName)
    .orderBy(sql`count(*) desc`, matches.mapName);
});

/**
 * The shape of a normal night, as a range rather than an average.
 *
 * Three nights is not enough for a mean to mean anything, and "4.7 matches"
 * would imply a precision that is not there. A range is what the record
 * actually supports and is what somebody deciding whether to turn up wants.
 */
export const nightShape = cache(async function nightShape() {
  // Counted per night and reduced here rather than in a subquery. `TOOK_PART`
  // renders the real table name, so wrapping it in an aliased subselect
  // silently stops matching. Three nights is nothing to reduce in memory.
  const rows = await db
    .select({
      archiveDay: matches.archiveDay,
      matchCount: sql<number>`count(distinct ${matches.id})::int`,
      playerCount: sql<number>`count(distinct lower(${matchPlayers.name}))::int`,
    })
    .from(matches)
    .innerJoin(matchPlayers, eq(matchPlayers.matchId, matches.id))
    .where(and(eq(matches.status, "final"), TOOK_PART))
    .groupBy(matches.archiveDay);

  if (rows.length === 0) {
    return { nights: 0, minMatches: 0, maxMatches: 0, minPlayers: 0, maxPlayers: 0 };
  }

  const matchCounts = rows.map((row) => row.matchCount);
  const playerCounts = rows.map((row) => row.playerCount);

  return {
    nights: rows.length,
    minMatches: Math.min(...matchCounts),
    maxMatches: Math.max(...matchCounts),
    minPlayers: Math.min(...playerCounts),
    maxPlayers: Math.max(...playerCounts),
  };
});

/**
 * Single match superlatives.
 *
 * Safe at this sample size in a way that rates are not: "the most captures
 * anybody has managed in one match" is a fact about one match however few there
 * are, where "this map favours red" needs dozens.
 */
export const serverRecords = cache(async function serverRecords() {
  const [biggestWin] = await db
    .select({
      archiveDay: matches.archiveDay,
      sourceMatchId: matches.sourceMatchId,
      mapName: matches.mapName,
      margin: sql<number>`abs(${matches.redScore} - ${matches.blueScore})::int`,
      redScore: matches.redScore,
      blueScore: matches.blueScore,
    })
    .from(matches)
    .where(eq(matches.status, "final"))
    .orderBy(sql`abs(${matches.redScore} - ${matches.blueScore}) desc`)
    .limit(1);

  const [mostCaps] = await db
    .select({
      name: matchPlayers.name,
      caps: matchPlayers.caps,
      archiveDay: matches.archiveDay,
      sourceMatchId: matches.sourceMatchId,
      mapName: matches.mapName,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(TOOK_PART)
    .orderBy(desc(matchPlayers.caps))
    .limit(1);

  const [bestStreak] = await db
    .select({
      name: matchPlayers.name,
      streak: matchPlayers.maxStreak,
      archiveDay: matches.archiveDay,
      sourceMatchId: matches.sourceMatchId,
      mapName: matches.mapName,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(TOOK_PART)
    .orderBy(desc(matchPlayers.maxStreak))
    .limit(1);

  return { biggestWin: biggestWin ?? null, mostCaps: mostCaps ?? null, bestStreak: bestStreak ?? null };
});

/** Totals for the front page and the archive header. */
export const archiveTotals = cache(async function archiveTotals() {
  const [row] = await db
    .select({
      matchCount: sql<number>`count(*)::int`,
      dayCount: sql<number>`count(distinct ${matches.archiveDay})::int`,
    })
    .from(matches);

  return row ?? { matchCount: 0, dayCount: 0 };
});

/**
 * The match of the night: the one worth reading about on its own.
 *
 * A night is several matches and the column covers all of them at a level that
 * suits none in particular. One game is usually the one people would actually
 * talk about, and it already has a written report, so surfacing it costs a query
 * and no generation at all.
 *
 * Uses the same `matchInterest` the illustration uses to choose its subject, and
 * that sharing is the point: the picture and the featured match agreeing is the
 * difference between a front page that looks composed and one that looks like two
 * systems ran independently.
 */
export const matchOfTheNight = cache(async function matchOfTheNight(
  archiveDay: string,
): Promise<(MatchSummary & { report: string | null }) | null> {
  const rows = await db
    .select({
      id: matches.id,
      sourceMatchId: matches.sourceMatchId,
      server: matches.server,
      status: matches.status,
      mapName: matches.mapName,
      mode: matches.mode,
      startedAt: matches.startedAt,
      endedAt: matches.endedAt,
      redScore: matches.redScore,
      blueScore: matches.blueScore,
      overtime: matches.overtime,
      winner: matches.winner,
      report: matches.report,
    })
    .from(matches)
    .where(and(eq(matches.archiveDay, archiveDay), eq(matches.status, "final")))
    .orderBy(asc(matches.startedAt), asc(matches.sourceMatchId));

  if (rows.length === 0) return null;

  const ids = rows.map((row) => row.id);

  const squads = await db
    .select({
      matchId: matchPlayers.matchId,
      team: matchPlayers.team,
      count: sql<number>`count(distinct lower(${matchPlayers.name}))::int`,
    })
    .from(matchPlayers)
    .where(and(inArray(matchPlayers.matchId, ids), TOOK_PART))
    .groupBy(matchPlayers.matchId, matchPlayers.team);

  const captureCounts = await db
    .select({
      matchId: matchCaptures.matchId,
      count: sql<number>`count(*)::int`,
    })
    .from(matchCaptures)
    .where(inArray(matchCaptures.matchId, ids))
    .groupBy(matchCaptures.matchId);

  const bySquad = new Map<string, { red: number; blue: number }>();
  for (const row of squads) {
    const entry = bySquad.get(row.matchId) ?? { red: 0, blue: 0 };
    if (row.team === "red") entry.red = row.count;
    else if (row.team === "blue") entry.blue = row.count;
    bySquad.set(row.matchId, entry);
  }

  const byCaptures = new Map(captureCounts.map((row) => [row.matchId, row.count]));

  const pickable: PickableMatch[] = rows.map((row) => ({
    sourceMatchId: row.sourceMatchId,
    mapName: row.mapName,
    redScore: row.redScore,
    blueScore: row.blueScore,
    winner: row.winner === "red" || row.winner === "blue" ? row.winner : null,
    overtime: Boolean(row.overtime),
    redPlayers: bySquad.get(row.id)?.red ?? 0,
    bluePlayers: bySquad.get(row.id)?.blue ?? 0,
    // Only the count matters to the score, so the entries are placeholders
    // rather than a third query for data nothing here reads.
    captures: Array.from({ length: byCaptures.get(row.id) ?? 0 }, () => ({
      team: "red" as const,
      elapsedSeconds: 0,
    })),
  }));

  const chosen = pickMatch(pickable);
  if (!chosen) return null;

  const row = rows.find((candidate) => candidate.sourceMatchId === chosen.sourceMatchId);
  if (!row) return null;

  const squad = bySquad.get(row.id) ?? { red: 0, blue: 0 };

  return {
    ...row,
    // Position in the night, so the article can say which game it was.
    number: rows.findIndex((candidate) => candidate.id === row.id) + 1,
    playerCount: squad.red + squad.blue,
    // Not read by the component that renders this one, and a fourth query for a
    // field nothing shows would be a query for the type checker's benefit.
    top: null,
  };
});

/**
 * Who did what on one night, best first.
 *
 * The night page had the totals for the evening and nothing about the people in
 * it, so the right hand column sat empty under a day selector. This is the same
 * aggregation `listPlayers` does, narrowed to a single day.
 *
 * Names its columns, like everything here, and does not name `identity_key`.
 */
export const nightScoreboard = cache(async function nightScoreboard(
  archiveDay: string,
): Promise<
  {
    name: string;
    kills: number;
    deaths: number;
    caps: number;
    score: number;
    /**
     * How many of the night's matches they were actually in.
     *
     * Without it the table is misleading. People drop in and out across an
     * evening, so a total is partly a measure of who stayed, and ranking by
     * frags quietly rewards attendance. Showing the denominator does not fix the
     * ordering, but it lets a reader see that 189 came from four matches and 75
     * from two, which is the difference between a ranking and a claim.
     */
    matchesPlayed: number;
  }[]
> {
  return db
    .select({
      name: sql<string>`min(${matchPlayers.name})`,
      kills: sql<number>`coalesce(sum(${matchPlayers.kills}), 0)::int`,
      deaths: sql<number>`coalesce(sum(${matchPlayers.deaths}), 0)::int`,
      caps: sql<number>`coalesce(sum(${matchPlayers.caps}), 0)::int`,
      score: sql<number>`coalesce(sum(${matchPlayers.score}), 0)::int`,
      matchesPlayed: sql<number>`count(distinct ${matchPlayers.matchId})::int`,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(eq(matches.archiveDay, archiveDay), TOOK_PART))
    .groupBy(sql`lower(${matchPlayers.name})`)
    .orderBy(sql`coalesce(sum(${matchPlayers.score}), 0) desc`);
});

/**
 * The write-ups either side of one night, for reading straight on.
 *
 * An article that ends with no way forward is a dead end: the only route to the
 * next one was back out to the index and in again. Newspapers have had a
 * previous and a next at the foot of the page for a century for good reason.
 *
 * Older is "previous" and newer is "next", matching how the archive reads rather
 * than how the dates sort.
 */
export const adjacentColumns = cache(async function adjacentColumns(
  archiveDay: string,
): Promise<{
  previous: { archiveDay: string; headline: string } | null;
  next: { archiveDay: string; headline: string } | null;
}> {
  const [older] = await db
    .select({ archiveDay: nightColumns.archiveDay, headline: nightColumns.headline })
    .from(nightColumns)
    .where(lt(nightColumns.archiveDay, archiveDay))
    .orderBy(desc(nightColumns.archiveDay))
    .limit(1);

  const [newer] = await db
    .select({ archiveDay: nightColumns.archiveDay, headline: nightColumns.headline })
    .from(nightColumns)
    .where(gt(nightColumns.archiveDay, archiveDay))
    .orderBy(asc(nightColumns.archiveDay))
    .limit(1);

  return { previous: older ?? null, next: newer ?? null };
});

/**
 * Other write-ups worth offering at the end of one, newest first.
 *
 * Deliberately not "related": with a handful of nights on record any similarity
 * measure would be inventing a relationship. Recent is honest and is what a
 * reader actually wants next.
 */
export const otherColumns = cache(async function otherColumns(
  archiveDay: string,
  limit = 4,
) {
  return db
    .select({
      archiveDay: nightColumns.archiveDay,
      headline: nightColumns.headline,
      matchCount: nightColumns.matchCount,
      imageKey: nightColumns.imageKey,
      imageModel: nightColumns.imageModel,
    })
    .from(nightColumns)
    .where(ne(nightColumns.archiveDay, archiveDay))
    .orderBy(desc(nightColumns.archiveDay))
    .limit(limit);
});

/**
 * Everything the ingest vet needs for one night, in one read.
 *
 * Separate from `getMatch` because that returns a whole match for a page and
 * this wants a narrow slice of every match at once. Names its columns, and does
 * not name `identity_key`.
 */
export const nightForVetting = cache(async function nightForVetting(
  archiveDay: string,
): Promise<VettableMatch[]> {
  const rows = await db
    .select({
      id: matches.id,
      sourceMatchId: matches.sourceMatchId,
      mapName: matches.mapName,
      redScore: matches.redScore,
      blueScore: matches.blueScore,
      winner: matches.winner,
    })
    .from(matches)
    .where(and(eq(matches.archiveDay, archiveDay), eq(matches.status, "final")))
    .orderBy(asc(matches.startedAt));

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  const players = await db
    .select({
      matchId: matchPlayers.matchId,
      name: matchPlayers.name,
      team: matchPlayers.team,
      spectator: matchPlayers.spectator,
      kills: matchPlayers.kills,
      deaths: matchPlayers.deaths,
      caps: matchPlayers.caps,
      shotsHit: matchPlayers.shotsHit,
      shotsFired: matchPlayers.shotsFired,
      fastestCaptureMs: matchPlayers.fastestCaptureMs,
      soloCaps: matchPlayers.soloCaps,
      relayCaps: matchPlayers.relayCaps,
    })
    .from(matchPlayers)
    .where(inArray(matchPlayers.matchId, ids));

  const captures = await db
    .select({
      matchId: matchCaptures.matchId,
      team: matchCaptures.team,
      playerName: matchCaptures.playerName,
    })
    .from(matchCaptures)
    .where(inArray(matchCaptures.matchId, ids));

  return rows.map((row) => ({
    sourceMatchId: row.sourceMatchId,
    mapName: row.mapName,
    redScore: row.redScore,
    blueScore: row.blueScore,
    winner: row.winner,
    players: players.filter((p) => p.matchId === row.id),
    captures: captures.filter((c) => c.matchId === row.id),
  }));
});
