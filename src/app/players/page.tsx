import type { Metadata } from "next";
import Link from "next/link";

import { listPlayers } from "@/lib/matches/queries";

export const metadata: Metadata = {
  title: "Players",
  description:
    "Everyone who has played on the RedFaction4You server, with their record across every archived match.",
};

export const dynamic = "force-dynamic";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default async function PlayersPage() {
  const players = await listPlayers();

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <p className="eyebrow">Archive</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">Players</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-steel-300">
        Everyone who has played a recorded match, and how they did across all of them.
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
                  {["Player", "Matches", "Frags", "Deaths", "F/D", "Caps", "Acc", "Streak"].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={
                          "px-3 py-2 font-display text-[11px] uppercase tracking-widest text-steel-500 " +
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
                          className="text-steel-100 hover:text-rust-300"
                        >
                          {player.name}
                        </Link>
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
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-400">
                        {player.shotsFired > 0
                          ? percent(player.shotsHit / player.shotsFired)
                          : "—"}
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
        </>
      )}
    </div>
  );
}
