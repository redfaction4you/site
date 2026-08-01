/**
 * The guard that reads the queries.
 *
 *   npm test
 *
 * Two things are tested here and the first is the point of the file: every
 * query that reads the match tables either filters out matches that did not
 * count, or says in a comment why it does not. Adding a query that does neither
 * fails this test, which is the whole idea. The rule has now been missed twice
 * by hand and found twice by a reader.
 *
 * The second is the guard's own parsing, because a checker that misreads the
 * source is worse than none: it fails on correct code, somebody stops believing
 * it, and it is switched off before the day it would have earned its place. It
 * misread its own first annotation, which contained a semicolon.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  OPT_OUT,
  blankInnerSemicolons,
  queriesIn,
  unguarded,
} from "./query-guard.mjs";

/* --- the rule ------------------------------------------------------------- */

test("every match query filters, or says why it does not", async () => {
  const problems = await unguarded();
  assert.deepEqual(
    problems.map((p) => `${p.file}:${p.line} ${p.name}`),
    [],
    `Add MATCH_COMPLETED to the query, or a comment saying "${OPT_OUT} <why>".`,
  );
});

/* --- reading the source ---------------------------------------------------- */

test("a semicolon in a comment does not split a query in half", () => {
  // Exactly what happened: the annotation explaining a filter contained a
  // semicolon, the query was cut in two, and the half without the filter was
  // reported as unguarded.
  const source = `
    // Only what counted; the rest is left out.
    const rows = await db.select().from(matches).where(MATCH_COMPLETED);
  `;
  const found = queriesIn(source);
  assert.equal(found.length, 1);
  assert.ok(found[0].text.includes("MATCH_COMPLETED"));
});

test("a semicolon inside SQL or a string does not split a query either", () => {
  const source = [
    "const rows = await db.select().from(matches)",
    "  .where(sql`archive_day = 'x'; -- not a statement end`)",
    "  .orderBy(asc(matches.startedAt));",
  ].join("\n");
  assert.equal(queriesIn(source).length, 1);
});

test("real statement endings still split", () => {
  const source = `
    const a = await db.select().from(matches).where(MATCH_COMPLETED);
    const b = await db.select().from(matchPlayers).where(TOOK_PART);
  `;
  assert.equal(queriesIn(source).length, 2);
});

test("blanking preserves length, so reported lines are real lines", () => {
  // The line number in a failure has to be one somebody can open.
  const source = "// one;\n// two;\nconst x = 1;\n";
  const blanked = blankInnerSemicolons(source);
  assert.equal(blanked.length, source.length);
  assert.equal(blanked.split("\n").length, source.split("\n").length);
  assert.equal(blanked.includes("// one "), true);
  assert.equal(blanked.trimEnd().endsWith("const x = 1;"), true);
});

test("an unfiltered query with no reason is reported", () => {
  // The shape of the bug: an aggregate over the match tables, no filter, no
  // explanation. This is what the scan is looking for.
  const source = `
    const totals = await db
      .select({ frags: sql\`sum(kills)\` })
      .from(matchPlayers)
      .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
      .where(TOOK_PART);
  `;
  const [query] = queriesIn(source);
  assert.equal(query.text.includes("MATCH_COMPLETED"), false);
  assert.equal(query.text.includes(OPT_OUT), false);
});
