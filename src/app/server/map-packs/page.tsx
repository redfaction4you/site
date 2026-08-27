import type { Metadata } from "next";
import Link from "next/link";

import { MapShot } from "@/components/map-shot";
import { dayLabel } from "@/components/match-archive";
import { timePlayed } from "@/lib/dm/format";
import { packPlay, type PackEntryPlay } from "@/lib/dm/pack-play";
import { dmPlayByMap } from "@/lib/dm/queries";
import { activeMapPack, listMapPacks, type MapPack } from "@/lib/map-packs";

export const metadata: Metadata = {
  title: "Map packs",
  description:
    "The themed map rotation running on the RF4U deathmatch server: what is on now, every map in it, and who made them.",
};

export const revalidate = 300;

/**
 * What is on the deathmatch server, and what else has been.
 *
 * The packs exist so the DM rotation can be curated rather than permanent — a
 * mapper highlight, a Halloween set — and the point of a highlight is that the
 * maker gets named. So every map lists its author where the pack gives one and
 * links to where it can be downloaded.
 *
 * A pack that has been switched off is kept and shown below, because "what was
 * the Halloween pack again" is a question somebody asks in November.
 */

function PackMaps({ pack, play }: { pack: MapPack; play: PackEntryPlay[] }) {
  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {pack.maps.map((entry, index) => {
        const title = entry.title?.trim() || entry.filename;
        const record = play[index];
        return (
          <li key={entry.filename} className="plate overflow-hidden">
            {/* Renders nothing for a map nobody has photographed, which is
                most custom maps and is not an error. */}
            <MapShot
              mapName={title}
              className="w-full"
              rounded={false}
              sizes="(min-width: 1024px) 24rem, (min-width: 640px) 50vw, 100vw"
            />
            <div className="p-3">
              <p className="text-sm font-semibold text-steel-100">
                {entry.url ? (
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="hover:text-rust-300"
                  >
                    {title}
                  </a>
                ) : (
                  title
                )}
              </p>
              <p className="mt-0.5 font-mono text-[0.6875rem] text-steel-600">
                {entry.filename}
                {entry.author ? (
                  <span className="text-steel-500"> · by {entry.author}</span>
                ) : null}
              </p>
              {entry.note ? (
                <p className="mt-1.5 text-xs leading-snug text-steel-400">
                  {entry.note}
                </p>
              ) : null}

              {/* What the server has actually recorded on it since the pack
                  went on, which is the only thing on this card that is not
                  somebody's description of the map. */}
              {record?.play && record.play.rounds > 0 ? (
                <dl className="mt-2.5 grid grid-cols-3 gap-2 border-t border-basalt-800 pt-2.5">
                  <div>
                    <dt className="figure-label">Played</dt>
                    <dd className="figure-value mt-0.5 font-mono text-sm">
                      {timePlayed(record.play.secondsPlayed)}
                    </dd>
                  </div>
                  <div>
                    <dt className="figure-label">Rounds</dt>
                    <dd className="figure-value mt-0.5 font-mono text-sm">
                      {record.play.rounds}
                    </dd>
                  </div>
                  <div>
                    <dt className="figure-label">Frags</dt>
                    <dd className="figure-value mt-0.5 font-mono text-sm">
                      {record.play.kills}
                    </dd>
                  </div>
                </dl>
              ) : record?.missing ? (
                <p className="mt-2.5 border-t border-basalt-800 pt-2.5 text-xs leading-snug text-oxide-400">
                  Nothing recorded here while the rest of the pack has been
                  played. Worth checking the server kept it: a rotation map it
                  cannot download is skipped, and nothing says so.
                </p>
              ) : (
                <p className="mt-2.5 border-t border-basalt-800 pt-2.5 text-xs text-steel-600">
                  No play recorded yet.
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function MapPacksPage() {
  const [active, all] = await Promise.all([activeMapPack("themed-maps"), listMapPacks()]);
  const others = all.filter((pack) => !pack.active);

  /*
   * Since the pack went on, not all time.
   *
   * "This map has 40 minutes on it" is a fact about the server; "this map has
   * 40 minutes on it since this rotation started" is a fact about the pack, and
   * it is the one that says whether the server is really running what this page
   * claims it is.
   */
  const recorded = active ? await dmPlayByMap(active.activatedAt) : new Map();
  const play = active ? packPlay(active.maps, recorded) : [];

  const totals = play.reduce(
    (sum, entry) => ({
      rounds: sum.rounds + (entry.play?.rounds ?? 0),
      seconds: sum.seconds + (entry.play?.secondsPlayed ?? 0),
      kills: sum.kills + (entry.play?.kills ?? 0),
      played: sum.played + (entry.play && entry.play.rounds > 0 ? 1 : 0),
    }),
    { rounds: 0, seconds: 0, kills: 0, played: 0 },
  );

  const missing = play.filter((entry) => entry.missing).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-basalt-800 py-2.5">
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.14em] text-steel-100">
          Map packs
        </h1>
        <p className="font-mono text-xs text-steel-600">
          <Link href="/server" className="hover:text-rust-300">
            the deathmatch server
          </Link>
        </p>
      </div>

      {active ? (
        <section className="mt-6">
          <p className="eyebrow">On the server now</p>
          <h2 className="mt-1 font-display text-3xl font-bold text-steel-100">
            {active.name}
          </h2>
          <p className="mt-2 font-mono text-xs text-steel-500">
            {active.maps.length} {active.maps.length === 1 ? "map" : "maps"}
            {active.activatedAt
              ? ` · since ${dayLabel(active.activatedAt.slice(0, 10))}`
              : ""}
            {active.serverName ? ` · the server is called ${active.serverName}` : ""}
          </p>
          {/* The record first, the description of the pack under it. This page
              used to be a list of maps and somebody's paragraph about them,
              with nothing on it that the archive knew. */}
          {totals.rounds > 0 ? (
            <dl className="mt-4 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="plate p-3">
                <dt className="figure-label">Played</dt>
                <dd className="figure-value mt-0.5 font-mono text-lg">
                  {timePlayed(totals.seconds)}
                </dd>
              </div>
              <div className="plate p-3">
                <dt className="figure-label">Rounds</dt>
                <dd className="figure-value mt-0.5 font-mono text-lg">{totals.rounds}</dd>
              </div>
              <div className="plate p-3">
                <dt className="figure-label">Frags</dt>
                <dd className="figure-value mt-0.5 font-mono text-lg">{totals.kills}</dd>
              </div>
              <div className="plate p-3">
                <dt className="figure-label">Maps seen</dt>
                <dd className="figure-value mt-0.5 font-mono text-lg">
                  {totals.played} / {active.maps.length}
                </dd>
              </div>
            </dl>
          ) : null}

          {missing > 0 ? (
            <p className="mt-3 max-w-3xl text-xs leading-relaxed text-oxide-400">
              {missing === 1
                ? "One map in this pack has no recorded play"
                : `${missing} maps in this pack have no recorded play`}{" "}
              while the rest has been played. The server downloads any rotation
              map it is missing and{" "}
              <span className="text-oxide-300">silently skips the ones it cannot get</span>
              , so a pack can be running short of what this page lists. It is
              worth checking rather than proof: nobody is obliged to rotate onto
              every map.
            </p>
          ) : null}

          {active.blurb ? (
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-steel-300">
              {active.blurb}
            </p>
          ) : null}

          <PackMaps pack={active} play={play} />

          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-steel-500">
            Figures are what the server has recorded since this pack went on,
            map by map, and everything played here counts towards{" "}
            <Link href="/stats/dm" className="text-steel-400 hover:text-rust-300">
              the deathmatch record
            </Link>
            , the same as any other night on the server. A map is matched to the
            archive by its title rather than its filename, because the title is
            what the server reports.
          </p>
        </section>
      ) : (
        <section className="mt-6">
          {/*
            Not "back to the standing rotation", which is what this said and
            was not true. Switching a pack off tells the applier to stop
            changing the server; it does not put anything back, because this
            system knows what it set and not what was there before. The server
            keeps running whatever rotation it was last given, and saying
            otherwise described a state that does not exist.
          */}
          <p className="max-w-3xl text-sm leading-relaxed text-steel-400">
            No themed pack is running at the moment. The deathmatch server is
            on whatever rotation it was last given, which may well be the last
            pack listed below. When a pack is switched on, this page says which,
            lists every map in it and credits whoever made them.
          </p>
        </section>
      )}

      {others.length > 0 ? (
        <section className="mt-12 border-t border-basalt-800 pt-6">
          <h2 className="section-heading">Packs that have run before</h2>
          <div className="mt-4 space-y-8">
            {others.map((pack) => (
              <div key={pack.slug}>
                <h3 className="font-display text-lg font-bold text-steel-200">
                  {pack.name}
                </h3>
                <p className="mt-0.5 font-mono text-[0.6875rem] text-steel-600">
                  {pack.maps.length} {pack.maps.length === 1 ? "map" : "maps"}
                  {pack.activatedAt
                    ? ` · last on ${dayLabel(pack.activatedAt.slice(0, 10))}`
                    : " · never switched on"}
                </p>
                {pack.blurb ? (
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-steel-400">
                    {pack.blurb}
                  </p>
                ) : null}
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {pack.maps.map((entry) => (
                    <li key={entry.filename} className="text-xs text-steel-400">
                      {entry.url ? (
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="hover:text-rust-300"
                        >
                          {entry.title?.trim() || entry.filename}
                        </a>
                      ) : (
                        (entry.title?.trim() || entry.filename)
                      )}
                      {entry.author ? (
                        <span className="text-steel-600"> · {entry.author}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
