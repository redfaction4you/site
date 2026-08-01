import Link from "next/link";

import { ARCHIVE_NAV } from "@/lib/nav";

/**
 * The strip of archive pages, under the masthead's own nav.
 *
 * `active` is passed rather than derived, so this stays a server component: the
 * pages using it already know which one they are, and a client component here
 * would ship JavaScript to render five links. It is also more accurate than a
 * prefix match would be, since `/matches/map/ankh-b12` belongs under Maps while
 * beginning with the Nights href.
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
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`}
    >
      {ARCHIVE_NAV.map((item) => {
        const current = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={
              "font-display text-[0.625rem] uppercase tracking-widest transition-colors " +
              (current
                ? "text-rust-400"
                : "text-steel-500 hover:text-steel-200")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
