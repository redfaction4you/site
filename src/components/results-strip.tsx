import Link from "next/link";

import { MapShot } from "@/components/map-shot";
import { shortDayLabel } from "@/components/match-archive";
import { ScrollRow } from "@/components/scroll-row";

/** Only what a result tile shows, so any query that has these can feed it. */
export type StripMatch = {
  archiveDay: string;
  sourceMatchId: number;
  mapName: string;
  redScore: number;
  blueScore: number;
  winner: string | null;
  overtime: boolean;
  /** Who led it, where the caller happens to know. */
  top?: { name: string } | null;
};

/**
 * The last results, as a band across the top of the page.
 *
 * The shape every sports front page opens with, and for the reason this site
 * kept getting wrong: somebody arriving wants to know what happened, and a
 * headline and an illustration are not that. The front page put a written
 * report, a picture and three paragraphs above the first score, which was 789px
 * of prose on a 720px screen before a single number.
 *
 * Horizontal because results are read across rather than down, and because a
 * band costs one strip of height where a column costs a column. It scrolls
 * sideways when a night is long, with the newest first, so the most recent match
 * never needs a scroll to reach. `ScrollRow` is what makes the far end
 * reachable with a mouse, which for a while it was not.
 *
 * Winner in colour, loser in grey, and the map picture doing the work of saying
 * which game this was faster than the name can.
 *
 * **It sits on a band of its own.** The tiles read as loose cards floating in
 * the page rather than as the results bar they are, which is what this fixes.
 *
 * Three things decide the colour, and the first two rule out most of the range.
 * The page is `basalt-950` and the tiles are `basalt-850`, so the band has to
 * land between them: darker and it is the page, lighter and the tiles stop
 * standing out against it. And it has to be translucent, because the body
 * carries a red radial gradient that is at its strongest right here, near the
 * top; an opaque band in any one colour would show up as a rectangular hole
 * punched in it. Half-strength `basalt-850` lifts the strip off the page and
 * still lets the gradient through.
 *
 * It runs to the container edges, past the page padding, because a band that
 * stops short of the margin is a box, and a box is what it already looked like.
 */
export function ResultsStrip({
  matches,
  className = "",
}: {
  /** Newest first. */
  matches: StripMatch[];
  className?: string;
}) {
  if (matches.length === 0) return null;

  return (
    <section
      className={
        "-mx-4 border-y border-basalt-800 bg-basalt-850/50 px-4 py-2.5 " + className
      }
    >
      <ScrollRow label="results">
        {matches.map((match) => (
          <li key={`${match.archiveDay}-${match.sourceMatchId}`} className="shrink-0">
            <Link
              href={`/matches/${match.archiveDay}/${match.sourceMatchId}`}
              className="plate group flex w-[10.5rem] flex-col gap-1 p-2 transition-colors hover:border-t-rust-500"
            >
              <span className="flex items-center gap-2">
                <MapShot
                  mapName={match.mapName}
                  className="hidden w-10 shrink-0 sm:block"
                  sizes="40px"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.6875rem] text-steel-300 group-hover:text-rust-300">
                    {match.mapName}
                  </span>
                  <span className="block font-mono text-[0.5625rem] uppercase tracking-wider text-steel-600">
                    {shortDayLabel(match.archiveDay)}
                    {match.overtime ? (
                      <span className="text-oxide-400"> · ot</span>
                    ) : null}
                  </span>
                </span>
              </span>

              <span className="font-mono text-lg leading-none tabular-nums">
                <span
                  className={
                    match.winner === "red"
                      ? "font-semibold text-rust-400"
                      : "text-steel-500"
                  }
                >
                  {match.redScore}
                </span>
                <span className="mx-1 text-sm text-steel-700">/</span>
                <span
                  className={
                    match.winner === "blue"
                      ? "font-semibold text-cobalt-400"
                      : "text-steel-500"
                  }
                >
                  {match.blueScore}
                </span>
                {match.top ? (
                  <span className="ml-2 text-[0.625rem] font-normal text-steel-600">
                    {match.top.name}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ScrollRow>
    </section>
  );
}
