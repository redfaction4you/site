import type { Metadata } from "next";
import Link from "next/link";

import { GameTabs } from "@/components/game-tabs";
import { MapShot } from "@/components/map-shot";
import { mapSlug } from "@/lib/matches/maps";
import { getMapRecord, listMapNames } from "@/lib/matches/queries";

export const metadata: Metadata = {
  title: "Competitive CTF maps",
  description:
    "The maps the RedFaction4You matches are played on, how often each comes up, and the fastest flag run recorded on it.",
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
 *
 * It is not a filtered list and does not need to be. Every level with a recorded
 * match on it is a level the competitive matches were played on, so what the
 * archive holds and what the rotation is are the same set. If that ever stops
 * being true, this is where the distinction would go, and it would have to be a
 * list somebody maintains rather than something inferred from play.
 *
 * **The picture is the point.** These were rows: a 96 pixel thumbnail beside a
 * name and two lines of grey figures, nine of them identical down the page, on a
 * page about nine places that look nothing like one another. Anybody who plays
 * here knows Huna by sight long before they know it by name. The screenshot is
 * the card now, the name sits on it, and the figures read underneath.
 *
 * The most played map takes the wide card. The list is ranked and says so in
 * words while every row looked the same weight, and a level the server runs five
 * times as often as another is worth seeing first and seeing bigger.
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
    <div className="mx-auto max-w-6xl px-4 pb-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-basalt-800 py-2.5">
        <h1 className="eyebrow">Competitive CTF maps</h1>
        <p className="font-mono text-xs text-steel-600">
          <span className="text-steel-300">{names.length}</span> maps
        </p>
      </div>

      <GameTabs ctfHref="/matches/maps" dmHref="/matches/maps/dm" active="ctf" />

      {maps.length === 0 ? (
        <p className="py-10 text-sm text-steel-500">
          No matches recorded yet, so there are no maps to list.
        </p>
      ) : (
        <>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {maps.map(({ mapName, matchCount, record }, index) => {
              const { totals, bests } = record;
              const lead = index === 0;
              const decided = totals.redWins + totals.blueWins;

              return (
                <li key={mapName} className={lead ? "sm:col-span-2" : ""}>
                  <Link
                    href={`/matches/map/${mapSlug(mapName)}`}
                    className="plate group block overflow-hidden transition-colors hover:border-t-rust-500"
                  >
                    <span className="relative block">
                      <MapShot
                        mapName={mapName}
                        className="w-full"
                        rounded={false}
                        sizes={
                          lead
                            ? "(min-width: 640px) 48rem, 100vw"
                            : "(min-width: 1024px) 24rem, (min-width: 640px) 50vw, 100vw"
                        }
                        priority={lead}
                      />

                      {/*
                        Black and white rather than the theme's own tokens. This
                        sits on a photograph in both themes, and `basalt-950` is
                        the deepest background in one and the palest paper in the
                        other, so a scrim built from it would put dark ink on a
                        white wash over a dark screenshot in light mode.
                      */}
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-2 pt-8">
                        <span
                          className={
                            "block font-display font-bold text-white drop-shadow " +
                            (lead ? "text-xl" : "text-base")
                          }
                        >
                          {mapName}
                        </span>
                      </span>
                    </span>

                    <span className="block p-2.5">
                      <span className="block font-mono text-[0.625rem] uppercase tracking-wider text-steel-500">
                        <span className="text-steel-300">{matchCount}</span>{" "}
                        {matchCount === 1 ? "match" : "matches"}
                        {/*
                          The total as well as the rate. The average is the more
                          useful of the two on a card that is comparing maps, and
                          the total is what the page vetter reads to check these
                          cards against the nights they came from: dropping it
                          silently removed that check, and the vetter said so.
                        */}
                        {totals.matches > 0 ? (
                          <>
                            {" · "}
                            <span className="text-steel-300">
                              {totals.captures}
                            </span>{" "}
                            captures
                            {" · "}
                            <span className="text-steel-300">
                              {(totals.captures / totals.matches).toFixed(1)}
                            </span>{" "}
                            a match
                          </>
                        ) : null}
                        {totals.overtime > 0 ? (
                          <span className="text-oxide-400">
                            {" · "}
                            {totals.overtime} to overtime
                          </span>
                        ) : null}
                      </span>

                      {/*
                        Who wins here, as two counts rather than a rate. Sides
                        are reshuffled between matches so it is a fact about the
                        map, and at this many matches a percentage would claim a
                        spawn advantage the record cannot support.
                      */}
                      {decided > 0 ? (
                        <span className="mt-1.5 flex items-baseline gap-1.5 font-mono text-xs tabular-nums">
                          <span className="text-rust-400">{totals.redWins}</span>
                          <span className="text-steel-700">/</span>
                          <span className="text-cobalt-400">{totals.blueWins}</span>
                          <span className="font-sans text-[0.625rem] uppercase tracking-wider text-steel-600">
                            red / blue
                          </span>
                        </span>
                      ) : null}

                      {bests.fastestRun ? (
                        <span className="mt-1.5 block border-t border-basalt-800 pt-1.5 font-mono text-[0.625rem] tabular-nums text-steel-500">
                          Fastest run{" "}
                          <span className="text-steel-100">
                            {(bests.fastestRun.value / 1000).toFixed(1)}s
                          </span>{" "}
                          <span className="text-steel-400">
                            {bests.fastestRun.name}
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/*
            Under the maps rather than over them. It explains what the figures on
            the cards mean, which is a thing to read after seeing them, and it
            was four lines of prose standing between the reader and the page.
          */}
          <div className="mt-8 max-w-3xl space-y-3 text-sm leading-relaxed text-steel-400">
            <p>
              The levels the matches are played on, most played first. Overtime is
              counted because it is the one thing a map can be blamed for: a level
              that keeps ending level is telling you something the scores alone do
              not. The fastest run is the quickest anybody has carried the flag
              from the enemy stand to their own without dropping it, and it is
              kept per map because these are not the same length.
            </p>
            <p className="text-xs leading-relaxed text-steel-500">
              A map with no picture is one nobody has screenshotted yet, which is
              a normal state rather than a fault. Names are as the server reports
              them, so two builds of the same level are two entries.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
