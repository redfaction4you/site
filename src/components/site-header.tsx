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

        <nav
          aria-label="Main"
          className="hidden flex-1 items-center gap-0.5 md:flex"
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

      {/* Mobile nav. A horizontal scroller beats a hamburger for seven links. */}
      <nav
        aria-label="Main, compact"
        className="flex gap-1 overflow-x-auto border-t border-basalt-800 px-3 py-2 md:hidden"
      >
        {VISIBLE_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="shrink-0 rounded-sm px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-steel-300 hover:text-steel-100"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="hazard" aria-hidden="true" />
    </header>
  );
}
