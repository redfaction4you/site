/**
 * Tests for the hand written background the columnist is given.
 *
 *   npm test
 *
 * The failure this guards against is silent. A note is looked up by lowercased
 * name, so an entry keyed `ED ASSMASTER` instead of `ed assmaster` never matches
 * anybody, never throws, and simply means the columnist keeps not knowing the
 * thing the file was written to tell him.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { PLAYER_NOTES, loreFor, notesFor } from "../src/lib/ai/lore.ts";

test("every key is the lowercase of its own name", () => {
  for (const entry of PLAYER_NOTES) {
    assert.equal(
      entry.nameKey,
      entry.name.toLowerCase(),
      `${entry.name} is keyed as ${entry.nameKey} and will never be found`,
    );
  }
});

test("no player is described twice", () => {
  const keys = PLAYER_NOTES.map((entry) => entry.nameKey);
  assert.equal(new Set(keys).size, keys.length);
});

test("a name matches however it is capitalised", () => {
  const found = notesFor(["ed assmaster", "ED ASSMASTER", "Ed AssMaster"]);
  assert.equal(found.length, 3);
  assert.equal(found[0].name, "ED ASSMASTER");
});

test("an unknown player contributes nothing rather than an empty note", () => {
  assert.deepEqual(notesFor(["Nobody At All"]), []);
});

test("the block always explains how sides are picked, players known or not", () => {
  // The balance convention is the part that changes how the pairing record
  // reads, so it belongs in the prompt even on a night of complete strangers.
  const block = loreFor(["Nobody At All"]);
  assert.match(block, /deliberately split/);
  assert.match(block, /context, not measurement/);
});

test("the block names only the players it actually knows about", () => {
  const block = loreFor(["Romek", "Nobody At All"]);
  assert.match(block, /Romek:/);
  assert.doesNotMatch(block, /Nobody At All:/);
  assert.match(block, /no background on file/);
});

test("nothing in the background carries a figure that could be quoted as a stat", () => {
  // The columnist is checked for numbers it was not given. Prose that arrives
  // with digits in it would pass that check and read as a measurement.
  for (const entry of PLAYER_NOTES) {
    assert.doesNotMatch(entry.note, /\d/, `${entry.name}'s note contains a figure`);
  }
});
