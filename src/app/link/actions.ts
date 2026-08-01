"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { matchVideos } from "@/lib/db/schema";
import { parseStartsAt, parseYouTubeId } from "@/lib/match-videos";
import { isValidDay } from "@/lib/matches/sanitize";

/**
 * Adding and removing recordings, from the page anybody can reach.
 *
 * There is no key and no sign-in, which is a decision rather than an oversight:
 * the worst anybody can do here is attach a real video to the wrong match, and
 * every entry has a remove button beside it, so a mistake is one click to undo
 * rather than a commit and a deploy. What is guarded instead is the shape of
 * what gets stored, because that is what a page cannot fix afterwards.
 */

/** What YouTube says about a video, as far as it will say without a key. */
export type VideoLookup = {
  youtubeId: string;
  title: string | null;
  authorName: string | null;
  authorUrl: string | null;
};

/**
 * Title and channel, from oEmbed.
 *
 * No API key and no quota, which is the whole reason it is oEmbed rather than
 * the Data API. It also doubles as the check that the id is a real video: a
 * typo that still parses comes back 404 here rather than becoming a dead embed
 * on a match page.
 */
export async function lookupVideo(youtubeId: string): Promise<VideoLookup | null> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${youtubeId}`,
      )}&format=json`,
      { signal: AbortSignal.timeout(6000), cache: "no-store" },
    );
    if (!response.ok) return null;

    const body = (await response.json()) as Record<string, unknown>;
    return {
      youtubeId,
      title: typeof body.title === "string" ? body.title : null,
      authorName: typeof body.author_name === "string" ? body.author_name : null,
      authorUrl: typeof body.author_url === "string" ? body.author_url : null,
    };
  } catch {
    // YouTube being slow or unreachable should not stop somebody adding a link.
    // The page carries on with no title rather than refusing the paste.
    return null;
  }
}

/** Step one: work out what was pasted and hand it back to the page. */
export async function identify(formData: FormData): Promise<void> {
  const pasted = String(formData.get("url") ?? "");
  const youtubeId = parseYouTubeId(pasted);

  if (!youtubeId) {
    redirect(`/link?bad=${encodeURIComponent(pasted.slice(0, 120))}`);
  }

  redirect(`/link?v=${youtubeId}`);
}

/** Step two: which night, which matches, and how far in. */
export async function attach(formData: FormData): Promise<void> {
  const youtubeId = parseYouTubeId(String(formData.get("youtubeId") ?? ""));
  const archiveDay = String(formData.get("archiveDay") ?? "");
  const matchIds = formData
    .getAll("matchId")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (!youtubeId || !isValidDay(archiveDay) || matchIds.length === 0) {
    redirect(`/link?v=${youtubeId ?? ""}&day=${archiveDay}&problem=1`);
  }

  const lookup = await lookupVideo(youtubeId);
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;

  for (const sourceMatchId of matchIds) {
    const startsAt = parseStartsAt(String(formData.get(`startsAt-${sourceMatchId}`) ?? ""));

    await db
      .insert(matchVideos)
      .values({
        // Deterministic, so the same video on the same match is the same row
        // however many times somebody presses the button.
        id: `${youtubeId}-${archiveDay}-${sourceMatchId}`,
        youtubeId,
        archiveDay,
        sourceMatchId,
        startsAt,
        title: lookup?.title ?? null,
        authorName: lookup?.authorName ?? null,
        authorUrl: lookup?.authorUrl ?? null,
        note,
      })
      .onConflictDoNothing();
  }

  /*
   * Every page that can show a recording, not just this one. A link added here
   * is invisible until the night, match and news pages are rebuilt, and
   * somebody who adds a video then goes to look at the match would otherwise
   * think it had not saved.
   */
  revalidatePath("/link");
  revalidatePath("/matches", "layout");
  revalidatePath("/news", "layout");

  redirect(`/link?added=${matchIds.length}`);
}

/** The undo, which is what makes an open page safe enough. */
export async function remove(formData: FormData): Promise<void> {
  const youtubeId = String(formData.get("youtubeId") ?? "");
  const archiveDay = String(formData.get("archiveDay") ?? "");
  const sourceMatchId = Number(formData.get("sourceMatchId") ?? 0);

  if (youtubeId && isValidDay(archiveDay) && Number.isInteger(sourceMatchId)) {
    await db
      .delete(matchVideos)
      .where(
        and(
          eq(matchVideos.youtubeId, youtubeId),
          eq(matchVideos.archiveDay, archiveDay),
          eq(matchVideos.sourceMatchId, sourceMatchId),
        ),
      );
  }

  revalidatePath("/link");
  revalidatePath("/matches", "layout");
  revalidatePath("/news", "layout");

  redirect("/link?removed=1");
}
