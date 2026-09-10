import Image from "next/image";
import Link from "next/link";

import type { CatalogueArrival } from "@/lib/catalogue";
import {
  ARCHIVE_TIME_ZONE,
  categoryOf,
  displayVersion,
  levelFact,
  SECTION_BY_KIND,
} from "@/lib/downloads";
import { compatPhrase } from "@/lib/rfl/clients";
import { publicUrl } from "@/lib/storage";

/**
 * What has just arrived on the shelves, as the front page's second story.
 *
 * This is the second answer to the same request. The first was a strip in the
 * rail: a heading, four rows, a thumbnail the size of a postage stamp and a
 * date. The owner saw it and asked again, for "info on new maps", which is
 * evidence about where as much as about how much. A list of names in a sidebar
 * is a link to the catalogue; a story under the lead is the page saying
 * something happened.
 *
 * So it sits in the main column, directly under the lead article, and it is
 * built from the same parts the lead is built from: a kicker in red caps, a
 * headline, a line of facts, a paragraph. There is deliberately **no section
 * heading**. The kicker already says what kind of thing this is, in the same
 * class and the same position as the article's own, and the owner has now twice
 * cut things off these pages for saying something a second time.
 *
 * A lead plus two short rows, never three equal stories, and the reason is
 * arithmetic rather than taste. `scripts/ingest.mjs` stamps one publish time
 * across a whole bulk run, and 391 custom maps are waiting to be imported off
 * the live server. Three equal stories would print the same kicker three times
 * the morning after that import, over three alphabetically-first files from a
 * dump of twenty year old maps. A lead plus rows prints it once. One bulk event
 * can take this block, but it can only take it once.
 *
 * The release year on the facts line is the other half of that defence: a 2003
 * file archived on a Tuesday reads as a 2003 file, not as news.
 *
 * Everything renders on the server.
 */

/*
 * The archive's own timezone, which is also what the shelf row, the hub and the
 * item page use. See `ARCHIVE_TIME_ZONE`: all three of those said UTC until
 * this block was built and the disagreement became visible, with one map
 * reading "9 Sept" on the page it links to and "10 Sept" here.
 */
const ARRIVED = new Intl.DateTimeFormat("en-GB", {
  timeZone: ARCHIVE_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** ` · ` between parts, hidden from a screen reader, which hears the pause anyway. */
function Dot() {
  return <span aria-hidden="true"> · </span>;
}

/**
 * The line under the title: who made it, what it is, when it came out, what is
 * inside it and what loads it.
 *
 * Every part is omitted when it is not known rather than printed as a dash, and
 * that is the whole design of this block. Most of what will land on these
 * shelves is a twenty year old file off a dead forum with no picture, no author
 * and no summary, and a row of "not known" is worse than a shorter line. What
 * survives even then is generated rather than typed: the shelf, the facet, the
 * level file name and the compatibility reading all come out of the file
 * itself.
 */
function Facts({ item }: { item: CatalogueArrival }) {
  const section = SECTION_BY_KIND[item.kind];
  const category = categoryOf(section, item.category);
  const inside = levelFact(item.levelCount, item.levelPath);

  /*
   * The same phrase the shelf rows render, from the same function, so a reader
   * cannot meet "Any client" here and different words for it on the page this
   * links to. Only asked at all on a shelf that holds levels: an asset has no
   * client list and the question is meaningless there.
   */
  const compat = section.hasLevels
    ? compatPhrase(item.playsOn, item.detectionConfidence, item.rflVersion)
    : null;

  /*
   * The year alone, never a day. This is when the thing came out, which is
   * usually twenty years before it reached this site, and printing it to the
   * day would invite it to be read as an arrival date. Same rule the shelf row
   * applies.
   */
  const released = item.releasedOn ? item.releasedOn.slice(0, 4) : null;

  return (
    <p className="mt-1 text-xs text-steel-400">
      by {item.authorName ?? "an unknown author"}
      {category ? (
        <>
          <Dot />
          {category.label}
        </>
      ) : null}
      {released ? (
        <>
          <Dot />
          {released}
        </>
      ) : null}
      {inside ? (
        <>
          <Dot />
          <span className="font-mono">{inside}</span>
        </>
      ) : null}
      {compat ? (
        <>
          <Dot />
          <span title={compat.title} className={compat.warn ? "text-oxide-400" : undefined}>
            {compat.text}
          </span>
        </>
      ) : null}
    </p>
  );
}

export function NewArrivals({ items }: { items: CatalogueArrival[] }) {
  /*
   * Nothing published means no block at all, before any rule or heading is
   * drawn. A promise with nothing under it is furniture, and this sits on the
   * busiest page of the site.
   */
  if (items.length === 0) return null;

  const lead = items[0];
  const rest = items.slice(1, 3);

  const section = SECTION_BY_KIND[lead.kind];
  const href = `${section.route}/${lead.slug}`;
  const version = displayVersion(lead.releaseVersion);

  /*
   * Null here has two causes and this is the one place on the site that
   * deliberately does not tell them apart: nobody ever photographed the file,
   * or `NEXT_PUBLIC_R2_PUBLIC_BASE` is unset and we cannot serve the picture we
   * have. The listings and the item page do distinguish them, because a hole in
   * a column of thumbnails needs explaining and an operator fault should read as
   * an operator fault. A story has nothing to line up against, so it simply runs
   * full width with no frame and no reserved space.
   */
  const shot = lead.screenshotKey ? publicUrl(lead.screenshotKey) : null;

  return (
    <section className="border-t border-basalt-800 pt-6">
      <article className="flex flex-wrap gap-x-4 gap-y-3 sm:flex-nowrap">
        {shot ? (
          /*
           * `aria-hidden` with no tab stop: the title beside it links to the
           * same page, and a second link whose only content is an empty alt has
           * no accessible name at all.
           */
          <Link
            href={href}
            aria-hidden="true"
            tabIndex={-1}
            className="relative aspect-video w-full shrink-0 overflow-hidden rounded-sm border border-basalt-700 bg-basalt-900 sm:w-48"
          >
            <Image
              src={shot}
              alt=""
              fill
              sizes="(min-width: 40rem) 12rem, 100vw"
              className="object-cover"
            />
          </Link>
        ) : null}

        <div className="min-w-0">
          {/*
            `section.noun` rather than the word "map", so this reads "New tool"
            the day a tool is the newest thing, with no second design for the
            other three shelves.
          */}
          <p className="eyebrow">
            New {section.noun}
            {lead.publishedAt ? ` · ${ARRIVED.format(lead.publishedAt)}` : ""}
          </p>

          <h3 className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <Link
              href={href}
              className="font-display text-lg font-semibold leading-snug text-steel-100 transition-colors hover:text-rust-400"
            >
              {lead.title}
            </Link>
            {version ? (
              <span className="font-mono text-xs text-steel-400">{version}</span>
            ) : null}
          </h3>

          <Facts item={lead} />

          {/* The one field a person has to type, and therefore the one that is
              usually absent. The block reads as a story without it. */}
          {lead.summary ? (
            <p className="mt-2 text-sm leading-relaxed text-steel-300">{lead.summary}</p>
          ) : null}
        </div>
      </article>

      {rest.length > 0 ? (
        /*
          No thumbnails down here. The lead carries the picture; a column of
          empty frames is what this block would mostly be once the archive
          proper lands.
        */
        <ul className="mt-5 border-t border-basalt-800">
          {rest.map((item) => {
            const itemSection = SECTION_BY_KIND[item.kind];
            const itemCategory = categoryOf(itemSection, item.category);

            return (
              <li key={item.id} className="border-b border-basalt-800 last:border-b-0">
                <Link
                  href={`${itemSection.route}/${item.slug}`}
                  className="group flex items-baseline gap-3 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-steel-300 group-hover:text-rust-300">
                    {item.title}
                  </span>
                  <span className="shrink-0 text-[0.625rem] uppercase tracking-wider text-steel-400">
                    {itemSection.title}
                    {itemCategory ? ` · ${itemCategory.label}` : ""}
                    {item.publishedAt ? ` · ${ARRIVED.format(item.publishedAt)}` : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* Styled as the lead article's "Read the full report", because it is the
          same kind of thing: the way out of a story into the section it came
          from. */}
      <Link
        href="/downloads"
        className="mt-5 inline-block font-display text-[0.6875rem] font-semibold uppercase tracking-widest text-rust-400 hover:text-rust-300"
      >
        All downloads
      </Link>
    </section>
  );
}
