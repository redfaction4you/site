/**
 * Which names may be pinned to somebody.
 *
 * The case this exists for: a player page is reached by name, so a display name
 * nobody played under is a name whose page 404s, on every link to it from every
 * board. The admin page accepted any forty characters until 9 August.
 *
 * The second case is `cowboy dan`, which is real and on record twice: $t!nX
 * used it on 6 August and Skuldug on 7 August. It is a legal name for neither,
 * because a page reached by it would have to pick one of them.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { checkDisplayName, collidingNames } from "../src/lib/matches/display-name.ts";

const TINX = "b87a05";
const SKULDUG = "50ee02";
const ROMEK = "1614d7";

const USED = [
  { key: TINX, name: "$t!nX" },
  { key: TINX, name: "cowboy dan" },
  { key: TINX, name: "skrub" },
  { key: SKULDUG, name: "Skuldug" },
  { key: SKULDUG, name: "cowboy dan" },
  { key: SKULDUG, name: "s9!nX" },
  { key: ROMEK, name: "Romek" },
  { key: ROMEK, name: "Special ED" },
];

test("a name they played under is theirs to be called", () => {
  assert.equal(checkDisplayName("$t!nX", TINX, USED), "ok");
  assert.equal(checkDisplayName("skrub", TINX, USED), "ok");
  assert.equal(checkDisplayName("Special ED", ROMEK, USED), "ok");
});

test("case and surrounding space do not decide it", () => {
  assert.equal(checkDisplayName("  ROMEK ", ROMEK, USED), "ok");
});

test("a name nobody played under is refused, because its page would 404", () => {
  assert.equal(checkDisplayName("The Boss", ROMEK, USED), "not-on-record");
  assert.equal(checkDisplayName("Romekk", ROMEK, USED), "not-on-record");
});

test("a name two people played under is refused for both", () => {
  assert.equal(checkDisplayName("cowboy dan", TINX, USED), "ambiguous");
  assert.equal(checkDisplayName("cowboy dan", SKULDUG, USED), "ambiguous");
});

test("somebody else's name is refused", () => {
  assert.equal(checkDisplayName("Skuldug", ROMEK, USED), "ambiguous");
});

test("clearing a name is always allowed", () => {
  // Blank goes back to the most used name, which is on record by definition.
  assert.equal(checkDisplayName("", ROMEK, USED), "ok");
  assert.equal(checkDisplayName("   ", ROMEK, USED), "ok");
});

test("two people shown under one name are reported", () => {
  assert.deepEqual(
    collidingNames([
      { identityKey: "a", displayName: "Default" },
      { identityKey: "b", displayName: "Default" },
      { identityKey: "c", displayName: "Romek" },
    ]),
    ["Default"],
  );
});

test("nobody colliding is an empty list, and case still counts as a collision", () => {
  assert.deepEqual(
    collidingNames([
      { identityKey: "a", displayName: "Romek" },
      { identityKey: "b", displayName: "Skuldug" },
    ]),
    [],
  );
  assert.deepEqual(
    collidingNames([
      { identityKey: "a", displayName: "SiD" },
      { identityKey: "b", displayName: "sid" },
    ]),
    ["SiD", "sid"],
  );
});
