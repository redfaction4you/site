import Link from "next/link";

import type { TickerItem } from "@/lib/matches/ticker";

/**
 * The records strip, in the manner of a sports site.
 *
 * Scrolls sideways rather than animating. An auto-scrolling ticker full of
 * links is a genuinely hostile thing: the target moves while you reach for it,
 * and anyone reading slowly loses their place. This keeps the shape and the
 * density of a ticker and lets the reader move it, which costs nothing and
 * annoys nobody.
 *
 * The fade on the right edge is the only hint that there is more, since a
 * scrollbar under a 28px strip looks like a mistake.
 */
export function Ticker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="relative border-b border-basalt-800 bg-basalt-900/60">
      <ul
        className="scrollbar-none mx-auto flex max-w-6xl items-center gap-6 overflow-x-auto px-4 py-1.5"
        aria-label="Server records"
      >
        {items.map((item) => (
          <li key={`${item.label}-${item.text}`} className="shrink-0">
            <Link href={item.href} className="group flex items-baseline gap-2 text-[0.6875rem]">
              <span className="font-display uppercase tracking-widest text-rust-500">
                {item.label}
              </span>
              <span className="whitespace-nowrap text-steel-400 group-hover:text-steel-200">
                {item.text}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* Sits over the last item to signal the strip continues. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-basalt-900 to-transparent"
      />
    </div>
  );
}
