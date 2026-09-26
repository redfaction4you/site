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
    /*
     * Every one of these is a real Red Faction level and every one was being
     * silently dropped from its rotation.
     *
     * The rule was an allowlist of `A-Za-z0-9 _.-()[]`, which looks careful and
     * threw away eighteen maps across the packs: fourteen of the hundred and
     * fifty-six in Novelty Maps alone. The failure had no symptom, because a
     * dropped level just makes the rotation shorter while the site goes on
     * listing the full pack, which is exactly what the module header warns
     * about. It surfaced as one map missing from a written config: 69 levels
     * where the pack held 70.
     */
    "DM-STUs Nighthawks~.rfl",
    "DM-Blundersgumball~~~.rfl",
    "dm_{DVL} Boingy.rfl",
    "DM-Sneeky's.rfl",
    "DM_Nikki's_Hide_and_Seek.rfl",
    "dm- ARRRRRRGGGHHH!.rfl",
    "dm_(MM)_rail arena.rfl",
    "Dm. in het bos.rfl",
    "kma Dm s7.rfl",
  ]) {
    assert.equal(isLevelFilename(name), true, name);
  }
});

test("what is refused is what a filesystem refuses, and nothing more", () => {
  // The forbidden set is the one Windows actually rejects, matching
  // cleanLevelName on the VPS. A mapper in 2003 could name a file anything the
  // filesystem accepted, so anything it accepted has to be allowed here.
  for (const name of [
    'dm"quoted".rfl',
    "dm<redirect>.rfl",
    "dm|pipe.rfl",
    "dm:colon.rfl",
    "dm*star.rfl",
    "dm?ask.rfl",
    ".hidden.rfl",
    "..\escape.rfl",
  ]) {
    assert.equal(isLevelFilename(name), false, JSON.stringify(name));
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
    server: "themed",
    welcomeMessage: null,
    maps: [{ filename: "a.rfl" }, { filename: "b.rfl" }, { filename: "c.rfl" }],
  });
  assert.match(message, /^Now playing: Stock Favourites - 3 maps\./);
  // It ends on the server's own page, which is where the whole list is. From
  // 10 August it pointed at the stats instead; stats stopped on 25 September.
  assert.match(message, /RedFaction4You\.com\/themed$/);
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
 *
 * Updated deliberately again on 25 September 2026, when RF4U stopped recording
 * stats: the generated welcome went back to pointing at the server's own page.
 * The value before that was fb2c1151039e3f49.
 */
test("the fingerprint of the live pack has not moved", () => {
  assert.equal(
    fingerprintOf({
      slug: "stock-favourites",
      serverName: "RedFaction4You.com [DM] - Stock Favourites",
      welcomeMessage:
        "Now playing: Stock Favourites - 2 maps. Every map on this server: RedFaction4You.com/themed",
      levels: ["dm04.rfl", "dm07.rfl"],
    }),
    "1dc5a9efdef00ad3",
  );
});

test("the welcome message a pack writes for itself matches the live one", () => {
  // The two halves of the same contract: this is what `toActive` feeds into
  // the fingerprint above, so if they drift the server restarts for nothing.
  assert.equal(
    welcomeFor({
      name: "Stock Favourites",
      server: "themed",
      welcomeMessage: null,
      maps: [
        { filename: "dm04.rfl", title: "Badlands" },
        { filename: "dm07.rfl", title: "High Rise" },
      ],
    }),
    "Now playing: Stock Favourites - 2 maps. Every map on this server: RedFaction4You.com/themed",
  );
});

test("the generated welcome sends people to the server's own page", () => {
  for (const server of ["themed", "novelty", "halloween"]) {
    const welcome = welcomeFor({
      name: "Anything",
      server,
      welcomeMessage: null,
      maps: [{ filename: "a.rfl" }],
    });
    assert.ok(welcome.endsWith(`RedFaction4You.com/${server}`), welcome);
  }
});

test("with no server named, the generated welcome still lands somewhere", () => {
  const welcome = welcomeFor({
    name: "Anything",
    welcomeMessage: null,
    maps: [{ filename: "a.rfl" }],
  });
  assert.ok(welcome.endsWith("RedFaction4You.com/servers"), welcome);
});

test("the generated welcome promises no stats", () => {
  // RF4U stopped recording on 25 September 2026. A server telling everybody who
  // joins that they are recorded and ranked would be untrue on arrival.
  const welcome = welcomeFor({
    name: "Anything",
    server: "themed",
    welcomeMessage: null,
    maps: [{ filename: "a.rfl" }],
  });
  assert.doesNotMatch(welcome, /record|ranked|stats/i);
});
