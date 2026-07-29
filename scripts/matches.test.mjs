/**
 * Tests for the match archive sanitizer.
 *
 *   npm test
 *
 * The sample payload is the one shipped in the VPS handoff package. It is
 * deliberately hostile: it carries an identity hash, a Discord thread id,
 * player coordinates, and the same player listed twice with disagreeing
 * counters. Every one of those is a thing that must not reach a browser or
 * must not be double-counted, so it is the right fixture.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  calendarDay,
  isValidDay,
  mergePlayers,
  sanitizeDay,
} from "../src/lib/matches/sanitize.ts";

/** The sample day, inline so the tests do not depend on a file outside the repo. */
function samplePayload() {
  return {
    format: "rf4u-match-night-v1",
    archiveTimeZone: "America/Los_Angeles",
    calendarDate: "2026-07-28",
    range: { from: "2026-07-28T07:00:00.000Z", to: "2026-07-29T07:00:00.000Z" },
    server: "RF4U Competitive [Match]",
    matches: [
      {
        id: 101,
        status: "final",
        map_name: "Warlords Pro (No Fog)",
        mode: "ctf",
        started_at: "2026-07-29T03:00:00.000Z",
        ended_at: "2026-07-29T03:10:00.000Z",
        red_score: 1,
        blue_score: 3,
        overtime: false,
        winner: "blue",
        discord_thread_id: "private-source-field",
        players: [
          {
            name: "Romek",
            normalized_name: "identity:private",
            identity_id: "private-identity-hash",
            team: "blue",
            score: 47,
            kills: 37,
            deaths: 36,
            caps: 1,
            accuracy: 0.14,
            shots_hit: 123,
            shots_fired: 868,
            flag_hold_ms: 77000,
            flag_pickups: 2,
          },
          { name: "Romek", team: "blue", score: 47, kills: 37, deaths: 35, caps: 1, accuracy: 0 },
        ],
        captures: [
          {
            elapsed_seconds: 529,
            team: "blue",
            red_score: 1,
            blue_score: 3,
            player_name: "Romek",
            message: "BLUE TEAM CAPTURES! Romek extends the lead, 1-3.",
            observed_at: "2026-07-29T03:08:49.000Z",
            position: { x: 1, y: 2, z: 3 },
          },
        ],
        kills: [],
        flagEvents: [],
        rosterEvents: [],
      },
    ],
  };
}

// --------------------------------------------------------------------------
// The security boundary
// --------------------------------------------------------------------------

test("private source fields never survive sanitizing", () => {
  const day = sanitizeDay(samplePayload());
  const json = JSON.stringify(day);

  // The values themselves must be absent, not just the keys.
  assert.equal(json.includes("private-source-field"), false, "discord thread id leaked");
  assert.equal(json.includes("normalized_name"), false, "alias key leaked");
  assert.equal(json.includes("discord_thread_id"), false, "discord field leaked");

  // Coordinates are the one people forget.
  const capture = day.matches[0].captures[0];
  assert.equal("position" in capture, false, "player position leaked");
});

test("v2's alias history never survives sanitizing", () => {
  // The v2 export added private_alias_history to every player: every name that
  // account has used. It is exactly the kind of field an allowlist exists for,
  // and exactly the kind that a spread would have published without anyone
  // noticing.
  const payload = samplePayload();
  payload.matches[0].players[0].private_alias_history = [
    "OldHandle",
    "AnotherName",
  ];

  const json = JSON.stringify(sanitizeDay(payload));
  assert.equal(json.includes("private_alias_history"), false);
  assert.equal(json.includes("OldHandle"), false);
  assert.equal(json.includes("AnotherName"), false);
});

test("an unknown field invented upstream cannot pass through", () => {
  const payload = samplePayload();
  payload.matches[0].players[0].secret_ip_address = "203.0.113.9";
  payload.matches[0].some_future_field = { nested: "surprise" };

  const json = JSON.stringify(sanitizeDay(payload));
  assert.equal(json.includes("203.0.113.9"), false);
  assert.equal(json.includes("surprise"), false);
});

test("the identity hash is kept for storage but is not a public field", () => {
  const day = sanitizeDay(samplePayload());
  const player = day.matches[0].players[0];

  // Kept, because it cannot be recovered later.
  assert.equal(player.identityKey, "private-identity-hash");

  // And the read layer must never select it. That is enforced in queries.ts by
  // naming columns; this test documents the intent alongside the data.
  assert.ok("identityKey" in player);
});

// --------------------------------------------------------------------------
// Duplicate players
// --------------------------------------------------------------------------

test("duplicate player rows are merged, not summed", () => {
  const day = sanitizeDay(samplePayload());
  const players = day.matches[0].players;

  assert.equal(players.length, 1, "the same player appeared twice in the output");

  const romek = players[0];
  assert.equal(romek.name, "Romek");
  // 37 and 37, not 74. Summing would double everyone's night.
  assert.equal(romek.kills, 37);
  assert.equal(romek.score, 47);
  // Highest wins for counters that only climb.
  assert.equal(romek.deaths, 36);
});

test("accuracy is recomputed from shots, not taken on trust", () => {
  const day = sanitizeDay(samplePayload());
  const romek = day.matches[0].players[0];

  // The payload claims 0.14 on one row and 0 on the other; 123/868 is neither.
  assert.ok(Math.abs(romek.accuracy - 123 / 868) < 1e-9);
});

test("a player who switched teams keeps both sets of numbers", () => {
  const payload = samplePayload();
  payload.matches[0].players.push({ name: "Romek", team: "red", score: 10, kills: 5 });

  const players = sanitizeDay(payload).matches[0].players;
  assert.equal(players.length, 2);
  assert.deepEqual(players.map((p) => p.team).sort(), ["blue", "red"]);
});

test("names differing only by case are the same player", () => {
  const payload = samplePayload();
  payload.matches[0].players.push({ name: "ROMEK", team: "blue", kills: 40 });

  const players = sanitizeDay(payload).matches[0].players;
  assert.equal(players.length, 1);
  assert.equal(players[0].kills, 40);
});

test("mergePlayers keeps the fastest capture, not the largest", () => {
  const base = {
    name: "a", team: "blue", spectator: false, score: 0, kills: 0, deaths: 0,
    caps: 0, maxStreak: 0, accuracy: 0, shotsHit: 0, shotsFired: 0,
    damageGiven: 0, damageTaken: 0, flagHoldMs: 0, flagPickups: 0, flagDrops: 0,
    flagReturns: 0, flagCarrierKills: 0, flagCarrierDeaths: 0, captureAssists: 0,
    flagRecoveries: 0, successfulFlagDrives: 0, successfulCarryMs: 0,
    fastestCaptureMs: null, identityKey: null,
  };

  const merged = mergePlayers(
    { ...base, fastestCaptureMs: 9000 },
    { ...base, fastestCaptureMs: 4000 },
  );
  assert.equal(merged.fastestCaptureMs, 4000);

  // A zero means "never captured" and must not win.
  assert.equal(mergePlayers({ ...base, fastestCaptureMs: 5000 }, base).fastestCaptureMs, 5000);
});

// --------------------------------------------------------------------------
// Dates, which are the other thing that quietly goes wrong
// --------------------------------------------------------------------------

test("a match after midnight UTC belongs to the evening it was played", () => {
  // 03:00 UTC on the 29th is 20:00 on the 28th in Los Angeles. A match night
  // that runs late must not split across two archive days.
  assert.equal(calendarDay("2026-07-29T03:00:00.000Z"), "2026-07-28");
});

test("the archive day is derived when the payload omits it", () => {
  const payload = samplePayload();
  delete payload.calendarDate;

  assert.equal(sanitizeDay(payload).archiveDay, "2026-07-28");
});

test("a stated calendar date is trusted over the range", () => {
  const payload = samplePayload();
  payload.calendarDate = "2026-07-27";

  assert.equal(sanitizeDay(payload).archiveDay, "2026-07-27");
});

test("isValidDay rejects impossible dates", () => {
  assert.equal(isValidDay("2026-07-28"), true);
  assert.equal(isValidDay("2026-02-30"), false);
  assert.equal(isValidDay("2026-13-01"), false);
  assert.equal(isValidDay("26-07-28"), false);
  assert.equal(isValidDay(""), false);
  assert.equal(isValidDay(null), false);
});

// --------------------------------------------------------------------------
// Shape and robustness
// --------------------------------------------------------------------------

test("match fields are normalised", () => {
  const match = sanitizeDay(samplePayload()).matches[0];
  assert.equal(match.sourceMatchId, 101);
  assert.equal(match.mode, "CTF", "mode should be upper-cased");
  assert.equal(match.mapName, "Warlords Pro (No Fog)");
  assert.equal(match.winner, "blue");
  assert.ok(match.startedAt instanceof Date);
});

test("control characters are stripped from names", () => {
  const payload = samplePayload();
  payload.matches[0].players[0].name = "Rom\u0000ek\u001f";
  const name = sanitizeDay(payload).matches[0].players[0].name;

  assert.equal(name.includes("\u0000"), false);
  assert.equal(name.includes("\u001f"), false);
  // Ordinary characters must survive: this regex has been wrong before.
  assert.equal(sanitizeDay(samplePayload()).matches[0].mapName.includes(" "), true);
  assert.equal(sanitizeDay(samplePayload()).matches[0].mapName.includes("-"), false);
});

test("hyphens and spaces in names are preserved", () => {
  const payload = samplePayload();
  payload.matches[0].players[0].name = "Big-Bad Wolf";
  assert.equal(sanitizeDay(payload).matches[0].players[0].name, "Big-Bad Wolf");
});

test("garbage input is refused rather than half-stored", () => {
  assert.throws(() => sanitizeDay(null), /must be a JSON object/);
  assert.throws(() => sanitizeDay("nope"), /must be a JSON object/);
  assert.throws(() => sanitizeDay({ matches: [] }), /no usable date/);
});

test("cancelled matches are not stored", () => {
  const payload = samplePayload();
  payload.matches.push({
    ...payload.matches[0],
    id: 102,
    status: "cancelled",
    map_name: "Abandoned",
  });

  const day = sanitizeDay(payload);
  assert.equal(day.matches.length, 1, "the cancelled match survived");
  assert.equal(day.matches[0].mapName, "Warlords Pro (No Fog)");
});

test("cancellation is matched however it is spelled or cased", () => {
  for (const status of ["cancelled", "Canceled", "ABORTED"]) {
    const payload = samplePayload();
    payload.matches[0].status = status;
    assert.equal(sanitizeDay(payload).matches.length, 0, `"${status}" was kept`);
  }
});

test("matches still in progress are kept", () => {
  // Only cancellation is discarded. A match mid-game should appear and be
  // updated to final on a later sync, not vanish until it finishes.
  const payload = samplePayload();
  payload.matches[0].status = "active";
  assert.equal(sanitizeDay(payload).matches.length, 1);
});

test("a day with no matches is valid, not an error", () => {
  const day = sanitizeDay({ calendarDate: "2026-07-28", matches: [] });
  assert.equal(day.matches.length, 0);
  assert.equal(day.archiveDay, "2026-07-28");
});
