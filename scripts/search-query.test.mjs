/**
 * Tests for reading what somebody typed into the search box.
 *
 *   npm test
 *
 * A search that finds nothing looks the same as a search for something that is
 * not there, which is what makes this worth testing rather than trying: a date
 * parsed wrongly returns the wrong night with no sign that anything went wrong,
 * and a scoreline mistaken for a date returns nothing at all.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { asDay, asScore } from "../src/lib/search-query.ts";

/* --- dates ---------------------------------------------------------------- */

test("the form the archive uses is read as itself", () => {
  assert.equal(asDay("2026-07-31"), "2026-07-31");
});

test("the form a person writes is read day first", () => {
  // The site's own convention, and the one the people playing on this server
  // use. 03/04/2026 is April the third.
  assert.equal(asDay("31/07/2026"), "2026-07-31");
  assert.equal(asDay("3.4.2026"), "2026-04-03");
});

test("single digits are padded, so the day matches the stored one", () => {
  assert.equal(asDay("2026-7-1"), "2026-07-01");
  assert.equal(asDay("1/7/2026"), "2026-07-01");
});

test("something that cannot be a date is not one", () => {
  assert.equal(asDay("31/13/2026"), null, "there is no thirteenth month");
  assert.equal(asDay("Romek"), null);
  assert.equal(asDay("5-3"), null, "a scoreline is not a date");
  assert.equal(asDay(""), null);
});

/* --- scorelines ----------------------------------------------------------- */

test("a scoreline is read whichever way it is typed", () => {
  assert.deepEqual(asScore("5-3"), [5, 3]);
  assert.deepEqual(asScore("5 - 3"), [5, 3]);
  assert.deepEqual(asScore("5–3"), [5, 3], "en dash, which is what the site prints");
});

test("the order is kept and the caller matches both ways", () => {
  // Deliberate: a reader remembers 5-3 and not which side wore red, and the
  // shirts are reshuffled between matches anyway.
  assert.deepEqual(asScore("3-5"), [3, 5]);
});

test("a date is not a scoreline", () => {
  assert.equal(asScore("2026-07-31"), null);
  assert.equal(asScore("Huna b8"), null);
});
