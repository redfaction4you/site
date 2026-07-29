/**
 * Fills in missing match reports.
 *
 * Called after an ingest. Two constraints shape it:
 *
 *   - Ingest must not get slow. The VPS syncs every fifteen minutes and its
 *     request has a time limit, so this writes at most a few reports per run
 *     and leaves the rest for the next one. A backfill of a hundred matches
 *     spreads itself over a few hours rather than timing out once.
 *   - Ingest must not fail because of this. Every failure is swallowed and
 *     logged. The report stays null and gets retried on the next sync.
 */
import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { matches } from "@/lib/db/schema";
import { getMatch } from "@/lib/matches/queries";
import { activeModel, configuredProvider } from "./generate";
import { writeMatchReport } from "./match-report";

/** Per ingest request. Keeps the worst case well inside the route's budget. */
const MAX_PER_RUN = 3;

export async function backfillReports(): Promise<number> {
  if (!configuredProvider()) return 0;

  const pending = await db
    .select({
      archiveDay: matches.archiveDay,
      sourceMatchId: matches.sourceMatchId,
      id: matches.id,
    })
    .from(matches)
    // Only finished matches: a report on a game still being played would be
    // wrong within the minute, and would never be rewritten.
    .where(and(isNull(matches.report), eq(matches.status, "final")))
    .orderBy(desc(matches.startedAt))
    .limit(MAX_PER_RUN);

  const model = activeModel();
  let written = 0;

  for (const row of pending) {
    try {
      const match = await getMatch(row.archiveDay, row.sourceMatchId);
      if (!match) continue;

      const report = await writeMatchReport(match);
      if (!report) continue;

      await db
        .update(matches)
        .set({ report, reportModel: model, reportAt: new Date() })
        .where(eq(matches.id, row.id));

      written++;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[ai] report failed for match ${row.id}: ${reason}`);
    }
  }

  return written;
}
