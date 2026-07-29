import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { dayLabel, matchTime } from "@/components/match-archive";
import { getPlayer, getPlayerMatches } from "@/lib/matches/queries";

type Props = { params: Promise<{ name: string }> };

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function seconds(ms: number): string {
  if (!ms) return "—";
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${total % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const player = await getPlayer(decodeURIComponent(name));
  if (!player) return { title: "Player not found" };

  return {
    title: player.name,
    description: `${player.name} on the RedFaction4You server: ${player.matchesPlayed} matches, ${player.kills} kills, ${player.caps} captures.`,
  };
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel p-4">
      <dt className="font-display text-[11px] uppercase tracking-widest text-steel-500">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-2xl tabular-nums text-steel-100">{value}</dd>
      {hint ? <dd className="mt-0.5 text-xs text-steel-500">{hint}</dd> : null}
    </div>
  );
}

export default async function PlayerPage({ params }: Props) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);

  const [player, history] = await Promise.all([
    getPlayer(decoded),
    getPlayerMatches(decoded),
  ]);

  if (!player) notFound();

  const kd = player.deaths > 0 ? player.kills / player.deaths : player.kills;
  const accuracy = player.shotsFired > 0 ? player.shotsHit / player.shotsFired : null;
  const wins = history.filter((m) => m.won === true).length;
  const losses = history.filter((m) => m.won === false).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <p className="eyebrow">
        <Link href="/players" className="hover:text-rust-300">
          Players
        </Link>
      </p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">
        {player.name}
      </h1>
      <p className="mt-3 text-sm text-steel-400">
        {player.matchesPlayed} {player.matchesPlayed === 1 ? "match" : "matches"}
        {player.firstSeen ? ` · first seen ${dayLabel(player.firstSeen)}` : ""}
        {player.lastSeen && player.lastSeen !== player.firstSeen
          ? ` · last seen ${dayLabel(player.lastSeen)}`
          : ""}
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Record" value={`${wins}–${losses}`} hint="wins and losses" />
        <Stat
          label="Kills"
          value={String(player.kills)}
          hint={`${player.deaths} deaths`}
        />
        <Stat label="K/D" value={kd.toFixed(2)} />
        <Stat label="Captures" value={String(player.caps)} />
        <Stat
          label="Accuracy"
          value={accuracy === null ? "—" : percent(accuracy)}
          hint={
            accuracy === null
              ? undefined
              : `${Math.round(player.shotsHit)} of ${Math.round(player.shotsFired)}`
          }
        />
        <Stat label="Best streak" value={String(player.bestStreak)} />
        <Stat label="Flag time" value={seconds(player.flagHoldMs)} />
        <Stat
          label="Fastest cap"
          value={player.fastestCaptureMs ? seconds(player.fastestCaptureMs) : "—"}
        />
      </dl>

      <section className="mt-12">
        <h2 className="font-display text-lg font-bold text-steel-100">Match history</h2>
        <div className="panel mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {["Date", "Map", "Team", "Result", "Score", "K", "D", "Caps", "Acc"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={
                        "px-3 py-2 font-display text-[11px] uppercase tracking-widest text-steel-500 " +
                        (i < 2 ? "text-left" : "text-right")
                      }
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr
                  key={`${row.archiveDay}-${row.sourceMatchId}-${row.team}`}
                  className="border-t border-basalt-700"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-steel-400">
                    <Link
                      href={`/matches/${row.archiveDay}/${row.sourceMatchId}`}
                      className="hover:text-rust-300"
                    >
                      {row.archiveDay}
                    </Link>
                    <span className="ml-2 text-xs text-steel-600">
                      {matchTime(row.startedAt)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/matches/${row.archiveDay}/${row.sourceMatchId}`}
                      className="text-steel-200 hover:text-rust-300"
                    >
                      {row.mapName}
                    </Link>
                  </td>
                  <td
                    className={
                      "px-3 py-2 text-right font-display text-xs uppercase tracking-wider " +
                      (row.team === "red"
                        ? "text-rust-400"
                        : row.team === "blue"
                          ? "text-oxide-400"
                          : "text-steel-500")
                    }
                  >
                    {row.team}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.won === null ? (
                      <span className="text-steel-500">—</span>
                    ) : row.won ? (
                      <span className="text-signal-green">won</span>
                    ) : (
                      <span className="text-steel-500">lost</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-400">
                    {row.redScore}–{row.blueScore}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-200">
                    {row.kills}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-400">
                    {row.deaths}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-300">
                    {row.caps}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-400">
                    {row.accuracy > 0 ? percent(row.accuracy) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-8 text-xs leading-relaxed text-steel-500">
        Statistics are grouped by player name. A Red Faction name is neither unique nor
        reserved, so two people who used the same name appear here as one, and anyone who
        renamed appears as two. Linking accounts to in-game identities properly is
        planned; until then this is the honest limit of what the data supports.
      </p>
    </div>
  );
}
