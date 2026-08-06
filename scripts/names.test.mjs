/**
 * Putting a person's own name back into prose that used another of theirs.
 *
 * The overlapping-name case is the one that matters. One person on this server
 * has played as Chill Hippo, Skuldug, s9 and s9!nX, and `s9` is a prefix of
 * `s9!nX`. Substituting the short one first turns "s9!nX" into "Skuldug!nX",
 * which is a name nobody has ever had, in an article nobody will re-read.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { renameInText } from "../src/lib/matches/names.ts";

const ALIASES = new Map([
  ["chill hippo", "Skuldug"],
  ["skuldug", "Skuldug"],
  ["s9", "Skuldug"],
  ["s9!nX".toLowerCase(), "Skuldug"],
  ["gaymer", "Romek"],
  ["special ed", "Romek"],
  ["romek", "Romek"],
  ["j!nx", "J!nX"],
  ["penis lover", "J!nX"],
  ["skrub", "$t!nX"],
  ["$t!nx", "$t!nX"],
]);

test("an alias becomes the name the site knows the person by", () => {
  assert.equal(
    renameInText("Equalizing through Special ED, Blue took the lead.", ALIASES),
    "Equalizing through Romek, Blue took the lead.",
  );
});

test("a longer alias is not eaten by a shorter one inside it", () => {
  assert.equal(renameInText("s9!nX grabbed the red flag", ALIASES), "Skuldug grabbed the red flag");
  assert.equal(renameInText("s9 grabbed the red flag", ALIASES), "Skuldug grabbed the red flag");
});

test("punctuation inside a name is part of the name", () => {
  assert.equal(renameInText("skrub capped", ALIASES), "$t!nX capped");
  assert.equal(renameInText("penis lover capped", ALIASES), "J!nX capped");
});

test("a name already canonical is left exactly as it is", () => {
  const text = "Romek carried it home while J!nX held the middle.";
  assert.equal(renameInText(text, ALIASES), text);
});

test("case drift is settled on the canonical spelling", () => {
  assert.equal(renameInText("SKULDUG and gaymer", ALIASES), "Skuldug and Romek");
});

test("a name inside a longer word is not touched", () => {
  // `s9` is an alias; `s9x` and `xs9` are not that person.
  assert.equal(renameInText("s9x and xs9 are not names", ALIASES), "s9x and xs9 are not names");
});

test("a name at either end of the string still matches", () => {
  assert.equal(renameInText("s9", ALIASES), "Skuldug");
  assert.equal(renameInText("s9 opened", ALIASES), "Skuldug opened");
  assert.equal(renameInText("it was skrub", ALIASES), "it was $t!nX");
});

test("every occurrence is replaced, not only the first", () => {
  assert.equal(
    renameInText("Gaymer passed to Gaymer, somehow.", ALIASES),
    "Romek passed to Romek, somehow.",
  );
});

test("names next to ordinary punctuation are found", () => {
  assert.equal(
    renameInText("(s9), Gaymer. Special ED; skrub!", ALIASES),
    "(Skuldug), Romek. Romek; $t!nX!",
  );
});

test("an empty map changes nothing", () => {
  assert.equal(renameInText("s9 grabbed it", new Map()), "s9 grabbed it");
});

test("empty text is returned as it came", () => {
  assert.equal(renameInText("", ALIASES), "");
});
