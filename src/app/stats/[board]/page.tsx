import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  BOARDS,
  BOARD_GROUP_LABEL,
  boardByKey,
  contextFor,
  rank,
} from "@/lib/matches/leaderboards";
import { ArchiveNav } from "@/components/archive-nav";
import { listPlayers } from "@/lib/matches/queries";
import { StatStrip } from "@/components/stat-strip";

type Props = { params: Promise<{ board: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { board: key } = await params;
  const board = boardByKey(key);
  if (!board) return { title: "Not found" };

  return {
    title: board.label,
    description: `${board.blurb} Every player on the RedFaction4You server ranked, with what it takes to appear.`,
    /**
     * Not indexed, follow left on, for the reason `/players` gives: a full
     * ranking is every handle on the server on one page, and searchability is
     * the part of that nobody signed up for. `/stats` itself is still indexed
     * and still names the top five of each board, which is a difference of
     * degree rather than kind and is worth deciding on deliberately rather than
     * inheriting from whichever page was written first.
     */
    robots: { index: false, follow: true },
  };
}

/**
 * One board, in full.
 *
 * The index shows five places, which is the right size for twelve boards on one
 * screen and the wrong size for the question "where am I". Nine players and five
 * places means four people are told nothing, and until this page existed there
 * was nowhere for them to go: `boardByKey` had been exported for it, and the
 * test asserting board keys are url safe was written for it.
 *
 * What this page adds beyond a longer list is the sample and the people the bar
 * excludes. A qualification rule that silently removes somebody is the same
 * failure as a wrong number, one step quieter.
 */
export default async function BoardPage({ params }: Props) {
  const { board: key } = await params;
  const board = boardByKey(key);
  if (!board) notFound();

  const players = await listPlayers();
  const entries = rank(players, board);
  const context = contextFor(board);

  // Who the bar keeps out, closest first. Only where there is a bar: everybody
  // else missing from a board is missing because they have nothing to rank,
  // which is an absence rather than an exclusion and is not the same statement.
  const excluded = board.requirement
    ? players
        .filter((player) => !board.qualifies(player))
        .sort((a, b) => context.of(b) - context.of(a))
    : [];

  return (
    <div className="mx-auto max-w-3xl px-4 pb-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-basalt-800 py-2.5">
        <p className="eyebrow">
          <Link href="/stats" className="hover:text-rust-300">
            Stat leaders
          </Link>
        </p>
        <p className="font-mono text-xs text-steel-600">
          <span className="text-steel-300">{entries.length}</span> ranked
          {excluded.length > 0 ? (
            <>
              {" · "}
              <span className="text-steel-300">{excluded.length}</span> under the
              bar
            </>
          ) : null}
        </p>
      </div>

      <ArchiveNav active="/stats" className="mt-3" />

      <p className="mt-6 font-display text-[0.625rem] font-bold uppercase tracking-[0.24em] text-steel-500">
        {BOARD_GROUP_LABEL[board.group]}
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold text-steel-100">
        {board.label}
      </h1>
      {/* The blurb, as prose. On the index it is a title attribute, which is a
          tooltip on a desktop and nothing at all anywhere else. */}
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel-400">
        {board.blurb}
      </p>

      {entries.length === 0 ? (
        <p className="py-10 text-sm text-steel-500">
          Nothing recorded for this yet. It fills in as matches are played.
        </p>
      ) : (
        <>
          {/*
            The shape of the field, above the ranking of it. First place means
            one thing when the field is spread and another when everybody is
            within a couple of points, and the list below cannot say which.
          */}
          <StatStrip entries={entries} board={board} />

          <div className="panel mt-6 overflow-hidden">
            <div className="flex items-baseline gap-3 border-b border-basalt-700 px-3 py-1.5 font-display text-[0.625rem] uppercase tracking-widest text-steel-500">
              <span className="w-5 shrink-0">#</span>
              <span className="min-w-0 flex-1">Player</span>
              <span className="w-16 shrink-0 text-right">{context.label}</span>
              <span className="w-24 shrink-0 text-right">{board.label}</span>
            </div>

            <ol>
              {entries.map((entry) => (
                <li
                  key={entry.player.name}
                  className="border-t border-basalt-800 first:border-t-0"
                >
                  <Link
                    href={`/players/${encodeURIComponent(entry.player.name)}`}
                    className="group flex items-baseline gap-3 px-3 py-2 hover:bg-rust-500/[0.07]"
                  >
                    <span className="w-5 shrink-0 font-display text-xs tabular-nums text-steel-600">
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
                    <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-steel-500">
                      {context.format(context.of(entry.player))}
                    </span>
                    <span className="w-24 shrink-0 text-right font-mono text-sm tabular-nums text-steel-100">
                      {entry.display}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>

          {board.requirement ? (
            <p className="mt-3 text-xs leading-relaxed text-steel-500">
              {board.requirement}
            </p>
          ) : null}
        </>
      )}

      {excluded.length > 0 ? (
        <section className="mt-9">
          <h2 className="rule-heading">Under the bar</h2>
          {/*
            Named rather than counted. Somebody who cannot find themselves on a
            board has no way to tell whether they were excluded by a rule or
            lost by a bug, and the rule reads as an accusation when it is only
            ever about sample size. Their figure is shown so they can see how
            close it is.
          */}
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel-400">
            Ranked nowhere on this board, and not because of how they played.
            These are the players still under the threshold above.
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {excluded.map((player) => (
              <li key={player.name} className="text-xs">
                <Link
                  href={`/players/${encodeURIComponent(player.name)}`}
                  className="text-steel-300 hover:text-rust-300"
                >
                  {player.name}
                </Link>
                <span className="ml-1.5 font-mono tabular-nums text-steel-600">
                  {context.format(context.of(player))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav className="mt-10 border-t border-basalt-800 pt-4">
        <h2 className="rule-heading">Other boards</h2>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {BOARDS.filter((other) => other.key !== board.key).map((other) => (
            <li key={other.key}>
              <Link
                href={`/stats/${other.key}`}
                title={other.blurb}
                className="font-display text-[0.6875rem] uppercase tracking-widest text-steel-500 hover:text-rust-300"
              >
                {other.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="mt-8 text-xs leading-relaxed text-steel-500">
        Totalled from what the server recorded, across every match in the
        archive. Nothing is estimated and nothing is weighted. Grouped by player
        name, which Red Faction does not reserve or make unique, so two people
        who used the same name appear here as one and anyone who renamed appears
        as two.
      </p>
    </div>
  );
}
