/**
 * Runs the nightly backup.
 *
 * Called by Vercel Cron on a schedule, and callable by hand with the sync
 * secret when something needs verifying. GET rather than POST because that is
 * what Vercel Cron issues.
 *
 * Two accepted credentials, both bearer tokens:
 *   CRON_SECRET               what Vercel Cron sends
 *   RF4U_ARCHIVE_SYNC_SECRET  so a person can trigger one without a new secret
 */
import { timingSafeEqual } from "node:crypto";

import { listBackups, runBackup } from "@/lib/backup";

export const runtime = "nodejs";
export const maxDuration = 300;

const MIN_SECRET_LENGTH = 16;

function matches(supplied: string, expected: string | undefined): boolean {
  if (!expected || expected.length < MIN_SECRET_LENGTH) return false;
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function authorized(request: Request): boolean {
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!supplied) return false;

  return (
    matches(supplied, process.env.CRON_SECRET) ||
    matches(supplied, process.env.RF4U_ARCHIVE_SYNC_SECRET)
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?list=1 reports what exists without writing anything, so the backup can be
  // checked without creating one.
  if (new URL(request.url).searchParams.has("list")) {
    return Response.json({ ok: true, backups: await listBackups() });
  }

  try {
    const result = await runBackup();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backup failed";
    console.error("[backup]", message);
    // A failed backup is a real failure, not a shrug. Answering 500 means an
    // uptime check or Vercel's own cron log will show it rather than a cheerful
    // 200 hiding a night with no copy.
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
