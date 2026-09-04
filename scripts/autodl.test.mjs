/**
 * The autodownload lookup rules.
 *
 * These decide what a game client is told when it asks us for a level, and the
 * failure modes are unusually unforgiving. `parse_level_info` in Alpine's
 * `faction_files.cpp` reads five fields with `.at()`, which throws on a missing
 * key, and throws again on a zero size or an empty url. A throw there is not
 * read as "not found": it aborts the download with an error the player sees.
 * So an answer that is half populated is worse than no answer at all.
 *
 * The name fixtures are real, taken from the rotations on our own servers,
 * where the same map is spelled one way in a `.toml` and another way inside its
 * own zip.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  canAnswer,
  formatCheckAnswer,
  isLookupName,
  levelAnswer,
  levelKey,
  parseCheckBody,
} from "../src/lib/autodl-rules.ts";

/* --- matching a level name ------------------------------------------------ */

test("the same map spelled two ways matches", () => {
  // What the server asks for, against what we stored from inside the archive.
  assert.equal(levelKey("ctf-HunaB8.rfl"), levelKey("ctf-hunab8"));
  assert.equal(levelKey("maps/DM-Combat Arena.rfl"), levelKey("DM-Combat Arena.rfl"));
  assert.equal(levelKey("pack\\levels\\dm04.rfl"), levelKey("dm04"));
  assert.equal(levelKey("CTF-BTN-SGorge-Mini_v21.rfl"), "ctf-btn-sgorge-mini_v21");
});

test("matching is not so loose that it serves the wrong map", () => {
  // Punctuation is left alone on purpose: these are different levels.
  assert.notEqual(levelKey("dm-01.rfl"), levelKey("dm01.rfl"));
  assert.notEqual(levelKey("ctf-ankhb12.rfl"), levelKey("ctf-ankhb11.rfl"));
  assert.notEqual(levelKey("dm_space.rfl"), levelKey("dmspace.rfl"));
});

test("only the .rfl extension is stripped, since that is the one the game asks with", () => {
  assert.equal(levelKey("map.rfl"), "map");
  assert.equal(levelKey("map.vpp"), "map.vpp");
  assert.equal(levelKey("map"), "map");
});

/* --- what we are willing to look up --------------------------------------- */

test("a real filename is accepted and a path is not", () => {
  assert.equal(isLookupName("ctf-ankhb12.rfl"), true);
  assert.equal(isLookupName("dm- ARRRRRRGGGHHH!.rfl"), true);
  assert.equal(isLookupName("DM_Nikki's_Hide_and_Seek.rfl"), true);

  // These endpoints are public and unauthenticated, because a game client
  // cannot authenticate. The input is bounded rather than trusted.
  assert.equal(isLookupName(""), false);
  assert.equal(isLookupName("../../etc/passwd"), false);
  assert.equal(isLookupName("maps/thing.rfl"), false);
  assert.equal(isLookupName("a\\b.rfl"), false);
  assert.equal(isLookupName("x".repeat(200)), false);
});

/* --- the shape of an answer ----------------------------------------------- */

test("we only claim a level when we can answer completely", () => {
  const good = { title: "Ankh", sizeBytes: 13534961, downloadUrl: "https://files/x.zip" };
  assert.equal(canAnswer(good), true);

  // Each of these makes the client throw rather than fall back, so each must
  // read as "we do not have it".
  assert.equal(canAnswer({ ...good, sizeBytes: 0 }), false);
  assert.equal(canAnswer({ ...good, sizeBytes: null }), false);
  assert.equal(canAnswer({ ...good, downloadUrl: null }), false);
  assert.equal(canAnswer({ ...good, downloadUrl: "" }), false);
  assert.equal(canAnswer({ ...good, title: null }), false);
});

test("every field the client reads with .at() is always present", () => {
  const answer = levelAnswer({
    title: "Empty Space",
    author: null,
    description: null,
    sizeBytes: 5292,
    downloadUrl: "https://files.redfaction4you.com/catalogue/map/dm-space/dm_space.vpp",
  });

  // The five the parser demands. A missing one is an exception in the client.
  for (const field of ["title", "author", "description", "download_size", "download_url"]) {
    assert.ok(field in answer, `${field} must always be present`);
  }
  assert.equal(answer.author, "Unknown", "an unrecorded author is still a string");
  assert.equal(answer.description, "");
  assert.equal(typeof answer.download_size, "number");
  assert.ok(answer.download_size > 0);
});

test("the optional fields are omitted rather than sent empty", () => {
  const bare = levelAnswer({ title: "X", sizeBytes: 1, downloadUrl: "https://x" });
  assert.equal("image_url" in bare, false);
  assert.equal("site_url" in bare, false);

  const full = levelAnswer({
    title: "X",
    sizeBytes: 1,
    downloadUrl: "https://x",
    imageUrl: "https://shot.jpg",
    siteUrl: "https://redfaction4you.com/maps/x",
  });
  assert.equal(full.image_url, "https://shot.jpg");
  assert.equal(full.site_url, "https://redfaction4you.com/maps/x");
});

test("an author given as blank space is still answered as Unknown", () => {
  assert.equal(levelAnswer({ title: "X", author: "   ", sizeBytes: 1, downloadUrl: "u" }).author, "Unknown");
});

/* --- checkmaps ------------------------------------------------------------ */

test("the check body is names separated by semicolons", () => {
  assert.deepEqual(parseCheckBody("a.rfl;b.rfl;c.rfl"), ["a.rfl", "b.rfl", "c.rfl"]);
  assert.deepEqual(parseCheckBody("a.rfl"), ["a.rfl"]);
  assert.deepEqual(parseCheckBody(""), []);
});

test("blanks are dropped, because a reply line is paired to a request by index", () => {
  // A trailing separator must not add a phantom name, or every answer after it
  // describes the wrong map.
  assert.deepEqual(parseCheckBody("a.rfl;;b.rfl;"), ["a.rfl", "b.rfl"]);
  assert.deepEqual(parseCheckBody(" a.rfl ; b.rfl "), ["a.rfl", "b.rfl"]);
});

test("the answer is one line per name, in the order asked", () => {
  assert.equal(formatCheckAnswer([true, false, true]), "found\nnotfound\nfound");
  assert.equal(formatCheckAnswer([]), "");
  assert.equal(formatCheckAnswer([false]), "notfound");
});
