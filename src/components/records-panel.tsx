import Link from "next/link";

import type { TickerItem } from "@/lib/matches/ticker";

/**
 * The archive's records, as a panel rather than a ticker.
 *
 * These facts spent their life as a strip across the top of the front page,
 * where each one had a two word label and had to fit on a line. That is the
 * right shape for a ticker and the wrong shape for the answer: "most caps in a
 * match, 5 by Medeo" leaves out which match, which is the first thing anybody
 * asks and the only part that makes it checkable.
 *
 * Same data, same links, and room to breathe. A record that cannot be reached
 * from the claim is a boast.
 */
export function RecordsPanel({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;

  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={`${item.label}-${item.text}`}>
          <Link
            href={item.href}
            className="plate group flex h-full flex-col gap-1 p-2.5 transition-colors hover:border-t-rust-500"
          >
            <span className="font-display text-[0.625rem] uppercase tracking-widest text-rust-500">
              {item.label}
            </span>
            <span className="text-xs leading-snug text-steel-300 group-hover:text-steel-100">
              {item.text}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
