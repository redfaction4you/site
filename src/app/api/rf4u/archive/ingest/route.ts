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

import { backfillReports } from "@/lib/ai/backfill";
import { runNightJobs } from "@/lib/ai/night-runner";
import { storeDay } from "@/lib/matches/ingest";
import { nightForVetting } from "@/lib/matches/queries";
import { summarise, vetNight } from "@/lib/matches/vet";
import { sanitizeDay } from "@/lib/matches/sanitize";

export const runtime = "nodejs";

/**
 * Generous, because writing costs time.
 *
 * Storing a day takes a second or two. Generating match reports takes ten to
 * twenty seconds each, since the model spends well over a thousand tokens
 * thinking before it writes anything, and the nightly column runs after those.
 * At the old sixty second limit the reports used the whole budget and the
 * column was cut off every time, which is why nights were being archived
 * without one.
 */
export const maxDuration = 300;

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

    // Decoration, not part of the contract. It writes a few reports and leaves
    // the rest for the next sync, and it cannot fail the ingest.
    let reports = 0;
    try {
      reports = await backfillReports();
    } catch (error) {
      console.warn("[archive-ingest] report backfill threw:", error);
    }

    /*
     * Vet what just landed, before anything is written from it.
     *
     * Deliberately before the writing jobs rather than after. Everything wrong
     * that has been found on this site was found by somebody reading a finished
     * page, which catches one thing and leaves the next to luck. The archive
     * holds most facts twice over, so a disagreement between the scoreboard and
     * the event log can be reported without knowing which is right.
     *
     * Never throws and never rejects the day. A flawed record of an evening is
     * worth more than no record, and an ingest that a surprising number can break
     * is a worse problem than the number.
     */
    /*
     * Only when the day actually changed.
     *
     * Vetting re-reads the whole night and re-reports what it finds, and the
     * VPS re-sends its three most recent days every fifteen minutes whether or
     * not anything moved. So the same two `side-reshuffled` notes about 31 July
     * were being written to the log 288 times a day, a week after that night
     * finished. A check nobody can read for the noise is a check nobody reads.
     *
     * An unchanged day cannot have developed a new anomaly, because it is the
     * same rows that were vetted last time.
     */
    let vetted = result.unchanged ? "unchanged" : "not run";
    if (!result.unchanged) {
      try {
        const anomalies = vetNight(
          result.archiveDay,
          await nightForVetting(result.archiveDay),
        );
        vetted = summarise(anomalies);
        for (const anomaly of anomalies) {
          const how = anomaly.severity === "error" ? console.error : console.warn;
          how(`[vet] ${anomaly.check}: ${anomaly.detail}`);
        }
      } catch (error) {
        console.warn("[vet] threw, continuing:", error);
      }
    }

    // Writes the nightly column once a night has gone quiet, and announces any
    // column that has not been posted yet. Both already swallow their failures.
    const night = await runNightJobs();

    return Response.json({
      ok: true,
      day: result.archiveDay,
      // So the VPS sync log says which days it actually wrote rather than
      // reporting a rewrite it did not do.
      unchanged: result.unchanged,
      matches: result.matchesWritten,
      players: result.playersWritten,
      captures: result.capturesWritten,
      vetted,
      reports,
      columns: night.columns,
      opinions: night.opinions,
      images: night.images,
      announced: night.posted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Archive ingest failed";
    console.error("[archive-ingest]", message);
    return Response.json({ error: message }, { status: 400 });
  }
}
