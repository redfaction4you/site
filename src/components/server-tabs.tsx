import Link from "next/link";

import { SERVERS } from "@/lib/servers";

/**
 * The three servers as tabs.
 *
 * Links, not client state, which is the same trade every other control on this
 * site makes: each tab is a real URL somebody can paste into Discord, it works
 * before any JavaScript loads, and the browser's back button does what a person
 * expects. The tab strip is rendered by each server page rather than by a
 * layout, so nothing else under `/servers` is accidentally wrapped in it.
 *
 * Drawn as buttons rather than underlined words: the first tabs on this site
 * were small text and the owner could not tell they were controls.
 *
 * **The label is the distinguishing word, not the whole name.** Three tabs
 * each reading "RF4U - ..." is three copies of the site's own name and one word
 * of information, and on a phone it wraps.
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

/**
 * "RF4U - Halloween" reads as "Halloween" on a tab.
 *
 * Also takes the older "RedFaction4You.com (Halloween)" form, which is what the
 * server browser still shows for a server whose config has not been renamed.
 */
export function shortName(name: string): string {
  return name.match(/\(([^)]+)\)\s*$/)?.[1] ?? name.replace(/^RF4U\s*-\s*/i, "");
}
