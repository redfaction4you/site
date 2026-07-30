import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ColumnImage } from "@/components/column-image";
import { MapShot } from "@/components/map-shot";
import { dayLabel, matchTime } from "@/components/match-archive";
import {
  adjacentColumns,
  getColumn,
  listMatchesForDay,
  nightScoreboard,
  otherColumns,
} from "@/lib/matches/queries";
import { isValidDay } from "@/lib/matches/sanitize";

type Props = { params: Promise<{ day: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { day } = await params;
  if (!isValidDay(day)) return { title: "Not found" };

  const column = await getColumn(day);
  if (!column) return { title: "Not found" };

  return {
    title: column.headline,
    description: `${dayLabel(day)}: ${column.body.split("\n").find(Boolean)?.slice(0, 180)}`,
  };
}

export default async function ColumnPage({ params }: Props) {
  const { day } = await params;
  if (!isValidDay(day)) notFound();

  const [column, matches, scoreboard, adjacent, others] = await Promise.all([
    getColumn(day),
    listMatchesForDay(day),
    nightScoreboard(day),
    adjacentColumns(day),
    otherColumns(day),
  ]);
  if (!column) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/*
        Two columns rather than one narrow one.

        The article ran at max-w-3xl centred, which on any normal screen is a
        skinny ribbon of text with a third of the window empty either side, and
        it pushed the scoreboard so far down that nobody reading the claims could
        see the figures behind them. The prose keeps a comfortable measure; the
        space that was empty now holds the night it is describing.
      */}
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <article className="min-w-0">
      <p className="eyebrow">
        <Link href="/news" className="hover:text-rust-300">
          News
        </Link>
        <span className="mx-2 text-steel-600">/</span>
        {dayLabel(day)}
      </p>

      <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-steel-100">
        {column.headline}
      </h1>

      <ColumnImage
        imageKey={column.imageKey}
        model={column.imageModel}
        headline={column.headline}
        priority
        className="mt-5 max-w-md"
      />

      <div className="mt-6 space-y-4 text-base leading-relaxed text-steel-300">
        {column.body
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
          .map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
      </div>

      <p className="mt-6 text-[0.6875rem] text-steel-600">
        Written automatically from the match data
        {column.model ? ` by ${column.model}` : ""}. It can only use figures the server
        recorded.
      </p>

        {/*
          A way onward, which the page did not have.

          It ended on the last paragraph, and the only route to another write-up
          was back out to the index and in again. Older is previous and newer is
          next, matching how the archive reads rather than how dates sort.
        */}
        {adjacent.previous || adjacent.next ? (
          <nav className="mt-8 grid gap-2 border-t border-basalt-800 pt-4 sm:grid-cols-2">
            {adjacent.previous ? (
              <Link
                href={`/news/${adjacent.previous.archiveDay}`}
                className="group min-w-0"
              >
                <span className="font-display text-[0.625rem] uppercase tracking-widest text-steel-600">
                  Previous night
                </span>
                <span className="mt-0.5 block text-sm text-steel-300 group-hover:text-rust-300">
                  {adjacent.previous.headline}
                </span>
              </Link>
            ) : (
              <span />
            )}

            {adjacent.next ? (
              <Link
                href={`/news/${adjacent.next.archiveDay}`}
                className="group min-w-0 sm:text-right"
              >
                <span className="font-display text-[0.625rem] uppercase tracking-widest text-steel-600">
                  Next night
                </span>
                <span className="mt-0.5 block text-sm text-steel-300 group-hover:text-rust-300">
                  {adjacent.next.headline}
                </span>
              </Link>
            ) : null}
          </nav>
        ) : null}
      </article>

      {/* The record, beside the claims rather than a scroll below them. */}
      <aside className="min-w-0 space-y-7">
        {matches.length ? (
          <section>
            <h2 className="border-b border-basalt-800 pb-1.5 font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
              The matches
            </h2>
            <ul>
              {matches.map((match) => (
                <li key={match.id} className="border-b border-basalt-900">
                  <Link
                    href={`/matches/${day}/${match.sourceMatchId}`}
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
                    <span className="min-w-0 flex-1 truncate text-xs text-steel-300 group-hover:text-rust-300">
                      {match.mapName}
                    </span>
                    <span className="shrink-0 font-mono text-[0.625rem] text-steel-600">
                      {matchTime(match.startedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href={`/matches/${day}`}
              className="mt-2 inline-block font-display text-[0.625rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
            >
              The full night
            </Link>
          </section>
        ) : null}

        {scoreboard.length ? (
          <section>
            <h2 className="border-b border-basalt-800 pb-1.5 font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
              Who played
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
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {others.length ? (
          <section>
            <div className="flex items-baseline justify-between border-b border-basalt-800 pb-1.5">
              <h2 className="font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
                More reports
              </h2>
              <Link
                href="/news"
                className="font-display text-[0.625rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
              >
                All
              </Link>
            </div>
            <ul>
              {others.map((entry) => (
                <li key={entry.archiveDay} className="border-b border-basalt-900">
                  <Link
                    href={`/news/${entry.archiveDay}`}
                    className="group block py-1.5"
                  >
                    <span className="font-mono text-[0.625rem] text-steel-600">
                      {dayLabel(entry.archiveDay)} · {entry.matchCount}{" "}
                      {entry.matchCount === 1 ? "match" : "matches"}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-steel-300 group-hover:text-rust-300">
                      {entry.headline}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </aside>
      </div>
    </div>
  );
}
