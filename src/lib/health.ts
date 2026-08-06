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
import { matches, nightColumns, opinionPieces } from "@/lib/db/schema";
import { listBackups } from "@/lib/backup";
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
    lastAt: string | null;
    minutesAgo: number | null;
    stale: boolean;
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
  const minutesAgo = lastIngest
    ? Math.round((Date.now() - lastIngest.getTime()) / 60_000)
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
  const syncStale = minutesAgo !== null && minutesAgo > SYNC_STALE_MINUTES;
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

  return {
    ok: !syncStale && !backupStale && !announceStale,
    sync: { lastAt: lastIngest?.toISOString() ?? null, minutesAgo, stale: syncStale },
    backup: { lastAt: lastBackup?.toISOString() ?? null, hoursAgo, stale: backupStale },
    announce: {
      configured: discordConfigured(),
      pending: queued?.pending ?? 0,
      oldestPendingHours,
      stale: announceStale,
    },
    archive: { matches: row?.matchCount ?? 0, nights: row?.nightCount ?? 0 },
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
