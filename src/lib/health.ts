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
import { matches } from "@/lib/db/schema";
import { listBackups } from "@/lib/backup";

/**
 * The VPS syncs every fifteen minutes. Three missed in a row is a problem
 * rather than a blip, and short enough to catch the same evening.
 */
const SYNC_STALE_MINUTES = 45;

/** Backups run nightly, so a day and a half means one was skipped. */
const BACKUP_STALE_HOURS = 36;

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
  archive: {
    matches: number;
    nights: number;
  };
};

export async function getHealth(): Promise<Health> {
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

  // Never synced and never backed up is a new deployment, not a fault. Only
  // something that has happened and then stopped counts as stale.
  const syncStale = minutesAgo !== null && minutesAgo > SYNC_STALE_MINUTES;
  const backupStale = hoursAgo !== null && hoursAgo > BACKUP_STALE_HOURS;

  return {
    ok: !syncStale && !backupStale,
    sync: { lastAt: lastIngest?.toISOString() ?? null, minutesAgo, stale: syncStale },
    backup: { lastAt: lastBackup?.toISOString() ?? null, hoursAgo, stale: backupStale },
    archive: { matches: row?.matchCount ?? 0, nights: row?.nightCount ?? 0 },
  };
}

export { SYNC_STALE_MINUTES, BACKUP_STALE_HOURS };

/** Newest ingest time, for the small indicator on the server page. */
export async function lastSyncAt(): Promise<Date | null> {
  const [row] = await db
    .select({ ingestedAt: matches.ingestedAt })
    .from(matches)
    .orderBy(desc(matches.ingestedAt))
    .limit(1);

  return row?.ingestedAt ?? null;
}
