import type { Metadata } from "next";
import Link from "next/link";

import { search } from "@/lib/search";

export const metadata: Metadata = {
  title: "Search",
  description:
    "Search the RedFaction4You archive: players, nights, matches by score, maps, match reports and the analyst.",
  // Same reasoning as /players. A search page indexed with somebody's handle in
  // the URL is the part nobody signed up for.
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string }> };

/**
 * One box for the whole archive.
 *
 * Everything here was reachable and almost none of it was findable. A reader who
 * remembers a 5-3 on Huna, or a name they played against once, or a phrase from
 * something the analyst wrote, had to know which section of the site files that
 * kind of thing and walk down to it.
 *
 * The results are grouped and the groups are ordered by what a query probably
 * meant: a bare word is usually a player, a date is usually a night, digits with
 * a dash between them are usually a scoreline. Pages come last, because somebody
 * who wanted the stats page could already see it in the header.
 *
 * A plain form with a GET action, so it works with no JavaScript and every
 * search is a URL somebody can paste. The same reasoning as the filters, which
 * are links rather than client state.
 */
export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const results = await search(q ?? "");

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <div className="border-b border-basalt-800 py-2.5">
        <p className="eyebrow">Search</p>
      </div>

      <form action="/search" className="mt-5 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={results.query}
          autoFocus
          placeholder="A player, a night, a score, a map, something written"
          aria-label="Search the archive"
          className="min-w-0 flex-1 rounded-sm border border-basalt-600 bg-basalt-900 px-3 py-2 text-sm text-steel-100 placeholder:text-steel-600 focus:border-rust-500 focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 rounded-sm border border-basalt-600 px-4 py-2 font-display text-xs font-semibold uppercase tracking-widest text-steel-200 transition-colors hover:border-rust-500 hover:text-rust-300"
        >
          Search
        </button>
      </form>

      {results.query.length === 0 ? (
        <p className="mt-6 text-sm leading-relaxed text-steel-400">
          Everything the archive holds: the people who have played, the nights
          they played on, a match by its score, a map, and anything written about
          any of it.
        </p>
      ) : results.total === 0 ? (
        <div className="mt-8">
          <p className="text-sm text-steel-300">
            Nothing matches <span className="text-steel-100">{results.query}</span>.
          </p>
          <p className="mt-2 max-w-prose text-xs leading-relaxed text-steel-500">
            Names are as the server recorded them, so a nickname somebody uses in
            Discord may not be the one on the scoreboard. A date can be written
            2026-07-31 or 31/07/2026, and a score as 5-3 either way round.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {results.groups.map((group) => (
            <section key={group.label}>
              <h2 className="rule-heading">{group.label}</h2>
              <ul className="mt-1">
                {group.hits.map((hit) => (
                  <li key={`${hit.kind}-${hit.href}-${hit.title}`}>
                    <Link
                      href={hit.href}
                      className="group flex items-baseline gap-3 border-b border-basalt-900 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-steel-200 group-hover:text-rust-300">
                        {hit.title}
                      </span>
                      {hit.detail ? (
                        <span className="shrink-0 font-mono text-[0.625rem] text-steel-600">
                          {hit.detail}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
