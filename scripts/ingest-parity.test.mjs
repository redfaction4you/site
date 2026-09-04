/**
 * The two things that write to the catalogue must write the same row.
 *
 * `scripts/ingest.mjs` is the bulk path from a disk and `src/lib/ingest.ts` is
 * the form on `/admin`. They cannot share code: the CLI runs outside Next and
 * builds its own database client, so it cannot import `@/lib/db`. Every derived
 * rule is shared through `ingest-rules.ts`, which is where the dangerous
 * divergence would be, but **the statement lists are written twice**, and a
 * field added to one upsert and not the other gives the archive two shapes of
 * row depending on which door it came through.
 *
 * That is the exact failure this codebase has had three times over with a rule
 * and its SQL twin drifting apart, each time found by a reader rather than by a
 * check. Both builders of the upload path named this risk in their own reports
 * and neither could act on it, because the file to add lives outside what
 * either of them owned.
 *
 * So this compares the columns each side names, per table, and fails when they
 * come apart. It is deliberately a comparison of NAMES rather than of
 * behaviour: the two genuinely differ in how they compute a value, and should,
 * but they must not differ in which columns exist.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const CLI = readFileSync(path.join(ROOT, "scripts", "ingest.mjs"), "utf8");
const LIB = readFileSync(path.join(ROOT, "src", "lib", "ingest.ts"), "utf8");

const snake = (name) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * The columns a raw `insert into <table> (a, b, c)` names.
 *
 * The CLI writes SQL by hand, so the column list is there to be read. Comments
 * are stripped first: the statements carry them, and a word inside one is not a
 * column.
 */
function cliColumns(table) {
  const withoutComments = CLI.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const match = withoutComments.match(
    new RegExp(`insert\\s+into\\s+${table}\\s*\\(([^)]*)\\)`, "i"),
  );
  if (!match) return null;
  return new Set(
    match[1]
      .split(",")
      .map((name) => name.trim())
      // Digits are part of a column name here: `sha256` is one, and a class
      // without them silently dropped it and reported a disagreement that was
      // entirely this reader's fault.
      .filter((name) => /^[a-z][a-z0-9_]*$/.test(name)),
  );
}

/**
 * The columns a Drizzle `.values({ ... })` names, as snake_case.
 *
 * Read from the object literal rather than by running it, because running it
 * needs a database. Nested objects are not expected here and would break the
 * brace matching, so the count is asserted below as a sanity check on the
 * parse itself: a reader that silently finds nothing would pass every test.
 */
function libColumns(marker) {
  const at = LIB.indexOf(marker);
  if (at === -1) return null;

  const start = LIB.indexOf(".values({", at);
  if (start === -1) return null;

  let depth = 0;
  let end = start;
  for (let i = LIB.indexOf("{", start); i < LIB.length; i++) {
    if (LIB[i] === "{") depth++;
    else if (LIB[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const body = LIB.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const keys = new Set();
  /*
   * Both spellings of a key. `title: x` is the obvious one and `itemId,` is
   * shorthand, which is used freely here and which an earlier version of this
   * reader missed entirely: it parsed 8 of the 15 columns on `items` and
   * reported a disagreement that did not exist. The minimum counts below exist
   * because of that, so a reader that quietly stops seeing things fails rather
   * than passing.
   */
  for (const line of body.split("\n")) {
    const key = line.match(/^\s{8}([A-Za-z][A-Za-z0-9]*)\s*[,:]/);
    if (key) keys.add(snake(key[1]));
  }
  return keys;
}

/**
 * The tables both sides write.
 *
 * `item_updates` is deliberately absent. The CLI writes a changelog from an
 * `item.json` sidecar because a folder recovered from a forum can carry the
 * history of the file in it; the form has no field for one, and entries are
 * added afterwards on `/admin`. That is a difference in what the two paths are
 * FOR rather than a drift in how they write, so requiring parity there would
 * be a failing test with no fix.
 */
const TABLES = [
  { table: "items", marker: ".insert(items)", minimum: 12 },
  { table: "files", marker: ".insert(files)", minimum: 7 },
  { table: "screenshots", marker: ".insert(screenshots)", minimum: 4 },
];

for (const { table, marker, minimum } of TABLES) {
  test(`${table}: the CLI and the form name the same columns`, () => {
    const fromCli = cliColumns(table);
    const fromLib = libColumns(marker);

    /*
     * A reader that finds nothing would pass silently, which is the failure
     * mode this whole file exists to prevent, so the parse is checked before
     * the comparison.
     */
    assert.ok(fromCli, `could not find "insert into ${table}" in scripts/ingest.mjs`);
    assert.ok(fromLib, `could not find "${marker}" and its .values({}) in src/lib/ingest.ts`);
    assert.ok(
      fromCli.size >= minimum,
      `only parsed ${fromCli.size} columns for ${table} from the CLI, expected at least ${minimum}`,
    );
    assert.ok(
      fromLib.size >= minimum,
      `only parsed ${fromLib.size} columns for ${table} from the form, expected at least ${minimum}`,
    );

    const onlyCli = [...fromCli].filter((column) => !fromLib.has(column)).sort();
    const onlyLib = [...fromLib].filter((column) => !fromCli.has(column)).sort();

    assert.deepEqual(
      { onlyInCli: onlyCli, onlyInForm: onlyLib },
      { onlyInCli: [], onlyInForm: [] },
      `scripts/ingest.mjs and src/lib/ingest.ts disagree about ${table}.\n` +
        `A column written by one and not the other means an item's row depends on\n` +
        `which door it came through. Add it to both, or say here why it belongs to one.`,
    );
  });
}

test("both writers still supply an id explicitly", () => {
  /*
   * Ids are `$defaultFn(crypto.randomUUID)` in Drizzle and therefore have no
   * Postgres DEFAULT. The CLI hits a not-null violation without one, which has
   * already happened once; the form would too. Cheap to assert, and it is the
   * kind of line somebody removes while tidying.
   */
  for (const { table, marker } of TABLES) {
    assert.ok(libColumns(marker).has("id"), `${table} must supply an id in the form path`);
    assert.ok(cliColumns(table).has("id"), `${table} must supply an id in the CLI path`);
  }
});
