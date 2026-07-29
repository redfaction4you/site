/**
 * The public read API for the match archive.
 *
 *   GET /api/rf4u/archive              index of nights
 *   GET /api/rf4u/archive?date=YYYY-MM-DD   one night's results
 *
 * Open on purpose. The site's third commitment is that nothing it holds should
 * be locked up, and publishing what we hold is also the mitigation for becoming
 * a single point of failure for this history: anyone can mirror it.
 *
 * Everything here was sanitised at ingest. The queries behind it name their
 * columns and none of them name `match_players.identity_key`, this is the
 * endpoint where getting that wrong would be public and permanent.
 */
import { getDayDocument, listDays, latestDay } from "@/lib/matches/queries";
import { ARCHIVE_TIME_ZONE, isValidDay } from "@/lib/matches/sanitize";

export const runtime = "nodejs";

/**
 * Match nights do not change once played, so this can be cached hard. Sixty
 * seconds keeps a freshly synced night from feeling stale without letting the
 * database be hit on every request.
 */
const CACHE = "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date");

  if (date !== null) {
    if (!isValidDay(date)) {
      return Response.json(
        { ok: false, error: "date must be YYYY-MM-DD" },
        { status: 400 },
      );
    }

    const document = await getDayDocument(date);
    if (!document) {
      return Response.json(
        { ok: false, error: "No matches recorded for that day" },
        { status: 404 },
      );
    }

    return Response.json(document, { headers: { "cache-control": CACHE } });
  }

  const [days, latest] = await Promise.all([listDays(), latestDay()]);

  return Response.json(
    {
      ok: true,
      timeZone: ARCHIVE_TIME_ZONE,
      days: days.map((day) => day.archiveDay),
      latest,
    },
    { headers: { "cache-control": CACHE } },
  );
}
