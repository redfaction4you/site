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
          {/*
            One line rather than two paragraphs.

            The page opened with a hundred pixels of explanation before a single
            number, and the second paragraph made a point the per match boards
            already make by existing and being labelled as such.
          */}
          <p className="max-w-3xl py-3 text-sm leading-relaxed text-steel-400">
            Every statistic ranked on its own, because being good at this game is
            not one thing. Totals reward playing often as well as playing well;
            the per match and per death boards do not.
          </p>

          <div className="space-y-7 pb-6">
            {groups.map(({ group, boards: inGroup }) => (
              <section key={group}>
                <h2 className="rule-heading" title={BOARD_GROUP_BLURB[group]}>
                  {BOARD_GROUP_LABEL[group]}
                </h2>

                <div className="mt-3 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                  {inGroup.map(({ board, entries }) => (

              <section key={board.key} className="min-w-0">
                {/* The blurb moves onto the heading. It explained each board in
                    a line nobody rereads, and twelve of them was a screen. */}
                <h3
                  title={board.blurb}
                  className="border-b border-basalt-700 pb-1 font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-300"
                >
                  {board.label}
                </h3>

                <ol className="mt-1">
                  {entries.slice(0, SHOWN).map((entry) => (
                    <li key={entry.player.name}>
                      <Link
                        href={`/players/${encodeURIComponent(entry.player.name)}`}
                        className="group relative flex items-baseline gap-2.5 overflow-hidden px-1 py-1"
                      >
                        {/*
                          The gap, as a fill behind the row rather than a bar
                          under it. A bar under each entry read the same and cost
                          a second line every time, which turned twelve boards
                          into three screens of scrolling.
                        */}
                        <span
                          aria-hidden="true"
                          className={
                            "absolute inset-y-0 left-0 " +
                            (entry.rank === 1 ? "bg-rust-500/15" : "bg-steel-500/10")
                          }
                          style={{ width: `${share(entry, entries)}%` }}
                        />
                        <span className="relative w-3 shrink-0 font-display text-[0.6875rem] tabular-nums text-steel-600">
                          {/* A tie repeats the rank rather than inventing an order. */}
                          {entry.tied ? "" : entry.rank}
                        </span>
                        <span className="relative min-w-0 flex-1 truncate text-xs text-steel-200 group-hover:text-rust-300">
                          {entry.player.name}
                        </span>
                        <span className="relative shrink-0 font-mono text-xs tabular-nums text-steel-100">
                          {entry.display}
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
