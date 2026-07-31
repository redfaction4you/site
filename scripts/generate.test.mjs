/**
 * Tests for the generation funnel's post-processing.
 *
 *   npm test
 *
 * Seven system prompts tell the models not to use em dashes and one still
 * reached a published match report. That is the argument for doing it here: an
 * instruction is a request, and this is a guarantee. It is the same lesson the
 * illustrations taught, where listing prohibitions in the prompt put the
 * forbidden thing in the picture.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { withoutEmDashes } from "../src/lib/ai/generate.ts";

test("a spaced em dash becomes the comma the sentence wanted", () => {
  assert.equal(
    withoutEmDashes("Romek led the night — and Medeo chased him."),
    "Romek led the night, and Medeo chased him.",
  );
});

test("an unspaced em dash does not fuse the words either side", () => {
  assert.equal(
    withoutEmDashes("Romek led—Medeo chased."),
    "Romek led, Medeo chased.",
  );
});

test("several in one paragraph all go", () => {
  const cleaned = withoutEmDashes("One — two — three");
  assert.equal(cleaned, "One, two, three");
  assert.ok(!cleaned.includes("—"));
});

test("en dashes are left alone, because a scoreline needs one", () => {
  // 2–1 and a range are both correct and both appear all over this site.
  assert.equal(withoutEmDashes("Red won 2–1"), "Red won 2–1");
  assert.equal(withoutEmDashes("4–6 matches a night"), "4–6 matches a night");
});

test("hyphens survive, since they are in map names and words", () => {
  assert.equal(withoutEmDashes("Warlords Pro (No-Amp)"), "Warlords Pro (No-Amp)");
});

test("text with nothing to fix is returned unchanged", () => {
  const clean = "Romek led the night, and Medeo chased him.";
  assert.equal(withoutEmDashes(clean), clean);
});

test("a doubled comma is not left behind", () => {
  assert.equal(withoutEmDashes("Romek, — and Medeo"), "Romek, and Medeo");
});
