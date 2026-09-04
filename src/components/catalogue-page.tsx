import Link from "next/link";

import {
  countByCategory,
  listItems,
  listTags,
  type CatalogueFilters,
} from "@/lib/catalogue";
import {
  categoryOf,
  DEFAULT_SORT,
  parseSort,
  SORT_LABELS,
  SORTS,
  type Section,
  type Sort,
} from "@/lib/downloads";
import { DISCORD_INVITE } from "@/lib/nav";
import { ALL_CLIENTS, CLIENT_LABELS, type RfClient } from "@/lib/rfl/clients";
import { DownloadRow } from "@/components/download-row";

/**
 * One listing page, shared by all four catalogue sections.
 *
 * Filters are plain links carrying query parameters rather than client-side
 * state. That keeps every filtered view a real URL somebody can bookmark or
 * paste into Discord, which matters more here than a slicker interaction: this
 * is an archive, and its whole value is that links to it keep working.
 *
 * Sorting is the same rule for one further reason. "The ten most downloaded CTF
 * maps" is a thing people link each other to, and a sort held in component state
 * cannot be linked to at all: the recipient opens the page and sees the default.
 * `/maps?type=ctf&sort=downloads` is the whole view in one line of text. It also
 * keeps this a server component, so a shelf of two hundred maps ships no
 * JavaScript to sort itself with.
 *
 * The category parameter is `type`, not `category`, which is what `Category.id`
 * in `@/lib/downloads` documents. `/maps?type=ctf` is the URL somebody types by
 * hand, and it should read as English.
 */

/**
 * The direction each order runs in.
 *
 * A mark, not a control. `ORDER_BY` in `catalogue.ts` fixes one direction per
 * sort and there is nothing to reverse, unlike the statistics table where
 * clicking the column in force turns it round. Newest, most recently updated and
 * most downloaded all count down; a name counts up. Saying so costs one glyph
 * and stops the arrow being read as an offer.
 */
const SORT_MARK: Record<Sort, string> = {
  new: "▾",
  updated: "▾",
  downloads: "▾",
  name: "▴",
};

function isClient(value: string | undefined): value is RfClient {
  return Boolean(value) && ALL_CLIENTS.includes(value as RfClient);
}

function FilterLink({
  href,
  active,
  title,
  children,
}: {
  href: string;
  active: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-current={active ? "true" : undefined}
      className={
        "rounded-sm border px-2.5 py-1 font-display text-xs font-semibold uppercase tracking-wider transition-colors " +
        (active
          ? "border-rust-500 bg-rust-500/15 text-rust-300"
          : "border-basalt-700 bg-basalt-850 text-steel-200 hover:border-basalt-600 hover:text-steel-100")
      }
    >
      {children}
    </Link>
  );
}

/**
 * A facet with nothing published under it.
 *
 * Shown rather than hidden, and not a link. A reader looking for Damage Control
 * maps is owed the answer "none yet" in the place they looked for it; dropping
 * the chip answers nothing, and linking it offers a page that can only say the
 * same thing after a round trip. The dashed edge is what carries the state,
 * because dimming the text below `steel-400` would make it unreadable, and an
 * empty shelf is not less important than a full one.
 */
function EmptyChip({ label, title }: { label: string; title: string }) {
  return (
    <span
      title={title}
      className="rounded-sm border border-dashed border-basalt-700 px-2.5 py-1 font-display text-xs font-semibold uppercase tracking-wider text-steel-400"
    >
      {label} <span className="tabular-nums">0</span>
    </span>
  );
}

/** The number on a chip. Quieter than its label, never quieter than legible. */
function Count({ value }: { value: number }) {
  return <span className="tabular-nums text-steel-400">{value}</span>;
}

function EmptyState({ section }: { section: Section }) {
  return (
    <div className="panel mt-10 p-8 text-center">
      <h2 className="font-display text-xl font-bold text-steel-100">
        {section.emptyHeading}
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-steel-400">
        {section.emptyBody}
      </p>
      <a
        href={DISCORD_INVITE}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-6 inline-block rounded-sm bg-rust-500 px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-wider text-white transition-colors hover:bg-rust-400"
      >
        Got files to contribute?
      </a>
    </div>
  );
}

function NoMatches({ section }: { section: Section }) {
  return (
    <div className="panel mt-10 p-8 text-center">
      <h2 className="font-display text-lg font-bold text-steel-100">
        Nothing matches those filters
      </h2>
      <p className="mt-3 text-sm text-steel-400">
        <Link
          href={section.route}
          className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
        >
          Clear them and see everything
        </Link>
      </p>
    </div>
  );
}

export async function CataloguePage({
  section,
  searchParams,
}: {
  section: Section;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const one = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const sort = parseSort(one("sort"));

  const filters: CatalogueFilters = {
    q: one("q") || undefined,
    category: one("type") || undefined,
    tag: one("tag") || undefined,
    client: isClient(one("client")) ? (one("client") as RfClient) : undefined,
    sort,
  };

  const [entries, tags, categoryCounts] = await Promise.all([
    listItems(section.kind, filters),
    listTags(section.kind),
    /*
     * Counted for every section, including the two with no facets to show them
     * on, because the total is what tells an empty shelf from a narrow filter.
     * A section with no categories groups into a single "none" bucket, which
     * sums to the same number.
     */
    countByCategory(section.kind),
  ]);

  const publishedTotal = Object.values(categoryCounts).reduce(
    (total, count) => total + count,
    0,
  );

  const filtered = Boolean(
    filters.q || filters.tag || filters.client || filters.category,
  );

  /*
   * Nothing published and nothing matching are different states and get
   * different copy: one is "we have not filled this in yet", the other is "your
   * filters are too narrow". Conflating them tells somebody the archive is
   * empty when it is only their filter that is.
   *
   * The test is the shelf's own total rather than anything derived from the
   * filtered result, which is what it used to be. A shelf holding maps that
   * carry no tags, filtered down to nothing, read as a shelf holding no maps.
   */
  const anyPublished = publishedTotal > 0;
  const activeCategory = categoryOf(section, filters.category ?? null);

  /*
   * Every link on the page is this page's URL with one parameter changed and
   * the rest carried through, so filtering by a client does not silently drop
   * the category you were already looking at.
   *
   * Keyed by the name in the URL rather than by the field name in
   * `CatalogueFilters`, because the two differ for exactly one of them, and
   * `type` is the half a reader sees.
   */
  const current: Record<string, string | undefined> = {
    q: filters.q,
    type: filters.category,
    client: filters.client,
    tag: filters.tag,
    /*
     * The default order is the absence of the parameter, so `/maps` and
     * `/maps?sort=new` are one URL rather than two that render identically.
     * Shorter to paste, and one thing for a search engine to index.
     */
    sort: sort === DEFAULT_SORT ? undefined : sort,
  };

  const withParam = (key: string, value: string | undefined) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(current)) {
      if (v && k !== key) params.set(k, String(v));
    }
    if (value) params.set(key, value);
    const query = params.toString();
    return query ? `${section.route}?${query}` : section.route;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <p className="eyebrow">Downloads</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">
        {section.title}
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-steel-300">
        {section.intro}
      </p>
      {/* The facet's own line, which is what a category blurb is written for. */}
      {activeCategory ? (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-steel-400">
          {activeCategory.blurb}
        </p>
      ) : null}

      {anyPublished ? (
        <div className="mt-8 space-y-3">
          {section.categories.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-display text-xs uppercase tracking-widest text-steel-400">
                Type
              </span>
              <FilterLink
                href={withParam("type", undefined)}
                active={!filters.category}
              >
                All <Count value={publishedTotal} />
              </FilterLink>
              {section.categories.map((category) => {
                const count = categoryCounts[category.id] ?? 0;

                return count === 0 ? (
                  <EmptyChip
                    key={category.id}
                    label={category.label}
                    title={`${category.blurb} None published yet.`}
                  />
                ) : (
                  <FilterLink
                    key={category.id}
                    href={withParam(
                      "type",
                      filters.category === category.id ? undefined : category.id,
                    )}
                    active={filters.category === category.id}
                    title={category.blurb}
                  >
                    {category.label} <Count value={count} />
                  </FilterLink>
                );
              })}
            </div>
          ) : null}

          {section.hasLevels ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-display text-xs uppercase tracking-widest text-steel-400">
                Plays on
              </span>
              {ALL_CLIENTS.map((client) => (
                <FilterLink
                  key={client}
                  href={withParam(
                    "client",
                    filters.client === client ? undefined : client,
                  )}
                  active={filters.client === client}
                >
                  {CLIENT_LABELS[client]}
                </FilterLink>
              ))}
            </div>
          ) : null}

          {tags.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-display text-xs uppercase tracking-widest text-steel-400">
                Tags
              </span>
              {tags.map(({ tag, count }) => (
                <FilterLink
                  key={tag}
                  href={withParam("tag", filters.tag === tag ? undefined : tag)}
                  active={filters.tag === tag}
                >
                  {tag} <Count value={count} />
                </FilterLink>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!anyPublished ? (
        <EmptyState section={section} />
      ) : entries.length === 0 ? (
        <NoMatches section={section} />
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-basalt-700 pb-2">
            <p className="text-sm text-steel-400">
              {entries.length}{" "}
              {entries.length === 1 ? section.noun : section.pluralNoun}
              {filtered ? " matching" : ""}
            </p>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 font-display text-xs uppercase tracking-widest text-steel-400">
                Sort
              </span>
              {SORTS.map((option) => (
                <FilterLink
                  key={option}
                  href={withParam(
                    "sort",
                    option === DEFAULT_SORT ? undefined : option,
                  )}
                  active={option === sort}
                >
                  {SORT_LABELS[option]}
                  {option === sort ? (
                    <span aria-hidden="true" className="ml-1">
                      {SORT_MARK[option]}
                    </span>
                  ) : null}
                </FilterLink>
              ))}
            </div>
          </div>

          {/* Clipped, so the last row's hover tint stops at the rounded corner
              rather than squaring it off. */}
          <ul className="panel mt-4 overflow-hidden">
            {entries.map((item) => (
              <DownloadRow key={item.id} item={item} section={section} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
