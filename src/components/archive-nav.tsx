import Link from "next/link";

import { ARCHIVE_NAV } from "@/lib/nav";

/**
 * The strip of archive pages, under the masthead's own nav.
 *
 * A tab bar rather than a line of small links. The first version was 10px
 * uppercase in a muted grey, which is the styling this site uses for captions
 * and footnotes, so a navigation strip made of it read as a footnote: it was
 * there, and nobody could see it was there. Tabs are a shape people already
 * know means "these are the pages of this section".
 *
 * `active` is passed rather than derived, so this stays a server component: the
 * pages using it already know which one they are, and a client component here
 * would ship JavaScript to render five links. It is also more accurate than a
 * prefix match would be, since `/matches/map/ankh-b12` belongs under Maps while
 * beginning with the archive href.
 */
export function ArchiveNav({
  active,
  className = "",
}: {
  /** The href of the entry this page belongs to. */
  active?: string;
  className?: string;
}) {
  return (
    <nav
      aria-label="The archive"
      className={`border-b border-basalt-700 ${className}`}
    >
      <ul className="scrollbar-none -mb-px flex gap-1 overflow-x-auto">
        {ARCHIVE_NAV.map((item) => {
          const current = item.href === active;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={
                  "block border-b-2 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider transition-colors " +
                  (current
                    ? "border-rust-500 text-rust-300"
                    : "border-transparent text-steel-400 hover:border-basalt-500 hover:text-steel-100")
                }
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
