import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import {
  countByKind,
  listMostDownloaded,
  listNewest,
  type CatalogueHighlight,
} from "@/lib/catalogue";
import {
  ARCHIVE_TIME_ZONE,
  categoryOf,
  displayVersion,
  SECTION_BY_KIND,
  SECTIONS,
  type Section,
} from "@/lib/downloads";
import { DISCORD_INVITE } from "@/lib/nav";
import { publicUrl } from "@/lib/storage";

export const metadata: Metadata = {
  title: "Downloads",
  description:
    "Maps, assets, mods and tools for Red Faction (2001). Free, no account needed, hosted here so the links keep working.",
};

/*
 * An hour stale, the same trade the detail pages make, and what it covers is
 * narrower than it looks.
 *
 * Every admin action revalidates the whole layout, so a map published two
 * minutes ago is already at the top of the list below rather than an hour
 * behind it. What this window actually holds back is the download counter,
 * which `/api/download/[fileId]` bumps and which revalidates nothing, so the
 * ranking here can be an hour off the figures behind it. That is a difference
 * nobody can see, and the alternative is rebuilding the hub on every visit in
 * order to reorder five rows.
 */
export const revalidate = 3600;

/*
 * How much of the archive the hub shows, and why each number is what it is.
 *
 * `NEWEST_SHOWN` is a digest rather than a listing. The shelves are one click
 * away and they are where somebody goes to read down two hundred maps; eight
 * rows is a fortnight of publishing at any rate this archive has ever managed,
 * so a visitor who was last here a week ago sees everything they missed without
 * scrolling for it.
 *
 * `RANKING_FLOOR` is the one that matters. A top five is a ranking when it is
 * drawn from enough rows that being in it means something, and below twice its
 * own length it is not a ranking at all: it is the whole shelf again, in a
 * different order, printed under the rows it has just repeated. So the floor is
 * derived from the length rather than typed as a number of its own, because the
 * two drifting apart is exactly how that comes back.
 */
const NEWEST_SHOWN = 8;
const RANKED_SHOWN = 5;
const RANKING_FLOOR = RANKED_SHOWN * 2;

/**
 * `9 Sep 2026`, day first, which is how every other date on this site reads.
 *
 * Pinned to UTC rather than left to the runtime, because the formatter runs on
 * the server and the timezone there is not a thing anybody chose. Written out
 * here rather than imported from the shelf row next door: the catalogue writes
 * its dates per surface, and a date format is not a good enough reason for the
 * hub to depend on a component it does not render.
 */
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  timeZone: ARCHIVE_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * One item on the hub, as a row.
 *
 * The same shape as a shelf row and deliberately shorter: no summary, no tags,
 * no compatibility badge. Those belong where somebody is choosing between fifty
 * maps. Here a row says what the thing is, which shelf it came off and who made
 * it, and the rest of the answer is on the page it links to.
 *
 * `figure` is what the row is there to demonstrate, so it changes with the list
 * the row sits in. Under Newest that is when the thing arrived; under Most
 * downloaded it is the count being ranked on. A row carrying both would be a
 * row that stops either list meaning anything.
 */
function HubRow({
  item,
  figure,
}: {
  item: CatalogueHighlight;
  figure: "published" | "downloads";
}) {
  const section = SECTION_BY_KIND[item.kind];
  const category = categoryOf(section, item.category);
  const version = displayVersion(item.releaseVersion);

  /*
   * A null here has two quite different causes and the placeholder says which.
   * Either nobody ever photographed the thing, which is ordinary for a file
   * recovered off a dead forum, or there is a screenshot and `publicUrl` has
   * told us the bucket is not configured. The second is our fault and should
   * read as our fault.
   */
  const shot = item.screenshotKey ? publicUrl(item.screenshotKey) : null;
  const unserved = item.screenshotKey !== null && shot === null;

  const published = item.publishedAt
    ? DAY_MONTH_YEAR.format(item.publishedAt)
    : null;

  return (
    <li className="border-b border-basalt-800 transition-colors last:border-b-0 odd:bg-steel-500/[0.04] hover:bg-rust-500/[0.07]">
      {/* Wraps on a phone so the figure drops on to its own line, and holds one
          line from `sm` up. The same arrangement the shelf rows use, for the
          same reason: nothing is ever off the right edge. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:flex-nowrap">
        <Link
          href={`${section.route}/${item.slug}`}
          className="group flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-auto"
        >
          <div className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-sm border border-basalt-700 bg-basalt-900 sm:w-24">
            {shot ? (
              <Image
                src={shot}
                /* Decorative: the title is inside the same link, so announcing
                   the file as well would say the same thing twice. */
                alt=""
                fill
                sizes="(min-width: 640px) 96px, 80px"
                className="object-cover"
              />
            ) : (
              <span
                title={
                  unserved
                    ? `There is a screenshot of this ${section.noun}, but image storage is not configured, so it cannot be shown.`
                    : `No screenshot of this ${section.noun} yet.`
                }
                className="flex h-full items-center justify-center px-1 text-center font-display text-[0.5625rem] uppercase leading-tight tracking-wider text-steel-400"
              >
                {unserved ? "Not served yet" : "No screenshot"}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h3 className="font-display text-sm font-semibold leading-snug text-steel-100 transition-colors group-hover:text-rust-300">
                {item.title}
              </h3>
              {/* Quieter than the title and never bolder. A version is part of
                  the name of the file, not a second heading. */}
              {version ? (
                <span className="text-xs font-normal text-steel-400">
                  {version}
                </span>
              ) : null}
            </div>

            {/* Which shelf this came off is the whole point of a list that
                crosses all four, so it leads the line. The name after it is
                `author_name`, never whoever uploaded the zip: most of this was
                made by people who will never hold an account here. */}
            <p className="mt-0.5 truncate text-xs text-steel-400">
              {section.title}
              {category ? ` · ${category.label}` : ""}
              {" · "}
              {item.authorName ?? "Author unknown"}
            </p>
          </div>
        </Link>

        {/*
          Outside the link on purpose, the same call the shelf row makes. It is
          a reading rather than a destination, and a link whose accessible name
          trails off into a date and a download count is a link nobody can hear
          the end of.
        */}
        {figure === "downloads" ? (
          <p className="w-full shrink-0 text-xs text-steel-400 sm:w-auto sm:whitespace-nowrap sm:text-right">
            <span className="font-mono tabular-nums text-steel-200">
              {item.downloadCount.toLocaleString("en-GB")}
            </span>{" "}
            {item.downloadCount === 1 ? "download" : "downloads"}
          </p>
        ) : published ? (
          <p className="w-full shrink-0 text-xs text-steel-400 sm:w-auto sm:whitespace-nowrap sm:text-right">
            {published}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * One shelf, as a line rather than as a card.
 *
 * These were four cards carrying a tagline and thirteen facet chips between
 * them, which is most of what made the hub a page of nothing but signposts.
 * They are still the navigation and they no longer have to carry the page, so
 * what is left is a name, what is on the shelf and how much of it there is.
 *
 * The facet chips are gone rather than shrunk. They offered "CTF maps" without
 * knowing whether there were any, so most of them led to a listing that could
 * only answer that nothing matched. The shelf page shows those same facets with
 * a count against each and the empty ones marked as empty, which is strictly
 * the better version of the offer and is one click away.
 */
function ShelfLink({ section, count }: { section: Section; count: number }) {
  return (
    <li className="border-b border-basalt-800 last:border-b-0">
      <Link href={section.route} className="group block py-2.5">
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-display text-sm font-semibold uppercase tracking-wider text-steel-100 transition-colors group-hover:text-rust-300">
            {section.title}
          </span>
          {/*
            The count says what is actually on the shelf, including when that is
            nothing. An empty shelf that says so beats one that looks full until
            it is opened.
          */}
          <span className="shrink-0 font-mono text-[0.625rem] uppercase tracking-widest tabular-nums text-steel-400">
            {count === 0
              ? "None yet"
              : `${count} ${count === 1 ? section.noun : section.pluralNoun}`}
          </span>
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-steel-400">
          {section.tagline}
        </span>
      </Link>
    </li>
  );
}

/**
 * The way in to the downloads, which the owner asked for as one page.
 *
 * It was four cards of facet chips over a block explaining the policy, which is
 * a page that only points at other pages, and this site's scope rule is that a
 * page has to be something you can download, read or watch. So the archive
 * itself is on it now. Somebody arriving here wants to know what is here, what
 * is new and what other people are taking, and then to get to a shelf, and that
 * is the order the page is in.
 *
 * The shelves have moved to the side rather than gone. They are navigation, the
 * same four links that sit in the site header, and navigation is what an aside
 * is for; the middle of the page belongs to the rows. That is the arrangement
 * the night and map pages already use, and it is deliberately not a third one.
 *
 * The intro paragraph stays here and only here. The shelves used to repeat it
 * above every listing, which is a paragraph nobody reads a second time; this is
 * the door every reader comes through and the one place it does any work.
 */
export default async function DownloadsPage() {
  const counts = await countByKind();
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  /*
   * Below the floor the ranking is not fetched at all, rather than fetched and
   * thrown away. With one published item that is one query the page never has
   * to make.
   */
  const [newest, ranked] = await Promise.all([
    listNewest(NEWEST_SHOWN),
    total >= RANKING_FLOOR
      ? listMostDownloaded(RANKED_SHOWN)
      : Promise.resolve([] as CatalogueHighlight[]),
  ]);

  /*
   * The other half of the test, and the half that has already shipped wrong
   * once. Before `/api/download/[fileId]` existed nothing ever called
   * `recordDownload`, so `download_count` was zero on every row and "most
   * downloaded" was an order over a column of zeroes: a ranking that ranked
   * nothing and looked exactly like one that did. Enough rows to rank is not
   * sufficient on its own, something has to have been taken.
   */
  const showRanking = ranked.length > 0 && (ranked[0]?.downloadCount ?? 0) > 0;

  /*
   * Once the list is the whole catalogue it is not a selection of the newest,
   * and calling it "Newest" sends a reader looking for the rest of it. Saying
   * which one it is costs a word.
   */
  const showingAll = newest.length >= total;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8">
      <p className="eyebrow">Archive</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">
        Downloads
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-steel-300">
        Everything the community built for Red Faction, kept in one place. All of
        it is free, none of it needs an account, and every file is held on this
        site rather than linked somewhere else, so a download that is here stays
        here.
      </p>

      {/*
        One layout whether or not there is anything to show. An empty catalogue
        changes what fills the column, not where the shelves are, so a reader who
        has been here before finds them in the same place either way.
      */}
      <div className="mt-10 grid gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 space-y-10">
          {total === 0 ? (
            /*
             * Nothing published yet, which is a different thing from a filter
             * that matched nothing and reads differently: the shelves are built
             * and waiting rather than narrow.
             */
            <section className="panel p-8">
              <h2 className="font-display text-xl font-bold text-steel-100">
                Nothing published yet
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-steel-400">
                The shelves are built and empty. They are being filled from
                archives of files scattered across dead forums and expired hosts,
                which is slower than scraping but means every entry is something
                we actually hold rather than a link to somewhere that may already
                be gone.
              </p>
              <a
                href={DISCORD_INVITE}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-6 inline-block rounded-sm bg-rust-500 px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-wider text-white transition-colors hover:bg-rust-400"
              >
                Got files to contribute?
              </a>
            </section>
          ) : (
            <>
              <section>
                <h2 className="section-heading">
                  {showingAll ? "Everything here" : "Newest"}
                </h2>
                <ul className="panel mt-3 overflow-hidden">
                  {newest.map((item) => (
                    <HubRow key={item.id} item={item} figure="published" />
                  ))}
                </ul>
              </section>

              {showRanking ? (
                <section>
                  <h2 className="section-heading">Most downloaded</h2>
                  {/*
                    Said plainly, because the number is not what a reader
                    assumes it is. The bucket is public, so anything fetched by
                    its key directly never passes the route that counts.
                  */}
                  <p className="mt-2 text-xs text-steel-400">
                    Counted through this site&rsquo;s own links, so the real
                    figures are higher by an amount nobody can measure.
                  </p>
                  <ul className="panel mt-3 overflow-hidden">
                    {ranked.map((item) => (
                      <HubRow key={item.id} item={item} figure="downloads" />
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>

        {/* Sticky, so the way on to a shelf stays reachable while the scroll
            walks down the rows. */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <h2 className="rule-heading">Shelves</h2>
          <ul className="mt-1">
            {SECTIONS.map((section) => (
              <ShelfLink
                key={section.id}
                section={section}
                count={counts[section.kind] ?? 0}
              />
            ))}
          </ul>
        </aside>
      </div>

      {/* The policy, under the archive it is about rather than above it. */}
      <div className="panel mt-12 p-6">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-steel-300">
          How this works
        </h2>
        {/* Held to a readable measure. The page is wider than it used to be so
            that the rows and the rail fit side by side, and prose run to the
            full width of that is a line nobody finishes. */}
        <div className="mt-3 max-w-3xl space-y-3 text-sm leading-relaxed text-steel-400">
          <p>
            A download here is a file on this site&rsquo;s own storage, which is
            the whole point: most of this material was last seen on a forum
            attachment or a free host that has since expired, and a catalogue
            that only points at those is a list of links waiting to rot. There is
            no wait, no counter to watch and no advertising against any of it.
          </p>
          <p>
            Credit goes to whoever made the thing, not to whoever uploaded it
            here. A lot of this was made by people who will never have an account
            on this site, and where the author is not known the page says so
            rather than guessing.
          </p>
          <p>
            If something here is yours and you would rather it were not, say so
            in{" "}
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noreferrer noopener"
              className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
            >
              Discord
            </a>{" "}
            and it comes down. Archiving somebody else&rsquo;s work without asking
            first is a real tradeoff, and this is the side of it we can offer.
          </p>
        </div>
      </div>
    </div>
  );
}
