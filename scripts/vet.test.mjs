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
    fastestSoloCaptureMs: 12000,
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
      players: [player({ fastestSoloCaptureMs: 2203 })],
      captures: [{ team: "red", playerName: "Romek" }],
    }),
  ]);

  assert.ok(checks(found).includes("implausible-solo-capture"));
});

test("a relay carries no solo drive time, so nothing is claimed about it", () => {
  // A relay hands the flag over beside the stand, and the last carrier's
  // fraction of a second is a true measurement of a hand-off rather than a claim
  // about a run. The reconstruction records no solo drive at all for it, which
  // is why this check no longer needs to exempt relayers by name.
  const found = vetNight("2026-07-29", [
    match({
      players: [
        player({ fastestSoloCaptureMs: null, soloCaps: 0, relayCaps: 1 }),
      ],
      captures: [{ team: "red", playerName: "Romek" }],
    }),
  ]);

  assert.ok(!checks(found).includes("implausible-solo-capture"));
});

test("a fast solo drive by somebody who also relayed is still checked", () => {
  /*
   * The old rule read the server's `fastest_capture_ms` and could not tell a
   * hand-off from a run, so it skipped anybody who had ever relayed. That let an
   * impossible solo drive through whenever the same player had also finished
   * somebody else's. The reconstruction is unambiguous, so the exemption is
   * gone and this case is now caught.
   */
  const found = vetNight("2026-07-29", [
    match({
      players: [
        player({ caps: 2, soloCaps: 1, relayCaps: 1, fastestSoloCaptureMs: 900 }),
      ],
      captures: [
        { team: "red", playerName: "Romek" },
        { team: "red", playerName: "Romek" },
      ],
      redScore: 2,
    }),
  ]);

  assert.ok(checks(found).includes("implausible-solo-capture"));
});

test("the recovered flag that was called an anomaly for a month", () => {
  /*
   * Match 10, exactly as recorded. Medeo took the blue flag at 00:37, was killed
   * at 01:00, took it off the ground at 01:02 and capped at 01:05. The server
   * reported 2.785 seconds, being the last leg, and the archive reconstructed
   * the drive at 27.8 seconds. Reading the server's figure, this check called a
   * correct record wrong every time it ran.
   */
  const found = vetNight("2026-07-30", [
    match({
      players: [player({ fastestSoloCaptureMs: 27842 })],
      captures: [{ team: "red", playerName: "Romek" }],
    }),
  ]);

  assert.deepEqual(checks(found), []);
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

test("a match too short to have finished is an error", () => {
  // The server labels an abandoned start `final` exactly like a completed game,
  // so duration is the only thing that separates them. One arrived at 30
  // seconds, nil nil, and was written about as a real result.
  const [anomaly] = vetNight("2026-07-31", [
    {
      sourceMatchId: 20,
      mapName: "Ankh b12",
      redScore: 0,
      blueScore: 0,
      winner: null,
      durationSeconds: 30,
      players: [],
      captures: [],
    },
  ]).filter((a) => a.check === "match-too-short");

  assert.ok(anomaly, "a 30 second match was not flagged");
  assert.equal(anomaly.severity, "error");
});

test("a full length match and an overtime one are both fine", () => {
  for (const durationSeconds of [600, 870]) {
    const flagged = vetNight("2026-07-31", [
      {
        sourceMatchId: 1,
        mapName: "Huna b8",
        redScore: 3,
        blueScore: 2,
        winner: "red",
        durationSeconds,
        players: [],
        captures: [],
      },
    ]).filter((a) => a.check === "match-too-short");

    assert.equal(flagged.length, 0, `${durationSeconds}s was wrongly flagged`);
  }
});

test("a match with no clock is not accused of being short", () => {
  // Null is missing, not zero. Guessing either way would invent a fact.
  const flagged = vetNight("2026-07-31", [
    {
      sourceMatchId: 2,
      mapName: "Ankh b12",
      redScore: 1,
      blueScore: 0,
      winner: "red",
      durationSeconds: null,
      players: [],
      captures: [],
    },
  ]).filter((a) => a.check === "match-too-short");

  assert.equal(flagged.length, 0);
});
