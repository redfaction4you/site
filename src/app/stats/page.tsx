import type { Metadata } from "next";
import Link from "next/link";

import {
  BOARDS,
  BOARD_GROUPS,
  BOARD_GROUP_BLURB,
  BOARD_GROUP_LABEL,
  rank,
} from "@/lib/matches/leaderboards";
import { listPlayers } from "@/lib/matches/queries";

export const metadata: Metadata = {
  title: "Stat leaders",
  description:
    "Every recorded statistic from the RedFaction4You server ranked separately: frags, accuracy, captures, time carrying the flag, returns, streaks and more.",
};

export const dynamic = "force-dynamic";

/** How many places each board shows before it needs its own page. */
const SHOWN = 5;

/**
 * How long a bar should be, as a share of the best on its board.
 *
 * Scaled against the leader rather than against zero, because every board here
 * has a different unit and the question is always the same: how far off the top
 * is this. Fastest capture is inverted, since it is the one board where a
 * smaller number is the better performance and a shorter bar would say the
 * opposite of what happened.
 */
function share(
  entry: { value: number },
  entries: { value: number }[],
): number {
  const values = entries.map((row) => row.value).filter((v) => Number.isFinite(v));
  if (values.length === 0) return 0;

  const best = Math.max(...values);
  const lowest = Math.min(...values);
  if (best <= 0) return 0;

  // A low board's leader holds the smallest value, so measure from the top down.
  const inverted = entries[0]?.value === lowest && lowest !== best;
  const raw = inverted ? lowest / entry.value : entry.value / best;

  return Math.max(4, Math.min(100, raw * 100));
}

/**
 * One board per thing a player can be good at.
 *
 * A single ranking would answer a question nobody asked. Somebody whose aim is
 * ordinary can be the person you want carrying the flag, and the server records
 * enough to show that, so each stat gets its own table rather than being folded
 * into one score.
 */
export default async function StatsPage() {
  const players = await listPlayers();

  const boards = BOARDS.map((board) => ({
    board,
    entries: rank(players, board),
  })).filter(({ entries }) => entries.length > 0);

  // Grouped rather than a flat twelve. Empty groups drop out entirely, so a
  // thin archive shows two headings rather than three and one empty rule.
  const groups = BOARD_GROUPS.map((group) => ({
    group,
    boards: boards.filter(({ board }) => board.group === group),
  })).filter((entry) => entry.boards.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-basalt-800 py-2.5">
        <p className="eyebrow">Stat leaders</p>
        <p className="font-mono text-xs text-steel-600">
          <span className="text-steel-300">{players.length}</span> players ·{" "}
          <span className="text-steel-300">{boards.length}</span> boards
        </p>
      </div>

      {boards.length === 0 ? (
        <p className="py-10 text-sm text-steel-500">
          Nothing recorded yet. The boards fill in as matches are played.
        </p>
      ) : (
        <>
          <p className="max-w-2xl py-4 text-sm leading-relaxed text-steel-400">
            Every statistic ranked on its own. Being good at this game is not one
            thing, and somebody who never tops the frag count can still be the
            person you want carrying the flag.
          </p>

          {/*
            Said plainly rather than left for a reader to work out.

            People play different numbers of matches, so a total is partly a
            measure of who turned up. The per match boards exist for exactly that
            reason and a reader deserves to be told which is which.
          */}
          <p className="max-w-2xl pb-4 text-xs leading-relaxed text-steel-600">
            Totals reward playing often as well as playing well, because not
            everyone plays the same number of matches. The per match and per death
            boards do not.
          </p>

          <div className="space-y-10 pb-6">
            {groups.map(({ group, boards: inGroup }) => (
              <section key={group}>
                <h2 className="rule-heading">{BOARD_GROUP_LABEL[group]}</h2>
                <p className="mt-1.5 text-xs text-steel-500">
                  {BOARD_GROUP_BLURB[group]}
                </p>

                <div className="mt-4 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
                  {inGroup.map(({ board, entries }) => (

              <section key={board.key} className="min-w-0">
                <h3 className="border-b border-basalt-800 pb-1.5 font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-300">
                  {board.label}
                </h3>
                <p className="mt-1.5 text-[0.6875rem] leading-snug text-steel-600">
                  {board.blurb}
                </p>

                <ol className="mt-1.5">
                  {entries.slice(0, SHOWN).map((entry) => (
                    <li
                      key={entry.player.name}
                      className="border-b border-basalt-900"
                    >
                      <Link
                        href={`/players/${encodeURIComponent(entry.player.name)}`}
                        className="group block py-1.5"
                      >
                        <span className="flex items-baseline gap-2.5">
                          <span className="w-3 shrink-0 font-display text-[0.6875rem] tabular-nums text-steel-700">
                            {/* A tie repeats the rank rather than inventing an order. */}
                            {entry.tied ? "" : entry.rank}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs text-steel-300 group-hover:text-rust-300">
                            {entry.player.name}
                          </span>
                          <span className="shrink-0 font-mono text-xs tabular-nums text-steel-100">
                            {entry.display}
                          </span>
                        </span>

                        {/*
                          The gap, which the numbers alone never showed.
                          A board reading 721, 550, 409 is three numbers; a bar
                          says at a glance that first is half again as good as
                          second, which is the thing a league table is for.
                        */}
                        <span className="mt-1 ml-[1.375rem] block h-1 rounded-sm bg-basalt-800">
                          <span
                            className={
                              "block h-full rounded-sm " +
                              (entry.rank === 1
                                ? "bg-rust-500/80"
                                : "bg-steel-500/50")
                            }
                            style={{ width: `${share(entry, entries)}%` }}
                          />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>

                {/*
                  The bar for appearing at all, stated where it applies rather
                  than in a footnote. A reader who cannot find themselves on the
                  accuracy board deserves to know it is a threshold and not a
                  slight.
                */}
                {board.requirement ? (
                  <p className="mt-1.5 text-[0.625rem] leading-snug text-steel-700">
                    {board.requirement}
                  </p>
                ) : null}
              </section>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <p className="border-t border-basalt-800 pt-4 text-xs leading-relaxed text-steel-500">
            Everything here is totalled from what the server recorded, across every
            match in the archive. Nothing is estimated and nothing is weighted.
          </p>
        </>
      )}
    </div>
  );
}
