/**
 * Where the deathmatch server posts a day of rounds.
 *
 * Separate from `/api/rf4u/archive/ingest` rather than a flag on it, which is
 * the same decision the tables took one level down. The two documents look
 * alike and mean different things, and the endpoint a sync is pointed at is the
 * one piece of routing a person on the VPS types by hand. Two URLs can be
 * checked at a glance; a mode flag inside a payload cannot.
 *
 * Both endpoints check the game anyway and refuse the other one — see
 * `matches/modes.ts` — because the URL is exactly the thing that gets copied
 * from the wrong `.env`.
 *
 * The same shared secret as the match ingest. It authenticates the machine, not
 * a person, and there is one machine.
 */
import { timingSafeEqual } from "node:crypto";

import { storeDmDay } from "@/lib/dm/ingest";
import { sanitizeDmDay } from "@/lib/dm/sanitize";
import { recordSyncPing } from "@/lib/sync-ping";

export const runtime = "nodejs";

/**
 * Short, because nothing slow happens here.
 *
 * The match ingest needs five minutes because it writes match reports and a
 * nightly column with a language model. Deathmatch generates no writing at all:
 * Stanley Mesh's subject is who plays with whom and a free-for-all has no
 * sides. This is a sanitize and a handful of upserts.
 */
export const maxDuration = 60;

/** A day of rounds is smaller than a night of matches: no kill logs. */
const MAX_BODY_BYTES = 4_000_000;

/** Short secrets are a configuration error, not something to compare against. */
const MIN_SECRET_LENGTH = 32;

function authorized(request: Request): boolean {
  const expected = process.env.RF4U_ARCHIVE_SYNC_SECRET ?? "";
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  if (expected.length < MIN_SECRET_LENGTH) return false;
  // timingSafeEqual throws on length mismatch, so this check has to come first.
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

    const day = sanitizeDmDay(JSON.parse(body));

    // Whether or not there is anything to write, so health can tell a quiet
    // deathmatch server from one that has stopped. See `sync-ping.ts`.
    await recordSyncPing(day.server);

    const result = await storeDmDay(day);

    return Response.json({
      ok: true,
      day: result.archiveDay,
      server: result.server,
      unchanged: result.unchanged,
      rounds: result.roundsWritten,
      players: result.playersWritten,
      /*
       * In the response so the sync log answers it without anybody asking.
       *
       * `seconds_played` is not in the documented contract. If this is 0 on
       * every real sync then the broadcaster does not record time on the
       * server, and the DM record has to be built without it rather than
       * shipping a column of dashes, which this archive has done twice.
       */
      playersTimed: result.playersTimed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Archive ingest failed";
    console.error("[dm-ingest]", message);
    return Response.json({ error: message }, { status: 400 });
  }
}
