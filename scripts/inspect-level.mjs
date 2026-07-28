/**
 * Prints what the site would record about a Red Faction download.
 *
 *   npm run rfl -- path/to/map.zip
 *   npm run rfl -- "C:\downloads\dm_ruins.rfl"
 *
 * This is the same code path Phase 2's upload will use, so it is also how you
 * check the parser against a real file. Every fixture in the test suite is
 * synthetic; the specifications could be wrong, or RED could have written
 * something other than what was documented. Run this against a genuine map and
 * the answer stops being theoretical.
 *
 * If output looks wrong on a .vpp, suspect the 2048-byte per-file alignment
 * assumption in src/lib/rfl/vpp.ts first.
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { CLIENT_LABELS, inspectUpload, RFL_TABLE_VERIFIED_ON } from "../src/lib/rfl/index.ts";

const target = process.argv[2];

if (!target) {
  console.error("Usage: npm run rfl -- <file.rfl|file.vpp|file.zip>");
  process.exit(1);
}

let bytes;
try {
  bytes = new Uint8Array(await readFile(target));
} catch (error) {
  console.error(`Could not read ${target}: ${error.message}`);
  process.exit(1);
}

let result;
try {
  result = inspectUpload(bytes);
} catch (error) {
  console.error(`\n${basename(target)}: ${error.message}\n`);
  process.exit(1);
}

const kb = (bytes.byteLength / 1024).toFixed(1);
console.log(`\n${basename(target)}  ${kb} KB  (${result.container})\n`);

for (const level of result.levels) {
  const header = level.header;
  const saved = header.savedAt ? header.savedAt.toISOString().slice(0, 10) : "unknown date";
  const plays = level.playsOn.length
    ? level.playsOn.map((client) => CLIENT_LABELS[client]).join(", ")
    : "nothing we label for";

  console.log(`  ${level.path}`);
  console.log(`    rfl version   ${header.version}${level.confidence === "unknown" ? "  (UNRECOGNISED)" : ""}`);
  console.log(`    level name    ${header.levelName || "(none)"}`);
  if (header.modName) console.log(`    mod           ${header.modName}`);
  console.log(`    saved         ${saved}`);
  console.log(`    sections      ${header.sectionCount}`);
  console.log(`    plays on      ${plays}`);
  console.log(`    ${level.note}`);
  console.log();
}

if (result.warnings.length) {
  console.log("  Warnings:");
  for (const warning of result.warnings) console.log(`    - ${warning}`);
  console.log();
}

if (result.levels.length > 1) {
  const plays = result.playsOn.length
    ? result.playsOn.map((client) => CLIENT_LABELS[client]).join(", ")
    : "nothing we label for";
  console.log(`  Whole upload: rfl_version ${result.rflVersion}, plays on ${plays}`);
  console.log("  (a pack is only as loadable as its most demanding level)\n");
}

console.log(`  Compatibility table last verified ${RFL_TABLE_VERIFIED_ON}.\n`);
