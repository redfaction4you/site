/**
 * Tests for pairings.
 *
 *   npm test
 *
 * Three things here are correctness rather than presentation.
 *
 * A pairing must land in the same bucket however the scoreboard was sorted,
 * because two people who appear as "a and b" in one match and "b and a" in the
 * next are one pairing and counting them as two would halve every record on the
 * page.
 *
 * A match with no winner is not a loss. The archive holds matches that never
 * finished, and a pairing whose record silently counted those as defeats would
 * be describing people as worse than they were.
 *
 * And a win rate has to actually be withheld below the bar. A percentage from
 * two games is the failure this module is shaped to avoid, exactly as the
 * accuracy board is shaped around somebody who fired four shots.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  MIN_MATCHES_FOR_PAIR_RATE,
  buildPairings,
  mostPlayedWith,
  pairingsFor,
} from "../src/lib/matches/pairings.ts";

/**
 * One match, as appearances.
 *
 * `red` and `blue` are name lists, so a test reads as the line-up it is about.
 */
function match(id, { red = [], blue = [], winner = null, other = [], day } = {}) {
  const on = day === undefined ? {} : { archiveDay: day };
  return [
    ...red.map((name) => ({ matchId: id, name, team: "red", winner, ...on })),
    ...blue.map((name) => ({ matchId: id, name, team: "blue", winner, ...on })),
    ...other.map(({ name, team }) => ({ matchId: id, name, team, winner, ...on })),
  ];
}

const partnership = (pairings, a, b) =>
  pairings.partnerships.find(
    (entry) =>
      (entry.a.toLowerCase() === a && entry.b.toLowerCase() === b) ||
      (entry.a.toLowerCase() === b && entry.b.toLowerCase() === a),
  );

const rivalry = (pairings, a, b) =>
  pairings.rivalries.find(
    (entry) =>
      (entry.a.toLowerCase() === a && entry.b.toLowerCase() === b) ||
      (entry.a.toLowerCase() === b && entry.b.toLowerCase() === a),
  );

/* --- the two relationships ----------------------------------------------- */

test("players on the same side make a partnership, not a rivalry", () => {
  const pairings = buildPairings(
    match("m1", { red: ["Ada", "Bo"], blue: ["Cy"], winner: "red" }),
  );

  assert.equal(partnership(pairings, "ada", "bo").matches, 1);
  assert.equal(partnership(pairings, "ada", "bo").wins, 1);
  assert.equal(rivalry(pairings, "ada", "bo"), undefined);
});

test("players on opposite sides make a rivalry, not a partnership", () => {
  const pairings = buildPairings(match("m1", { red: ["Ada"], blue: ["Cy"] }));

  assert.equal(rivalry(pairings, "ada", "cy").matches, 1);
  assert.equal(partnership(pairings, "ada", "cy"), undefined);
});

test("the same two people can have both, because sides get reshuffled", () => {
  const pairings = buildPairings([
    ...match("m1", { red: ["Ada", "Bo"], blue: ["Cy"], winner: "red" }),
    ...match("m2", { red: ["Ada"], blue: ["Bo", "Cy"], winner: "blue" }),
  ]);

  assert.equal(partnership(pairings, "ada", "bo").matches, 1);
  assert.equal(rivalry(pairings, "ada", "bo").matches, 1);
});

/* --- the pair is unordered ------------------------------------------------ */

test("a pairing is one bucket however the scoreboard was sorted", () => {
  // The names arrive in the opposite order the second time. Counting these as
  // two pairings would halve every record on the page.
  const pairings = buildPairings([
    ...match("m1", { red: ["Ada", "Bo"], blue: ["Cy"], winner: "red" }),
    { matchId: "m2", name: "Bo", team: "red", winner: "red" },
    { matchId: "m2", name: "Ada", team: "red", winner: "red" },
    { matchId: "m2", name: "Cy", team: "blue", winner: "red" },
  ]);

  assert.equal(pairings.partnerships.filter((p) => p.matches === 2).length, 1);
  assert.equal(partnership(pairings, "ada", "bo").matches, 2);
});

test("case drift does not split a player in two", () => {
  const pairings = buildPairings([
    ...match("m1", { red: ["Ada", "Bo"], winner: "red" }),
    ...match("m2", { red: ["ADA", "Bo"], winner: "red" }),
  ]);

  assert.equal(pairings.partnerships.length, 1);
  assert.equal(pairings.partnerships[0].matches, 2);
  // The spelling shown matches what every player query displays, `min(name)`,
  // so a player is not "Ada" on their own page and "ADA" in somebody's table.
  const shown = [pairings.partnerships[0].a, pairings.partnerships[0].b];
  assert.ok(shown.includes("ADA"), `expected min(name) spelling, got ${shown}`);
});

/* --- results -------------------------------------------------------------- */

test("a match with no winner is undecided, not a loss", () => {
  const pairings = buildPairings(
    match("m1", { red: ["Ada", "Bo"], blue: ["Cy"], winner: null }),
  );

  const pair = partnership(pairings, "ada", "bo");
  assert.equal(pair.matches, 1);
  assert.equal(pair.losses, 0);
  assert.equal(pair.wins, 0);
  assert.equal(pair.undecided, 1);
});

test("a rivalry splits its wins between the two sides", () => {
  const pairings = buildPairings([
    ...match("m1", { red: ["Ada"], blue: ["Cy"], winner: "red" }),
    ...match("m2", { red: ["Ada"], blue: ["Cy"], winner: "blue" }),
    ...match("m3", { red: ["Ada"], blue: ["Cy"], winner: "blue" }),
  ]);

  const pair = rivalry(pairings, "ada", "cy");
  assert.equal(pair.matches, 3);
  assert.equal(pair.aWins + pair.bWins, 3);
  // Whichever way round they are stored, Cy took two of the three.
  const cyWins = pair.a.toLowerCase() === "cy" ? pair.aWins : pair.bWins;
  assert.equal(cyWins, 2);
});

test("a winner that is neither of their sides decides nothing", () => {
  // Should not happen, and if it does it is not a win for one of them.
  const pairings = buildPairings(
    match("m1", { red: ["Ada"], blue: ["Cy"], winner: "green" }),
  );

  const pair = rivalry(pairings, "ada", "cy");
  assert.equal(pair.aWins, 0);
  assert.equal(pair.bWins, 0);
  assert.equal(pair.undecided, 1);
});

/* --- the rate bar --------------------------------------------------------- */

test("a win rate is withheld until there are enough decided matches", () => {
  const below = buildPairings(
    Array.from({ length: MIN_MATCHES_FOR_PAIR_RATE - 1 }, (_, i) =>
      match(`m${i}`, { red: ["Ada", "Bo"], winner: "red" }),
    ).flat(),
  );

  assert.equal(partnership(below, "ada", "bo").winRate, null);
  assert.equal(partnership(below, "ada", "bo").wins, MIN_MATCHES_FOR_PAIR_RATE - 1);
});

test("a win rate appears once the bar is met", () => {
  const at = buildPairings(
    Array.from({ length: MIN_MATCHES_FOR_PAIR_RATE }, (_, i) =>
      match(`m${i}`, { red: ["Ada", "Bo"], winner: i === 0 ? null : "red" }),
    ).flat(),
  );

  // One of them had no winner, so the bar is not met on decided matches yet.
  assert.equal(partnership(at, "ada", "bo").winRate, null);

  const more = buildPairings(
    Array.from({ length: MIN_MATCHES_FOR_PAIR_RATE }, (_, i) =>
      match(`m${i}`, { red: ["Ada", "Bo"], winner: "red" }),
    ).flat(),
  );

  assert.equal(partnership(more, "ada", "bo").winRate, 1);
});

test("the rate is over decided matches, so an unfinished one cannot drag it down", () => {
  const rows = [
    ...Array.from({ length: MIN_MATCHES_FOR_PAIR_RATE }, (_, i) =>
      match(`m${i}`, { red: ["Ada", "Bo"], winner: "red" }),
    ).flat(),
    ...match("void", { red: ["Ada", "Bo"], winner: null }),
  ];

  const pair = partnership(buildPairings(rows), "ada", "bo");
  assert.equal(pair.matches, MIN_MATCHES_FOR_PAIR_RATE + 1);
  assert.equal(pair.winRate, 1);
});

/* --- defensive ------------------------------------------------------------ */

test("a player with no recorded side makes no pairing at all", () => {
  // Guessing a side would invent the only fact a pairing rests on.
  const pairings = buildPairings([
    ...match("m1", { red: ["Ada"], other: [{ name: "Ghost", team: "" }] }),
  ]);

  assert.equal(pairings.partnerships.length, 0);
  assert.equal(pairings.rivalries.length, 0);
});

test("a player listed twice in one match is counted once", () => {
  const pairings = buildPairings([
    { matchId: "m1", name: "Ada", team: "red", winner: "red" },
    { matchId: "m1", name: "Ada", team: "red", winner: "red" },
    { matchId: "m1", name: "Bo", team: "red", winner: "red" },
  ]);

  assert.equal(pairings.partnerships.length, 1);
  assert.equal(pairings.partnerships[0].matches, 1);
});

test("nothing in, nothing out", () => {
  const pairings = buildPairings([]);
  assert.deepEqual(pairings, { partnerships: [], rivalries: [] });
});

/* --- one player's view ---------------------------------------------------- */

test("a player's pairings are turned around to their point of view", () => {
  const pairings = buildPairings([
    ...match("m1", { red: ["Ada", "Bo"], blue: ["Cy"], winner: "blue" }),
    ...match("m2", { red: ["Ada"], blue: ["Cy"], winner: "red" }),
  ]);

  const view = pairingsFor("Cy", pairings);

  assert.equal(view.alongside.length, 0);
  assert.equal(view.against.length, 2);

  const versusAda = view.against.find((entry) => entry.opponent === "Ada");
  assert.equal(versusAda.matches, 2);
  // Cy won the first and lost the second, from Cy's side of it.
  assert.equal(versusAda.won, 1);
  assert.equal(versusAda.lost, 1);
});

test("the view works whichever half of the stored pair the player is", () => {
  const pairings = buildPairings(
    match("m1", { red: ["Ada"], blue: ["Zed"], winner: "red" }),
  );

  assert.equal(pairingsFor("Ada", pairings).against[0].won, 1);
  assert.equal(pairingsFor("Zed", pairings).against[0].won, 0);
  assert.equal(pairingsFor("Zed", pairings).against[0].lost, 1);
});

test("a name that never played gets empty lists rather than an error", () => {
  const pairings = buildPairings(match("m1", { red: ["Ada", "Bo"] }));
  assert.deepEqual(pairingsFor("Nobody", pairings), { alongside: [], against: [] });
});

test("partnerships come back most played first", () => {
  const pairings = buildPairings([
    ...match("m1", { red: ["Ada", "Bo"], winner: "red" }),
    ...match("m2", { red: ["Ada", "Bo"], winner: "red" }),
    ...match("m3", { red: ["Ada", "Cy"], winner: "red" }),
  ]);

  const view = pairingsFor("Ada", pairings);
  assert.equal(view.alongside[0].partner, "Bo");
  assert.equal(view.alongside[0].matches, 2);
});

/* --- the one line version ------------------------------------------------- */

test("the most played partner is the one with the most matches", () => {
  const pairings = buildPairings([
    ...match("m1", { red: ["Ada", "Bo"], winner: "red" }),
    ...match("m2", { red: ["Ada", "Bo"], winner: "red" }),
    ...match("m3", { red: ["Ada", "Cy"], winner: "red" }),
  ]);

  assert.equal(mostPlayedWith(pairingsFor("Ada", pairings).alongside).partner, "Bo");
});

test("a tie has no most played partner, rather than an arbitrary one", () => {
  const pairings = buildPairings([
    ...match("m1", { red: ["Ada", "Bo"], winner: "red" }),
    ...match("m2", { red: ["Ada", "Cy"], winner: "red" }),
  ]);

  assert.equal(mostPlayedWith(pairingsFor("Ada", pairings).alongside), null);
});

test("no partners at all is null, not a crash", () => {
  assert.equal(mostPlayedWith([]), null);
});

/* --- the arc of a partnership -------------------------------------------- */

test("a partnership carries the first and last night it happened", () => {
  const pairings = buildPairings([
    ...match("m2", { red: ["Ada", "Bo"], day: "2026-07-30" }),
    ...match("m1", { red: ["Ada", "Bo"], day: "2026-07-28" }),
    ...match("m3", { red: ["Ada", "Bo"], day: "2026-07-29" }),
  ]);

  const pair = partnership(pairings, "ada", "bo");
  assert.equal(pair.firstNight, "2026-07-28");
  assert.equal(pair.lastNight, "2026-07-30");
});

test("one night is both the first and the last", () => {
  const pairings = buildPairings(
    match("m1", { red: ["Ada", "Bo"], day: "2026-07-28" }),
  );

  const pair = partnership(pairings, "ada", "bo");
  assert.equal(pair.firstNight, "2026-07-28");
  assert.equal(pair.lastNight, "2026-07-28");
});

test("appearances without dates leave the arc null rather than guessing", () => {
  const pairings = buildPairings(match("m1", { red: ["Ada", "Bo"] }));

  const pair = partnership(pairings, "ada", "bo");
  assert.equal(pair.firstNight, null);
  assert.equal(pair.lastNight, null);
});

/**
 * The bug this whole arrangement exists to stop.
 *
 * One person, two names, and the arc counted per name said the pairing started
 * on the night they changed it. The record beside it said eleven matches. The
 * caller hands appearances in already named per person, so the arc has to be
 * built from the same rows the record is.
 */
test("the arc covers every match the record covers, under any name", () => {
  const pairings = buildPairings([
    ...match("m1", { red: ["Skuldug", "Ada"], day: "2026-07-20" }),
    ...match("m2", { red: ["Skuldug", "Ada"], day: "2026-07-31" }),
  ]);

  const pair = partnership(pairings, "skuldug", "ada");
  assert.equal(pair.matches, 2);
  assert.equal(pair.firstNight, "2026-07-20");
});

test("a rivalry is not given an arc, since only partnerships print one", () => {
  const pairings = buildPairings(
    match("m1", { red: ["Ada"], blue: ["Bo"], day: "2026-07-28" }),
  );

  assert.equal(partnership(pairings, "ada", "bo"), undefined);
  assert.equal(rivalry(pairings, "ada", "bo").matches, 1);
});
