/**
 * Tests for the server ghost's text rules.
 *
 *   npm test
 *
 * Everything the ghost says reaches a 2001 bitmap font in Red Faction's chat,
 * and the owner forbids em dashes in anything a player reads. A model that
 * answers with curly quotes, an em dash or an emoji must still produce a clean
 * ASCII line, and these are the rules that make it so.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { asciiLine } from "../src/lib/ghost/speak.ts";
import { personaFor, promptFor } from "../src/lib/ghost/persona.ts";

test("curly quotes, em dashes, ellipses and emoji come out as plain ASCII", () => {
  assert.equal(
    asciiLine("\u201CHello\u201D \u2014 it\u2019s cold\u2026 \u{1F47B} ok"),
    "\"Hello\", it's cold... ok",
  );
});

test("a line never carries an em dash", () => {
  assert.doesNotMatch(asciiLine("boo\u2014and again \u2014 boo"), /\u2014/);
});

test("whitespace collapses to one line", () => {
  assert.equal(asciiLine("  two\n\nlines\there  "), "two lines here");
});

test("Halloween has a ghost and other servers do not yet", () => {
  assert.equal(personaFor("halloween")?.name, "Ghost Curator");
  assert.equal(personaFor("themed"), null);
});

test("the ghost is told the server's facts and never to talk to the bots", () => {
  const context = {
    event: "greet_alone",
    subject: "Romortis",
    humans: ["Romortis"],
    bots: ["Dracula"],
    transcript: [],
    playing: "Backrooms",
    next: "RFU2 - Halloween",
    mapTitles: ["Backrooms", "RFU2 - Halloween"],
  };
  const system = personaFor("halloween").system(context);
  assert.match(system, /Playing now: Backrooms/);
  assert.match(system, /RedFaction4You\.com\/halloween/);
  assert.match(system, /never talk to them as if they were players/);
  assert.doesNotMatch(system, /\u2014/);
  assert.match(promptFor(context), /Romortis just joined and is the only human/);
});
