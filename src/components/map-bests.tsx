import Link from "next/link";

import type { MapBest } from "@/lib/matches/queries";

/**
 * What one map has seen at its best, and who did it.
 *
 * Every figure is a single match rather than an average, which is what makes it
 * safe at this sample size: the most captures anybody has managed here in one
 * game is a fact about one game however few games there are, where "this map
 * favours red" would need dozens.
 *
 * The fastest run is the reason this block exists on a map page rather than on a
 * stat board. A run is a distance as much as a time, so ranking one player's 9.6
 * seconds against another's 12.1 across different maps ranks the maps and
 * presents it as a ranking of players. Held against one map the comparison is
 * sound, because the distance is the same for everybody in it.
 *
 * **The player is the point, not the number.** These read as records, and a
 * record is somebody's. The first version set the name in ten pixel grey under
 * the figure and gave each card a separate "the match" link, which is three
 * sizes of nothing and a link that says nothing. The whole card is the link now,
 * and the name is the second thing read after the value.
 */
export function MapBests({
  bests,
  className = "",
}: {
  bests: {
    fastestRun: MapBest | null;
    mostCaps: MapBest | null;
    mostFrags: MapBest | null;
    bestStreak: MapBest | null;
    mostReturns: MapBest | null;
    bestAccuracy: MapBest | null;
  };
  className?: string;
}) {
  const shown = [
    {
      label: "Fastest run",
      best: bests.fastestRun,
      format: (ms: number) => `${(ms / 1000).toFixed(1)}s`,
      title:
        "Carried from the enemy stand to their own without the flag touching " +
        "the ground. A capture the flag was dropped on is not a run and is not " +
        "timed here.",
    },
    {
      label: "Most captures",
      best: bests.mostCaps,
      format: (value: number) => `${value}`,
      title: "The most anybody has captured here in one match.",
    },
    {
      label: "Most frags",
      best: bests.mostFrags,
      format: (value: number) => `${value}`,
      title: "The most anybody has fragged here in one match.",
    },
    {
      label: "Longest streak",
      best: bests.bestStreak,
      format: (value: number) => `${value}`,
      title: "The most frags anybody has strung together here without dying.",
    },
    {
      label: "Most returns",
      best: bests.mostReturns,
      format: (value: number) => `${value}`,
      title:
        "Flags brought back in one match here. Returns are inferred rather " +
        "than reported, so a player is credited only when they were uniquely " +
        "closest to the dropped flag.",
    },
    {
      label: "Best accuracy",
      best: bests.bestAccuracy,
      format: (value: number) => `${(value * 100).toFixed(1)}%`,
      title:
        "In one match here, over a floor of 200 shots. Without a floor this " +
        "is whoever fired twice.",
    },
  ].filter((entry) => entry.best !== null);

  // Nothing to show on a map whose only matches predate the event log, which is
  // a normal state for the early archive rather than a fault.
  if (shown.length === 0) return null;

  return (
    <section className={className}>
      <h2 className="rule-heading">Records here</h2>

      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((entry) => {
          const best = entry.best!;
          return (
            <li key={entry.label}>
              <Link
                href={`/matches/${best.archiveDay}/${best.sourceMatchId}`}
                title={entry.title}
                className="plate group flex items-baseline justify-between gap-3 p-2.5 transition-colors hover:border-t-rust-500"
              >
                <span className="min-w-0">
                  <span className="figure-label block text-steel-500">
                    {entry.label}
                  </span>
                  {/* The name at reading size. It is the answer to the question
                      the label asks, and it was the smallest thing on the card. */}
                  <span className="mt-1 block truncate text-sm text-steel-100 group-hover:text-rust-300">
                    {best.name}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-2xl leading-none tabular-nums text-steel-100">
                  {entry.format(best.value)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
