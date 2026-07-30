import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ColumnImage } from "@/components/column-image";
import { MapShot } from "@/components/map-shot";
import { DaySelector, dayLabel, duration, matchTime } from "@/components/match-archive";
import {
  getColumn,
  listDays,
  listMatchesForDay,
  nightScoreboard,
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

  const [days, matches, column, totals, scoreboard] = await Promise.all([
    listDays(),
    listMatchesForDay(day),
    getColumn(day),
    nightTotals(day),
    nightScoreboard(day),
  ]);

  if (matches.length === 0) notFound();

  const first = matches[0]?.startedAt ?? null;
  const last = matches[matches.length - 1]?.endedAt ?? null;
  const sessionMinutes =
    first && last ? Math.round((last.getTime() - first.getTime()) / 60000) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
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
        <div className="panel mt-5 grid gap-4 p-4 sm:grid-cols-[15rem_1fr] sm:p-5">
          {/* The illustration belongs with the writing it was made for, not only
              on the news page. Renders nothing when there is no picture. */}
          <ColumnImage
            imageKey={column.imageKey}
            model={column.imageModel}
            headline={column.headline}
            className="w-full max-w-[15rem] self-start"
          />

          <Link href={`/news/${day}`} className="group min-w-0">
            <p className="font-display text-[0.625rem] uppercase tracking-widest text-rust-500">
              The write-up
            </p>
            <h2 className="mt-1 font-display text-xl font-bold text-steel-100 transition-colors group-hover:text-rust-300">
              {column.headline}
            </h2>
            <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-steel-400">
              {column.body.split("\n").find(Boolean)}
            </p>
            <p className="mt-2 text-xs text-rust-400 group-hover:text-rust-300">
              Read the full write-up
            </p>
          </Link>
        </div>
      ) : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_16rem]">
        <section>
          <h2 className="font-display text-xs uppercase tracking-widest text-steel-500">
            The matches, in order
          </h2>

          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {matches.map((match) => (
              <li key={match.id}>
                <Link
                  href={`/matches/${day}/${match.sourceMatchId}`}
                  className="panel group flex h-full flex-col overflow-hidden"
                >
                  {/* The level, not just its name. Most of these look nothing
                      like each other and a name alone is not recognisable. */}
                  <MapShot
                    mapName={match.mapName}
                    className="w-full border-0 border-b border-basalt-800"
                    sizes="(min-width: 640px) 22rem, 100vw"
                    rounded={false}
                  />

                  <div className="flex flex-1 flex-col p-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-[0.625rem] uppercase tracking-widest text-rust-500">
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
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <aside className="space-y-7">
          {scoreboard.length ? (
            <section>
              <h2 className="border-b border-basalt-800 pb-1.5 font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
                That night
              </h2>
              <ol>
                {scoreboard.map((player, index) => (
                  <li key={player.name} className="border-b border-basalt-900">
                    <Link
                      href={`/players/${encodeURIComponent(player.name)}`}
                      className="group flex items-baseline gap-2 py-1.5"
                    >
                      <span className="w-3 shrink-0 font-display text-[0.6875rem] tabular-nums text-steel-700">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-steel-300 group-hover:text-rust-300">
                        {player.name}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-steel-100">
                        {player.kills}
                      </span>
                      <span className="w-11 shrink-0 text-right font-mono text-[0.625rem] tabular-nums text-steel-600">
                        {player.caps} caps
                      </span>
                      {/* The denominator. People drop in and out across a night,
                          so a frag total is partly a measure of who stayed. */}
                      <span className="w-8 shrink-0 text-right font-mono text-[0.5625rem] tabular-nums text-steel-700">
                        {player.matchesPlayed}/{matches.length}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
              <p className="mt-1.5 text-[0.625rem] text-steel-700">
                Frags and captures across the whole night.
              </p>
            </section>
          ) : null}

          <section>
            <h2 className="mb-2.5 font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
              Other nights
            </h2>
            <DaySelector days={days} selected={day} />
          </section>
        </aside>
      </div>
    </div>
  );
}
