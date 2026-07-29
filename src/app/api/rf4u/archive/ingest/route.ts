/**
 * Where the dedicated server posts a night's match results.
 *
 * The VPS holds the private archive; this endpoint takes a day's export,
 * strips everything that is not public, and stores the rest. The contract is
 * unchanged from the handoff package, so the existing sync script only needs
 * its URL pointing here, the difference is that the sanitised result lands in
 * Postgres rather than a per-day document.
 *
 * Authentication is a shared secret, compared in constant time. That is
 * appropriate because the caller is a scheduled task on a machine we control,
 * not a person: there is no session to establish and no user to identify.
 */
import { timingSafeEqual } from "node:crypto";

import { storeDay } from "@/lib/matches/ingest";
import { sanitizeDay } from "@/lib/matches/sanitize";

export const runtime = "nodejs";
export const maxDuration = 60;

/** A night of matches with full kill logs is large, but not this large. */
const MAX_BODY_BYTES = 4_000_000;

/** Short secrets are a configuration error, not something to compare against. */
const MIN_SECRET_LENGTH = 32;

function authorized(request: Request): boolean {
  const expected = process.env.RF4U_ARCHIVE_SYNC_SECRET ?? "";
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  if (expected.length < MIN_SECRET_LENGTH) return false;
  // timingSafeEqual throws on length mismatch, so this check has to come first.
  // It leaks the secret's length, which is not worth defending against.
  if (supplied.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return Response.json({ error: "Archive payload is too large" }, { status: 413 });
  }

  try {
    const body = await request.text();
    // Content-Length can lie or be absent; check what actually arrived.
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
      return Response.json({ error: "Archive payload is too large" }, { status: 413 });
    }

    const day = sanitizeDay(JSON.parse(body));
    const result = await storeDay(day);

    return Response.json({
      ok: true,
      day: result.archiveDay,
      matches: result.matchesWritten,
      players: result.playersWritten,
      captures: result.capturesWritten,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Archive ingest failed";
    console.error("[archive-ingest]", message);
    return Response.json({ error: message }, { status: 400 });
  }
}
