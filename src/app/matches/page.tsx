import type { Metadata } from "next";
import Link from "next/link";

import { ArchiveNav } from "@/components/archive-nav";
import { EmptyArchive } from "@/components/match-archive";
import { MapShot } from "@/components/map-shot";
import { dayLabel, matchTime } from "@/components/match-archive";
import { archiveTotals, listDays, listMatchesForDay } from "@/lib/matches/queries";

export const metadata: Metadata = {
  title: "Matches",
  description:
    "The RedFaction4You match archive: every night played on the community server, with scoreboards, captures and results.",
};

export const dynamic = "force-dynamic";

/**
 * The archive, night by night.
 *
 * This page used to redirect to the newest night, which was the right default
 * while a night page carried the four before it stacked underneath. That made
 * the newest night's page four times longer than the night it was named after,
 * and left the archive itself with no front door: there was no page that said
 * how much was here.
 *
 * So the stack moved out and became this. Each night is one row of results, so a
 * season stays scannable, and the night pages went back to being about one
 * night.
 */
export default async function MatchesPage() {
  const [days, totals] = await Promise.all([listDays(), archiveTotals()]);

  if (days.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <p className="eyebrow">Archive</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">Matches</h1>
        <EmptyArchive />
      </div>
    );
  }

  // Every night at once. Four small queries today and a few dozen at a season's
  // scale, all of them indexed on the day, which is cheaper than the four the
  // night page was doing to stack its neighbours.
  const nights = await Promise.all(
    days.map(async (day) => ({
      ...day,
      matches: await listMatchesForDay(day.archiveDay),
    })),
  );

  return (
    <div className="mx-auto max-w-5xl px-4 pb-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-basalt-800 py-2.5">
        <h1 className="eyebrow">Matches</h1>
        <p className="font-mono text-xs text-steel-600">
          <span className="text-steel-300">{totals.matchCount}</span> matches ·{" "}
          <span className="text-steel-300">{totals.dayCount}</span> nights
        </p>
      </div>

      <ArchiveNav active="/matches" className="mt-3" />

      <p className="max-w-2xl py-4 text-sm leading-relaxed text-steel-400">
        Every night on record, newest first. Open one for the full scoreboard,
        who played, and the write-up.
      </p>

      <ul className="space-y-5">
        {nights.map((night) => (
          <li key={night.archiveDay}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-basalt-700 pb-1">
              <h2 className="font-display text-base font-bold text-steel-100">
                <Link
                  href={`/matches/${night.archiveDay}`}
                  className="hover:text-rust-300"
                >
                  {dayLabel(night.archiveDay)}
                </Link>
              </h2>
              <p className="font-mono text-xs text-steel-600">
                {night.matches.length}{" "}
                {night.matches.length === 1 ? "match" : "matches"}
              </p>
            </div>

            {/*
              The night's results as one line of tiles rather than a table.
              A row per match here would be the night page again, and the
              question this page answers is which night to open.
            */}
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {night.matches.map((match) => (
                <li key={match.id}>
                  <Link
                    href={`/matches/${night.archiveDay}/${match.sourceMatchId}`}
                    title={`${match.mapName}, ${matchTime(match.startedAt)}${
                      match.overtime ? ", overtime" : ""
                    }`}
                    className="plate group flex w-[8.5rem] items-center gap-2 p-1.5 transition-colors hover:border-t-rust-500"
                  >
                    <MapShot
                      mapName={match.mapName}
                      className="hidden w-10 shrink-0 sm:block"
                      sizes="40px"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[0.6875rem] text-steel-200 group-hover:text-rust-300">
                        {match.mapName}
                      </span>
                      <span className="font-mono text-xs tabular-nums">
                        <span
                          className={
                            match.winner === "red"
                              ? "font-semibold text-rust-400"
                              : "text-steel-500"
                          }
                        >
                          {match.redScore}
                        </span>
                        <span className="mx-0.5 text-steel-700">/</span>
                        <span
                          className={
                            match.winner === "blue"
                              ? "font-semibold text-cobalt-400"
                              : "text-steel-500"
                          }
                        >
                          {match.blueScore}
                        </span>
                        {match.overtime ? (
                          <span className="ml-1 text-[0.5625rem] uppercase text-oxide-400">
                            ot
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <p className="mt-8 border-t border-basalt-800 pt-4 text-xs leading-relaxed text-steel-500">
        Nights are calendar days in America/Los_Angeles, so a match at eight in
        the evening belongs to that evening even though it is already tomorrow in
        UTC.
      </p>
    </div>
  );
}
