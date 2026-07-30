/**
 * Tests for the ingest vet.
 *
 *   npm test
 *
 * Each check here exists because something wrong reached a published page and
 * was noticed by a person reading it. The tests are written as "this is the bug
 * that happened", so a future change that quietly stops catching one of them
 * fails here rather than on the site.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { summarise, vetNight } from "../src/lib/matches/vet.ts";

function player(overrides = {}) {
  return {
    name: "Romek",
    team: "red",
    spectator: false,
    kills: 30,
    deaths: 25,
    caps: 1,
    shotsHit: 100,
    shotsFired: 700,
    fastestCaptureMs: 12000,
    soloCaps: 1,
    relayCaps: 0,
    ...overrides,
  };
}

function match(overrides = {}) {
  return {
    sourceMatchId: "7",
    mapName: "Huna b8",
    redScore: 1,
    blueScore: 0,
    winner: "red",
    players: [player(), player({ name: "SiD", team: "blue", caps: 0, soloCaps: 0 })],
    captures: [{ team: "red", playerName: "Romek" }],
    ...overrides,
  };
}

const checks = (found) => found.map((a) => a.check);

test("a consistent night reports nothing", () => {
  assert.deepEqual(vetNight("2026-07-29", [match()]), []);
  assert.equal(summarise([]), "clean");
});

/* --- the bugs that actually happened ------------------------------------- */

test("catches the 2.2 second capture", () => {
  // Printed on the stat board as a record. Impossible: no two flags are two
  // seconds apart.
  const found = vetNight("2026-07-29", [
    match({
      players: [player({ fastestCaptureMs: 2203, relayCaps: 0 })],
      captures: [{ team: "red", playerName: "Romek" }],
    }),
  ]);

  assert.ok(checks(found).includes("implausible-solo-capture"));
});

test("does not flag a fast relay, which is real", () => {
  // A relay hands the flag over beside the stand, so 184ms is a genuine
  // measurement of a hand-off rather than a claim about a run.
  const found = vetNight("2026-07-29", [
    match({
      players: [player({ fastestCaptureMs: 184, soloCaps: 0, relayCaps: 1 })],
      captures: [{ team: "red", playerName: "Romek" }],
    }),
  ]);

  assert.ok(!checks(found).includes("implausible-solo-capture"));
});

test("notices when a side was reshuffled between matches", () => {
  // Red in match one and red in match two were different people, so a column
  // calling red a team with a run of form describes something that never was.
  const found = vetNight("2026-07-28", [
    match({
      sourceMatchId: "2",
      players: [player({ name: "Romek", team: "red" }), player({ name: "Haze202", team: "blue", caps: 0, soloCaps: 0 })],
    }),
    match({
      sourceMatchId: "3",
      players: [player({ name: "Haze202", team: "red" }), player({ name: "Romek", team: "blue", caps: 0, soloCaps: 0 })],
    }),
  ]);

  assert.ok(checks(found).includes("side-reshuffled"));
  assert.equal(found.find((a) => a.check === "side-reshuffled").severity, "note");
});

test("a stable night is not flagged as reshuffled", () => {
  const found = vetNight("2026-07-29", [match({ sourceMatchId: "6" }), match({ sourceMatchId: "7" })]);
  assert.ok(!checks(found).includes("side-reshuffled"));
});

/* --- the same fact recorded twice ---------------------------------------- */

test("catches the scoreboard and the event log disagreeing on captures", () => {
  const found = vetNight("2026-07-29", [
    match({ players: [player({ caps: 3 })], captures: [{ team: "red", playerName: "Romek" }] }),
  ]);

  assert.ok(checks(found).includes("caps-disagree-with-capture-log"));
});

test("catches a score that does not match the captures", () => {
  const found = vetNight("2026-07-29", [match({ redScore: 5, blueScore: 0 })]);
  assert.ok(checks(found).includes("score-disagrees-with-capture-log"));
});

test("catches a winner that contradicts the score", () => {
  const found = vetNight("2026-07-29", [match({ winner: "blue" })]);
  assert.ok(checks(found).includes("winner-disagrees-with-score"));
});

test("a draw with no winner recorded is fine", () => {
  const found = vetNight("2026-07-29", [
    match({
      redScore: 1,
      blueScore: 1,
      winner: null,
      captures: [
        { team: "red", playerName: "Romek" },
        { team: "blue", playerName: "SiD" },
      ],
      players: [player(), player({ name: "SiD", team: "blue", caps: 1, soloCaps: 1 })],
    }),
  ]);

  assert.deepEqual(found, []);
});

/* --- impossible counters -------------------------------------------------- */

test("catches more hits than shots", () => {
  const found = vetNight("2026-07-29", [
    match({ players: [player({ shotsHit: 900, shotsFired: 700 })] }),
  ]);

  assert.ok(checks(found).includes("hits-exceed-shots"));
});

test("catches solo and relay adding up to more than the captures", () => {
  const found = vetNight("2026-07-29", [
    match({ players: [player({ caps: 1, soloCaps: 1, relayCaps: 1 })] }),
  ]);

  assert.ok(checks(found).includes("capture-kinds-exceed-captures"));
});

test("catches a capture credited to somebody not on the scoreboard", () => {
  const found = vetNight("2026-07-29", [
    match({ captures: [{ team: "red", playerName: "Nobody" }] }),
  ]);

  assert.ok(checks(found).includes("capture-by-unknown-player"));
});

test("spectators are not counted as players", () => {
  // A spectator on the scoreboard has no captures and must not make the totals
  // disagree with the event log.
  const found = vetNight("2026-07-29", [
    match({
      players: [
        player(),
        player({ name: "SiD", team: "blue", caps: 0, soloCaps: 0 }),
        player({ name: "Watcher", spectator: true, caps: 0, soloCaps: 0, kills: 0 }),
      ],
    }),
  ]);

  assert.deepEqual(found, []);
});

/* --- reporting ------------------------------------------------------------ */

test("errors sort above notes so a log reads worst first", () => {
  const found = vetNight("2026-07-28", [
    match({ sourceMatchId: "2", redScore: 9, players: [player({ name: "Romek", team: "red" })] }),
    match({ sourceMatchId: "3", players: [player({ name: "Haze202", team: "red" })] }),
  ]);

  assert.equal(found[0].severity, "error");
  assert.equal(found[found.length - 1].severity, "note");
});

test("the summary counts both kinds", () => {
  assert.match(summarise([{ check: "a", severity: "error", detail: "" }]), /1 error, 0 notes/);
  assert.match(
    summarise([
      { check: "a", severity: "error", detail: "" },
      { check: "b", severity: "note", detail: "" },
    ]),
    /1 error, 1 note/,
  );
});

test("an empty night is clean rather than an error", () => {
  assert.deepEqual(vetNight("2026-07-29", []), []);
});
