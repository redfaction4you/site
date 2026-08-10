/**
 * How much of a piece is scoreboard.
 *
 * A feature is supposed to argue about something. The first ones did not: asked
 * for a piece about two players finally sharing a side after twenty-four
 * matches as opponents, the writer produced two paragraphs that read out both
 * scoreboards line by line — frags, deaths, pickups, hold times, for every
 * player on both teams — and lost the story it had been given.
 *
 * That was not the model being careless. The instructions told it to "walk
 * through the matches, name the maps, the scores, who did what in each one",
 * and the fact sheet handed it every number it could want. It did as it was
 * asked. The prompt and the sheet are fixed separately; this is the check that
 * says whether the result took.
 *
 * **Numbers are not the problem, unsupported density is.** "Medeo held the flag
 * for 133 seconds, three times his own average" is exactly what a feature is
 * for. A paragraph carrying thirty figures is a table with sentences around it,
 * and the match page it came from is one click away and does the job better.
 *
 * Deliberately free of imports so `node --test` can load it directly, the same
 * arrangement `pairings.ts`, `names.ts` and `accuracy.ts` use.
 */

/**
 * Every number a reader would see as a figure.
 *
 * Clock times (`6:40`) and scorelines (`2-0`) count as one apiece rather than
 * two, because that is how they read. Ordinal-ish words are not counted at all:
 * "twice his usual" is the writing working properly.
 */
export function countFigures(text: string): number {
  if (!text) return 0;

  const collapsed = text
    // A clock or a scoreline is one figure, not two.
    .replace(/\d+\s*[:–—-]\s*\d+/g, " ⟦one⟧ ")
    // Percentages and decimals likewise.
    .replace(/\d+(?:\.\d+)?%/g, " ⟦one⟧ ")
    .replace(/\d+\.\d+/g, " ⟦one⟧ ");

  const placeholders = (collapsed.match(/⟦one⟧/g) ?? []).length;
  const bare = (collapsed.match(/\b\d+\b/g) ?? []).length;
  return placeholders + bare;
}

export type DensityReport = {
  /** Figures in the whole piece. */
  total: number;
  /** The worst single paragraph, which is where a scoreboard hides. */
  worstParagraph: number;
  /** Paragraphs at or over the per-paragraph limit. */
  offenders: number;
};

/**
 * What a piece looks like, by the numbers in it.
 *
 * Judged per paragraph as well as overall, because the failure is local: a good
 * feature with one scoreboard dump in the middle of it is the exact shape that
 * was reported, and a whole-piece average hides it behind the paragraphs that
 * are doing their job.
 */
export function densityOf(body: string, perParagraph: number): DensityReport {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const counts = paragraphs.map(countFigures);

  return {
    total: counts.reduce((sum, n) => sum + n, 0),
    worstParagraph: counts.length ? Math.max(...counts) : 0,
    offenders: counts.filter((n) => n >= perParagraph).length,
  };
}

/**
 * The limits a feature is held to.
 *
 * Calibrated against the piece that was rejected by a reader and against the
 * opinion pieces nobody complained about, rather than picked. The reported
 * feature carried paragraphs of 29 and 34 figures; an opinion piece making an
 * argument runs to about six. Twelve leaves room for a paragraph that genuinely
 * turns on the numbers without leaving room for a table.
 */
export const FEATURE_FIGURE_LIMITS = { perParagraph: 12, total: 45 } as const;

/**
 * Whether a draft reads as a scoreboard, and why, for the log.
 *
 * Null when it is fine. A sentence when it is not, so a rejection in the
 * console says which rule it broke rather than that something did.
 */
export function scoreboardComplaint(
  body: string,
  limits: { perParagraph: number; total: number } = FEATURE_FIGURE_LIMITS,
): string | null {
  const density = densityOf(body, limits.perParagraph);

  if (density.offenders > 0) {
    return (
      `${density.offenders} paragraph${density.offenders === 1 ? "" : "s"} ` +
      `read as a scoreboard: the worst carries ${density.worstParagraph} figures, ` +
      `against a limit of ${limits.perParagraph}`
    );
  }

  if (density.total > limits.total) {
    return `the piece quotes ${density.total} figures, against a limit of ${limits.total}`;
  }

  return null;
}
