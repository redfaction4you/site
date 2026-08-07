/**
 * Tests for the deathmatch sanitizer and the routing between the two ingests.
 *
 *   npm test
 *
 * The routing tests are the important half. Deathmatch was given its own tables
 * so a frag from a free-for-all could never be ranked against a frag from a
 * five-a-side, and that guarantee reduces entirely to which URL is in which
 * `.env` file on the VPS — two files, written by hand, for two servers running
 * the same broadcaster. Nothing about a misrouted day looks wrong once it is
 * stored: the columns all exist and the flag counters are simply zero.
 *
 * So both endpoints refuse the other game, and both directions are tested here,
 * including the one that seems redundant. A check that only guards the new path
 * leaves the old one open, and the old one is the one with 35 matches in it.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeDmDay } from "../src/lib/dm/sanitize.ts";
import { sanitizeDay } from "../src/lib/matches/sanitize.ts";
import { isDeathmatchMode, normaliseMode } from "../src/lib/matches/modes.ts";

/**
 * A day from the deathmatch server, in the shape the broadcaster sends.
 *
 * Deliberately hostile, the same way the match fixture is: the same player
 * appears twice with disagreeing counters, one of those snapshots reports more
 * hits than shots, somebody is on the server having done nothing at all, and
 * there are fields here that must never reach the database.
 */
function samplePayload() {
  return {
    format: "rf4u-match-night-v1",
    archiveTimeZone: "America/Los_Angeles",
    calendarDate: "2026-08-07",
    server: "RedFaction4You.com [DM]",
    matches: [
      {
        id: 4,
        status: "final",
        map_name: "Ruins of Ankh",
        mode: "dm",
        started_at: "2026-08-07T03:00:00.000Z",
        ended_at: "2026-08-07T03:12:00.000Z",
        players: [
          {
            name: "Romek",
            kills: 18,
            deaths: 11,
            score: 18,
            max_streak: 6,
            shots_hit: 90.5,
            shots_fired: 300,
            damage_given: 2100,
            damage_taken: 1800,
            seconds_played: 700,
            identity_id: "a1b2c3",
            weapon_stats: [
              { weapon: "Rail Driver", weapon_id: 9, shots_hit: 20, shots_fired: 40, kills: 8 },
            ],
            // None of the below may survive.
            ip: "203.0.113.9",
            position: { x: 12, y: 4, z: -8 },
            team: "red",
            caps: 3,
            flag_pickups: 2,
            private_alias_history: ["Gaymer"],
          },
          {
            // The later snapshot of the same player, with a broken shooting pair.
            name: "Romek",
            kills: 21,
            deaths: 13,
            score: 21,
            max_streak: 6,
            shots_hit: 4000,
            shots_fired: 310,
            damage_given: 2400,
            damage_taken: 1950,
            seconds_played: 780,
            identity_id: "a1b2c3",
          },
          {
            name: "Skuldug",
            kills: 14,
            deaths: 15,
            score: 14,
            max_streak: 4,
            shots_hit: 60,
            shots_fired: 240,
            damage_given: 1700,
            damage_taken: 2000,
            seconds_played: 780,
            identity_id: "d4e5f6",
          },
          {
            // Connected while the map was loading and never entered the game.
            name: "Ath-PL",
            kills: 0,
            deaths: 0,
            score: 0,
            max_streak: 0,
            shots_hit: 0,
            shots_fired: 0,
            damage_given: 0,
            damage_taken: 0,
          },
          {
            name: "Watching",
            spectator: true,
            kills: 0,
            deaths: 0,
            score: 0,
          },
        ],
      },
    ],
  };
}

/** The one round in the sample, sanitised. */
function sampleRound() {
  return sanitizeDmDay(samplePayload()).rounds[0];
}

test("a deathmatch day is stored as rounds and players", () => {
  const day = sanitizeDmDay(samplePayload());

  assert.equal(day.archiveDay, "2026-08-07");
  assert.equal(day.server, "RedFaction4You.com [DM]");
  assert.equal(day.rounds.length, 1);
  assert.equal(day.rounds[0].sourceRoundId, 4);
  assert.equal(day.rounds[0].mapName, "Ruins of Ankh");
  assert.equal(day.rounds[0].startedAt.toISOString(), "2026-08-07T03:00:00.000Z");
});

test("every field on a stored player is one this file names", () => {
  const [romek] = sampleRound().players;

  // The allowlist, asserted as a whole rather than field by field: a new field
  // arriving in the export has to be added here before it can be stored, which
  // is the entire point of a sanitizer that is a security boundary.
  assert.deepEqual(Object.keys(romek).sort(), [
    "damageGiven",
    "damageTaken",
    "deaths",
    "identityKey",
    "kills",
    "maxStreak",
    "name",
    "score",
    "secondsPlayed",
    "shots",
    "shotsFired",
    "shotsHit",
    "weaponStats",
  ]);

  // Named individually as well, because the list above would pass if one of
  // these were spelled the same and meant something else.
  assert.equal(romek.team, undefined);
  assert.equal(romek.caps, undefined);
  assert.equal(romek.flagPickups, undefined);
  assert.equal(romek.ip, undefined);
  assert.equal(romek.position, undefined);
  assert.equal(romek.privateAliasHistory, undefined);
});

test("weapon stats keep the name and drop the engine's id", () => {
  const [romek] = sampleRound().players;

  assert.equal(romek.weaponStats.length, 1);
  assert.equal(romek.weaponStats[0].weapon, "Rail Driver");
  assert.equal(romek.weaponStats[0].weapon_id, undefined);
});

test("duplicate snapshots are merged by maximum, never summed", () => {
  const [romek] = sampleRound().players;

  // 18 and 21 are the same player counted twice, not 39 frags.
  assert.equal(romek.kills, 21);
  assert.equal(romek.deaths, 13);
  assert.equal(romek.secondsPlayed, 780);
});

test("a newer broken shooting pair never displaces an older sound one", () => {
  const [romek] = sampleRound().players;

  // The second snapshot claimed 4000 hits from 310 shots. Taking the maximum of
  // each half independently is what published 1067% accuracy, so the whole
  // tuple is rejected and the earlier coherent one kept.
  assert.equal(romek.shotsHit, 90.5);
  assert.equal(romek.shotsFired, 300);
  assert.ok(romek.shotsHit <= romek.shotsFired);
});

test("somebody who never entered the game is not on the record", () => {
  const names = sampleRound().players.map((player) => player.name);

  assert.deepEqual(names, ["Romek", "Skuldug"]);
});

test("a round nobody was on is not kept", () => {
  const payload = samplePayload();
  payload.matches.push({
    id: 5,
    status: "final",
    map_name: "Glass House",
    mode: "dm",
    started_at: "2026-08-07T03:15:00.000Z",
    players: [],
  });

  assert.equal(sanitizeDmDay(payload).rounds.length, 1);
});

test("a cancelled round is dropped, and a short one is not", () => {
  const payload = samplePayload();
  payload.matches[0].status = "cancelled";
  assert.equal(sanitizeDmDay(payload).rounds.length, 0);

  /*
   * The CTF ingest drops a `final` match shorter than its minimum because an
   * abandoned start is not a match that happened. Deathmatch has no equivalent:
   * a rotation cut short by a map vote is still time in which people fragged
   * each other, and the record is a sum of what happened rather than a list of
   * contests. This is the test that fails if somebody copies that rule across.
   */
  const short = samplePayload();
  short.matches[0].ended_at = "2026-08-07T03:00:40.000Z";
  assert.equal(sanitizeDmDay(short).rounds.length, 1);
});

test("a day with no server named is refused", () => {
  const payload = samplePayload();
  delete payload.server;

  assert.throws(() => sanitizeDmDay(payload), /which server/i);
});

/* Routing. The half that keeps the two games apart. */

test("a night of capture the flag is refused by the deathmatch endpoint", () => {
  const payload = samplePayload();
  payload.matches[0].mode = "ctf";

  assert.throws(() => sanitizeDmDay(payload), (error) => {
    assert.match(error.message, /deathmatch/i);
    // The message has to name the other endpoint. Whoever reads it is on the
    // VPS at the time, fixing a URL in an environment file.
    assert.match(error.message, /\/api\/rf4u\/archive\/ingest/);
    return true;
  });
});

test("a day of deathmatch is refused by the match endpoint", () => {
  const payload = samplePayload();
  assert.throws(() => sanitizeDay(payload), (error) => {
    assert.match(error.message, /capture the flag/i);
    assert.match(error.message, /\/api\/rf4u\/archive\/dm/);
    return true;
  });
});

test("one round of the wrong game refuses the whole document", () => {
  // Not "most of them". A document carrying both is two servers' data in one
  // file, and there is no reading of that which is safe to store.
  const payload = samplePayload();
  payload.matches.push({ ...payload.matches[0], id: 6, mode: "ctf" });

  assert.throws(() => sanitizeDmDay(payload), /1 of 2 rounds/);
});

test("the deathmatch endpoint takes the names the engine might use", () => {
  for (const mode of ["dm", "DM", "Deathmatch", "Team DM", "TeamDM", "tdm"]) {
    assert.equal(isDeathmatchMode(mode), true, `${mode} should be deathmatch`);
  }

  // Punctuation and case cannot decide a game.
  assert.equal(normaliseMode("Team DM"), "TEAMDM");
  assert.equal(normaliseMode(undefined), "");
});

test("the match endpoint still takes a mode nobody here has heard of", () => {
  /*
   * The check is specific on purpose and this test is what stops it being
   * "tightened" into a bug. `mode` is not in the documented export contract, so
   * refusing anything that is not recognisably CTF would break a sync that has
   * worked since July the moment the broadcaster sends `CTF Pro` or similar.
   * The threat is the deathmatch sync pointed at this URL, and only that.
   */
  const payload = samplePayload();
  payload.matches[0].mode = "CTF Pro";

  assert.equal(sanitizeDay(payload).matches[0].mode, "CTF PRO");
});

test("a round that will not say which game it is, is refused", () => {
  const payload = samplePayload();
  delete payload.matches[0].mode;

  // The CTF sanitizer reads a missing mode as CTF, because it predates there
  // being two games and `mode` is not in the documented contract. Nothing has
  // ever flowed into deathmatch, so it has no such history to protect and it
  // guesses at nothing.
  assert.throws(() => sanitizeDmDay(payload), /\(blank\)/);

  const ctf = samplePayload();
  ctf.matches[0].mode = undefined;
  assert.equal(sanitizeDay(ctf).matches[0].mode, "CTF");
});
