import Link from "next/link";

import type {
  DaySummary,
  MatchDetail,
  MatchLink,
  MatchSummary,
  PublicScoreRow,
} from "@/lib/matches/queries";
import { dayLabel, duration, matchTime } from "@/components/match-archive";
import { MapShot } from "@/components/map-shot";
import {
  UNSOUND_SHOOTING_NOTE,
  accuracyOf,
  shootingIsSound,
} from "@/lib/matches/accuracy";
import { tookPart } from "@/lib/matches/participation";
import { MatchFootageList } from "@/components/match-footage";
import { footageForMatch } from "@/lib/match-videos";
import { FootageMark } from "@/components/footage-mark";

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
    // Recomputed from the counters rather than trusting the stored `accuracy`,
    // which is hits over shots and is therefore nonsense whenever the counters
    // are. A dash when the record cannot support a figure; the raw hits and
    // shots are still under "All statistics" for anyone diagnosing it.
    key: "accuracy",
    label: "Acc",
    format: (r) => {
      const value = accuracyOf(r.shotsHit, r.shotsFired);
      return value === null ? "-" : percent(value);
    },
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
  // The number that did not exist before: drives you carried longest and
  // somebody else touched down.
  { key: "leadCarries", label: "Lead carries" },
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

  /*
   * The side is carried by the plate's top edge as well as the caption colour.
   *
   * Two scoreboards side by side in identical grey, distinguished only by a
   * small coloured word, meant working out which was which every time. An edge
   * is readable from the corner of the eye.
   */
  const edge =
    team === "red" ? "plate-red" : team === "blue" ? "plate-blue" : "";

  return (
    <div className={`plate ${edge} overflow-x-auto`}>
      <table className="w-full text-sm">
        <caption className="px-3 pt-3 text-left font-display text-xs font-bold uppercase tracking-[0.18em]">
          <span className={TEAM_TEXT[team] ?? "text-steel-200"}>
            {team || "unassigned"}
          </span>
        </caption>
        <thead>
          <tr>
            <th className="px-3 py-1.5 text-left font-display text-[0.625rem] uppercase tracking-widest text-steel-500">
              Player
            </th>
            {shown.map((column) => (
              <th
                key={String(column.key)}
                className="px-2 py-1.5 text-right font-display text-[0.625rem] uppercase tracking-widest text-steel-500"
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
/**
 * A step arrow that keeps its space when there is nowhere to go.
 *
 * Rendering these conditionally made the whole strip jump: match 1 had no
 * previous, so its pills sat one button to the left of every other match's, and
 * the row you were reading moved under the cursor as you stepped through the
 * night. A disabled placeholder of the same width holds the line still.
 */
function Step({ to, label }: { to: MatchLink | null; label: string }) {
  const shape =
    "flex w-16 shrink-0 items-center justify-center rounded-sm border px-2 py-1 " +
    "text-center font-display text-xs";

  if (!to) {
    return (
      <span
        aria-hidden="true"
        className={`${shape} border-basalt-800 bg-basalt-900 text-steel-700`}
      >
        {label}
      </span>
    );
  }

  return (
    <Link
      href={`/matches/${to.archiveDay}/${to.sourceMatchId}`}
      title={`${to.mapName}, ${dayLabel(to.archiveDay)}`}
      className={`${shape} border-basalt-700 bg-basalt-850 text-steel-400 hover:border-basalt-600 hover:text-steel-100`}
    >
      {label}
    </Link>
  );
}

/**
 * The night's running order.
 *
 * Reads as a sequence rather than a row of names: the number leads, the map
 * follows, the score trails. Fixed-width numbers mean the pills line up as a
 * column of 1 2 3 4 no matter how long the map names are.
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
    <div className="mt-4 flex flex-wrap items-stretch gap-2">
      <Step to={previous} label="Prev" />

      <ol className="flex min-w-0 flex-1 flex-wrap items-stretch gap-2">
        {siblings.map((sibling) => {
          const current = sibling.sourceMatchId === match.sourceMatchId;
          return (
            <li key={sibling.id} className="min-w-0">
              <Link
                href={`/matches/${match.archiveDay}/${sibling.sourceMatchId}`}
                aria-current={current ? "page" : undefined}
                className={
                  "flex h-full items-center gap-2 rounded-sm border px-2.5 py-1 text-xs transition-colors " +
                  (current
                    ? "border-rust-500 bg-rust-500/10"
                    : "border-basalt-700 bg-basalt-850 hover:border-basalt-600")
                }
              >
                <span
                  className={
                    "w-4 shrink-0 text-center font-display text-sm font-bold tabular-nums " +
                    (current ? "text-rust-400" : "text-steel-600")
                  }
                >
                  {sibling.number}
                </span>
                <FootageMark
                  archiveDay={match.archiveDay}
                  sourceMatchId={sibling.sourceMatchId}
                />
                <span
                  className={
                    "truncate " + (current ? "text-rust-300" : "text-steel-300")
                  }
                >
                  {sibling.mapName}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-steel-500">
                  {sibling.redScore}-{sibling.blueScore}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      <Step to={next} label="Next" />

      {days.length > 1 ? (
        <Link
          href="/matches"
          className="shrink-0 rounded-sm border border-basalt-700 bg-basalt-850 px-2.5 py-1 font-display text-xs text-steel-400 hover:text-steel-100"
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
  // Everyone who actually played. A row on a team with nothing at all recorded
  // is somebody who never entered the game, and listing them made a two against
  // two read as a three against three. See participation.ts.
  const active = match.players.filter(tookPart);
  const teams = [...new Set(active.map((p) => p.team))];
  const spectators = match.players.filter((p) => p.spectator);

  const position = siblings.find(
    (s) => s.sourceMatchId === match.sourceMatchId,
  )?.number;

  /**
   * Team sizes rather than a headcount. These are always N against N, so "3v3"
   * tells a player what kind of game it was in a way "6 players" does not. An
   * uneven match says so, since 3v2 is worth knowing when reading a scoreboard.
   */
  const teamSizes = (() => {
    const sizes = teams.map((team) => active.filter((p) => p.team === team).length);
    if (sizes.length === 2) return `${sizes[0]}v${sizes[1]}`;
    return `${active.length} players`;
  })();

  /** A full regulation match. Anything else is worth putting on the page. */
  const REGULATION_SECONDS = 600;
  const playedSeconds =
    match.startedAt && match.endedAt
      ? Math.round((match.endedAt.getTime() - match.startedAt.getTime()) / 1000)
      : null;

  const notableDuration = (() => {
    if (playedSeconds === null) return null;
    const clockText = duration(match.startedAt, match.endedAt);
    if (match.overtime) return `overtime, ${clockText}`;
    // A tolerance, because the recorded start and end are a second or two off
    // the round timer and a match that ran 9:58 did not end early.
    if (Math.abs(playedSeconds - REGULATION_SECONDS) > 20) return `ran ${clockText}`;
    return null;
  })();

  // Frags by weapon, per player, counted from the frag log we already store.
  const weaponsByPlayer = new Map<string, { weapon: string; kills: number }[]>();
  {
    const tally = new Map<string, Map<string, number>>();
    for (const kill of match.kills) {
      if (kill.suicide || !kill.killerName || !kill.weapon) continue;
      const forPlayer = tally.get(kill.killerName) ?? new Map<string, number>();
      forPlayer.set(kill.weapon, (forPlayer.get(kill.weapon) ?? 0) + 1);
      tally.set(kill.killerName, forPlayer);
    }
    for (const [name, weapons] of tally) {
      weaponsByPlayer.set(
        name,
        [...weapons.entries()]
          .map(([weapon, kills]) => ({ weapon, kills }))
          .sort((a, b) => b.kills - a.kills),
      );
    }
  }

  const totalKills = active.reduce((sum, p) => sum + p.kills, 0);

  // Team accuracy adds up only the players whose counters agree with themselves.
  // One broken row would otherwise carry the whole side's figure past 100% and
  // make the sound records look wrong too.
  const soundShooters = active.filter((p) => shootingIsSound(p.shotsHit, p.shotsFired));
  const shotsFired = soundShooters.reduce((sum, p) => sum + p.shotsFired, 0);
  const shotsHit = soundShooters.reduce((sum, p) => sum + p.shotsHit, 0);
  const excludedShooters = active.length - soundShooters.length;

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

      {/*
        The map, beside its own name.

        A name is enough to look a level up and not enough to recognise it, and
        these maps look nothing like one another. Kept to a thumbnail rather than
        a banner: it should say where without pushing the scoreboard down the
        page. Dropped entirely on narrow screens, where that trade goes the other
        way.
      */}
      <div className="mt-1 flex items-start gap-4">
        <MapShot
          mapName={match.mapName}
          className="hidden w-28 shrink-0 sm:block"
          sizes="112px"
        />

        <div className="min-w-0 flex-1">
      {/* Title, score and the whole summary on one line each. */}
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <h1 className="font-display text-2xl font-bold text-steel-100">
          {/* The night's running order, so the sequence is obvious from the
              title rather than only from the strip below it. */}
          {position ? (
            <span className="mr-2 text-steel-500">Match {position}</span>
          ) : null}
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
          {match.mode} · {matchTime(match.startedAt)} · {teamSizes}
          {/* Duration only when it says something. Nearly every match runs the
              full ten minutes, so printing 10:00 on all of them is noise. It
              earns its place when the match went to overtime or ended early. */}
          {notableDuration ? ` · ${notableDuration}` : ""}
          {match.status !== "final" ? ` · ${match.status}` : ""}
        </span>
      </div>
        </div>
      </div>

      <MatchNav
        days={days}
        siblings={siblings}
        match={match}
        previous={previous}
        next={next}
      />

      {/* The write-up comes first: it says what happened, and the figures below
          are there to check it against. Prose nobody wrote is labelled as such,
          especially on a site whose value is that its information is reliable. */}
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
          <p className="mt-3 text-[0.6875rem] text-steel-600">
            Written automatically from the scoreboard and event log
            {match.reportModel ? ` by ${match.reportModel}` : ""}. It can only use the
            figures recorded on this page.
          </p>
        </div>
      ) : null}

      {/* Footage of this match, where somebody recorded it. */}
      <MatchFootageList
        footage={footageForMatch(match.archiveDay, match.sourceMatchId)}
        heading="Watch this match"
        className="mt-6"
      />

      {/*
        The night's figures, split into what the match was and who did it.

        Was one long line mixing three totals with three names, all at the same
        weight, so nothing led and the eye had nowhere to start. The totals are
        figures; the standouts are people, and people want their names readable
        rather than set as statistics.
      */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="plate p-4">
          <h2 className="rule-heading">The match</h2>
          <dl className="mt-3 grid grid-cols-3 gap-4">
            <div>
              <dt className="figure-label">Frags</dt>
              <dd className="figure-value mt-0.5 font-mono text-xl">{totalKills}</dd>
            </div>
            <div>
              <dt className="figure-label">Captures</dt>
              <dd className="figure-value mt-0.5 font-mono text-xl">
                {match.captures.length}
              </dd>
            </div>
            <div>
              <dt className="figure-label">Accuracy</dt>
              <dd className="figure-value mt-0.5 font-mono text-xl">
                {shotsFired > 0 ? percent(shotsHit / shotsFired) : "-"}
              </dd>
              {excludedShooters > 0 ? (
                <dd
                  className="mt-0.5 text-[0.6875rem] leading-snug text-steel-600"
                  title={UNSOUND_SHOOTING_NOTE}
                >
                  {excludedShooters === 1 ? "1 player" : `${excludedShooters} players`}{" "}
                  left out
                </dd>
              ) : null}
            </div>
          </dl>
        </div>

        {topScorer || topKiller || topCapper ? (
          <div className="plate p-4">
            <h2 className="rule-heading">Who stood out</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              {topScorer ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="figure-label">Top score</dt>
                  <dd className="min-w-0 truncate text-right">
                    <PlayerLink name={topScorer.name} />{" "}
                    <span className="font-mono tabular-nums text-steel-400">
                      {topScorer.score}
                    </span>
                  </dd>
                </div>
              ) : null}
              {topKiller ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="figure-label">Most frags</dt>
                  <dd className="min-w-0 truncate text-right">
                    <PlayerLink name={topKiller.name} />{" "}
                    <span className="font-mono tabular-nums text-steel-400">
                      {topKiller.kills}
                    </span>
                  </dd>
                </div>
              ) : null}
              {topCapper ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="figure-label">Most caps</dt>
                  <dd className="min-w-0 truncate text-right">
                    <PlayerLink name={topCapper.name} />{" "}
                    <span className="font-mono tabular-nums text-steel-400">
                      {topCapper.caps}
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}
      </div>

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

          {/*
            Two sources, deliberately. The 2.1 broadcaster records shots and
            hits per weapon, which is the real thing and gives accuracy. Matches
            archived before that upgrade have none and never will, since it was
            never recorded, so those fall back to counting frags out of the kill
            log. The heading says which you are looking at rather than quietly
            showing less.
          */}
          {active.some((p) => p.weaponStats.length > 0) ? (
            <div>
              <h3 className="mb-2 font-display text-[0.625rem] uppercase tracking-widest text-steel-500">
                Weapons
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {active
                  .filter((p) => p.weaponStats.length > 0)
                  .map((player) => (
                    <div key={player.name} className="panel p-3">
                      <p className="text-xs text-steel-300">{player.name}</p>
                      <table className="mt-1.5 w-full text-xs">
                        <thead>
                          <tr>
                            {["Weapon", "Frags", "Hits", "Shots", "Acc"].map((h, i) => (
                              <th
                                key={h}
                                className={
                                  "py-0.5 font-display text-[0.5625rem] uppercase tracking-widest text-steel-600 " +
                                  (i === 0 ? "text-left" : "text-right")
                                }
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {player.weaponStats.map((w) => (
                            <tr key={w.weapon}>
                              <td className="py-0.5 text-steel-400">{w.weapon}</td>
                              <td className="py-0.5 text-right font-mono tabular-nums text-steel-300">
                                {w.kills}
                              </td>
                              <td className="py-0.5 text-right font-mono tabular-nums text-steel-500">
                                {Math.round(w.shotsHit)}
                              </td>
                              <td className="py-0.5 text-right font-mono tabular-nums text-steel-500">
                                {Math.round(w.shotsFired)}
                              </td>
                              {/* The per weapon figure is where the rail counter
                                  breaks, so this is the row that has to withhold
                                  it. The hits and shots either side stay exactly
                                  as recorded, which is what makes it diagnosable. */}
                              <td
                                className="py-0.5 text-right font-mono tabular-nums text-steel-400"
                                title={
                                  shootingIsSound(w.shotsHit, w.shotsFired)
                                    ? undefined
                                    : UNSOUND_SHOOTING_NOTE
                                }
                              >
                                {accuracyOf(w.shotsHit, w.shotsFired) === null
                                  ? "-"
                                  : percent(accuracyOf(w.shotsHit, w.shotsFired)!)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </div>
            </div>
          ) : weaponsByPlayer.size > 0 ? (
            <div>
              <h3 className="mb-2 font-display text-[0.625rem] uppercase tracking-widest text-steel-500">
                Frags by weapon
              </h3>
              <p className="mb-2 text-[0.6875rem] text-steel-600">
                Counted from the frag log. This match predates per weapon shot
                tracking, so accuracy per weapon is not available for it.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {[...weaponsByPlayer.entries()].map(([name, weapons]) => (
                  <li key={name} className="text-xs">
                    <span className="text-steel-300">{name}</span>
                    <span className="text-steel-500">
                      {" "}
                      {weapons.map((w) => `${w.weapon} ${w.kills}`).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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
                      "font-display text-[0.625rem] font-semibold uppercase tracking-wider " +
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
