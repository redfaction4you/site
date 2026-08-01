import Link from "next/link";

import { MatchRows } from "@/components/match-rows";
import type { MatchSummary } from "@/lib/matches/queries";

/**
 * A night's matches beside the writing about it.
 *
 * The rows themselves are `MatchRows`, which is also what the match archive
 * uses. They were two separate renderings of the same five fields and they drifted:
 * this one had named its columns after a reader could not tell a kick-off time
 * from a score, and the archive page, which is the one people arrive at, never
 * got the fix.
 */
export function NightMatches({
  matches,
  archiveDay,
  showFullNight = true,
}: {
  matches: MatchSummary[];
  archiveDay: string;
  showFullNight?: boolean;
}) {
  if (matches.length === 0) return null;

  return (
    <section>
      <h2 className="border-b border-basalt-800 pb-1.5 font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
        The matches
      </h2>

      <div className="mt-1.5">
        <MatchRows matches={matches} archiveDay={archiveDay} />
      </div>

      {showFullNight ? (
        <Link
          href={`/matches/${archiveDay}`}
          className="mt-2 inline-block font-display text-[0.625rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
        >
          The full night
        </Link>
      ) : null}
    </section>
  );
}
