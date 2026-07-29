import Link from "next/link";

import type {
  DaySummary,
  MatchDetail,
  MatchLink,
  MatchSummary,
  PublicScoreRow,
} from "@/lib/matches/queries";
import { dayLabel, duration, matchTime } from "@/components/match-archive";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function seconds(ms: number): string {
  if (!ms) return "-";
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

type ScoreColumn = {
  key: keyof PublicScoreRow;
  label: string;
  format?: (row: PublicScoreRow) => string;
};

/**
 * What a scoreboard shows at a glance.
 *
 * Six columns fit a half-width table without sideways scrolling, which is what
 * lets both teams sit next to each other on one screen. Everything else the
 * server records is still here, one click away under "All statistics", rather
 * than forcing a horizontal scrollbar on the thing people read most.
 */
const CORE_COLUMNS: ScoreColumn[] = [
  { key: "score", label: "Score" },
  { key: "kills", label: "Frags" },
  { key: "deaths", label: "Deaths" },
  { key: "caps", label: "Caps" },
  {
    key: "accuracy",
    label: "Acc",
    format: (r) => (r.shotsFired > 0 ? percent(r.accuracy) : "-"),
  },
];

const EXTRA_COLUMNS: ScoreColumn[] = [
  { key: "maxStreak", label: "Streak" },
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
  { key: "flagCarrierKills", label: "Carrier frags" },
  { key: "captureAssists", label: "Assists" },
  {
    key: "fastestCaptureMs",
    label: "Best cap",
    format: (r) => (r.fastestCaptureMs ? seconds(r.fastestCaptureMs) : "-"),
  },
];

/** Drops columns nobody in this match has a value for. */
function used(columns: ScoreColumn[], players: PublicScoreRow[]): ScoreColumn[] {
  return columns.filter((column) =>
    players.some((p) => {
      const raw = p[column.key];
      return typeof raw === "number" && raw !== 0;
    }),
  );
}

function Scoreboard({
  team,
  players,
  columns,
}: {
  team: string;
  players: PublicScoreRow[];
  columns: ScoreColumn[];
}) {
  if (players.length === 0) return null;
  const shown = used(columns, players);

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="px-3 pt-3 text-left font-display text-xs font-bold uppercase tracking-wider">
          <span className={TEAM_TEXT[team] ?? "text-steel-200"}>
            {team || "unassigned"}
          </span>
        </caption>
        <thead>
          <tr>
            <th className="px-3 py-1.5 text-left font-display text-[10px] uppercase tracking-widest text-steel-500">
              Player
            </th>
            {shown.map((column) => (
              <th
                key={String(column.key)}
                className="px-2 py-1.5 text-right font-display text-[10px] uppercase tracking-widest text-steel-500"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={`${player.team}-${player.name}`} className="border-t border-basalt-700">
              <td className="max-w-[10rem] truncate px-3 py-1.5">
                <PlayerLink name={player.name} />
              </td>
              {shown.map((column) => (
                <td
                  key={String(column.key)}
                  className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums text-steel-300"
                >
                  {column.format
                    ? column.format(player)
                    : String(player[column.key] ?? "-")}
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
    <details className="panel">
      <summary className="cursor-pointer p-3 font-display text-xs font-semibold text-steel-200 hover:text-rust-300">
        {title} <span className="text-steel-500">({count})</span>
      </summary>
      <div className="max-h-[26rem] overflow-y-auto border-t border-basalt-700">
        {children}
      </div>
    </details>
  );
}

/**
 * Match navigation as a horizontal strip rather than a sidebar.
 *
 * A sidebar costs a fixed slice of every screen, which is exactly the width the
 * two scoreboards need to sit side by side. Across the top it costs one line.
 */
function MatchNav({
  days,
  siblings,
  match,
  previous,
  next,
}: {
  days: DaySummary[];
  siblings: MatchSummary[];
  match: MatchDetail;
  previous: MatchLink | null;
  next: MatchLink | null;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {previous ? (
        <Link
          href={`/matches/${previous.archiveDay}/${previous.sourceMatchId}`}
          title={`${previous.mapName}, ${dayLabel(previous.archiveDay)}`}
          className="rounded-sm border border-basalt-700 bg-basalt-850 px-2 py-1 font-display text-xs text-steel-400 hover:text-steel-100"
        >
          &larr; Prev
        </Link>
      ) : null}

      {siblings.map((sibling) => {
        const current = sibling.sourceMatchId === match.sourceMatchId;
        return (
          <Link
            key={sibling.id}
            href={`/matches/${match.archiveDay}/${sibling.sourceMatchId}`}
            aria-current={current ? "page" : undefined}
            className={
              "max-w-[14rem] truncate rounded-sm border px-2.5 py-1 text-xs transition-colors " +
              (current
                ? "border-rust-500 bg-rust-500/10 text-rust-300"
                : "border-basalt-700 bg-basalt-850 text-steel-400 hover:text-steel-200")
            }
          >
            {sibling.mapName}
            <span className="ml-1.5 font-mono text-steel-500">
              {sibling.redScore}-{sibling.blueScore}
            </span>
          </Link>
        );
      })}

      {next ? (
        <Link
          href={`/matches/${next.archiveDay}/${next.sourceMatchId}`}
          title={`${next.mapName}, ${dayLabel(next.archiveDay)}`}
          className="rounded-sm border border-basalt-700 bg-basalt-850 px-2 py-1 font-display text-xs text-steel-400 hover:text-steel-100"
        >
          Next &rarr;
        </Link>
      ) : null}

      {days.length > 1 ? (
        <Link
          href="/matches"
          className="ml-auto rounded-sm border border-basalt-700 bg-basalt-850 px-2.5 py-1 font-display text-xs text-steel-400 hover:text-steel-100"
        >
          All {days.length} nights
        </Link>
      ) : null}
    </div>
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
  siblings: MatchSummary[];
  previous: MatchLink | null;
  next: MatchLink | null;
}) {
  const active = match.players.filter((p) => !p.spectator);
  const teams = [...new Set(active.map((p) => p.team))];
  const spectators = match.players.filter((p) => p.spectator);

  const totalKills = active.reduce((sum, p) => sum + p.kills, 0);
  const shotsFired = active.reduce((sum, p) => sum + p.shotsFired, 0);
  const shotsHit = active.reduce((sum, p) => sum + p.shotsHit, 0);

  const top = (key: keyof PublicScoreRow) =>
    active.reduce<PublicScoreRow | null>(
      (best, p) => (!best || (p[key] as number) > (best[key] as number) ? p : best),
      null,
    );
  const topScorer = top("score");
  const topKiller = top("kills");
  const topCapper = active.some((p) => p.caps > 0) ? top("caps") : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <p className="eyebrow">
        <Link href="/matches" className="hover:text-rust-300">
          Matches
        </Link>
        <span className="mx-2 text-steel-600">/</span>
        <Link href={`/matches/${match.archiveDay}`} className="hover:text-rust-300">
          {dayLabel(match.archiveDay)}
        </Link>
      </p>

      {/* Title, score and the whole summary on one line each. */}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <h1 className="font-display text-2xl font-bold text-steel-100">
          {match.mapName}
        </h1>
        <span className="font-mono text-2xl tabular-nums">
          <span className={match.winner === "red" ? "text-rust-400" : "text-steel-500"}>
            {match.redScore}
          </span>
          <span className="mx-1.5 text-steel-600">-</span>
          <span className={match.winner === "blue" ? "text-oxide-400" : "text-steel-500"}>
            {match.blueScore}
          </span>
        </span>
        <span className="text-sm text-steel-400">
          {match.mode} · {matchTime(match.startedAt)} ·{" "}
          {duration(match.startedAt, match.endedAt)} · {active.length} players
          {match.overtime ? " · overtime" : ""}
          {match.status !== "final" ? ` · ${match.status}` : ""}
        </span>
      </div>

      <MatchNav
        days={days}
        siblings={siblings}
        match={match}
        previous={previous}
        next={next}
      />

      {/* Summary as a single line of figures. */}
      <div className="panel mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-2 p-4 text-sm">
        <span className="text-steel-400">
          <span className="font-mono text-lg text-steel-100">{totalKills}</span> frags
        </span>
        <span className="text-steel-400">
          <span className="font-mono text-lg text-steel-100">
            {shotsFired > 0 ? percent(shotsHit / shotsFired) : "-"}
          </span>{" "}
          team accuracy
        </span>
        <span className="text-steel-400">
          <span className="font-mono text-lg text-steel-100">
            {match.captures.length}
          </span>{" "}
          captures
        </span>
        {topScorer ? (
          <span className="text-steel-400">
            Top score <PlayerLink name={topScorer.name} />{" "}
            <span className="font-mono text-steel-200">{topScorer.score}</span>
          </span>
        ) : null}
        {topKiller ? (
          <span className="text-steel-400">
            Most frags <PlayerLink name={topKiller.name} />{" "}
            <span className="font-mono text-steel-200">{topKiller.kills}</span>
          </span>
        ) : null}
        {topCapper ? (
          <span className="text-steel-400">
            Most caps <PlayerLink name={topCapper.name} />{" "}
            <span className="font-mono text-steel-200">{topCapper.caps}</span>
          </span>
        ) : null}
      </div>

      {/* The report, labelled. Prose nobody wrote should say so, especially on
          a site whose value is that its information can be trusted. */}
      {match.report ? (
        <div className="panel mt-4 p-4">
          <div className="space-y-2.5 text-sm leading-relaxed text-steel-300">
            {match.report
              .split(/\n{2,}/)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean)
              .map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
          </div>
          <p className="mt-3 text-[11px] text-steel-600">
            Written automatically from the scoreboard and event log
            {match.reportModel ? ` by ${match.reportModel}` : ""}. It can only use the
            figures recorded on this page.
          </p>
        </div>
      ) : null}

      {/* Both teams side by side. This is the reason for everything above. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {teams.map((team) => (
          <Scoreboard
            key={team}
            team={team}
            players={active.filter((p) => p.team === team)}
            columns={CORE_COLUMNS}
          />
        ))}
      </div>

      {spectators.length ? (
        <p className="mt-2 text-xs text-steel-500">
          Spectating: {spectators.map((p) => p.name).join(", ")}
        </p>
      ) : null}

      {/* Everything the server records, without pushing it onto the front. */}
      <details className="panel mt-4">
        <summary className="cursor-pointer p-3 font-display text-xs font-semibold text-steel-200 hover:text-rust-300">
          All statistics
        </summary>
        <div className="space-y-4 border-t border-basalt-700 p-3">
          {teams.map((team) => (
            <Scoreboard
              key={team}
              team={team}
              players={active.filter((p) => p.team === team)}
              columns={[...CORE_COLUMNS, ...EXTRA_COLUMNS]}
            />
          ))}
        </div>
      </details>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Captures, the short list that is worth reading in full. */}
        {match.captures.length ? (
          <div className="panel p-4">
            <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-steel-500">
              Capture timeline
            </h2>
            <ol className="mt-3 space-y-1.5 text-sm">
              {match.captures.map((capture, i) => (
                <li
                  key={`${capture.elapsedSeconds}-${i}`}
                  className="flex flex-wrap items-baseline gap-x-2.5"
                >
                  <span className="font-mono tabular-nums text-steel-500">
                    {clock(capture.elapsedSeconds)}
                  </span>
                  <span
                    className={
                      "font-display text-[10px] font-semibold uppercase tracking-wider " +
                      (TEAM_TEXT[capture.team] ?? "text-steel-300")
                    }
                  >
                    {capture.team}
                  </span>
                  <PlayerLink name={capture.playerName} />
                  <span className="font-mono tabular-nums text-steel-500">
                    {capture.redScore}-{capture.blueScore}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {/* Event streams, collapsed. */}
        <div className="space-y-3">
          <EventSection title="Frags" count={match.kills.length}>
            <table className="w-full text-sm">
              <tbody>
                {match.kills.map((kill, i) => (
                  <tr key={i} className="border-b border-basalt-800 last:border-0">
                    <td className="w-14 px-3 py-1 font-mono tabular-nums text-steel-500">
                      {clock(kill.elapsedSeconds)}
                    </td>
                    <td className="px-2 py-1 text-steel-400">
                      {kill.suicide ? (
                        <>
                          <PlayerLink name={kill.victimName} /> died
                        </>
                      ) : (
                        <>
                          <PlayerLink name={kill.killerName} />
                          <span className="mx-1.5 text-steel-600">fragged</span>
                          <PlayerLink name={kill.victimName} />
                        </>
                      )}
                      {kill.teamKill ? (
                        <span className="ml-2 text-xs text-rust-400">team frag</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-1 text-right text-xs text-steel-500">
                      {kill.weapon ?? ""}
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
                    <td className="w-14 px-3 py-1 font-mono tabular-nums text-steel-500">
                      {clock(event.elapsedSeconds)}
                    </td>
                    <td className="px-2 py-1 text-steel-400">
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
                    <td className="w-14 px-3 py-1 font-mono tabular-nums text-steel-500">
                      {clock(event.elapsedSeconds)}
                    </td>
                    <td className="px-2 py-1 text-steel-400">
                      <PlayerLink name={event.playerName} />
                      <span className="mx-1.5 text-steel-600">{event.eventType}</span>
                      {event.fromTeam || event.toTeam ? (
                        <span className="text-steel-500">
                          {event.fromTeam ?? "?"} to {event.toTeam ?? "?"}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </EventSection>
        </div>
      </div>
    </div>
  );
}
