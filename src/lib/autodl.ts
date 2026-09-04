/**
 * Serving the game's autodownload lookup from our own catalogue.
 *
 * Alpine resolves a missing level by asking a base URL for a filename and then
 * fetching whatever `download_url` comes back. The base is a compiled-in
 * constant, so a client built to point here asks us instead, and from that
 * point we decide where the bytes come from. That is the whole reason this
 * exists: a file hosted by somebody else is controlled by somebody else, and an
 * author who cannot edit or withdraw their own work does not really have it.
 *
 * **Everything we do not hold is passed through to FactionFiles.** A redirected
 * client asks us for every level it is missing, including the several hundred
 * we have never heard of, so answering only for our own would break
 * autodownload for everything else and make our build worse than the stock one.
 * Falling through means the redirect can never cost a player a download, which
 * is the property that makes it safe to ship at all.
 */
import { unstable_cache } from "next/cache";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { files, items, mapMeta, screenshots } from "@/lib/db/schema";
import { publicUrl } from "@/lib/storage";
import {
  UPSTREAM_BASE,
  canAnswer,
  levelAnswer,
  levelKey,
  type LevelAnswer,
} from "@/lib/autodl-rules";

type IndexedLevel = {
  slug: string;
  kind: string;
  title: string;
  authorName: string | null;
  description: string | null;
  storageKey: string;
  sizeBytes: number;
  shotKey: string | null;
};

/**
 * Every published level we hold, keyed by the name a server would ask for.
 *
 * One query, and the matching happens here rather than in SQL on purpose. The
 * rule for reducing a filename to a comparable key lives in `autodl-rules.ts`
 * and is tested; writing a second copy of it in SQL would be the same trap this
 * archive has already been caught by twice, where a rule and its SQL twin drift
 * apart and nothing reports it. The catalogue is small enough that reading the
 * level lists whole is cheaper than being clever.
 *
 * Cached for five minutes. These endpoints are hit by game clients rather than
 * by people, so an uncached lookup would wake the database on somebody else's
 * schedule, which is exactly what the compute bill was spent on in August. Five
 * minutes is the trade: a map uploaded a moment ago is autodownloadable within
 * five, and the database sleeps in between.
 */
const levelIndex = unstable_cache(
  async (): Promise<Record<string, IndexedLevel>> => {
    const rows = await db
      .select({
        slug: items.slug,
        kind: items.kind,
        title: items.title,
        authorName: items.authorName,
        description: sql<string | null>`coalesce(${items.summary}, ${items.description})`,
        storageKey: files.storageKey,
        sizeBytes: files.sizeBytes,
        levels: mapMeta.levels,
        shotKey: sql<string | null>`(
          select ${screenshots.storageKey}
          from ${screenshots}
          where ${screenshots.itemId} = ${items.id}
          order by ${screenshots.position} asc
          limit 1
        )`,
      })
      .from(items)
      .innerJoin(files, and(eq(files.itemId, items.id), eq(files.isPrimary, true)))
      .innerJoin(mapMeta, eq(mapMeta.itemId, items.id))
      .where(eq(items.status, "published"));

    const index: Record<string, IndexedLevel> = {};
    for (const row of rows) {
      const { levels, ...rest } = row;
      for (const level of levels ?? []) {
        const key = levelKey(level.path);
        // First writer wins. Two items claiming one level name is a curation
        // problem rather than something to resolve by coin toss, and taking the
        // first at least keeps the answer stable between requests.
        if (key && !index[key]) index[key] = rest;
      }
    }
    return index;
  },
  ["autodl-level-index"],
  { revalidate: 300 },
);

/** Our answer for one level, or null when we do not hold it. */
export async function ourLevel(name: string): Promise<LevelAnswer | null> {
  const index = await levelIndex();
  const hit = index[levelKey(name)];
  if (!hit) return null;

  /*
   * Straight at the bucket, not through `/api/download/[fileId]`.
   *
   * That route counts a download and then redirects, which would be nice to
   * have here. It is not worth the risk: the client does a plain GET through
   * its own HTTP wrapper and nothing in this repo has ever tested whether that
   * wrapper follows a 302. A download that fails is a player who cannot join,
   * against a counter that was already documented as counting only what goes
   * through the site.
   */
  const downloadUrl = publicUrl(hit.storageKey);
  const candidate = { title: hit.title, sizeBytes: hit.sizeBytes, downloadUrl };
  if (!canAnswer(candidate)) return null;

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://redfaction4you.com";
  const section = hit.kind === "map" ? "maps" : `${hit.kind}s`;

  return levelAnswer({
    title: hit.title,
    author: hit.authorName,
    description: hit.description,
    sizeBytes: hit.sizeBytes,
    downloadUrl: downloadUrl!,
    imageUrl: hit.shotKey ? publicUrl(hit.shotKey) : null,
    siteUrl: `${site}/${section}/${hit.slug}`,
  });
}

/** Which of these do we hold? Same index, one lookup each. */
export async function weHold(names: string[]): Promise<boolean[]> {
  const index = await levelIndex();
  return names.map((name) => Boolean(index[levelKey(name)]));
}

/**
 * Asks FactionFiles, for anything we do not have.
 *
 * Never throws. An upstream that is slow or down must degrade to "we do not
 * have it" rather than to an error the client shows the player, because the
 * client reads a thrown parse as a failed download rather than as a miss.
 */
export async function askUpstream(path: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(`${UPSTREAM_BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch (error) {
    console.warn("[autodl] upstream unreachable:", error);
    return null;
  }
}
