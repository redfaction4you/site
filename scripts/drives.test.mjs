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
