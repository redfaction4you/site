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
import { mapSummaries } from "@/lib/matches/map-stats";
import { weaponTotals } from "@/lib/matches/weapon-stats";
import { getTicker } from "@/lib/matches/ticker";
import { StatTable } from "@/components/stat-table";
import { StatsTabs } from "@/components/stats-tabs";
import { RecordsPanel } from "@/components/records-panel";
import { MapStatsTable } from "@/components/map-stats-table";
import { WeaponStatsTable } from "@/components/weapon-stats-table";

export const metadata: Metadata = {
  title: "Stats",
  description:
    "Everything the RedFaction4You server records: the archive's standing records, every player statistic ranked separately, how each map plays, and what each weapon does.",
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

/**
 * The sections, in the order a reader wants them.
 *
 * Records first because they are the one thing on the page you do not have to
 * already have a question for. Then the people, then the places, then the
 * weapons: each is a wider frame than the last, and the last two describe the
 * game rather than anybody playing it.
 */
const SECTIONS = [
  { id: "records", label: "Records" },
  { id: "players", label: "Players" },
  { id: "maps", label: "Maps" },
  { id: "weapons", label: "Weapons" },
] as const;

export default async function StatsPage({ searchParams }: Props) {
  const [players, maps, weapons, records, { sort, dir }] = await Promise.all([
    listPlayers(),
    mapSummaries(),
    weaponTotals(),
    getTicker(),
    searchParams,
  ]);

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
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.14em] text-steel-100">Stats</h1>
        <p className="font-mono text-xs text-steel-600">
          {/* "All time" said plainly. A reader compared a figure here with the
              same figure on a player page, found them different, and reasonably
              assumed one page was recent and the other career. Both are career;
              what actually differed was that they had two identities. Neither
              page saying its period made a data problem look like a bug. */}
          <span className="text-steel-300">all time</span> ·{" "}
          <span className="text-steel-300">{players.length}</span> players ·{" "}
          <span className="text-steel-300">{boards.length}</span> boards ·{" "}
          <span className="text-steel-300">{maps.length}</span> maps
        </p>
      </div>

      <StatsTabs active="ctf" />

      {/*
        Four sections is enough to need a way past them.

        Plain anchors rather than anything that watches the scroll position: the
        page is server rendered, every section is a real id, and a link somebody
        can copy out of the address bar is worth more here than a highlight that
        follows the viewport.
      */}
      {/* Pills rather than bare words: the owner could not tell these were
          controls. Same anchors underneath — every one is still a URL. */}
      <nav
        aria-label="Sections"
        className="flex flex-wrap gap-2 border-b border-basalt-800 py-3"
      >
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-full border border-basalt-600 px-3.5 py-1.5 font-display text-xs font-semibold uppercase tracking-widest text-steel-300 transition-colors hover:border-rust-500 hover:text-rust-300"
          >
            {section.label}
          </a>
        ))}
      </nav>

      {records.length ? (
        <section id="records" className="scroll-mt-4 pt-5">
          <h2 className="section-heading">Records</h2>
          <p className="mb-3 mt-1.5 text-xs leading-relaxed text-steel-500">
            The best anybody has managed in a single match, and the matches they
            managed it in. Every one is a link to the game it was set in.
          </p>
          <RecordsPanel items={records} />
        </section>
      ) : null}

      <h2 id="players" className="section-heading scroll-mt-4 pt-7">
        Players
      </h2>

      {boards.length === 0 ? (
        <p className="py-10 text-sm text-steel-500">
          Nothing recorded yet. The boards fill in as matches are played.
        </p>
      ) : (
        <>
          {/*
            The table first, the boards under it.

            A ranking answers who is best at one thing; this answers everything
            else, and between them there is nothing left to open a spreadsheet
            for. It replaced a grid of placings, which was lossy in the way a
            rank always is: a cell reading 4 cannot say whether fourth was close
            or nowhere near, and twelve columns of bare ordinals gave the eye
            nothing to recognise.
          */}
          <section className="pb-7 pt-4">
            <div className="mt-2">
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
                <h3 className="rule-heading">{BOARD_GROUP_LABEL[group]}</h3>
                {/*
                  The group's own sentence, printed rather than left in a title
                  attribute. It was the tooltip on the heading, which is an
                  explanation nobody on a phone or a keyboard could reach, and
                  with two new groups on the page the difference between "the
                  flag" and "the work nobody sees" is exactly what a reader needs
                  saying out loud.
                */}
                <p className="mt-1 text-[0.6875rem] leading-snug text-steel-600">
                  {BOARD_GROUP_BLURB[group]}
                </p>

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
                      <h4 className="border-b border-basalt-700 pb-1">
                        <Link
                          href={`/stats/${board.key}`}
                          title={board.blurb}
                          className="group/board flex items-baseline justify-between gap-2 font-display text-xs font-bold uppercase tracking-widest text-steel-200 hover:text-rust-300"
                        >
                          <span className="truncate">{board.label}</span>
                          {entries.length > SHOWN ? (
                            <span className="shrink-0 font-mono text-[0.625rem] normal-case tracking-normal text-steel-600 group-hover/board:text-rust-400">
                              all {entries.length}
                            </span>
                          ) : null}
                        </Link>
                      </h4>

                      <ol className="mt-1">
                        {entries.slice(0, SHOWN).map((entry) => (
                          <li key={entry.player.name}>
                            <Link
                              href={`/players/${encodeURIComponent(entry.player.name)}`}
                              className="group flex items-baseline gap-2.5 rounded-sm px-1 py-1 hover:bg-rust-500/[0.07]"
                            >
                              {/*
                                A tie repeats the rank rather than inventing an
                                order, which is what the comment here always
                                said and what the code did not do: it printed a
                                blank, and a blank in a numbered column reads as
                                a fault rather than as a tie.
                              */}
                              <span className="w-3 shrink-0 font-display text-[0.6875rem] tabular-nums text-steel-600">
                                {entry.rank}
                              </span>
                              <span
                                className={
                                  "min-w-0 flex-1 truncate text-sm group-hover:text-rust-300 " +
                                  (entry.rank === 1
                                    ? "font-semibold text-steel-100"
                                    : "text-steel-200")
                                }
                              >
                                {entry.player.name}
                              </span>
                              <span className="shrink-0 font-mono text-sm tabular-nums text-steel-100">
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

        </>
      )}

      {/*
        The two sections that are not about people.

        Everything above ranks players against each other. These describe what
        they are playing: where a match tends to go long, and which weapon is
        actually doing the killing. Both read the same rows as the boards do and
        neither is a ranking, which is why they sit apart from them rather than
        as two more grids of names.
      */}
      <section id="maps" className="scroll-mt-4 pt-8">
        <h2 className="section-heading">Maps</h2>
        <p className="mb-3 mt-1.5 text-xs leading-relaxed text-steel-500">
          How each map actually plays. Not a ranking: a map that runs long and
          finishes 3-2 is a different game from one that runs long and finishes
          8-6, and neither is better.
        </p>
        <MapStatsTable maps={maps} />
      </section>

      <section id="weapons" className="scroll-mt-4 pt-8">
        <h2 className="section-heading">Weapons</h2>
        <p className="mb-3 mt-1.5 text-xs leading-relaxed text-steel-500">
          Every frag on record, by what caused it, and how much shooting each one
          took.
        </p>
        <WeaponStatsTable weapons={weapons} />
      </section>

      <p className="mt-8 border-t border-basalt-800 pt-4 text-xs leading-relaxed text-steel-500">
        Everything here is totalled from what the server recorded, across every
        match in the archive. Nothing is estimated and nothing is weighted.
      </p>
    </div>
  );
}
