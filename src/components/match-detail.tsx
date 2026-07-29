import Link from "next/link";

import type {
  DaySummary,
  MatchDetail,
  MatchLink,
  MatchSummary,
  PublicScoreRow,
} from "@/lib/matches/queries";
import { DaySelector, dayLabel, duration, matchTime } from "@/components/match-archive";

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

/** Player names link to their record. Used everywhere a name appears. */
function PlayerLink({ name, className }: { name: string | null; className?: string }) {
  if (!name) return <span className="text-steel-500">unknown</span>;
  return (
    <Link
      href={`/players/${encodeURIComponent(name)}`}
      className={className ?? "text-steel-200 hover:text-rust-300 hover:underline"}
    >
      {name}
    </Link>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="font-display text-[11px] uppercase tracking-widest text-steel-500">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-lg tabular-nums text-steel-100">{value}</dd>
      {hint ? <dd className="text-xs text-steel-500">{hint}</dd> : null}
    </div>
  );
}

/**
 * The at-a-glance block.
 *
 * Everything here is derived from the scoreboard rather than stored, so it
 * cannot disagree with the table below it.
 */
function MatchSummaryPanel({ match }: { match: MatchDetail }) {
  const active = match.players.filter((p) => !p.spectator);
  const totalKills = active.reduce((sum, p) => sum + p.kills, 0);
  const shotsFired = active.reduce((sum, p) => sum + p.shotsFired, 0);
  const shotsHit = active.reduce((sum, p) => sum + p.shotsHit, 0);

  const top = (key: keyof PublicScoreRow) =>
    active.reduce<PublicScoreRow | null>(
      (best, p) => (!best || (p[key] as number) > (best[key] as number) ? p : best),
      null,
    );

  const topKiller = top("kills");
  const topScorer = top("score");
  const topCapper = active.some((p) => p.caps > 0) ? top("caps") : null;

  return (
    <div className="panel mt-8 p-6">
      <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Duration" value={duration(match.startedAt, match.endedAt)} />
        <Stat label="Players" value={String(active.length)} />
        <Stat label="Total kills" value={String(totalKills)} />
        <Stat
          label="Team accuracy"
          value={shotsFired > 0 ? percent(shotsHit / shotsFired) : "—"}
          hint={shotsFired > 0 ? `${shotsHit} of ${shotsFired}` : undefined}
        />
        <Stat label="Captures" value={String(match.captures.length)} />
        <Stat label="Flag events" value={String(match.flagEvents.length)} />
      </dl>

      <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-basalt-700 pt-4 text-sm">
        {topScorer ? (
          <p className="text-steel-400">
            <span className="text-steel-500">Top score </span>
            <PlayerLink name={topScorer.name} /> {topScorer.score}
          </p>
        ) : null}
        {topKiller ? (
          <p className="text-steel-400">
            <span className="text-steel-500">Most kills </span>
            <PlayerLink name={topKiller.name} /> {topKiller.kills}
          </p>
        ) : null}
        {topCapper ? (
          <p className="text-steel-400">
            <span className="text-steel-500">Most caps </span>
            <PlayerLink name={topCapper.name} /> {topCapper.caps}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type ScoreColumn = {
  key: keyof PublicScoreRow;
  label: string;
  format?: (row: PublicScoreRow) => string;
};

/** Every counter the server records, in the order they matter to a player. */
const SCORE_COLUMNS: ScoreColumn[] = [
  { key: "score", label: "Score" },
  { key: "kills", label: "K" },
  { key: "deaths", label: "D" },
  { key: "caps", label: "Caps" },
  { key: "maxStreak", label: "Streak" },
  {
    key: "accuracy",
    label: "Acc",
    format: (r) => (r.shotsFired > 0 ? percent(r.accuracy) : "—"),
  },
  { key: "shotsHit", label: "Hits", format: (r) => String(Math.round(r.shotsHit)) },
  { key: "shotsFired", label: "Shots", format: (r) => String(Math.round(r.shotsFired)) },
  {
    key: "damageGiven",
    label: "Dmg out",
    format: (r) => String(Math.round(r.damageGiven)),
  },
  {
    key: "damageTaken",
    label: "Dmg in",
    format: (r) => String(Math.round(r.damageTaken)),
  },
  { key: "flagHoldMs", label: "Flag held", format: (r) => seconds(r.flagHoldMs) },
  { key: "flagPickups", label: "Picks" },
  { key: "flagReturns", label: "Returns" },
  { key: "flagCarrierKills", label: "Carrier K" },
  { key: "captureAssists", label: "Assists" },
  {
    key: "fastestCaptureMs",
    label: "Best cap",
    format: (r) => (r.fastestCaptureMs ? seconds(r.fastestCaptureMs) : "—"),
  },
];

/**
 * A team's scoreboard, showing every counter the server records.
 *
 * Columns that are zero for everyone in this match are dropped, so a match
 * where nobody returned a flag does not carry a column of dashes. The table
 * scrolls sideways rather than hiding data on narrow screens.
 */
function Scoreboard({ team, players }: { team: string; players: PublicScoreRow[] }) {
  if (players.length === 0) return null;

  const columns = SCORE_COLUMNS.filter((column) =>
    // Keep a column only if somebody in this match has a value for it, so a
    // match where nobody returned a flag does not carry a column of dashes.
    players.some((p) => {
      const raw = p[column.key];
      return typeof raw === "number" && raw !== 0;
    }),
  );

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="px-4 pt-4 text-left font-display text-sm font-bold uppercase tracking-wider">
          <span className={TEAM_TEXT[team] ?? "text-steel-200"}>
            {team || "unassigned"}
          </span>
        </caption>
        <thead>
          <tr>
            <th className="px-3 py-2 text-left font-display text-[11px] uppercase tracking-widest text-steel-500">
              Player
            </th>
            {columns.map((column) => (
              <th
                key={String(column.key)}
                className="px-3 py-2 text-right font-display text-[11px] uppercase tracking-widest text-steel-500"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={`${player.team}-${player.name}`} className="border-t border-basalt-700">
              <td className="whitespace-nowrap px-3 py-2">
                <PlayerLink name={player.name} />
              </td>
              {columns.map((column) => (
                <td
                  key={String(column.key)}
                  className="px-3 py-2 text-right font-mono tabular-nums text-steel-300"
                >
                  {column.format
                    ? column.format(player)
                    : String(player[column.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Collapsed by default: a match can carry a few hundred of these. */
function EventSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <details className="panel mt-4">
      <summary className="cursor-pointer p-4 font-display text-sm font-semibold text-steel-200 hover:text-rust-300">
        {title} <span className="text-steel-500">({count})</span>
      </summary>
      <div className="max-h-[32rem] overflow-y-auto border-t border-basalt-700">
        {children}
      </div>
    </details>
  );
}

function PrevNext({
  previous,
  next,
}: {
  previous: MatchLink | null;
  next: MatchLink | null;
}) {
  return (
    <nav className="mt-10 flex items-stretch justify-between gap-4 border-t border-basalt-700 pt-6">
      {previous ? (
        <Link
          href={`/matches/${previous.archiveDay}/${previous.sourceMatchId}`}
          className="panel group min-w-0 flex-1 p-4"
        >
          <span className="font-display text-[11px] uppercase tracking-widest text-steel-500">
            ← Previous match
          </span>
          <span className="mt-1 block truncate text-sm text-steel-200 group-hover:text-rust-300">
            {previous.mapName}
          </span>
          <span className="text-xs text-steel-500">{dayLabel(previous.archiveDay)}</span>
        </Link>
      ) : (
        <span className="flex-1" />
      )}

      {next ? (
        <Link
          href={`/matches/${next.archiveDay}/${next.sourceMatchId}`}
          className="panel group min-w-0 flex-1 p-4 text-right"
        >
          <span className="font-display text-[11px] uppercase tracking-widest text-steel-500">
            Next match →
          </span>
          <span className="mt-1 block truncate text-sm text-steel-200 group-hover:text-rust-300">
            {next.mapName}
          </span>
          <span className="text-xs text-steel-500">{dayLabel(next.archiveDay)}</span>
        </Link>
      ) : (
        <span className="flex-1" />
      )}
    </nav>
  );
}

export function MatchDetailView({
  match,
  days,
  siblings,
  previous,
  next,
}: {
  match: MatchDetail;
  days: DaySummary[];
  /** The other matches that night, so the night stays navigable. */
  siblings: MatchSummary[];
  previous: MatchLink | null;
  next: MatchLink | null;
}) {
  const teams = [...new Set(match.players.filter((p) => !p.spectator).map((p) => p.team))];
  const spectators = match.players.filter((p) => p.spectator);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        {/* The calendar stays put, so moving around never needs the back button. */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <h2 className="mb-3 font-display text-xs uppercase tracking-widest text-steel-500">
            Match nights
          </h2>
          <DaySelector days={days} selected={match.archiveDay} />

          <h2 className="mb-3 mt-6 font-display text-xs uppercase tracking-widest text-steel-500">
            This night
          </h2>
          <ol className="space-y-1">
            {siblings.map((sibling) => {
              const current = sibling.sourceMatchId === match.sourceMatchId;
              return (
                <li key={sibling.id}>
                  <Link
                    href={`/matches/${match.archiveDay}/${sibling.sourceMatchId}`}
                    aria-current={current ? "page" : undefined}
                    className={
                      "block truncate rounded-sm border px-3 py-1.5 text-xs transition-colors " +
                      (current
                        ? "border-rust-500 bg-rust-500/10 text-rust-300"
                        : "border-basalt-700 bg-basalt-850 text-steel-400 hover:text-steel-200")
                    }
                  >
                    {sibling.mapName}
                    <span className="ml-1 font-mono text-steel-500">
                      {sibling.redScore}–{sibling.blueScore}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="min-w-0">
          <p className="eyebrow">
            <Link href="/matches" className="hover:text-rust-300">
              Matches
            </Link>
            <span className="mx-2 text-steel-600">/</span>
            <Link
              href={`/matches/${match.archiveDay}`}
              className="hover:text-rust-300"
            >
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
              <span
                className={match.winner === "blue" ? "text-oxide-400" : "text-steel-500"}
              >
                {match.blueScore}
              </span>
            </span>
            <span>{match.mode}</span>
            <span>Started {matchTime(match.startedAt)}</span>
            {match.overtime ? <span className="text-oxide-400">Overtime</span> : null}
            {match.status !== "final" ? (
              <span className="text-oxide-400">{match.status}</span>
            ) : null}
          </div>

          <MatchSummaryPanel match={match} />

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

          {/* --- Captures --- */}
          {match.captures.length ? (
            <section className="mt-10">
              <h2 className="font-display text-lg font-bold text-steel-100">
                Capture timeline
              </h2>
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
                    <PlayerLink name={capture.playerName} />
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

          {/* --- Event streams --- */}
          <section className="mt-10">
            <h2 className="font-display text-lg font-bold text-steel-100">
              Everything the server recorded
            </h2>

            <EventSection title="Kills" count={match.kills.length}>
              <table className="w-full text-sm">
                <tbody>
                  {match.kills.map((kill, i) => (
                    <tr key={i} className="border-b border-basalt-800 last:border-0">
                      <td className="w-16 px-3 py-1.5 font-mono tabular-nums text-steel-500">
                        {clock(kill.elapsedSeconds)}
                      </td>
                      <td className="px-3 py-1.5">
                        {kill.suicide ? (
                          <span className="text-steel-400">
                            <PlayerLink name={kill.victimName} /> died
                          </span>
                        ) : (
                          <span className="text-steel-400">
                            <PlayerLink name={kill.killerName} />
                            <span className="mx-1.5 text-steel-600">killed</span>
                            <PlayerLink name={kill.victimName} />
                          </span>
                        )}
                        {kill.teamKill ? (
                          <span className="ml-2 text-xs text-rust-400">team kill</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs text-steel-500">
                        {kill.weapon ?? ""}
                        {kill.flagContext ? ` · ${kill.flagContext}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </EventSection>

            <EventSection title="Flag events" count={match.flagEvents.length}>
              <table className="w-full text-sm">
                <tbody>
                  {match.flagEvents.map((event, i) => (
                    <tr key={i} className="border-b border-basalt-800 last:border-0">
                      <td className="w-16 px-3 py-1.5 font-mono tabular-nums text-steel-500">
                        {clock(event.elapsedSeconds)}
                      </td>
                      <td className="w-32 px-3 py-1.5 font-display text-[11px] uppercase tracking-wider text-steel-500">
                        {event.eventType}
                      </td>
                      <td className="px-3 py-1.5 text-steel-400">
                        {event.message || (
                          <>
                            <PlayerLink name={event.playerName} />
                            {event.flagOwner ? (
                              <span
                                className={
                                  "ml-2 " + (TEAM_TEXT[event.flagOwner] ?? "text-steel-500")
                                }
                              >
                                {event.flagOwner} flag
                              </span>
                            ) : null}
                          </>
                        )}
                        {event.recovery ? (
                          <span className="ml-2 text-xs text-signal-green">recovery</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs text-steel-500">
                        {event.carryMs ? seconds(event.carryMs) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </EventSection>

            <EventSection title="Roster changes" count={match.rosterEvents.length}>
              <table className="w-full text-sm">
                <tbody>
                  {match.rosterEvents.map((event, i) => (
                    <tr key={i} className="border-b border-basalt-800 last:border-0">
                      <td className="w-16 px-3 py-1.5 font-mono tabular-nums text-steel-500">
                        {clock(event.elapsedSeconds)}
                      </td>
                      <td className="px-3 py-1.5 text-steel-400">
                        <PlayerLink name={event.playerName} />
                        <span className="mx-1.5 text-steel-600">{event.eventType}</span>
                        {event.fromTeam || event.toTeam ? (
                          <span className="text-steel-500">
                            {event.fromTeam ?? "?"} → {event.toTeam ?? "?"}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </EventSection>
          </section>

          <PrevNext previous={previous} next={next} />
        </div>
      </div>
    </div>
  );
}
