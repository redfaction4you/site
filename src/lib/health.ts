/**
 * Is the site's own plumbing working?
 *
 * Two questions, both of which fail silently if nobody asks them: is the
 * nightly backup still being taken, and does the database answer at all.
 *
 * This used to be mostly about the match archive: whether the VPS was still
 * syncing, whether the analyst's pieces were reaching Discord, whether the
 * deathmatch rows contradicted themselves. RF4U stopped recording stats on
 * 25 September 2026 and all of that went with it. Left in, every one of those
 * checks would have turned this endpoint red within the hour for a pipeline
 * that was switched off on purpose, and an alarm that is always on is not an
 * alarm.
 */
import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { mapPacks } from "@/lib/db/schema";
import { listBackups } from "@/lib/backup";

/** Backups run nightly, so a day and a half means one was skipped. */
const BACKUP_STALE_HOURS = 36;

export type Health = {
  ok: boolean;
  backup: {
    lastAt: string | null;
    hoursAgo: number | null;
    stale: boolean;
  };
  database: {
    /** Whether a trivial read came back, as of the cached reading. */
    reachable: boolean;
    /** Rotations on record, which is what the three server pages are built from. */
    mapPacks: number;
  };
};

/**
 * The database's half of the answer, cached for up to an hour.
 *
 * Cached because this endpoint exists to be polled from outside, and Neon
 * bills for every hour the compute is kept awake: an uptime monitor on a
 * five-minute interval was one of the things that stopped the database ever
 * suspending. A real outage therefore shows up at most one cache lifetime
 * late, which is fine for something `vet-live` polls every six hours.
 *
 * The count is of `map_packs` because that is the table the server pages
 * cannot do without. A database that answers but has lost it is not healthy
 * for this site.
 */
const databaseSnapshot = unstable_cache(
  async () => {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mapPacks);
    return { mapPacks: row?.count ?? 0 };
  },
  ["health-db-snapshot-v3"],
  { revalidate: 3600 },
);

export async function getHealth(): Promise<Health> {
  let reachable = false;
  let packCount = 0;
  try {
    const snapshot = await databaseSnapshot();
    reachable = true;
    packCount = snapshot.mapPacks;
  } catch {
    // Reported as unreachable rather than thrown, so the backup half of the
    // answer still arrives and says which of the two is broken.
  }

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

  // Never backed up is a new deployment, not a fault. Only something that has
  // happened and then stopped counts as stale.
  const backupStale = hoursAgo !== null && hoursAgo > BACKUP_STALE_HOURS;

  return {
    ok: reachable && packCount > 0 && !backupStale,
    backup: { lastAt: lastBackup?.toISOString() ?? null, hoursAgo, stale: backupStale },
    database: { reachable, mapPacks: packCount },
  };
}

export { BACKUP_STALE_HOURS };
