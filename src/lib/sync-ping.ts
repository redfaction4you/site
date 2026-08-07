/**
 * Whether the servers are still talking to us, asked directly.
 *
 * See `syncPings` in the schema for why this is separate from anything the
 * ingest writes: a day that has not changed is not rewritten, so "when did we
 * last write" stopped being an answer to "is the sync alive" on 6 August, and
 * nobody noticed until health had been answering 503 for a day with the VPS
 * running perfectly.
 */
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { syncPings } from "@/lib/db/schema";
import type { SyncPing } from "@/lib/sync-freshness";

/**
 * One update per sync, recorded whether or not the payload had anything new.
 *
 * Never throws. This is a health signal, and a health signal that can fail an
 * ingest is a liability: the archive arriving matters more than knowing when it
 * arrived.
 */
export async function recordSyncPing(server: string): Promise<void> {
  try {
    await db
      .insert(syncPings)
      .values({ server, lastSeenAt: new Date() })
      .onConflictDoUpdate({
        target: syncPings.server,
        set: { lastSeenAt: new Date() },
      });
  } catch (error) {
    console.warn("[sync-ping] could not record arrival:", error);
  }
}

export async function listSyncPings(): Promise<SyncPing[]> {
  const rows = await db
    .select({ server: syncPings.server, lastSeenAt: syncPings.lastSeenAt })
    .from(syncPings)
    .orderBy(sql`${syncPings.lastSeenAt} desc`);

  return rows.map((row) => ({ server: row.server, lastSeenAt: new Date(row.lastSeenAt) }));
}

/** The rule itself lives in `sync-freshness.ts`, where a test can load it. */
export { quietSince } from "@/lib/sync-freshness";
