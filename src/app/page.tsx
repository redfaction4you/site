import Link from "next/link";

import { ColumnImage } from "@/components/column-image";
import { MatchOfTheNight } from "@/components/match-of-the-night";
import { dayLabel, shortDayLabel } from "@/components/match-archive";
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

  // Everything except the lead, which is already the top of the page. No extra
  // query: listColumns has fetched the lot.
  const earlier = columns.slice(1, 6);

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
                className="mt-4 max-w-sm"
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
              <>
                {/*
                  Named, the same as the archive rows. A bare `2 - 1` does not
                  say which number is which side, and colour cannot tell you
                  because it encodes who won rather than who is who. The heading
                  is the legend.

                  These span nights, so the night is the column rather than the
                  kick-off time: on a list of the last six matches, which evening
                  is the useful one and the clock is not.
                */}
                <div className="flex items-baseline gap-2.5 border-b border-basalt-800 py-1 font-display text-[0.5625rem] uppercase tracking-wider text-steel-600">
                  <span className="min-w-0 flex-1">Map</span>
                  <span className="w-10 shrink-0 text-right">Night</span>
                  <span className="w-14 shrink-0 text-right tracking-normal">
                    <span className="text-rust-400">Red</span>
                    <span className="text-steel-700"> / </span>
                    <span className="text-oxide-400">Blue</span>
                  </span>
                </div>

                <ul>
                  {recent.map((match) => (
                    <li
                      key={`${match.archiveDay}-${match.sourceMatchId}`}
                      className="border-b border-basalt-800"
                    >
                      <Link
                        href={`/matches/${match.archiveDay}/${match.sourceMatchId}`}
                        className="group flex items-baseline gap-2.5 py-1.5"
                      >
                        <span className="min-w-0 flex-1 truncate text-xs text-steel-200 group-hover:text-rust-300">
                          {match.mapName}
                        </span>
                        <span className="w-10 shrink-0 text-right font-mono text-[0.625rem] tabular-nums text-steel-500">
                          {shortDayLabel(match.archiveDay)}
                        </span>
                        <span className="w-14 shrink-0 text-right font-mono text-sm tabular-nums">
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
              </>
            )}
          </section>

          {/*
            Earlier nights, which the front page had no route to at all.

            The lead was the only write-up on it, so a reader who had already
            seen that one had nowhere to go: the archive looked like it held a
            single article. These are the ones underneath it.
          */}
          {earlier.length ? (
            <section>
              <div className="flex items-baseline justify-between border-b border-basalt-800 pb-1.5">
                <h2 className="font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
                  Earlier nights
                </h2>
                <Link
                  href="/news"
                  className="font-display text-[0.625rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
                >
                  All
                </Link>
              </div>
              <ul>
                {earlier.map((entry) => (
                  <li key={entry.archiveDay} className="border-b border-basalt-800">
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
                  <li key={player.name} className="border-b border-basalt-800">
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
