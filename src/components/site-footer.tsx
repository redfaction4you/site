import Link from "next/link";

import { DISCORD_INVITE, VISIBLE_NAV } from "@/lib/nav";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-basalt-800 bg-basalt-900/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-2">
          <p className="font-brand text-xl text-steel-100">
            RF<span className="text-rust-500">4</span>YOU
          </p>
          <p className="mt-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.32em] text-rust-500">
            Red Faction Archive
          </p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-steel-400">
            A community archive for Red Faction (2001). Maps, mods, tools,
            guides and videos, kept in one place. Everything here is free,
            nothing is walled off, and you never need an account to download
            anything.
          </p>
        </div>

        <div>
          <p className="eyebrow">Site</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {VISIBLE_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-steel-400 transition-colors hover:text-steel-200"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="eyebrow">Community</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li>
              <a
                href={DISCORD_INVITE}
                className="text-steel-400 transition-colors hover:text-steel-200"
                rel="noreferrer noopener"
                target="_blank"
              >
                Discord
              </a>
            </li>
            <li>
              <a
                href="https://github.com/redfaction4you"
                className="text-steel-400 transition-colors hover:text-steel-200"
                rel="noreferrer noopener"
                target="_blank"
              >
                GitHub
              </a>
            </li>
            <li>
              <Link
                href="/videos"
                className="text-steel-400 transition-colors hover:text-steel-200"
              >
                Video archive
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-basalt-800 px-4 py-6">
        <p className="mx-auto max-w-6xl text-xs leading-relaxed text-steel-500">
          Red Faction is a trademark of THQ Nordic AB. RedFaction4You is an
          unofficial, non-commercial community project and is not affiliated with
          or endorsed by THQ Nordic, Volition, or any rights holder. Game content
          remains the property of its respective owners.
        </p>
      </div>
    </footer>
  );
}
