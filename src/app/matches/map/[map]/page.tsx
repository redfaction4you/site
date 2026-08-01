import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArchiveNav } from "@/components/archive-nav";
import { MapShot } from "@/components/map-shot";
import { dayLabel, matchTime } from "@/components/match-archive";
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

  return (
    <div className="mx-auto max-w-5xl px-4 pb-12">
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
          <p className="mt-1.5 font-mono text-xs text-steel-500">
            {totals.matches} {totals.matches === 1 ? "match" : "matches"} ·{" "}
            {totals.captures} captures
            {totals.overtime > 0 ? ` · ${totals.overtime} to overtime` : ""}
          </p>
          {/*
            Which side wins here, which is the one thing a map page can say that
            no other page can. Stated as a count and never as a rate: eight
            matches is not enough to claim a map favours a side, and a
            percentage would make exactly that claim.
          */}
          {decided > 0 ? (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-steel-400">
              <span className="text-rust-400">Red</span> has won {totals.redWins} here
              and <span className="text-oxide-400">blue</span> {totals.blueWins}.
              Sides are shuffled between matches, so that is a fact about the map
              and not about a team.
            </p>
          ) : null}
        </div>
      </div>

      <section className="mt-9">
        <h2 className="rule-heading">Matches here</h2>

        <div className="mt-2 max-w-[40rem]">
          <div className="flex items-center gap-2.5 border-b border-basalt-700 pb-1 font-display text-[0.5625rem] uppercase tracking-wider text-steel-600">
            <span className="min-w-0 flex-1">Night</span>
            <span className="w-9 shrink-0 text-right">Start</span>
            <span className="hidden w-8 shrink-0 text-right sm:block">Players</span>
            <span className="w-16 shrink-0 text-right tracking-normal">
              <span className="text-rust-400">Red</span>
              <span className="text-steel-700"> / </span>
              <span className="text-oxide-400">Blue</span>
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
                          ? "font-semibold text-oxide-400"
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

      {record.players.length > 0 ? (
        <section className="mt-9">
          <h2 className="rule-heading">On this map</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel-400">
            Totals from matches on {mapName} only, ordered by score the way the
            night scoreboards are. Nothing here is per match, so it partly ranks
            who has played it most.
          </p>

          <div className="mt-3 max-w-[34rem]">
            <div className="flex items-baseline gap-2 border-b border-basalt-700 pb-1 font-display text-[0.5625rem] uppercase tracking-wider text-steel-600">
              <span className="w-3 shrink-0">#</span>
              <span className="min-w-0 flex-1">Player</span>
              <span className="w-10 shrink-0 text-right">Played</span>
              <span className="w-10 shrink-0 text-right">Score</span>
              <span className="w-9 shrink-0 text-right">Frags</span>
              <span className="w-8 shrink-0 text-right">Caps</span>
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
                    <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-steel-400">
                      {player.matchesPlayed}
                    </span>
                    <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-steel-100">
                      {player.score}
                    </span>
                    <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-steel-300">
                      {player.kills}
                    </span>
                    <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-steel-400">
                      {player.caps}
                    </span>
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
