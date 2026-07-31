/**
 * Tests for who counts as having played.
 *
 *   npm test
 *
 * Found by a reader, not by a check: the night's column said Fatoon played a
 * match on Warlords, and they were not in it. The server had sent a row with a
 * real team, `spectator` false, and every counter zero.
 *
 * The rule has to cut both ways and the second direction is the one that
 * matters more. Dropping somebody who genuinely played is far worse than keeping
 * somebody who did nothing, because a missing player is a match the archive
 * describes wrongly and nobody can see the gap. So any sign of life at all
 * counts, down to a single point of damage taken.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  ABSENT_NOTE,
  tookPart,
  wasAbsent,
} from "../src/lib/matches/participation.ts";

/** A row with nothing recorded, which is the case this module exists for. */
const empty = {
  spectator: false,
  score: 0,
  kills: 0,
  deaths: 0,
  caps: 0,
  shotsFired: 0,
  shotsHit: 0,
  damageTaken: 0,
  damageGiven: 0,
  flagPickups: 0,
  flagReturns: 0,
  maxStreak: 0,
};

/* --- the case this was written for ---------------------------------------- */

test("a row on a team with nothing recorded did not play", () => {
  // Fatoon on Warlords, match 10, exactly as stored.
  assert.equal(tookPart({ ...empty }), false);
  assert.equal(wasAbsent({ ...empty }), true);
});

test("a spectator did not play either, and is not called absent", () => {
  // Absent means on a team and missing. A spectator is neither.
  assert.equal(tookPart({ ...empty, spectator: true }), false);
  assert.equal(wasAbsent({ ...empty, spectator: true }), false);
});

/* --- any sign of life counts ---------------------------------------------- */

test("every counter on its own is enough to have played", () => {
  for (const field of Object.keys(empty)) {
    if (field === "spectator") continue;
    assert.equal(
      tookPart({ ...empty, [field]: 1 }),
      true,
      `${field} alone should count as having played`,
    );
  }
});

test("somebody who only died still played", () => {
  // The most likely real case: joined late, died once, match ended.
  assert.equal(tookPart({ ...empty, deaths: 1 }), true);
});

test("somebody who only took damage still played", () => {
  assert.equal(tookPart({ ...empty, damageTaken: 1 }), true);
});

test("firing and missing all night still counts", () => {
  assert.equal(tookPart({ ...empty, shotsFired: 200, shotsHit: 0 }), true);
});

/* --- shapes ---------------------------------------------------------------- */

test("a partial row works, since the queries return several shapes", () => {
  assert.equal(tookPart({ kills: 3 }), true);
  assert.equal(tookPart({ kills: 0 }), false);
  assert.equal(tookPart({}), false);
});

test("a spectator flag alone settles it, whatever else is present", () => {
  assert.equal(tookPart({ spectator: true, kills: 40 }), false);
});

test("negative or nonsense counters are not signs of life", () => {
  assert.equal(tookPart({ ...empty, kills: -1 }), false);
  assert.equal(tookPart({ ...empty, score: NaN }), false);
});

/* --- the wording ----------------------------------------------------------- */

test("the note explains the absence rather than implying a fault", () => {
  assert.ok(/nothing at all recorded/i.test(ABSENT_NOTE));
  assert.ok(/not counted/i.test(ABSENT_NOTE));
});
