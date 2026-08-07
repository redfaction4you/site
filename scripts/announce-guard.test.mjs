/**
 * Nothing announces without asking what has not been announced.
 *
 * This exists because of a one-line deletion. While the ordering in
 * `announcePendingOpinions` was being changed from newest-first to
 * oldest-first, its `.where(isNull(postedAt))` went with it. The query then
 * selected the oldest row in the table rather than the oldest unposted one,
 * which is the same row every time, and the 30 July opinion piece went to
 * Discord four times in an hour on its way to going every fifteen minutes
 * forever.
 *
 * Every symptom pointed somewhere else. The row was re-stamped on each pass, so
 * it looked like something was un-claiming it; `/api/health` reported nothing
 * pending throughout, because health asks the question this query had stopped
 * asking. Three diagnoses in a row went looking at delivery.
 *
 * A missing filter is invisible in review and obvious to a grep, so this is a
 * grep. It reads the source rather than the database, like `vet:queries` does,
 * for the same reason: the failure is in what the query asks for, and that is
 * knowable without running it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(
  new URL("../src/lib/ai/night-runner.ts", import.meta.url),
  "utf8",
);

/** The announcing functions, and the column each must filter on. */
const ANNOUNCERS = [
  { fn: "announcePendingColumns", table: "nightColumns" },
  { fn: "announcePendingOpinions", table: "opinionPieces" },
];

/** The body of a top-level exported function, up to the next one. */
function bodyOf(name) {
  const start = SOURCE.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} is gone, or has been renamed`);
  const next = SOURCE.indexOf("\nexport async function ", start + 1);
  return SOURCE.slice(start, next === -1 ? SOURCE.length : next);
}

for (const { fn, table } of ANNOUNCERS) {
  test(`${fn} only selects what has not been posted`, () => {
    const body = bodyOf(fn);
    assert.ok(
      body.includes(`isNull(${table}.postedAt)`),
      `${fn} does not filter on ${table}.postedAt, so it will select the same ` +
        `row on every run and announce it forever.`,
    );
  });

  test(`${fn} claims a row before sending it`, () => {
    const body = bodyOf(fn);
    const claim = body.indexOf("postedAt: new Date()");
    const send = body.search(/await announce(Column|Opinion)\(/);
    assert.notEqual(claim, -1, `${fn} never records that it posted`);
    assert.notEqual(send, -1, `${fn} never sends anything`);
    assert.ok(
      claim < send,
      `${fn} sends before it records. A post that arrives and is not recorded ` +
        `is sent again on the next run, which is how this went wrong the first time.`,
    );
  });

  test(`${fn} never un-claims a row`, () => {
    const body = bodyOf(fn);
    assert.ok(
      !body.includes("postedAt: null"),
      `${fn} sets postedAt back to null. Retrying is what duplicates a post: ` +
        `at most once, even if that means never. Clear it by hand instead.`,
    );
  });
}

test("announcing is rate limited on the clock, not per call", () => {
  // A per-call limit caps one HTTP request, and the VPS sends three per sync.
  assert.ok(
    SOURCE.includes("announcedTooRecently"),
    "the wall-clock throttle is gone; a sync sends several requests and each " +
      "would spend its own budget",
  );
  for (const { fn } of ANNOUNCERS) {
    assert.ok(
      bodyOf(fn).includes("await announcedTooRecently()"),
      `${fn} does not check the throttle`,
    );
  }
});
