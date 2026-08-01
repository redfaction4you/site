import Link from "next/link";

import { FootageMark } from "@/components/footage-mark";
import { MapShot } from "@/components/map-shot";
import { matchTime } from "@/components/match-archive";
import type { MatchSummary } from "@/lib/matches/queries";

/**
 * A night's matches, as labelled rows.
 *
 * The one shape a match takes wherever it is listed, because there were two and
 * the worse one was on the page about matches. The night page laid each match out
 * as a tile: a thumbnail, a name, a time and a score, none of them named. A bare
 * `19:35` beside `4 / 3` reads as a duration or as another score, and `4 / 3`
 * with nothing above it does not say which number is which side. Colour was the
 * only key and it encodes who won, not who is who.
 *
 * Tiles also cost width they had nothing to spend it on. Two columns of tile put
 * a hundred pixel picture and a score either side of the map name, which is the
 * one field that varies in length, so `Warlords Pr…` and `Dark Warlor…` were
 * truncated on a page with three hundred pixels to spare, and `overtime` was
 * clipped to `OVERTI…` on the two matches of the night that had it.
 *
 * Rows fix both. Every column has a heading, the score's heading is its own
 * legend, and the name gets the width that the layout was spending on air.
 */
export function MatchRows({
  matches,
  archiveDay,
}: {
  matches: MatchSummary[];
  archiveDay: string;
}) {
  if (matches.length === 0) {
    return (
      <p className="py-3 text-sm text-steel-500">No matches recorded that night.</p>
    );
  }

  return (
    /*
     * Capped rather than filling whatever it is given.
     *
     * The map name is the only cell that grows, so a row stretched across a full
     * width page puts three hundred pixels of nothing between `Ankh b12` and the
     * score it belongs to, and the eye has to walk it. The cap is also what keeps
     * a night with a scoreboard beside it and a night without lining their
     * columns up down the page.
     */
    <div className="max-w-[36rem]">
      <div className="flex items-center gap-2.5 border-b border-basalt-700 pb-1 font-display text-[0.5625rem] uppercase tracking-wider text-steel-600">
        <span className="w-3.5 shrink-0" title="Order played">
          #
        </span>
        <span className="hidden w-12 shrink-0 sm:block" />
        <span className="min-w-0 flex-1">Map</span>
        <span className="hidden w-8 shrink-0 text-right sm:block">Players</span>
        <span className="w-9 shrink-0 text-right">Start</span>
        {/*
          The score's own legend, so the pair below it can be read without
          knowing the convention. Red and blue are shirt colours on this server
          and get reshuffled between matches, which is exactly why the columns
          have to be named rather than left to be inferred as teams.
        */}
        <span className="w-16 shrink-0 text-right tracking-normal">
          <span className="text-rust-400">Red</span>
          <span className="text-steel-700"> / </span>
          <span className="text-oxide-400">Blue</span>
        </span>
      </div>

      <ul>
        {matches.map((match) => (
          <li key={match.id} className="border-b border-basalt-800">
            <Link
              href={`/matches/${archiveDay}/${match.sourceMatchId}`}
              className="group flex items-center gap-2.5 py-1"
            >
              <span className="w-3.5 shrink-0 font-display text-[0.6875rem] tabular-nums text-steel-600">
                {match.number}
              </span>

              {/* The slot keeps its width whether or not the map has a picture,
                  so an unphotographed map does not shunt a row out of line. */}
              <span className="hidden w-12 shrink-0 sm:block">
                <MapShot mapName={match.mapName} className="w-12" sizes="48px" />
              </span>

              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate text-sm text-steel-100 group-hover:text-rust-300">
                  {match.mapName}
                </span>
                <FootageMark
                  archiveDay={archiveDay}
                  sourceMatchId={match.sourceMatchId}
                />
                {/*
                  Overtime never truncates, the map name does. It is the most
                  interesting thing a match can do and the name is the thing you
                  can still recognise from half of it.
                */}
                {match.overtime ? (
                  <span className="shrink-0 font-mono text-[0.5625rem] uppercase tracking-wider text-oxide-400">
                    overtime
                  </span>
                ) : null}
                {match.status !== "final" ? (
                  <span className="shrink-0 font-mono text-[0.5625rem] uppercase tracking-wider text-steel-600">
                    {match.status}
                  </span>
                ) : null}
              </span>

              <span className="hidden w-8 shrink-0 text-right font-mono text-xs tabular-nums text-steel-500 sm:block">
                {match.playerCount}
              </span>

              <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-steel-500">
                {matchTime(match.startedAt)}
              </span>

              <span className="w-16 shrink-0 text-right font-mono text-lg leading-none tabular-nums">
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
                      ? "font-semibold text-oxide-400"
                      : "text-steel-500"
                  }
                >
                  {match.blueScore}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
