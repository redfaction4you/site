/**
 * Whether the sides were a fair fight, and whether anybody could have known.
 *
 * The owner's complaint, and it is a real one: badly picked sides ruin the
 * evening for six people. One side spends twenty minutes being farmed and the
 * other posts numbers that flatter them. Everything else here reports what the
 * scoreboard said. Nothing said whether the game was worth playing.
 *
 * **Two questions, deliberately kept apart, because only one has a reliable
 * answer.**
 *
 * The first is what happened, and it is arithmetic. One side took 67% of the
 * frags, or the loser never scored. No model, nothing to argue with.
 *
 * The second is whether the sides looked wrong before anybody spawned, and that
 * is a projection. It was checked against the archive rather than assumed, and
 * the checking changed the design.
 *
 * **What was tried and thrown out.** Average frags per match, the obvious
 * measure, predicts which side will dominate 49% of the time. That is a coin
 * flip, and a coin flip printed under the words "these sides should never have
 * happened" is worse than silence: it is authoritative and wrong. It fails
 * because frags per match mostly measures how long the match ran.
 *
 * Frags per death cannot be inflated by a long game. It gets the direction right
 * in 70% of matches overall, and in 9 of 9 where the gap cleared the bar below.
 * That is the measure, and the bar is why it can be trusted at all.
 *
 * **What it still cannot do, written down because the prose must not
 * overreach.** Of the matches flagged uneven on paper, only about half became
 * genuinely one-sided; the rest were close games between mismatched sides. And 8
 * of 29 matches that looked perfectly even turned into a hiding anyway.
 *
 *   Supported:     "on paper that looked uneven before it started"
 *   Supported:     "that one was one-sided"  (about a match that was played)
 *   NOT supported: "that was always going to be a hiding"
 *   NOT supported: "the even-looking sides give the even games"
 *
 * Most blowouts are not predictable. A module that let somebody imply otherwise
 * would be lying with correct arithmetic.
 *
 * Deliberately free of imports so `node --test` can load it directly.
 */

/** One player's part in one match, as far as balance is concerned. */
export type SideAppearance = {
  name: string;
  /** "red", "blue", or anything else, which counts as no side. */
  team: string;
  kills: number;
  deaths: number;
};

/** A match, with who was on which side. */
export type MatchSides = {
  matchId: string;
  mapName: string;
  redScore: number;
  blueScore: number;
  /** "red", "blue", or null when the match had no result. */
  winner: string | null;
  players: SideAppearance[];
};

/**
 * How a player had been going before tonight.
 *
 * Totals rather than an average of averages: frags per death over ten matches is
 * all their frags over all their deaths, so one short match cannot swing it the
 * way a mean of per-match ratios would.
 */
export type PriorForm = { matches: number; kills: number; deaths: number };

/**
 * Matches a player needs before their form may enter a projection.
 *
 * Five, the same bar a pairing clears before it is shown a win rate, for the
 * same reason: below it the figure exists and the comparison does not.
 */
export const MIN_MATCHES_FOR_PROJECTION = 5;

/**
 * The gap in average frags per death at which sides looked uneven on paper.
 *
 * Not chosen to taste. Swept against every match on record: at 0.25 it fires on
 * about one match in five and has not yet pointed at the wrong side, while lower
 * bars start being wrong and higher ones almost never fire. It will be wrong
 * eventually. It is a bar for "worth remarking on", not a proof.
 */
export const UNEVEN_ON_PAPER = 0.25;

/**
 * The share of a match's frags that makes it one-sided rather than merely won.
 *
 * Sixty percent. Across the archive the median winner takes 54% and the worst
 * seen is 67%, so 60 is roughly the top quarter: outside an ordinary game
 * without flagging every win.
 *
 * Frags rather than the flag score, because the flag score does not measure the
 * thing being complained about. A match can finish 2-6 with the frags level at
 * 72-73, and it can finish 5-3 with one side taking 67% of the kills. The second
 * is the evening nobody enjoyed.
 */
export const LOPSIDED_SHARE = 0.6;

/** And the share at which it stopped being a game. */
export const WALKOVER_SHARE = 0.65;

/** What a match turned out to be, once both questions are answered. */
export type BalanceVerdict =
  /** Close on the night, whatever it looked like beforehand. */
  | "even"
  /** One side had much the better of it, and the sides looked fine on paper. */
  | "one-sided"
  /** Uneven on paper, and it played out that way. */
  | "predictable"
  /** Uneven on paper, and a good game anyway. */
  | "closer-than-it-looked"
  /** Not enough history to have had a view beforehand. */
  | "unknown";

export type MatchBalance = {
  matchId: string;
  mapName: string;
  /** Player counts, almost always equal, and worth saying when they are not. */
  redCount: number;
  blueCount: number;
  sidesUneven: boolean;
  /** The stronger side's share of the frags, 0.5 when dead level. */
  fragShare: number;
  /** Which side that was, or null when the frags were exactly level. */
  strongerSide: "red" | "blue" | null;
  redFrags: number;
  blueFrags: number;
  /** True when the loser never scored. Common here, so not a blowout on its own. */
  shutout: boolean;
  oneSided: boolean;
  walkover: boolean;
  /**
   * Red's projected frags-per-death advantage, positive when red was favoured.
   * Null when anybody on either side is short of `MIN_MATCHES_FOR_PROJECTION`.
   */
  projectedGap: number | null;
  lookedUneven: boolean;
  verdict: BalanceVerdict;
};

function sideOf(players: SideAppearance[], team: string): SideAppearance[] {
  return players.filter((player) => player.team === team);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * A side's projected strength, or null when anybody on it is too new to rate.
 *
 * All or nothing on purpose. A side of three rated on the two who have history
 * is not a weaker projection, it is a projection of a different side, and it
 * would be presented with the same confidence as a complete one.
 */
function projectSide(
  side: SideAppearance[],
  form: Map<string, PriorForm>,
): number | null {
  if (side.length === 0) return null;

  const rates: number[] = [];
  for (const player of side) {
    const prior = form.get(player.name.toLocaleLowerCase("en-US"));
    if (!prior || prior.matches < MIN_MATCHES_FOR_PROJECTION) return null;
    // Deaths floored at one, so somebody who has never died reads as strong
    // rather than as infinite.
    rates.push(prior.kills / Math.max(1, prior.deaths));
  }

  return sum(rates) / rates.length;
}

/** One match, measured and then judged. */
export function assessMatch(
  match: MatchSides,
  form: Map<string, PriorForm> = new Map(),
): MatchBalance {
  const red = sideOf(match.players, "red");
  const blue = sideOf(match.players, "blue");

  const redFrags = sum(red.map((player) => player.kills));
  const blueFrags = sum(blue.map((player) => player.kills));
  const total = redFrags + blueFrags;

  const fragShare = total > 0 ? Math.max(redFrags, blueFrags) / total : 0.5;
  const strongerSide =
    total === 0 || redFrags === blueFrags
      ? null
      : redFrags > blueFrags
        ? "red"
        : "blue";

  const redRate = projectSide(red, form);
  const blueRate = projectSide(blue, form);
  const projectedGap =
    redRate !== null && blueRate !== null ? redRate - blueRate : null;

  const lookedUneven =
    projectedGap !== null && Math.abs(projectedGap) >= UNEVEN_ON_PAPER;
  const oneSided = fragShare >= LOPSIDED_SHARE;

  /*
   * The favoured side and the side that actually dominated have to be the same
   * one before this counts as predicted. Getting the direction wrong while the
   * game happens to be lopsided is not a successful projection, and counting it
   * as one is how a measure comes to look better than it is.
   */
  const favoured =
    projectedGap === null ? null : projectedGap > 0 ? "red" : "blue";
  const wentAsProjected = favoured !== null && favoured === strongerSide;

  let verdict: BalanceVerdict;
  if (projectedGap === null) verdict = oneSided ? "one-sided" : "unknown";
  else if (lookedUneven && oneSided && wentAsProjected) verdict = "predictable";
  else if (lookedUneven && !oneSided) verdict = "closer-than-it-looked";
  else if (oneSided) verdict = "one-sided";
  else verdict = "even";

  return {
    matchId: match.matchId,
    mapName: match.mapName,
    redCount: red.length,
    blueCount: blue.length,
    sidesUneven: red.length !== blue.length,
    fragShare,
    strongerSide,
    redFrags,
    blueFrags,
    shutout: Math.min(match.redScore, match.blueScore) === 0,
    oneSided,
    walkover: fragShare >= WALKOVER_SHARE,
    projectedGap,
    lookedUneven,
    verdict,
  };
}

export type NightBalance = {
  matches: MatchBalance[];
  played: number;
  /** How many were one-sided, which is the number the owner actually feels. */
  oneSided: number;
  /** How many of those could have been seen coming. */
  predictable: number;
  /** Sides that looked wrong and produced a good game anyway. */
  closerThanItLooked: number;
  /** Matches played with unequal numbers, which is its own complaint. */
  unevenSides: number;
  /** The most lopsided match of the night, when there was a one-sided one. */
  worst: MatchBalance | null;
};

/** A night's worth, summarised. */
export function assessNight(
  played: MatchSides[],
  form: Map<string, PriorForm> = new Map(),
): NightBalance {
  const matches = played.map((match) => assessMatch(match, form));
  const oneSided = matches.filter((match) => match.oneSided);

  return {
    matches,
    played: matches.length,
    oneSided: oneSided.length,
    predictable: matches.filter((match) => match.verdict === "predictable").length,
    closerThanItLooked: matches.filter(
      (match) => match.verdict === "closer-than-it-looked",
    ).length,
    unevenSides: matches.filter((match) => match.sidesUneven).length,
    worst:
      oneSided.length === 0
        ? null
        : oneSided.reduce((worst, match) =>
            match.fragShare > worst.fragShare ? match : worst,
          ),
  };
}

/** The frag split as a percentage pair, for prose that has to quote it. */
export function shareAsPercent(balance: MatchBalance): string {
  const stronger = Math.round(balance.fragShare * 100);
  return `${stronger}/${100 - stronger}`;
}
