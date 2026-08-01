import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArchiveNav } from "@/components/archive-nav";
import { MapShot } from "@/components/map-shot";
import { MapBests } from "@/components/map-bests";
import { dayLabel, matchTime } from "@/components/match-archive";
import { UNSOUND_SHOOTING_NOTE, accuracyOf } from "@/lib/matches/accuracy";
import { mapBySlug, mapSlug } from "@/lib/matches/maps";
import { getMapRecord, listMapNames } from "@/lib/matches/queries";

type Props = { params: Promise<{ map: string }> };

export const dynamic = "force-dynamic";

async function resolve(slug: string): Promise<string | null> {
  const names = await listMapNames();
  return mapBySlug(slug, names.map((entry) => entry.mapName));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { map } = await params;
  const mapName = await resolve(map);
  if (!mapName) return { title: "Not found" };

  return {
    title: mapName,
    description: `Every match played on ${mapName} on the RedFaction4You server, with who plays it best.`,
  };
}

/**
 * One map, and everything played on it.
 *
 * The archive knew which level every match used and did nothing with it. A map
 * is the one axis that groups matches across nights: whether it is close or
 * one sided, whether it is the one that keeps going to overtime, and who is good
 * on it, which is a different question from who is good.
 *
 * This route sits under `/matches/map/` rather than at `/maps/[slug]`, which
 * belongs to the catalogue: that is the page for downloading a map file, and
 * this is the page for what happened on it. When the catalogue has entries the
 * two should link to each other rather than merge, because "give me the file"
 * and "how does it play" are different errands.
 *
 * The static `map` segment shadows a day called "map", which no ISO date is.
 */
export default async function MapPage({ params }: Props) {
  const { map } = await params;
  const mapName = await resolve(map);
  if (!mapName) notFound();

  const record = await getMapRecord(mapName);
  const { totals } = record;
  const decided = totals.redWins + totals.blueWins;
  const anyRuns = record.players.some((player) => player.fastestRunMs !== null);

  /*
   * The best figure in each column, so the table can say who leads it.
   *
   * Bold rather than a bar or a highlight, which is the pattern the rest of the
   * site settled on: twelve rows of equal weight is a table nobody reads, and
   * the eye finds a bold number without being told what it means. A run is the
   * one column where less is better.
   */
  const leader = (pick: (p: (typeof record.players)[number]) => number | null) => {
    const values = record.players
      .map(pick)
      .filter((value): value is number => value !== null && value > 0);
    return values.length ? Math.max(...values) : null;
  };
  const leaders = {
    score: leader((p) => p.score),
    kills: leader((p) => p.kills),
    caps: leader((p) => p.caps),
    flagReturns: leader((p) => p.flagReturns),
    bestStreak: leader((p) => p.bestStreak),
    played: leader((p) => p.matchesPlayed),
  };
  const runLeader = (() => {
    const runs = record.players
      .map((p) => p.fastestRunMs)
      .filter((value): value is number => value !== null && value > 0);
    return runs.length ? Math.min(...runs) : null;
  })();
  const lead = (isLeader: boolean) =>
    isLeader ? " font-semibold text-steel-100" : "";

  const minutes = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    /*
     * Wider than it was. The night page has used max-w-6xl since the redesign,
     * and this page carries a ten column table and a two column body, both of
     * which were being squeezed into a container sized for one column of text.
     */
    <div className="mx-auto max-w-6xl px-4 pb-12">
      <div className="border-b border-basalt-800 py-2.5">
        <p className="eyebrow">
          <Link href="/matches" className="hover:text-rust-300">
            Matches
          </Link>
        </p>
      </div>

      <ArchiveNav active="/matches/maps" className="mt-3" />

      <div className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-4">
        <MapShot mapName={mapName} className="w-56 shrink-0" sizes="224px" />
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold text-steel-100">
            {mapName}
          </h1>
          {/*
            The shape of the map as figures rather than as a sentence, and
            labelled, because a run of five numbers separated by dots is a line
            a reader has to parse before they can use any of it.
          */}
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {[
              { label: "Matches", value: String(totals.matches) },
              { label: "Nights", value: String(totals.nights) },
              {
                label: "Captures",
                value:
                  totals.matches > 0
                    ? `${totals.captures} · ${(totals.captures / totals.matches).toFixed(1)} a match`
                    : String(totals.captures),
              },
              {
                label: "Usual length",
                value:
                  totals.averageSeconds === null
                    ? null
                    : minutes(totals.averageSeconds),
              },
              {
                label: "Usual size",
                value:
                  totals.averagePlayers === null
                    ? null
                    : `${totals.averagePlayers.toFixed(1)} players`,
              },
              {
                label: "Overtime",
                value: totals.overtime > 0 ? `${totals.overtime} of ${totals.matches}` : null,
              },
            ]
              .filter((entry) => entry.value !== null)
              .map((entry) => (
                <div key={entry.label}>
                  <dt className="figure-label text-steel-500">{entry.label}</dt>
                  <dd className="mt-0.5 font-mono text-sm tabular-nums text-steel-100">
                    {entry.value}
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      </div>

      {/*
        What this map has seen, which is the thing this page can say that no
        other page can. The fastest run is here rather than on a stat board for
        the reason the board says: a run is a distance as much as a time, and
        ranking Huna against Rail Fight ranks the maps.
      */}
      <MapBests bests={record.bests} className="mt-8" />

      <div className="mt-9 grid gap-x-8 gap-y-9 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <section className="min-w-0">
        <h2 className="rule-heading">Matches here</h2>

        <div className="mt-2">
          <div className="flex items-center gap-2.5 border-b border-basalt-700 pb-1 font-display text-[0.5625rem] uppercase tracking-wider text-steel-600">
            <span className="min-w-0 flex-1">Night</span>
            <span className="w-9 shrink-0 text-right">Start</span>
            <span className="hidden w-10 shrink-0 text-right sm:block">Length</span>
            <span className="hidden w-8 shrink-0 text-right sm:block">Players</span>
            <span className="w-16 shrink-0 text-right tracking-normal">
              <span className="text-rust-400">Red</span>
              <span className="text-steel-700"> / </span>
              <span className="text-cobalt-400">Blue</span>
            </span>
          </div>

          <ul>
            {record.matches.map((match) => (
              <li key={match.matchId} className="border-b border-basalt-800">
                <Link
                  href={`/matches/${match.archiveDay}/${match.sourceMatchId}`}
                  className="group flex items-center gap-2.5 py-1.5"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate text-sm text-steel-100 group-hover:text-rust-300">
                      {dayLabel(match.archiveDay)}
                    </span>
                    {match.overtime ? (
                      <span className="shrink-0 font-mono text-[0.5625rem] uppercase tracking-wider text-oxide-400">
                        overtime
                      </span>
                    ) : null}
                  </span>
                  <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-steel-500">
                    {matchTime(match.startedAt)}
                  </span>
                  {/* How long it ran, which on this page is the interesting
                      one: it is where an overtime shows its length rather than
                      just its label. */}
                  <span className="hidden w-10 shrink-0 text-right font-mono text-xs tabular-nums text-steel-500 sm:block">
                    {match.startedAt && match.endedAt
                      ? minutes(
                          Math.round(
                            (match.endedAt.getTime() - match.startedAt.getTime()) / 1000,
                          ),
                        )
                      : "-"}
                  </span>
                  <span className="hidden w-8 shrink-0 text-right font-mono text-xs tabular-nums text-steel-500 sm:block">
                    {match.playerCount}
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono text-lg leading-none tabular-nums">
                    <span
                      className={
                        match.winner === "red"
                          ? "font-semibold text-rust-400"
                          : "text-steel-500"
                      }
                    >
                      {match.redScore}
                    </span>
                    <span className="mx-1 text-sm text-steel-700">/</span>
                    <span
                      className={
                        match.winner === "blue"
                          ? "font-semibold text-cobalt-400"
                          : "text-steel-500"
                      }
                    >
                      {match.blueScore}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/*
        Which side wins here, and by how much, in the column beside the matches
        it is about. It was a sentence under the title, above every figure on the
        page, which is the one place a claim that needs the numbers cannot be
        checked against them.
      */}
      <aside className="min-w-0 lg:col-start-2">
        <h2 className="rule-heading">How it goes</h2>

        {decided > 0 ? (
          <>
            <div className="mt-2 flex items-baseline gap-2 font-mono text-2xl leading-none tabular-nums">
              <span className="text-rust-400">{totals.redWins}</span>
              <span className="text-sm text-steel-700">/</span>
              <span className="text-cobalt-400">{totals.blueWins}</span>
              {totals.undecided > 0 ? (
                <span className="text-sm text-steel-600">
                  · {totals.undecided} drawn
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-steel-500">
              Wins by <span className="text-rust-400">red</span> and{" "}
              <span className="text-cobalt-400">blue</span>. Sides are shuffled
              between matches, so that is a fact about the map and not about a
              team, and at {totals.matches}{" "}
              {totals.matches === 1 ? "match" : "matches"} it is a count rather
              than a rate.
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-steel-500">
            Nothing decided here yet.
          </p>
        )}

        {totals.biggestWin ? (
          <div className="mt-4 border-t border-basalt-800 pt-3">
            <span className="figure-label block text-steel-500">Biggest win</span>
            <Link
              href={`/matches/${totals.biggestWin.archiveDay}/${totals.biggestWin.sourceMatchId}`}
              className="mt-1 block font-mono text-sm tabular-nums text-steel-200 hover:text-rust-300"
            >
              by {totals.biggestWin.margin}{" "}
              <span className="text-steel-600">
                {dayLabel(totals.biggestWin.archiveDay)}
              </span>
            </Link>
          </div>
        ) : null}
      </aside>
      </div>

      {record.players.length > 0 ? (
        <section className="mt-9">
          <h2 className="rule-heading">On this map</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel-400">
            Totals from matches on {mapName} only, ordered by score the way the
            night scoreboards are. Nothing here is per match, so it partly ranks
            who has played it most, which is why the played column is there.
            The best figure in each column is bold.
          </p>

          <div className="mt-3 max-w-[46rem] overflow-x-auto">
            <div className="flex items-baseline gap-2 border-b border-basalt-700 pb-1 font-display text-[0.5625rem] uppercase tracking-wider text-steel-600">
              <span className="w-3 shrink-0">#</span>
              <span className="min-w-0 flex-1">Player</span>
              <span className="w-10 shrink-0 text-right">Played</span>
              <span className="w-10 shrink-0 text-right">Score</span>
              <span className="w-9 shrink-0 text-right">Frags</span>
              <span className="w-9 shrink-0 text-right">Deaths</span>
              <span className="w-8 shrink-0 text-right">Caps</span>
              <span className="w-9 shrink-0 text-right">Returns</span>
              <span className="w-10 shrink-0 text-right">Acc</span>
              <span className="w-9 shrink-0 text-right">Streak</span>
              {/* Only where somebody has one. A map nobody has run clean should
                  not carry a column of dashes. */}
              {anyRuns ? (
                <span
                  className="w-11 shrink-0 text-right"
                  title="Their quickest capture here, carried the whole way without the flag touching the ground"
                >
                  Best run
                </span>
              ) : null}
            </div>

            <ol>
              {record.players.map((player, index) => (
                <li key={player.name} className="border-b border-basalt-800">
                  <Link
                    href={`/players/${encodeURIComponent(player.name)}`}
                    className="group flex items-baseline gap-2 py-1"
                  >
                    <span className="w-3 shrink-0 font-display text-[0.625rem] tabular-nums text-steel-600">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-steel-200 group-hover:text-rust-300">
                      {player.name}
                    </span>
                    <span
                      className={
                        "w-10 shrink-0 text-right font-mono text-xs tabular-nums text-steel-400" +
                        lead(player.matchesPlayed === leaders.played)
                      }
                    >
                      {player.matchesPlayed}
                    </span>
                    <span
                      className={
                        "w-10 shrink-0 text-right font-mono text-xs tabular-nums text-steel-100" +
                        lead(player.score === leaders.score)
                      }
                    >
                      {player.score}
                    </span>
                    <span
                      className={
                        "w-9 shrink-0 text-right font-mono text-xs tabular-nums text-steel-300" +
                        lead(player.kills === leaders.kills)
                      }
                    >
                      {player.kills}
                    </span>
                    <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-steel-500">
                      {player.deaths}
                    </span>
                    <span
                      className={
                        "w-8 shrink-0 text-right font-mono text-xs tabular-nums text-steel-400" +
                        lead(player.caps > 0 && player.caps === leaders.caps)
                      }
                    >
                      {player.caps || <span className="text-steel-700">&ndash;</span>}
                    </span>
                    <span
                      className={
                        "w-9 shrink-0 text-right font-mono text-xs tabular-nums text-steel-400" +
                        lead(
                          player.flagReturns > 0 &&
                            player.flagReturns === leaders.flagReturns,
                        )
                      }
                    >
                      {player.flagReturns || (
                        <span className="text-steel-700">&ndash;</span>
                      )}
                    </span>
                    <span
                      className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-steel-400"
                      title={
                        player.unsoundShootingMatches > 0
                          ? `${UNSOUND_SHOOTING_NOTE} ${player.unsoundShootingMatches} of their matches here are left out of this figure.`
                          : undefined
                      }
                    >
                      {(() => {
                        const value = accuracyOf(player.shotsHit, player.shotsFired);
                        return value === null ? (
                          <span className="text-steel-700">&ndash;</span>
                        ) : (
                          `${(value * 100).toFixed(1)}%`
                        );
                      })()}
                      {player.unsoundShootingMatches > 0 ? (
                        <span className="text-steel-700">*</span>
                      ) : null}
                    </span>
                    <span
                      className={
                        "w-9 shrink-0 text-right font-mono text-xs tabular-nums text-steel-400" +
                        lead(
                          player.bestStreak > 0 &&
                            player.bestStreak === leaders.bestStreak,
                        )
                      }
                    >
                      {player.bestStreak || (
                        <span className="text-steel-700">&ndash;</span>
                      )}
                    </span>
                    {anyRuns ? (
                      <span
                        className={
                          "w-11 shrink-0 text-right font-mono text-xs tabular-nums text-steel-300" +
                          lead(
                            player.fastestRunMs !== null &&
                              player.fastestRunMs === runLeader,
                          )
                        }
                      >
                        {player.fastestRunMs ? (
                          `${(player.fastestRunMs / 1000).toFixed(1)}s`
                        ) : (
                          <span className="text-steel-700">&ndash;</span>
                        )}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      <OtherMaps current={mapName} />
    </div>
  );
}

/** Every other map with matches on it, so this page is not a dead end. */
async function OtherMaps({ current }: { current: string }) {
  const names = await listMapNames();
  const others = names.filter((entry) => entry.mapName !== current);
  if (others.length === 0) return null;

  return (
    <nav className="mt-10 border-t border-basalt-800 pt-4">
      <h2 className="rule-heading">Other maps</h2>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {others.map((entry) => (
          <li key={entry.mapName}>
            <Link
              href={`/matches/map/${mapSlug(entry.mapName)}`}
              className="text-xs text-steel-300 hover:text-rust-300"
            >
              {entry.mapName}
              <span className="ml-1.5 font-mono text-[0.625rem] tabular-nums text-steel-600">
                {entry.matchCount}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
