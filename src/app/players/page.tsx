import type { Metadata } from "next";
import Link from "next/link";

import { UNSOUND_SHOOTING_NOTE } from "@/lib/matches/accuracy";
import { listPlayers, recentForm } from "@/lib/matches/queries";
import { FormRun } from "@/components/form-run";

export const metadata: Metadata = {
  title: "Players",
  description:
    "Everyone who has played on the RedFaction4You server, with their record across every archived match.",
  /**
   * Not indexed by search engines, on purpose.
   *
   * The scoreboard data here is not private: everyone in the match saw those
   * numbers, and the community server browser already lists who is playing.
   * What changes with a profile is aggregation and permanence, and the part
   * that actually feels invasive is searchability. Nobody signed up to have
   * their handle turn up in a web search because they played a game.
   *
   * `follow` stays on so the links still lead crawlers to the match pages,
   * which are the archive proper. This is done with a meta tag rather than a
   * robots.txt rule on purpose: a disallow rule stops crawlers reading the
   * page, which means they never see the instruction not to index it.
   */
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default async function PlayersPage() {
  const [players, form] = await Promise.all([listPlayers(), recentForm()]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <p className="eyebrow">Archive</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">Players</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-steel-300">
        Everyone who has played a recorded match, and how they did across all of them.
      </p>

      {/* This page is who played. Pairings is who they played it with, which is
          the question the totals below cannot answer. */}
      <p className="mt-4">
        <Link
          href="/players/pairings"
          className="font-display text-[0.6875rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
        >
          Who plays with whom
        </Link>
      </p>

      {players.length === 0 ? (
        <div className="panel mt-10 p-8 text-center">
          <p className="text-sm text-steel-400">
            No matches recorded yet, so there is nobody to list.
          </p>
        </div>
      ) : (
        <>
          <div className="panel mt-8 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {[
                    "Player",
                    "Form",
                    "Matches",
                    "Frags",
                    "Deaths",
                    "F/D",
                    "Caps",
                    "Lead carries",
                    "Acc",
                    "Streak",
                  ].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={
                          "px-3 py-2 font-display text-[0.6875rem] uppercase tracking-widest text-steel-500 " +
                          (i === 0 ? "text-left" : "text-right")
                        }
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {players.map((player) => {
                  const kd =
                    player.deaths > 0 ? player.kills / player.deaths : player.kills;
                  return (
                    <tr key={player.name} className="border-t border-basalt-700">
                      <td className="px-3 py-2">
                        <Link
                          href={`/players/${encodeURIComponent(player.name)}`}
                          className="font-semibold text-steel-100 hover:text-rust-300"
                        >
                          {player.name}
                        </Link>
                      </td>
                      {/* Who is playing well now, which a table of career totals
                          cannot say and which is also partly a ranking of who
                          turns up most. */}
                      <td className="whitespace-nowrap px-3 py-2">
                        <FormRun
                          results={(form.get(player.name.toLowerCase()) ?? []).map(
                            (won) => ({ won }),
                          )}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-300">
                        {player.matchesPlayed}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-200">
                        {player.kills}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-400">
                        {player.deaths}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-300">
                        {kd.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-300">
                        {player.caps}
                      </td>
                      <td
                        className="px-3 py-2 text-right font-mono tabular-nums text-steel-400"
                        title="Drives this player carried furthest and a teammate finished"
                      >
                        {player.leadCarries || "-"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-400">
                        {player.shotsFired > 0
                          ? percent(player.shotsHit / player.shotsFired)
                          : "-"}
                        {/* Totalled from the matches whose counters agree with
                            themselves, so a reader is not silently shown a
                            figure covering less than their whole record. */}
                        {player.unsoundShootingMatches > 0 ? (
                          <span
                            className="ml-1 text-steel-600"
                            title={`${UNSOUND_SHOOTING_NOTE} ${player.unsoundShootingMatches} of their matches are left out of this figure.`}
                          >
                            *
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-400">
                        {player.bestStreak}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-xs leading-relaxed text-steel-500">
            Grouped by player name, which Red Faction does not reserve or make unique.
            Two people using the same name appear as one row; anyone who renamed appears
            as two.
          </p>

          {players.some((player) => player.unsoundShootingMatches > 0) ? (
            <p className="mt-3 text-xs leading-relaxed text-steel-600">
              An accuracy marked with an asterisk leaves out one or more matches
              where the server recorded more hits than shots for that player,
              which happens on the rail maps. Those matches count in every other
              column; only the accuracy is affected.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
