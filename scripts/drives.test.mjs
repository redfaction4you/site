/**
 * Tests for flag drive reconstruction.
 *
 *   npm test
 *
 * The case that matters is the one nobody currently gets credit for: a player
 * carries the flag most of the way, dies, and a teammate walks in the last few
 * metres. The scoreboard says the finisher scored and says nothing at all about
 * the carrier.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { creditDrives, reconstructDrives } from "../src/lib/matches/drives.ts";

const pickup = (at, player, flag) => ({
  eventType: "flag_pickup",
  elapsedSeconds: at,
  playerName: player,
  flagOwner: flag,
  carryMs: 0,
  killerName: null,
  victimName: null,
  attribution: null,
  recovery: false,
  previousCarrierName: null,
  message: "",
  observedAt: null,
});

const drop = (at, player, flag, carryMs) => ({ ...pickup(at, player, flag), eventType: "flag_drop", carryMs });
const returned = (at, flag) => ({ ...pickup(at, null, flag), eventType: "flag_return" });
const capture = (at, team, player) => ({ elapsedSeconds: at, team, playerName: player });

test("a solo cap has one carrier and no lead carrier credit", () => {
  const drives = reconstructDrives(
    [pickup(10, "Skuldug", "blue")],
    [capture(40, "red", "Skuldug")],
  );

  assert.equal(drives.length, 1);
  assert.equal(drives[0].solo, true);
  assert.equal(drives[0].capper, "Skuldug");
  assert.equal(drives[0].leadCarrier, "Skuldug");

  const credit = creditDrives(drives);
  assert.equal(credit.get("skuldug").soloCaps, 1);
  assert.equal(credit.get("skuldug").relayCaps, 0);
  // Not credited a lead carry: they already have the cap.
  assert.equal(credit.get("skuldug").leadCarries, 0);
});

test("the carrier who died at the door is credited", () => {
  // Skuldug carries 38 seconds and loses it. Romek picks it up and walks it in.
  const drives = reconstructDrives(
    [
      pickup(10, "Skuldug", "blue"),
      drop(48, "Skuldug", "blue", 38_000),
      pickup(50, "Romek", "blue"),
    ],
    [capture(54, "red", "Romek")],
  );

  assert.equal(drives.length, 1);
  const drive = drives[0];

  assert.equal(drive.solo, false, "two carriers is not a solo cap");
  assert.equal(drive.capper, "Romek");
  assert.equal(drive.leadCarrier, "Skuldug", "the lead carrier did the distance");
  assert.deepEqual(
    drive.carriers.map((c) => c.name),
    ["Skuldug", "Romek"],
    "carriers are ordered by time held",
  );

  const credit = creditDrives(drives);
  assert.equal(credit.get("romek").relayCaps, 1);
  assert.equal(credit.get("romek").soloCaps, 0);
  assert.equal(credit.get("skuldug").leadCarries, 1, "this is the invisible stat");
  assert.equal(credit.get("skuldug").soloCaps, 0);
});

test("a returned flag credits nobody", () => {
  const drives = reconstructDrives(
    [
      pickup(10, "Skuldug", "blue"),
      drop(20, "Skuldug", "blue", 10_000),
      returned(25, "blue"),
    ],
    [],
  );

  assert.equal(drives.length, 0);
});

test("a failed drive does not leak into the next one", () => {
  const drives = reconstructDrives(
    [
      pickup(10, "Skuldug", "blue"),
      drop(20, "Skuldug", "blue", 10_000),
      returned(25, "blue"),
      pickup(60, "Romek", "blue"),
    ],
    [capture(70, "red", "Romek")],
  );

  assert.equal(drives.length, 1);
  assert.equal(drives[0].solo, true, "Skuldug's failed attempt is not part of this");
  assert.deepEqual(drives[0].carriers.map((c) => c.name), ["Romek"]);
});

test("a capture by red is a capture of the blue flag", () => {
  const drives = reconstructDrives(
    [pickup(10, "SiD", "blue"), pickup(12, "Medeo", "red")],
    [capture(30, "red", "SiD")],
  );

  // Only the blue flag drive resolved. The red flag is still out.
  assert.equal(drives.length, 1);
  assert.equal(drives[0].flagOwner, "blue");
  assert.equal(drives[0].capper, "SiD");
});

test("both flags can be in play at once without mixing", () => {
  const drives = reconstructDrives(
    [pickup(10, "SiD", "blue"), pickup(12, "Medeo", "red")],
    [capture(30, "red", "SiD"), capture(35, "blue", "Medeo")],
  );

  assert.equal(drives.length, 2);
  assert.deepEqual(drives.map((d) => d.flagOwner), ["blue", "red"]);
  assert.deepEqual(drives.map((d) => d.capper), ["SiD", "Medeo"]);
});

test("repeat carries by the same player are one total, not two carriers", () => {
  const drives = reconstructDrives(
    [
      pickup(10, "Skuldug", "blue"),
      drop(20, "Skuldug", "blue", 10_000),
      pickup(24, "Skuldug", "blue"),
    ],
    [capture(30, "red", "Skuldug")],
  );

  assert.equal(drives[0].carriers.length, 1);
  assert.equal(drives[0].solo, true);
  assert.equal(drives[0].carriers[0].carryMs, 10_000 + 6_000);
});

test("three carriers still name only the longest as lead", () => {
  const drives = reconstructDrives(
    [
      pickup(0, "A", "blue"),
      drop(5, "A", "blue", 5_000),
      pickup(6, "B", "blue"),
      drop(36, "B", "blue", 30_000),
      pickup(38, "C", "blue"),
    ],
    [capture(40, "red", "C")],
  );

  const drive = drives[0];
  assert.equal(drive.leadCarrier, "B");
  assert.equal(drive.solo, false);

  const credit = creditDrives(drives);
  assert.equal(credit.get("b").leadCarries, 1);
  assert.equal(credit.get("a").leadCarries, 0, "A carried, but not the longest");
  assert.equal(credit.get("c").relayCaps, 1);
});

test("a capper with no recorded pickup is still counted as a carrier", () => {
  // The log can miss a pickup. Without this the drive would have no carriers
  // and the capper would vanish from their own capture.
  const drives = reconstructDrives([], [capture(30, "red", "SiD")]);

  assert.equal(drives.length, 1);
  assert.deepEqual(drives[0].carriers.map((c) => c.name), ["SiD"]);
  assert.equal(drives[0].solo, true);
});

test("winning carry time only counts drives that scored", () => {
  const drives = reconstructDrives(
    [
      pickup(0, "A", "blue"),
      drop(30, "A", "blue", 30_000),
      returned(31, "blue"),
      pickup(60, "A", "blue"),
    ],
    [capture(70, "red", "A")],
  );

  const credit = creditDrives(drives);
  // The 30 seconds on the failed drive do not count. Only the 10 that scored.
  assert.equal(credit.get("a").winningCarryMs, 10_000);
});

/* --- overtime, where the match clock restarts ----------------------------- */

/*
 * The match clock goes back to zero for extra time, so an overtime event has a
 * smaller `elapsedSeconds` than the first minute of regulation. Sorting on it
 * put the extra period first and shuffled the flag's journey. On the three
 * overtime matches on record that turned two of Romek's solo captures into
 * relays and credited a drive to somebody with no part in it.
 *
 * `observedAt` is a real instant and is on every event on record, so it wins
 * where the whole match has it.
 */
const at = (seconds) => new Date(Date.UTC(2026, 6, 30, 20, 0, seconds)).toISOString();

const timedPickup = (clock, observed, player, flag) => ({
  ...pickup(clock, player, flag),
  observedAt: at(observed),
});

const timedCapture = (clock, observed, team, player) => ({
  elapsedSeconds: clock,
  team,
  playerName: player,
  observedAt: at(observed),
});

test("overtime is ordered by when it happened, not by the restarted clock", () => {
  // Regulation: SiD carries from 8:00 and caps at 8:56. Overtime: Romek picks
  // up 2 seconds in and caps at 5. On the match clock the overtime pair sorts
  // first and Romek's pickup lands inside SiD's drive, making it a relay.
  const drives = reconstructDrives(
    [
      timedPickup(480, 480, "SiD", "blue"),
      timedPickup(2, 600, "Romek", "blue"),
    ],
    [
      timedCapture(536, 536, "red", "SiD"),
      timedCapture(5, 603, "red", "Romek"),
    ],
  );

  assert.equal(drives.length, 2);
  // Two separate solo runs, which is what happened.
  assert.deepEqual(
    drives.map((drive) => drive.capper),
    ["SiD", "Romek"],
  );
  assert.equal(drives[0].solo, true);
  assert.equal(drives[1].solo, true);

  const credit = creditDrives(drives);
  assert.equal(credit.get("sid").soloCaps, 1);
  assert.equal(credit.get("romek").soloCaps, 1);
  assert.equal(credit.get("romek").relayCaps, 0);
});

test("without timestamps it still uses the match clock", () => {
  // Every older export predates observed_at, and their matches must keep
  // reconstructing exactly as before rather than collapsing to one order.
  const drives = reconstructDrives(
    [pickup(10, "Skuldug", "blue")],
    [capture(40, "red", "Skuldug")],
  );

  assert.equal(drives.length, 1);
  assert.equal(drives[0].capper, "Skuldug");
});

test("a partly timestamped match falls back rather than mixing two clocks", () => {
  // An epoch in milliseconds and a match clock in seconds sort far worse
  // together than either does alone, so coverage has to be all or nothing.
  const drives = reconstructDrives(
    [
      timedPickup(10, 10, "Skuldug", "blue"),
      { ...pickup(30, "Medeo", "red"), observedAt: null },
    ],
    [capture(40, "red", "Skuldug"), capture(60, "blue", "Medeo")],
  );

  assert.equal(drives.length, 2);
  assert.equal(drives[0].capper, "Skuldug");
  assert.equal(drives[1].capper, "Medeo");
});

test("carry times are whole milliseconds, because the column is an integer", () => {
  /*
   * A regression that took ingest down. Re-timing onto observed_at made the
   * clock fractional, so carry arithmetic produced 27113.999999999975 and
   * every insert failed on `winning_carry_ms`, which is a Postgres integer.
   *
   * The timestamps below are deliberately not whole seconds apart.
   */
  const odd = (ms) => new Date(Date.UTC(2026, 6, 30, 20, 0, 0, ms)).toISOString();

  const drives = reconstructDrives(
    [
      { ...pickup(0, "SiD", "blue"), observedAt: odd(1) },
      { ...pickup(1, "Romek", "blue"), observedAt: odd(14781) },
    ],
    [
      { elapsedSeconds: 2, team: "red", playerName: "Romek", observedAt: odd(27114) },
    ],
  );

  const credit = creditDrives(drives);

  for (const [name, entry] of credit) {
    assert.ok(
      Number.isInteger(entry.winningCarryMs),
      `${name} carried a fractional ${entry.winningCarryMs}ms`,
    );
  }

  for (const drive of drives) {
    for (const carrier of drive.carriers) {
      assert.ok(
        Number.isInteger(carrier.carryMs),
        `${carrier.name} has a fractional carry of ${carrier.carryMs}ms`,
      );
    }
  }
});

/* --- the flag's journey, which is the only measurable capture time --------- */

/*
 * The board led with a 2.7 second capture. The server's `fastest_capture_ms` is
 * one scalar per player per match with no link to a particular capture, so what
 * it measured could never be checked, and filtering on `relay_caps = 0` could
 * not save it: that player really did have a single unrelayed capture.
 *
 * What is measurable is the flag's own journey, from leaving its stand to being
 * touched down, on drives one person carried the whole way. A return resets a
 * drive, which is what guarantees it starts from home.
 */

test("a solo drive measures from the stand to the capture", () => {
  const drives = reconstructDrives(
    [pickup(10, "Skuldug", "blue")],
    [capture(40, "red", "Skuldug")],
  );

  assert.equal(drives[0].journeyMs, 30_000);
  assert.equal(creditDrives(drives).get("skuldug").fastestSoloCaptureMs, 30_000);
});

test("the journey includes time the flag spent on the floor", () => {
  // One carrier, dropped and retaken by the same player. Their possession is
  // twenty seconds; the flag took forty to get home, and the flag is the thing
  // being timed.
  const drives = reconstructDrives(
    [
      pickup(10, "Skuldug", "blue"),
      drop(20, "Skuldug", "blue", 10_000),
      pickup(40, "Skuldug", "blue"),
    ],
    [capture(50, "red", "Skuldug")],
  );

  assert.equal(drives[0].solo, true);
  assert.equal(drives[0].journeyMs, 40_000);
});

test("a relay credits nobody a solo time", () => {
  const drives = reconstructDrives(
    [
      pickup(10, "Romek", "blue"),
      drop(30, "Romek", "blue", 20_000),
      pickup(31, "SiD", "blue"),
    ],
    [capture(35, "red", "SiD")],
  );

  assert.equal(drives[0].solo, false);
  const credit = creditDrives(drives);
  assert.equal(credit.get("sid").fastestSoloCaptureMs, null);
  assert.equal(credit.get("romek").fastestSoloCaptureMs, null);
});

test("a return resets the journey, so the next run starts from the stand", () => {
  // The failure this guards: without the reset a capture would be timed from a
  // pickup that happened before the flag went home, inflating the journey.
  const drives = reconstructDrives(
    [
      pickup(10, "Skuldug", "blue"),
      drop(20, "Skuldug", "blue", 10_000),
      returned(25, "blue"),
      pickup(100, "Skuldug", "blue"),
    ],
    [capture(112, "red", "Skuldug")],
  );

  assert.equal(drives.length, 1);
  assert.equal(drives[0].journeyMs, 12_000);
});

test("the fastest of several solo runs is the one kept", () => {
  const drives = reconstructDrives(
    [
      pickup(10, "Skuldug", "blue"),
      returned(60, "blue"),
      pickup(100, "Skuldug", "blue"),
    ],
    [capture(50, "red", "Skuldug"), capture(115, "red", "Skuldug")],
  );

  assert.equal(creditDrives(drives).get("skuldug").fastestSoloCaptureMs, 15_000);
});

test("a lost pickup yields no time rather than an instant capture", () => {
  // The capper is added to a drive even when the log missed their pickup, which
  // would otherwise read as a zero second run and top the board forever.
  const drives = reconstructDrives([], [capture(30, "red", "SiD")]);

  assert.equal(drives[0].journeyMs, 0);
  assert.equal(creditDrives(drives).get("sid").fastestSoloCaptureMs, null);
});
