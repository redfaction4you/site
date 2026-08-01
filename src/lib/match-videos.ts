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
 * This list is the seed. Anything added through `/link` lands in the
 * `match_videos` table instead, and `match-footage.ts` merges the two on read,
 * so entries here keep working and nothing had to be migrated to make the page
 * possible.
 *
 * The lookups below stay pure and take the list to search. That is not
 * decoration: this module is loaded directly by `node --test`, which has no
 * bundler and cannot resolve the `@/` alias, so the database half has to live in
 * its own module or the tests stop being able to load this one at all.
 *
 * **Nothing is claimed about whose view it is.** These are recorded either from a
 * player's own screen or from the spectator camera that follows whoever is in
 * the action, and which one a given upload is cannot reliably be said from
 * outside it. An earlier version labelled every recording "player view" and
 * named the recorder, which would have been a confident guess sitting on a site
 * whose whole argument is that it does not make those. A viewer can see which it
 * is within seconds of pressing play; the site does not need to assert it.
 *
 * `note` is there for anything genuinely known and worth saying.
 */

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
  covers: Coverage[];
  /** Optional: one line on what is worth seeing, when there is something to say. */
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
    covers: [{ archiveDay: "2026-07-30", sourceMatchId: 12 }],
  },
  {
    youtubeId: "quBSd4uSbr8",
    covers: [{ archiveDay: "2026-07-30", sourceMatchId: 15 }],
  },
  {
    youtubeId: "2JiRI6hVgGo",
    covers: [{ archiveDay: "2026-07-29", sourceMatchId: 6 }],
  },
  {
    youtubeId: "f2ZZT_ZbHOY",
    covers: [{ archiveDay: "2026-07-29", sourceMatchId: 9 }],
  },
  {
    /*
     * Warlords Pro (No Fog), match 24. Corrected from match 18.
     *
     * Two matches that night finished nil one in overtime, and the first pass
     * took the earlier one. The video's own title names the map, and the six
     * players named alongside it are match 24's roster exactly, where match 18
     * had eight. The count not matching was visible at the time and was talked
     * past, which is why the page that adds these now shows the title back
     * before anything is saved.
     */
    youtubeId: "HHOoYaB12Rs",
    covers: [{ archiveDay: "2026-07-31", sourceMatchId: 24 }],
  },
];

/**
 * The video id out of whatever somebody pasted.
 *
 * People paste the address bar, the share link, the mobile app link, and
 * occasionally just the id. Asking them to extract eleven characters themselves
 * is the kind of small chore that ends with the link never being added, so this
 * takes all of it: `youtu.be/ID`, `watch?v=ID`, `/shorts/ID`, `/live/ID`,
 * `/embed/ID`, with or without a scheme, extra parameters, or a timestamp.
 *
 * Returns null rather than guessing. A wrong id renders a dead embed against a
 * real match, which is worse than refusing the paste and saying so.
 */
export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;

  // Ids are exactly eleven characters of an unreserved alphabet, which is what
  // makes a bare paste safe to accept.
  const ID = /^[A-Za-z0-9_-]{11}$/;
  if (ID.test(text)) return text;

  let url: URL | null = null;
  try {
    url = new URL(text.startsWith("http") ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const isYouTube =
    host === "youtu.be" ||
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host.endsWith(".youtube.com");
  if (!isYouTube) return null;

  const fromQuery = url.searchParams.get("v");
  if (fromQuery && ID.test(fromQuery)) return fromQuery;

  const [first, second] = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be" && first && ID.test(first)) return first;
  if (
    second &&
    ID.test(second) &&
    ["shorts", "live", "embed", "v"].includes(first ?? "")
  ) {
    return second;
  }

  return null;
}

/**
 * Seconds out of a pasted timestamp.
 *
 * Accepts `90`, `1:30` and `1:02:03`, because somebody reading a time off a
 * video player copies what the player shows them.
 */
export function parseStartsAt(input: string): number | null {
  const text = input.trim();
  if (!text) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(text)) return null;

  const parts = text.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;

  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds > 0 ? seconds : null;
}

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
  videos: MatchVideo[] = MATCH_VIDEOS,
): MatchFootage[] {
  const found: MatchFootage[] = [];

  for (const video of videos) {
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
export function footageForNight(
  archiveDay: string,
  videos: MatchVideo[] = MATCH_VIDEOS,
): MatchFootage[] {
  const found = new Map<string, MatchFootage>();

  for (const video of videos) {
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
