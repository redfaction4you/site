import type { Metadata } from "next";
import Link from "next/link";

import { ArchiveNav } from "@/components/archive-nav";
import { MapShot } from "@/components/map-shot";
import { mapSlug } from "@/lib/matches/maps";
import { getMapRecord, listMapNames } from "@/lib/matches/queries";

export const metadata: Metadata = {
  title: "Maps played",
  description:
    "Every map played on the RedFaction4You server, how often, and how the matches on it have gone.",
};

export const dynamic = "force-dynamic";

/**
 * The front door the map pages did not have.
 *
 * `/matches/map/ankh-b12` has existed since the player record linked to it, and
 * the only way to reach one was to find a match played there and click the map
 * name. A section with no index is a section nobody knows exists.
 *
 * Ordered by matches played, which is the honest ranking available: it is a
 * record of what the server actually runs, and on a server where people call
 * the map it is also roughly a record of what people ask for.
 */
export default async function MapsPage() {
  const names = await listMapNames();
  const maps = await Promise.all(
    names.map(async (entry) => ({
      ...entry,
      record: await getMapRecord(entry.mapName),
    })),
  );

  return (
    <div className="mx-auto max-w-5xl px-4 pb-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-basalt-800 py-2.5">
        <h1 className="eyebrow">Maps played</h1>
        <p className="font-mono text-xs text-steel-600">
          <span className="text-steel-300">{names.length}</span> maps
        </p>
      </div>

      <ArchiveNav active="/matches/maps" className="mt-3" />

      {maps.length === 0 ? (
        <p className="py-10 text-sm text-steel-500">
          No matches recorded yet, so there are no maps to list.
        </p>
      ) : (
        <>
          <p className="max-w-3xl py-4 text-sm leading-relaxed text-steel-400">
            Every level the server has played a recorded match on, most played
            first. Overtime is counted because it is the one thing a map can be
            blamed for: a level that keeps ending level is telling you something
            the scores alone do not.
          </p>

          <ul className="grid gap-3 sm:grid-cols-2">
            {maps.map(({ mapName, matchCount, record }) => (
              <li key={mapName}>
                <Link
                  href={`/matches/map/${mapSlug(mapName)}`}
                  className="plate group flex items-center gap-3 p-2 transition-colors hover:border-t-rust-500"
                >
                  <MapShot
                    mapName={mapName}
                    className="hidden w-24 shrink-0 sm:block"
                    sizes="96px"
                  />

                  <span className="flex min-w-0 flex-1 flex-col justify-center">
                    <span className="truncate text-sm font-semibold text-steel-100 group-hover:text-rust-300">
                      {mapName}
                    </span>
                    <span className="mt-0.5 font-mono text-[0.625rem] uppercase tracking-wider text-steel-600">
                      {matchCount} {matchCount === 1 ? "match" : "matches"}
                      {record.totals.captures > 0
                        ? ` · ${record.totals.captures} captures`
                        : ""}
                      {record.totals.overtime > 0 ? (
                        <span className="text-oxide-400">
                          {" "}
                          · {record.totals.overtime} to overtime
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-xs leading-relaxed text-steel-500">
            A map with no picture is one nobody has screenshotted yet, which is a
            normal state rather than a fault. Names are as the server reports
            them, so two builds of the same level are two entries.
          </p>
        </>
      )}
    </div>
  );
}
