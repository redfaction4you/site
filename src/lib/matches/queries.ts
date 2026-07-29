/**
 * Reading the match archive.
 *
 * Every query here names its columns. None of them name
 * `match_players.identity_key`, and none of them should: it is stored so that
 * Discord accounts can one day be reconciled against in-game identities, and
 * it has no business in a scoreboard. Selecting whole rows with
 * `db.query.matchPlayers.findMany()` would quietly undo that, so don't.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import { matchCaptures, matchPlayers, matches } from "@/lib/db/schema";

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
