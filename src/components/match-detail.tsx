import Link from "next/link";

import type { MatchDetail, PublicScoreRow } from "@/lib/matches/queries";
import { dayLabel, duration, matchTime } from "@/components/match-archive";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function seconds(ms: number): string {
  if (!ms) return "—";
  const total = Math.round(ms / 1000);
  return total >= 60 ? `${Math.floor(total / 60)}m ${total % 60}s` : `${total}s`;
}

function clock(elapsed: number): string {
  return `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
}

const TEAM_TEXT: Record<string, string> = {
  red: "text-rust-400",
  blue: "text-oxide-400",
};

/**
 * One team's scoreboard.
 *
 * Kills, deaths and captures first, because that is what people look for.
 * Accuracy and flag work after, because they are what distinguishes a good
 * night from a lucky one.
 */
function Scoreboard({ team, players }: { team: string; players: PublicScoreRow[] }) {
  if (players.length === 0) return null;

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[44rem] text-sm">
        <caption className="px-4 pt-4 text-left font-display text-sm font-bold uppercase tracking-wider">
          <span className={TEAM_TEXT[team] ?? "text-steel-200"}>{team || "unassigned"}</span>
        </caption>
        <thead>
          <tr className="text-left">
            {["Player", "Score", "K", "D", "Caps", "Acc", "Flag held", "Returns", "Assists"].map(
              (heading, i) => (
                <th
                  key={heading}
                  className={
                    "px-3 py-2 font-display text-[11px] uppercase tracking-widest text-steel-500 " +
                    (i === 0 ? "" : "text-right")
                  }
                >
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={`${player.team}-${player.name}`} className="border-t border-basalt-700">
              <td className="px-3 py-2 text-steel-200">{player.name}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-100">
                {player.score}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-300">
                {player.kills}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-400">
                {player.deaths}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-300">
                {player.caps}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-400">
                {player.shotsFired > 0 ? percent(player.accuracy) : "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-400">
                {seconds(player.flagHoldMs)}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-400">
                {player.flagReturns || "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-400">
                {player.captureAssists || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MatchDetailView({ match }: { match: MatchDetail }) {
  const teams = [...new Set(match.players.filter((p) => !p.spectator).map((p) => p.team))];
  const spectators = match.players.filter((p) => p.spectator);

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <p className="eyebrow">
        <Link href="/matches" className="hover:text-rust-300">
          Matches
        </Link>
        <span className="mx-2 text-steel-600">/</span>
        <Link href={`/matches/${match.archiveDay}`} className="hover:text-rust-300">
          {dayLabel(match.archiveDay)}
        </Link>
      </p>

      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">
        {match.mapName}
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-steel-400">
        <span className="font-mono text-2xl tabular-nums">
          <span className={match.winner === "red" ? "text-rust-400" : "text-steel-500"}>
            {match.redScore}
          </span>
          <span className="mx-2 text-steel-600">–</span>
          <span className={match.winner === "blue" ? "text-oxide-400" : "text-steel-500"}>
            {match.blueScore}
          </span>
        </span>
        <span>{match.mode}</span>
        <span>Started {matchTime(match.startedAt)}</span>
        <span>Ran {duration(match.startedAt, match.endedAt)}</span>
        {match.overtime ? <span className="text-oxide-400">Overtime</span> : null}
        {match.status !== "final" ? (
          <span className="text-oxide-400">Status: {match.status}</span>
        ) : null}
      </div>

      <div className="mt-8 space-y-4">
        {teams.map((team) => (
          <Scoreboard
            key={team}
            team={team}
            players={match.players.filter((p) => !p.spectator && p.team === team)}
          />
        ))}
      </div>

      {spectators.length ? (
        <p className="mt-4 text-xs text-steel-500">
          Spectating: {spectators.map((p) => p.name).join(", ")}
        </p>
      ) : null}

      {match.captures.length ? (
        <section className="mt-10">
          <h2 className="font-display text-lg font-bold text-steel-100">Captures</h2>
          <ol className="mt-4 space-y-2">
            {match.captures.map((capture, i) => (
              <li
                key={`${capture.elapsedSeconds}-${i}`}
                className="panel flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3 text-sm"
              >
                <span className="font-mono tabular-nums text-steel-500">
                  {clock(capture.elapsedSeconds)}
                </span>
                <span
                  className={
                    "font-display text-xs font-semibold uppercase tracking-wider " +
                    (TEAM_TEXT[capture.team] ?? "text-steel-300")
                  }
                >
                  {capture.team}
                </span>
                <span className="text-steel-200">{capture.playerName ?? "Unknown"}</span>
                <span className="font-mono tabular-nums text-steel-500">
                  {capture.redScore}–{capture.blueScore}
                </span>
                {capture.assists.length ? (
                  <span className="text-xs text-steel-500">
                    assisted by {capture.assists.join(", ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
