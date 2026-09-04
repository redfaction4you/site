/**
 * The rules that turn a file on disk into a catalogue entry.
 *
 * Every one of these is a decision that is permanent once made. A storage key
 * becomes the file's public URL forever and is unique in the database, so two
 * callers building one differently means an object nothing points at and a row
 * that cannot be replaced. A slug is the item's address. A wrong pick of which
 * file in a folder is "the download" publishes an entry whose download button
 * hands somebody a readme.
 *
 * The awkward filenames are real, taken from the map lists on our own servers.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  baseName,
  chooseDownload,
  contentTypeFor,
  extensionOf,
  isImageName,
  isNoiseName,
  normaliseReleasedOn,
  screenshotKeyFor,
  slugFromName,
  storageKeyFor,
  titleFromName,
  validateSidecar,
} from "../src/lib/ingest-rules.ts";

/* --- names ---------------------------------------------------------------- */

test("a name is stripped of its path and extension", () => {
  assert.equal(baseName("maps/CTF-Ankh_b12.rfl"), "CTF-Ankh_b12");
  assert.equal(baseName("pack\\levels\\dm04.rfl"), "dm04");
  assert.equal(baseName("noextension"), "noextension");
  assert.equal(extensionOf("thing.ZIP"), ".zip");
  assert.equal(extensionOf("noextension"), "");
  // A dotfile is not an extension.
  assert.equal(extensionOf(".gitignore"), "");
});

test("slugs survive the filenames this archive will actually be fed", () => {
  assert.equal(slugFromName("CTF-Ankh_b12.rfl"), "ctf-ankh-b12");
  assert.equal(slugFromName("dm- ARRRRRRGGGHHH!.rfl"), "dm-arrrrrrggghhh");
  assert.equal(slugFromName("DM-STUs Nighthawks~.rfl"), "dm-stus-nighthawks");
  assert.equal(slugFromName("dm_(MM)_rail arena.rfl"), "dm-mm-rail-arena");
  assert.equal(slugFromName("DM_Nikki's_Hide_and_Seek.rfl"), "dm-nikki-s-hide-and-seek");
  assert.equal(slugFromName("dm_{DVL} Boingy.rfl"), "dm-dvl-boingy");
});

test("a slug never begins or ends with a hyphen, however it was cut", () => {
  assert.equal(slugFromName("---odd---.rfl"), "odd");
  assert.equal(slugFromName("!!!.rfl"), "");
  // The length cap must not leave a trailing hyphen behind.
  const long = slugFromName("a".repeat(78) + " b.rfl");
  assert.ok(long.length <= 80);
  assert.doesNotMatch(long, /-$/);
});

test("nothing usable produces an empty slug rather than a bad address", () => {
  assert.equal(slugFromName("###.rfl"), "");
  assert.equal(slugFromName(""), "");
});

test("a placeholder title tidies separators and invents no capitals", () => {
  assert.equal(titleFromName("DM_Nikki's_Hide_and_Seek.rfl"), "DM Nikki's Hide and Seek");
  assert.equal(titleFromName("ctfwlpro.rfl"), "ctfwlpro");
  assert.equal(titleFromName("dm-  spaced   out.rfl"), "dm- spaced out");
});

/* --- classifying what is in a folder -------------------------------------- */

test("images are recognised and packaging is ignored", () => {
  for (const name of ["shot.jpg", "SHOT.JPEG", "a.png", "b.webp", "c.gif"]) {
    assert.equal(isImageName(name), true, name);
  }
  assert.equal(isImageName("map.rfl"), false);

  for (const name of ["Thumbs.db", "desktop.ini", ".DS_Store", "._resource", "item.json"]) {
    assert.equal(isNoiseName(name), true, name);
  }
  assert.equal(isNoiseName("readme.txt"), false);
});

test("the one download in a folder is chosen, and ambiguity is refused", () => {
  const clean = chooseDownload(["ctf-ankh.zip", "01.jpg", "02.jpg", "Thumbs.db", "item.json"]);
  assert.equal(clean.file, "ctf-ankh.zip");
  assert.deepEqual(clean.images, ["01.jpg", "02.jpg"]);
  assert.equal(clean.problem, null);

  // Two candidates is a question for a person, never a guess.
  const ambiguous = chooseDownload(["map.rfl", "map_old.rfl"]);
  assert.equal(ambiguous.file, null);
  assert.match(ambiguous.problem, /2 candidate files/);

  const imagesOnly = chooseDownload(["01.jpg"]);
  assert.equal(imagesOnly.file, null);
  assert.match(imagesOnly.problem, /only images/);
});

test("images come back in a stable order, because their order is their position", () => {
  const { images } = chooseDownload(["map.zip", "03-c.jpg", "01-a.jpg", "02-b.jpg"]);
  assert.deepEqual(images, ["01-a.jpg", "02-b.jpg", "03-c.jpg"]);
});

/* --- storage keys --------------------------------------------------------- */

test("a storage key groups an item's objects and is derived, never random", () => {
  assert.equal(
    storageKeyFor("map", "ctf-ankh-b12", "CTF-Ankh_b12.zip"),
    "catalogue/map/ctf-ankh-b12/CTF-Ankh_b12.zip",
  );
  // Same inputs, same key: re-ingesting a corrected file overwrites rather than
  // orphaning the old object.
  assert.equal(
    storageKeyFor("map", "ctf-ankh-b12", "CTF-Ankh_b12.zip"),
    storageKeyFor("map", "ctf-ankh-b12", "CTF-Ankh_b12.zip"),
  );
});

test("a filename out of a 2003 zip cannot escape its prefix", () => {
  const key = storageKeyFor("map", "x", "../../../etc/passwd");
  assert.equal(key, "catalogue/map/x/passwd");
  assert.ok(!key.includes(".."));

  const spaced = storageKeyFor("map", "x", "dm- ARRRRRRGGGHHH!.rfl");
  assert.equal(spaced, "catalogue/map/x/dm-ARRRRRRGGGHHH-.rfl");
  assert.doesNotMatch(spaced, /[^A-Za-z0-9._\-/]/);
});

test("a key never starts with backups, which r2.ts refuses outright", () => {
  const key = storageKeyFor("map", "backups", "x.zip");
  assert.ok(key.startsWith("catalogue/"), key);
});

test("screenshot keys carry their order", () => {
  assert.equal(
    screenshotKeyFor("map", "ankh", 0, "mid.jpg"),
    "catalogue/map/ankh/shots/01-mid.jpg",
  );
  assert.equal(
    screenshotKeyFor("map", "ankh", 9, "mid.jpg"),
    "catalogue/map/ankh/shots/10-mid.jpg",
  );
});

/* --- content types -------------------------------------------------------- */

test("unknown types download rather than trying to display", () => {
  assert.equal(contentTypeFor("a.zip"), "application/zip");
  assert.equal(contentTypeFor("a.jpg"), "image/jpeg");
  assert.equal(contentTypeFor("a.JPEG"), "image/jpeg");
  // A level, a packfile and anything else the archive holds.
  assert.equal(contentTypeFor("a.rfl"), "application/octet-stream");
  assert.equal(contentTypeFor("a.vpp"), "application/octet-stream");
  assert.equal(contentTypeFor("a.v3d"), "application/octet-stream");
});

/* --- the sidecar ---------------------------------------------------------- */

test("a good sidecar passes and a bad one says which field", () => {
  assert.deepEqual(validateSidecar({ title: "Ankh", tags: ["ctf"] }), []);
  assert.deepEqual(validateSidecar({}), []);

  assert.deepEqual(validateSidecar([]), ["item.json must be a JSON object"]);
  assert.deepEqual(validateSidecar(null), ["item.json must be a JSON object"]);
  assert.ok(validateSidecar({ title: 5 }).includes("title must be a string"));
  assert.ok(validateSidecar({ tags: "ctf" }).includes("tags must be an array of strings"));
  assert.ok(validateSidecar({ tags: [1] }).includes("tags must be an array of strings"));
});

test("a release date is a year or a full date, and anything else is named", () => {
  assert.deepEqual(validateSidecar({ releasedOn: "2003" }), []);
  assert.deepEqual(validateSidecar({ releasedOn: "2003-06-14" }), []);
  assert.ok(
    validateSidecar({ releasedOn: "June 2003" }).includes(
      "releasedOn must be YYYY-MM-DD or YYYY",
    ),
  );

  assert.equal(normaliseReleasedOn("2003"), "2003-01-01");
  assert.equal(normaliseReleasedOn("2003-06-14"), "2003-06-14");
  assert.equal(normaliseReleasedOn("nonsense"), null);
  assert.equal(normaliseReleasedOn(undefined), null);
});

test("a changelog entry must have a title, and its date must be a date", () => {
  assert.deepEqual(validateSidecar({ updates: [{ title: "Spawn fix" }] }), []);
  assert.ok(validateSidecar({ updates: [{}] }).includes("updates[0].title is required"));
  assert.ok(
    validateSidecar({ updates: [{ title: "x", releasedAt: "soon" }] }).includes(
      "updates[0].releasedAt must be a date",
    ),
  );
  assert.ok(validateSidecar({ updates: {} }).includes("updates must be an array"));
});
