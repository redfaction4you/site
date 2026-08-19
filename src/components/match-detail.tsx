import Link from "next/link";

import type {
  MatchDetail,
  MatchSummary,
  PublicScoreRow,
} from "@/lib/matches/queries";
import { recordsBrokenOnNight } from "@/lib/matches/queries";
import { dayLabel, duration, matchTime } from "@/components/match-archive";
import { MapShot } from "@/components/map-shot";
import {
  UNSOUND_SHOOTING_NOTE,
  accuracyOf,
  accuracyPercent,
  shootingIsSound,
} from "@/lib/matches/accuracy";
import { mapSlug } from "@/lib/matches/maps";
import { tookPart } from "@/lib/matches/participation";
import {
  CANCELLED_NOTE,
  matchSeconds,
  wasCancelled,
} from "@/lib/matches/completion";
import { MatchFootageList } from "@/components/match-footage";
import { footageForMatch } from "@/lib/match-footage";
import { FootageMark } from "@/components/footage-mark";
import { MatchTimeline } from "@/components/match-timeline";
import { PlayerLink } from "@/components/player-link";
import { buildTimeline } from "@/lib/matches/timeline";

const percent = accuracyPercent;

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
  blue: "text-cobalt-400",
};

// `PlayerLink` moved to its own file when the frag log became its own page.

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
    label: "Best run",
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
          {players.map((player, index) => (
            <tr key={`${player.team}-${player.name}-${index}`} className="border-t border-basalt-700">
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
 * The night's running order, as one strip.
 *
 * It was a wrapping grid of bordered boxes with a Prev box, a Next box and an
 * "All 4 nights" box mixed in among the matches, so eight games became two rows
 * of tiles that all looked like the same kind of thing whether they were a match
 * or a navigation control. Sixty four pixels of chrome, and it read as a puzzle.
 *
 * One scrolling row now, matches only, in the order they were played. Previous
 * and next are redundant with it: the strip is already the whole night and the
 * match either side is right there. Reaching another night is the archive link,
 * which lives with the breadcrumb where every other page keeps it.
 */
function MatchNav({
  siblings,
  match,
}: {
  siblings: MatchSummary[];
  match: MatchDetail;
}) {
  return (
    <nav aria-label="Matches this night" className="relative mt-3">
      <ol className="scrollbar-none flex gap-1 overflow-x-auto pb-0.5">
        {siblings.map((sibling) => {
          const current = sibling.sourceMatchId === match.sourceMatchId;
          return (
            <li key={sibling.id} className="shrink-0">
              <Link
                href={`/matches/${match.archiveDay}/${sibling.sourceMatchId}`}
                aria-current={current ? "page" : undefined}
                title={sibling.mapName}
                className={
                  "flex items-center gap-1.5 border-b-2 px-2 py-1 text-xs transition-colors " +
                  (current
                    ? "border-rust-500 text-rust-300"
                    : "border-transparent text-steel-400 hover:border-basalt-500 hover:text-steel-100")
                }
              >
                <span
                  className={
                    "font-display text-[0.625rem] font-bold tabular-nums " +
                    (current ? "text-rust-400" : "text-steel-600")
                  }
                >
                  {sibling.number}
                </span>
                <span className="max-w-[9rem] truncate">{sibling.mapName}</span>
                <FootageMark
                  archiveDay={match.archiveDay}
                  sourceMatchId={sibling.sourceMatchId}
                />
                <span className="shrink-0 font-mono tabular-nums text-steel-600">
                  {sibling.redScore}-{sibling.blueScore}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-basalt-950 to-transparent"
      />
    </nav>
  );
}

export async function MatchDetailView({
  match,
  siblings,
}: {
  match: MatchDetail;
  siblings: MatchSummary[];
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
  const playedSeconds = matchSeconds(match);

  // Short enough that it was abandoned and restarted rather than played out.
  // The same rule the totals use, so a match marked here is exactly a match
  // missing from them. See completion.ts.
  const cancelled = wasCancelled(match);

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
  const footage = await footageForMatch(match.archiveDay, match.sourceMatchId);
  // The records that fell in THIS match, for the strip under the scoreboard.
  // Same computation the night article's note uses, filtered to one match.
  const matchRecords = (await recordsBrokenOnNight(match.archiveDay)).filter(
    (record) => record.sourceMatchId === match.sourceMatchId,
  );

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
          {/*
            The scoreline, as the thing the page is about.

            It used to be a title with the score set beside it at the same weight
            as the map name, so a page reporting a result opened by reporting a
            filename. Every sports page in the world leads with the number,
            because that is the one thing every reader came for, and the loser's
            score is dimmed so the outcome is legible without reading the words.
          */}
          <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-steel-500">
            {position ? `Match ${position} · ` : ""}
            {/* The name doubles as the route to the map's record — asked for by
                the owner, and the same text that was already here rather than a
                new control. */}
            <Link
              href={`/matches/map/${mapSlug(match.mapName)}`}
              className="hover:text-steel-300"
            >
              {match.mapName}
            </Link>
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="flex items-center gap-3 font-mono text-4xl leading-none tabular-nums sm:text-5xl">
              <span
                className={
                  match.winner === "red"
                    ? "text-rust-400"
                    : "text-steel-500 opacity-70"
                }
              >
                {match.redScore}
              </span>
              <span className="text-2xl text-steel-700">/</span>
              <span
                className={
                  match.winner === "blue"
                    ? "text-cobalt-400"
                    : "text-steel-500 opacity-70"
                }
              >
                {match.blueScore}
              </span>
            </p>

            <div className="flex flex-wrap items-center gap-1.5">
              {/*
                A result, in the words the result had.

                The badge printed "{winner} won" for whatever the column held, so
                a drawn match announced "tie won", and it took its colour from
                "not red", which put a blue plate on a match blue had not won.
                A tie is neither side's, so it is neither colour. A cancelled
                start has no result at all and says so instead: it carries a
                winner in the database like every other row.
              */}
              {match.winner && !cancelled ? (
                <span
                  className={
                    "rounded-sm px-2 py-0.5 font-display text-[0.625rem] font-bold uppercase tracking-widest " +
                    (match.winner === "red"
                      ? "bg-rust-500/15 text-rust-300"
                      : match.winner === "blue"
                        ? "bg-cobalt-400/15 text-cobalt-300"
                        : "bg-basalt-700/60 text-steel-300")
                  }
                >
                  {match.winner === "red" || match.winner === "blue"
                    ? `${match.winner} won`
                    : "Tie"}
                </span>
              ) : null}
              {/* Overtime is the most interesting thing a match can be and it was
                  buried at the end of a run of metadata. */}
              {match.overtime ? (
                <span className="rounded-sm border border-oxide-500/50 px-2 py-0.5 font-display text-[0.625rem] font-bold uppercase tracking-widest text-oxide-400">
                  Overtime
                </span>
              ) : null}
              {match.status !== "final" ? (
                <span className="rounded-sm border border-basalt-600 px-2 py-0.5 font-display text-[0.625rem] font-bold uppercase tracking-widest text-steel-400">
                  {match.status}
                </span>
              ) : null}
              {/* The score above is the loudest thing on the page and a
                  cancelled start has one like any other match. Said here, next
                  to it, rather than left to be inferred from a duration further
                  down that most readers have no reason to check. */}
              {cancelled ? (
                <span className="rounded-sm border border-basalt-600 px-2 py-0.5 font-display text-[0.625rem] font-bold uppercase tracking-widest text-steel-400">
                  Cancelled
                </span>
              ) : null}
            </div>
          </div>

          <p className="mt-2 text-sm text-steel-400">
            {match.mode} · {matchTime(match.startedAt)} · {teamSizes}
            {/* Duration only when it says something. Nearly every match runs the
                full ten minutes, so printing 10:00 on all of them is noise. */}
            {notableDuration ? ` · ${notableDuration}` : ""}
          </p>

          {cancelled ? (
            <p className="mt-1.5 max-w-prose text-[0.6875rem] leading-snug text-steel-500">
              {CANCELLED_NOTE}
            </p>
          ) : null}
        </div>
      </div>

      <MatchNav siblings={siblings} match={match} />

      {/*
        The scoreboard, immediately.

        This block used to sit at 925px on a 720px screen, under a written
        report, a capture chart and a panel of match facts, with a comment on it
        reading "this is the reason for everything above". It was, and it was
        the last thing anybody could see. Everything a reader opens a match page
        for is here, so it goes first and the things derived from it follow.
      */}
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

      {/*
        Records that fell in this match, said on the match itself.

        The night's article carries the same note pointing here; this is the
        other direction (owner, 7 August 2026): somebody browsing matches should
        see where a record fell and have a route to the write-up and the player.
        Computed by `recordsBrokenOnNight`, never written by the model.
      */}
      {matchRecords.length > 0 ? (
        <div className="plate mt-4 border-l-2 border-l-oxide-400 p-3">
          <ul className="space-y-1.5">
            {matchRecords.map((record) => (
              <li
                key={`${record.kind}-${record.mapName}`}
                className="text-sm leading-relaxed text-steel-300"
              >
                <span className="text-oxide-400" aria-hidden="true">
                  ★{" "}
                </span>
                {record.kind === "fastest-run"
                  ? `New fastest run on ${record.mapName} — ${(record.value / 1000).toFixed(2)}s`
                  : record.kind === "best-streak"
                    ? `New best streak in one match — ${record.value}`
                    : record.kind === "most-caps"
                      ? `New record for captures in one match — ${record.value}`
                      : `The biggest win on record — by ${record.value}`}
                {record.playerName ? (
                  <>
                    {" "}
                    by <PlayerLink name={record.playerName} />
                  </>
                ) : null}
                <span className="text-steel-500">
                  {" "}
                  ·{" "}
                  <Link
                    href={`/news/${match.archiveDay}`}
                    className="hover:text-rust-300"
                  >
                    the night&rsquo;s write-up
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/*
        The written report, under the result it describes and above the chart
        that explains it — the order the owner asked for on 7 August 2026:
        scoreboard, then what happened, then how it was won. It opened the page
        once and that was backwards; the scoreboard still leads. Prose nobody
        wrote is still labelled as such.
      */}
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

      {/*
        How the match went, and the footage of it, side by side.

        The timeline used to sit near the bottom beside the collapsed event
        streams, which is where a reader arrives having already scrolled past
        everything it explains. It is the clearest thing on the page, so it goes
        where the page is still being read. Where nobody filmed the match it
        takes the whole width rather than leaving a hole.
      */}
      {match.captures.length || footage.length ? (
        <div
          className={
            "mt-6 grid gap-4 " + (footage.length ? "lg:grid-cols-[3fr_2fr]" : "")
          }
        >
          {match.captures.length || match.flagEvents.length ? (
            <div className="plate p-4">
              <h2 className="rule-heading">How it was won</h2>
              {/*
                Built on the server, where the whole event log already is.
                Sending four hundred kills to the browser to bucket them into
                forty numbers would be the page's largest payload by far, and
                the layers are a way of reading the match rather than a thing
                the reader is editing.
              */}
              <MatchTimeline
                timeline={buildTimeline({
                  flagEvents: match.flagEvents,
                  kills: match.kills,
                  captures: match.captures,
                  startedAt: match.startedAt,
                  endedAt: match.endedAt,
                })}
                captures={match.captures}
                startedAt={match.startedAt}
                endedAt={match.endedAt}
                redScore={match.redScore}
                blueScore={match.blueScore}
              />
            </div>
          ) : null}

          <MatchFootageList footage={footage} heading="Watch this match" />
        </div>
      ) : null}

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
                  .map((player, index) => (
                    <div key={`${player.name}-${index}`} className="panel p-3">
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

      <div className="mt-4">
        {/* Event streams, collapsed. */}
        <div className="grid gap-3 lg:grid-cols-2">
          {/*
            The frag log is a link, not a list.

            It used to render here inside a closed `<details>`, every row of it,
            and it was by a long way the most expensive thing this site served:
            match 21 on 31 July weighed 749 kB, of which 465 kB was the React
            payload, and 750 of the page's 774 player links were this one list.
            Every visitor downloaded all of it — once as markup and again as
            serialised component data — to read a scoreboard, and the triangle
            stayed shut.

            Nothing is truncated. The whole log is one click away on a URL
            somebody can link to, which is the same trade every filter here
            makes.
          */}
          {match.kills.length > 0 ? (
            <Link
              href={`/matches/${match.archiveDay}/${match.sourceMatchId}/frags`}
              className="panel flex items-baseline justify-between p-3 hover:border-rust-500"
            >
              <span className="font-display text-xs font-semibold text-steel-200">
                Frags <span className="text-steel-500">({match.kills.length})</span>
              </span>
              <span className="font-mono text-[0.625rem] text-steel-600">
                open the log
              </span>
            </Link>
          ) : null}

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
