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
 * Deliberately free of imports so `node --test` can load it directly. The shape
 * below is structural: anything with these fields works, which in practice means
 * whatever `listPlayers` returns.
 */

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

export type Board = {
  key: string;
  label: string;
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
};

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
    label: "Frags",
    blurb: "Total kills across every match on record.",
    value: (p) => p.kills,
    format: (v) => `${v}`,
    direction: "high",
    qualifies: () => true,
    requirement: null,
  },
  {
    key: "captures",
    label: "Captures",
    blurb: "Flags taken home. The only stat that actually wins matches.",
    value: (p) => p.caps,
    format: (v) => `${v}`,
    direction: "high",
    qualifies: () => true,
    requirement: null,
  },
  {
    key: "accuracy",
    label: "Accuracy",
    blurb: "Shots that hit, as a share of shots fired.",
    value: (p) => (p.shotsFired > 0 ? p.shotsHit / p.shotsFired : null),
    format: (v) => `${(v * 100).toFixed(1)}%`,
    direction: "high",
    qualifies: (p) => p.shotsFired >= MIN_SHOTS_FOR_ACCURACY,
    requirement: `At least ${MIN_SHOTS_FOR_ACCURACY} shots fired, so a lucky handful cannot top the table.`,
  },
  {
    key: "flag-hold",
    label: "Time carrying",
    blurb: "How long they have held an enemy flag, in total.",
    value: (p) => (p.flagHoldMs > 0 ? p.flagHoldMs : null),
    format: (v) => clock(v),
    direction: "high",
    qualifies: () => true,
    requirement: null,
  },
  {
    key: "returns",
    label: "Flag returns",
    blurb: "Own flag recovered before the other side could score with it.",
    value: (p) => (p.flagReturns > 0 ? p.flagReturns : null),
    format: (v) => `${v}`,
    direction: "high",
    qualifies: () => true,
    requirement: null,
  },
  {
    key: "streak",
    label: "Best streak",
    blurb: "Most frags in a row without dying, in a single match.",
    value: (p) => (p.bestStreak > 0 ? p.bestStreak : null),
    format: (v) => `${v}`,
    direction: "high",
    qualifies: () => true,
    requirement: null,
  },
  {
    key: "solo-caps",
    label: "Solo captures",
    blurb: "Flags carried the whole way without a hand-off.",
    value: (p) => (p.soloCaps > 0 ? p.soloCaps : null),
    format: (v) => `${v}`,
    direction: "high",
    qualifies: () => true,
    requirement: null,
  },
  {
    key: "fastest-cap",
    label: "Fastest capture",
    blurb: "Quickest a flag has gone from their hands to their base.",
    value: (p) => p.fastestCaptureMs,
    format: (v) => `${(v / 1000).toFixed(1)}s`,
    // The one board where a smaller number wins.
    direction: "low",
    qualifies: (p) => (p.fastestCaptureMs ?? 0) > 0,
    requirement: null,
  },
  {
    key: "damage",
    label: "Damage dealt",
    blurb: "Total damage given, which rewards pressure that never lands a frag.",
    value: (p) => (p.damageGiven > 0 ? Math.round(p.damageGiven) : null),
    format: (v) => v.toLocaleString("en-GB"),
    direction: "high",
    qualifies: () => true,
    requirement: null,
  },
  {
    key: "frags-per-match",
    label: "Frags per match",
    blurb: "Rewards playing well rather than playing often.",
    value: (p) => (p.matchesPlayed > 0 ? p.kills / p.matchesPlayed : null),
    format: (v) => v.toFixed(1),
    direction: "high",
    qualifies: (p) => p.matchesPlayed >= MIN_MATCHES_FOR_RATE,
    requirement: `At least ${MIN_MATCHES_FOR_RATE} matches, because an average over one match is just that match.`,
  },
  {
    key: "captures-per-match",
    label: "Captures per match",
    blurb: "How often they take a flag home, regardless of how many nights they play.",
    value: (p) => (p.matchesPlayed > 0 ? p.caps / p.matchesPlayed : null),
    format: (v) => v.toFixed(2),
    direction: "high",
    qualifies: (p) => p.matchesPlayed >= MIN_MATCHES_FOR_RATE,
    requirement: `At least ${MIN_MATCHES_FOR_RATE} matches, because an average over one match is just that match.`,
  },
  {
    key: "frags-per-death",
    label: "Frags per death",
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
