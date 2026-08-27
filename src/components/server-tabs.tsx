import Link from "next/link";

import { SERVERS } from "@/lib/servers";

/**
 * The four servers as tabs.
 *
 * Links, not client state, which is the same trade every other control on this
 * site makes: each tab is a real URL somebody can paste into Discord, it works
 * before any JavaScript loads, and the browser's back button does what a person
 * expects. The tab strip is rendered by each server page rather than by a
 * layout, so `/servers/map-packs` is not accidentally wrapped in it.
 *
 * Drawn as buttons rather than underlined words, for the reason `GameTabs`
 * records: the first version of that was small text and the owner could not tell
 * they were controls.
 *
 * **The label is the bracket, not the whole name.** Four tabs each reading
 * "RedFaction4You.com (...)" is four copies of the site's own name and one word
 * of information, and on a phone it wraps to four lines.
 */
export function ServerTabs({ active }: { active: string }) {
  return (
    <nav aria-label="Which server" className="mt-4 flex flex-wrap gap-2">
      {SERVERS.map((server) => {
        const current = server.slug === active;
        return (
          <Link
            key={server.slug}
            href={`/servers/${server.slug}`}
            aria-current={current ? "page" : undefined}
            data-server-theme={server.theme}
            className={
              "rounded-sm border px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.14em] transition-colors " +
              (current
                ? "server-accent-border server-accent-bg text-steel-100"
                : "border-basalt-600 bg-basalt-850 text-steel-400 hover:border-steel-500 hover:text-steel-200")
            }
          >
            {shortName(server.name)}
          </Link>
        );
      })}
    </nav>
  );
}

/** "RedFaction4You.com (Halloween)" reads as "Halloween" on a tab. */
export function shortName(name: string): string {
  return name.match(/\(([^)]+)\)\s*$/)?.[1] ?? name;
}
