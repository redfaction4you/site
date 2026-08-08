/**
 * Is the pipeline actually running?
 *
 * The failure that matters here is silent. If the VPS stops syncing, the site
 * keeps serving yesterday's matches and looks perfectly healthy. Nobody finds
 * out until somebody wonders why last night is missing, which could be days.
 * The same is true of the nightly backup.
 *
 * So both are measured against how often they are supposed to happen, and
 * anything overdue is reported as such rather than left to be noticed.
 */
import { desc, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { dmPlayers, dmRounds, matches, nightColumns, opinionPieces } from "@/lib/db/schema";
import { listBackups } from "@/lib/backup";
import { listSyncPings } from "@/lib/sync-ping";
import { quietSince } from "@/lib/sync-freshness";
import { discordConfigured } from "@/lib/ai/discord";

/**
 * The VPS syncs every fifteen minutes. Three missed in a row is a problem
 * rather than a blip, and short enough to catch the same evening.
 */
const SYNC_STALE_MINUTES = 45;

/** Backups run nightly, so a day and a half means one was skipped. */
const BACKUP_STALE_HOURS = 36;

/**
 * How long a written piece may sit unannounced before that is a fault.
 *
 * Announcing happens on the sync, one column and one opinion per run, so six
 * hours is twenty-four chances to post. Anything still waiting after that is not
 * a backlog draining, it is a pipeline that is not running.
 *
 * This exists because it went wrong for five days in the quietest possible way.
 * `DISCORD_NEWS_WEBHOOK` was set locally and never added to production, so the
 * site wrote every column and every opinion piece, queued them all, and posted
 * none. Nothing failed. `announceColumn` returned false, the row kept its null
 * `posted_at`, the next sync tried again, and the only symptom was somebody
 * eventually noticing that the write-ups had stopped appearing in Discord.
 */
const ANNOUNCE_STALE_HOURS = 6;

export type Health = {
  ok: boolean;
  sync: {
    /** When any server last reached the ingest, news or not. */
    lastAt: string | null;
    minutesAgo: number | null;
    stale: boolean;
    /** Servers that have gone quiet, named, with how long ago each was heard. */
    quiet: string[];
    /**
     * When a row was last actually written, which is not the same thing.
     *
     * Kept because it is genuinely interesting — hours here with a fresh
     * `lastAt` means the servers are talking and nothing is being played — and
     * because it is what this check used to read, so a reader comparing the two
     * can see why it was wrong.
     */
    lastWriteAt: string | null;
  };
  backup: {
    lastAt: string | null;
    hoursAgo: number | null;
    stale: boolean;
  };
  /**
   * Whether what has been written is reaching Discord.
   *
   * `configured` is a boolean about the environment and carries no part of the
   * webhook, which is the only thing here that could not go in a public
   * response.
   */
  announce: {
    configured: boolean;
    pending: number;
    oldestPendingHours: number | null;
    stale: boolean;
  };
  archive: {
    matches: number;
    nights: number;
  };
  /**
   * The deathmatch archive contradicting itself, surfaced here because this is
   * the one endpoint `vet-live` polls without secrets. `npm run vet:dm` is the
   * same pair of questions by hand, with the rows named.
   */
  dm: {
    /** Players with kills or deaths but zero seconds — the ranking column failing. */
    untimedPlayers: number;
    /** Sub-30-second rounds carrying stats — the phantom-round shape. */
    phantomRounds: number;
    broken: boolean;
  };
};

export async function getHealth(): Promise<Health> {
  // counts-everything: this answers "is data arriving", not "what does the
  // archive say happened". A cancelled match is data arriving.
  const [row] = await db
    .select({
      lastIngest: sql<Date | null>`max(${matches.ingestedAt})`,
      matchCount: sql<number>`count(*)::int`,
      nightCount: sql<number>`count(distinct ${matches.archiveDay})::int`,
    })
    .from(matches);

  const lastIngest = row?.lastIngest ? new Date(row.lastIngest) : null;

  /*
   * When each server last reached us, which is a different question from when
   * a row was last written and had been standing in for it.
   *
   * Unchanged days stopped being rewritten on 6 August, so `max(ingested_at)`
   * only moves when something actually happened or when the six hourly
   * re-verify fires. A quiet afternoon therefore read as a dead pipeline: this
   * endpoint answered 503 for most of 7 August, and `vet-live` failed with it,
   * while the VPS was syncing every fifteen minutes and writing `unchanged` in
   * its own log each time. An alarm that is usually wrong gets ignored, and
   * then it is not an alarm.
   *
   * The pings are the answer now. `lastIngest` stays, as the honest fallback
   * for the window after this ships and before the first sync lands, and as
   * what `matchCount` and `nightCount` are read from anyway.
   */
  const pings = await listSyncPings();
  const lastArrival = pings[0]?.lastSeenAt ?? lastIngest;
  const minutesAgo = lastArrival
    ? Math.round((Date.now() - lastArrival.getTime()) / 60_000)
    : null;

  let lastBackup: Date | null = null;
  try {
    const backups = await listBackups();
    const newest = backups[0]?.at;
    if (newest) lastBackup = new Date(newest);
  } catch {
    // Storage being unreachable is itself worth reporting, but as a missing
    // backup time rather than by failing the whole check.
  }

  const hoursAgo = lastBackup
    ? Math.round((Date.now() - lastBackup.getTime()) / 3_600_000)
    : null;

  /*
   * Anything written and not yet announced, and how long the oldest has waited.
   *
   * Both tables, in one query, because the two announce independently and
   * either one stopping is the same fault. `generated_at` rather than the
   * archive day: a piece written today about last Tuesday has waited since
   * today.
   */
  const [queued] = await db
    .select({
      pending: sql<number>`count(*)::int`,
      oldest: sql<Date | null>`min(generated_at)`,
    })
    .from(
      sql`(
        select ${nightColumns.generatedAt} as generated_at
        from ${nightColumns} where ${nightColumns.postedAt} is null
        union all
        select ${opinionPieces.generatedAt} as generated_at
        from ${opinionPieces} where ${opinionPieces.postedAt} is null
      ) as unannounced`,
    );

  const oldestPending = queued?.oldest ? new Date(queued.oldest) : null;
  const oldestPendingHours = oldestPending
    ? Math.round((Date.now() - oldestPending.getTime()) / 3_600_000)
    : null;

  // Never synced and never backed up is a new deployment, not a fault. Only
  // something that has happened and then stopped counts as stale.
  /*
   * Any server that has gone quiet, not the newest of them.
   *
   * With one server these are the same answer. With two they are not, and the
   * difference is the whole point: once deathmatch syncs every fifteen minutes,
   * the match server could stop for a week while the newest ping stayed four
   * minutes old. Before any ping exists at all, this falls back to the old
   * reading so the check is never simply off.
   */
  const quiet = quietSince(pings, SYNC_STALE_MINUTES);
  const syncStale = pings.length
    ? quiet.length > 0
    : minutesAgo !== null && minutesAgo > SYNC_STALE_MINUTES;
  const backupStale = hoursAgo !== null && hoursAgo > BACKUP_STALE_HOURS;

  /*
   * Deliberately stale whether or not a webhook is configured.
   *
   * The temptation is to treat "no webhook" as a deliberate choice and stay
   * green, and that is exactly the reasoning that let this run silently for
   * five days. An unconfigured announcer with six pieces queued behind it is
   * not a configuration preference, it is the failure. `configured` says which
   * of the two it is; neither is healthy.
   */
  const announceStale =
    oldestPendingHours !== null && oldestPendingHours > ANNOUNCE_STALE_HOURS;

  /*
   * The deathmatch archive contradicting itself. Both shapes have existed:
   * the ranking column arriving empty was designed out before launch, and a
   * phantom boundary round reached production on 7 August 2026 and was swept
   * by hand. `vet-live` polls this endpoint, so either recurring turns the
   * check red within six hours with nobody watching.
   */
  // counts-everything (dm): integrity questions read every row on purpose.
  const [dmIntegrity] = await db
    .select({
      untimed: sql<number>`count(*) filter (
        where (${dmPlayers.kills} > 0 or ${dmPlayers.deaths} > 0)
          and ${dmPlayers.secondsPlayed} = 0
      )::int`,
      phantoms: sql<number>`count(distinct ${dmRounds.id}) filter (
        where ${dmRounds.endedAt} is not null
          and ${dmRounds.endedAt} - ${dmRounds.startedAt} < interval '30 seconds'
          and (${dmPlayers.kills} > 0 or ${dmPlayers.deaths} > 0)
      )::int`,
    })
    .from(dmRounds)
    .leftJoin(dmPlayers, sql`${dmPlayers.roundId} = ${dmRounds.id}`);

  const dmBroken =
    (dmIntegrity?.untimed ?? 0) > 0 || (dmIntegrity?.phantoms ?? 0) > 0;

  return {
    ok: !syncStale && !backupStale && !announceStale && !dmBroken,
    sync: {
      lastAt: lastArrival?.toISOString() ?? null,
      minutesAgo,
      stale: syncStale,
      // Named, so a failure says which machine stopped rather than that
      // something did. There will be two of them.
      quiet: quiet.map((entry) => `${entry.server} (${entry.minutesAgo}m)`),
      lastWriteAt: lastIngest?.toISOString() ?? null,
    },
    backup: { lastAt: lastBackup?.toISOString() ?? null, hoursAgo, stale: backupStale },
    announce: {
      configured: discordConfigured(),
      pending: queued?.pending ?? 0,
      oldestPendingHours,
      stale: announceStale,
    },
    archive: { matches: row?.matchCount ?? 0, nights: row?.nightCount ?? 0 },
    dm: {
      untimedPlayers: dmIntegrity?.untimed ?? 0,
      phantomRounds: dmIntegrity?.phantoms ?? 0,
      broken: dmBroken,
    },
  };
}

export { SYNC_STALE_MINUTES, BACKUP_STALE_HOURS, ANNOUNCE_STALE_HOURS };

/**
 * Newest ingest time, for the small indicator on the server page.
 *
 * counts-everything: when the archive last heard from the VPS, which is a fact
 * about the pipeline rather than about the matches in it.
 */
export async function lastSyncAt(): Promise<Date | null> {
  const [row] = await db
    .select({ ingestedAt: matches.ingestedAt })
    .from(matches)
    .orderBy(desc(matches.ingestedAt))
    .limit(1);

  return row?.ingestedAt ?? null;
}
