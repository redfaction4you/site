import { askUpstream, ourLevel } from "@/lib/autodl";
import { isLookupName } from "@/lib/autodl-rules";

/**
 * The game's level lookup, answered by us.
 *
 * The path is `/autodl/v3/find.php` because that is what Alpine builds:
 * `std::format("{}/v3/find.php?rfl={}", level_download_base_url, name)` in
 * `game_patch/multi/faction_files.cpp`. Mirroring the shape means pointing a
 * client here is one constant, `level_download_base_url`, and nothing else. The
 * `.php` is not pretending to be PHP; it is the endpoint we are standing in for.
 *
 * **Unauthenticated on purpose.** A game client has no credentials and cannot be
 * given any. Everything served here is already public: it is the catalogue, and
 * the bytes it points at sit in a public bucket.
 *
 * Anything we do not hold is passed through to FactionFiles verbatim, so a
 * client built to ask us is never worse off than one asking them.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("rfl") ?? "";

  /*
   * A refusal is `found: false`, not a 400.
   *
   * `parse_level_info` reads the body and treats a missing `found` as an
   * exception rather than as a miss, and an exception aborts the download with
   * an error the player sees. Every path out of here has to be a body the
   * client can parse.
   */
  if (!isLookupName(name)) {
    return Response.json({ found: false }, { headers: { "cache-control": "no-store" } });
  }

  const mine = await ourLevel(name);
  if (mine) {
    return Response.json(
      { found: true, file: mine },
      {
        headers: {
          // Short, not none: a level's answer changes when somebody re-uploads
          // it, and a client that cached the old size would refuse the new file.
          "cache-control": "public, max-age=60",
        },
      },
    );
  }

  const upstream = await askUpstream(
    `/v3/find.php?rfl=${encodeURIComponent(name)}`,
  );

  if (!upstream || !upstream.ok) {
    return Response.json({ found: false }, { headers: { "cache-control": "no-store" } });
  }

  /*
   * Passed through as text rather than reparsed.
   *
   * Their answer carries fields we do not model, including the Alpine waypoint
   * block, and re-encoding it through a type of our own would quietly drop
   * whatever we had not thought of. The client is the one that has to
   * understand this, not us.
   */
  const body = await upstream.text();
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "public, max-age=60",
    },
  });
}
