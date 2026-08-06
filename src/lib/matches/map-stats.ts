/**
 * Every map side by side, which no page could show.
 *
 * `/matches/maps` is a gallery and `/matches/map/[map]` is one map's own record.
 * Both are about a map. Neither answers the comparative question, which is the
 * one somebody arriving at a stats page actually has: which of these produces
 * long games, which produces close ones, where does the flag actually move.
 *
 * One row per map, one query per thing being counted rather than one query per
 * map. Nine maps and thirty matches would survive the N+1, but the shape of the
 * page should not depend on the archive staying small.
 */
import { and, eq, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import { matchPlayers, matches } from "@/lib/db/schema";
import { MATCH_COMPLETED, TOOK_PART } from "@/lib/matches/queries";

export type MapSummary = {
  mapName: string;
  matches: number;
  /** Evenings it has come up, which is not the same as matches. */
  nights: number;
  redWins: number;
  blueWins: number;
  /** Played to a finish with no winner recorded. Not a loss for either side. */
  drawn: number;
  overtime: number;
  /** Mean length in seconds, or null where no match on it carries a clock. */
  averageSeconds: number | null;
  /** Mean captures in a match here, both sides together. */
  averageCaptures: number | null;
  /** Mean winning margin, in captures. */
  averageMargin: number | null;
  /** The quickest unbroken flag run anybody has set here. */
  fastestRunMs: number | null;
};

/**
 * How many matches a map needs before its averages are printed as averages.
 *
 * A map played once has an "average match length" that is one match, and a
 * red-blue split of 1-0 that reads as a 100% side bias. The row still appears,
 * because the map was played and hiding it would make the page disagree with the
 * archive, but the figures that only mean something over a sample are withheld
 * and the page says why.
 */
export const MIN_MATCHES_FOR_MAP_AVERAGE = 3;

export const MAP_AVERAGE_REQUIREMENT =
  `Averages appear after ${MIN_MATCHES_FOR_MAP_AVERAGE} matches on a map. Below that they would ` +
  `describe one evening rather than the map.`;

export const mapSummaries = cache(async function mapSummaries(): Promise<MapSummary[]> {
  /*
   * The matches, which is everything except what the players did in them.
   *
   * `status = 'final'` as well as MATCH_COMPLETED, matching the ticker and the
   * map pages: a match still in progress has a score that is not a result yet,
   * and averaging it in would move every figure on the row it lands in.
   */
  const rows = await db
    .select({
      mapName: matches.mapName,
      matches: sql<number>`count(*)::int`,
      nights: sql<number>`count(distinct ${matches.archiveDay})::int`,
      redWins: sql<number>`count(*) filter (where ${matches.winner} = 'red')::int`,
      blueWins: sql<number>`count(*) filter (where ${matches.winner} = 'blue')::int`,
      drawn: sql<number>`count(*) filter (where ${matches.winner} not in ('red','blue') or ${matches.winner} is null)::int`,
      overtime: sql<number>`count(*) filter (where ${matches.overtime})::int`,
      averageSeconds: sql<number | null>`round(avg(
        extract(epoch from (${matches.endedAt} - ${matches.startedAt}))
      ))::int`,
      averageCaptures: sql<number | null>`avg(${matches.redScore} + ${matches.blueScore})::float8`,
      averageMargin: sql<number | null>`avg(abs(${matches.redScore} - ${matches.blueScore}))::float8`,
    })
    .from(matches)
    .where(and(eq(matches.status, "final"), MATCH_COMPLETED))
    .groupBy(matches.mapName);

  /*
   * The record that belongs to the map rather than to a player.
   *
   * A run is a distance as much as a time, which is exactly why there is no
   * cross-map board for it and why it belongs in a per-map column: down this
   * column the distance is not a constant, and the numbers are not being ranked
   * against each other, they are each labelled with the map they were set on.
   */
  const runs = await db
    .select({
      mapName: matches.mapName,
      fastestRunMs: sql<number | null>`min(${matchPlayers.fastestSoloCaptureMs})::int`,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(TOOK_PART, eq(matches.status, "final"), MATCH_COMPLETED))
    .groupBy(matches.mapName);

  const fastest = new Map(runs.map((row) => [row.mapName, row.fastestRunMs]));

  return rows
    .map((row) => ({
      ...row,
      averageCaptures: row.averageCaptures ?? null,
      averageMargin: row.averageMargin ?? null,
      fastestRunMs: fastest.get(row.mapName) ?? null,
    }))
    .sort((a, b) => b.matches - a.matches || a.mapName.localeCompare(b.mapName, "en"));
});
