/**
 * The weapon totals.
 *
 * Two of these are about real rows in the archive rather than invented ones:
 * the Rail Driver reports 2,595 hits from 825 shots across two player rows, and
 * the Rocket Launcher reports 72 kills from zero shots. Both would publish a
 * confident wrong number if the summing treated them as ordinary.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { summariseWeapons } from "../src/lib/matches/weapons.ts";

const row = (name, weapon, kills, shotsFired, shotsHit) => ({
  name,
  weapon,
  kills,
  shotsFired,
  shotsHit,
});

const find = (totals, weapon) => totals.find((entry) => entry.weapon === weapon);

test("shots and hits are summed across every row of a weapon", () => {
  const totals = summariseWeapons([
    row("Ada", "Assault Rifle", 3, 100, 20),
    row("Bo", "Assault Rifle", 1, 100, 10),
  ]);

  const rifle = find(totals, "Assault Rifle");
  assert.equal(rifle.kills, 4);
  assert.equal(rifle.shotsFired, 200);
  assert.equal(rifle.shotsHit, 30);
  assert.equal(rifle.accuracy, 0.15);
});

test("a weapon that records no shots gets no accuracy, not a zero", () => {
  const totals = summariseWeapons([row("Ada", "Rocket Launcher", 72, 0, 0)]);

  const rockets = find(totals, "Rocket Launcher");
  assert.equal(rockets.kills, 72);
  assert.equal(rockets.accuracy, null);
  assert.equal(rockets.tracksShots, false);
});

test("a row with more hits than shots is left out of the accuracy", () => {
  const totals = summariseWeapons([
    row("Ada", "Rail Driver", 10, 800, 160),
    // The broken one. Kept out of the shooting figures and counted.
    row("Bo", "Rail Driver", 5, 25, 2435),
  ]);

  const rail = find(totals, "Rail Driver");
  assert.equal(rail.shotsFired, 800);
  assert.equal(rail.shotsHit, 160);
  assert.equal(rail.accuracy, 0.2);
  assert.equal(rail.unsoundRows, 1);
});

test("a broken row still counts its kills, since those are a separate record", () => {
  const totals = summariseWeapons([row("Ada", "Rail Driver", 5, 25, 2435)]);

  const rail = find(totals, "Rail Driver");
  assert.equal(rail.kills, 5);
  assert.equal(rail.accuracy, null);
  assert.equal(rail.tracksShots, true);
});

test("kill share is over every weapon, and adds up to one", () => {
  const totals = summariseWeapons([
    row("Ada", "Assault Rifle", 30, 100, 20),
    row("Ada", "Sniper Rifle", 10, 50, 20),
  ]);

  assert.equal(find(totals, "Assault Rifle").killShare, 0.75);
  assert.equal(find(totals, "Sniper Rifle").killShare, 0.25);
  assert.equal(
    totals.reduce((sum, entry) => sum + entry.killShare, 0),
    1,
  );
});

test("the best shot with a weapon is totalled per player, not per row", () => {
  const totals = summariseWeapons([
    row("Ada", "Assault Rifle", 4, 100, 20),
    row("Ada", "Assault Rifle", 4, 100, 20),
    row("Bo", "Assault Rifle", 7, 100, 20),
  ]);

  assert.deepEqual(find(totals, "Assault Rifle").topKiller, { name: "Ada", kills: 8 });
});

test("case drift does not split one player's weapon kills", () => {
  const totals = summariseWeapons([
    row("Ada", "Sniper Rifle", 3, 10, 5),
    row("ada", "Sniper Rifle", 3, 10, 5),
    row("Bo", "Sniper Rifle", 5, 10, 5),
  ]);

  assert.equal(find(totals, "Sniper Rifle").topKiller.kills, 6);
});

test("nobody has killed with it, so nobody is named", () => {
  const totals = summariseWeapons([row("Ada", "Sniper Rifle", 0, 40, 2)]);

  assert.equal(find(totals, "Sniper Rifle").topKiller, null);
});

test("weapons come back with the deadliest first", () => {
  const totals = summariseWeapons([
    row("Ada", "12mm Pistol", 2, 10, 5),
    row("Ada", "Assault Rifle", 9, 10, 5),
    row("Ada", "Sniper Rifle", 5, 10, 5),
  ]);

  assert.deepEqual(
    totals.map((entry) => entry.weapon),
    ["Assault Rifle", "Sniper Rifle", "12mm Pistol"],
  );
});

test("nothing in, nothing out", () => {
  assert.deepEqual(summariseWeapons([]), []);
});
