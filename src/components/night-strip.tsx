import Link from "next/link";

import { shortDayLabel, weekdayLabel } from "@/components/match-archive";
import type { DaySummary } from "@/lib/matches/queries";

/**
 * Every night on record, as a band across the top.
 *
 * The same index the rail held, turned on its side. Vertically it was a column
 * of small chips with four hundred pixels of nothing under it, and it claimed a
 * whole column of the page to do a job that fits in one band. Horizontally it
 * costs about fifty pixels of height, sits above the content it navigates, and
 * gives the rail back to things that are actually about the night.
 *
 * This is the shape every sports scoreboard uses for exactly this, and the
 * reason is that a date index is read left to right in one movement rather than
 * scanned down a list.
 *
 * **Newest first**, which is the one place this departs from the scoreboards it
 * borrows from. They run chronologically because a season has a future to
 * schedule; an archive does not. The night somebody wants is nearly always the
 * most recent one, so it is the one that must never require a scroll to reach.
 *
 * The month sits on the chip rather than in a heading above a group, because a
 * heading only works in a column: horizontally it would either float above one
 * chip or need its own row.
 */
export function NightStrip({
  days,
  current,
  className = "",
}: {
  days: DaySummary[];
  /** The night being read, marked in place. */
  current?: string;
  className?: string;
}) {
  if (days.length === 0) return null;

  return (
    <nav aria-label="Match nights" className={`relative ${className}`}>
      {/*
        A strip thin enough that a scrollbar under it reads as a rendering
        fault, so the scrollbar is hidden and the fade at the trailing edge does
        the same job of saying there is more.
      */}
      <ul className="scrollbar-none flex gap-1 overflow-x-auto pb-0.5">
        {days.map((day) => {
          const active = day.archiveDay === current;
          return (
            <li key={day.archiveDay} className="shrink-0">
              <Link
                href={`/matches/${day.archiveDay}`}
                aria-current={active ? "page" : undefined}
                title={`${day.matchCount} ${day.matchCount === 1 ? "match" : "matches"}`}
                className={
                  "flex w-[4.75rem] flex-col items-center gap-0.5 rounded-sm border px-2 py-1.5 transition-colors " +
                  (active
                    ? "border-rust-500 bg-rust-500/10"
                    : "border-basalt-700 bg-basalt-850 hover:border-basalt-500")
                }
              >
                <span
                  className={
                    "font-display text-[0.5625rem] font-bold uppercase tracking-widest " +
                    (active ? "text-rust-400" : "text-steel-600")
                  }
                >
                  {weekdayLabel(day.archiveDay)}
                </span>
                <span
                  className={
                    "whitespace-nowrap font-display text-xs font-bold leading-none tabular-nums " +
                    (active ? "text-rust-300" : "text-steel-200")
                  }
                >
                  {shortDayLabel(day.archiveDay)}
                </span>
                {/* The count, because a night with one game and a night with
                    eight are not the same night. */}
                <span className="font-mono text-[0.5625rem] leading-none text-steel-600">
                  {day.matchCount}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-basalt-950 to-transparent"
      />
    </nav>
  );
}
