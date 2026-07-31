/**
 * Whether a shooting record can produce an accuracy at all.
 *
 * A player cannot land more shots than they fired. When the record says
 * otherwise it is not a very good player, it is a broken counter, and dividing
 * the two produces a number that is worse than missing: 1067% printed in a table
 * of percentages reads as data, and it will be ranked, totalled and written
 * about by everything downstream.
 *
 * This happened on the rail maps. `vet.ts` has caught `hits-exceed-shots` since
 * it was written and said so on every run, but nothing acted on it, so the
 * scoreboard published 1067%, the accuracy board would have ranked it first, and
 * the night's column was handed it as a fact. Detection without a consequence is
 * just a log line.
 *
 * **The record is kept and the derived number is withheld.** That is the same
 * trade `fastest_capture_ms` makes for relay captures: the row stays exactly as
 * the server sent it, because a flawed record still beats no record and the
 * cause is worth diagnosing later, but nothing computes a claim from it. Deleting
 * or correcting the row would be guessing at what the server meant, and the one
 * thing we know is that we do not know.
 *
 * Deliberately free of imports so `node --test` can load it directly.
 */

/**
 * **`shots_hit` is fractional on purpose. Do not "fix" it.**
 *
 * Hit counts come back as 159.75, 207.875, 90. The fractions are always eighths,
 * and an audit of every match on record traced all 32 of them to one weapon: the
 * Automatic Shotgun, which fires eight pellets a shot, so a blast landing three
 * of them counts as three eighths of a hit. Not one row is fractional without
 * shotgun use, and no other weapon ever produces a fraction.
 *
 * That makes accuracy pellet-weighted rather than a count of blasts that touched
 * somebody, which is the more meaningful of the two and is what the game itself
 * reports. Rounding it to integers would quietly inflate every shotgun user.
 */

/** The largest overshoot that is just floating point rather than a broken counter. */
const TOLERANCE = 1e-6;

/**
 * True when hits and shots can both be believed.
 *
 * Negative counters fail too. They are a different bug with the same answer:
 * whatever this is, it is not a shooting record.
 */
export function shootingIsSound(shotsHit: number, shotsFired: number): boolean {
  if (!Number.isFinite(shotsHit) || !Number.isFinite(shotsFired)) return false;
  if (shotsHit < 0 || shotsFired < 0) return false;
  return shotsHit <= shotsFired + TOLERANCE;
}

/**
 * Accuracy, or null when the record cannot support one.
 *
 * Null covers three different situations that all have the same honest answer:
 * nothing was fired, the counters contradict each other, or the numbers are not
 * numbers. Callers show a dash and say why rather than printing a figure.
 */
export function accuracyOf(shotsHit: number, shotsFired: number): number | null {
  if (!shootingIsSound(shotsHit, shotsFired)) return null;
  if (shotsFired <= 0) return null;
  return Math.min(1, shotsHit / shotsFired);
}

/**
 * The sentence shown wherever an accuracy is missing for this reason.
 *
 * One wording, in one place, so the scoreboard and the player page cannot come
 * to describe the same absence two different ways.
 */
export const UNSOUND_SHOOTING_NOTE =
  "The server recorded more hits than shots for this player, so no accuracy can be " +
  "worked out from it. The rest of their record is unaffected.";
