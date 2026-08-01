/**
 * Checking a night's data against itself, every time it arrives.
 *
 * Everything wrong that has been found on this site was found by a person
 * reading a page and noticing. A capture that took 2.2 seconds. A column
 * crediting a team that never existed. A "session high" accuracy that was not
 * the highest. Each was fixed where it surfaced, which fixes that one and leaves
 * the next to be spotted the same way, by luck.
 *
 * This is the same work done up front and on purpose. The archive holds the same
 * facts twice over in most cases: a scoreboard and an event log, a score and a
 * list of captures, shots hit and shots fired. Where two records of one fact
 * disagree, something is wrong and it can be said so without knowing which is
 * right.
 *
 * Nothing here throws or discards data. A night that fails is still stored,
 * because a flawed record of an evening is worth more than no record and the
 * ingest must not be breakable by a surprising number. The checks write to the
 * log, and what they catch is what stops the writing repeating it.
 *
 * Deliberately free of imports so `node --test` can load it directly.
 */

export type Severity = "error" | "note";

export type Anomaly = {
  /** Stable identifier, so a recurring problem is greppable. */
  check: string;
  severity: Severity;
  detail: string;
};

export type VettableMatch = {
  sourceMatchId: string | number;
  mapName: string;
  redScore: number;
  blueScore: number;
  winner: string | null;
  players: {
    name: string;
    team: string;
    spectator: boolean;
    kills: number;
    deaths: number;
    caps: number;
    shotsHit: number;
    shotsFired: number;
    fastestCaptureMs: number | null;
    soloCaps: number;
    relayCaps: number;
  }[];
  captures: { team: string; playerName: string | null }[];
  /** How long it actually ran. Null when the server sent no clock. */
  durationSeconds: number | null;
};

/**
 * Below this a match did not finish.
 *
 * Regulation here is ten minutes and the archive says so exactly: every
 * completed match on record ran 600 seconds, with overtime running on to 640,
 * 718, 763, 870. There is nothing in between. A match that ran 30 seconds was
 * cancelled and restarted, and it arrives labelled `final` like every other, so
 * status cannot be the test.
 *
 * Half of regulation rather than just under it, deliberately. A tighter bound
 * would be a number fitted to the two values seen so far, and it would start
 * failing the day somebody runs a five minute match on purpose. Everything this
 * is meant to catch, an abandoned start, is far below it.
 */
const MIN_PLAUSIBLE_SECONDS = 300;

/**
 * Below this an unrelayed capture time is not describing a flag run.
 *
 * Five seconds, and the number is a claim about the game rather than a fit to
 * the data. An unrelayed capture means one player took the flag off the enemy
 * stand and carried it to their own, and there is no CTF map where that journey
 * takes less than a few seconds. Two seconds was the previous figure and it was
 * chosen badly: it let 2.2 seconds through, which is the value that was actually
 * on the site being wrong.
 *
 * The recorded distribution agrees without having been consulted first. Nothing
 * unrelayed falls between 2.2 and 11.1 seconds, so the floor sits in an empty
 * gap rather than cutting through real runs.
 *
 * Relays are exempt and always were. A relay hands the flag over beside the
 * stand, so the last carrier's fraction of a second is a true measurement of a
 * hand-off rather than a claim about a run.
 */
const IMPLAUSIBLE_SOLO_CAPTURE_MS = 5000;

const active = (match: VettableMatch) => match.players.filter((p) => !p.spectator);

/** Every check, run over one match. */
function vetMatch(match: VettableMatch): Anomaly[] {
  const found: Anomaly[] = [];
  const where = `match ${match.sourceMatchId} on ${match.mapName}`;
  const players = active(match);

  /*
   * The scoreboard and the event log should agree about how many flags went
   * home. They are recorded separately, so a disagreement means one of them is
   * wrong and anything written from either is suspect.
   */
  /*
   * A match that did not last is not a match.
   *
   * The server sends abandoned starts labelled `final`, identically to games
   * that ran their full ten minutes, so nothing downstream could tell them
   * apart. One arrived at 30 seconds, nil nil, and was written about as a real
   * result. Detection existed for eight other kinds of wrong and not for the one
   * a reader spotted first.
   */
  if (
    match.durationSeconds !== null &&
    match.durationSeconds < MIN_PLAUSIBLE_SECONDS
  ) {
    found.push({
      check: "match-too-short",
      severity: "error",
      detail:
        `${where}: ran ${match.durationSeconds}s, which is too short to have finished. ` +
        `Regulation is ten minutes, so this was almost certainly cancelled and restarted.`,
    });
  }

  const scoreboardCaps = players.reduce((total, p) => total + p.caps, 0);
  if (scoreboardCaps !== match.captures.length) {
    found.push({
      check: "caps-disagree-with-capture-log",
      severity: "error",
      detail: `${where}: the scoreboard totals ${scoreboardCaps} captures, the event log has ${match.captures.length}`,
    });
  }

  // And the score is a third record of the same thing.
  const total = match.redScore + match.blueScore;
  if (total !== match.captures.length) {
    found.push({
      check: "score-disagrees-with-capture-log",
      severity: "error",
      detail: `${where}: the score is ${match.redScore}-${match.blueScore} but the event log has ${match.captures.length} captures`,
    });
  }

  // The winner is derivable, so it can be checked rather than trusted.
  const expected =
    match.redScore > match.blueScore
      ? "red"
      : match.blueScore > match.redScore
        ? "blue"
        : null;
  if (expected !== null && match.winner && match.winner !== expected) {
    found.push({
      check: "winner-disagrees-with-score",
      severity: "error",
      detail: `${where}: recorded winner is ${match.winner} but the score is ${match.redScore}-${match.blueScore}`,
    });
  }

  for (const player of players) {
    if (player.shotsHit > player.shotsFired) {
      found.push({
        check: "hits-exceed-shots",
        severity: "error",
        detail: `${where}: ${player.name} is recorded with ${Math.round(player.shotsHit)} hits from ${Math.round(player.shotsFired)} shots`,
      });
    }

    /*
     * The 2.2 second capture, caught where it enters rather than where it is
     * printed. Relayed captures are exempt and always were: the tiny number is
     * real, it just measures a hand-off rather than a run.
     */
    const ms = player.fastestCaptureMs ?? 0;
    if (ms > 0 && ms < IMPLAUSIBLE_SOLO_CAPTURE_MS && player.relayCaps === 0) {
      found.push({
        check: "implausible-solo-capture",
        severity: "error",
        detail: `${where}: ${player.name} is recorded with an unrelayed capture in ${(ms / 1000).toFixed(2)}s`,
      });
    }

    if (player.soloCaps + player.relayCaps > player.caps) {
      found.push({
        check: "capture-kinds-exceed-captures",
        severity: "error",
        detail: `${where}: ${player.name} has ${player.caps} captures but ${player.soloCaps} solo plus ${player.relayCaps} relay`,
      });
    }

    if (player.kills < 0 || player.deaths < 0 || player.caps < 0) {
      found.push({
        check: "negative-counter",
        severity: "error",
        detail: `${where}: ${player.name} has a negative counter`,
      });
    }
  }

  // Captures credited to somebody who was not on the scoreboard.
  const known = new Set(players.map((p) => p.name.toLowerCase()));
  for (const capture of match.captures) {
    if (capture.playerName && !known.has(capture.playerName.toLowerCase())) {
      found.push({
        check: "capture-by-unknown-player",
        severity: "error",
        detail: `${where}: a capture is credited to ${capture.playerName}, who is not on the scoreboard`,
      });
    }
  }

  return found;
}

/**
 * Checks a whole night, including the things only visible across matches.
 *
 * Returns everything it found, worst first, so a caller can log the lot and a
 * reader of that log sees the errors before the notes.
 */
export function vetNight(archiveDay: string, matches: VettableMatch[]): Anomaly[] {
  const found = matches.flatMap(vetMatch);

  /*
   * Whether each side was the same people all night.
   *
   * A note rather than an error: it is not a fault in the data, it is a fact
   * about the evening that changes what can honestly be written about it. Red
   * and blue are shirt colours that get reshuffled, and a column that talks
   * about a colour as a team with a run of form is describing something that did
   * not exist. `buildNightFacts` tells the writer the same thing; this makes it
   * visible in the log too.
   */
  const roster = (names: string[]) =>
    [...names].map((name) => name.toLowerCase()).sort().join("|");

  const sideOf = (match: VettableMatch, team: string) =>
    roster(active(match).filter((p) => p.team === team).map((p) => p.name));

  for (const team of ["red", "blue"]) {
    const seen = new Set(matches.map((match) => sideOf(match, team)));
    if (matches.length > 1 && seen.size > 1) {
      found.push({
        check: "side-reshuffled",
        severity: "note",
        detail: `${archiveDay}: ${team} was not the same players in every match, so it cannot be written about as a team`,
      });
    }
  }

  const order = { error: 0, note: 1 } as const;
  return found.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** One line summarising a vet, for the ingest response. */
export function summarise(found: Anomaly[]): string {
  const errors = found.filter((a) => a.severity === "error").length;
  const notes = found.length - errors;
  if (errors === 0 && notes === 0) return "clean";
  return `${errors} error${errors === 1 ? "" : "s"}, ${notes} note${notes === 1 ? "" : "s"}`;
}
