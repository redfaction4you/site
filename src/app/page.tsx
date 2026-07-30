import Link from "next/link";

import { ColumnImage } from "@/components/column-image";
import { MatchOfTheNight } from "@/components/match-of-the-night";
import { dayLabel, matchTime } from "@/components/match-archive";
import {
  archiveTotals,
  latestDay,
  listColumns,
  listPlayers,
  matchOfTheNight,
  recentMatches,
} from "@/lib/matches/queries";
import { Ticker } from "@/components/ticker";
import { getTicker } from "@/lib/matches/ticker";
import { DISCORD_INVITE } from "@/lib/nav";
import { getServerStatus } from "@/lib/server-status";

export const dynamic = "force-dynamic";

/**
 * A news front page: the lead story with a rail beside it.
 *
 * Laid out so the article, the night's results and the leaderboard all sit on
 * one screen. A headline at display size and a single paragraph took a third of
 * the viewport and pushed the results below the fold, which is the opposite of
 * what a front page is for. The story now runs at reading size in a column
 * beside the numbers rather than above them.
 */
export default async function HomePage() {
  const [status, totals, latest, players, columns, recent, ticker] = await Promise.all([
    getServerStatus(),
    archiveTotals(),
    latestDay(),
    listPlayers(),
    listColumns(),
    recentMatches(6),
    getTicker(),
  ]);

  const online = status.state === "online" ? status : null;
  const busy = online && online.players > 0;
  const column = columns[0] ?? null;

  // The featured match belongs to the night the column is about, so it is only
  // fetched once there is a column to hang it beside.
  const featured = column ? await matchOfTheNight(column.archiveDay) : null;

  // Three paragraphs is most of a column and still fits beside the rail.
  const paragraphs = column
    ? column.body
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  const leaders = [...players].sort((a, b) => b.kills - a.kills).slice(0, 6);

  return (
    <>
      <h1 className="sr-only">RedFaction4You</h1>

      {/* Records strip, full bleed, directly under the hazard stripe. */}
      <div className="-mt-px">
        <Ticker items={ticker} />
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-10">
      {/* Status readout. One line, with the map the server is on. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-basalt-800 py-2.5 text-xs">
        <Link href="/server" className="group flex items-center gap-2">
          <span
            aria-hidden="true"
            className={
              "h-2 w-2 shrink-0 rounded-full " +
              (busy
                ? "animate-pulse bg-signal-green"
                : online
                  ? "bg-oxide-400"
                  : "bg-steel-600")
            }
          />
          <span className="font-display uppercase tracking-widest text-steel-400 group-hover:text-steel-200">
            {online
              ? "Server online"
              : status.state === "offline"
                ? "Server offline"
                : "Server unknown"}
          </span>
          {online ? (
            <span className="font-mono text-steel-500">
              {online.players}/{online.maxPlayers}
              {online.map ? ` · ${online.map}` : ""}
            </span>
          ) : null}
        </Link>

        <span className="ml-auto flex flex-wrap gap-x-4 font-mono text-steel-600">
          <span>
            <span className="text-steel-300">{totals.matchCount}</span> matches
          </span>
          <span>
            <span className="text-steel-300">{totals.dayCount}</span> nights
          </span>
          <span>
            <span className="text-steel-300">{players.length}</span> players
          </span>
        </span>
      </div>

      <div className="grid gap-x-10 gap-y-8 py-6 lg:grid-cols-[1.55fr_1fr]">
        {/* --- The lead story --- */}
        <article className="min-w-0">
          {column ? (
            <>
              <p className="eyebrow">Match report · {dayLabel(column.archiveDay)}</p>
              <h2 className="mt-2 font-brand text-2xl leading-[1.2] text-steel-100 sm:text-3xl">
                <Link href={`/news/${column.archiveDay}`} className="hover:text-rust-400">
                  {column.headline}
                </Link>
              </h2>

              {/*
                The illustration belongs to this article rather than to the
                moment. This slot used to show whatever map the server happened
                to be on, which changed every few minutes, so the picture beside
                a fixed piece of writing never stayed still long enough for a
                reader to remember it. Now it is generated once from the finished
                column and stored with it. Renders nothing when there is no
                image, which is common.
              */}
              <ColumnImage
                imageKey={column.imageKey}
                model={column.imageModel}
                headline={column.headline}
                priority
                className="mt-4"
              />

              <div className="mt-4 space-y-3 text-sm leading-relaxed text-steel-300">
                {paragraphs.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>

              <Link
                href={`/news/${column.archiveDay}`}
                className="mt-3 inline-block font-display text-[0.6875rem] font-semibold uppercase tracking-widest text-rust-400 hover:text-rust-300"
              >
                Read the full report
              </Link>
            </>
          ) : (
            <>
              <h2 className="font-brand text-2xl leading-[1.2] text-steel-100 sm:text-3xl">
                Everything for Red Faction,{" "}
                <span className="text-rust-500">in one place that stays up.</span>
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-steel-300">
                Match results, player records and the community server. Free, no
                account needed. A write-up appears here after each match night.
              </p>
            </>
          )}
        </article>

        {/* --- The rail --- */}
        <div className="min-w-0 space-y-6">
          {/* Above the results list deliberately: it is the one result worth
              reading rather than one of several worth scanning. */}
          {column && featured ? (
            <MatchOfTheNight match={featured} archiveDay={column.archiveDay} />
          ) : null}

          <section>
            <div className="flex items-baseline justify-between border-b border-basalt-800 pb-1.5">
              <h2 className="font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
                Latest results
              </h2>
              <Link
                href="/matches"
                className="font-display text-[0.625rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
              >
                All
              </Link>
            </div>

            {recent.length === 0 ? (
              <p className="mt-3 text-xs text-steel-500">Nothing recorded yet.</p>
            ) : (
              <ul>
                {recent.map((match) => (
                  <li
                    key={`${match.archiveDay}-${match.sourceMatchId}`}
                    className="border-b border-basalt-900"
                  >
                    <Link
                      href={`/matches/${match.archiveDay}/${match.sourceMatchId}`}
                      className="group flex items-center gap-3 py-1.5"
                    >
                      <span className="w-12 shrink-0 text-right font-mono text-sm tabular-nums">
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
            )}
          </section>

          <section>
            <div className="flex items-baseline justify-between border-b border-basalt-800 pb-1.5">
              <h2 className="font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
                Most frags
              </h2>
              <Link
                href="/players"
                className="font-display text-[0.625rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
              >
                All
              </Link>
            </div>

            {leaders.length === 0 ? (
              <p className="mt-3 text-xs text-steel-500">Nobody on record yet.</p>
            ) : (
              <ol>
                {leaders.map((player, index) => (
                  <li key={player.name} className="border-b border-basalt-900">
                    <Link
                      href={`/players/${encodeURIComponent(player.name)}`}
                      className="group flex items-baseline gap-2.5 py-1.5"
                    >
                      <span className="w-3 shrink-0 font-display text-[0.6875rem] tabular-nums text-steel-700">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-steel-300 group-hover:text-rust-300">
                        {player.name}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-steel-200">
                        {player.kills}
                      </span>
                      <span className="w-12 shrink-0 text-right font-mono text-[0.625rem] tabular-nums text-steel-600">
                        {player.caps} caps
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-basalt-800 pt-4 text-xs">
        <p className="max-w-2xl leading-relaxed text-steel-500">
          Games are arranged in Discord. Everything played on the server is recorded
          here permanently, and you never need an account to read any of it.
          {latest ? ` Last night archived: ${dayLabel(latest)}.` : ""}
        </p>
        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0 rounded-sm bg-rust-500 px-4 py-2 font-display text-[0.6875rem] font-semibold uppercase tracking-widest text-steel-100 transition-colors hover:bg-rust-400"
        >
          Join the Discord
        </a>
      </div>
      </div>
    </>
  );
}
