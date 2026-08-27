/**
 * Finding the running level in a rotation, and saying what follows it.
 *
 * The two ends describe a map differently and neither can be changed. The map
 * pack holds what the server loads, `dm-rfu2-finding-nemo.rfl`. The server
 * browser reports the level's own name, `RFU2-Finding Nemo`. They are the same
 * map and they share no exact string.
 *
 * FactionFiles closes the gap: the title it returns for a filename is the level
 * name the browser reports, so `link-maps.mjs` has already stored the thing that
 * matches. The filename is kept as a fallback for an entry that never resolved.
 *
 * **Comparison is deliberately lossy.** Case, punctuation and spacing all differ
 * between the two ends for the same map, so everything is folded to letters and
 * digits before comparing. That can in principle collide, and a collision here
 * costs a wrong "playing now" marker rather than anything in the archive.
 *
 * **Where the order can be trusted, and where it cannot.** Alpine reshuffles the
 * rotation array when it reaches the last level, inside the game server, and
 * never tells the website. `dynamic_rotation` is therefore off on every server
 * whose rotation this describes; with it on, the stored order becomes fiction
 * after one full pass and `nextInRotation` would confidently print the wrong
 * map. If it is ever switched back on, this module has to stop being used.
 *
 * Deliberately free of imports so `node --test` can load it directly.
 */

/** What this module needs of a pack entry. */
export type RotationEntry = {
  filename: string;
  title?: string;
};

/** Letters and digits only, which is all the two ends agree on. */
function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.rfl$/, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Where the running level sits in the rotation, or null when it cannot be told.
 *
 * Null is a real answer and the pages treat it as one. A level reached by a vote
 * is not in the rotation at all, and an entry whose title never resolved may not
 * match under any folding. Saying nothing beats guessing at a position and
 * printing the wrong next map from it.
 */
export function positionInRotation(
  levelName: string | null | undefined,
  maps: RotationEntry[],
): number | null {
  if (!levelName) return null;
  const target = fold(levelName);
  if (!target) return null;

  const byTitle = maps.findIndex((entry) => entry.title && fold(entry.title) === target);
  if (byTitle >= 0) return byTitle;

  const byFilename = maps.findIndex((entry) => fold(entry.filename) === target);
  return byFilename >= 0 ? byFilename : null;
}

/**
 * The level after the running one, wrapping at the end.
 *
 * Null when the running level is not in the rotation, or when the rotation is
 * too short for "next" to mean anything: with one map the next map is the same
 * map, which is true and useless.
 */
export function nextInRotation(
  levelName: string | null | undefined,
  maps: RotationEntry[],
): RotationEntry | null {
  if (maps.length < 2) return null;
  const at = positionInRotation(levelName, maps);
  if (at === null) return null;
  return maps[(at + 1) % maps.length];
}

/**
 * The rotation reordered to start at the running level.
 *
 * A hundred and fifty six maps listed from wherever the author happened to put
 * them first is a wall. Started at what is on, it reads as a queue.
 * Unchanged when the running level cannot be placed.
 */
export function rotationFrom<T extends RotationEntry>(
  levelName: string | null | undefined,
  maps: T[],
): T[] {
  const at = positionInRotation(levelName, maps);
  if (at === null || at === 0) return maps;
  return [...maps.slice(at), ...maps.slice(0, at)];
}
