/**
 * Tests for the match timeline.
 *
 *   npm test
 *
 * A timeline is a picture, and a picture is the one thing on this site nobody
 * can check by reading it. A carry drawn a few pixels wrong looks exactly like a
 * carry drawn right, so the positions are checked here against events whose
 * answers can be worked out by hand.
 *
 * The case that matters most is overtime. `elapsedSeconds` restarts at zero, and
 * anything placed by it puts the golden goal at the start of the match, which is
 * the bug that once turned two of Romek's solo captures into relays in the drive
 * reconstruction. This module has to be immune to it by construction.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildTimeline } from "../src/lib/matches/timeline.ts";

const START = new Date("2026-07-31T19:00:00.000Z");
const at = (seconds) => new Date(START.getTime() + seconds * 1000).toISOString();

const pickup = (seconds, player, flag) => ({
  eventType: "flag_pickup",
  elapsedSeconds: seconds,
  observedAt: at(seconds),
  flagOwner: flag,
  playerName: player,
  carryMs: 0,
  attribution: null,
});

const drop = (seconds, player, flag) => ({
  eventType: "flag_drop",
  elapsedSeconds: seconds,
  observedAt: at(seconds),
  flagOwner: flag,
  playerName: player,
  carryMs: 0,
  attribution: null,
});

const returned = (seconds, flag, attribution = "inferred") => ({
  eventType: "flag_return",
  elapsedSeconds: seconds,
  observedAt: at(seconds),
  flagOwner: flag,
  playerName: null,
  carryMs: 0,
  attribution,
});

const capture = (seconds, team, player, redScore, blueScore) => ({
  elapsedSeconds: seconds,
  observedAt: at(seconds),
  team,
  playerName: player,
  redScore,
  blueScore,
});

const kill = (seconds, killerTeam) => ({
  elapsedSeconds: seconds,
  observedAt: at(seconds),
  killerName: "somebody",
  killerTeam,
  victimName: "somebody else",
  suicide: false,
});

const build = (parts) =>
  buildTimeline({
    flagEvents: [],
    kills: [],
    captures: [],
    startedAt: START,
    endedAt: new Date(START.getTime() + 600_000),
    ...parts,
  });

/* --- carries -------------------------------------------------------------- */

test("a carry runs from the pickup to the capture", () => {
  const line = build({
    flagEvents: [pickup(60, "Romek", "blue")],
    captures: [capture(120, "red", "Romek", 1, 0)],
  });

  assert.equal(line.carries.length, 1);
  const [carry] = line.carries;
  assert.equal(carry.carrier, "Romek");
  assert.equal(carry.team, "red", "the blue flag is carried by red");
  assert.equal(carry.ending, "captured");
  assert.equal(carry.seconds, 60);
  // Sixty seconds into a ten minute match.
  assert.ok(Math.abs(carry.from - 0.1) < 0.001);
  assert.ok(Math.abs(carry.to - 0.2) < 0.001);
});

test("a carry that was dropped is drawn and marked as dropped", () => {
  // The best moment in many matches and the one the old track could not show,
  // because nobody scored.
  const line = build({
    flagEvents: [pickup(60, "Romek", "blue"), drop(300, "Romek", "blue")],
  });

  assert.equal(line.carries.length, 1);
  assert.equal(line.carries[0].ending, "dropped");
  assert.equal(line.carries[0].seconds, 240);
});

test("a flag picked up again after a drop is two carries", () => {
  const line = build({
    flagEvents: [
      pickup(60, "Romek", "blue"),
      drop(120, "Romek", "blue"),
      pickup(180, "SiD", "blue"),
    ],
    captures: [capture(240, "red", "SiD", 1, 0)],
  });

  assert.deepEqual(
    line.carries.map((c) => [c.carrier, c.ending]),
    [
      ["Romek", "dropped"],
      ["SiD", "captured"],
    ],
  );
});

test("a missed drop closes the carry rather than running it to the whistle", () => {
  // The log loses events. A carry drawn across the whole match because its end
  // is missing would be the most visible thing on the page and wrong.
  const line = build({
    flagEvents: [pickup(60, "Romek", "blue"), pickup(180, "SiD", "blue")],
  });

  assert.equal(line.carries.length, 2);
  assert.equal(line.carries[0].ending, "dropped");
  assert.ok(line.carries[0].to < 0.35);
});

test("a flag still held at the whistle is unfinished, not captured", () => {
  const line = build({ flagEvents: [pickup(540, "Romek", "blue")] });

  assert.equal(line.carries[0].ending, "unfinished");
  assert.equal(line.carries[0].to, 1);
});

/* --- returns, which are inferred ------------------------------------------ */

test("a return is marked inferred unless the record says it was observed", () => {
  const line = build({
    flagEvents: [
      pickup(60, "Romek", "blue"),
      returned(90, "blue"),
      pickup(200, "SiD", "red"),
      returned(240, "red", "observed"),
    ],
  });

  assert.deepEqual(line.returns.map((r) => r.inferred), [true, false]);
});

test("a grab that died and went home is marked on the carry that made it", () => {
  /*
   * The commonest thing in a match, and the case this layer was asked for:
   * somebody takes the flag at the enemy base, dies, and it goes back to its
   * stand a few seconds later.
   *
   * The return arrives after the drop and so closes nothing, which is why it
   * has to be looked for backwards. The carry still ends at the drop, because
   * the seconds the flag spent on the floor are not seconds anybody carried it,
   * and `returnedAt` says where the attack finally died.
   */
  const line = build({
    flagEvents: [
      pickup(60, "Romek", "blue"),
      drop(64, "Romek", "blue"),
      returned(72, "blue"),
    ],
  });

  assert.equal(line.carries.length, 1);
  assert.equal(line.carries[0].ending, "returned");
  assert.equal(line.carries[0].seconds, 4, "four seconds carried, not twelve");
  assert.ok(line.carries[0].returnedAt > line.carries[0].to);
});

test("a flag picked up again before it went home is still a drop", () => {
  // The attack did not end there, it changed hands, and a later return belongs
  // to whichever carry actually put the flag down last.
  const line = build({
    flagEvents: [
      pickup(60, "Romek", "blue"),
      drop(64, "Romek", "blue"),
      pickup(70, "SiD", "blue"),
      drop(80, "SiD", "blue"),
      returned(90, "blue"),
    ],
  });

  assert.deepEqual(
    line.carries.map((c) => c.ending),
    ["dropped", "returned"],
  );
  assert.equal(line.carries[0].returnedAt, null);
});

test("a flag still in somebody's hands is not marked returned", () => {
  const line = build({
    flagEvents: [pickup(60, "Romek", "blue"), drop(64, "Romek", "blue"), returned(72, "blue"), pickup(120, "SiD", "blue")],
  });

  assert.equal(line.carries[0].ending, "returned");
  assert.equal(line.carries[1].ending, "unfinished");
});

/* --- overtime, the case this has to be immune to -------------------------- */

test("overtime is found by the clock going backwards, not by the wall clock", () => {
  const line = buildTimeline({
    flagEvents: [],
    kills: [],
    captures: [
      capture(300, "red", "Romek", 1, 0),
      // Extra time: the match clock restarts while real time keeps running.
      { ...capture(2, "blue", "SiD", 1, 1), observedAt: at(640) },
    ],
    startedAt: START,
    endedAt: new Date(START.getTime() + 700_000),
  });

  assert.ok(line.overtimeFrom !== null);
  assert.ok(line.overtimeFrom > 0.9, "extra time is at the end of the picture");
  // And the golden goal is drawn last, which is the whole point.
  assert.ok(line.captures[1].at > line.captures[0].at);
});

test("extra time starts at the whistle, not at the first thing that happens in it", () => {
  /*
   * Match 42, from the archive: 1077 seconds, four captures on the regulation
   * clock and a golden goal reading 7:57. That last pair fixes the answer from
   * both ends — a capture 477 seconds into extra time, at the very end of a
   * 1077 second match, can only mean extra time began at 600 seconds.
   *
   * The boundary used to be pinned to the first event whose clock had gone
   * backwards, and the first flag event of that period was 2:18 after the
   * whistle, so the picture drew extra time beginning at 12:18 while the list
   * beside it said the golden goal came at 7:57.
   */
  const line = buildTimeline({
    flagEvents: [],
    kills: [],
    captures: [
      { ...capture(110, "blue", "SiD", 0, 1), observedAt: at(109) },
      { ...capture(218, "red", "J!nX", 1, 1), observedAt: at(218) },
      { ...capture(413, "red", "J!nX", 2, 1), observedAt: at(413) },
      { ...capture(562, "blue", "ED ASSMASTER", 2, 2), observedAt: at(562) },
      { ...capture(477, "red", "cowboy dan", 3, 2), observedAt: at(1077) },
    ],
    startedAt: START,
    endedAt: new Date(START.getTime() + 1_077_000),
  });

  assert.ok(line.overtimeFrom !== null);
  assert.equal(Math.round(line.overtimeFrom * 1077), 600);

  // Which is the same as saying the picture and the list agree: the golden goal
  // sits 477 seconds into the period the boundary opens.
  const into = (line.captures[4].at - line.overtimeFrom) * 1077;
  assert.equal(Math.round(into), 477);
});

/* --- frags ---------------------------------------------------------------- */

test("frags are bucketed by side", () => {
  const line = build({
    kills: [kill(30, "red"), kill(31, "red"), kill(300, "blue")],
  });

  const total = line.frags.reduce(
    (sum, bucket) => ({ red: sum.red + bucket.red, blue: sum.blue + bucket.blue }),
    { red: 0, blue: 0 },
  );
  assert.deepEqual(total, { red: 2, blue: 1 });
  // Early frags land early.
  assert.ok(line.frags.findIndex((b) => b.red > 0) < line.frags.length / 2);
});

test("a suicide is not a frag for either side", () => {
  const line = build({
    kills: [{ ...kill(30, "red"), suicide: true, killerTeam: null }],
  });

  const total = line.frags.reduce((sum, b) => sum + b.red + b.blue, 0);
  assert.equal(total, 0);
});

/* --- a match with no timestamps ------------------------------------------- */

test("without timestamps only the order of the captures is claimed", () => {
  const line = buildTimeline({
    flagEvents: [{ ...pickup(60, "Romek", "blue"), observedAt: null }],
    kills: [],
    captures: [
      { ...capture(120, "red", "Romek", 1, 0), observedAt: null },
      { ...capture(300, "blue", "SiD", 1, 1), observedAt: null },
    ],
    startedAt: null,
    endedAt: null,
  });

  assert.equal(line.timed, false);
  assert.deepEqual(line.captures.map((c) => c.at), [0, 1]);
  assert.deepEqual(line.carries, [], "a carry with no clock is not drawn");
  assert.deepEqual(line.frags, []);
});
