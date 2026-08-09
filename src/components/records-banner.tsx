import Link from "next/link";

import type { TickerItem } from "@/lib/matches/ticker";

/**
 * The archive's standing records, scrolling slowly across the top.
 *
 * Every item is somebody holding a number nobody has beaten, and each links to
 * the match it was set in — a record you cannot reach from the claim is a
 * boast.
 *
 * **CSS only, no JavaScript and no client component.** The list is rendered
 * twice and the track slides exactly half its width, so the second copy is
 * under the cursor at the moment the first would run out and the loop has no
 * seam. A marquee driven by a timer would be a client bundle and a re-render a
 * second for something that is decoration.
 *
 * It stops when hovered, so a record can actually be read and clicked, and it
 * does not move at all for anybody who has asked for reduced motion — see
 * `globals.css`, where that case becomes an ordinary scrollable strip rather
 * than a frozen one.
 */
export function RecordsBanner({ items }: { items: TickerItem[] }) {
  // Nothing to say on an empty archive, and a marquee of one item would just
  // twitch. Both are the same answer: render nothing.
  if (items.length < 2) return null;

  const Entry = ({ item, copy }: { item: TickerItem; copy: number }) => (
    <Link
      href={item.href}
      // The duplicate is decoration for the eye, not content for a reader.
      aria-hidden={copy === 1 ? true : undefined}
      tabIndex={copy === 1 ? -1 : undefined}
      className="group flex shrink-0 items-baseline gap-2 px-5 py-1.5"
    >
      <span className="font-display text-[0.6875rem] uppercase tracking-widest text-rust-500">
        {item.label}
      </span>
      <span className="whitespace-nowrap text-sm text-steel-300 group-hover:text-steel-100">
        {item.text}
      </span>
    </Link>
  );

  return (
    <div
      className="marquee border-b border-basalt-800 bg-basalt-900/60"
      aria-label="Standing records"
    >
      <div className="marquee-track">
        {[0, 1].map((copy) => (
          <div className="marquee-run" key={copy}>
            {items.map((item) => (
              <Entry key={`${copy}-${item.label}`} item={item} copy={copy} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
