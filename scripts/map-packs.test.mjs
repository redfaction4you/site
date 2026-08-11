/**
 * The four map pack rules, none of which could be tested before.
 *
 * They lived in a module that imports the database. That matters more here
 * than it looks, because every one of these fails silently in production:
 *
 * - a filename the server cannot load is dropped at config load and the
 *   rotation quietly shortens, while the site lists the full pack;
 * - a curly quote reaches a 2001 bitmap font, which is how the first real pack
 *   name arrived broken;
 * - the fingerprint decides whether the DM server restarts, so a field wrongly
 *   included bounces a server full of people over a wording change, and one
 *   wrongly excluded leaves the old rotation running.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  asciiForGame,
  fingerprintOf,
  isLevelFilename,
  welcomeFor,
} from "../src/lib/map-pack-rules.ts";

/* --- filenames ------------------------------------------------------------ */

test("a filename the server can load is accepted", () => {
  for (const name of [
    "dm04.rfl",
    "glass_house.rfl",
    "Shattered Gorge Mini v2.1.rfl",
    "warlords-pro(no fog).rfl",
    "ctf[pro].rfl",
  ]) {
    assert.equal(isLevelFilename(name), true, name);
  }
});

test("anything the server would drop is refused", () => {
  for (const name of [
    "dm04",
    "dm04.rf",
    "dm04.rfl.txt",
    "maps/dm04.rfl",
    "dm04.rfl; rm -rf",
    "",
    "   ",
    // The length cap is on the stem, not the whole name: 64 characters before
    // `.rfl` is fine and 65 is not.
    `${"a".repeat(65)}.rfl`,
  ]) {
    assert.equal(isLevelFilename(name), false, JSON.stringify(name));
  }
});

test("the length cap is on the part before .rfl", () => {
  assert.equal(isLevelFilename(`${"a".repeat(64)}.rfl`), true);
  assert.equal(isLevelFilename(`${"a".repeat(65)}.rfl`), false);
});

test("surrounding space does not make a good filename bad", () => {
  assert.equal(isLevelFilename("  dm04.rfl  "), true);
});

/* --- text bound for the game ---------------------------------------------- */

test("the punctuation a browser gives you for free is folded to ASCII", () => {
  // The real case: the first pack name was typed with an em dash.
  assert.equal(
    asciiForGame("RedFaction4You.com [DM] — Stock Favourites"),
    "RedFaction4You.com [DM] - Stock Favourites",
  );
  assert.equal(asciiForGame("Bob’s pack"), "Bob's pack");
  assert.equal(asciiForGame("“quoted”"), '"quoted"');
  assert.equal(asciiForGame("wait…"), "wait...");
});

test("anything else outside printable ASCII is dropped, not guessed at", () => {
  assert.equal(asciiForGame("Halloween 🎃 pack"), "Halloween pack");
  assert.equal(asciiForGame("naïve"), "nave");
});

test("runs of whitespace collapse, so a line cannot arrive ragged", () => {
  assert.equal(asciiForGame("  two   words  "), "two words");
});

/* --- the welcome message -------------------------------------------------- */

test("a pack with no message of its own gets one written from it", () => {
  const message = welcomeFor({
    name: "Stock Favourites",
    welcomeMessage: null,
    maps: [{ filename: "a.rfl" }, { filename: "b.rfl" }, { filename: "c.rfl" }],
  });
  assert.match(message, /^Now playing: Stock Favourites - 3 maps\./);
  // It used to end by pointing at the map list. It points at the stats now,
  // because what a newcomer needs to know is that they are being recorded.
  assert.match(message, /RedFaction4You\.com\/stats$/);
});

test("one map is not 1 maps", () => {
  const message = welcomeFor({
    name: "Solo",
    welcomeMessage: null,
    maps: [{ filename: "a.rfl" }],
  });
  assert.match(message, /- 1 map\./);
});

test("a message of its own wins, and is still folded to ASCII", () => {
  assert.equal(
    welcomeFor({
      name: "Halloween",
      welcomeMessage: "Ten maps — all haunted",
      maps: [],
    }),
    "Ten maps - all haunted",
  );
});

/* --- the fingerprint ------------------------------------------------------ */

const PACK = {
  slug: "stock-favourites",
  serverName: "RF4U [DM]",
  welcomeMessage: "Now playing",
  levels: ["dm04.rfl", "dm07.rfl"],
};

test("the same pack fingerprints the same way twice", () => {
  assert.equal(fingerprintOf(PACK), fingerprintOf({ ...PACK }));
});

test("anything the server would notice changes the fingerprint", () => {
  const before = fingerprintOf(PACK);
  assert.notEqual(before, fingerprintOf({ ...PACK, slug: "other" }));
  assert.notEqual(before, fingerprintOf({ ...PACK, serverName: "RF4U [DM] x" }));
  assert.notEqual(before, fingerprintOf({ ...PACK, welcomeMessage: "Something" }));
  assert.notEqual(before, fingerprintOf({ ...PACK, levels: ["dm04.rfl"] }));
});

test("the order of the rotation is part of it", () => {
  // A rotation running in a different order is a different rotation, and this
  // is the one people assume is only a set.
  assert.notEqual(
    fingerprintOf(PACK),
    fingerprintOf({ ...PACK, levels: ["dm07.rfl", "dm04.rfl"] }),
  );
});

test("a null server name is not the same as an empty one", () => {
  assert.notEqual(
    fingerprintOf({ ...PACK, serverName: null }),
    fingerprintOf({ ...PACK, serverName: "" }),
  );
});

/*
 * The live pack, pinned.
 *
 * The VPS restarts the deathmatch server when this value differs from the one
 * it last applied, so the fingerprint is a contract with another machine and
 * not an implementation detail. Read from production on 10 August 2026, and
 * asserted here so that moving this code — as it was moved out of
 * `map-packs.ts` — cannot bounce a server full of people as a side effect.
 *
 * **If this fails, ask why before changing it.** A deliberate change to the
 * welcome wording or the level order is supposed to fail it; the fix is to
 * update the value in the same commit. Anything else failing it means a
 * refactor has changed what the server is told.
 */
/*
 * Updated deliberately on 10 August, which is what this test is for.
 *
 * Two changes were asked for and both move it: Glass House came out of the
 * rotation, and the generated welcome now tells a newcomer how stats work here
 * rather than where the map list is. The old value was f28453bc947e4e87 against
 * three levels and the old wording. Anything else moving this is a refactor
 * quietly telling the DM server to restart.
 */
test("the fingerprint of the live pack has not moved", () => {
  assert.equal(
    fingerprintOf({
      slug: "stock-favourites",
      serverName: "RedFaction4You.com [DM] - Stock Favourites",
      welcomeMessage:
        "Now playing: Stock Favourites - 2 maps. All play here is recorded and ranked on time played. Your stats: RedFaction4You.com/stats",
      levels: ["dm04.rfl", "dm07.rfl"],
    }),
    "fb2c1151039e3f49",
  );
});

test("the welcome message a pack writes for itself matches the live one", () => {
  // The two halves of the same contract: this is what `toActive` feeds into
  // the fingerprint above, so if they drift the server restarts for nothing.
  assert.equal(
    welcomeFor({
      name: "Stock Favourites",
      welcomeMessage: null,
      maps: [
        { filename: "dm04.rfl", title: "Badlands" },
        { filename: "dm07.rfl", title: "High Rise" },
      ],
    }),
    "Now playing: Stock Favourites - 2 maps. All play here is recorded and ranked on time played. Your stats: RedFaction4You.com/stats",
  );
});

test("the welcome says how this server records, not how the match server does", () => {
  // The distinction a newcomer actually needs. DM records everything and ranks
  // on time; the match server only records inside a started match. Saying the
  // wrong one is worse than saying nothing.
  const welcome = welcomeFor({
    name: "Anything",
    welcomeMessage: null,
    maps: [{ filename: "a.rfl" }],
  });
  assert.match(welcome, /recorded/);
  assert.match(welcome, /time played/);
  assert.match(welcome, /RedFaction4You\.com\/stats/);
});
