/**
 * Tests for matching the running level to its place in a rotation.
 *
 *   npm test
 *
 * The case this exists for is the ordinary one, not an edge: the pack holds
 * `dm-rfu2-finding-nemo.rfl` and the server browser reports
 * `RFU2-Finding Nemo`. They are the same map on the same server at the same
 * moment and they share no exact string, so a naive comparison finds nothing and
 * the page says it does not know what is playing while plainly knowing.
 *
 * The other half is what happens when it genuinely cannot tell. A level reached
 * by a vote is not in the rotation, and there is no honest "next" for it. Null
 * has to survive all the way to the page rather than being turned into a guess.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  nextInRotation,
  positionInRotation,
  rotationFrom,
} from "../src/lib/server-rotation.ts";

/** The real shape, as link-maps.mjs stores it. */
const ROTATION = [
  { filename: "DM-Checker Game.rfl", title: "Checker Game" },
  { filename: "dm-rfu2-finding-nemo.rfl", title: "RFU2-Finding Nemo" },
  { filename: "DC-Doomsdayb1.rfl", title: "DC Doomsday" },
  { filename: "dm-skykingdom2.rfl", title: "Sky Kingdom 2" },
];

/* --- the case it was built for --------------------------------------------- */

test("the browser's level name finds the pack's filename", () => {
  // Verified against the live server: the browser reported "RFU2-Finding Nemo"
  // while the rotation held "dm-rfu2-finding-nemo.rfl".
  assert.equal(positionInRotation("RFU2-Finding Nemo", ROTATION), 1);
  assert.equal(nextInRotation("RFU2-Finding Nemo", ROTATION).filename, "DC-Doomsdayb1.rfl");
});

test("case, spacing and punctuation are all allowed to differ", () => {
  for (const name of ["checker game", "CHECKER-GAME", "Checker  Game", "checkergame"]) {
    assert.equal(positionInRotation(name, ROTATION), 0, name);
  }
});

test("an entry with no title still matches on its filename", () => {
  const untitled = [{ filename: "dm-lonely.rfl" }, { filename: "dm-other.rfl" }];
  assert.equal(positionInRotation("dm-lonely", untitled), 0);
  assert.equal(positionInRotation("Lonely", untitled), null);
});

/* --- not knowing, which is a real answer ------------------------------------ */

test("a level that is not in the rotation places nowhere", () => {
  // Reached by a vote, most likely. Guessing a position here would print a
  // confidently wrong next map.
  assert.equal(positionInRotation("Some Voted Map", ROTATION), null);
  assert.equal(nextInRotation("Some Voted Map", ROTATION), null);
});

test("no level name at all is not a match", () => {
  for (const value of [null, undefined, "", "   "]) {
    assert.equal(positionInRotation(value, ROTATION), null);
    assert.equal(nextInRotation(value, ROTATION), null);
  }
});

test("a rotation of one has no next map worth printing", () => {
  const single = [{ filename: "dm04.rfl", title: "DM04" }];
  assert.equal(positionInRotation("DM04", single), 0, "it is still placed");
  assert.equal(nextInRotation("DM04", single), null, "but the next map is itself");
});

/* --- wrapping ---------------------------------------------------------------- */

test("the last level's next is the first", () => {
  assert.equal(nextInRotation("Sky Kingdom 2", ROTATION).filename, "DM-Checker Game.rfl");
});

/* --- reordering for display -------------------------------------------------- */

test("the list can start at whatever is playing", () => {
  const from = rotationFrom("DC Doomsday", ROTATION);

  assert.equal(from[0].title, "DC Doomsday");
  assert.equal(from.length, ROTATION.length, "nothing is lost in the rotate");
  assert.deepEqual(
    [...from].map((m) => m.filename).sort(),
    ROTATION.map((m) => m.filename).sort(),
  );
});

test("an unplaceable level leaves the order exactly alone", () => {
  assert.deepEqual(rotationFrom("Some Voted Map", ROTATION), ROTATION);
  assert.deepEqual(rotationFrom(null, ROTATION), ROTATION);
});

test("reordering does not mutate the rotation it was given", () => {
  const before = ROTATION.map((m) => m.filename);
  rotationFrom("Sky Kingdom 2", ROTATION);
  assert.deepEqual(ROTATION.map((m) => m.filename), before);
});
