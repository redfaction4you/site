/**
 * Tests for the stat boards.
 *
 *   npm test
 *
 * Two things here are correctness rather than presentation. Ties must share a
 * rank and skip the next one, because a table that numbers two equal players 1
 * and 2 is quietly lying about which of them was better. And qualification has to
 * actually exclude: an accuracy board topped by somebody who fired four shots is
 * the failure this whole module is shaped to avoid.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  BOARDS,
  boardByKey,
  clock,
  contextFor,
  rank,
} from "../src/lib/matches/leaderboards.ts";

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
    ...overrides,
  };
}

const board = (key) => boardByKey(key);

/* --- ranking ------------------------------------------------------------- */

test("the highest value comes first on a high board", () => {
  const entries = rank(
    [player({ name: "low", kills: 10 }), player({ name: "high", kills: 90 })],
    board("frags"),
  );

  assert.equal(entries[0].player.name, "high");
  assert.equal(entries[0].rank, 1);
});

test("fastest capture ranks the other way round", () => {
  const entries = rank(
    [
      player({ name: "slow", fastestCaptureMs: 40_000 }),
      player({ name: "quick", fastestCaptureMs: 9_000 }),
    ],
    board("fastest-cap"),
  );

  assert.equal(entries[0].player.name, "quick");
  assert.equal(entries[0].display, "9.0s");
});

test("ties share a rank and the next place is skipped", () => {
  const entries = rank(
    [
      player({ name: "a", kills: 50 }),
      player({ name: "b", kills: 50 }),
      player({ name: "c", kills: 10 }),
    ],
    board("frags"),
  );

  assert.deepEqual(
    entries.map((e) => [e.player.name, e.rank]),
    [["a", 1], ["b", 1], ["c", 3]],
  );
  assert.equal(entries[1].tied, true);
  assert.equal(entries[2].tied, false);
});

/* --- qualification ------------------------------------------------------- */

test("accuracy excludes anyone who has barely fired", () => {
  const entries = rank(
    [
      player({ name: "lucky", shotsFired: 4, shotsHit: 3 }),
      player({ name: "real", shotsFired: 1000, shotsHit: 190 }),
    ],
    board("accuracy"),
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0].player.name, "real");
  assert.equal(entries[0].display, "19.0%");
});

test("frags per death needs more than one night", () => {
  const entries = rank(
    [
      player({ name: "oneoff", matchesPlayed: 1, kills: 40, deaths: 1 }),
      player({ name: "regular", matchesPlayed: 6, kills: 100, deaths: 80 }),
    ],
    board("frags-per-death"),
  );

  assert.deepEqual(entries.map((e) => e.player.name), ["regular"]);
});

test("every board with a bar explains it, and every board without has none", () => {
  for (const b of BOARDS) {
    const unqualified = b.qualifies(player({ matchesPlayed: 1, shotsFired: 1 }));
    if (!unqualified) {
      assert.ok(b.requirement, `${b.key} excludes people without saying why`);
    }
  }
});

test("a player with nothing to show is left off rather than ranked zero", () => {
  // Somebody who has never held a flag does not belong on the carrying board at
  // all. Ranking them last on nil reads as a judgement rather than an absence.
  const entries = rank(
    [player({ name: "never", flagHoldMs: 0 }), player({ name: "did", flagHoldMs: 5000 })],
    board("flag-hold"),
  );

  assert.deepEqual(entries.map((e) => e.player.name), ["did"]);
});

test("an empty field produces an empty board rather than throwing", () => {
  for (const b of BOARDS) {
    assert.deepEqual(rank([], b), []);
  }
});

/* --- the sample behind a figure ------------------------------------------ */

test("every board can say what its figure was measured over", () => {
  for (const b of BOARDS) {
    const context = contextFor(b);
    const value = context.of(player());
    assert.equal(typeof value, "number", `${b.key} has no numeric sample`);
    assert.ok(context.format(value).length > 0, `${b.key} formats its sample to nothing`);
    assert.ok(context.label.length > 0);
  }
});

test("accuracy is sampled in shots, because shots are what its bar counts", () => {
  // The board page sorts the people it excludes by this, closest to qualifying
  // first, which only works while it is the same quantity the bar is set in.
  const context = contextFor(board("accuracy"));
  assert.equal(context.of(player({ shotsFired: 2000 })), 2000);
  assert.equal(context.format(2000), "2,000");
});

/* --- formatting ---------------------------------------------------------- */

test("durations read as minutes and seconds", () => {
  assert.equal(clock(0), "0:00");
  assert.equal(clock(9_000), "0:09");
  assert.equal(clock(69_000), "1:09");
  assert.equal(clock(3_600_000), "60:00");
});

test("every board formats without throwing on a real-looking player", () => {
  for (const b of BOARDS) {
    const value = b.value(player());
    if (value === null) continue;
    const shown = b.format(value, player());
    assert.equal(typeof shown, "string");
    assert.ok(shown.length > 0, `${b.key} formatted to nothing`);
  }
});

test("board keys are unique and url safe", () => {
  const keys = BOARDS.map((b) => b.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) assert.match(key, /^[a-z0-9-]+$/);
});

test("an unknown board key returns null rather than undefined", () => {
  assert.equal(boardByKey("nonsense"), null);
});
