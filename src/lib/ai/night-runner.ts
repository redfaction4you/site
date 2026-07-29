/**
 * Decides when a night is over, writes it up, and announces it.
 *
 * Play arrives in a batch: a few matches back to back, then nothing until the
 * same time tomorrow. So a night is finished when no new match has landed for a
 * while, not at any particular clock time. Two rules cover it:
 *
 *   - Any day before today, in the archive's own timezone, is definitely over.
 *   - Today is over once the last match ended more than QUIET_MINUTES ago.
 *
 * If people come back and play more on the same day, the stored match count no
 * longer matches and the column is rewritten rather than left describing half
 * an evening.
 */
import { desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { matches, nightColumns } from "@/lib/db/schema";
import { ARCHIVE_TIME_ZONE, calendarDay } from "@/lib/matches/sanitize";
import { activeModel, configuredProvider } from "./generate";
import { buildNightFacts, writeNightColumn } from "./night-column";
import { announceColumn } from "./discord";

/** How long after the last match before a night counts as finished. */
const QUIET_MINUTES = 75;

/** Nights considered per run. A backlog fills in over successive syncs. */
const MAX_PER_RUN = 2;

type Candidate = { archiveDay: string; matchCount: number; lastEnd: Date | null };

async function findFinishedNights(): Promise<Candidate[]> {
  const rows = await db
    .select({
      archiveDay: matches.archiveDay,
      matchCount: sql<number>`count(*)::int`,
      lastEnd: sql<Date | null>`max(coalesce(${matches.endedAt}, ${matches.startedAt}))`,
    })
    .from(matches)
    .where(eq(matches.status, "final"))
    .groupBy(matches.archiveDay)
    .orderBy(desc(matches.archiveDay))
    .limit(30);

  const today = calendarDay(new Date(), ARCHIVE_TIME_ZONE);
  const quietBefore = Date.now() - QUIET_MINUTES * 60_000;

  return rows.filter((row) => {
    if (row.matchCount === 0) return false;
    if (row.archiveDay < today) return true;
    // Today: only once things have gone quiet.
    const last = row.lastEnd ? new Date(row.lastEnd).getTime() : 0;
    return last > 0 && last < quietBefore;
  });
}

export async function backfillColumns(): Promise<number> {
  if (!configuredProvider()) return 0;

  const finished = await findFinishedNights();
  if (finished.length === 0) return 0;

  const existing = await db
    .select({
      archiveDay: nightColumns.archiveDay,
      matchCount: nightColumns.matchCount,
    })
    .from(nightColumns);

  const written = new Map(existing.map((row) => [row.archiveDay, row.matchCount]));

  // Nights with no column, or whose match count has grown since it was written.
  const pending = finished
    .filter((night) => written.get(night.archiveDay) !== night.matchCount)
    .slice(0, MAX_PER_RUN);

  const model = activeModel();
  let count = 0;

  for (const night of pending) {
    try {
      const facts = await buildNightFacts(night.archiveDay);
      if (!facts) continue;

      const column = await writeNightColumn(facts);
      if (!column) continue;

      await db
        .insert(nightColumns)
        .values({
          archiveDay: night.archiveDay,
          headline: column.headline,
          body: column.body,
          matchCount: facts.matchCount,
          model,
          generatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: nightColumns.archiveDay,
          set: {
            headline: column.headline,
            body: column.body,
            matchCount: facts.matchCount,
            model,
            generatedAt: new Date(),
            // A rewritten column is worth announcing again only if it was never
            // announced. Reposting an updated piece would spam the channel.
          },
        });

      count++;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[ai] column failed for ${night.archiveDay}: ${reason}`);
    }
  }

  return count;
}

/**
 * Posts any column that has not been announced yet.
 *
 * Separate from writing so a Discord outage cannot cost us the column, and so
 * an unannounced column is retried on the next sync rather than lost.
 */
export async function announcePendingColumns(): Promise<number> {
  const pending = await db
    .select({
      archiveDay: nightColumns.archiveDay,
      headline: nightColumns.headline,
      body: nightColumns.body,
      matchCount: nightColumns.matchCount,
    })
    .from(nightColumns)
    .where(isNull(nightColumns.postedAt))
    .orderBy(desc(nightColumns.archiveDay))
    .limit(3);

  let posted = 0;

  for (const column of pending) {
    const ok = await announceColumn(column);
    if (!ok) continue;

    await db
      .update(nightColumns)
      .set({ postedAt: new Date() })
      .where(eq(nightColumns.archiveDay, column.archiveDay));

    posted++;
  }

  return posted;
}

/** Guard used by the ingest route so a missing table cannot break a sync. */
export async function runNightJobs(): Promise<{ columns: number; posted: number }> {
  let columns = 0;
  let posted = 0;

  try {
    columns = await backfillColumns();
  } catch (error) {
    console.warn("[ai] column backfill threw:", error);
  }

  try {
    posted = await announcePendingColumns();
  } catch (error) {
    console.warn("[ai] column announce threw:", error);
  }

  return { columns, posted };
}

/** Re-exported so callers do not need to know where the constant lives. */
export { QUIET_MINUTES };
