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
 * sort. That is the whole design: a value you can read, a bar behind it for the
 * shape, and a column heading you can click.
 *
 * **Sorting is a link, not client state.** Same rule the catalogue follows:
 * every sorted view is a real URL somebody can paste into Discord, it works
 * before any JavaScript loads, and it costs no bundle. The arrow marks the
 * column in force.
 *
 * **The bar is scaled to the leader of its own column**, so a row is read across
 * for shape and a column down for standing. Every column has a different unit,
 * which is exactly why nothing here is compared between columns and there is no
 * total: adding a frag count to a capture count is not a number.
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

  /** How full a cell's bar is, as a share of that column's leader. */
  function share(board: Board, value: number, leader: number | null): number {
    if (leader === null || leader <= 0 || value <= 0) return 0;
    const raw = board.direction === "low" ? leader / value : value / leader;
    return Math.max(0, Math.min(100, raw * 100));
  }

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
                className="border-b border-basalt-800 px-2 pb-1 pt-1.5 text-center font-display text-[0.5625rem] uppercase tracking-widest text-steel-600"
              >
                {BOARD_GROUP_LABEL[group]}
              </th>
            ))}
          </tr>
          <tr>
            <th className="whitespace-nowrap border-b border-basalt-700 px-2 py-1 text-left font-display text-[0.5625rem] uppercase tracking-wider text-steel-500">
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
                  className="whitespace-nowrap border-b border-basalt-700 px-2 py-1 text-right font-display text-[0.5625rem] uppercase tracking-wider"
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
              <tr key={player.name} className="border-b border-basalt-800">
                <td className="whitespace-nowrap px-2 py-1">
                  <Link
                    href={`/players/${encodeURIComponent(player.name)}`}
                    className="text-xs text-steel-200 hover:text-rust-300"
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

                  if (value === null) {
                    return (
                      <td
                        key={board.key}
                        className="px-2 py-1 text-right font-mono text-[0.6875rem] tabular-nums text-steel-700"
                        title={`Nothing recorded for ${board.label}`}
                      >
                        &ndash;
                      </td>
                    );
                  }

                  return (
                    <td
                      key={board.key}
                      className="relative overflow-hidden px-2 py-1 text-right font-mono text-[0.6875rem] tabular-nums"
                      title={
                        qualifies
                          ? `${player.name}, ${board.label}: ${board.format(value, player)}`
                          : `${player.name}, ${board.label}: ${board.format(value, player)}. Below the bar for this board, so it is not ranked. ${board.requirement ?? ""}`
                      }
                    >
                      {/*
                        The bar the boards use, at cell width. It is the reason
                        this reads as a picture rather than as a spreadsheet:
                        the eye gets the shape of a column without reading a
                        single number.
                      */}
                      <span
                        aria-hidden="true"
                        className={
                          "absolute inset-y-0 right-0 " +
                          (leads ? "bg-rust-500/20" : "bg-steel-500/10")
                        }
                        style={{ width: `${share(board, value, leader)}%` }}
                      />
                      <span
                        className={
                          "relative " +
                          (!qualifies
                            ? "text-steel-600"
                            : leads
                              ? "font-semibold text-rust-200"
                              : "text-steel-200")
                        }
                      >
                        {board.format(value, player)}
                        {!qualifies ? (
                          <span className="text-steel-700">*</span>
                        ) : null}
                      </span>
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
