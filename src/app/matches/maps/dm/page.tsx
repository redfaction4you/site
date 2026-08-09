import type { Metadata } from "next";

import { GameTabs } from "@/components/game-tabs";
import { MapShot } from "@/components/map-shot";
import { dayLabel } from "@/components/match-archive";
import { timePlayed } from "@/lib/dm/format";
import { listDmMaps } from "@/lib/dm/queries";

export const metadata: Metadata = {
  title: "Deathmatch maps",
  description:
    "Every map the RF4U deathmatch server has recorded play on, ranked by time played.",
};

export const revalidate = 300;

/**
 * The deathmatch maps, as a rotation record rather than a gallery of contests.
 *
 * The CTF index leads with each map's competitive record — biggest win,
 * fastest run — because CTF maps host results. A DM map hosts time: people
 * join, play, rotate. So the cards here carry time played, rounds and frags,
 * and there are no per-map DM pages to link to, because a DM round is kept for
 * provenance and never browsed. No cross-linking into the CTF map pages
 * either: dm04 the deathmatch arena and a CTF map sharing a screenshot would
 * imply a record that does not exist.
 */
export default async function DmMapsPage() {
  const maps = await listDmMaps();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-basalt-800 py-2.5">
        <h1 className="eyebrow">Deathmatch maps</h1>
        <p className="font-mono text-xs text-steel-600">
          <span className="text-steel-300">{maps.length}</span>{" "}
          {maps.length === 1 ? "map" : "maps"}
        </p>
      </div>

      <GameTabs ctfHref="/matches/maps" dmHref="/matches/maps/dm" active="dm" />

      {maps.length === 0 ? (
        <p className="py-10 text-sm text-steel-500">
          Nothing recorded yet. The first casual session on the DM server puts
          its map here.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {maps.map((map) => (
            <li key={map.mapName} className="plate overflow-hidden">
              <MapShot
                mapName={map.mapName}
                className="w-full"
                rounded={false}
                sizes="(min-width: 1024px) 24rem, (min-width: 640px) 50vw, 100vw"
              />
              <div className="p-3">
                <p className="text-sm font-semibold text-steel-100">{map.mapName}</p>
                <dl className="mt-2 grid grid-cols-3 gap-2">
                  <div>
                    <dt className="figure-label">Played</dt>
                    <dd className="figure-value mt-0.5 font-mono text-sm">
                      {timePlayed(map.secondsPlayed)}
                    </dd>
                  </div>
                  <div>
                    <dt className="figure-label">Rounds</dt>
                    <dd className="figure-value mt-0.5 font-mono text-sm">{map.rounds}</dd>
                  </div>
                  <div>
                    <dt className="figure-label">Frags</dt>
                    <dd className="figure-value mt-0.5 font-mono text-sm">{map.kills}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-[0.6875rem] text-steel-500">
                  {map.players} {map.players === 1 ? "player" : "players"}
                  {map.lastPlayed ? ` · last played ${dayLabel(map.lastPlayed)}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-[0.6875rem] text-steel-600">
        Ranked by time played, the same frame as the deathmatch record: a
        rotation nobody joined stores nothing, and two short rounds are less
        play than one long one.
      </p>
    </div>
  );
}
