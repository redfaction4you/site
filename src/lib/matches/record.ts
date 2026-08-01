/**
 * A fighting record, in the shape a combat sports record is written in.
 *
 * The match history table listed results and left the reader to keep score: you
 * could see that somebody won on the 29th and lost on the 30th, and the only way
 * to know what their record stood at was to count down the column. A record
 * column answers it on every row, which is why every boxing and MMA record on
 * Wikipedia has one.
 *
 * Pure, so `node --test` loads it directly. The two rules in it are the ones
 * worth getting right:
 *
 * A match with no recorded winner is neither a win nor a loss. It happened, the
 * people in it were still on those sides, and it leaves the record where it was.
 * Counting it either way would be inventing a result; dropping the row would be
 * hiding a match that was played.
 *
 * The record shown on a row is the record **after** that match, not before it.
 * That is the convention a fight record uses, and it means the top row of a
 * newest-first table is the player's record today, which is the number somebody
 * actually came to the page for.
 */

export type Played = { won: boolean | null };

export type RecordEntry<T> = {
  match: T;
  /** Wins and losses after this match, counting from the first ever played. */
  wins: number;
  losses: number;
  /** Matches with no recorded winner, which move neither column. */
  undecided: number;
  result: "won" | "lost" | "undecided";
};

/**
 * Annotates matches with the record as it stood after each one.
 *
 * Takes them newest first, which is how they are read and how every query here
 * returns them, and gives them back in the same order.
 */
export function withRunningRecord<T extends Played>(
  newestFirst: T[],
): RecordEntry<T>[] {
  let wins = 0;
  let losses = 0;
  let undecided = 0;

  const oldestFirst = [...newestFirst].reverse().map((match) => {
    if (match.won === true) wins += 1;
    else if (match.won === false) losses += 1;
    else undecided += 1;

    return {
      match,
      wins,
      losses,
      undecided,
      result:
        match.won === true ? "won" : match.won === false ? "lost" : "undecided",
    } satisfies RecordEntry<T>;
  });

  return oldestFirst.reverse();
}

/**
 * How many a side against how many, as `2v2`.
 *
 * Written from who was actually in the match rather than from a mode name,
 * because the server runs whoever turns up: the same night has two against two
 * and three against three in it, and a row that does not say which is comparing
 * numbers from different games.
 *
 * Uneven sides are stated as they were. A three against two is a real thing that
 * happens when somebody drops, and rounding it to `3v3` would be a small lie in
 * the direction of tidiness.
 */
export function formatOf(ownSide: number, otherSide: number): string {
  return `${ownSide}v${otherSide}`;
}
