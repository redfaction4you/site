/**
 * Measuring the stats table's columns, apart from the table that draws them.
 *
 * This lives here rather than inside the component because of a bug it now has
 * a test for, and the bug was only ever going to be caught by a test.
 *
 * The table held each column's figures in a map keyed by the player's lowercased
 * display name. A display name is not unique: an identity the admin page has not
 * merged is two groups under one name, which is the archive working as designed.
 * The second row's value overwrote the first, so both printed the first's figure
 * and both sorted as one player.
 *
 * What made it survive review is that it was almost invisible. Sixteen columns
 * agreed with each other and were all wrong together; the seventeenth, win rate,
 * disagreed, because it is the only board whose `format` reads the player as
 * well as the value, so its record came from the row and its percentage from
 * somebody else. A page reading "50% (10-5)" was the only symptom of every
 * figure on that line being somebody else's.
 *
 * So the rule this module exists to hold: **a row is identified by its position
 * and by nothing else**. Not by name, not by anything derived from the player,
 * because two rows may legitimately share any of it.
 *
 * Deliberately free of runtime imports so `node --test` can load it directly.
 * The one import is a type, which is erased.
 */
import type { Board, RankablePlayer } from "./leaderboards.ts";

export type MeasuredColumn = {
  /** Everybody's value for this board, by row position in the input. */
  values: (number | null)[];
  /**
   * The best figure among the players allowed to lead this board, or null if
   * nobody qualifies. Unqualified figures are measured and shown; they just
   * cannot set the mark.
   */
  leader: number | null;
};

/** One row of the table, carrying the position that identifies it. */
export type StatRow = { player: RankablePlayer; index: number };

/**
 * Every column's figures, indexed by row position.
 *
 * A value that is absent or not finite becomes null, which means "nothing
 * recorded" rather than zero, and is treated as an absence everywhere below.
 */
export function measureColumns(
  players: RankablePlayer[],
  boards: Board[],
): Map<string, MeasuredColumn> {
  const measured = new Map<string, MeasuredColumn>();

  for (const board of boards) {
    const values: (number | null)[] = [];
    const qualified: number[] = [];

    for (const player of players) {
      const value = board.value(player);
      const usable = value !== null && Number.isFinite(value) ? value : null;
      values.push(usable);
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

  return measured;
}

/**
 * The rows in the order one column puts them, each still holding its position.
 *
 * Sorting is where the old bug did its damage, so the position travels with the
 * row rather than being looked up again afterwards: once these are ordered there
 * is no way left to ask "which row was this" and get the wrong answer.
 *
 * Nothing recorded sorts last whichever way the column runs, because it is an
 * absence rather than a low score. A player with no flag returns should not head
 * the returns board read upwards.
 */
export function orderRows(
  players: RankablePlayer[],
  column: MeasuredColumn | undefined,
  direction: "asc" | "desc",
): StatRow[] {
  const rows: StatRow[] = players.map((player, index) => ({ player, index }));

  rows.sort((a, b) => {
    const left = column?.values[a.index] ?? null;
    const right = column?.values[b.index] ?? null;

    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;

    return direction === "desc" ? right - left : left - right;
  });

  return rows;
}
