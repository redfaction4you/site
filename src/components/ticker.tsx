import Link from "next/link";

import type { TickerItem } from "@/lib/matches/ticker";

/**
 * The records strip, in the manner of a sports site.
 *
 * Scrolls sideways rather than animating. An auto-scrolling ticker full of links
 * is a genuinely hostile thing: the target moves while you reach for it, and
 * anyone reading slowly loses their place. This keeps the shape and the density
 * of a ticker and lets the reader move it, which costs nothing and annoys nobody.
 *
 * Two things about the fade, both learned by getting them wrong.
 *
 * It has to be aligned to the scroll container, not to the viewport. It used to
 * be absolutely positioned on the full width wrapper while the clipping happened
 * at the inner `max-w-6xl` edge, which on a wide screen put the fade some ninety
 * pixels to the right of the cut. The strip simply stopped mid item with nothing
 * to say why, which reads as a broken layout rather than as something scrollable.
 *
 * And it is a mask rather than a gradient painted on top. The strip is
 * translucent over a page that has its own gradient, so an opaque overlay in any
 * one colour is visible as a patch against it. Masking fades the content itself
 * and is correct over whatever happens to be behind.
 */
export function Ticker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="border-b border-basalt-800 bg-basalt-900/60">
      <ul
        className={
          "scrollbar-none mx-auto flex max-w-6xl items-center gap-6 overflow-x-auto px-4 py-1.5 " +
          // Fades the last 2.5rem of the strip so the cut reads as "more this
          // way" rather than as a rendering fault.
          "[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]"
        }
        aria-label="Server records"
      >
        {items.map((item) => (
          <li key={`${item.label}-${item.text}`} className="shrink-0">
            <Link
              href={item.href}
              className="group flex items-baseline gap-2 text-[0.6875rem]"
            >
              <span className="font-display uppercase tracking-widest text-rust-500">
                {item.label}
              </span>
              <span className="whitespace-nowrap text-steel-400 group-hover:text-steel-200">
                {item.text}
              </span>
            </Link>
          </li>
        ))}

        {/*
          A real link at the end of the strip.

          Scrolling to the end of a ticker and finding it simply stops is a small
          dead end. Every fact in it is a record, and there is now a page of
          those, so the strip ends by pointing at it.
        */}
        <li className="shrink-0 pr-8">
          <Link
            href="/stats"
            className="font-display text-[0.6875rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
          >
            All records
          </Link>
        </li>
      </ul>
    </div>
  );
}
