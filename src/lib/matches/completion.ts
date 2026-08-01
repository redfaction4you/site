/**
 * Whether a match on the record actually finished.
 *
 * The companion to `participation.ts`, and it exists for the same reason: the
 * server sends something that looks like a real row and is not. An abandoned
 * start is labelled `final` exactly like a game that ran its ten minutes, so
 * status cannot tell them apart. Duration can, and unambiguously: every
 * completed match on record ran 600 seconds or more, with overtime running on to
 * 640, 718, 763 and 870. The two cancelled ones ran 30. There is nothing in
 * between.
 *
 * **The row is kept and simply does not count.** Deleting it would be the
 * archive forgetting something that happened, and a cancelled match did happen;
 * it just produced no result. It stays readable on its night, marked as what it
 * is, and is left out of every total, average and ranking.
 *
 * `MATCH_COMPLETED` in `queries.ts` is the SQL twin of this and the two must be
 * kept in step, the same arrangement `tookPart` and `TOOK_PART` have. This side
 * is what a page uses to decide whether to mark a match; that side is what keeps
 * it out of the sums. A night whose header excluded a cancelled match while its
 * scoreboard counted it is the bug this pairing is meant to make impossible: on
 * 31 July the two disagreed by exactly the twelve frags of the match that was
 * cancelled after thirty seconds.
 *
 * Deliberately free of imports so `node --test` can load it directly.
 */

/**
 * Below this a match did not finish.
 *
 * Half of the ten minute regulation, and kept loose on purpose. A tighter bound
 * would be a number fitted to the two cancelled matches seen so far and would
 * start excluding real games the day somebody runs a shorter format. Everything
 * this is meant to catch sits far below it.
 *
 * `MIN_PLAUSIBLE_SECONDS` in `vet.ts` and `MIN_COMPLETED_SECONDS` in
 * `ai/night-column.ts` are the same number. They are written out there rather
 * than imported because both files are deliberately import-free.
 */
export const MIN_COMPLETED_SECONDS = 300;

/** Just enough of a match to time it. Both queries already select these. */
export type MatchClock = {
  startedAt: Date | string | null;
  endedAt: Date | string | null;
};

/** How long it ran, or null when the server sent no clock. */
export function matchSeconds(match: MatchClock): number | null {
  if (!match.startedAt || !match.endedAt) return null;
  const started = new Date(match.startedAt).getTime();
  const ended = new Date(match.endedAt).getTime();
  if (Number.isNaN(started) || Number.isNaN(ended)) return null;
  return Math.round((ended - started) / 1000);
}

/**
 * True when this match counts.
 *
 * **A match with no clock at all counts.** Missing is not the same as short, and
 * refusing to count a match because the server forgot to send an end time would
 * lose a real result to a reporting gap. The same trade `tookPart` makes: it is
 * far worse to drop something real than to keep something empty.
 */
export function matchCompleted(match: MatchClock): boolean {
  const seconds = matchSeconds(match);
  return seconds === null || seconds >= MIN_COMPLETED_SECONDS;
}

/** The counterpart, for the pages that have to say so. */
export function wasCancelled(match: MatchClock): boolean {
  return !matchCompleted(match);
}

/**
 * Said in one place so a match row and a match page cannot word it two ways.
 */
export const CANCELLED_NOTE =
  "Ended far short of regulation, so it was cancelled and restarted rather " +
  "than played out. It is kept on the record and counts towards nothing.";
