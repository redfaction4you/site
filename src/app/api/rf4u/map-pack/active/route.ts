import { activeMapPackForServer } from "@/lib/map-packs";

/**
 * The active map pack, for the VPS to apply.
 *
 * The site is where packs are defined and the VPS is where they take effect,
 * and the arrow between them points this way because Vercel cannot reach that
 * machine. The applier polls this, compares `fingerprint` with the one it last
 * wrote, and rewrites the server's level list, name and welcome message when
 * they differ. Everything else in that config — the rules, the votes, the rcon
 * password — it never touches.
 *
 * Authenticated with the same secret as the archive ingest. Nothing here is
 * private, but an unauthenticated endpoint that drives a server restart is a
 * lever left where anybody can pull it: the applier reads this and then stops
 * a game server.
 *
 * `null` means "leave the server as it is", which covers three cases that
 * should all behave the same way: no packs defined, none switched on, and a
 * pack whose maps are all typos. The applier does nothing rather than
 * emptying a rotation.
 */
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.RF4U_ARCHIVE_SYNC_SECRET ?? "";
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return expected.length > 0 && supplied === expected;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pack = await activeMapPackForServer();
    return Response.json(
      { pack },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
