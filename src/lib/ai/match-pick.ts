/**
 * Choosing which match, and which moment in it, the picture is about.
 *
 * A night is several matches and the illustration is one photograph, so something
 * has to pick. All of it is decided from the match record by the rules below
 * rather than by asking a model, for three reasons: the record already knows, the
 * answer is then reproducible from the day it illustrates, and it costs nothing
 * against a request budget that is the binding constraint on everything else here.
 *
 * Deliberately free of imports so `node --test` can load it directly.
 */

export type Team = "red" | "blue";

export type PickableMatch = {
  sourceMatchId: string | number;
  mapName: string;
  redScore: number;
  blueScore: number;
  winner: Team | null;
  overtime: boolean;
  redPlayers: number;
  bluePlayers: number;
  /** Captures in order, as the event log recorded them. */
  captures: { team: Team; elapsedSeconds: number }[];
};

/**
 * Maps that are a laugh rather than the night's story.
 *
 * Rail maps are played with a one shot kill weapon and the regulars treat them
 * as a fun side game between the real ones. Nothing in the scoreboard says so,
 * and the scoring below cannot work it out: a rail match is high scoring and
 * often goes to overtime, which is exactly the shape of a great game, so on 30
 * July "Rail Fight" beat five ordinary matches to become the match of the night
 * and the subject of the illustration.
 *
 * This is domain knowledge from the people who play here, not something
 * derivable, so it is written down rather than inferred. Add to the pattern as
 * other novelty modes appear.
 */
const SIDE_MAP_PATTERN = /\brail\b/i;

export function isSideMap(mapName: string): boolean {
  return SIDE_MAP_PATTERN.test(mapName);
}

/**
 * How interesting a match was, as a number.
 *
 * Ordered so the tie breaks make sense rather than being arbitrary: overtime is
 * the strongest signal a match was worth watching, then a close finish, then
 * whether much happened at all. A blowout with many captures still loses to a
 * one-goal game, which matches how somebody would actually pick.
 *
 * Side maps are ranked below every ordinary match rather than penalised by some
 * number, because the question is not how good the rail game was. It is a
 * different thing that happened to be fun, and it should only lead a night that
 * had nothing else in it.
 */
export function matchInterest(match: PickableMatch): number {
  const margin = Math.abs(match.redScore - match.blueScore);
  const total = match.redScore + match.blueScore;

  let score = 0;
  if (match.overtime) score += 1000;
  // A one-goal game scores 100, two goals 50, and so on.
  score += Math.round(100 / (margin + 1));
  score += total * 5;
  score += match.captures.length;

  return score;
}

/**
 * The match the picture is about. Null when there is nothing to illustrate.
 *
 * Ties break on the later match, because the last close game of the night is the
 * one people remember.
 */
export function pickMatch(matches: PickableMatch[]): PickableMatch | null {
  return rankMatches(matches)[0] ?? null;
}

/**
 * Every match worth illustrating, most interesting first.
 *
 * Exists because the best match is not always one that *can* be illustrated. The
 * picture is composed from a screenshot of the map that was played, and a map
 * with no screenshots on file is skipped rather than invented. On 30 July the
 * overtime match was on Rail Fight, which had no references, so the night's
 * column went out with no picture at all despite five other matches being
 * perfectly illustratable.
 *
 * The caller walks this list and takes the first map it has references for. That
 * costs a little of the deliberate agreement between the picture and the
 * featured match, which is worth less than a column with nothing beside it, and
 * it corrects itself the moment the missing screenshots are added.
 *
 * Ties break on the later match, because the last close game of the night is the
 * one people remember, so the sort has to be stable in reverse.
 */
export function rankMatches(matches: PickableMatch[]): PickableMatch[] {
  const playable = matches.filter(
    (match) => match.redPlayers > 0 || match.bluePlayers > 0,
  );

  return playable
    .map((match, order) => ({ match, order }))
    .sort((a, b) => {
      // Every ordinary match outranks every side map, whatever the scoreboard
      // says about either. See `isSideMap`.
      const bySide = Number(isSideMap(a.match.mapName)) - Number(isSideMap(b.match.mapName));
      if (bySide !== 0) return bySide;

      const byInterest = matchInterest(b.match) - matchInterest(a.match);
      return byInterest !== 0 ? byInterest : b.order - a.order;
    })
    .map((entry) => entry.match);
}

export type MomentKind =
  | "flag-run"
  | "capture-cheer"
  | "point-out"
  | "two-talking"
  | "huddle"
  | "face-off";

export type PickedMoment = {
  moment: MomentKind;
  /** Whose moment it is: who is celebrating, carrying, or defending. */
  subject: Team;
  /** Whose flag is in shot, if any. */
  flagTeam: Team | null;
};

/**
 * What to depict from the chosen match.
 *
 * A capture is the only moment the event log positively evidences, so it is
 * preferred: the picture then illustrates something that provably happened. A
 * match with no captures at all was a defensive one, and gets the firefight rather
 * than a celebration nobody had.
 *
 * In capture the flag you score by carrying the enemy flag to your own stand, so
 * the flag in a red team's capture is the blue one. Getting that backwards would
 * put a picture on the site that misrepresents the game to anybody who plays it.
 */
export function pickMoment(match: PickableMatch): PickedMoment {
  const winner = match.winner;
  const decided = Math.abs(match.redScore - match.blueScore);

  /*
   * A capture is the only thing the event log positively evidences, so a side
   * that scored gets the celebration: the picture then illustrates something that
   * provably happened.
   *
   * In capture the flag you score by carrying the enemy flag to your own stand,
   * so the flag in a red team's capture is the blue one. Getting that backwards
   * would put a picture on the site that misrepresents the game to anybody who
   * plays it.
   */
  if (match.captures.length > 0 && winner) {
    const theirs = match.captures.filter((capture) => capture.team === winner);
    if (theirs.length > 0) {
      /*
       * Two honest pictures of the same fact, alternating so a run of nights does
       * not look identical: the run itself, flag in hand, or the celebration after
       * it with nothing in hand. Which one is decided by the day, so it stays
       * reproducible.
       */
      const carrying = rotationFor(String(match.sourceMatchId)) % 2 === 0;
      return {
        moment: carrying ? "flag-run" : "capture-cheer",
        subject: winner,
        // The enemy flag is the one you carry home. Backwards here would
        // misrepresent the game to anybody who plays it.
        flagTeam: carrying ? (winner === "red" ? "blue" : "red") : null,
      };
    }
  }

  /*
   * Nobody scored, or nobody won. Both are real outcomes and neither is a
   * celebration, so the picture is about the people rather than the result: the
   * losing side talking it over, or two players who never gave each other an inch.
   */
  if (winner) {
    // A hammering gets the losing side afterwards, which is the more honest
    // picture of a one-sided night than the winners enjoying it.
    const losing: Team = winner === "red" ? "blue" : "red";
    return decided >= 3
      ? { moment: "two-talking", subject: losing, flagTeam: null }
      : { moment: "huddle", subject: winner, flagTeam: null };
  }

  return { moment: "face-off", subject: "red", flagTeam: null };
}

/**
 * A stable number for rotating between equally good choices.
 *
 * Derived from the day rather than from a clock or a random number, so the same
 * night always produces the same picture. Regenerating after a failure then gives
 * the same composition rather than a different one, which is what makes an odd
 * result reproducible instead of a mystery.
 */
export function rotationFor(archiveDay: string): number {
  let total = 0;
  for (const character of archiveDay) total += character.charCodeAt(0);
  return total;
}
