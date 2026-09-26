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

          Measured rather than chosen, and measured again every time the row
          changes length. It once carried nine links and fitted at 1024 with five
          pixels to spare; it carries three now. Before any of this was measured
          the row was switched on at 768 and ran off the side between the two
          widths, giving every page on the site 84 pixels of horizontal
          scrollbar at 820.
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
          <ThemeToggle />
          <UserMenu session={session} />
        </div>
      </div>

      {/*
        Mobile nav. A horizontal scroller rather than a hamburger, so every
        entry is one tap away and the row can grow without a redesign.
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
      </nav>

      <div className="hazard" aria-hidden="true" />
    </header>
  );
}
