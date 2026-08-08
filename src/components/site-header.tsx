import Image from "next/image";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { auth, discordConfigured } from "@/lib/auth";
import { VISIBLE_NAV } from "@/lib/nav";

export async function SiteHeader() {
  // The header renders on every page, so anything that throws here takes the
  // whole site down. Until Discord is configured there is no session to read
  // and no reason to ask Auth.js for one.
  const session = discordConfigured ? await auth() : null;

  return (
    <header className="sticky top-0 z-40 bg-basalt-950/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
          <Image
            src="/icon.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
            priority
          />
          <span className="font-brand text-lg leading-none tracking-wide">
            <span className="text-steel-100 transition-colors group-hover:text-rust-400">
              RF
            </span>
            <span className="text-rust-500">4</span>
            <span className="text-steel-100 transition-colors group-hover:text-rust-400">
              YOU
            </span>
          </span>
        </Link>

        {/*
          `lg`, not `md`, because that is where the row actually fits.

          Measured rather than chosen: the wordmark is 109 pixels, eight links
          are 551, the search and the two menus are 169, and the two gaps are
          48. That is 877 before the page's own padding, so the full row needs
          about 910 and was being switched on at 768. Between those two widths
          it ran off the side of the screen and gave every page on the site a
          horizontal scrollbar — 84 pixels of one at 820 wide. The mobile
          scroller below handles that band instead, which is what it is for.
        */}
        <nav
          aria-label="Main"
          className="hidden flex-1 items-center gap-0.5 lg:flex"
        >
          {VISIBLE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-sm px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-steel-300 transition-colors hover:bg-basalt-800 hover:text-steel-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {/*
            One box for the whole archive, in the one place that is on every
            page. A plain form with a GET action, so it needs no JavaScript, the
            browser's own history remembers what was searched, and every result
            page is a URL somebody can paste.

            Narrow on purpose: it is a way in, not the point of the header, and
            it grows when it has focus so a long name is still readable while
            being typed.
          */}
          <form action="/search" className="hidden sm:block">
            <input
              type="search"
              name="q"
              placeholder="Search"
              aria-label="Search the archive"
              className="w-28 rounded-sm border border-basalt-700 bg-basalt-900 px-2.5 py-1 text-xs text-steel-200 transition-all placeholder:text-steel-600 focus:w-52 focus:border-rust-500 focus:outline-none"
            />
          </form>
          <ThemeToggle />
          <UserMenu session={session} />
        </div>
      </div>

      {/*
        Mobile nav. A horizontal scroller beats a hamburger for eight links, and
        eight is what it carries since Maps and Pairings came up from the strip
        that used to sit under this one.
      */}
      <nav
        aria-label="Main, compact"
        className="flex gap-1 overflow-x-auto border-t border-basalt-800 px-3 py-2 lg:hidden"
      >
        {VISIBLE_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex shrink-0 items-center rounded-sm px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-steel-300 hover:text-steel-100"
          >
            {item.label}
          </Link>
        ))}
        {/* The box is hidden at this width, so the link stands in for it rather
            than leaving a phone with no way to search at all. */}
        <Link
          href="/search"
          className="flex shrink-0 items-center rounded-sm px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-rust-400 hover:text-rust-300"
        >
          Search
        </Link>
      </nav>

      <div className="hazard" aria-hidden="true" />
    </header>
  );
}
