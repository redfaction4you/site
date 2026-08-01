/**
 * The guard that stops a total counting a match that did not happen.
 *
 * Twice now a rule has been written once and applied everywhere except one
 * place, and both times the miss reached a published page. `TOOK_PART` was
 * added and a scoreboard kept listing people who never entered the game.
 * `MATCH_COMPLETED` was added to nine queries, the commit said it covered the
 * night's scoreboard, and it did not: the night header read 2,090 frags and the
 * table directly beneath it summed to 2,102.
 *
 * Both were found by a person reading a page. Nothing about either was hard to
 * see in the source, and that is the point of this file: a query that reads the
 * match tables either filters out the matches that did not count, or says in a
 * comment why it does not. There is no third option, and adding one is what the
 * test fails on.
 *
 * The opt-out is deliberately a sentence rather than a flag. Plenty of queries
 * genuinely want every row — the backup copies the archive, the day document
 * exports it, a match page renders whatever it is asked for — and the reason
 * differs each time. Writing it down is the whole cost of the exemption.
 *
 *   npm test                     # via query-guard.test.mjs
 *   node scripts/query-guard.mjs # the same scan, printed
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/** Written in a comment inside the query it exempts, with the reason after it. */
export const OPT_OUT = "counts-everything:";

const ROOT = path.join(import.meta.dirname, "..", "src");

/** The tables where a missing filter turns into a wrong number on a page. */
const TABLES = ["from(matches)", "from(matchPlayers)"];

/** What a query has to name to be counted as filtered. */
const FILTER = "MATCH_COMPLETED";

async function sourceFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await sourceFiles(full)));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      found.push(full);
    }
  }
  return found;
}

/**
 * The source with every semicolon that is not a statement ending blanked out.
 *
 * Statements are found by splitting on semicolons, which only works if the
 * semicolons inside comments, strings and SQL templates are not mistaken for
 * statement endings. They were: the first comment written under this guard
 * contained one, the query above it was split in half, and the guard reported
 * its own annotation as an unfiltered query. A checker that cries wolf gets
 * switched off, so it is worth the twenty lines to read the file properly.
 *
 * Everything else is left exactly as it was, so line numbers and the text of
 * each segment still match the file a person will open.
 */
export function blankInnerSemicolons(source) {
  const out = [...source];
  let state = "code";

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (state === "code") {
      if (char === "/" && next === "/") state = "line";
      else if (char === "/" && next === "*") state = "block";
      else if (char === '"' || char === "'" || char === "`") state = char;
      continue;
    }

    if (state === "line" && char === "\n") state = "code";
    else if (state === "block" && char === "*" && next === "/") state = "code";
    else if ((state === '"' || state === "'" || state === "`") && char === state) {
      // A quote the source escaped is not the end of the string.
      state = source[i - 1] === "\\" ? state : "code";
    } else if (char === ";") out[i] = " ";
  }

  return out.join("");
}

/**
 * Every database read in one file, as text.
 *
 * A drizzle chain is one statement, and the text before it carries the comments
 * written above it, which is where an opt-out belongs. So a statement is the
 * right unit and a semicolon is the right boundary.
 */
export function queriesIn(source) {
  const found = [];
  let at = 0;

  // Blanking replaces characters rather than removing them, so an offset into
  // the result is the same offset into the file, and a reported line number is
  // one somebody can open.
  for (const segment of blankInnerSemicolons(source).split(";")) {
    if (TABLES.some((table) => segment.includes(table))) {
      found.push({ text: segment, at });
    }
    at += segment.length + 1;
  }

  return found;
}

/** The line the query starts on, for an error a person can act on. */
function lineOf(source, at) {
  return source.slice(0, at).split("\n").length;
}

/** A short name for the query, so a failure says which one. */
function nameOf(segment) {
  const named =
    /(?:export const|const|function)\s+([A-Za-z0-9_]+)/.exec(segment) ??
    /select\(\{\s*([A-Za-z0-9_]+)/.exec(segment);
  return named?.[1] ?? "query";
}

/** Every query that neither filters nor says why it does not. */
export async function unguarded() {
  const problems = [];

  for (const file of await sourceFiles(ROOT)) {
    const source = await readFile(file, "utf8");
    if (!TABLES.some((table) => source.includes(table))) continue;

    for (const query of queriesIn(source)) {
      if (query.text.includes(FILTER) || query.text.includes(OPT_OUT)) continue;
      problems.push({
        file: path.relative(path.join(ROOT, ".."), file).replaceAll("\\", "/"),
        line: lineOf(source, query.at),
        name: nameOf(query.text),
      });
    }
  }

  return problems;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const problems = await unguarded();
  if (problems.length === 0) {
    console.log("\nEvery match query filters or says why it does not.\n");
    process.exit(0);
  }

  console.log(`\n${problems.length} unguarded match ${problems.length === 1 ? "query" : "queries"}:\n`);
  for (const problem of problems) {
    console.log(`  ${problem.file}:${problem.line}  ${problem.name}`);
  }
  console.log(
    `\nEach one either filters with ${FILTER}, or carries a comment saying ` +
      `"${OPT_OUT} <why>".\n`,
  );
  process.exit(1);
}
