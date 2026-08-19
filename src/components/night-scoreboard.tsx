import Link from "next/link";

import { UNSOUND_SHOOTING_NOTE, accuracyOf } from "@/lib/matches/accuracy";

/**
 * Everybody who played that night, with everything recorded about them.
 *
 * It used to be five columns in a two hundred and seventy pixel rail: rank,
 * name, score, frags, caps. Everything else the archive holds about the evening
 * was a click away on a player page, or on six separate match pages, so the one
 * page named after the night was the page that said least about it.
 *
 * Ordered by score, which is what the game ranks on and what the column headed
 * Score means. In CTF a capture is worth many frags, which is why the frag
 * leader is often not at the top and why the ordering would look broken without
 * that column present.
 *
 * The denominator is the point of the last column. People drop in and out
 * across an evening, so a total is partly a measure of who stayed, and 189 from
 * four matches is a different claim from 189 from seven.
 */
export function NightScoreboard({
  players,
  matchCount,
}: {
  players: {
    name: string;
    score: number;
    kills: number;
    deaths: number;
    caps: number;
    matchesPlayed: number;
    shotsHit: number;
    shotsFired: number;
    unsoundShootingMatches: number;
    damageGiven: number;
    bestStreak: number;
    flagReturns: number;
  }[];
  matchCount: number;
}) {
  if (players.length === 0) return null;

  const columns = [
    "Score",
    "Frags",
    "Deaths",
    "F/D",
    "Caps",
    "Returns",
    "Acc",
    "Damage",
    "Streak",
    "Played",
  ];

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="whitespace-nowrap border-b border-basalt-700 px-2 py-1 text-left font-display text-[0.5625rem] uppercase tracking-wider text-steel-500">
              Player
            </th>
            {columns.map((label) => (
              <th
                key={label}
                className="whitespace-nowrap border-b border-basalt-700 px-2 py-1 text-right font-display text-[0.5625rem] uppercase tracking-wider text-steel-500"
                title={
                  label === "Played"
                    ? "Matches they were in, of the matches that night"
                    : undefined
                }
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {players.map((player, index) => {
            const accuracy = accuracyOf(player.shotsHit, player.shotsFired);
            const kd =
              player.deaths > 0 ? player.kills / player.deaths : player.kills;

            return (
              <tr
                key={`${player.name}-${index}`}
                className="border-b border-basalt-800 odd:bg-steel-500/[0.04] hover:bg-rust-500/[0.07]"
              >
                <td className="whitespace-nowrap px-2 py-1">
                  <Link
                    href={`/players/${encodeURIComponent(player.name)}`}
                    className="text-xs text-steel-200 hover:text-rust-300"
                  >
                    {player.name}
                  </Link>
                </td>
                <td className="px-2 py-1 text-right font-mono text-[0.6875rem] tabular-nums text-steel-100">
                  {player.score}
                </td>
                <td className="px-2 py-1 text-right font-mono text-[0.6875rem] tabular-nums text-steel-200">
                  {player.kills}
                </td>
                <td className="px-2 py-1 text-right font-mono text-[0.6875rem] tabular-nums text-steel-500">
                  {player.deaths}
                </td>
                <td className="px-2 py-1 text-right font-mono text-[0.6875rem] tabular-nums text-steel-300">
                  {kd.toFixed(2)}
                </td>
                <td className="px-2 py-1 text-right font-mono text-[0.6875rem] tabular-nums text-steel-200">
                  {player.caps || <span className="text-steel-700">&ndash;</span>}
                </td>
                <td className="px-2 py-1 text-right font-mono text-[0.6875rem] tabular-nums text-steel-400">
                  {player.flagReturns || <span className="text-steel-700">&ndash;</span>}
                </td>
                <td
                  className="px-2 py-1 text-right font-mono text-[0.6875rem] tabular-nums text-steel-400"
                  title={
                    player.unsoundShootingMatches > 0
                      ? `${UNSOUND_SHOOTING_NOTE} ${player.unsoundShootingMatches} of their matches are left out of this figure.`
                      : undefined
                  }
                >
                  {accuracy === null ? (
                    <span className="text-steel-700">&ndash;</span>
                  ) : (
                    `${(accuracy * 100).toFixed(1)}%`
                  )}
                  {player.unsoundShootingMatches > 0 ? (
                    <span className="text-steel-700">*</span>
                  ) : null}
                </td>
                <td className="px-2 py-1 text-right font-mono text-[0.6875rem] tabular-nums text-steel-400">
                  {Math.round(player.damageGiven).toLocaleString("en-GB")}
                </td>
                <td className="px-2 py-1 text-right font-mono text-[0.6875rem] tabular-nums text-steel-400">
                  {player.bestStreak || <span className="text-steel-700">&ndash;</span>}
                </td>
                <td className="px-2 py-1 text-right font-mono text-[0.6875rem] tabular-nums text-steel-600">
                  {player.matchesPlayed}/{matchCount}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
