import Link from "next/link";
import { FootageMark } from "@/components/footage-mark";

import { MapShot } from "@/components/map-shot";
import { matchTime } from "@/components/match-archive";
import type { MatchSummary } from "@/lib/matches/queries";

/**
 * A night's matches, as a readable table rather than a row of loose numbers.
 *
 * The previous version put the match number, the score and the kick-off time in
 * a row with nothing naming any of them. A bare `20:20` sitting beside `3 - 0`
 * reads as a duration, or worse as another score, and there was no way to tell
 * from the page which it was. Anything numeric next to a scoreline needs a
 * heading or it becomes a guess.
 *
 * So there is a header row now, kick-off is stated as such, and the two things
 * that were missing get their place: whether it went to overtime, which is the
 * most interesting thing a match can do and was invisible here, and how many
 * played.
 */
export function NightMatches({
  matches,
  archiveDay,
  showFullNight = true,
}: {
  matches: MatchSummary[];
  archiveDay: string;
  showFullNight?: boolean;
}) {
  if (matches.length === 0) return null;

  return (
    <section>
      <h2 className="border-b border-basalt-800 pb-1.5 font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
        The matches
      </h2>

      {/* Names the columns, which is the whole fix. */}
      <div className="flex items-baseline gap-2.5 border-b border-basalt-900 py-1 font-mono text-[0.5625rem] uppercase tracking-wider text-steel-700">
        <span className="w-4 shrink-0">#</span>
        <span className="w-11 shrink-0 text-right">Score</span>
        <span className="hidden w-12 shrink-0 sm:block" />
        <span className="min-w-0 flex-1">Map</span>
        <span className="shrink-0">Kick-off</span>
      </div>

      <ul>
        {matches.map((match) => (
          <li key={match.id} className="border-b border-basalt-900">
            <Link
              href={`/matches/${archiveDay}/${match.sourceMatchId}`}
              className="group flex items-center gap-2.5 py-1.5"
            >
              <span className="w-4 shrink-0 font-display text-[0.6875rem] tabular-nums text-steel-700">
                {match.number}
              </span>

              <span className="w-11 shrink-0 text-right font-mono text-sm tabular-nums">
                <span
                  className={
                    match.winner === "red" ? "text-rust-400" : "text-steel-600"
                  }
                >
                  {match.redScore}
                </span>
                <span className="mx-0.5 text-steel-700">-</span>
                <span
                  className={
                    match.winner === "blue" ? "text-oxide-400" : "text-steel-600"
                  }
                >
                  {match.blueScore}
                </span>
              </span>

              <MapShot
                mapName={match.mapName}
                className="hidden w-12 shrink-0 sm:block"
                sizes="48px"
              />

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-xs text-steel-300 group-hover:text-rust-300">
                    {match.mapName}
                  </span>
                  <FootageMark
                    archiveDay={archiveDay}
                    sourceMatchId={match.sourceMatchId}
                  />
                </span>
                <span className="block font-mono text-[0.5625rem] uppercase tracking-wider text-steel-700">
                  {/* Overtime first: it is the most interesting thing here and
                      was not shown at all. */}
                  {match.overtime ? (
                    <span className="text-oxide-400">Overtime · </span>
                  ) : null}
                  {match.playerCount} players
                </span>
              </span>

              <span className="shrink-0 font-mono text-[0.625rem] tabular-nums text-steel-600">
                {matchTime(match.startedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {showFullNight ? (
        <Link
          href={`/matches/${archiveDay}`}
          className="mt-2 inline-block font-display text-[0.625rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
        >
          The full night
        </Link>
      ) : null}
    </section>
  );
}
