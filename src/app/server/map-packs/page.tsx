import type { Metadata } from "next";
import Link from "next/link";

import { MapShot } from "@/components/map-shot";
import { dayLabel } from "@/components/match-archive";
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

function PackMaps({ pack }: { pack: MapPack }) {
  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {pack.maps.map((entry) => {
        const title = entry.title?.trim() || entry.filename;
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
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function MapPacksPage() {
  const [active, all] = await Promise.all([activeMapPack(), listMapPacks()]);
  const others = all.filter((pack) => !pack.active);

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
          {active.blurb ? (
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-steel-300">
              {active.blurb}
            </p>
          ) : null}

          <PackMaps pack={active} />

          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-steel-500">
            Everything played here counts towards{" "}
            <Link href="/stats/dm" className="text-steel-400 hover:text-rust-300">
              the deathmatch record
            </Link>
            , the same as any other night on the server.
          </p>
        </section>
      ) : (
        <section className="mt-6">
          <p className="max-w-3xl text-sm leading-relaxed text-steel-400">
            No themed pack is running at the moment &mdash; the deathmatch
            server is on its standing rotation. When a pack is on, this page
            says which, lists every map in it and credits whoever made them.
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
