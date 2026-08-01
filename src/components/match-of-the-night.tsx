import Link from "next/link";

import { MapShot } from "@/components/map-shot";
import { matchTime } from "@/components/match-archive";
import type { MatchSummary } from "@/lib/matches/queries";

/**
 * The one match of the night worth reading about on its own.
 *
 * The column covers a whole evening at a level that suits none of its matches in
 * particular. One game is usually the one people would actually talk about, and
 * it already has a written report, so this costs no generation: it surfaces
 * writing that was previously only reachable by clicking into the match.
 *
 * The same `matchInterest` picks this and the illustration's subject, so the
 * featured match and the picture beside the column are about the same game.
 */
export function MatchOfTheNight({
  match,
  archiveDay,
}: {
  match: MatchSummary & { report: string | null };
  archiveDay: string;
}) {
  const href = `/matches/${archiveDay}/${match.sourceMatchId}`;

  // The opening paragraph only. The rest is one click away and the point here is
  // to be worth the click, not to reprint the report on the front page.
  const opening =
    match.report
      ?.split(/\n{2,}/)
      .map((part) => part.trim())
      .find(Boolean) ?? null;

  return (
    <article className="min-w-0">
      <div className="flex items-baseline justify-between border-b border-basalt-800 pb-1.5">
        <h2 className="font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
          Match of the night
        </h2>
        <span className="font-mono text-[0.625rem] text-steel-600">
          Match {match.number}
          {match.overtime ? " · overtime" : ""}
        </span>
      </div>

      <Link href={href} className="group mt-2.5 flex gap-3">
        <MapShot
          mapName={match.mapName}
          className="w-24 shrink-0 sm:w-28"
          sizes="112px"
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-steel-200 group-hover:text-rust-300">
            {match.mapName}
          </p>
          <p className="mt-0.5 font-mono text-lg tabular-nums leading-none">
            <span
              className={match.winner === "red" ? "text-rust-400" : "text-steel-500"}
            >
              {match.redScore}
            </span>
            <span className="mx-1 text-steel-700">-</span>
            <span
              className={match.winner === "blue" ? "text-cobalt-400" : "text-steel-500"}
            >
              {match.blueScore}
            </span>
          </p>
          <p className="mt-1 font-mono text-[0.625rem] text-steel-600">
            {match.mode} · {matchTime(match.startedAt)} · {match.playerCount} players
          </p>
        </div>
      </Link>

      {opening ? (
        <>
          <p className="mt-2.5 text-xs leading-relaxed text-steel-300">{opening}</p>
          <Link
            href={href}
            className="mt-2 inline-block font-display text-[0.625rem] font-semibold uppercase tracking-widest text-rust-400 hover:text-rust-300"
          >
            The full match
          </Link>
        </>
      ) : (
        // No report yet is a normal state: they are written a few per sync and
        // the scoreboard is already there to read.
        <Link
          href={href}
          className="mt-2.5 inline-block font-display text-[0.625rem] font-semibold uppercase tracking-widest text-rust-400 hover:text-rust-300"
        >
          The scoreboard
        </Link>
      )}
    </article>
  );
}
