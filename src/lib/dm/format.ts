/**
 * How the deathmatch side writes its numbers.
 *
 * Time on the server is the headline of the whole DM record rather than one
 * column of it, so it appears on `/stats/dm`, `/matches/maps/dm` and
 * `/server/map-packs`. It had been written out three times, and three copies of
 * a formatter is how "1h 24m" on one page becomes "84m" on the next.
 */

/**
 * Seconds, written the way somebody says it.
 *
 * Reads as "1h 24m" rather than a count of seconds nobody converts in their
 * head. Below a minute it stays in seconds, because "0m" for somebody who just
 * appeared reads as an error rather than as a short visit.
 */
export function timePlayed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * Frags per minute, the honest figure where a total only measures attendance.
 *
 * Withheld under a minute rather than divided by almost nothing: somebody who
 * joined, fragged once and left is not on a hundred a minute.
 */
export function perMinute(count: number, seconds: number): string {
  if (seconds < 60) return "—";
  return (count / (seconds / 60)).toFixed(1);
}
