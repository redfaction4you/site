/**
 * Recordings of matches that are in the archive.
 *
 * Different from `videos.ts`, which is a curated shelf of Red Faction videos in
 * general. These are footage of a specific game somebody can already read the
 * scoreboard for, so the link is worth nothing on its own and everything next to
 * the match it shows.
 *
 * HOW TO ADD ONE
 * Take the ID out of the URL, the same as the video archive:
 *   https://youtu.be/M4v5bEhI95Y  ->  "M4v5bEhI95Y"
 * Then say which matches it covers, by archive day and the server's match id.
 * The id is the number in the match URL: /matches/2026-07-30/12 is match 12.
 *
 * In code rather than the database, following the same rule as `videos.ts` and
 * `nav.ts`: a list this size is one pull request to change and needs no upload
 * form. Move it to Postgres when hand editing starts to hurt, not before.
 *
 * **Say whose view it is.** A recording made from one player's screen is not a
 * record of the match, it is a record of one person's part in it: they were
 * looking the wrong way for half the captures and the camera cannot show what
 * they did not see. Spectator footage follows whoever is fragging and is much
 * closer to a record of the game. Both are worth having and a viewer should be
 * told which they are about to watch, for the same reason every other piece of
 * this site says where its information came from.
 */

/**
 * `player` is somebody's own screen. `spectator` is the following camera, which
 * jumps to whoever is in the action.
 */
export type Perspective = "player" | "spectator";

export const PERSPECTIVE_LABEL: Record<Perspective, string> = {
  player: "Player view",
  spectator: "Spectator camera",
};

export const PERSPECTIVE_NOTE: Record<Perspective, string> = {
  player:
    "Recorded from one player's screen, so it shows their game rather than the " +
    "whole match.",
  spectator:
    "The spectator camera, which follows whoever is in the action, so it covers " +
    "the match rather than any one player.",
};

/** One match inside a recording. */
export type Coverage = {
  archiveDay: string;
  /** The server's match id, which is the number in the match URL. */
  sourceMatchId: number;
  /**
   * Seconds into the recording where this match starts.
   *
   * Optional, and the reason the type is shaped this way: one sitting is often
   * several games in a single upload, and sending somebody to the top of a forty
   * minute video to find the one they were reading about is not a link, it is a
   * chore.
   */
  startsAt?: number;
};

export type MatchVideo = {
  /** The YouTube video ID. See the note above. */
  youtubeId: string;
  perspective: Perspective;
  /** Who recorded it. For `player`, whose view it is. */
  recordedBy: string;
  covers: Coverage[];
  /** Optional: one line on what is worth seeing. */
  note?: string;
};

/**
 * >>> ADD RECORDINGS HERE. <<<
 *
 * Every entry is checked against the archive by `npm test`, so a typo in a day
 * or a match id fails the build rather than rendering a link to a match that
 * does not exist.
 */
export const MATCH_VIDEOS: MatchVideo[] = [
  {
    youtubeId: "M4v5bEhI95Y",
    perspective: "player",
    recordedBy: "Romek",
    covers: [{ archiveDay: "2026-07-30", sourceMatchId: 12 }],
  },
  {
    youtubeId: "quBSd4uSbr8",
    perspective: "player",
    recordedBy: "Romek",
    covers: [{ archiveDay: "2026-07-30", sourceMatchId: 15 }],
  },
  {
    youtubeId: "f2ZZT_ZbHOY",
    perspective: "player",
    recordedBy: "Romek",
    covers: [{ archiveDay: "2026-07-29", sourceMatchId: 9 }],
  },
];

export function thumbnailUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

/**
 * The watch link, jumped to the right moment when there is one.
 *
 * `t` is what YouTube reads, in seconds, and it works on both the long and short
 * URL forms.
 */
export function watchUrl(youtubeId: string, startsAt?: number): string {
  const base = `https://www.youtube.com/watch?v=${youtubeId}`;
  return startsAt && startsAt > 0 ? `${base}&t=${Math.round(startsAt)}` : base;
}

/** A recording paired with the coverage entry that matched, for its start time. */
export type MatchFootage = { video: MatchVideo; coverage: Coverage };

/** Every recording of one match. Usually none, occasionally more than one. */
export function footageForMatch(
  archiveDay: string,
  sourceMatchId: number,
): MatchFootage[] {
  const found: MatchFootage[] = [];

  for (const video of MATCH_VIDEOS) {
    for (const coverage of video.covers) {
      if (coverage.archiveDay === archiveDay && coverage.sourceMatchId === sourceMatchId) {
        found.push({ video, coverage });
      }
    }
  }

  return found;
}

/**
 * Every recording covering any match on one night, newest match first.
 *
 * A video spanning several matches appears once, pointed at the earliest match
 * of the night it covers, because the night page is an invitation to watch the
 * evening rather than a specific game.
 */
export function footageForNight(archiveDay: string): MatchFootage[] {
  const found = new Map<string, MatchFootage>();

  for (const video of MATCH_VIDEOS) {
    for (const coverage of video.covers) {
      if (coverage.archiveDay !== archiveDay) continue;
      const existing = found.get(video.youtubeId);
      if (!existing || coverage.sourceMatchId < existing.coverage.sourceMatchId) {
        found.set(video.youtubeId, { video, coverage });
      }
    }
  }

  return [...found.values()].sort(
    (a, b) => a.coverage.sourceMatchId - b.coverage.sourceMatchId,
  );
}

/** Whether anything at all has been recorded. Used to hide empty furniture. */
export function hasFootage(): boolean {
  return MATCH_VIDEOS.length > 0;
}
