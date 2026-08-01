/**
 * The stat boards: one ranking per thing a player can be good at.
 *
 * A single "best player" table answers a question nobody asked. Somebody whose
 * aim is ordinary can be the person you want carrying the flag, and the archive
 * already records enough to show that: hold time, returns, solo captures, how
 * fast they got it home. Ranking each separately is the difference between the
 * numbers describing six people and the numbers describing one.
 *
 * Every board is computed from the totals `listPlayers` already returns, so this
 * costs no extra query and no model call.
 *
 * **Qualification is the part that matters.** An accuracy board topped by
 * somebody who fired four shots and hit three is not a leaderboard, it is a joke
 * at the expense of everyone who played properly, and it is exactly what these
 * tables do by default. Each board says what it takes to appear on it and why.
 *
 * The shape below is structural: anything with these fields works, which in
 * practice means whatever `listPlayers` returns. The one import is the accuracy
 * rule, which has to be the same one the scoreboards use or a figure withheld on
 * a match page would reappear on a board.
 */
import { accuracyOf } from "./accuracy.ts";

/** The subset of a player's totals the boards read. */
export type RankablePlayer = {
  name: string;
  matchesPlayed: number;
  kills: number;
  deaths: number;
  caps: number;
  score: number;
  shotsHit: number;
  shotsFired: number;
  damageGiven: number;
  damageTaken: number;
  flagHoldMs: number;
  flagReturns: number;
  bestStreak: number;
  fastestCaptureMs: number | null;
  soloCaps: number;
  relayCaps: number;
  leadCarries: number;
};

/**
 * What a board is about.
 *
 * The same three questions the player page groups its figures under, worded
 * identically on purpose: somebody who has read one page should recognise the
 * shape of the other. Twelve boards in one flat grid weighted accuracy the same
 * as fastest capture and left a reader to work out which were even comparable.
 */
export const BOARD_GROUPS = ["fighting", "flag"] as const;
export type BoardGroup = (typeof BOARD_GROUPS)[number];

export const BOARD_GROUP_LABEL: Record<BoardGroup, string> = {
  fighting: "Fighting",
  flag: "The flag",
};

export const BOARD_GROUP_BLURB: Record<BoardGroup, string> = {
  fighting: "Frags, accuracy, and what they cost.",
  flag: "The objective, which is the only thing that wins a match.",
};

export type Board = {
  key: string;
  group: BoardGroup;
  label: string;
  /**
   * The label at matrix width, where twelve boards share one header row.
   *
   * Written out rather than truncated, because "Frags per…" and "Frags per…"
   * are the same string and two different boards. Every one is also given its
   * full label as a tooltip and as a link, so the short form never has to carry
   * the meaning on its own.
   */
  short: string;
  /** One line on what the number means. Shown under the heading. */
  blurb: string;
  /** Null means this player has nothing to rank here. */
  value: (player: RankablePlayer) => number | null;
  format: (value: number, player: RankablePlayer) => string;
  /** Whether a bigger number is better. Fastest capture is the odd one out. */
  direction: "high" | "low";
  /**
   * Who is allowed on the board at all, and the sentence explaining it. A board
   * with no bar returns true and no note.
   */
  qualifies: (player: RankablePlayer) => boolean;
  requirement: string | null;
  /**
   * The sample the ranked figure came out of, shown on the board's own page.
   *
   * A rate with no sample beside it is the same trap qualification exists to
   * close, one step further along: 20.1% reads as a fact until you know whether
   * it came from four hundred shots or four thousand. It also makes the bar
   * legible, since the people held back by it are held back by exactly this
   * number, and the board can then say who they are and how close they are.
   *
   * Matches played is the right answer for most boards and is the default, so
   * this is only set where something else is.
   */
  context?: BoardContext;
};

/**
 * A second figure per player, sized so the board can sort by it as well as
 * print it. Sorting is the reason this is a number and a formatter rather than
 * a string: "who is closest to qualifying" is the useful order for the people a
 * board leaves out, and it cannot be recovered from "1,240".
 */
export type BoardContext = {
  label: string;
  of: (player: RankablePlayer) => number;
  format: (value: number) => string;
};

/** What every board's sample is, unless it says otherwise. */
export const MATCHES_CONTEXT: BoardContext = {
  label: "Matches",
  of: (player) => player.matchesPlayed,
  format: (value) => `${value}`,
};

export function contextFor(board: Board): BoardContext {
  return board.context ?? MATCHES_CONTEXT;
}

/** Minutes and seconds, for durations that run to minutes. */
export function clock(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Enough shots that accuracy means something.
 *
 * A night is a few hundred shots each, so this is roughly "played more than a
 * couple of matches and actually engaged". Low enough that nobody real is
 * excluded, high enough that a lucky handful of shots cannot top the table.
 */
const MIN_SHOTS_FOR_ACCURACY = 250;

/** Ratios need a couple of nights before they stop being noise. */
const MIN_MATCHES_FOR_RATIO = 3;

/**
 * Boards that measure a rate rather than a pile.
 *
 * Totals reward turning up. Somebody who plays every night out-frags somebody
 * better who plays half of them, and no amount of labelling changes that: the
 * ranking is partly a ranking of attendance. That is fine as long as it is not
 * the only thing on offer, so the per match boards sit beside the totals and let
 * a player who shows up rarely and plays well top something real.
 *
 * They need a minimum of their own. A per match average over one match is that
 * match, not an average.
 */
const MIN_MATCHES_FOR_RATE = 3;

export const BOARDS: Board[] = [
  {
    key: "frags",
    group: "fighting",
    label: "Frags",
    short: "Frags",
    blurb: "Total kills across every match on record.",
    value: (p) => p.kills,
    format: (v) => `${v}`,
    direction: "high",
    qualifies: () => true,
    requirement: null,
  },
  {
    key: "captures",
    group: "flag",
    label: "Captures",
    short: "Caps",
    blurb: "Flags taken home. The only stat that actually wins matches.",
    value: (p) => p.caps,
    format: (v) => `${v}`,
    direction: "high",
    qualifies: () => true,
    requirement: null,
  },
  {
    key: "accuracy",
    group: "fighting",
    label: "Accuracy",
    short: "Acc",
    blurb: "Shots that hit, as a share of shots fired.",
    // Withheld rather than clamped when the counters contradict each other. A
    // clamp would put a broken record at the top of the board on 100%, which is
    // the same failure this board's qualification rule exists to prevent.
    value: (p) => accuracyOf(p.shotsHit, p.shotsFired),
    format: (v) => `${(v * 100).toFixed(1)}%`,
    direction: "high",
    qualifies: (p) => p.shotsFired >= MIN_SHOTS_FOR_ACCURACY,
    requirement: `At least ${MIN_SHOTS_FOR_ACCURACY} shots fired, so a lucky handful cannot top the table.`,
    // The only board whose bar is measured in something other than matches, so
    // the only one that has to say what it is measured in.
    context: {
      label: "Shots",
      of: (p) => p.shotsFired,
      format: (v) => Math.round(v).toLocaleString("en-GB"),
    },
  },
  {
    key: "flag-hold",
    group: "flag",
    label: "Time carrying",
    short: "Hold",
    blurb: "How long they have held an enemy flag, in total.",
    value: (p) => (p.flagHoldMs > 0 ? p.flagHoldMs : null),
    format: (v) => clock(v),
    direction: "high",
    qualifies: () => true,
    requirement: null,
  },
  {
    key: "returns",
    group: "flag",
    label: "Flag returns",
    short: "Returns",
    blurb: "Own flag recovered before the other side could score with it.",
    value: (p) => (p.flagReturns > 0 ? p.flagReturns : null),
    format: (v) => `${v}`,
    direction: "high",
    qualifies: () => true,
    requirement: null,
  },
  {
    key: "streak",
    group: "fighting",
    label: "Best streak",
    short: "Streak",
    blurb: "Most frags in a row without dying, in a single match.",
    value: (p) => (p.bestStreak > 0 ? p.bestStreak : null),
    format: (v) => `${v}`,
    direction: "high",
    qualifies: () => true,
    requirement: null,
  },
  /*
   * There is no solo captures board, and the word is not used on the site.
   *
   * It counted flags no teammate touched, which is not what it sounded like: a
   * player killed at the door who takes the flag off the floor himself and walks
   * it in was solo, and the blurb, "carried the whole way without a hand-off",
   * made that worse by describing something else. A reader said the word made
   * them think base to base. They were right, and there is no wording that
   * rescues a stat whose plain reading is a different stat.
   *
   * Base to base is the measurement worth keeping, and it is kept as a time
   * rather than a count: the fastest unbroken run, on the map it was set on.
   * `soloCaps` still exists in the data because the drive reconstruction needs
   * it and the vet checks it against the capture total. Nothing renders it.
   */
  /*
   * There is no fastest run board here, and that is deliberate.
   *
   * A run is a distance as much as a time. Huna b8 and Rail Fight are not the
   * same length, so ranking one player's 9.6 seconds above another's 12.1 across
   * different maps says who played the shorter map, and a board sorted by it
   * presents that as a ranking of players. The record is real and worth showing;
   * it belongs on the map it was set on, where the distance is a constant, and
   * that is where it now lives.
   *
   * Same reasoning as the pairing win rate that is withheld below five matches:
   * the number exists, the comparison does not.
   */
  {
    key: "damage",
    group: "fighting",
    label: "Damage dealt",
    short: "Damage",
    blurb: "Total damage given, which rewards pressure that never lands a frag.",
    value: (p) => (p.damageGiven > 0 ? Math.round(p.damageGiven) : null),
    format: (v) => v.toLocaleString("en-GB"),
    direction: "high",
    qualifies: () => true,
    requirement: null,
  },
  {
    key: "frags-per-match",
    group: "fighting",
    label: "Frags per match",
    short: "Frags/match",
    blurb: "Rewards playing well rather than playing often.",
    value: (p) => (p.matchesPlayed > 0 ? p.kills / p.matchesPlayed : null),
    format: (v) => v.toFixed(1),
    direction: "high",
    qualifies: (p) => p.matchesPlayed >= MIN_MATCHES_FOR_RATE,
    requirement: `At least ${MIN_MATCHES_FOR_RATE} matches, because an average over one match is just that match.`,
  },
  {
    key: "captures-per-match",
    group: "flag",
    label: "Captures per match",
    short: "Caps/match",
    blurb: "How often they take a flag home, regardless of how many nights they play.",
    value: (p) => (p.matchesPlayed > 0 ? p.caps / p.matchesPlayed : null),
    format: (v) => v.toFixed(2),
    direction: "high",
    qualifies: (p) => p.matchesPlayed >= MIN_MATCHES_FOR_RATE,
    requirement: `At least ${MIN_MATCHES_FOR_RATE} matches, because an average over one match is just that match.`,
  },
  {
    key: "frags-per-death",
    group: "fighting",
    label: "Frags per death",
    short: "Frags/death",
    blurb: "Kills divided by deaths. Rewards staying alive, not just shooting.",
    value: (p) => (p.deaths > 0 ? p.kills / p.deaths : p.kills > 0 ? p.kills : null),
    format: (v) => v.toFixed(2),
    direction: "high",
    qualifies: (p) => p.matchesPlayed >= MIN_MATCHES_FOR_RATIO,
    requirement: `At least ${MIN_MATCHES_FOR_RATIO} matches, because a ratio from one game is noise.`,
  },
];

export type RankedEntry = {
  rank: number;
  player: RankablePlayer;
  value: number;
  display: string;
  /** True when this player ties the one above. */
  tied: boolean;
};

/**
 * Ranks everyone eligible for a board.
 *
 * Ties share a rank and the next rank skips, the way standings normally work: two
 * players on 19 are both second and the next is fourth. Getting that wrong is the
 * kind of small wrongness that makes a table feel untrustworthy.
 */
export function rank(players: RankablePlayer[], board: Board): RankedEntry[] {
  const eligible: { player: RankablePlayer; value: number }[] = [];

  for (const player of players) {
    if (!board.qualifies(player)) continue;
    const value = board.value(player);
    if (value === null || !Number.isFinite(value)) continue;
    eligible.push({ player, value });
  }

  eligible.sort((a, b) =>
    board.direction === "high" ? b.value - a.value : a.value - b.value,
  );

  const entries: RankedEntry[] = [];
  let lastValue: number | null = null;
  let lastRank = 0;

  for (const [index, { player, value }] of eligible.entries()) {
    const tied = lastValue !== null && value === lastValue;
    const position = tied ? lastRank : index + 1;

    entries.push({
      rank: position,
      player,
      value,
      display: board.format(value, player),
      tied,
    });

    lastValue = value;
    lastRank = position;
  }

  return entries;
}

/** Looks a board up by its key, for the per-board pages. */
export function boardByKey(key: string): Board | null {
  return BOARDS.find((board) => board.key === key) ?? null;
}

