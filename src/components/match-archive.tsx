import Link from "next/link";

import type { DaySummary, MatchSummary } from "@/lib/matches/queries";
import { ARCHIVE_TIME_ZONE } from "@/lib/matches/sanitize";

/** Renders a UTC instant in the archive's own timezone, so times read as played. */
export function matchTime(value: Date | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ARCHIVE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

export function dayLabel(day: string): string {
  // Parse as UTC noon: the string is already a local calendar day, and we only
  // want its name. Midnight would risk tipping into the previous day.
  const date = new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/**
 * `30 Jul`, for rails where the full label does not fit.
 *
 * No year and no weekday. Both are noise in a list of the last few nights, and
 * the full form is a click away on every one of them.
 */
export function shortDayLabel(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(date);
}

export function duration(from: Date | null, to: Date | null): string {
  if (!from || !to) return "-";
  const seconds = Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function TeamScore({
  red,
  blue,
  winner,
}: {
  red: number;
  blue: number;
  winner: string | null;
}) {
  return (
    <span className="font-mono text-lg tabular-nums">
      <span className={winner === "red" ? "text-rust-400" : "text-steel-400"}>{red}</span>
      <span className="mx-1.5 text-steel-600">–</span>
      <span className={winner === "blue" ? "text-oxide-400" : "text-steel-400"}>
        {blue}
      </span>
    </span>
  );
}

/** The list of nights down the side. Every one is a real, linkable URL. */
export function DaySelector({
  days,
  selected,
}: {
  days: DaySummary[];
  selected: string;
}) {
  return (
    <nav aria-label="Match nights" className="space-y-1">
      {days.map((day) => {
        const active = day.archiveDay === selected;
        return (
          <Link
            key={day.archiveDay}
            href={`/matches/${day.archiveDay}`}
            aria-current={active ? "page" : undefined}
            className={
              "block rounded-sm border px-3 py-2 transition-colors " +
              (active
                ? "border-rust-500 bg-rust-500/10"
                : "border-basalt-700 bg-basalt-850 hover:border-basalt-600")
            }
          >
            <span
              className={
                "block font-display text-sm font-semibold " +
                (active ? "text-rust-300" : "text-steel-200")
              }
            >
              {dayLabel(day.archiveDay)}
            </span>
            <span className="mt-0.5 block text-xs text-steel-500">
              {day.matchCount} {day.matchCount === 1 ? "match" : "matches"}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function MatchList({
  archiveDay,
  matches,
}: {
  archiveDay: string;
  matches: MatchSummary[];
}) {
  if (matches.length === 0) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm text-steel-400">No matches recorded for this night.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {matches.map((match) => (
        <li key={match.id}>
          <Link
            href={`/matches/${archiveDay}/${match.sourceMatchId}`}
            className="panel group flex flex-wrap items-center justify-between gap-4 p-4"
          >
            <div className="min-w-0">
              <h3 className="truncate font-display text-base font-semibold text-steel-100 transition-colors group-hover:text-rust-300">
                {match.mapName}
              </h3>
              <p className="mt-0.5 text-xs text-steel-500">
                {match.mode} · {matchTime(match.startedAt)} ·{" "}
                {duration(match.startedAt, match.endedAt)} · {match.playerCount} players
                {match.overtime ? " · overtime" : ""}
                {match.status !== "final" ? ` · ${match.status}` : ""}
              </p>
            </div>
            <TeamScore red={match.redScore} blue={match.blueScore} winner={match.winner} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function EmptyArchive() {
  return (
    <div className="panel mt-10 p-8 text-center">
      <h2 className="font-display text-xl font-bold text-steel-100">
        No matches recorded yet
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-steel-400">
        The archive is live and waiting for its first sync from the dedicated server.
        Results appear here automatically once a match night finishes.
      </p>
    </div>
  );
}
