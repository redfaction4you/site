/**
 * Tests for the free checks.
 *
 *   npm test
 *
 * These exist because of two real sentences that reached publication.
 *
 * One quoted a figure the data did not contain. That is decidable by string
 * search and needs no model, which matters twice over: it is certain rather than
 * probable, and it costs nothing from an allowance that is the binding
 * constraint on everything here.
 *
 * The other said a pair had faced each other "more than any other opponent on
 * the board" when a second pair was level on the same number. Every number in it
 * was true and the claim was false, which is the shape of error that reads most
 * authoritative.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  verifyDraft,
  verifyNote,
  verifyNumbers,
  verifySuperlatives,
} from "../src/lib/ai/verify.ts";

const FACTS = `THE SEASON SO FAR: 3 nights of play from 2026-07-28 to 2026-07-30, 14 matches, 9 players.
  ED ASSMASTER and Romek: 7 together, 6 won, 1 lost. 86% of decided matches won.
  Medeo and Skuldug: 5 together, 2 won, 3 lost. 40% of decided matches won.
  ED ASSMASTER against Medeo: 9 faced, ED ASSMASTER won 6, Medeo won 3.`;

/* --- invented numbers ----------------------------------------------------- */

test("a figure that is in the data passes", () => {
  const check = verifyNumbers(FACTS, "They have shared a side 7 times, winning 6.");
  assert.equal(check.ok, true);
});

test("a figure that is not in the data is caught", () => {
  const check = verifyNumbers(FACTS, "They have shared a side 12 times.");
  assert.equal(check.ok, false);
  assert.equal(check.problems[0].quote, "12");
});

test("a percentage is satisfied by the bare number in the facts", () => {
  // The facts say 86% and a sentence may write 86%, or the other way round.
  assert.equal(verifyNumbers(FACTS, "an 86% win rate").ok, true);
  assert.equal(verifyNumbers(FACTS, "a rate of 86").ok, true);
});

test("small counts are free, since ordinary sentences are full of them", () => {
  // "the first time", "two or three" and so on are not quoted figures.
  assert.equal(verifyNumbers(FACTS, "the first 2 outings, and 3 more").ok, true);
});

test("a date in the facts licences the way a date is written in prose", () => {
  assert.equal(verifyNumbers(FACTS, "back on 28 July 2026").ok, true);
});

test("every invented figure is reported, not only the first", () => {
  const check = verifyNumbers(FACTS, "44 matches and 55 wins");
  assert.equal(check.problems.length, 2);
});

test("the same invented figure is reported once", () => {
  const check = verifyNumbers(FACTS, "44 here and 44 again");
  assert.equal(check.problems.length, 1);
});

/* --- superlatives on a tie ------------------------------------------------ */

const TIED = `${FACTS}
WHO LEADS WHAT. Only call something the most if it is stated here:
  Most often against each other: ED ASSMASTER and Medeo, and ED ASSMASTER and SiD, all level on 9. No single pair leads this.`;

test("a superlative quoting a contested figure is caught", () => {
  // The sentence that actually published.
  const check = verifySuperlatives(
    TIED,
    "Those two have faced each other 9 times, more than any other opponent on the board.",
  );
  assert.equal(check.ok, false);
  assert.match(check.problems[0].problem, /level between several/);
});

test("a superlative about an uncontested figure is left alone", () => {
  const check = verifySuperlatives(TIED, "They are the most paired side on 7.");
  assert.equal(check.ok, true);
});

test("an ordinary sentence with a contested number is not a superlative", () => {
  // Stating the figure is fine. Claiming it leads is not.
  const check = verifySuperlatives(TIED, "Those two have faced each other 9 times.");
  assert.equal(check.ok, true);
});

test("nothing is flagged when the facts name a clear leader", () => {
  const clear = `${FACTS}\n  Most often on the same side: ED ASSMASTER and Romek, on 7.`;
  const check = verifySuperlatives(clear, "the most of any pairing, on 7");
  assert.equal(check.ok, true);
});

/* --- together ------------------------------------------------------------- */

test("the combined check reports problems from both halves", () => {
  const check = verifyDraft(
    TIED,
    "They met 9 times, more than any other opponent, across 44 matches.",
  );
  assert.equal(check.ok, false);
  assert.ok(check.problems.length >= 2);
});

test("a clean draft passes everything", () => {
  const check = verifyDraft(
    FACTS,
    "ED ASSMASTER and Romek have shared a side 7 times, winning 6 and losing 1.",
  );
  assert.equal(check.ok, true);
});

test("the correction quotes what was wrong so a rewrite can fix it", () => {
  const note = verifyNote(verifyDraft(FACTS, "across 44 matches").problems);
  assert.match(note, /44/);
  assert.match(note, /Write it again/);
});

test("a tie claimed with a spelled out number is caught too", () => {
  // The form that actually published. A digit-only check sailed past it, which
  // is how this gap was found: by testing the checker against the sentence it
  // was written for.
  const check = verifySuperlatives(
    TIED,
    "Those two have faced each other nine times, more than any other opponent on the board.",
  );
  assert.equal(check.ok, false);
});

test("a spelled out number in an ordinary sentence is still not a superlative", () => {
  assert.equal(
    verifySuperlatives(TIED, "Those two have faced each other nine times.").ok,
    true,
  );
});
