/**
 * The guard on correlated subqueries in the catalogue.
 *
 *   npm test
 *
 * Drizzle drops the table prefix from every column it renders when a select has
 * one table and no joins, and it does that inside a raw `sql` chunk too. In an
 * ordinary projection that is harmless. In a correlated subquery it is a silent
 * wrong answer: the outer `${items.id}` comes out as a bare `"id"`, Postgres
 * resolves a bare name against the innermost FROM it can find, and a count of an
 * item's files becomes `where files.item_id = files.id`. Never true, never an
 * error. Every count came back zero and every changelog came back empty, on a
 * query that reads correctly and runs without complaint.
 *
 * It was found by reading the generated SQL, which is not a thing anybody does
 * twice. Worse, whether it bites depends on something at the other end of the
 * function: `listItems` joins `map_meta`, one join is enough to make Drizzle
 * qualify everything, and the card image subquery is correct entirely by that
 * accident. Deleting a join nobody thought was load-bearing would break it.
 *
 * So the rule is written down here instead: inside a correlated subquery, a
 * column goes through `qualified()` or it does not go in at all. This reads the
 * source rather than the generated SQL, because generating it needs a database
 * client and this has to run under plain `node` with nothing configured.
 *
 * The second half of the file tests the reader itself. A checker that misreads
 * the source is worse than none: it fails on correct code, somebody stops
 * believing it, and it is switched off before the day it would have earned its
 * place.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const CATALOGUE = path.join(import.meta.dirname, "..", "src", "lib", "catalogue.ts");

/**
 * The catalogue tables, by the name they are imported under.
 *
 * Spelled out rather than discovered, because the point is to name the ones
 * whose columns end up inside these subqueries. A table added to the schema and
 * used here without being added below is not guarded, so the list is checked
 * against the file's own imports by the last test.
 */
const TABLES = ["items", "files", "screenshots", "mapMeta", "itemUpdates"];

/**
 * Every `sql` template in a source file, with the offset it starts at.
 *
 * `sql`, or `sql<SomeType>`, followed by a backtick, up to the next backtick.
 * Nothing in this file nests a backtick inside one, and a generic carrying a `>`
 * of its own would end the type early, so the parser test below pins both.
 */
function sqlBlocksIn(source) {
  const blocks = [];
  const opener = /\bsql(?:<[^>]*>)?`/g;
  // The match itself is not wanted, only where it left off: the block starts
  // immediately after the opening backtick.
  while (opener.exec(source) !== null) {
    const from = opener.lastIndex;
    const end = source.indexOf("`", from);
    if (end === -1) break;
    blocks.push({ text: source.slice(from, end), at: from });
    opener.lastIndex = end + 1;
  }
  return blocks;
}

/** A `from ${table}` of its own is what makes a block a subquery. */
function isSubquery(text) {
  return /\bfrom\s+\$\{/i.test(text);
}

/**
 * Bare column interpolations inside a subquery.
 *
 * `${screenshots}` on its own is the table and is exactly right: Drizzle needs
 * the table object there. It is the dotted form, `${screenshots.itemId}`, that
 * renders as an unqualified name. `${qualified(screenshots.itemId)}` does not
 * match, because what follows the brace is the helper rather than the table.
 */
function unqualifiedIn(source) {
  const bare = new RegExp(`\\$\\{\\s*(?:${TABLES.join("|")})\\.[A-Za-z]`, "g");
  const problems = [];

  for (const block of sqlBlocksIn(source)) {
    if (!isSubquery(block.text)) continue;
    for (const found of block.text.matchAll(bare)) {
      const at = block.at + found.index;
      problems.push({
        line: source.slice(0, at).split("\n").length,
        text: found[0],
      });
    }
  }

  return problems;
}

/* --- the rule ------------------------------------------------------------- */

test("every column in a correlated subquery is qualified", () => {
  const source = readFileSync(CATALOGUE, "utf8");
  const problems = unqualifiedIn(source);

  assert.deepEqual(
    problems.map((p) => `line ${p.line}: ${p.text}`),
    [],
    "A bare column inside a subquery resolves against the subquery's own table, " +
      "which is silently always false. Wrap it in qualified().",
  );
});

test("the helper the rule depends on is still there", () => {
  const source = readFileSync(CATALOGUE, "utf8");
  assert.match(
    source,
    /function qualified\(/,
    "qualified() is what this test tells people to use. Renaming it makes the " +
      "failure message point at nothing.",
  );
});

/* --- reading the source --------------------------------------------------- */

test("a bare column inside a subquery is caught", () => {
  const source = [
    "fileCount: sql<number>`(",
    "  select count(*)::int",
    "  from ${files}",
    "  where ${files.itemId} = ${items.id}",
    ")`,",
  ].join("\n");

  const found = unqualifiedIn(source);
  assert.equal(found.length, 2);
  assert.equal(found[0].line, 4);
});

test("the same subquery written properly is not", () => {
  const source = [
    "fileCount: sql<number>`(",
    "  select count(*)::int",
    "  from ${files}",
    "  where ${qualified(files.itemId)} = ${qualified(items.id)}",
    ")`,",
  ].join("\n");

  assert.deepEqual(unqualifiedIn(source), []);
});

test("a bare column outside a subquery is left alone", () => {
  // An ordinary projection or a set clause has no FROM of its own, so there is
  // nothing for a bare name to resolve against wrongly. Flagging these would
  // fail the whole file and teach people to ignore it.
  const source = "sql`${items.downloadCount} + 1`";
  assert.deepEqual(unqualifiedIn(source), []);
});

test("the table on its own is how a FROM is written, and is not an offence", () => {
  const source = "sql`(select 1 from ${screenshots} where ${qualified(items.id)} = 1)`";
  assert.deepEqual(unqualifiedIn(source), []);
});

test("a typed sql template is read the same as an untyped one", () => {
  const typed = "sql<string | null>`(select 1 from ${files} where ${files.itemId} = 1)`";
  const untyped = "sql`(select 1 from ${files} where ${files.itemId} = 1)`";
  assert.equal(unqualifiedIn(typed).length, 1);
  assert.equal(unqualifiedIn(untyped).length, 1);
});

test("every catalogue table this file queries is on the guarded list", () => {
  const source = readFileSync(CATALOGUE, "utf8");

  // The schema import, which is the file's own list of what it touches. A table
  // used in a subquery but missing from TABLES would be silently unguarded, and
  // that is precisely the failure this whole file exists to stop.
  const imported = source.match(/from "@\/lib\/db\/schema"/)
    ? [...source.matchAll(/^\s{2}(\w+),$/gm)].map((m) => m[1])
    : [];

  const queried = imported.filter((name) =>
    new RegExp(`\\$\\{${name}\\}`).test(source),
  );

  assert.deepEqual(
    queried.filter((name) => !TABLES.includes(name)),
    [],
    "Add it to TABLES in this file, or its columns go unchecked.",
  );
});
