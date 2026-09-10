import Image from "next/image";
import Link from "next/link";

import type { CatalogueHighlight } from "@/lib/catalogue";
import { categoryOf, SECTION_BY_KIND } from "@/lib/downloads";
import { publicUrl } from "@/lib/storage";

/**
 * The newest things on the shelves, for the front page rail.
 *
 * The catalogue was reachable from the header and from nowhere else, so a map
 * published this afternoon appeared on `/downloads` and on the page nobody
 * lands on. The owner asked for it plainly: when a new asset or map gets
 * posted, it should show up on the front page.
 *
 * It reads `listNewest`, which is the same query the hub's "Just added" runs.
 * One query answering two surfaces rather than two that drift, and it is cached
 * under the catalogue tag, so this costs the front page nothing per request
 * even though the page is `force-dynamic` for the match archive's sake.
 *
 * Deliberately smaller than the hub row it mirrors. A rail is a third of the
 * width, so the thumbnail is 56px rather than 96, the summary is gone and the
 * download count is gone: what belongs here is that a thing exists, what it is
 * and where to click. The figure a reader wants at this size is the date, and
 * even that is only the day and month, because a list headed "New" saying 2026
 * four times is four repetitions of the heading.
 */

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Los_Angeles",
  day: "numeric",
  month: "short",
});

export function NewDownloads({ items }: { items: CatalogueHighlight[] }) {
  /*
   * Nothing published yet means no section at all, not a box saying so. The
   * rail is short and every heading in it is a promise that there is something
   * underneath; an empty one on the busiest page of the site is furniture.
   */
  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between border-b border-basalt-800 pb-1.5">
        <h2 className="font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
          New downloads
        </h2>
        <Link
          href="/downloads"
          className="font-display text-[0.625rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
        >
          All
        </Link>
      </div>

      <ul>
        {items.map((item) => {
          const section = SECTION_BY_KIND[item.kind];
          const category = categoryOf(section, item.category);
          const shot = item.screenshotKey ? publicUrl(item.screenshotKey) : null;
          const published = item.publishedAt ? DAY_MONTH.format(item.publishedAt) : null;

          return (
            <li key={item.id} className="border-b border-basalt-800 last:border-b-0">
              <Link
                href={`${section.route}/${item.slug}`}
                className="group flex items-center gap-2.5 py-2"
              >
                <div className="relative aspect-video w-14 shrink-0 overflow-hidden rounded-sm border border-basalt-800 bg-basalt-900">
                  {shot ? (
                    /* Decorative: the title sits inside the same link, so alt
                       text here would read the name out twice. */
                    <Image src={shot} alt="" fill sizes="56px" className="object-cover" />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-steel-300 group-hover:text-rust-300">
                    {item.title}
                  </p>
                  {/*
                    Which shelf, then the facet inside it, because a list that
                    crosses all four is unreadable without the first. The author
                    is left out at this width: it is `author_name` and it
                    matters, and a truncated name is worse than no name.
                  */}
                  <p className="truncate text-[0.625rem] uppercase tracking-wider text-steel-400">
                    {section.title}
                    {category ? ` · ${category.label}` : ""}
                  </p>
                </div>

                {published ? (
                  <span className="shrink-0 font-mono text-[0.625rem] tabular-nums text-steel-400">
                    {published}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
