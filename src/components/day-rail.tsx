import Link from "next/link";

import type { DaySummary } from "@/lib/matches/queries";

/**
 * Every night on record, as a compact index.
 *
 * The stacked view answers "what happened recently" by scrolling, which is right
 * for the last few nights and useless for finding a specific one. This is the
 * other half: every night at a glance, in sequence, small enough that a season
 * of them still fits a column.
 *
 * A month heading rather than a true calendar grid. A calendar spends most of
 * its area on days nobody played, and this server runs a few nights a week, so a
 * grid would be mostly empty squares with the actual information scattered
 * through them.
 */
export function DayRail({
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

  // Grouped by month so a long list stays navigable without a scrollbar being
  // the only landmark.
  const months = new Map<string, DaySummary[]>();
  for (const day of days) {
    const key = day.archiveDay.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), day]);
  }

  return (
    <nav aria-label="Match nights" className={className}>
      <h2 className="rule-heading">All nights</h2>

      <div className="mt-3 space-y-4">
        {[...months.entries()].map(([month, entries]) => (
          <div key={month}>
            <p className="font-display text-[0.625rem] font-bold uppercase tracking-widest text-steel-600">
              {new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </p>

            <ul className="mt-1.5 flex flex-wrap gap-1">
              {entries.map((day) => {
                const isCurrent = day.archiveDay === current;
                return (
                  <li key={day.archiveDay}>
                    <Link
                      href={`/matches/${day.archiveDay}`}
                      aria-current={isCurrent ? "page" : undefined}
                      title={`${day.matchCount} ${
                        day.matchCount === 1 ? "match" : "matches"
                      }`}
                      className={
                        "flex h-9 w-9 flex-col items-center justify-center rounded-sm border transition-colors " +
                        (isCurrent
                          ? "border-rust-500 bg-rust-500/10"
                          : "border-basalt-700 bg-basalt-850 hover:border-basalt-500")
                      }
                    >
                      <span
                        className={
                          "font-display text-xs font-bold leading-none tabular-nums " +
                          (isCurrent ? "text-rust-300" : "text-steel-200")
                        }
                      >
                        {Number(day.archiveDay.slice(8, 10))}
                      </span>
                      {/* The match count, because a night with one game and a
                          night with eight are not the same night. */}
                      <span className="mt-0.5 font-mono text-[0.5rem] leading-none text-steel-600">
                        {day.matchCount}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
