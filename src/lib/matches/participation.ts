/**
 * Whether a row on a scoreboard is somebody who actually played.
 *
 * The server sends a row for everyone it had on a team when it took its
 * snapshot, and that is not the same set as the people who played. Five rows on
 * record carry a real team, `spectator = false`, and nothing else at all: no
 * score, no frags, no deaths, no shots fired, no flag touched, not even damage
 * taken. Somebody who spawned and stood still for a whole match would still
 * collect deaths and damage. Zero across every counter means they were never in
 * the game: connected during the map load, sat in the queue, joined as it ended.
 *
 * Left uncorrected this is not a rounding error, it changes what the archive
 * says happened:
 *
 * - Match 10 was two against two and was recorded as three against three.
 * - Chill Hippo and Ath-PL have never played a match and appeared on `/players`
 *   with one each.
 * - The night's column named Fatoon as playing a match they were not in, which
 *   is how this was found: somebody read it and knew it was wrong.
 * - Squad size feeds the illustration prompt, so the pictures had the wrong
 *   number of figures a side.
 * - Pairings counted people as teammates who never took the field together.
 *
 * **The spectator flag is not the answer, and the server is not lying.** Real
 * spectators arrive correctly marked, with `team = "spectator"` and the flag
 * set, and those are already handled. These are a third category the schema had
 * no name for: on a team, not spectating, and absent.
 *
 * As everywhere else here, the row is kept exactly as sent and the reading is
 * withheld. Nothing is deleted, so if a future export proves one of these people
 * really did play, the evidence is still there.
 *
 * Deliberately free of imports so `node --test` can load it directly.
 */

/**
 * Every counter that moving at all would tick.
 *
 * Deliberately broad. It is far worse to drop somebody who played badly than to
 * keep somebody who did nothing, so any sign of life counts: taking damage is
 * enough, and so is picking up a flag and dropping it immediately.
 */
const SIGNS_OF_LIFE = [
  "score",
  "kills",
  "deaths",
  "caps",
  "shotsFired",
  "shotsHit",
  "damageTaken",
  "damageGiven",
  "flagPickups",
  "flagReturns",
  "maxStreak",
] as const;

/**
 * The shape this reads. Every field optional, so it works on the several row
 * shapes the queries return without any of them having to grow columns.
 */
export type Activity = Partial<Record<(typeof SIGNS_OF_LIFE)[number], number>> & {
  spectator?: boolean;
};

/**
 * True when this row is somebody who took part in the match.
 *
 * Spectators are excluded here as well as by the flag, so callers have one
 * question to ask instead of two and cannot accidentally ask only the old one.
 */
export function tookPart(row: Activity): boolean {
  if (row.spectator) return false;
  return SIGNS_OF_LIFE.some((field) => {
    const value = row[field];
    return typeof value === "number" && value > 0;
  });
}

/** The counterpart, for the rare caller that wants what was left out. */
export function wasAbsent(row: Activity): boolean {
  return !row.spectator && !tookPart(row);
}

/**
 * Said in one place so a scoreboard and a player page cannot word it two ways.
 */
export const ABSENT_NOTE =
  "On a team but with nothing at all recorded, so they are not counted as having " +
  "played this match.";
