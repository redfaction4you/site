/**
 * Runs the writing jobs on demand, without waiting for a sync.
 *
 * The reports and the nightly column normally happen as a side effect of the
 * VPS pushing a day. That is fine in steady state but awkward the moment
 * something needs re-running: after a prompt change, or when a column failed
 * and the next sync is fifteen minutes away.
 *
 * Reuses the sync secret rather than introducing another one. Same trust
 * boundary, same rotation, one less thing to keep track of.
 *
 *   curl -X POST https://redfaction4you.com/api/rf4u/archive/rebuild \
 *        -H "Authorization: Bearer $RF4U_ARCHIVE_SYNC_SECRET"
 *
 * Writes nothing that a sync would not have written eventually. Safe to call
 * repeatedly: both jobs skip work that is already done.
 */
import { timingSafeEqual } from "node:crypto";

import { backfillReports } from "@/lib/ai/backfill";
import { runNightJobs } from "@/lib/ai/night-runner";

export const runtime = "nodejs";
export const maxDuration = 300;

const MIN_SECRET_LENGTH = 32;

function authorized(request: Request): boolean {
  const expected = process.env.RF4U_ARCHIVE_SYNC_SECRET ?? "";
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  if (expected.length < MIN_SECRET_LENGTH) return false;
  if (supplied.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let reports = 0;
  try {
    reports = await backfillReports();
  } catch (error) {
    console.warn("[rebuild] report backfill threw:", error);
  }

  const night = await runNightJobs();

  return Response.json({
    ok: true,
    reports,
    columns: night.columns,
    images: night.images,
    announced: night.posted,
    profiles: night.profiles,
  });
}
