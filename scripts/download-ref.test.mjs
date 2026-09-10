/**
 * The rule that tells a download number from a file id.
 *
 *   npm test
 *
 * `/api/download/<x>` answers to two things: the short `ref` every link on the
 * site is built from now, and the UUID the links were built from before that,
 * which stays forever because a link that already works keeps working. One pure
 * function decides which of the two a segment is, and `getDownloadable` picks a
 * column from its answer. Everything that can go wrong here goes wrong quietly.
 *
 * - Read a UUID as a number and the digits in it become a row that exists,
 *   serving a stranger somebody else's file.
 * - Read a number as an id and every short link 404s, on a site whose one
 *   promise is that they do not.
 * - Hand Postgres a value too large for an `integer` and the comparison is not
 *   a miss, it is an error: a 500 out of a route whose entire contract is that
 *   anything it does not recognise answers 404.
 *
 * None of that can be caught downstream. The route reads through Drizzle and
 * `node --test` has no database, which is why the rule lives in
 * `src/lib/download-ref.ts` importing nothing at all and is loaded here
 * directly, the same arrangement as `downloads.ts` and `ingest-rules.ts`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { MAX_DOWNLOAD_REF, readDownloadRef } from "../src/lib/download-ref.ts";

/* --- the number form ------------------------------------------------------ */

test("all digits is a ref, and comes back as a number", () => {
  assert.equal(readDownloadRef("1"), 1);
  assert.equal(readDownloadRef("12"), 12);
  // The shape FactionFiles uses, which is where the convention comes from.
  assert.equal(readDownloadRef("8296"), 8296);
});

test("a number, not a string that looks like one", () => {
  /*
   * `eq(files.ref, ...)` is comparing against an integer column. Drizzle would
   * send a string as a string and Postgres would cast it, which happens to work
   * and is exactly the sort of thing that stops working when the column type is
   * next touched. The type is part of the answer.
   */
  const ref = readDownloadRef("113");
  assert.equal(typeof ref, "number");
  assert.equal(Number.isInteger(ref), true);
});

/* --- the id form ---------------------------------------------------------- */

test("a UUID is not a ref", () => {
  /*
   * The live shape. This is the whole reason null is not a failure: it means
   * "look this up as a file id", and that branch is what keeps the links
   * already pasted on the one published map working.
   */
  assert.equal(readDownloadRef("7c9f2b40-1d6e-4a55-b0c8-3e51a2d4f8aa"), null);
});

test("a UUID made entirely of digits and hyphens is still not a ref", () => {
  /*
   * Not a real v4 UUID, but the point is that the hyphens alone settle it. If
   * the test were "does this parse as a number" rather than "is this nothing
   * but digits", `Number` would refuse this too, but only by luck: it refuses
   * because of the hyphens, not because it was asked the right question.
   */
  assert.equal(readDownloadRef("11111111-2222-4333-8444-555555555555"), null);
});

test("digits with letters in them are not a ref", () => {
  for (const segment of [
    "12a",
    "a12",
    "8296x",
    "0x1f",
    "1e3", // `Number("1e3")` is 1000. The regex never gets that far.
    "12.5",
    "12 ",
    " 12",
    "+12",
    "-12",
  ]) {
    assert.equal(readDownloadRef(segment), null, segment);
  }
});

test("an empty segment is not a ref", () => {
  /*
   * `Number("")` is 0, which is the failure this guards: an empty param read as
   * a number is a falsy value that is also a legitimate-looking row id, and the
   * two are indistinguishable once it is past this point.
   */
  assert.equal(readDownloadRef(""), null);
});

/* --- one spelling per file ------------------------------------------------ */

test("a leading zero is not a ref, so no file has two addresses", () => {
  /*
   * `007` trimmed to `7` would give one file two working URLs, and then two
   * spellings of a link the archive promises to keep, two things to paste and
   * two things for somebody to be told to check. The sequence starts at 1, so
   * no real ref carries a leading zero and nothing is lost by refusing them.
   */
  assert.equal(readDownloadRef("007"), null);
  assert.equal(readDownloadRef("0113"), null);
  assert.equal(readDownloadRef("00"), null);
});

test("zero is not a ref either", () => {
  // `MINVALUE 1` in the migration. There is no row 0 and there never will be.
  assert.equal(readDownloadRef("0"), null);
});

/* --- the ceiling ---------------------------------------------------------- */

test("the ceiling is the one the column actually has", () => {
  /*
   * Pinned against the literal rather than against an import, because the
   * number that matters is the `MAXVALUE 2147483647` the migration wrote into
   * `files_ref_seq`, which is what a Postgres `integer` holds. If the column
   * ever becomes a bigint, this line is where that decision has to be noticed.
   */
  assert.equal(MAX_DOWNLOAD_REF, 2147483647);
});

test("the largest value the column can hold is still a ref", () => {
  assert.equal(readDownloadRef("2147483647"), 2147483647);
});

test("a number too large for the column is not a ref", () => {
  /*
   * The important case, and the one that is not a 404 if it gets through.
   * Comparing an `integer` column against an out-of-range literal raises
   * `value out of range for type integer` rather than returning no rows, so
   * this would be a 500. Falling through to the id branch compares text with
   * text, matches nothing, and answers exactly like any other typo.
   */
  assert.equal(readDownloadRef("2147483648"), null);
  assert.equal(readDownloadRef("4294967296"), null);
  assert.equal(readDownloadRef("9999999999999999999999999999"), null);
});

test("a digit string past the precision of a double is still refused", () => {
  /*
   * `Number` is exact to 2^53 and approximate above it, which is far above the
   * ceiling, so the comparison has already decided by the time precision could
   * matter. Worth pinning: an implementation that parsed and then truncated
   * could turn a hundred-digit segment into something in range.
   */
  const enormous = "9".repeat(100);
  assert.equal(readDownloadRef(enormous), null);
  assert.equal(readDownloadRef("1" + "0".repeat(30)), null);
});

/* --- the two forms cannot be confused ------------------------------------- */

test("every segment is a ref or an id, never both and never neither", () => {
  /*
   * The property `getDownloadable` relies on: one branch is taken, always, and
   * a null answer sends the segment to the id column rather than to a 404 of
   * its own. Nothing here should ever throw, because the value comes off a URL
   * a stranger typed.
   */
  for (const segment of [
    "1",
    "8296",
    "7c9f2b40-1d6e-4a55-b0c8-3e51a2d4f8aa",
    "",
    "007",
    "12a",
    "2147483648",
    "../../etc/passwd",
    "%20",
    "null",
    "NaN",
    "Infinity",
  ]) {
    const ref = readDownloadRef(segment);
    assert.equal(
      ref === null || (Number.isInteger(ref) && ref >= 1 && ref <= MAX_DOWNLOAD_REF),
      true,
      segment,
    );
  }
});
