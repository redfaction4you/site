/**
 * Tests for the stats table's column measuring.
 *
 *   npm test
 *
 * The case this exists for is real and was live: two identity keys both
 * displaying "EasyOnMe", because the same person's address changed and the
 * merge had not been made yet. The table keyed each column's figures by the
 * lowercased display name, so the second row overwrote the first and both
 * printed 147 frags across 4 matches when one of them had played 599 across 15.
 *
 * What makes it worth a test rather than a fix is how it hid. Sixteen columns
 * agreed with each other and were wrong together, which reads as correct. Only
 * the win rate disagreed, because it is the one board whose format reads the
 * player as well as the value, so it published "50% (10-5)" -- a record and a
 * percentage that cannot both be true. Nothing else on the page contradicted
 * itself.
 *
 * So what is pinned here is not the arithmetic. It is that two rows sharing a
 * name keep their own figures, through measuring and through sorting.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { measureColumns, orderRows } from "../src/lib/matches/stat-columns.ts";

function player(overrides = {}) {
  return {
    name: "Someone",
    matchesPlayed: 4,
    kills: 100,
    deaths: 100,
    caps: 2,
    score: 120,
    shotsHit: 100,
    shotsFired: 1000,
    damageGiven: 5000,
    damageTaken: 5000,
    flagHoldMs: 60_000,
    flagReturns: 1,
    bestStreak: 5,
    fastestCaptureMs: 20_000,
    soloCaps: 1,
    relayCaps: 0,
    leadCarries: 0,
    wins: 2,
    decided: 4,
    flagPickups: 3,
    ...overrides,
  };
}

/** A board reading one field, with everything else left ordinary. */
function board(overrides = {}) {
  return {
    key: "frags",
    group: "fighting",
    label: "Frags",
    short: "Frags",
    blurb: "",
    value: (p) => p.kills,
    format: (v) => String(v),
    direction: "high",
    qualifies: () => true,
    requirement: null,
    ...overrides,
  };
}

/* --- the bug ------------------------------------------------------------- */

test("two players sharing a name keep their own figures", () => {
  // Exactly the live case: one person, two unmerged identity keys, one name.
  const players = [
    player({ name: "EasyOnMe", kills: 599, matchesPlayed: 15 }),
    player({ name: "EasyOnMe", kills: 147, matchesPlayed: 4 }),
  ];

  const measured = measureColumns(players, [board()]);

  assert.deepEqual(measured.get("frags").values, [599, 147]);
});

test("a shared name does not collapse two rows into one", () => {
  const players = [
    player({ name: "EasyOnMe", kills: 599 }),
    player({ name: "EasyOnMe", kills: 147 }),
  ];

  const values = measureColumns(players, [board()]).get("frags").values;

  assert.equal(values.length, 2, "both rows must be measured");
  assert.notEqual(values[0], values[1], "one row's figure must not overwrite the other's");
});

test("case is not what separates them either", () => {
  // The old key was `name.toLowerCase()`, so these collided too.
  const players = [
    player({ name: "EasyOnMe", kills: 599 }),
    player({ name: "EASYONME", kills: 147 }),
  ];

  assert.deepEqual(measureColumns(players, [board()]).get("frags").values, [599, 147]);
});

test("sorting keeps every row with its own figure", () => {
  const players = [
    player({ name: "EasyOnMe", kills: 147 }),
    player({ name: "Someone", kills: 900 }),
    player({ name: "EasyOnMe", kills: 599 }),
  ];

  const measured = measureColumns(players, [board()]);
  const rows = orderRows(players, measured.get("frags"), "desc");

  // The value each row carries after sorting is still the one it came with.
  const seen = rows.map((row) => [row.player.kills, measured.get("frags").values[row.index]]);
  for (const [own, shown] of seen) assert.equal(shown, own);
  assert.deepEqual(rows.map((row) => row.player.kills), [900, 599, 147]);
});

/* --- ordering ------------------------------------------------------------ */

test("a column sorts both ways", () => {
  const players = [player({ kills: 10 }), player({ kills: 30 }), player({ kills: 20 })];
  const measured = measureColumns(players, [board()]);

  const down = orderRows(players, measured.get("frags"), "desc");
  const up = orderRows(players, measured.get("frags"), "asc");

  assert.deepEqual(down.map((r) => r.player.kills), [30, 20, 10]);
  assert.deepEqual(up.map((r) => r.player.kills), [10, 20, 30]);
});

test("nothing recorded sorts last whichever way the column runs", () => {
  // An absence is not a low score: somebody with no flag returns must not head
  // the returns board just because it is being read upwards.
  const players = [
    player({ name: "None", flagReturns: 0 }),
    player({ name: "Few", flagReturns: 2 }),
    player({ name: "Many", flagReturns: 9 }),
  ];
  const returns = board({
    key: "returns",
    value: (p) => (p.flagReturns > 0 ? p.flagReturns : null),
  });
  const column = measureColumns(players, [returns]).get("returns");

  assert.equal(orderRows(players, column, "desc").at(-1).player.name, "None");
  assert.equal(orderRows(players, column, "asc").at(-1).player.name, "None");
});

test("the input order is left alone", () => {
  // `orderRows` returns a new list; a caller reusing `players` afterwards must
  // not find it rearranged underneath them.
  const players = [player({ kills: 10 }), player({ kills: 30 })];
  orderRows(players, measureColumns(players, [board()]).get("frags"), "desc");

  assert.deepEqual(players.map((p) => p.kills), [10, 30]);
});

/* --- the leader ---------------------------------------------------------- */

test("the leader ignores anybody below the bar", () => {
  const players = [
    player({ name: "Qualified", kills: 300, matchesPlayed: 10 }),
    player({ name: "One match", kills: 900, matchesPlayed: 1 }),
  ];
  const qualified = board({ qualifies: (p) => p.matchesPlayed >= 3 });

  const column = measureColumns(players, [qualified]).get("frags");

  // Measured and shown, just not allowed to set the mark.
  assert.deepEqual(column.values, [300, 900]);
  assert.equal(column.leader, 300);
});

test("a board nobody qualifies for has no leader", () => {
  const players = [player({ matchesPlayed: 1 })];
  const column = measureColumns(players, [board({ qualifies: () => false })]).get("frags");

  assert.equal(column.leader, null);
});

test("a board read upwards is led by its smallest figure", () => {
  const players = [player({ kills: 10 }), player({ kills: 30 })];
  const column = measureColumns(players, [board({ direction: "low" })]).get("frags");

  assert.equal(column.leader, 10);
});

/* --- unusable figures ---------------------------------------------------- */

test("a figure that is not finite is an absence, not a number", () => {
  const players = [player({ deaths: 0, kills: 5 })];
  const ratio = board({ value: (p) => p.kills / p.deaths });

  const column = measureColumns(players, [ratio]).get("frags");

  assert.equal(column.values[0], null, "Infinity must not reach a page");
  assert.equal(column.leader, null);
});

test("an empty table measures without falling over", () => {
  const column = measureColumns([], [board()]).get("frags");

  assert.deepEqual(column.values, []);
  assert.equal(column.leader, null);
  assert.deepEqual(orderRows([], column, "desc"), []);
});
