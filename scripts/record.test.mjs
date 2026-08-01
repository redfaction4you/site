/**
 * Tests for the record column and the map identifiers behind the map pages.
 *
 *   npm test
 *
 * The running record is the only arithmetic on the player page a reader will
 * check by hand, because it is the one they were doing themselves before the
 * column existed. Two rules matter: a match with no winner moves neither total,
 * and the figure on a row is the record after that match rather than before it.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { formatOf, withRunningRecord } from "../src/lib/matches/record.ts";
import { mapBySlug, mapSlug } from "../src/lib/matches/maps.ts";

/* --- the running record --------------------------------------------------- */

const newestFirst = [
  { id: "5th", won: true },
  { id: "4th", won: false },
  { id: "3rd", won: null },
  { id: "2nd", won: true },
  { id: "1st", won: true },
];

test("the newest row carries the record as it stands now", () => {
  const rows = withRunningRecord(newestFirst);

  assert.equal(rows[0].match.id, "5th");
  assert.equal(rows[0].wins, 3);
  assert.equal(rows[0].losses, 1);
});

test("each row is the record after that match, and the order is unchanged", () => {
  const rows = withRunningRecord(newestFirst);

  assert.deepEqual(
    rows.map((row) => [row.match.id, `${row.wins}-${row.losses}`]),
    [
      ["5th", "3-1"],
      ["4th", "2-1"],
      ["3rd", "2-0"],
      ["2nd", "2-0"],
      ["1st", "1-0"],
    ],
  );
});

test("a match with no recorded winner moves neither column", () => {
  const rows = withRunningRecord([{ won: null }]);

  assert.equal(rows[0].wins, 0);
  assert.equal(rows[0].losses, 0);
  assert.equal(rows[0].undecided, 1);
  assert.equal(rows[0].result, "undecided");
});

test("the input is not reordered in place", () => {
  const input = [...newestFirst];
  withRunningRecord(input);
  assert.deepEqual(input, newestFirst);
});

test("no matches is an empty record rather than a throw", () => {
  assert.deepEqual(withRunningRecord([]), []);
});

test("sides are reported as they were, uneven ones included", () => {
  assert.equal(formatOf(2, 2), "2v2");
  // Somebody dropped. Rounding this to 3v3 would be tidier and untrue.
  assert.equal(formatOf(3, 2), "3v2");
});

/* --- map identifiers ------------------------------------------------------ */

test("a map name becomes a url safe slug", () => {
  assert.equal(mapSlug("Warlords Pro (No Amp)"), "warlords-pro-no-amp");
  assert.equal(mapSlug("Ankh b12"), "ankh-b12");
  assert.equal(mapSlug("Dark Warlords"), "dark-warlords");
});

test("punctuation and spacing never leak into a url", () => {
  for (const name of ["CTF-Ankh_b12.rfl", "  Huna   b8  ", "Rail Fight!"]) {
    assert.match(mapSlug(name), /^[a-z0-9-]+$/, `${name} slugged badly`);
  }
});

test("a name that is all punctuation still produces something addressable", () => {
  assert.equal(mapSlug("???"), "map");
});

test("the two Warlords variants do not collide", () => {
  assert.notEqual(
    mapSlug("Warlords Pro (No Amp)"),
    mapSlug("Warlords Pro (No Fog)"),
  );
});

test("a slug resolves against the real names rather than being unslugged", () => {
  const names = ["Warlords Pro (No Amp)", "Ankh b12"];

  assert.equal(mapBySlug("warlords-pro-no-amp", names), "Warlords Pro (No Amp)");
  assert.equal(mapBySlug("WARLORDS-PRO-NO-AMP", names), "Warlords Pro (No Amp)");
  assert.equal(mapBySlug("relic-seeker", names), null);
});
