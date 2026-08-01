import type { Metadata } from "next";
import Link from "next/link";

import {
  BOARDS,
  BOARD_GROUPS,
  BOARD_GROUP_BLURB,
  BOARD_GROUP_LABEL,
  barShare,
  rank,
} from "@/lib/matches/leaderboards";
import { ArchiveNav } from "@/components/archive-nav";
import { listPlayers } from "@/lib/matches/queries";
import { StatTable } from "@/components/stat-table";

export const metadata: Metadata = {
  title: "Stat leaders",
  description:
    "Every recorded statistic from the RedFaction4You server ranked separately: frags, accuracy, captures, time carrying the flag, returns, streaks and more.",
};

export const dynamic = "force-dynamic";

/** How many places each board shows before it needs its own page. */
const SHOWN = 5;

/**
 * One board per thing a player can be good at.
 *
 * A single ranking would answer a question nobody asked. Somebody whose aim is
 * ordinary can be the person you want carrying the flag, and the server records
 * enough to show that, so each stat gets its own table rather than being folded
 * into one score.
 */
type Props = {
  searchParams: Promise<{ sort?: string; dir?: string }>;
};

export default async function StatsPage({ searchParams }: Props) {
  const [players, { sort, dir }] = await Promise.all([listPlayers(), searchParams]);

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
        {/* The page had no heading at all, only an eyebrow-styled paragraph, so
            its outline started at h2 and a screen reader was given no title for
            it. Same twelve pixels, now the thing it looks like. */}
        <h1 className="eyebrow">Stat leaders</h1>
        <p className="font-mono text-xs text-steel-600">
          <span className="text-steel-300">{players.length}</span> players ·{" "}
          <span className="text-steel-300">{boards.length}</span> boards
        </p>
      </div>

      <ArchiveNav active="/stats" className="mt-3" />

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
            the per match and per death boards do not. Open a board for the full
            ranking and what it takes to appear on it.
          </p>

          {/*
            The table first, the boards under it.

            A ranking answers who is best at one thing; this answers everything
            else, and between them there is nothing left to open a spreadsheet
            for. It replaced a grid of placings, which was lossy in the way a
            rank always is: a cell reading 4 cannot say whether fourth was close
            or nowhere near, and twelve columns of bare ordinals gave the eye
            nothing to recognise.
          */}
          <section className="pb-7">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="rule-heading">Everyone, everything</h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-steel-400">
              Every figure the archive holds, for everybody. Click a column to
              sort by it, which is a link rather than a control, so the sorted
              view is a real page you can send somebody. A bar behind a figure is
              its share of that column&rsquo;s leader, and nothing is compared across
              columns because a frag and a capture are not the same unit.
            </p>

            <div className="mt-3">
              <StatTable players={players} sort={sort} dir={dir} />
            </div>

            <p className="mt-2 text-[0.6875rem] leading-snug text-steel-600">
              A figure marked <span className="text-steel-500">*</span> is below
              that board&rsquo;s qualification bar, so it is shown but not ranked. It
              is a real thing that happened over too small a sample to stand
              against the rest.
            </p>
          </section>

          <div className="space-y-7 pb-6">
            {groups.map(({ group, boards: inGroup }) => (
              <section key={group}>
                <h2 className="rule-heading" title={BOARD_GROUP_BLURB[group]}>
                  {BOARD_GROUP_LABEL[group]}
                </h2>

                <div className="mt-3 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                  {inGroup.map(({ board, entries }) => (
                    <section key={board.key} className="min-w-0">
                      {/*
                        The heading is the way in to the board's own page, which
                        is where the rest of the ranking lives. It used to carry
                        the blurb in a title attribute and nothing else: an
                        explanation nobody on a phone or a keyboard could reach,
                        and no hint that five was not everybody.
                      */}
                      <h3 className="border-b border-basalt-700 pb-1">
                        <Link
                          href={`/stats/${board.key}`}
                          title={board.blurb}
                          className="group/board flex items-baseline justify-between gap-2 font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-300 hover:text-rust-300"
                        >
                          <span className="truncate">{board.label}</span>
                          {entries.length > SHOWN ? (
                            <span className="shrink-0 font-mono text-[0.625rem] normal-case tracking-normal text-steel-600 group-hover/board:text-rust-400">
                              all {entries.length}
                            </span>
                          ) : null}
                        </Link>
                      </h3>

                      <ol className="mt-1">
                        {entries.slice(0, SHOWN).map((entry) => (
                          <li key={entry.player.name}>
                            <Link
                              href={`/players/${encodeURIComponent(entry.player.name)}`}
                              className="group relative flex items-baseline gap-2.5 overflow-hidden px-1 py-1"
                            >
                              {/*
                                The gap, as a fill behind the row rather than a
                                bar under it. A bar under each entry read the
                                same and cost a second line every time, which
                                turned twelve boards into three screens of
                                scrolling.
                              */}
                              <span
                                aria-hidden="true"
                                className={
                                  "absolute inset-y-0 left-0 " +
                                  (entry.rank === 1
                                    ? "bg-rust-500/15"
                                    : "bg-steel-500/10")
                                }
                                style={{ width: `${barShare(entry.value, entries, board)}%` }}
                              />
                              {/*
                                A tie repeats the rank rather than inventing an
                                order, which is what the comment here always
                                said and what the code did not do: it printed a
                                blank, and a blank in a numbered column reads as
                                a fault rather than as a tie.
                              */}
                              <span className="relative w-3 shrink-0 font-display text-[0.6875rem] tabular-nums text-steel-600">
                                {entry.rank}
                              </span>
                              <span
                                className={
                                  "relative min-w-0 flex-1 truncate text-xs group-hover:text-rust-300 " +
                                  (entry.rank === 1
                                    ? "font-semibold text-steel-100"
                                    : "text-steel-200")
                                }
                              >
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
                        The bar for appearing at all, stated where it applies
                        rather than in a footnote. A reader who cannot find
                        themselves on the accuracy board deserves to know it is
                        a threshold and not a slight.
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
