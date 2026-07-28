/**
 * The video archive: curated links to YouTube.
 *
 * We do not host video. We store the link and the context around it, which is
 * the part that actually goes missing: who made it, what it shows, when it is
 * from, and why it is worth watching. YouTube handles the bytes.
 *
 * HOW TO ADD ONE
 * Take the ID out of the URL and paste it in below:
 *   https://www.youtube.com/watch?v=dQw4w9WgXcQ   ->  "dQw4w9WgXcQ"
 *   https://youtu.be/dQw4w9WgXcQ                  ->  "dQw4w9WgXcQ"
 * Thumbnails are fetched from YouTube automatically. No API key needed.
 *
 * This lives in code rather than the database on purpose. A curated list of a
 * few dozen links is one pull request to change and needs no upload form, no
 * moderation queue and no storage. If it grows past what is comfortable to edit
 * by hand, that is a good problem and Phase 3 can move it.
 */

export const CATEGORIES = [
  "tutorial",
  "gameplay",
  "speedrun",
  "machinima",
  "history",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  tutorial: "Tutorials",
  gameplay: "Gameplay",
  speedrun: "Speedruns",
  machinima: "Machinima",
  history: "History",
};

export const CATEGORY_BLURB: Record<Category, string> = {
  tutorial: "Level editing, modding, tooling and getting set up.",
  gameplay: "Matches, montages and people being unreasonably good at this game.",
  speedrun: "Runs of the campaign, categorised where we know the category.",
  machinima: "Films, skits and things nobody asked for but everyone enjoyed.",
  history: "Retrospectives, developer talks and how the geo-mod thing happened.",
};

export type Video = {
  /** The YouTube video ID. See the note above. */
  youtubeId: string;
  title: string;
  /** Channel or person who made it. */
  author: string;
  category: Category;
  /** Optional: one line on why it is here. */
  note?: string;
  /** Optional: four-digit year, shown as context. */
  year?: number;
};

/**
 * >>> ADD VIDEOS HERE. <<<
 *
 * Deliberately empty: every entry should be one somebody actually vouches for.
 * A seeded list of plausible-looking links would be worse than nothing, because
 * a dead embed on day one undermines the whole point of the archive.
 */
export const VIDEOS: Video[] = [];

export function thumbnailUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

export function watchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

/** Groups the archive by category, dropping categories with nothing in them. */
export function byCategory(): { category: Category; videos: Video[] }[] {
  return CATEGORIES.map((category) => ({
    category,
    videos: VIDEOS.filter((video) => video.category === category),
  })).filter((group) => group.videos.length > 0);
}
