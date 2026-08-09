import type { Metadata } from "next";
import Link from "next/link";

import { StatsTabs } from "@/components/stats-tabs";
import { accuracyOf, accuracyPercent } from "@/lib/matches/accuracy";
import { perMinute, timePlayed } from "@/lib/dm/format";
import { dmTotals, listDmPlayers } from "@/lib/dm/queries";
import { dayLabel } from "@/components/match-archive";

export const metadata: Metadata = {
  title: "Deathmatch stats",
  description:
    "The deathmatch record: time on the server, frags and rates, for everyone who has played on the RF4U DM server.",
};

export const revalidate = 300;

export default async function DmStatsPage() {
  const [players, totals] = await Promise.all([listDmPlayers(), dmTotals()]);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-basalt-800 py-2.5">
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.14em] text-steel-100">Stats</h1>
        <p className="font-mono text-xs text-steel-600">
          <span className="text-steel-300">all time</span> ·{" "}
          <span className="text-steel-300">{players.length}</span> players ·{" "}
          <span className="text-steel-300">{totals.rounds}</span> rounds ·{" "}
          <span className="text-steel-300">{timePlayed(totals.secondsPlayed)}</span> played
        </p>
      </div>

      <StatsTabs active="dm" />

      {/*
        What this page is, said before the table: the frame here is different
        from every other page on the site and a reader deserves to know why the
        first column is a clock.
      */}
      <p className="mt-6 max-w-3xl text-sm leading-relaxed text-steel-400">
        The DM server has no matches. Maps load, people join, people play, and
        nobody ever wins &mdash; so the record is <em>time on the server</em>,
        and every total carries a rate beside it, because on a server with no
        final whistle a total mostly measures attendance. Recording started{" "}
        {totals.firstDay ? dayLabel(totals.firstDay) : "recently"}.
      </p>

      {players.length === 0 ? (
        <div className="panel mt-8 p-8 text-center">
          <p className="text-sm text-steel-400">
            Nothing recorded yet. The first casual session on the DM server
            fills this page on its own.
          </p>
        </div>
      ) : (
        <div className="panel mt-6 overflow-x-auto">
          <table className="w-full text-[0.8125rem]">
            <thead>
              <tr className="border-b border-basalt-700 text-left">
                {[
                  "Player",
                  "Time played",
                  "Frags",
                  "/min",
                  "Deaths",
                  "Acc",
                  "Best streak",
                  "Powerups",
                  "Last seen",
                ].map((label, i) => (
                  <th
                    key={label}
                    className={
                      "whitespace-nowrap px-3 py-2 font-display text-[0.6875rem] uppercase tracking-widest text-steel-400" +
                      (i > 0 ? " text-right" : "")
                    }
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const accuracy = accuracyOf(player.shotsHit, player.shotsFired);
                return (
                  <tr key={player.name} className="border-b border-basalt-800">
                    <td className="px-3 py-2">
                      {/* The player page shows the CTF and DM records side by
                          side, so the same page serves both games. */}
                      <Link
                        href={`/players/${encodeURIComponent(player.name)}`}
                        className="text-steel-200 hover:text-rust-300"
                      >
                        {player.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-100">
                      {timePlayed(player.secondsPlayed)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {player.kills}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-400">
                      {perMinute(player.kills, player.secondsPlayed)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {player.deaths}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {accuracy === null ? "—" : accuracyPercent(accuracy)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {player.bestStreak}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {player.powerups}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-500">
                      {player.lastSeen ? dayLabel(player.lastSeen) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-[0.6875rem] text-steel-600">
        A deathmatch frag and a CTF frag are different things, so nothing on
        this page is mixed into the boards under{" "}
        <Link href="/stats" className="underline decoration-basalt-600 underline-offset-2 hover:text-steel-400">
          Capture the Flag
        </Link>
        . Powerups count the damage amplifiers, invulnerabilities, super armor
        and super health picked up, on the maps that have them.
      </p>
    </div>
  );
}
