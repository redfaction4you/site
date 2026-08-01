import Link from "next/link";

import { MatchRows } from "@/components/match-rows";
import { dayLabel } from "@/components/match-archive";
import type { MatchSummary } from "@/lib/matches/queries";

/**
 * One night, sized to be taken in without scrolling.
 *
 * Two things used to stop that being true, and neither was the type size.
 *
 * The matches were tiles in a two column grid, and that grid was a flex child of
 * a taller sibling, so its rows stretched to fill the summary column beside them.
 * Three rows of tile were spread down four hundred pixels with sixty pixels of
 * nothing between each, which reads as a design decision and was a default. The
 * rows below cannot stretch, so the night is now as tall as its own content.
 *
 * And the summary column was declared whether or not there was a summary, so
 * every night except the newest reserved a third of the page for nothing.
 *
 * The night's scoreboard used to sit in that column, level with the lead story
 * and above nothing, which put it in the one place on the page that belonged to
 * neither the story nor the results. It lives in the rail now, with the other
 * things that are about the night rather than part of its results.
 */
export function DayBlock({
  archiveDay,
  matches,
  heading = "h2",
  stats,
  lead,
}: {
  archiveDay: string;
  matches: MatchSummary[];
  heading?: "h1" | "h2" | "h3";
  /**
   * The night's story, above its results.
   *
   * Where a sports page puts the lead: top of the main column, with a picture,
   * before the tables. It was a one line strip underneath everything, which is
   * where a site puts something it does not expect anybody to read.
   */
  lead?: React.ReactNode;
  /**
   * The night's totals, on the header line rather than in a block of their own.
   * Four figures in a two by two grid with a label over each cost five lines to
   * say what fits on the end of the date.
   */
  stats?: string;
}) {
  const Heading = heading;
  if (matches.length === 0) return null;

  // What the night amounted to, which is not the number of rows below it: a
  // cancelled start is listed, marked, and counted towards nothing, so a night
  // of eight rows can be seven matches. Every other figure on this line is
  // already counted that way.
  const played = matches.filter((match) => match.completed).length;

  return (
    <section id={archiveDay} className="scroll-mt-20">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b-2 border-basalt-700 pb-1.5">
        <Heading
          className={
            "font-display font-bold text-steel-100 " +
            (heading === "h1" ? "text-2xl" : "text-xl")
          }
        >
          <Link href={`/matches/${archiveDay}`} className="hover:text-rust-300">
            {dayLabel(archiveDay)}
          </Link>
        </Heading>
        <p className="font-mono text-xs text-steel-500">
          {played} {played === 1 ? "match" : "matches"}
          {stats ? <span className="text-steel-600"> · {stats}</span> : null}
        </p>
      </div>

      <div className="mt-2 min-w-0">
        {lead ? <div className="mb-3">{lead}</div> : null}
        <MatchRows matches={matches} archiveDay={archiveDay} />
      </div>
    </section>
  );
}
