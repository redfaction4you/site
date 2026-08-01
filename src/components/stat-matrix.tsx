import Link from "next/link";

import {
  BOARDS,
  BOARD_GROUPS,
  BOARD_GROUP_LABEL,
  type Board,
  type RankablePlayer,
  rank,
} from "@/lib/matches/leaderboards";

/**
 * Every player against every board, whole.
 *
 * Twelve boards of five places each is sixty rows in which the same five names
 * recur, and the repetition is the loudest thing on the page while carrying
 * almost nothing. Worse, it cannot answer either question a reader actually
 * arrives with. What is this player good at means finding their name in twelve
 * separate lists. Who is strong on the objective rather than in a fight means
 * holding six lists in your head at once.
 *
 * Nine players and twelve boards is a hundred and eight numbers, which is small
 * enough to show all of it. Almost no sports site can do that. Read a row for
 * one player's shape, a column for who leads a board, and the density of a row
 * for whether somebody is an all rounder or a specialist.
 *
 * **It is not a ranking of players and must never become one.** There is no
 * total column and no ordering by placings, because a composite score is exactly
 * the single "best player" table this whole module exists to refuse. Rows are
 * ordered by matches played, which is a fact about attendance and says so.
 *
 * On the encoding, which was measured rather than judged. The first attempt
 * shaded every cell on a four step ramp and the validator failed it: adjacent
 * steps were indistinguishable and the pale end drifted off hue. A wash strong
 * enough to clear the visibility floor on a near black surface is a saturated
 * block, which is its own fault at this size. So the rank is printed in every
 * cell and carries the value, and the leader is marked by an edge, which reads
 * at full contrast in both themes without shouting. Colour is never the only
 * thing saying anything here.
 */

const CELL = "px-1.5 py-1 text-center font-mono text-[0.6875rem] tabular-nums";

function Cell({
  board,
  placing,
  display,
}: {
  board: Board;
  placing: number | null;
  display: string | null;
}) {
  if (placing === null) {
    return (
      <td
        className={`${CELL} text-steel-700`}
        title={
          board.requirement
            ? `Not ranked on ${board.label}. ${board.requirement}`
            : `Nothing recorded for ${board.label}`
        }
      >
        &ndash;
      </td>
    );
  }

  const leads = placing === 1;
  const podium = placing <= 3;

  return (
    <td
      className={
        `${CELL} relative ` +
        (leads
          ? "bg-rust-500/25 font-semibold text-rust-200"
          : podium
            ? "font-semibold text-steel-100"
            : "text-steel-500")
      }
      title={`${board.label}: ${placing === 1 ? "1st" : placing === 2 ? "2nd" : placing === 3 ? "3rd" : `${placing}th`}${display ? `, ${display}` : ""}`}
    >
      {/* The leader's mark. An edge rather than more fill: on a near black
          surface a wash subtle enough to stay quiet cannot clear the visibility
          floor, and one that clears it is a saturated block. */}
      {leads ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-0.5 bg-rust-500"
        />
      ) : null}
      {placing}
    </td>
  );
}

export function StatMatrix({ players }: { players: RankablePlayer[] }) {
  const boards = BOARD_GROUPS.flatMap((group) =>
    BOARDS.filter((board) => board.group === group),
  );

  // One pass per board rather than per cell, so ranking runs twelve times and
  // not a hundred and eight.
  const placings = new Map<string, Map<string, { rank: number; display: string }>>();
  for (const board of boards) {
    const entries = rank(players, board);
    const byPlayer = new Map<string, { rank: number; display: string }>();
    for (const entry of entries) {
      byPlayer.set(entry.player.name.toLowerCase(), {
        rank: entry.rank,
        display: entry.display,
      });
    }
    placings.set(board.key, byPlayer);
  }

  // Anybody who places anywhere. Somebody on no board at all would be a row of
  // dashes, which says nothing about them and costs a line.
  const shown = players
    .filter((player) =>
      boards.some((board) => placings.get(board.key)?.has(player.name.toLowerCase())),
    )
    .sort((a, b) => b.matchesPlayed - a.matchesPlayed);

  if (shown.length === 0) return null;

  return (
    <div>
      <div className="panel overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left font-display text-[0.5625rem] uppercase tracking-wider text-steel-600">
                <span className="sr-only">Player</span>
              </th>
              {BOARD_GROUPS.map((group) => (
                <th
                  key={group}
                  colSpan={BOARDS.filter((board) => board.group === group).length}
                  className="border-b border-basalt-800 px-1.5 pb-1 pt-1.5 text-center font-display text-[0.5625rem] uppercase tracking-widest text-steel-600"
                >
                  {BOARD_GROUP_LABEL[group]}
                </th>
              ))}
            </tr>
            <tr>
              <th className="border-b border-basalt-700 px-2 py-1 text-left font-display text-[0.5625rem] uppercase tracking-wider text-steel-500">
                Player
              </th>
              {boards.map((board) => (
                <th
                  key={board.key}
                  className="border-b border-basalt-700 px-1 py-1 text-center font-display text-[0.5625rem] uppercase tracking-wider text-steel-500"
                >
                  {/* The full name lives on the link and in the tooltip, so the
                      short form never has to carry the meaning alone. */}
                  <Link
                    href={`/stats/${board.key}`}
                    title={`${board.label}. ${board.blurb}`}
                    className="whitespace-nowrap hover:text-rust-300"
                  >
                    {board.short}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {shown.map((player) => (
              <tr key={player.name} className="border-b border-basalt-800">
                <td className="whitespace-nowrap px-2 py-1">
                  <Link
                    href={`/players/${encodeURIComponent(player.name)}`}
                    className="text-xs text-steel-200 hover:text-rust-300"
                  >
                    {player.name}
                  </Link>
                </td>
                {boards.map((board) => {
                  const placing = placings
                    .get(board.key)
                    ?.get(player.name.toLowerCase());
                  return (
                    <Cell
                      key={board.key}
                      board={board}
                      placing={placing?.rank ?? null}
                      display={placing?.display ?? null}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The key, because three of the four things a cell can be are not
          self evident, and a dash in particular would otherwise read as last
          place when it means the opposite of a judgement. */}
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] text-steel-500">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 border-l-2 border-rust-500 bg-rust-500/25"
          />
          leads the board
        </span>
        <span className="font-semibold text-steel-100">
          bold <span className="font-normal text-steel-500">top three</span>
        </span>
        <span>
          <span className="font-mono text-steel-700">&ndash;</span> not ranked,
          which is a qualification bar or nothing recorded, never last place
        </span>
      </p>
    </div>
  );
}
