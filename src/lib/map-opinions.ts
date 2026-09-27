/**
 * What players think of the maps, as the server ghost hears it.
 *
 * The owner, 27 September 2026: "maybe wisp can ask ppl thoughts on the map
 * and if ppl dislike it, keep note and add it to a remove list that we can
 * review". `/api/ghost` records an opinion whenever the model tags one; the
 * admin page shows `mapReviewList`, the most disliked maps first. Nothing is
 * removed automatically.
 */
import { desc } from "drizzle-orm";

import { db } from "@/lib/db";
import { mapOpinions } from "@/lib/db/schema";
import type { Opinion } from "@/lib/ghost/speak";

export type OpinionInput = Opinion & {
  server: string;
  filename: string;
  title: string | null;
  player: string;
  asked: boolean;
};

export async function recordOpinion(opinion: OpinionInput): Promise<void> {
  await db.insert(mapOpinions).values({
    server: opinion.server,
    filename: opinion.filename,
    title: opinion.title,
    player: opinion.player,
    verdict: opinion.verdict,
    reason: opinion.reason || null,
    asked: opinion.asked,
  });
}

export type MapReview = {
  server: string;
  filename: string;
  title: string;
  /** Distinct players, so one player saying it twice counts once. */
  likes: number;
  dislikes: number;
  mixed: number;
  /** Newest first. */
  said: { player: string; verdict: string; reason: string | null; at: Date }[];
};

/**
 * Every map anybody has an opinion on, grouped, the most disliked first: the
 * list to review. A player's latest verdict on a map is the one that counts.
 */
export async function mapReviewList(): Promise<MapReview[]> {
  const rows = await db.select().from(mapOpinions).orderBy(desc(mapOpinions.createdAt)).limit(2000);
  const maps = new Map<string, MapReview & { latest: Map<string, string> }>();
  for (const row of rows) {
    const key = `${row.server}\u0000${row.filename.toLowerCase()}`;
    const entry: MapReview & { latest: Map<string, string> } = maps.get(key) ?? {
      server: row.server,
      filename: row.filename,
      title: row.title || row.filename.replace(/\.rfl$/i, ""),
      likes: 0,
      dislikes: 0,
      mixed: 0,
      said: [],
      latest: new Map(),
    };
    if (!entry.latest.has(row.player)) entry.latest.set(row.player, row.verdict);
    entry.said.push({ player: row.player, verdict: row.verdict, reason: row.reason, at: row.createdAt });
    maps.set(key, entry);
  }
  const list = [...maps.values()].map(({ latest, ...entry }) => {
    for (const verdict of latest.values()) {
      if (verdict === "like") entry.likes += 1;
      else if (verdict === "dislike") entry.dislikes += 1;
      else entry.mixed += 1;
    }
    return entry;
  });
  return list.sort((a, b) => b.dislikes - a.dislikes || a.likes - b.likes || a.title.localeCompare(b.title));
}
