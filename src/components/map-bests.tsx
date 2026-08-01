import Link from "next/link";

import type { MapBest } from "@/lib/matches/queries";

/**
 * What one map has seen at its best.
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
 * Each record links to the match it was set in. A record with nowhere to go is a
 * claim a reader cannot check, and every number here can be walked back to a
 * scoreboard.
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
  ].filter((entry) => entry.best !== null);

  // Nothing to show on a map whose only matches predate the event log, which is
  // a normal state for the early archive rather than a fault.
  if (shown.length === 0) return null;

  return (
    <section className={className}>
      <h2 className="rule-heading">Records here</h2>

      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((entry) => {
          const best = entry.best!;
          return (
            <li key={entry.label} className="plate p-2.5" title={entry.title}>
              <span className="figure-label block text-steel-500">{entry.label}</span>
              <span className="mt-1 block font-mono text-xl leading-none tabular-nums text-steel-100">
                {entry.format(best.value)}
              </span>
              <span className="mt-1.5 block truncate text-xs text-steel-300">
                {best.name}
              </span>
              <Link
                href={`/matches/${best.archiveDay}/${best.sourceMatchId}`}
                className="mt-0.5 block font-mono text-[0.625rem] text-steel-600 hover:text-rust-300"
              >
                the match
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
