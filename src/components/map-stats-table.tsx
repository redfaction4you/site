import Link from "next/link";

import { MapShot } from "@/components/map-shot";
import { mapSlug } from "@/lib/matches/maps";
import {
  MAP_AVERAGE_REQUIREMENT,
  MIN_MATCHES_FOR_MAP_AVERAGE,
  type MapSummary,
} from "@/lib/matches/map-stats";

/**
 * Every map on one comparable row.
 *
 * The maps gallery answers "what has been played", and a map's own page answers
 * "what happened here". Neither answers the question this table is for: how
 * these places differ. A map that runs ten minutes and finishes 3-2 is a
 * different game from one that runs ten minutes and finishes 8-6, and the
 * archive has always known that and never said it anywhere.
 *
 * **The averages are withheld on a thin map rather than printed thin.** A map
 * played once has an average match length of exactly one match, and a 1-0 side
 * split that reads as a hundred percent bias. The row still appears, because it
 * was played, and the figures that need a sample say so.
 */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, "0")}`;
}

function runTime(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}

export function MapStatsTable({ maps }: { maps: MapSummary[] }) {
  if (maps.length === 0) return null;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-[0.8125rem]">
          <thead>
            <tr className="border-b border-basalt-700 text-left font-display text-[0.6875rem] uppercase tracking-widest text-steel-400">
              <th scope="col" className="py-1.5 pr-3 font-bold">
                Map
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-bold">
                Matches
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-bold">
                Nights
              </th>
              {/*
                Red and blue as a record rather than a rate, for the reason the
                pairing table shows one: a percentage from two matches describes
                the two matches. Sides are reshuffled every match, so this is a
                fact about the map's geometry only if it holds up over a season.
              */}
              <th scope="col" className="py-1.5 pr-3 text-right font-bold">
                Red&ndash;Blue
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-bold">
                Overtime
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-bold">
                Avg length
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-bold">
                Avg caps
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-bold">
                Avg margin
              </th>
              <th scope="col" className="py-1.5 text-right font-bold">
                Fastest run
              </th>
            </tr>
          </thead>

          <tbody>
            {maps.map((map) => {
              const thin = map.matches < MIN_MATCHES_FOR_MAP_AVERAGE;

              return (
                <tr
                  key={map.mapName}
                  className="border-b border-basalt-800 last:border-b-0 hover:bg-rust-500/[0.05]"
                >
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                    <Link
                      href={`/matches/map/${mapSlug(map.mapName)}`}
                      className="group flex items-center gap-2"
                    >
                      <MapShot
                        mapName={map.mapName}
                        className="hidden w-9 shrink-0 sm:block"
                        sizes="36px"
                      />
                      <span className="text-steel-200 group-hover:text-rust-300">
                        {map.mapName}
                      </span>
                    </Link>
                  </th>

                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-steel-100">
                    {map.matches}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-steel-400">
                    {map.nights}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                    <span className="text-rust-400">{map.redWins}</span>
                    <span className="text-steel-700">&ndash;</span>
                    <span className="text-cobalt-400">{map.blueWins}</span>
                    {map.drawn > 0 ? (
                      <span className="text-steel-600"> +{map.drawn}d</span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-steel-400">
                    {map.overtime > 0 ? map.overtime : <Dash />}
                  </td>

                  <Average value={map.averageSeconds} thin={thin} format={clock} />
                  <Average
                    value={map.averageCaptures}
                    thin={thin}
                    format={(v) => v.toFixed(1)}
                  />
                  <Average
                    value={map.averageMargin}
                    thin={thin}
                    format={(v) => v.toFixed(1)}
                  />

                  <td className="py-1.5 text-right font-mono tabular-nums text-steel-200">
                    {map.fastestRunMs ? runTime(map.fastestRunMs) : <Dash />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[0.6875rem] leading-snug text-steel-600">
        {MAP_AVERAGE_REQUIREMENT} A fastest run is the flag carried from the enemy
        stand to its own without ever touching the ground, which is why it belongs
        beside the map it was set on rather than in a ranking across maps.
      </p>
    </>
  );
}

function Dash() {
  return <span className="text-steel-700">&mdash;</span>;
}

/** A figure that only means something over a sample, or a dash saying so. */
function Average({
  value,
  thin,
  format,
}: {
  value: number | null;
  thin: boolean;
  format: (value: number) => string;
}) {
  return (
    <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-steel-200">
      {value === null || thin ? <Dash /> : format(value)}
    </td>
  );
}
