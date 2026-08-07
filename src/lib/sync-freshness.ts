/**
 * Which servers have gone quiet, decided on the pings alone.
 *
 * Separate from `sync-ping.ts` so `node --test` can load it: that file talks to
 * the database, this file is the rule, and the rule is the part that has a
 * wrong answer worth guarding against.
 *
 * Deliberately free of imports.
 */

export type SyncPing = { server: string; lastSeenAt: Date };

/**
 * **Each server is judged on its own, never on the newest of them.**
 *
 * Taking the most recent ping across all servers is the obvious reading and it
 * is the one that fails silently: once deathmatch is syncing every fifteen
 * minutes, the match server could stop for a week and the newest ping would
 * still be four minutes old. Reporting healthy while the archive stopped
 * growing is the precise failure health exists to catch, and it is the failure
 * that went unnoticed for a day when the answer came from
 * `max(matches.ingested_at)`.
 *
 * A server that is genuinely retired has to have its row deleted or it will
 * hold health red forever. That is the right way round: a machine that has
 * stopped reporting is a fault until a person says otherwise.
 */
export function quietSince(
  pings: SyncPing[],
  staleMinutes: number,
  now: number = Date.now(),
): { server: string; minutesAgo: number }[] {
  return pings
    .map((ping) => ({
      server: ping.server,
      minutesAgo: Math.round((now - ping.lastSeenAt.getTime()) / 60_000),
    }))
    .filter((ping) => ping.minutesAgo > staleMinutes)
    .sort((left, right) => right.minutesAgo - left.minutesAgo);
}
