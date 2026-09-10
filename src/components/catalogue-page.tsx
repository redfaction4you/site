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
  type Category,
  type Section,
  type Sort,
} from "@/lib/downloads";
import { DISCORD_INVITE } from "@/lib/nav";
import { ALL_CLIENTS, CLIENT_LABELS, type RfClient } from "@/lib/rfl/clients";
import { DownloadRow } from "@/components/download-row";

/**
 * One listing page, shared by all four catalogue sections.
 *
 * Two columns: the shelf itself, and the filters in an aside beside it. It used
 * to be one column with eight blocks stacked above the first row, an eyebrow, a
 * heading, a three line intro, the blurb of whichever facet was in force, and
 * three rows of chips before the count and the sort. With one map published
 * that is absurd, and with two hundred it would still be wrong: a person
 * opening a shelf has come to see what is on it. What explains the shelf rather
 * than being the shelf now sits to the side of it.
 *
 * The intro is dropped rather than shortened. `/downloads` is the door every
 * reader comes through and it already says, once, that this is free, needs no
 * account and is hosted here; saying it again above each of four lists is a
 * paragraph nobody reads a second time. It still writes the page description in
 * the route file, which is where that sentence does real work. The one line of
 * it worth keeping was that compatibility is read out of the file itself, and
 * that is now a note under the filter it explains.
 *
 * Filters are plain links carrying query parameters rather than client-side
 * state, and putting them in an aside changes nothing about that. A filter
 * panel is not client state; it is the same links in a better place. That keeps
 * every filtered view a real URL somebody can bookmark or paste into Discord,
 * which matters more here than a slicker interaction: this is an archive, and
 * its whole value is that links to it keep working.
 *
 * Sorting is the same rule for one further reason. "The ten most downloaded CTF
 * maps" is a thing people link each other to, and a sort held in component state
 * cannot be linked to at all: the recipient opens the page and sees the default.
 * `/maps?type=ctf&sort=downloads` is the whole view in one line of text. It also
 * keeps this a server component, so a shelf of two hundred maps ships no
 * JavaScript to sort itself with.
 *
 * The count and the sort stay in the main column directly above the rows rather
 * than joining the panel, because they describe the list instead of narrowing
 * it. Everything in the aside changes which rows there are; those two describe
 * the rows there already are.
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

/**
 * Which parameters the panel owns, and therefore what "clear" clears.
 *
 * `sort` is deliberately not one of them. An order is not a filter, and a link
 * that promises to clear filters should not quietly put the list back into
 * newest-first as well.
 */
const FILTER_KEYS = ["q", "type", "client", "tag"] as const;

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

/**
 * One labelled set of chips inside the panel.
 *
 * The label is a caption rather than a heading, because three of these stacked
 * in a 16rem column at real heading weight would rebuild in the aside the wall
 * of chrome this page was just rescued from. `note` is for the sentence a group
 * needs before it can be used at all, and most groups need none.
 */
function FilterGroup({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="font-display text-[0.625rem] font-semibold uppercase tracking-widest text-steel-400">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
      {note ? (
        <p className="mt-2 text-xs leading-relaxed text-steel-400">{note}</p>
      ) : null}
    </div>
  );
}

type PanelProps = {
  section: Section;
  filters: CatalogueFilters;
  tags: { tag: string; count: number }[];
  categoryCounts: Record<string, number>;
  publishedTotal: number;
  activeCategory: Category | null;
  activeCount: number;
  /** This page's URL with one parameter changed and the rest carried through. */
  href: (key: string, value: string | undefined) => string;
  /** The same URL with every filter parameter dropped and the order kept. */
  clearHref: string;
};

/**
 * Every way of narrowing the shelf, in one block.
 *
 * Rendered twice on purpose: once in the sticky aside on a wide screen, once
 * inside a closed `<details>` above the list on a phone. Two copies of a few
 * dozen chips is markup no reader ever notices, and the alternative is one copy
 * revealed by CSS, which cannot be done dependably now that a closed `details`
 * is hidden through `content-visibility` rather than through a rule a
 * stylesheet can simply override. A closed `details` does still ship its
 * contents, which is fine for chips and is exactly why nothing carrying an
 * image may ever go in one.
 *
 * The search chip is here even though nothing on this page sets `?q=`, because
 * something can: the parameter is honoured by `listItems`, so a link carrying
 * it produces a short list with no visible reason for being short. Showing it
 * as a filter in force, with the way out attached, is the difference between a
 * page that looks broken and a page that explains itself.
 */
function FilterPanel({
  section,
  filters,
  tags,
  categoryCounts,
  publishedTotal,
  activeCategory,
  activeCount,
  href,
  clearHref,
}: PanelProps) {
  return (
    <div className="space-y-5">
      {filters.q ? (
        <FilterGroup label="Search">
          <FilterLink href={href("q", undefined)} active title="Drop this search">
            {filters.q}{" "}
            <span aria-hidden="true" className="text-rust-400">
              ×
            </span>
          </FilterLink>
        </FilterGroup>
      ) : null}

      {section.categories.length ? (
        <FilterGroup
          label="Type"
          /* The facet's own line, which is what a category blurb is written
             for. It used to sit above the list, explaining a filter three
             blocks further down the page; here it is attached to the chip that
             turned it on. */
          note={activeCategory?.blurb}
        >
          <FilterLink href={href("type", undefined)} active={!filters.category}>
            All <Count value={publishedTotal} />
          </FilterLink>
          {section.categories.map((category) => {
            const count = categoryCounts[category.id] ?? 0;
            const active = filters.category === category.id;

            /*
             * An empty facet that is the one in force stays a link, because the
             * panel has to be able to show what is switched on. `/maps?type=ctf`
             * is a URL somebody can paste before a single CTF map is published,
             * and it landed on a dashed nought that looked like every other
             * facet nobody had filled, with nothing marking the filter that had
             * emptied the page.
             */
            return count === 0 && !active ? (
              <EmptyChip
                key={category.id}
                label={category.label}
                title={`${category.blurb} None published yet.`}
              />
            ) : (
              <FilterLink
                key={category.id}
                href={href("type", active ? undefined : category.id)}
                active={active}
                title={category.blurb}
              >
                {category.label} <Count value={count} />
              </FilterLink>
            );
          })}
        </FilterGroup>
      ) : null}

      {section.hasLevels ? (
        <FilterGroup
          label="Plays on"
          /* The one line worth rescuing from the intro, moved to the filter it
             is about. It also answers the question the mark on every row
             raises, which is where a claim like that comes from. */
          note="Read out of the level inside each file rather than entered by hand."
        >
          {ALL_CLIENTS.map((client) => (
            <FilterLink
              key={client}
              href={href("client", filters.client === client ? undefined : client)}
              active={filters.client === client}
            >
              {CLIENT_LABELS[client]}
            </FilterLink>
          ))}
        </FilterGroup>
      ) : null}

      {tags.length ? (
        <FilterGroup label="Tags">
          {tags.map(({ tag, count }) => (
            <FilterLink
              key={tag}
              href={href("tag", filters.tag === tag ? undefined : tag)}
              active={filters.tag === tag}
            >
              {tag} <Count value={count} />
            </FilterLink>
          ))}
        </FilterGroup>
      ) : null}

      {/* One link out of whatever combination somebody has built, offered only
          once there is something to undo. */}
      {activeCount > 0 ? (
        <p>
          <Link
            href={clearHref}
            className="font-display text-xs font-semibold uppercase tracking-wider text-rust-400 hover:text-rust-300"
          >
            Clear {activeCount === 1 ? "filter" : "all filters"}
          </Link>
        </p>
      ) : null}
    </div>
  );
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

/**
 * The other empty state, and deliberately not the same words.
 *
 * "Nothing published yet" and "your filters are too narrow" are different
 * facts, and telling somebody the archive is empty when it is only their filter
 * that is is the version of this that has to be avoided. The way out clears
 * every filter parameter rather than pointing at the bare route, so an order
 * somebody chose survives being widened.
 */
function NoMatches({ clearHref }: { clearHref: string }) {
  return (
    <div className="panel p-8 text-center">
      <h2 className="font-display text-lg font-bold text-steel-100">
        Nothing matches those filters
      </h2>
      <p className="mt-3 text-sm text-steel-400">
        <Link
          href={clearHref}
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

  /**
   * How many of the panel's parameters are in force.
   *
   * It labels the collapsed panel on a phone and it decides whether the list
   * says "matching", so it counts what a reader would count: the things they
   * turned on, not the order the page is in.
   */
  const activeCount = FILTER_KEYS.filter((key) => current[key]).length;

  const build = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...current, ...patch })) {
      if (value) params.set(key, String(value));
    }
    const query = params.toString();
    return query ? `${section.route}?${query}` : section.route;
  };

  const withParam = (key: string, value: string | undefined) =>
    build({ [key]: value });

  /*
   * Everything the panel owns, dropped in one go, built from `FILTER_KEYS`
   * rather than written out as the bare route. A fifth facet added later then
   * clears itself instead of quietly surviving a link that claims to clear
   * everything, and the order somebody chose is kept either way.
   */
  const clearHref = build(
    Object.fromEntries(FILTER_KEYS.map((key) => [key, undefined])),
  );

  const panel = (
    <FilterPanel
      section={section}
      filters={filters}
      tags={tags}
      categoryCounts={categoryCounts}
      publishedTotal={publishedTotal}
      activeCategory={activeCategory}
      activeCount={activeCount}
      href={withParam}
      clearHref={clearHref}
    />
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8">
      {/*
        The eyebrow is a way back as well as a label. None of the four shelves
        has a slot in the header, by design, so the hub is the only route
        between them, and somebody who arrived on a pasted `/maps?type=ctf`
        link otherwise has none at all.
      */}
      <p className="eyebrow">
        <Link href="/downloads" className="hover:text-rust-300">
          Downloads
        </Link>
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold text-steel-100">
        {section.title}
      </h1>

      {!anyPublished ? (
        <EmptyState section={section} />
      ) : (
        /*
         * The sticky aside from `/matches/[day]`, at the same 16rem, with the
         * `minmax(0,1fr)` guard `/matches/map/[map]` puts on its main column so
         * a long title cannot push the grid wider than the page. Two patterns
         * already do this and a third would only be a third thing to keep in
         * step.
         */
        <div className="mt-6 grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="min-w-0">
            {/*
              The same panel above the list on a phone, closed, so the maps are
              still the first thing under the heading rather than the third
              screen of it. The summary carries the count because a shut box
              hiding two filters in force is the one way this arrangement could
              lie about what is being shown.
            */}
            <details className="panel mb-4 lg:hidden">
              <summary className="cursor-pointer p-3 font-display text-xs font-semibold uppercase tracking-wider text-steel-200 hover:text-rust-300">
                Filters{" "}
                <span className="font-normal normal-case tracking-normal text-steel-400">
                  ({activeCount === 0 ? "none active" : `${activeCount} active`})
                </span>
              </summary>
              <div className="border-t border-basalt-700 p-3">{panel}</div>
            </details>

            {entries.length === 0 ? (
              <NoMatches clearHref={clearHref} />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-basalt-700 pb-2">
                  <p className="text-sm text-steel-400">
                    {entries.length}{" "}
                    {entries.length === 1 ? section.noun : section.pluralNoun}
                    {activeCount > 0 ? " matching" : ""}
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

                {/* Clipped, so the last row's hover tint stops at the rounded
                    corner rather than squaring it off. */}
                <ul className="panel mt-4 overflow-hidden">
                  {entries.map((item) => (
                    <DownloadRow key={item.id} item={item} section={section} />
                  ))}
                </ul>
              </>
            )}
          </div>

          {/*
            Sticky, so the way out of a filter that is too narrow is still on
            screen at the bottom of a long shelf, which is where a reader
            realises they want it. Capped and scrollable because the tag list
            grows with the archive, and a panel taller than the window is a
            panel whose last chips can never be reached.
          */}
          <aside
            aria-label={`Filter ${section.pluralNoun}`}
            className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto"
          >
            <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-steel-200">
              Filters
            </h2>
            <div className="mt-3 border-t border-basalt-700 pt-4">{panel}</div>
          </aside>
        </div>
      )}
    </div>
  );
}
