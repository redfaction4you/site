import { listColumns, listOpinions } from "@/lib/matches/queries";
import { listFeatures } from "@/lib/ai/feature";

/**
 * Everything on this site somebody could sit and read, in one list.
 *
 * There are three kinds of writing here and they were kept in three places. A
 * match report led the front page and `/news`; opinion pieces were a rail
 * beside it, listed by headline with no sense of what they were; and features —
 * the longest pieces on the site — appeared on neither, only on the analyst's
 * own page. So the two pages a reader lands on offered one thing to read and
 * hid the rest.
 *
 * This merges them by date, newest first. The kind travels with each entry
 * rather than being implied by which column of the page it sits in, because
 * that distinction is the one that actually matters: **a report says what
 * happened, an opinion argues about it, and a feature covers one subject at
 * length.** Losing that in a single undifferentiated feed would be worse than
 * the three separate lists it replaces.
 */

export type ReadingKind = "report" | "opinion" | "feature";

export type Readable = {
  kind: ReadingKind;
  /** Stable within a list; a day can carry a report and an opinion. */
  key: string;
  href: string;
  headline: string;
  /** One line about it: a standfirst where there is one, else an opening. */
  excerpt: string | null;
  /** `YYYY-MM-DD`, for sorting and for the date shown against it. */
  day: string;
  matchCount: number | null;
  /** Who a feature is about. Empty for the other two kinds. */
  subjects: string[];
};

/** What each kind is called and how it is described, in one place. */
export const READING_KINDS: Record<ReadingKind, { label: string; blurb: string }> = {
  report: { label: "Report", blurb: "what happened that night" },
  opinion: { label: "Opinion", blurb: "an argument about it" },
  feature: { label: "Feature", blurb: "one subject at length" },
};

/**
 * The opening of a piece, for a list.
 *
 * The first paragraph rather than the first N characters, cut at a word so it
 * does not end mid-name. Prose on this site is written in paragraphs, so the
 * first one is a real opening rather than an arbitrary slice.
 */
function opening(body: string, limit = 160): string | null {
  const first = body.split(/\n{2,}/).map((p) => p.trim()).find(Boolean);
  if (!first) return null;
  if (first.length <= limit) return first;
  const cut = first.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

/**
 * Every readable thing, newest first.
 *
 * Ordered on the day alone, with the three kinds broken apart in a fixed order
 * when they land on the same one: the report first, because it is what happened,
 * then the argument about it, then anything longer. Not by the time each was
 * generated — a feature written today about a night last week belongs with that
 * night for a reader, and the generated time would scatter them.
 */
export async function listReading(): Promise<Readable[]> {
  const [columns, opinions, features] = await Promise.all([
    listColumns(),
    listOpinions(60),
    listFeatures(),
  ]);

  const entries: Readable[] = [
    ...columns.map((column) => ({
      kind: "report" as const,
      key: `report:${column.archiveDay}`,
      href: `/news/${column.archiveDay}`,
      headline: column.headline,
      excerpt: opening(column.body),
      day: column.archiveDay,
      matchCount: column.matchCount,
      subjects: [],
    })),
    ...opinions.map((piece) => ({
      kind: "opinion" as const,
      key: `opinion:${piece.archiveDay}`,
      // The night page, at the piece rather than the top of it: the report and
      // the opinion share an address, and landing on the report to read the
      // opinion is the sort of thing a reader blames on themselves.
      href: `/news/${piece.archiveDay}#opinion`,
      headline: piece.headline,
      excerpt: opening(piece.body),
      day: piece.archiveDay,
      matchCount: piece.matchCount,
      subjects: [],
    })),
    ...features.map((piece) => ({
      kind: "feature" as const,
      key: `feature:${piece.slug}`,
      href: `/analyst/features/${piece.slug}`,
      headline: piece.headline,
      excerpt: piece.standfirst?.trim() || opening(piece.body),
      day: piece.createdAt.slice(0, 10),
      matchCount: Array.isArray(piece.matchRefs) ? piece.matchRefs.length : null,
      subjects: Array.isArray(piece.subjects) ? (piece.subjects as string[]) : [],
    })),
  ];

  const order: Record<ReadingKind, number> = { report: 0, opinion: 1, feature: 2 };

  return entries.sort(
    (a, b) => b.day.localeCompare(a.day) || order[a.kind] - order[b.kind],
  );
}
