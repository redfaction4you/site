import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DaySelector, dayLabel, duration, matchTime } from "@/components/match-archive";
import {
  getColumn,
  listDays,
  listMatchesForDay,
  nightTotals,
} from "@/lib/matches/queries";
import { isValidDay } from "@/lib/matches/sanitize";

type Props = { params: Promise<{ day: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { day } = await params;
  if (!isValidDay(day)) return { title: "Not found" };

  return {
    title: `Match night, ${dayLabel(day)}`,
    description: `Every match played on ${dayLabel(day)} on the RedFaction4You server, with scoreboards and the night's write-up.`,
  };
}

export default async function MatchDayPage({ params }: Props) {
  const { day } = await params;
  if (!isValidDay(day)) notFound();

  const [days, matches, column, totals] = await Promise.all([
    listDays(),
    listMatchesForDay(day),
    getColumn(day),
    nightTotals(day),
  ]);

  if (matches.length === 0) notFound();

  const first = matches[0]?.startedAt ?? null;
  const last = matches[matches.length - 1]?.endedAt ?? null;
  const sessionMinutes =
    first && last ? Math.round((last.getTime() - first.getTime()) / 60000) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <p className="eyebrow">
        <Link href="/matches" className="hover:text-rust-300">
          Matches
        </Link>
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold text-steel-100">
        {dayLabel(day)}
      </h1>

      {/* The night at a glance. */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-steel-400">
        <span>
          <span className="font-mono text-steel-100">{matches.length}</span>{" "}
          {matches.length === 1 ? "match" : "matches"}
        </span>
        {sessionMinutes ? (
          <span>
            <span className="font-mono text-steel-100">{sessionMinutes}</span> minutes
            from first to last
          </span>
        ) : null}
        <span>
          <span className="font-mono text-steel-100">{totals.players}</span> players
        </span>
        <span>
          <span className="font-mono text-steel-100">{totals.frags}</span> frags
        </span>
        <span>
          <span className="font-mono text-steel-100">{totals.captures}</span> captures
        </span>
        {first ? <span>Started {matchTime(first)}</span> : null}
      </div>

      {/* The write-up for this night, where one exists. It belongs with the
          session it describes, not only on a separate news page. */}
      {column ? (
        <Link href={`/news/${day}`} className="panel group mt-6 block p-5">
          <p className="font-display text-[10px] uppercase tracking-widest text-rust-500">
            The write-up
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-steel-100 transition-colors group-hover:text-rust-300">
            {column.headline}
          </h2>
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-steel-400">
            {column.body.split("\n").find(Boolean)}
          </p>
          <p className="mt-2 text-xs text-rust-400 group-hover:text-rust-300">
            Read the full write-up
          </p>
        </Link>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_16rem]">
        <section>
          <h2 className="font-display text-xs uppercase tracking-widest text-steel-500">
            The matches, in order
          </h2>

          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {matches.map((match) => (
              <li key={match.id}>
                <Link
                  href={`/matches/${day}/${match.sourceMatchId}`}
                  className="panel group flex h-full flex-col p-4"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-[10px] uppercase tracking-widest text-rust-500">
                      Match {match.number}
                    </span>
                    <span className="font-mono text-lg tabular-nums">
                      <span
                        className={
                          match.winner === "red" ? "text-rust-400" : "text-steel-500"
                        }
                      >
                        {match.redScore}
                      </span>
                      <span className="mx-1 text-steel-600">-</span>
                      <span
                        className={
                          match.winner === "blue" ? "text-oxide-400" : "text-steel-500"
                        }
                      >
                        {match.blueScore}
                      </span>
                    </span>
                  </div>

                  <h3 className="mt-1 truncate font-display text-base font-bold text-steel-100 transition-colors group-hover:text-rust-300">
                    {match.mapName}
                  </h3>

                  <p className="mt-1 text-xs text-steel-500">
                    {match.mode} · {matchTime(match.startedAt)}
                    {/* Duration only when it says something: nearly every match
                        runs the full ten minutes. */}
                    {match.overtime
                      ? ` · overtime, ${duration(match.startedAt, match.endedAt)}`
                      : ""}
                    {match.status !== "final" ? ` · ${match.status}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <aside>
          <h2 className="mb-3 font-display text-xs uppercase tracking-widest text-steel-500">
            Other nights
          </h2>
          <DaySelector days={days} selected={day} />
        </aside>
      </div>
    </div>
  );
}
