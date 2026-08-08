import Link from "next/link";

import {
  BOARDS,
  BOARD_GROUPS,
  BOARD_GROUP_LABEL,
  type Board,
  type RankablePlayer,
} from "@/lib/matches/leaderboards";

/**
 * Every player against every statistic, with the actual numbers.
 *
 * This replaced a matrix of placings, which was the wrong idea done carefully.
 * A rank is derived and lossy: a cell reading 4 does not say whether fourth was
 * close to first or nowhere near it, and a page of bare ordinals gives a reader
 * nothing to recognise. It also had no rhythm, so tracking one player across
 * twelve columns meant using a finger.
 *
 * What every serious stats page does instead is show the values and let you
 * sort.
 *
 * A first attempt put a bar behind every figure, as a share of that column's
 * leader. It was thrown out: twelve columns of independently scaled fills, each
 * ending at a different point with no shared baseline, is a ragged field of grey
 * blocks. It reads as noise, and worse, it reads as noise that means something.
 * A bar earns its place in a top five list where five fills descend from one
 * edge and the shape is the point. In a wide table of unrelated units it is
 * decoration pretending to be data.
 *
 * So this is the table the reference sports sites use, and nothing else: aligned
 * figures, a band per row so the eye can cross twelve columns without a finger,
 * the sorted column tinted **as a column** so the sort reads as one vertical
 * block rather than as scattered marks, and the leader of each column in bold.
 * The chrome all runs with the grid rather than against it.
 *
 * **Sorting is a link, not client state.** Same rule the catalogue follows:
 * every sorted view is a real URL somebody can paste into Discord, it works
 * before any JavaScript loads, and it costs no bundle. The arrow marks the
 * column in force.
 *
 * Nothing is compared between columns and there is no total, because adding a
 * frag count to a capture count is not a number.
 *
 * **A figure below a board's qualification bar is still shown**, muted and
 * marked, rather than hidden. Accuracy over forty shots is a real thing that
 * happened; it just cannot lead the board. Hiding it would tell somebody who
 * played two matches that they do not exist.
 */

const DEFAULT_SORT = "frags";

/** The direction a board is read in when you first sort by it. */
function naturalDir(board: Board): "asc" | "desc" {
  return board.direction === "low" ? "asc" : "desc";
}

export function StatTable({
  players,
  sort,
  dir,
}: {
  players: RankablePlayer[];
  sort?: string;
  dir?: string;
}) {
  const columns = BOARD_GROUPS.flatMap((group) =>
    BOARDS.filter((board) => board.group === group),
  );

  const active =
    columns.find((board) => board.key === sort) ??
    columns.find((board) => board.key === DEFAULT_SORT) ??
    columns[0];
  const direction: "asc" | "desc" =
    dir === "asc" || dir === "desc" ? dir : naturalDir(active);

  // Per column: everybody's value, and the best among those allowed to lead it.
  const measured = new Map<
    string,
    { values: Map<string, number | null>; leader: number | null }
  >();

  for (const board of columns) {
    const values = new Map<string, number | null>();
    const qualified: number[] = [];

    for (const player of players) {
      const value = board.value(player);
      const usable = value !== null && Number.isFinite(value) ? value : null;
      values.set(player.name.toLowerCase(), usable);
      if (usable !== null && board.qualifies(player)) qualified.push(usable);
    }

    measured.set(board.key, {
      values,
      leader: qualified.length
        ? board.direction === "low"
          ? Math.min(...qualified)
          : Math.max(...qualified)
        : null,
    });
  }

  const rows = [...players].sort((a, b) => {
    const column = measured.get(active.key);
    const left = column?.values.get(a.name.toLowerCase()) ?? null;
    const right = column?.values.get(b.name.toLowerCase()) ?? null;

    // Nothing recorded sorts last whichever way the column runs, because it is
    // an absence rather than a low score.
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;

    return direction === "desc" ? right - left : left - right;
  });

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="border-b border-basalt-800 px-2 py-1 text-left" />
            {BOARD_GROUPS.map((group) => (
              <th
                key={group}
                colSpan={BOARDS.filter((board) => board.group === group).length}
                className="border-b border-basalt-800 px-2 pb-1 pt-1.5 text-center font-display text-[0.6875rem] uppercase tracking-widest text-steel-500"
              >
                {BOARD_GROUP_LABEL[group]}
              </th>
            ))}
          </tr>
          <tr>
            <th className="whitespace-nowrap border-b border-basalt-700 px-2 py-1.5 text-left font-display text-[0.6875rem] uppercase tracking-wider text-steel-400">
              Player
            </th>
            {columns.map((board) => {
              const current = board.key === active.key;
              // Clicking the column in force turns it round; a new column starts
              // the way that column is naturally read.
              const next = current
                ? direction === "desc"
                  ? "asc"
                  : "desc"
                : naturalDir(board);

              return (
                <th
                  key={board.key}
                  aria-sort={
                    current
                      ? direction === "desc"
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                  className={
                    "whitespace-nowrap border-b border-basalt-700 px-2 py-1.5 text-right font-display text-[0.6875rem] uppercase tracking-wider " +
                    // The band starts at the heading, so the sorted column is
                    // one shape from top to bottom.
                    (current ? "bg-rust-500/[0.07]" : "")
                  }
                >
                  <Link
                    href={`/stats?sort=${board.key}&dir=${next}`}
                    title={`${board.label}. ${board.blurb} Sort by this.`}
                    className={
                      current
                        ? "text-rust-400"
                        : "text-steel-500 hover:text-steel-200"
                    }
                  >
                    {board.short}
                    <span aria-hidden="true" className="ml-0.5">
                      {current ? (direction === "desc" ? "▾" : "▴") : ""}
                    </span>
                  </Link>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {rows.map((player) => {
            const key = player.name.toLowerCase();
            return (
              <tr
                key={player.name}
                /*
                  A band per row, which is the whole reason a wide table is
                  readable. Twelve columns without one means tracking a player
                  across the page with a finger, which is what the previous
                  version made you do.
                */
                className="border-b border-basalt-800 odd:bg-steel-500/[0.04] hover:bg-rust-500/[0.07]"
              >
                <td className="whitespace-nowrap px-2 py-1.5">
                  <Link
                    href={`/players/${encodeURIComponent(player.name)}`}
                    className="text-sm text-steel-200 hover:text-rust-300"
                  >
                    {player.name}
                  </Link>
                </td>

                {columns.map((board) => {
                  const column = measured.get(board.key);
                  const value = column?.values.get(key) ?? null;
                  const leader = column?.leader ?? null;
                  const qualifies = board.qualifies(player);
                  const leads = value !== null && qualifies && value === leader;
                  // The sorted column is tinted whole, so the sort reads as one
                  // vertical block rather than as a mark on each row.
                  const sorted = board.key === active.key;

                  return (
                    <td
                      key={board.key}
                      className={
                        "px-2 py-1.5 text-right font-mono text-[0.8125rem] tabular-nums " +
                        (sorted ? "bg-rust-500/[0.07] " : "") +
                        (value === null
                          ? "text-steel-700"
                          : !qualifies
                            ? "text-steel-600"
                            : leads
                              ? "font-semibold text-rust-300"
                              : "text-steel-200")
                      }
                      title={
                        value === null
                          ? `Nothing recorded for ${board.label}`
                          : qualifies
                            ? `${player.name}, ${board.label}: ${board.format(value, player)}${leads ? " — leads this board" : ""}`
                            : `${player.name}, ${board.label}: ${board.format(value, player)}. Below the bar for this board, so it is not ranked. ${board.requirement ?? ""}`
                      }
                    >
                      {value === null ? (
                        <>&ndash;</>
                      ) : (
                        <>
                          {board.format(value, player)}
                          {!qualifies ? (
                            <span className="text-steel-700">*</span>
                          ) : null}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
