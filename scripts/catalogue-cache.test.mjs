/**
 * A cached listing must hand back the same shapes an uncached one did.
 *
 * `unstable_cache` stores its answer as JSON, and JSON has no Date. A column
 * declared `timestamp()` arrives as a `Date` from Drizzle, is written to the
 * cache as an ISO string, and comes back a string with every type in the
 * codebase still saying `Date`. The compiler cannot see it and neither can a
 * reader. What it does see is `RangeError: Invalid time value` thrown out of
 * whichever component formats it.
 *
 * The failure has the worst possible shape. The request that fills the cache
 * gets real Dates and renders correctly, so the page is fine when you look at
 * it; the next request, and every request for the rest of the hour, is a 500.
 * `/maps` did exactly this the day the cache was added, and it was caught by
 * curling the page twice rather than once.
 *
 * So: every timestamp column that reaches a listing must be named in
 * `LISTING_DATE_FIELDS`, and every cached read that returns rows must be
 * revived. Both are read out of the source here, because there is no database
 * in `node --test` and neither rule needs one.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const schema = readFileSync(join(root, "src/lib/db/schema.ts"), "utf8");
const catalogue = readFileSync(join(root, "src/lib/catalogue.ts"), "utf8");

/** The body of one `pgTable` declaration, by the const name it is bound to. */
function tableBody(name) {
  const start = schema.indexOf(`export const ${name} = pgTable(`);
  assert.notEqual(start, -1, `${name} is not declared in schema.ts`);
  const end = schema.indexOf("\n);", start);
  assert.notEqual(end, -1, `${name} has no closing paren`);
  return schema.slice(start, end);
}

/** The property names in that table declared `timestamp(...)`. */
function timestampColumns(name) {
  const found = new Set();
  for (const match of tableBody(name).matchAll(/^\s{4}(\w+):\s*timestamp\(/gm)) {
    found.add(match[1]);
  }
  return found;
}

/** The body of one object literal in catalogue.ts, by the const name. */
function objectBody(name) {
  const start = catalogue.indexOf(`const ${name} = {`);
  assert.notEqual(start, -1, `${name} is not declared in catalogue.ts`);
  const end = catalogue.indexOf("\n};", start);
  assert.notEqual(end, -1, `${name} has no closing brace`);
  return catalogue.slice(start, end);
}

/** `{ publishedAt: items.published_at }` as a map of key to column property. */
function selectedItemColumns(name) {
  const picked = new Map();
  for (const match of objectBody(name).matchAll(/^\s{2}(\w+):\s*items\.(\w+),/gm)) {
    picked.set(match[1], match[2]);
  }
  return picked;
}

function listedDateFields() {
  const line = catalogue.match(/export const LISTING_DATE_FIELDS = \[([^\]]*)\]/);
  assert.ok(line, "LISTING_DATE_FIELDS is not exported from catalogue.ts");
  return new Set([...line[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

test("every timestamp reaching a listing is revived after the cache", () => {
  const stamps = timestampColumns("items");
  // If this ever reads zero the regex has drifted and the whole check passes
  // vacuously, which is the failure mode a source-reading test has.
  assert.ok(stamps.size >= 3, `only found ${stamps.size} timestamps on items`);

  const declared = listedDateFields();

  for (const list of ["summaryColumns", "highlightColumns", "arrivalColumns"]) {
    for (const [key, column] of selectedItemColumns(list)) {
      if (!stamps.has(column)) continue;
      assert.ok(
        declared.has(key),
        `${list}.${key} is items.${column}, a timestamp, and is not in ` +
          `LISTING_DATE_FIELDS. Cached, it comes back as a string and the ` +
          `first component to format it throws.`,
      );
    }
  }
});

test("every cached read of rows goes through revive", () => {
  /*
   * Keyed by the first cache key, which is what each read calls itself. These
   * four answer with counts and tag names: numbers and strings, nothing a JSON
   * round trip can change. Anything else must be revived, and a new read is
   * refused by default rather than allowed by default.
   */
  const noDates = new Set(["categories", "kinds", "tags"]);

  const calls = [...catalogue.matchAll(/cached\(\s*\[\s*"([a-z]+)"/g)];
  assert.ok(calls.length >= 5, `only found ${calls.length} cached reads`);

  for (const call of calls) {
    const [, key] = call;
    if (noDates.has(key)) continue;

    // The statement this call sits in, back to the previous semicolon.
    const before = catalogue.lastIndexOf(";", call.index);
    const statement = catalogue.slice(before + 1, call.index);
    assert.match(
      statement,
      /revive/,
      `the cached read "${key}" returns rows and is not revived. Add it to ` +
        `noDates here if it genuinely has no timestamp in it.`,
    );
  }
});
