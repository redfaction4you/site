/**
 * Recordings, from the committed seed and the table together.
 *
 * `match-videos.ts` holds the seed list and the pure lookups over it. This is
 * the half that touches the database, and it is a separate module for a
 * mechanical reason worth knowing before merging them back: the seed module is
 * loaded directly by `node --test`, which has no bundler and cannot resolve the
 * `@/` alias. One `@/lib/db` import in that file takes the video tests out.
 *
 * Merged on read rather than migrated. The entries in the file are correct and
 * moving them into the table would be a database write to solve a tidiness
 * problem, so the file keeps working and the table only ever holds what was
 * added through `/link` since.
 */
import { cache } from "react";

import { db } from "@/lib/db";
import { matchVideos } from "@/lib/db/schema";
import {
  type Coverage,
  MATCH_VIDEOS,
  type MatchFootage,
  type MatchVideo,
  footageForMatch as findForMatch,
  footageForNight as findForNight,
} from "@/lib/match-videos";

/**
 * Every recording the site knows about.
 *
 * Cached per request, so a night page asking once per match row is one query
 * rather than six, which is what lets the mark on each row keep doing its own
 * lookup instead of having a list threaded down to it through four components.
 */
export const allVideos = cache(async function allVideos(): Promise<MatchVideo[]> {
  let stored: {
    youtubeId: string;
    archiveDay: string;
    sourceMatchId: number;
    startsAt: number | null;
    note: string | null;
  }[] = [];

  try {
    stored = await db
      .select({
        youtubeId: matchVideos.youtubeId,
        archiveDay: matchVideos.archiveDay,
        sourceMatchId: matchVideos.sourceMatchId,
        startsAt: matchVideos.startsAt,
        note: matchVideos.note,
      })
      .from(matchVideos);
  } catch (error) {
    /*
     * A recording is furniture, not the record.
     *
     * Everything else on a match page comes from the archive, and none of it
     * should vanish because the video table could not be read. The seed still
     * renders and the page is whole apart from a link.
     */
    console.warn(
      `[videos] could not read stored recordings: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const byId = new Map<string, MatchVideo>();
  for (const video of MATCH_VIDEOS) {
    byId.set(video.youtubeId, { ...video, covers: [...video.covers] });
  }

  for (const row of stored) {
    const coverage: Coverage = {
      archiveDay: row.archiveDay,
      sourceMatchId: row.sourceMatchId,
      ...(row.startsAt != null ? { startsAt: row.startsAt } : {}),
    };

    const existing = byId.get(row.youtubeId);
    if (!existing) {
      byId.set(row.youtubeId, {
        youtubeId: row.youtubeId,
        covers: [coverage],
        ...(row.note ? { note: row.note } : {}),
      });
      continue;
    }

    // The file wins on a match it already claims, so a duplicate added through
    // the page cannot quietly displace an entry somebody committed.
    const claimed = existing.covers.some(
      (had) =>
        had.archiveDay === coverage.archiveDay &&
        had.sourceMatchId === coverage.sourceMatchId,
    );
    if (!claimed) existing.covers.push(coverage);
  }

  return [...byId.values()];
});

/** Every recording of one match, seed and stored alike. */
export async function footageForMatch(
  archiveDay: string,
  sourceMatchId: number,
): Promise<MatchFootage[]> {
  return findForMatch(archiveDay, sourceMatchId, await allVideos());
}

/** Every recording covering any match on one night. */
export async function footageForNight(
  archiveDay: string,
): Promise<MatchFootage[]> {
  return findForNight(archiveDay, await allVideos());
}
