import Link from "next/link";

import { dayLabel, matchTime } from "@/components/match-archive";
import {
  archiveTotals,
  latestDay,
  listColumns,
  listPlayers,
  recentMatches,
} from "@/lib/matches/queries";
import { DISCORD_INVITE } from "@/lib/nav";
import { getServerStatus } from "@/lib/server-status";

export const dynamic = "force-dynamic";

/**
 * The front page shows the archive rather than linking to it.
 *
 * It used to be a row of cards, one per section, which is the navigation again
 * in a larger typeface. A visitor learned nothing from it that the header did
 * not already tell them. This shows the most recent write-up, the last matches
 * played and who is on form, so the page has something to read.
 */
export default async function HomePage() {
  const [status, totals, latest, players, columns, recent] = await Promise.all([
    getServerStatus(),
    archiveTotals(),
    latestDay(),
    listPlayers(),
    listColumns(),
    recentMatches(5),
  ]);

  const online = status.state === "online" ? status : null;
  const busy = online && online.players > 0;
  const column = columns[0] ?? null;

  // Most frags across the archive. A leaderboard of six is a scoreboard, not a
  // ranking, and it reads better than pretending otherwise.
  const leaders = [...players].sort((a, b) => b.kills - a.kills).slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-14">
      <h1 className="sr-only">RedFaction4You</h1>

      {/* Status line. Small, monospaced, sits right under the hazard stripe
          like a readout rather than a card. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-basalt-800 py-3 text-xs">
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
            {online ? "Server online" : status.state === "offline" ? "Server offline" : "Server unknown"}
          </span>
          {online ? (
            <span className="font-mono text-steel-500">
              {online.players}/{online.maxPlayers}
              {online.map ? ` · ${online.map}` : ""}
            </span>
          ) : null}
        </Link>

        <span className="ml-auto flex flex-wrap gap-x-5 gap-y-1 font-mono text-steel-600">
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

      {/* The lead: the most recent write-up, set as a piece of writing. */}
      {column ? (
        <section className="border-b border-basalt-800 py-10">
          <p className="eyebrow">
            Match report · {dayLabel(column.archiveDay)}
          </p>
          <h2 className="mt-3 max-w-4xl font-brand text-3xl leading-[1.15] text-steel-100 sm:text-4xl">
            <Link href={`/news/${column.archiveDay}`} className="hover:text-rust-400">
              {column.headline}
            </Link>
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-steel-300">
            {column.body.split("\n").find(Boolean)}
          </p>
          <Link
            href={`/news/${column.archiveDay}`}
            className="mt-4 inline-block font-display text-xs font-semibold uppercase tracking-widest text-rust-400 hover:text-rust-300"
          >
            Read the full report
          </Link>
        </section>
      ) : (
        <section className="border-b border-basalt-800 py-10">
          <h2 className="max-w-3xl font-brand text-3xl leading-[1.15] text-steel-100 sm:text-4xl">
            Everything for Red Faction,{" "}
            <span className="text-rust-500">in one place that stays up.</span>
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-steel-300">
            Match results, player records and the community server. Free, no account
            needed.
          </p>
        </section>
      )}

      <div className="grid gap-10 py-10 lg:grid-cols-[1.4fr_1fr]">
        {/* Last matches played, as results rather than cards. */}
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-sm font-bold uppercase tracking-widest text-steel-400">
              Latest results
            </h2>
            <Link
              href="/matches"
              className="font-display text-[11px] uppercase tracking-widest text-rust-400 hover:text-rust-300"
            >
              All matches
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="mt-4 text-sm text-steel-500">
              Nothing recorded yet. Results appear here once a night is played.
            </p>
          ) : (
            <ul className="mt-3">
              {recent.map((match) => (
                <li
                  key={`${match.archiveDay}-${match.sourceMatchId}`}
                  className="border-t border-basalt-800 first:border-t-0"
                >
                  <Link
                    href={`/matches/${match.archiveDay}/${match.sourceMatchId}`}
                    className="group flex items-center gap-4 py-2.5"
                  >
                    <span className="font-mono text-lg tabular-nums">
                      <span
                        className={
                          match.winner === "red" ? "text-rust-400" : "text-steel-600"
                        }
                      >
                        {match.redScore}
                      </span>
                      <span className="mx-1 text-steel-700">-</span>
                      <span
                        className={
                          match.winner === "blue" ? "text-oxide-400" : "text-steel-600"
                        }
                      >
                        {match.blueScore}
                      </span>
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-steel-200 group-hover:text-rust-300">
                        {match.mapName}
                      </span>
                      <span className="text-[11px] text-steel-600">
                        {dayLabel(match.archiveDay)} · {matchTime(match.startedAt)}
                        {match.overtime ? " · overtime" : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Who is on form. */}
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-sm font-bold uppercase tracking-widest text-steel-400">
              Most frags
            </h2>
            <Link
              href="/players"
              className="font-display text-[11px] uppercase tracking-widest text-rust-400 hover:text-rust-300"
            >
              All players
            </Link>
          </div>

          {leaders.length === 0 ? (
            <p className="mt-4 text-sm text-steel-500">Nobody on record yet.</p>
          ) : (
            <ol className="mt-3">
              {leaders.map((player, index) => (
                <li
                  key={player.name}
                  className="border-t border-basalt-800 first:border-t-0"
                >
                  <Link
                    href={`/players/${encodeURIComponent(player.name)}`}
                    className="group flex items-baseline gap-3 py-2.5"
                  >
                    <span className="w-4 shrink-0 font-display text-sm tabular-nums text-steel-700">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-steel-200 group-hover:text-rust-300">
                      {player.name}
                    </span>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-steel-300">
                      {player.kills}
                    </span>
                    <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-steel-600">
                      {player.caps} caps
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Closing line rather than a card. */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-basalt-800 pt-6">
        <p className="max-w-xl text-sm leading-relaxed text-steel-400">
          Games are arranged in Discord. Everything played on the server is recorded
          here, permanently, and you never need an account to read any of it.
        </p>
        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0 rounded-sm bg-rust-500 px-5 py-2.5 font-display text-xs font-semibold uppercase tracking-widest text-steel-100 transition-colors hover:bg-rust-400"
        >
          Join the Discord
        </a>
      </div>

      {latest ? (
        <p className="mt-6 text-[11px] text-steel-700">
          Last night archived: {dayLabel(latest)}.
        </p>
      ) : null}
    </div>
  );
}
