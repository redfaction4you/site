import { after } from "next/server";

import { getDownloadable, recordDownload } from "@/lib/catalogue";
import { publicUrl } from "@/lib/storage";

/**
 * The download link, and the only place a download is counted.
 *
 * The bucket is public, so this route buys nothing in access control and is not
 * pretending to. What it buys is the count. Until it existed `recordDownload`
 * had no callers at all: the detail page linked straight at the R2 URL, so
 * `items.download_count` sat at zero for every row and could never move, which
 * made "most downloaded" an order over a column of zeroes. A sort nobody can
 * trust is worse than no sort, because it looks like an answer.
 *
 * **What the number measures is downloads that went through the site, and it
 * does not claim to be a complete tally.** The object stays fetchable by
 * anybody who knows its key, and by anybody who saw the redirect land, and that
 * is a deliberate consequence of permanent public URLs rather than a hole to
 * plug. Signed or expiring URLs would close it and break the second commitment
 * in the build plan, that a link pasted in Discord today still works in ten
 * years. So the figure undercounts, always, by an unknowable amount. Say that
 * wherever it is shown; being honest about what a number measures is a standing
 * rule here and this one needs it more than most.
 *
 * `robots.ts` already disallows `/api/`, so no crawler walks these and inflates
 * the count on the archive's behalf.
 *
 * **The last segment comes in two forms and both are permanent.**
 *
 *   /api/download/12                                    the file's `ref`
 *   /api/download/7c9f2b40-1d6e-4a55-b0c8-3e51a2d4f8aa  the file's id
 *
 * Every link the site builds today uses the number. It is what the owner asked
 * for and it matches what Red Faction players already have: FactionFiles
 * numbers its pages, and Alpine's own `af://download/<id>` handler takes an
 * integer. A UUID is none of those things. It cannot be read out over voice
 * chat, typed off a screenshot or pasted into a message without a scrollbar.
 *
 * The UUID form stays anyway, and not as a deprecation with a date on it. Links
 * built before the numbers existed are already out there on the one published
 * map, and this site's founding promise is that a link that works keeps
 * working. That promise is why `/models` and `/weapons` are permanent
 * redirects rather than 404s, and it does not lapse because the older shape is
 * ugly. `getDownloadable` takes either and says so in its own comment; the
 * rule that tells them apart is `readDownloadRef`, which is pure and tested.
 *
 * Nothing else about this route changes with the shape of the segment. The
 * redirect, the counting and the 404 are the same either way, which is the
 * point: two spellings of one address, not two behaviours.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ fileId: string }> };

function plain(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function GET(_request: Request, { params }: Props) {
  const { fileId } = await params;

  /*
   * One 404 for four cases, on purpose: a segment that is neither form, a
   * number or an id that never existed, an item still in draft, and an item
   * that has been pulled. `getDownloadable` filters on published status
   * itself, so a link that leaked before publication or was kept after a
   * takedown answers exactly like a typo. Distinguishing them would tell a
   * stranger holding an old link that the row is still there, which is the one
   * thing a pulled item must not say.
   */
  const file = await getDownloadable(fileId);
  if (!file) return plain("No such file.", 404);

  /*
   * Storage unconfigured is a 503 and never a redirect. `publicUrl` returns
   * null when `NEXT_PUBLIC_R2_PUBLIC_BASE` is unset, which happens on a local
   * run without it, and redirecting to a URL assembled from a missing base
   * would send somebody to a dead address with a 302 in front of it. The
   * failure belongs here, in words, rather than in the browser's error page.
   */
  const href = publicUrl(file.storageKey);
  if (!href) {
    return plain(
      "File storage is not configured on this deployment, so there is nothing to download yet.",
      503,
    );
  }

  /*
   * Counted after the response, never before it. `after` runs its callback once
   * the redirect has been handed over, so a slow or unreachable database costs
   * the reader nothing and cannot fail the download. `recordDownload` swallows
   * its own errors as well, which is belt and braces on the same idea: the file
   * is the point and the counter is a nice-to-have.
   */
  after(() => recordDownload(file.itemId));

  /*
   * 302, and it must stay 302.
   *
   * A 301 is the tempting "optimisation" here and it would quietly end the
   * counting. Browsers cache a permanent redirect and then follow it without
   * asking again, so every download of that file after the first would go
   * straight to R2 and never reach this route: the counter would record each
   * person once, forever, and look plausible while doing it. `no-store` says
   * the same thing to anything that caches by header rather than by status.
   */
  return new Response(null, {
    status: 302,
    headers: { location: href, "cache-control": "no-store" },
  });
}
