import Link from "next/link";

import { FootageMark } from "@/components/footage-mark";
import { MapShot } from "@/components/map-shot";
import { dayLabel, matchTime } from "@/components/match-archive";
import type { MatchSummary } from "@/lib/matches/queries";

/**
 * One night, sized to be taken in without scrolling.
 *
 * The day page gave every match a full width card with a 16:9 screenshot, which
 * is handsome and meant a six match night ran to two and a half screens. You
 * could not see the evening, only a piece of it, and comparing the third match
 * to the sixth meant scrolling between them.
 *
 * A tile is the same information at a tenth of the height: the picture shrinks
 * to a thumbnail that still says which map, and the score gets the weight the
 * screenshot used to have. Six of them fit a screen with the night's summary
 * beside them.
 */

function MatchTile({
  match,
  archiveDay,
}: {
  match: MatchSummary;
  archiveDay: string;
}) {
  const decided = match.winner === "red" || match.winner === "blue";

  return (
    <li>
      <Link
        href={`/matches/${archiveDay}/${match.sourceMatchId}`}
        className="plate group flex items-stretch gap-3 p-2 transition-colors hover:border-t-rust-500"
      >
        <MapShot
          mapName={match.mapName}
          className="hidden w-24 shrink-0 self-center sm:block"
          sizes="96px"
        />

        <span className="flex min-w-0 flex-1 flex-col justify-center">
          <span className="flex items-center gap-1.5">
            <span className="font-display text-[0.5625rem] font-bold uppercase tracking-widest text-steel-600">
              {match.number}
            </span>
            <span className="truncate text-sm font-semibold text-steel-100 group-hover:text-rust-300">
              {match.mapName}
            </span>
            <FootageMark archiveDay={archiveDay} sourceMatchId={match.sourceMatchId} />
          </span>
          <span className="mt-0.5 truncate font-mono text-[0.625rem] uppercase tracking-wider text-steel-600">
            {matchTime(match.startedAt)}
            {match.overtime ? (
              <span className="text-oxide-400"> · overtime</span>
            ) : null}
            {match.status !== "final" ? ` · ${match.status}` : ""}
          </span>
        </span>

        {/* The score gets the weight the screenshot used to have. */}
        <span className="flex shrink-0 items-center gap-1.5 pr-1 font-mono text-xl leading-none tabular-nums">
          <span
            className={
              decided && match.winner === "red"
                ? "text-rust-400"
                : "text-steel-500 opacity-70"
            }
          >
            {match.redScore}
          </span>
          <span className="text-sm text-steel-700">/</span>
          <span
            className={
              decided && match.winner === "blue"
                ? "text-oxide-400"
                : "text-steel-500 opacity-70"
            }
          >
            {match.blueScore}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function DayBlock({
  archiveDay,
  matches,
  heading = "h2",
  children,
}: {
  archiveDay: string;
  matches: MatchSummary[];
  heading?: "h1" | "h2";
  /** The night's summary, shown beside the tiles. */
  children?: React.ReactNode;
}) {
  const Heading = heading;
  if (matches.length === 0) return null;

  return (
    <section id={archiveDay} className="scroll-mt-20">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-basalt-700 pb-2">
        <Heading className="font-display text-2xl font-bold text-steel-100">
          <Link href={`/matches/${archiveDay}`} className="hover:text-rust-300">
            {dayLabel(archiveDay)}
          </Link>
        </Heading>
        <p className="font-mono text-xs text-steel-500">
          {matches.length} {matches.length === 1 ? "match" : "matches"}
        </p>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <ul className="grid gap-2 sm:grid-cols-2">
          {matches.map((match) => (
            <MatchTile key={match.id} match={match} archiveDay={archiveDay} />
          ))}
        </ul>

        {children ? <div className="min-w-0">{children}</div> : null}
      </div>
    </section>
  );
}
