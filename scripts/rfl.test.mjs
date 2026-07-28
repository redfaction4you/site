/**
 * Tests for the RFL/VPP/ZIP readers.
 *
 *   npm test
 *
 * Every fixture here is built byte by byte from the published format
 * specifications, because we do not have a single real Red Faction file on
 * disk yet. That is worth stating plainly: these tests prove the parser matches
 * the spec as written, not that the spec matches what RED actually wrote in
 * 2001. The first real .vpp we get hold of is still a required test.
 *
 * Runs the TypeScript directly: Node 22 strips types, so there is no build step
 * between this file and the code the site ships.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";

import {
  compatibilityForRflVersion,
  crc32,
  inspectUpload,
  intersectClients,
  listVppEntries,
  looksLikeRfl,
  parseRflHeader,
  readVppEntry,
  RFL_MAGIC,
} from "../src/lib/rfl/index.ts";

// --------------------------------------------------------------------------
// Fixture builders
// --------------------------------------------------------------------------

const BLOCK = 0x800;
const align = (n) => Math.ceil(n / BLOCK) * BLOCK;

function vstring(text) {
  const bytes = Buffer.from(text, "latin1");
  const out = Buffer.alloc(2 + bytes.length);
  out.writeUInt16LE(bytes.length, 0);
  bytes.copy(out, 2);
  return out;
}

/** A level file with a valid header and a stub body. */
function buildRfl({
  version = 200,
  levelName = "dm_test",
  modName = "",
  timestamp = 1_000_000_000,
  magic = RFL_MAGIC,
  sections = 3,
} = {}) {
  const head = Buffer.alloc(28);
  head.writeUInt32LE(magic >>> 0, 0);
  head.writeInt32LE(version, 4);
  head.writeUInt32LE(timestamp, 8);
  head.writeUInt32LE(0, 12); // player start offset
  head.writeUInt32LE(0, 16); // level info offset
  head.writeUInt32LE(sections, 20);
  head.writeUInt32LE(0, 24); // combined section size

  const parts = [head, vstring(levelName)];
  if (version >= 0xb2) parts.push(vstring(modName));
  parts.push(Buffer.alloc(64)); // stub body

  return new Uint8Array(Buffer.concat(parts));
}

/** A VPP version 1 packfile. */
function buildVpp(files) {
  const header = Buffer.alloc(BLOCK);
  header.writeUInt32LE(0x51890ace, 0);
  header.writeUInt32LE(1, 4);
  header.writeUInt32LE(files.length, 8);

  const directory = Buffer.alloc(files.length * 64);
  files.forEach((file, i) => {
    Buffer.from(file.name, "latin1").copy(directory, i * 64);
    directory.writeUInt32LE(file.data.length, i * 64 + 60);
  });

  const dataStart = align(BLOCK + directory.length);
  const chunks = [];
  let at = dataStart;
  for (const file of files) {
    chunks.push(Buffer.from(file.data));
    const padded = align(at + file.data.length);
    chunks.push(Buffer.alloc(padded - at - file.data.length));
    at = padded;
  }

  const out = Buffer.concat([
    header,
    directory,
    Buffer.alloc(dataStart - BLOCK - directory.length),
    ...chunks,
  ]);
  out.writeUInt32LE(out.length, 12);
  return new Uint8Array(out);
}

/** A zip. `method` is 0 (stored) or 8 (deflate). `crcOverride` corrupts the check. */
function buildZip(files) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.from(file.data);
    const method = file.method ?? 8;
    const body = method === 0 ? raw : deflateRawSync(raw);
    const sum = file.crcOverride ?? crc32(new Uint8Array(raw));

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(sum, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);

    offset += local.length + name.length + body.length;
  }

  const localBytes = Buffer.concat(locals);
  const centralBytes = Buffer.concat(central);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(localBytes.length, 16);

  return new Uint8Array(Buffer.concat([localBytes, centralBytes, eocd]));
}

// --------------------------------------------------------------------------
// CRC-32
// --------------------------------------------------------------------------

test("crc32 matches the standard check value", () => {
  // The published check value for CRC-32/ISO-HDLC. If this drifts, every
  // corruption check in the zip reader is meaningless.
  assert.equal(crc32(new Uint8Array(Buffer.from("123456789"))), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

// --------------------------------------------------------------------------
// RFL header
// --------------------------------------------------------------------------

test("reads a stock PC level header", () => {
  const header = parseRflHeader(buildRfl({ version: 0xb4, levelName: "dm_glass" }));
  assert.equal(header.version, 180);
  assert.equal(header.levelName, "dm_glass");
  assert.equal(header.sectionCount, 3);
  assert.equal(header.savedAt?.getUTCFullYear(), 2001);
});

test("mod name is only read from 0xB2 onward", () => {
  const modern = parseRflHeader(buildRfl({ version: 200, modName: "someMod" }));
  assert.equal(modern.modName, "someMod");

  // Below 0xB2 the field does not exist. Reading it anyway would eat two bytes
  // of the first section and silently produce garbage.
  const old = parseRflHeader(buildRfl({ version: 0xb1, levelName: "old" }));
  assert.equal(old.modName, null);
  assert.equal(old.levelName, "old");
});

test("an empty mod name comes back as null, not an empty string", () => {
  assert.equal(parseRflHeader(buildRfl({ version: 200, modName: "" })).modName, null);
});

test("rejects anything that is not a level", () => {
  assert.throws(
    () => parseRflHeader(buildRfl({ magic: 0x12345678 })),
    /Not an RFL/,
  );
  assert.throws(() => parseRflHeader(new Uint8Array(10)), /too short/);
  assert.throws(() => parseRflHeader(buildRfl({ version: -1 })), /not valid/);
});

test("rejects a header truncated inside the level name", () => {
  const full = buildRfl({ levelName: "dm_truncated" });
  assert.throws(() => parseRflHeader(full.subarray(0, 32)), /Truncated/);
});

test("an implausible timestamp becomes null rather than a wrong date", () => {
  assert.equal(parseRflHeader(buildRfl({ timestamp: 0 })).savedAt, null);
  assert.equal(parseRflHeader(buildRfl({ timestamp: 0xffffffff })).savedAt, null);
});

test("looksLikeRfl sniffs content, not extension", () => {
  assert.equal(looksLikeRfl(buildRfl()), true);
  assert.equal(looksLikeRfl(new Uint8Array([1, 2, 3, 4])), false);
  assert.equal(looksLikeRfl(new Uint8Array(2)), false);
});

// --------------------------------------------------------------------------
// Version to client mapping
// --------------------------------------------------------------------------

test("version 200 and below plays everywhere", () => {
  for (const version of [0xb0, 0xb4, 0xc8]) {
    const result = compatibilityForRflVersion(version);
    assert.deepEqual(result.playsOn, ["vanilla", "pure", "dash", "alpine"]);
    assert.equal(result.confidence, "known");
  }
});

test("version 300 and above is Alpine only", () => {
  const result = compatibilityForRflVersion(300);
  assert.deepEqual(result.playsOn, ["alpine"]);
  assert.equal(result.confidence, "known");
});

test("the gap between 200 and 300 is admitted, not guessed", () => {
  const result = compatibilityForRflVersion(250);
  assert.deepEqual(result.playsOn, []);
  assert.equal(result.confidence, "unknown");
  assert.match(result.note, /will not guess/);
});

test("PS2 level versions are called out as unplayable on PC", () => {
  for (const version of [0xae, 0xaf]) {
    const result = compatibilityForRflVersion(version);
    assert.deepEqual(result.playsOn, []);
    assert.match(result.note, /PlayStation 2/);
  }
});

test("intersectClients takes the strictest level in a pack", () => {
  assert.deepEqual(
    intersectClients([["vanilla", "pure", "dash", "alpine"], ["alpine"]]),
    ["alpine"],
  );
  assert.deepEqual(intersectClients([]), []);
  assert.deepEqual(intersectClients([[], ["alpine"]]), []);
});

// --------------------------------------------------------------------------
// VPP
// --------------------------------------------------------------------------

test("lists packfile entries and slices their data back out", () => {
  const one = buildRfl({ levelName: "dm_one" });
  const two = buildRfl({ levelName: "dm_two", version: 300 });
  const pack = buildVpp([
    { name: "dm_one.rfl", data: one },
    { name: "readme.txt", data: Buffer.from("hello") },
    { name: "dm_two.rfl", data: two },
  ]);

  const entries = listVppEntries(pack);
  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map((e) => e.name),
    ["dm_one.rfl", "readme.txt", "dm_two.rfl"],
  );

  // Every entry must land on a block boundary, which is the alignment
  // assumption the whole reader rests on.
  for (const entry of entries) assert.equal(entry.offset % BLOCK, 0);

  assert.deepEqual(readVppEntry(pack, entries[0]), one);
  assert.equal(
    Buffer.from(readVppEntry(pack, entries[1])).toString("latin1"),
    "hello",
  );
  assert.equal(parseRflHeader(readVppEntry(pack, entries[2])).version, 300);
});

test("rejects a Red Faction II packfile by version", () => {
  const pack = Buffer.from(buildVpp([{ name: "a.rfl", data: buildRfl() }]));
  pack.writeUInt32LE(2, 4);
  assert.throws(() => listVppEntries(new Uint8Array(pack)), /Red Faction II/);
});

test("rejects a truncated packfile rather than reading past the end", () => {
  const pack = buildVpp([{ name: "dm_one.rfl", data: buildRfl() }]);
  assert.throws(() => listVppEntries(pack.subarray(0, BLOCK + 64)), /past the end/);
});

// --------------------------------------------------------------------------
// ZIP
// --------------------------------------------------------------------------

test("reads deflated and stored zip entries", () => {
  for (const method of [0, 8]) {
    const zip = buildZip([{ name: "dm_zip.rfl", data: buildRfl({ levelName: "z" }), method }]);
    const result = inspectUpload(zip);
    assert.equal(result.container, "zip");
    assert.equal(result.levels.length, 1);
    assert.equal(result.levels[0].header.levelName, "z");
  }
});

test("a corrupt entry is caught by its checksum", () => {
  const zip = buildZip([
    { name: "dm_bad.rfl", data: buildRfl(), crcOverride: 0xdeadbeef },
  ]);
  const result = inspectUpload(zip);
  assert.equal(result.levels.length, 0);
  assert.match(result.warnings[0], /Checksum mismatch/);
});

test("macOS metadata and directory entries are ignored", () => {
  const zip = buildZip([
    { name: "maps/", data: Buffer.alloc(0), method: 0 },
    { name: "__MACOSX/._dm_x.rfl", data: Buffer.from("junk"), method: 0 },
    { name: "dm_x.rfl", data: buildRfl({ levelName: "dm_x" }) },
  ]);
  const result = inspectUpload(zip);
  assert.equal(result.levels.length, 1);
  assert.equal(result.levels[0].path, "dm_x.rfl");
});

// --------------------------------------------------------------------------
// End to end
// --------------------------------------------------------------------------

test("a bare level file is inspected directly", () => {
  const result = inspectUpload(buildRfl({ version: 300 }));
  assert.equal(result.container, "rfl");
  assert.equal(result.rflVersion, 300);
  assert.deepEqual(result.playsOn, ["alpine"]);
  assert.deepEqual(result.warnings, []);
});

test("a mixed pack is only as loadable as its most demanding level", () => {
  const zip = buildZip([
    { name: "dm_vanilla.rfl", data: buildRfl({ version: 200 }) },
    { name: "dm_alpine.rfl", data: buildRfl({ version: 300 }) },
  ]);
  const result = inspectUpload(zip);

  assert.equal(result.rflVersion, 300);
  assert.deepEqual(result.playsOn, ["alpine"]);
  assert.equal(result.levels.length, 2);
});

test("a packfile inside a zip is followed one level down", () => {
  const pack = buildVpp([{ name: "dm_nested.rfl", data: buildRfl({ version: 200 }) }]);
  const zip = buildZip([
    { name: "maps.vpp", data: pack },
    { name: "readme.txt", data: Buffer.from("read me"), method: 0 },
  ]);

  const result = inspectUpload(zip);
  assert.equal(result.levels.length, 1);
  assert.equal(result.levels[0].path, "maps.vpp/dm_nested.rfl");
  assert.deepEqual(result.playsOn, ["vanilla", "pure", "dash", "alpine"]);
});

test("an archive with no levels warns instead of pretending", () => {
  const zip = buildZip([{ name: "readme.txt", data: Buffer.from("nothing here"), method: 0 }]);
  const result = inspectUpload(zip);

  assert.equal(result.rflVersion, null);
  assert.deepEqual(result.playsOn, []);
  assert.match(result.warnings[0], /No level files found/);
});

test("one bad level does not reject the whole pack", () => {
  const zip = buildZip([
    { name: "dm_good.rfl", data: buildRfl({ version: 200, levelName: "good" }) },
    // Long enough to clear the length check, so this exercises the magic
    // check rather than the truncation guard.
    { name: "dm_broken.rfl", data: Buffer.alloc(64, 0x41) },
  ]);
  const result = inspectUpload(zip);

  assert.equal(result.levels.length, 1);
  assert.equal(result.levels[0].header.levelName, "good");
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /dm_broken\.rfl: Not an RFL/);
});

test("an unrecognised upload is refused outright", () => {
  assert.throws(
    () => inspectUpload(new Uint8Array(Buffer.from("this is a jpeg, honest"))),
    /Unrecognised file/,
  );
});
