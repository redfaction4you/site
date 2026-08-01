/**
 * The two vets have to read the same night.
 *
 *   npm test
 *
 * `vetNight` is fed from two places: `nightForVetting` in queries.ts, which runs
 * at ingest, and the hand-written SQL in vet-archive.mjs, which runs from the
 * command line. TypeScript keeps the first honest, because that query is typed
 * as `VettableMatch` and stops compiling when the type moves. It cannot see the
 * second at all: the script talks to Postgres directly and hands over a plain
 * object, so a field renamed in the type arrives there as `undefined` and every
 * check that reads it quietly stops finding anything.
 *
 * That is not hypothetical. `npm run vet` has been the thing consulted to say
 * whether the archive is clean, and a check that is alive in the app and dead on
 * the command line would answer "clean" for the wrong reason. This session
 * renamed exactly such a field, `fastestCaptureMs` to `fastestSoloCaptureMs`,
 * and the app half was a compiler error while the script half was silence.
 *
 * So: every field the vet reads must appear in the script by name. It is a
 * coarse test — it does not know whether the value is right — but the failure it
 * catches is total, and nothing else catches it at all.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const HERE = import.meta.dirname;

/** Field names declared in a TypeScript object type, comments skipped. */
function fieldsIn(block) {
  return [...block.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*[?]?:/gm)].map((m) => m[1]);
}

const vet = await readFile(path.join(HERE, "..", "src", "lib", "matches", "vet.ts"), "utf8");
const script = await readFile(path.join(HERE, "vet-archive.mjs"), "utf8");

const shape = /export type VettableMatch = \{([\s\S]*?)\n\};/.exec(vet);
const players = /players: \{([\s\S]*?)\n  \}\[\];/.exec(vet);

test("the vet's shape can still be read out of the source", () => {
  // If this fails the rest of the file is vacuous, which is the one thing a
  // guard must never be.
  assert.ok(shape, "could not find VettableMatch in vet.ts");
  assert.ok(players, "could not find its players in vet.ts");
  assert.ok(fieldsIn(players[1]).length >= 8);
});

test("every field the vet reads is selected by the command line vet", () => {
  // Deduplicated: the players block sits inside the match block, so reading both
  // sees its fields twice and the failure message would name them twice.
  const wanted = [
    ...new Set([
      ...fieldsIn(shape[1]).filter((name) => name !== "players"),
      ...fieldsIn(players[1]),
    ]),
  ];

  const missing = wanted.filter((name) => !script.includes(name));

  assert.deepEqual(
    missing,
    [],
    `scripts/vet-archive.mjs never mentions ${missing.join(", ")}. It builds its ` +
      `own query, so a field added or renamed in VettableMatch has to be added ` +
      `there by hand or the check that reads it goes quiet.`,
  );
});

test("the field this test was written for is one of them", () => {
  // A rename that lands in the type and not in the script is the exact failure
  // above, and this is the one that happened.
  assert.ok(vet.includes("fastestSoloCaptureMs"));
  assert.ok(script.includes("fastestSoloCaptureMs"));
  assert.ok(script.includes("fastest_solo_capture_ms"));
});
