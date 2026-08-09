/**
 * Tests for the accuracy rule.
 *
 *   npm test
 *
 * The case this exists for is real and is on record: match 15 on Rail Fight,
 * where the server reported SiD with 1804 hits from 169 shots and the site
 * published 1067% accuracy. `vet.ts` had been reporting `hits-exceed-shots`
 * about it the whole time and nothing acted on it.
 *
 * What must hold is that an impossible record produces no number at all. Not a
 * clamped 100%, which would put a broken counter top of the accuracy board, and
 * not a zero, which would read as somebody who never hit anything.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  UNSOUND_SHOOTING_NOTE,
  accuracyOf,
  accuracyPercent,
  shootingIsSound,
} from "../src/lib/matches/accuracy.ts";

/* --- the fraction, written out -------------------------------------------- */

/*
 * The other way this module gets a figure wrong, and it had happened twice.
 * `accuracyOf` returns a fraction, and a caller that prints it without the
 * hundred publishes "0.2%" for somebody shooting a fifth of their shots. That
 * was live on /stats/dm and in the fact sheet the feature writer and the fact
 * checker both read.
 */
test("an accuracy is written as a percentage, not as its fraction", () => {
  assert.equal(accuracyPercent(accuracyOf(37, 200)), "18.5%");
  assert.equal(accuracyPercent(0.185), "18.5%");
  assert.equal(accuracyPercent(1), "100.0%");
  assert.equal(accuracyPercent(0), "0.0%");
});

test("a fraction under a hundredth still reads as a small percentage", () => {
  // The shape of the bug: a real accuracy must never come out looking like the
  // fraction it was computed from.
  assert.notEqual(accuracyPercent(0.185), "0.2%");
});

/* --- the ordinary case ---------------------------------------------------- */

test("an ordinary record gives an ordinary accuracy", () => {
  assert.equal(accuracyOf(50, 200), 0.25);
  assert.equal(shootingIsSound(50, 200), true);
});

test("hitting with every shot is allowed, because it is possible", () => {
  assert.equal(accuracyOf(165, 165), 1);
  assert.equal(shootingIsSound(165, 165), true);
});

/* --- the rail bug --------------------------------------------------------- */

test("more hits than shots yields no accuracy at all", () => {
  // The real numbers from match 15 on Rail Fight.
  assert.equal(accuracyOf(1804, 169), null);
  assert.equal(accuracyOf(616, 166), null);
  assert.equal(shootingIsSound(1804, 169), false);
});

test("the answer is null rather than clamped or zeroed", () => {
  const value = accuracyOf(1804, 169);
  assert.notEqual(value, 1, "a clamp would rank a broken counter first");
  assert.notEqual(value, 0, "a zero would read as somebody who never hit anything");
  assert.equal(value, null);
});

test("one hit over the count is already broken, there is no grace", () => {
  assert.equal(accuracyOf(166, 165), null);
});

/* --- the other ways a record can be unusable ------------------------------ */

test("firing nothing gives no accuracy, without being an error", () => {
  assert.equal(accuracyOf(0, 0), null);
  // Nothing fired is not a contradiction, unlike hits over shots.
  assert.equal(shootingIsSound(0, 0), true);
});

test("negative counters are unusable too", () => {
  assert.equal(shootingIsSound(-1, 10), false);
  assert.equal(shootingIsSound(10, -1), false);
  assert.equal(accuracyOf(-1, 10), null);
});

test("values that are not numbers are unusable", () => {
  assert.equal(shootingIsSound(NaN, 10), false);
  assert.equal(shootingIsSound(10, Infinity), false);
  assert.equal(accuracyOf(NaN, 10), null);
});

/* --- floating point ------------------------------------------------------- */

test("floating point noise is not treated as a broken counter", () => {
  // These arrive as double precision, so a hit count can land a hair over its
  // own shot count without anything being wrong.
  assert.equal(shootingIsSound(100.0000000001, 100), true);
  // And the figure is still capped, so no page can print 100.00001%.
  assert.ok(accuracyOf(100.0000000001, 100) <= 1);
});

/* --- the wording ---------------------------------------------------------- */

test("there is one wording for the absence, and it explains itself", () => {
  assert.ok(UNSOUND_SHOOTING_NOTE.includes("more hits than shots"));
  // It must say the rest of the record is fine, because the alternative reading
  // is that the whole row is suspect, and it is not.
  assert.ok(/rest of their record/i.test(UNSOUND_SHOOTING_NOTE));
});
