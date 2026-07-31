import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { dayLabel, matchTime } from "@/components/match-archive";
import { MIN_MATCHES_FOR_PROFILE } from "@/lib/ai/player-profile";
import { UNSOUND_SHOOTING_NOTE, accuracyOf } from "@/lib/matches/accuracy";
import { BOARDS, rank } from "@/lib/matches/leaderboards";
import { PAIR_RATE_REQUIREMENT } from "@/lib/matches/pairings";
import {
  getPlayer,
  getPlayerMatches,
  getPlayerPairings,
  getPlayerProfile,
  listPlayers,
} from "@/lib/matches/queries";

type Props = { params: Promise<{ name: string }> };

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function seconds(ms: number): string {
  if (!ms) return "-";
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
    description: `${player.name} on the RedFaction4You server: ${player.matchesPlayed} matches, ${player.kills} frags, ${player.caps} captures.`,
    // See the note on /players. A player's handle should not become a search
    // result because they turned up to a game.
    robots: { index: false, follow: true },
  };
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel p-4">
      <dt className="font-display text-[0.6875rem] uppercase tracking-widest text-steel-500">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-2xl tabular-nums text-steel-100">{value}</dd>
      {hint ? <dd className="mt-0.5 text-xs text-steel-500">{hint}</dd> : null}
    </div>
  );
}


/** 1st, 2nd, 3rd. Only ever called with a small number. */
function ordinal(n: number): string {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

/**
 * A win rate, to the whole percent.
 *
 * Deliberately coarser than the accuracy figures above. Those are computed from
 * thousands of shots and a decimal place means something; a win rate comes from
 * a handful of matches, and printing 66.7% would dress five games up as a
 * measurement.
 */
function share(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function PairHead({ columns }: { columns: string[] }) {
  return (
    <thead>
      <tr>
        {columns.map((label, i) => (
          <th
            key={label}
            className={
              "px-3 py-2 font-display text-[0.6875rem] uppercase tracking-widest text-steel-500 " +
              (i === 0 ? "text-left" : "text-right")
            }
          >
            {label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function PairName({ name }: { name: string }) {
  return (
    <td className="px-3 py-2">
      <Link
        href={`/players/${encodeURIComponent(name)}`}
        className="text-steel-100 hover:text-rust-300"
      >
        {name}
      </Link>
    </td>
  );
}

export default async function PlayerPage({ params }: Props) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);

  const [player, history, profile, everyone, pairings] = await Promise.all([
    getPlayer(decoded),
    getPlayerMatches(decoded),
    getPlayerProfile(decoded),
    listPlayers(),
    getPlayerPairings(decoded),
  ]);

  if (!player) notFound();

  /*
   * Where this player actually stands, which the page never said.
   *
   * It listed their totals and left the reader to guess whether 123 frags is a
   * lot. A rank answers that in one word, and it is the link between this page
   * and the boards, which previously had no route to each other.
   *
   * Only placings worth mentioning. Fifth of six is not a distinction and
   * printing it would be a small unkindness dressed up as data.
   */
  const placings = BOARDS.map((board) => {
    const entries = rank(everyone, board);
    const position = entries.findIndex(
      (entry) => entry.player.name.toLowerCase() === player.name.toLowerCase(),
    );
    if (position === -1) return null;

    const entry = entries[position];
    const worthShowing = entry.rank <= 3 && entries.length >= 3;
    return worthShowing ? { board, rank: entry.rank, display: entry.display } : null;
  }).filter((placing): placing is NonNullable<typeof placing> => placing !== null);

  const kd = player.deaths > 0 ? player.kills / player.deaths : player.kills;
  // Already totalled from the sound matches only, so this cannot exceed 1. The
  // count of what was excluded rides along so the hint can say so.
  const accuracy = accuracyOf(player.shotsHit, player.shotsFired);
  const wins = history.filter((m) => m.won === true).length;
  const losses = history.filter((m) => m.won === false).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <p className="eyebrow">
        <Link href="/players" className="hover:text-rust-300">
          Players
        </Link>
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold text-steel-100">
        {player.name}
      </h1>
      <p className="mt-3 text-sm text-steel-400">
        {player.matchesPlayed} {player.matchesPlayed === 1 ? "match" : "matches"}
        {player.firstSeen ? ` · first seen ${dayLabel(player.firstSeen)}` : ""}
        {player.lastSeen && player.lastSeen !== player.firstSeen
          ? ` · last seen ${dayLabel(player.lastSeen)}`
          : ""}
      </p>

      {/* What they are like to play against, as opposed to what they scored.
          Labelled, like every other piece of writing on the site. */}
      {/*
          A profile describes a player, so it needs enough matches to be about
          one. The generator already refuses below this, but a stored profile can
          fall under it later: when rows that were never really played stopped
          counting, two players dropped from three matches to two and their
          profiles became undeletable by the generator, which only ever writes
          forward. Withheld here rather than trusted to stay valid.
      */}
      {profile && player.matchesPlayed >= MIN_MATCHES_FOR_PROFILE ? (
        <div className="panel mt-6 p-5">
          <div className="space-y-3 text-sm leading-relaxed text-steel-300">
            {profile.body
              .split(/\n{2,}/)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean)
              .map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
          </div>
          <p className="mt-3 text-[0.6875rem] text-steel-600">
            Written automatically from this record
            {profile.model ? ` by ${profile.model}` : ""}, after{" "}
            {profile.matchCount} {profile.matchCount === 1 ? "match" : "matches"}. It
            updates as more are played.
          </p>
        </div>
      ) : null}

      {/* The boards they place on, and the route to the rest of them. */}
      {placings.length ? (
        <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {placings.map((placing) => (
            <Link
              key={placing.board.key}
              href="/stats"
              className="group flex items-baseline gap-1.5 rounded-sm border border-basalt-700 bg-basalt-850 px-2 py-1 hover:border-rust-700"
            >
              <span
                className={
                  "font-display text-[0.625rem] font-bold uppercase tracking-widest " +
                  (placing.rank === 1 ? "text-rust-400" : "text-steel-500")
                }
              >
                {ordinal(placing.rank)}
              </span>
              <span className="text-xs text-steel-300 group-hover:text-steel-100">
                {placing.board.label.toLowerCase()}
              </span>
              <span className="font-mono text-[0.625rem] tabular-nums text-steel-600">
                {placing.display}
              </span>
            </Link>
          ))}
          <Link
            href="/stats"
            className="font-display text-[0.625rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
          >
            All boards
          </Link>
        </div>
      ) : null}

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Record" value={`${wins}–${losses}`} hint="wins and losses" />
        <Stat
          label="Frags"
          value={String(player.kills)}
          hint={`${player.deaths} deaths`}
        />
        <Stat label="F/D" value={kd.toFixed(2)} />
        <Stat
          label="Captures"
          value={String(player.caps)}
          hint={
            player.relayCaps > 0
              ? `${player.soloCaps} solo, ${player.relayCaps} relay`
              : undefined
          }
        />
        {/*
          The contribution the scoreboard never showed. A flag often changes
          hands: someone carries it most of the length, dies at the door, and a
          teammate walks it in. Only the finisher got a cap. This counts the
          drives you carried longest and somebody else finished.
        */}
        <Stat
          label="Lead carries"
          value={String(player.leadCarries)}
          hint="carried furthest, teammate capped"
        />
        <Stat
          label="Accuracy"
          value={accuracy === null ? "-" : percent(accuracy)}
          hint={
            accuracy === null
              ? undefined
              : `${Math.round(player.shotsHit)} of ${Math.round(player.shotsFired)}` +
                (player.unsoundShootingMatches > 0
                  ? `, ${player.unsoundShootingMatches} ${
                      player.unsoundShootingMatches === 1 ? "match" : "matches"
                    } left out`
                  : "")
          }
        />
        <Stat label="Best streak" value={String(player.bestStreak)} />
        <Stat label="Flag time" value={seconds(player.flagHoldMs)} />
        <Stat
          label="Fastest cap"
          value={player.fastestCaptureMs ? seconds(player.fastestCaptureMs) : "-"}
        />
      </dl>

      {/*
        Who they actually play with, and who they play against.

        Worked out from who was on each side match by match, never from the
        colours. Red and blue get reshuffled between games here, so a player's
        real teammates are a fact about names and not about shirts, and the same
        two people usually appear in both tables.
      */}
      {pairings.alongside.length > 0 || pairings.against.length > 0 ? (
        <section className="mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <h2 className="font-display text-lg font-bold text-steel-100">
              Alongside and against
            </h2>
            <Link
              href="/players/pairings"
              className="font-display text-[0.625rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
            >
              Everyone&rsquo;s pairings
            </Link>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel-400">
            Sides are shuffled between matches, so most people show up in both
            tables. Counted from who was on which side in each match.
          </p>

          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            {pairings.alongside.length > 0 ? (
              <div>
                <h3 className="eyebrow">On the same side</h3>
                <div className="panel mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <PairHead columns={["Player", "Together", "Record", "Win rate"]} />
                    <tbody>
                      {pairings.alongside.map((row) => (
                        <tr key={row.partner} className="border-t border-basalt-700">
                          <PairName name={row.partner} />
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-300">
                            {row.matches}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-200">
                            {row.wins}–{row.losses}
                            {row.undecided > 0 ? (
                              <span
                                className="ml-1 text-steel-600"
                                title={`${row.undecided} with no recorded result`}
                              >
                                +{row.undecided}
                              </span>
                            ) : null}
                          </td>
                          {/*
                            Blank rather than a dash when the pairing is too new
                            for a rate. A dash reads as "none", and the answer
                            here is "not yet", which is a different thing.
                          */}
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-300">
                            {row.winRate === null ? "" : share(row.winRate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {pairings.against.length > 0 ? (
              <div>
                <h3 className="eyebrow">On the other side</h3>
                <div className="panel mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <PairHead columns={["Player", "Faced", "Record"]} />
                    <tbody>
                      {pairings.against.map((row) => (
                        <tr key={row.opponent} className="border-t border-basalt-700">
                          <PairName name={row.opponent} />
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-300">
                            {row.matches}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-200">
                            {row.won}–{row.lost}
                            {row.undecided > 0 ? (
                              <span
                                className="ml-1 text-steel-600"
                                title={`${row.undecided} with no recorded result`}
                              >
                                +{row.undecided}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>

          {/*
            The bar for a rate, stated where it applies rather than in a
            footnote, the same way the stat boards state theirs.
          */}
          <p className="mt-3 text-xs leading-relaxed text-steel-600">
            {PAIR_RATE_REQUIREMENT} A record of 3–1 means three matches won and one
            lost; anything after a plus sign had no recorded result.
          </p>
        </section>
      ) : null}

      <section className="mt-12">
        <h2 className="font-display text-lg font-bold text-steel-100">Match history</h2>
        <div className="panel mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {[
                  "Date",
                  "Map",
                  "Team",
                  "Result",
                  "Score",
                  "Frags",
                  "Deaths",
                  "Caps",
                  "Acc",
                ].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={
                        "px-3 py-2 font-display text-[0.6875rem] uppercase tracking-widest text-steel-500 " +
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
                      <span className="text-steel-500">-</span>
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
                    {(() => {
                      const value = accuracyOf(row.shotsHit, row.shotsFired);
                      return value === null ? (
                        <span
                          title={
                            row.shotsFired > 0 ? UNSOUND_SHOOTING_NOTE : undefined
                          }
                        >
                          -
                        </span>
                      ) : (
                        percent(value)
                      );
                    })()}
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
