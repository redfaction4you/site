/**
 * Tests for whether a match counted.
 *
 *   npm test
 *
 * The rule was written once and applied to nine queries, and the two it missed
 * were both on the same page. On 31 July the night header read 2,090 frags and
 * the scoreboard directly under it summed to 2,102: the difference was a match
 * cancelled after thirty seconds, excluded from one and counted in the other.
 * Every reader of that page saw both numbers.
 *
 * The rule has to cut both ways, and the second direction is the one that
 * matters more. A match with no clock at all still counts, because refusing a
 * real result on a reporting gap loses an evening of play, where counting a
 * cancelled start only misstates a total by one match.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  CANCELLED_NOTE,
  MIN_COMPLETED_SECONDS,
  matchCompleted,
  matchSeconds,
  wasCancelled,
} from "../src/lib/matches/completion.ts";

/** A match of a given length, timed the way the archive stores it. */
function ran(seconds) {
  const started = new Date("2026-07-31T19:15:00Z");
  return {
    startedAt: started,
    endedAt: new Date(started.getTime() + seconds * 1000),
  };
}

/* --- the case this was written for ---------------------------------------- */

test("a match cancelled after thirty seconds did not count", () => {
  // Match 20 on Ankh b12, 31 July, exactly as stored: 0-0 in 30 seconds.
  assert.equal(matchCompleted(ran(30)), false);
  assert.equal(wasCancelled(ran(30)), true);
});

test("every real match on record counted", () => {
  // Regulation, then the four overtimes the archive holds.
  for (const seconds of [600, 640, 718, 763, 870]) {
    assert.equal(matchCompleted(ran(seconds)), true, `${seconds}s`);
    assert.equal(wasCancelled(ran(seconds)), false, `${seconds}s`);
  }
});

/* --- missing is not short ------------------------------------------------- */

test("a match with no clock counts", () => {
  // The server forgetting to send an end time must not lose a real result.
  assert.equal(matchCompleted({ startedAt: new Date(), endedAt: null }), true);
  assert.equal(matchCompleted({ startedAt: null, endedAt: new Date() }), true);
  assert.equal(matchCompleted({ startedAt: null, endedAt: null }), true);
});

test("an unreadable timestamp counts rather than being called cancelled", () => {
  assert.equal(matchCompleted({ startedAt: "not a date", endedAt: "also not" }), true);
});

/* --- the boundary --------------------------------------------------------- */

test("the bound is inclusive, so a five minute format would count", () => {
  assert.equal(matchCompleted(ran(MIN_COMPLETED_SECONDS)), true);
  assert.equal(matchCompleted(ran(MIN_COMPLETED_SECONDS - 1)), false);
});

test("the bound is nowhere near anything real", () => {
  // Deliberately loose: far above every cancelled start and far below every
  // match that was played out. A number fitted to one of them would fail on the
  // first night somebody ran a shorter game.
  assert.ok(MIN_COMPLETED_SECONDS > 30 * 2);
  assert.ok(MIN_COMPLETED_SECONDS < 600 / 1.5);
});

/* --- timing --------------------------------------------------------------- */

test("duration is read the same from Date objects and from strings", () => {
  // The queries hand over Dates and the day document hands over ISO strings.
  assert.equal(matchSeconds(ran(600)), 600);
  assert.equal(
    matchSeconds({
      startedAt: "2026-07-31T19:15:00.000Z",
      endedAt: "2026-07-31T19:25:00.000Z",
    }),
    600,
  );
  assert.equal(matchSeconds({ startedAt: null, endedAt: null }), null);
});

test("the note says it is kept and that it counts towards nothing", () => {
  // Both halves are load bearing: the archive does not delete what happened,
  // and a reader has to be told why the match is not in any total.
  assert.match(CANCELLED_NOTE, /kept/i);
  assert.match(CANCELLED_NOTE, /nothing/i);
});
