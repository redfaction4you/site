/**
 * Reading the match archive.
 *
 * Every query here names its columns. None of them name
 * `match_players.identity_key`, and none of them should: it is stored so that
 * Discord accounts can one day be reconciled against in-game identities, and
 * it has no business in a scoreboard. Selecting whole rows with
 * `db.query.matchPlayers.findMany()` would quietly undo that, so don't.
 */
import { and, asc, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import { matchCaptures, matchPlayers, matches } from "@/lib/db/schema";
import { ARCHIVE_TIME_ZONE } from "@/lib/matches/sanitize";

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
      playerCount: sql<number>`(
        select count(*)::int from ${matchPlayers}
        where ${matchPlayers.matchId} = ${matches.id}
          and ${matchPlayers.spectator} = false
      )`,
    })
    .from(matches)
    .where(eq(matches.archiveDay, archiveDay))
    .orderBy(asc(matches.startedAt), asc(matches.sourceMatchId));

  return rows;
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
    .orderBy(asc(matchCaptures.elapsedSeconds));

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
  shotsHit: number;
  shotsFired: number;
  damageGiven: number;
  damageTaken: number;
  flagHoldMs: number;
  flagReturns: number;
  bestStreak: number;
  fastestCaptureMs: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
};

const playerTotalColumns = {
  name: sql<string>`min(${matchPlayers.name})`,
  matchesPlayed: sql<number>`count(distinct ${matchPlayers.matchId})::int`,
  kills: sql<number>`coalesce(sum(${matchPlayers.kills}), 0)::int`,
  deaths: sql<number>`coalesce(sum(${matchPlayers.deaths}), 0)::int`,
  caps: sql<number>`coalesce(sum(${matchPlayers.caps}), 0)::int`,
  score: sql<number>`coalesce(sum(${matchPlayers.score}), 0)::int`,
  shotsHit: sql<number>`coalesce(sum(${matchPlayers.shotsHit}), 0)::float8`,
  shotsFired: sql<number>`coalesce(sum(${matchPlayers.shotsFired}), 0)::float8`,
  damageGiven: sql<number>`coalesce(sum(${matchPlayers.damageGiven}), 0)::float8`,
  damageTaken: sql<number>`coalesce(sum(${matchPlayers.damageTaken}), 0)::float8`,
  flagHoldMs: sql<number>`coalesce(sum(${matchPlayers.flagHoldMs}), 0)::int`,
  flagReturns: sql<number>`coalesce(sum(${matchPlayers.flagReturns}), 0)::int`,
  bestStreak: sql<number>`coalesce(max(${matchPlayers.maxStreak}), 0)::int`,
  fastestCaptureMs: sql<
    number | null
  >`min(nullif(${matchPlayers.fastestCaptureMs}, 0))::int`,
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
    .where(eq(matchPlayers.spectator, false))
    .groupBy(sql`lower(${matchPlayers.name})`)
    .orderBy(sql`count(distinct ${matchPlayers.matchId}) desc`, sql`2 desc`);

  return rows;
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
    .where(sql`lower(${matchPlayers.name}) = lower(${name})`)
    .groupBy(sql`lower(${matchPlayers.name})`)
    .limit(1);

  return row ?? null;
});

export type PlayerMatchRow = {
  archiveDay: string;
  sourceMatchId: number;
  mapName: string;
  mode: string;
  startedAt: Date | null;
  team: string;
  won: boolean | null;
  redScore: number;
  blueScore: number;
  score: number;
  kills: number;
  deaths: number;
  caps: number;
  accuracy: number;
};

/** Every match this player appeared in, newest first. */
export const getPlayerMatches = cache(async function getPlayerMatches(
  name: string,
): Promise<PlayerMatchRow[]> {
  const rows = await db
    .select({
      archiveDay: matches.archiveDay,
      sourceMatchId: matches.sourceMatchId,
      mapName: matches.mapName,
      mode: matches.mode,
      startedAt: matches.startedAt,
      team: matchPlayers.team,
      winner: matches.winner,
      redScore: matches.redScore,
      blueScore: matches.blueScore,
      score: matchPlayers.score,
      kills: matchPlayers.kills,
      deaths: matchPlayers.deaths,
      caps: matchPlayers.caps,
      accuracy: matchPlayers.accuracy,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(sql`lower(${matchPlayers.name}) = lower(${name})`)
    .orderBy(desc(matches.startedAt));

  return rows.map(({ winner, ...row }) => ({
    ...row,
    // Null rather than false when the match had no winner: a cancelled match
    // is not a loss.
    won: winner ? winner === row.team : null,
  }));
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
    .orderBy(asc(matchCaptures.elapsedSeconds));

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
